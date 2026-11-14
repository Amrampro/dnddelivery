import { authorizeTenant, authorizeShop, } from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { AuthError } from "../auth/errors.js";
export const stockError = (code, message, status = 409) => new AuthError(status, code, message);
export function checkVersion(actual, expected) {
    if (actual !== expected)
        throw stockError("VERSION_CONFLICT", "Les données ont changé. Rechargez la fiche.");
}
export async function authorizeStock(tx, c, permission, write = false) {
    if (c.scope === "SHOP") {
        if (write || !c.shopId)
            throw stockError("STOCK_READ_ONLY", "Les quantités sont gérées par les agences.", 403);
        await authorizeShop(authorizationStore(tx), c.actorId, c.shopId, "shop.stocks.read");
        return;
    }
    if (!c.companyId || (c.scope === "AGENCY" && !c.agencyId))
        throw stockError("CONTEXT_REQUIRED", "Choisissez votre entreprise ou agence.", 403);
    if (write)
        await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
    await authorizeTenant(authorizationStore(tx), {
        userId: c.actorId,
        companyId: c.companyId,
        ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
    }, permission);
}
export async function scopeStock(tx, c, q = {}) {
    await authorizeStock(tx, c, "stocks.read");
    if (c.scope === "SHOP") {
        if (q.shopId && q.shopId !== c.shopId)
            throw stockError("SHOP_DENIED", "Cette boutique n’est pas autorisée.", 403);
        const peers = await tx.companyShop.findMany({
            where: {
                shopId: c.shopId,
                ...(q.companyId ? { companyId: q.companyId } : {}),
            },
            select: { companyId: true },
        });
        if (q.companyId && !peers.length)
            throw stockError("COMPANY_DENIED", "Ce transporteur n’est pas autorisé.", 403);
        return {
            shopId: c.shopId,
            companyId: { in: peers.map((p) => p.companyId) },
            ...(q.agencyId ? { agencyId: q.agencyId } : {}),
            ...(q.productId ? { productId: q.productId } : {}),
            ...(q.q
                ? {
                    product: {
                        OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }],
                    },
                }
                : {}),
        };
    }
    if (q.companyId && q.companyId !== c.companyId)
        throw stockError("COMPANY_DENIED", "Cette entreprise n’est pas autorisée.", 403);
    if (c.scope === "AGENCY" && q.agencyId && q.agencyId !== c.agencyId)
        throw stockError("AGENCY_DENIED", "Cette agence n’est pas autorisée.", 403);
    return {
        companyId: c.companyId,
        ...(c.scope === "AGENCY"
            ? { agencyId: c.agencyId }
            : q.agencyId
                ? { agencyId: q.agencyId }
                : {}),
        ...(q.shopId ? { shopId: q.shopId } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.q
            ? {
                product: {
                    OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }],
                },
            }
            : {}),
    };
}
export async function agencyWrite(tx, c, agencyId, allowDestination = false) {
    if (c.scope === "AGENCY" && !allowDestination && agencyId !== c.agencyId)
        throw stockError("AGENCY_DENIED", "L’opération ne concerne pas votre agence.", 403);
    const a = await tx.agency.findFirst({
        where: {
            id: agencyId,
            companyId: c.companyId,
            status: "ACTIVE",
            archivedAt: null,
        },
    });
    if (!a)
        throw stockError("AGENCY_DENIED", "Agence inactive ou non autorisée.", 403);
    return a;
}
export async function collaborationAgency(tx, companyId, shopId, agencyIds, active = true) {
    const p = await tx.companyShop.findUnique({
        where: { companyId_shopId: { companyId, shopId } },
        include: { shop: true },
    });
    if (!p ||
        (active &&
            (p.status !== "ACTIVE" ||
                p.shop.status !== "ACTIVE" ||
                p.shop.archivedAt)))
        throw stockError("COLLABORATION_INACTIVE", "Une collaboration active est nécessaire.", 403);
    const allowed = Array.isArray(p.allowedAgencyIds)
        ? p.allowedAgencyIds.filter((id) => typeof id === "string")
        : [];
    if (active && agencyIds.some((id) => !allowed.includes(id)))
        throw stockError("COLLABORATION_AGENCY_DENIED", "Cette agence n’est pas partagée avec la boutique.", 403);
    return p;
}
