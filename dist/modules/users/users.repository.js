import { assertTenantContext, AccessDenied, } from "../authorization/tenant-access.js";
export function usersRepository(db) {
    return {
        listMembers(context) {
            assertTenantContext(context, "users.read");
            if (context.shopId || context.agencyId)
                throw new AccessDenied();
            return db.companyMembership.findMany({
                where: { companyId: context.companyId, active: true },
                select: {
                    user: { select: { id: true, fullName: true, status: true } },
                    roleId: true,
                },
                take: 100,
            });
        },
    };
}
