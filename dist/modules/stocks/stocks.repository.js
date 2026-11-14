import { tenantFilter, } from "../authorization/tenant-access.js";
export function stocksRepository(db) {
    return {
        async findById(context, id) {
            const stock = await db.stock.findFirst({
                where: { ...tenantFilter(context, "stocks.read"), id },
            });
            return stock
                ? {
                    ...stock,
                    availableQuantity: stock.physicalQuantity - stock.reservedQuantity,
                }
                : null;
        },
    };
}
