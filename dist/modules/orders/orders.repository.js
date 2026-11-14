import { tenantFilter, } from "../authorization/tenant-access.js";
export function ordersRepository(db) {
    return {
        findById(context, id) {
            return db.order.findFirst({
                where: {
                    ...tenantFilter(context, "orders.read"),
                    id,
                    archivedAt: null,
                },
            });
        },
        list(context, limit = 25) {
            return db.order.findMany({
                where: { ...tenantFilter(context, "orders.read"), archivedAt: null },
                take: Math.min(Math.max(Math.trunc(limit) || 25, 1), 100),
                orderBy: { createdAt: "desc" },
            });
        },
    };
}
