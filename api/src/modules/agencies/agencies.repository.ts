import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  AccessDenied,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function agenciesRepository(db: PrismaClient) {
  return {
    list(context: TenantContext) {
      assertTenantContext(context, "agencies.read");
      if (context.shopId) throw new AccessDenied();
      return db.agency.findMany({
        where: {
          companyId: context.companyId,
          ...(context.agencyId ? { id: context.agencyId } : {}),
          archivedAt: null,
        },
        take: 100,
        orderBy: { name: "asc" },
      });
    },
  };
}
