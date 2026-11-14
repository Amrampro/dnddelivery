import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function auditRepository(db) {
    return {
        list(context) {
            assertTenantContext(context, "audit.read");
            if (context.shopId)
                throw new AccessDenied();
            return db.auditLog.findMany({
                where: {
                    companyId: context.companyId,
                    ...(context.agencyId ? { agencyId: context.agencyId } : {}),
                },
                select: {
                    id: true,
                    actorId: true,
                    action: true,
                    entityType: true,
                    entityId: true,
                    createdAt: true,
                },
                take: 100,
                orderBy: { createdAt: "desc" },
            });
        },
    };
}
