import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  AccessDenied,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function companiesRepository(db: PrismaClient) {
  return {
    findCurrent(context: TenantContext) {
      assertTenantContext(context, "companies.read");
      if (context.shopId || context.agencyId) throw new AccessDenied();
      return db.company.findFirst({
        where: { id: context.companyId, archivedAt: null },
      });
    },
  };
}
