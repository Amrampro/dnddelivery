import { restrictedCourierPermissions } from "../modules/organization/permissions.js";
export function authorizationStore(db, clock = () => new Date()) {
    async function grant(membership) {
        if (!membership)
            return null;
        const links = await db.rolePermission.findMany({
            where: { roleId: membership.roleId },
            select: { permission: { select: { code: true } } },
        });
        return {
            active: membership.active,
            scope: membership.roleScope,
            permissions: links.map((p) => p.permission.code),
        };
    }
    return {
        subscriptionValid: async (companyId) => !!(await db.subscription.findFirst({
            where: {
                companyId,
                status: "ACTIVE",
                startedAt: { lte: clock() },
                expiresAt: { gt: clock() },
            },
        })),
        userActive: async (id) => !!(await db.user.findFirst({
            where: { id, status: "ACTIVE", archivedAt: null },
        })),
        companyActive: async (id) => !!(await db.company.findFirst({
            where: { id, status: "ACTIVE", archivedAt: null },
        })),
        companyGrant: async (userId, companyId) => grant(await db.companyMembership.findUnique({
            where: { companyId_userId: { companyId, userId } },
        })),
        agencyActive: async (id, companyId) => !!(await db.agency.findFirst({
            where: { id, companyId, status: "ACTIVE", archivedAt: null },
        })),
        agencyGrant: async (userId, companyId, agencyId) => {
            const membership = await db.agencyMembership.findUnique({
                where: { companyId_agencyId_userId: { companyId, agencyId, userId } },
                include: { role: { select: { code: true } } },
            });
            const value = await grant(membership);
            if (value && membership?.role.code === "courier") {
                const profile = await db.driverProfile.findUnique({
                    where: { companyId_userId: { companyId, userId } },
                });
                if (profile?.status !== "ACTIVE")
                    value.permissions = restrictedCourierPermissions([
                        ...value.permissions,
                    ]);
            }
            return value;
        },
        shopActive: async (shopId, companyId) => !!(await db.companyShop.findFirst({
            where: {
                companyId,
                shopId,
                status: "ACTIVE",
                shop: { status: "ACTIVE", archivedAt: null },
            },
        })),
        shopIdentityActive: async (shopId) => !!(await db.shop.findFirst({ where: { id: shopId, status: "ACTIVE", archivedAt: null } })),
        shopGrant: async (userId, shopId) => grant(await db.shopMembership.findUnique({
            where: { shopId_userId: { shopId, userId } },
        })),
        globalGrant: async (userId) => grant(await db.globalRoleGrant.findUnique({ where: { userId } })),
    };
}
