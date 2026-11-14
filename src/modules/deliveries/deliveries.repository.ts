import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function deliveriesRepository(db: PrismaClient) {
  return {
    findById(context: TenantContext, id: string) {
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
