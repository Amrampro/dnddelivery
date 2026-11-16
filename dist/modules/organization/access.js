import { financialBlockers, protectFinancialAffiliation, } from "../collections/protection.js";
import { authorizeGlobal, authorizeTenant, } from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { AuthError } from "../auth/errors.js";
import { assertNewOperation } from "../subscriptions/access.js";
export const conflict = (message, code = "ORGANIZATION_CONFLICT") => new AuthError(409, code, message);
export function checkVersion(actual, expected) {
    if (actual !== expected)
        throw conflict("Les données ont changé. Rechargez avant de recommencer.", "VERSION_CONFLICT");
}
export async function authorizeOrganization(tx, c, permission, write = false) {
    if (c.scope === "GLOBAL") {
        await authorizeGlobal(authorizationStore(tx), c.actorId, "platform.manage");
        return;
    }
    if (c.scope === "SHOP" || (write && c.scope !== "COMPANY"))
        throw new AuthError(403, "SCOPE_DENIED", "Choisissez un contexte entreprise autorisé.");
    await authorizeTenant(authorizationStore(tx), {
        userId: c.actorId,
        companyId: c.companyId,
        ...(c.agencyId ? { agencyId: c.agencyId } : {}),
    }, permission);
}
export async function lockOrganization(tx, c, permission) {
    await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
    const company = await tx.company.findUnique({ where: { id: c.companyId } });
    if (!company || company.archivedAt || company.status === "ARCHIVED")
        throw new AuthError(404, "COMPANY_NOT_FOUND", "Entreprise indisponible.");
    await authorizeOrganization(tx, c, permission, true);
    return company;
}
/** Extension point: future modules must add their unfinished operations here. */
export async function agencyBlockers(tx, companyId, agencyId) {
    const [deliveries, orders, stock, transfers] = await Promise.all([
        tx.delivery.count({
            where: {
                companyId,
                OR: [
                    {
                        agencyId,
                        OR: [
                            { status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
                            {
                                phase: {
                                    in: [
                                        "FAILED",
                                        "RETURN_REQUESTED",
                                        "RETURNING",
                                        "RETURN_ARRIVED",
                                        "QUARANTINED",
                                    ],
                                },
                            },
                            {
                                phase: "RETURN_RECEIVED",
                                parcelReturn: { reintegratedAt: null, returnedToShopAt: null },
                            },
                        ],
                    },
                    {
                        legs: {
                            some: { destinationAgencyId: agencyId, status: "IN_TRANSIT" },
                        },
                    },
                    {
                        parcelReturn: {
                            agencyId,
                            status: { in: ["REQUESTED", "IN_TRANSIT"] },
                        },
                    },
                ],
            },
        }),
        tx.order.count({
            where: {
                companyId,
                agencyId,
                status: {
                    in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"],
                },
            },
        }),
        tx.stock.count({
            where: {
                companyId,
                agencyId,
                OR: [{ physicalQuantity: { gt: 0 } }, { reservedQuantity: { gt: 0 } }],
            },
        }),
        tx.transfer.count({
            where: {
                companyId,
                status: { in: ["DRAFT", "IN_TRANSIT"] },
                OR: [{ originAgencyId: agencyId }, { destinationAgencyId: agencyId }],
            },
        }),
    ]);
    const financial = (await financialBlockers(tx, companyId, agencyId)).count;
    return { deliveries, orders, stock, transfers, financial };
}
/** Eligibility only, for future dispatch transactions; never creates a delivery. */
export async function assertDriverAssignable(tx, companyId, agencyId, userId) {
    await assertNewOperation(tx, { userId, companyId, agencyId }, "drivers.availability.write");
    const profile = await tx.driverProfile.findUnique({
        where: { companyId_userId: { companyId, userId } },
    });
    const assigned = await tx.companyMembership.findFirst({
        where: {
            companyId,
            userId,
            active: true,
            organizationRole: "courier",
            employmentStatus: "ACTIVE",
            user: { status: "ACTIVE", archivedAt: null },
        },
    });
    if (!profile ||
        profile.status !== "ACTIVE" ||
        profile.availability !== "AVAILABLE" ||
        !assigned)
        throw new AuthError(403, "DRIVER_UNAVAILABLE", "Ce livreur n'est pas disponible dans cette entreprise.");
    return profile;
}
/** Shared withdrawal used by personnel and the pre-existing global administrator module. */
export async function withdrawAgencyLinks(tx, companyId, userId, actorId) {
    await protectFinancialAffiliation(tx, companyId, userId);
    const primary = await tx.agency.findMany({
        where: { companyId, primaryManagerUserId: userId },
        select: { id: true },
    });
    await tx.agency.updateMany({
        where: { companyId, primaryManagerUserId: userId },
        data: { primaryManagerUserId: null, version: { increment: 1 } },
    });
    for (const agency of primary)
        await tx.auditLog.create({
            data: {
                companyId,
                agencyId: agency.id,
                actorId,
                action: "ORG_AGENCY_PRIMARY_CLEARED",
                entityType: "Agency",
                entityId: agency.id,
                metadata: { userId },
            },
        });
    await tx.agencyMembership.updateMany({
        where: { companyId, userId },
        data: { active: false },
    });
    await tx.driverProfile.updateMany({
        where: { companyId, userId },
        data: {
            status: "INACTIVE",
            availability: "UNAVAILABLE",
            availabilityChangedAt: new Date(),
            version: { increment: 1 },
        },
    });
}
