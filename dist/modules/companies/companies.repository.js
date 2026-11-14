import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function companiesRepository(db) {
    return {
        findCurrent(context) {
            assertTenantContext(context, "companies.read");
            if (context.shopId || context.agencyId)
                throw new AccessDenied();
            return db.company.findFirst({
                where: { id: context.companyId, archivedAt: null },
            });
        },
    };
}
