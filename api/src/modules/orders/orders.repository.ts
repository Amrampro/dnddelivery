import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  tenantFilter,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function ordersRepository(db: PrismaClient) {
  return {
    findById(context: TenantContext, id: string) {
      return db.order.findFirst({
        where: {
          ...tenantFilter(context, "orders.read"),
          id,
          archivedAt: null,
        },
      });
    },
    list(context: TenantContext, limit = 25) {
      return db.order.findMany({
        where: { ...tenantFilter(context, "orders.read"), archivedAt: null },
        take: Math.min(Math.max(Math.trunc(limit) || 25, 1), 100),
        orderBy: { createdAt: "desc" },
      });
    },
  };
}
