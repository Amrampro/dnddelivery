import { authorizeShop, authorizeTenant, } from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { stockError } from "../stocks/access.js";
export const selection = (c) => ({
    userId: c.actorId,
    companyId: c.companyId,
    ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
});
export async function access(tx, c) {
    const store = authorizationStore(tx);
    if (c.scope === "SHOP") {
        if (!c.shopId)
            throw stockError("CONTEXT_REQUIRED", "Choisissez une boutique.", 403);
        await authorizeShop(store, c.actorId, c.shopId, "shop.collections.read");
        return {
            kind: "shop",
            permissions: [
                ...(await store.shopGrant(c.actorId, c.shopId)).permissions,
            ],
        };
    }
    if (!c.companyId ||
        !["COMPANY", "AGENCY"].includes(c.scope) ||
        (c.scope === "AGENCY" && !c.agencyId))
        throw stockError("CONTEXT_REQUIRED", "Choisissez une entreprise ou agence.", 403);
    const company = await store.companyGrant(c.actorId, c.companyId), agency = c.scope === "AGENCY"
        ? await store.agencyGrant(c.actorId, c.companyId, c.agencyId)
        : null;
    const permissions = [
        ...new Set([
            ...(company?.active ? company.permissions : []),
            ...(agency?.active ? agency.permissions : []),
        ]),
    ];
    const kind = permissions.includes("financial.supervise.read")
        ? "operator"
        : "driver";
    await authorizeTenant(store, selection(c), kind === "operator" ? "financial.supervise.read" : "collections.self.read");
    return { kind, permissions };
}
export async function permission(tx, c, required) {
    const auth = await access(tx, c);
    if (auth.kind === "shop" || !auth.permissions.includes(required))
        throw stockError("PERMISSION_DENIED", "Cette opération financière n’est pas autorisée.", 403);
    return auth;
}
export const agencyAllowed = (c, id) => {
    if (c.scope === "SHOP" || (c.scope === "AGENCY" && c.agencyId !== id))
        throw stockError("AGENCY_DENIED", "Cette opération appartient à une autre agence.", 403);
};
export function filters(c, q, kind) {
    if ((c.companyId && q.companyId && q.companyId !== c.companyId) ||
        (c.scope === "AGENCY" && q.agencyId && q.agencyId !== c.agencyId) ||
        (kind === "driver" && q.courierId && q.courierId !== c.actorId) ||
        (kind === "shop" && q.shopId && q.shopId !== c.shopId))
        throw stockError("SCOPE_DENIED", "Filtre hors de votre périmètre.", 403);
    return {
        companyId: c.companyId ?? q.companyId,
        ...(c.scope === "AGENCY"
            ? { agencyId: c.agencyId }
            : q.agencyId
                ? { agencyId: q.agencyId }
                : {}),
        ...(kind === "driver"
            ? { courierId: c.actorId }
            : q.courierId
                ? { courierId: q.courierId }
                : {}),
        ...(q.currency ? { currency: q.currency } : {}),
        ...(q.from || q.to
            ? {
                createdAt: {
                    ...(q.from ? { gte: new Date(q.from) } : {}),
                    ...(q.to
                        ? { lt: new Date(new Date(q.to).getTime() + 86400000) }
                        : {}),
                },
            }
            : {}),
    };
}
