import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function agenciesRepository(db) {
    return {
        list(context) {
            assertTenantContext(context, "agencies.read");
            if (context.shopId)
                throw new AccessDenied();
            return db.agency.findMany({
                where: {
                    companyId: context.companyId,
                    ...(context.agencyId ? { id: context.agencyId } : {}),
                    archivedAt: null,
                },
                take: 100,
                orderBy: { name: "asc" },
            });
        },
    };
}
