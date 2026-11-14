import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  AccessDenied,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function partnersRepository(db: PrismaClient) {
  return {
    listCollaborations(context: TenantContext) {
      assertTenantContext(context, "partners.read");
      if (context.agencyId) throw new AccessDenied();
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
