import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertTenantContext,
  AccessDenied,
  type TenantContext,
} from "../authorization/tenant-access.js";
export function usersRepository(db: PrismaClient) {
  return {
    listMembers(context: TenantContext) {
      assertTenantContext(context, "users.read");
      if (context.shopId || context.agencyId) throw new AccessDenied();
      return db.companyMembership.findMany({
        where: { companyId: context.companyId, active: true },
        select: {
          user: { select: { id: true, fullName: true, status: true } },
          roleId: true,
        },
        take: 100,
      });
    },
  };
}
