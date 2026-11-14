import { assertTenantContext, } from "../authorization/tenant-access.js";
export function collectionsRepository(db) {
    return {
        findById(context, id) {
            assertTenantContext(context, "collections.read");
            return db.collection.findFirst({
                where: {
                    id,
                    companyId: context.companyId,
                    ...(context.agencyId ? { agencyId: context.agencyId } : {}),
                    ...(context.shopId
                        ? { delivery: { order: { shopId: context.shopId } } }
                        : {}),
                },
            });
        },
    };
}
