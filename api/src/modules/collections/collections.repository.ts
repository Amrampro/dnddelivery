import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function collectionsRepository(db: PrismaClient) {
  return {
    findById(context: TenantContext, id: string) {
      assertTenantContext(context, "collections.read");
      return db.collection.findFirst({
        where: {
          id,
          companyId: context.companyId,
          ...(context.agencyId ? { agencyId: context.agencyId } : {}),
          ...(context.shopId
            ? { delivery: { order: { shopId: context.shopId } } }
            : {}),
        },
      });
    },
  };
}
