import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  AccessDenied,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function subscriptionsRepository(db: PrismaClient) {
  return {
    findCurrent(context: TenantContext) {
      assertTenantContext(context, "subscriptions.read");
      if (context.shopId || context.agencyId) throw new AccessDenied();
      return db.subscription.findUnique({
        where: { companyId: context.companyId },
      });
    },
  };
}
