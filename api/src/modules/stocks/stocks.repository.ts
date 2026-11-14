import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  tenantFilter,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function stocksRepository(db: PrismaClient) {
  return {
    async findById(context: TenantContext, id: string) {
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
