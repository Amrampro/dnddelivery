import { assertTenantContext, } from "../authorization/tenant-access.js";
export function deliveriesRepository(db) {
    return {
        findById(context, id) {
            assertTenantContext(context, "deliveries.read");
            return db.delivery.findFirst({
                where: {
                    id,
                    companyId: context.companyId,
                    ...(context.agencyId ? { agencyId: context.agencyId } : {}),
                    ...(context.shopId ? { order: { shopId: context.shopId } } : {}),
                },
            });
        },
    };
}
