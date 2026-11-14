import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function partnersRepository(db) {
    return {
        listCollaborations(context) {
            assertTenantContext(context, "partners.read");
            if (context.agencyId)
                throw new AccessDenied();
            return db.companyShop.findMany({
                where: {
                    companyId: context.companyId,
                    ...(context.shopId ? { shopId: context.shopId } : {}),
                },
                select: {
                    id: true,
                    shopId: true,
                    status: true,
                    startedAt: true,
                    endedAt: true,
                },
                take: 100,
            });
        },
    };
}
