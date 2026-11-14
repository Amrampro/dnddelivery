import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function subscriptionsRepository(db) {
    return {
        findCurrent(context) {
            assertTenantContext(context, "subscriptions.read");
            if (context.shopId || context.agencyId)
                throw new AccessDenied();
            return db.subscription.findUnique({
                where: { companyId: context.companyId },
            });
        },
    };
}
