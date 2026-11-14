import type { Prisma } from "../../generated/prisma/client.js";
import type { Workspace } from "./types.js";
import { effectiveStatus } from "../subscriptions/rules.js";
import { restrictedCourierPermissions } from "../organization/permissions.js";
export async function loadWorkspaces(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<Workspace[]> {
  const result: Workspace[] = [];
  const permissions = async (roleId: string) =>
    (
      await db.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { code: true } } },
      })
    ).map((v) => v.permission.code);
  const portal = (
    code: string,
    scope: Workspace["scope"],
  ): Workspace["portal"] =>
    scope === "GLOBAL"
      ? "super-admin"
      : code === "stock_manager"
        ? "stock"
        : code === "courier"
          ? "livreur"
          : scope === "SHOP"
            ? "boutique"
            : scope === "AGENCY"
              ? "agence"
              : "entreprise";
  const global = await db.globalRoleGrant.findUnique({
    where: { userId },
    include: { role: true },
  });
  if (global?.active && global.role.scope === "GLOBAL") {
    const p = await permissions(global.roleId);
    if (p.includes("workspace.access"))
      result.push({
        key: "global",
        scope: "GLOBAL",
        companyName: "Administration DND Delivery",
        roleCode: global.role.code,
        roleName: global.role.name,
        permissions: p,
        portal: portal(global.role.code, "GLOBAL"),
      });
  }
  const members = await db.companyMembership.findMany({
    where: {
      userId,
      active: true,
      company: { status: "ACTIVE", archivedAt: null },
    },
    include: { company: true, role: true },
  });
  for (const member of members) {
    if (member.role.scope !== "COMPANY") continue;
    const base = await permissions(member.roleId);
    if (base.includes("workspace.access"))
      result.push({
        key: `company:${member.companyId}`,
        scope: "COMPANY",
        companyId: member.companyId,
        companyName: member.company.name,
        roleCode: member.role.code,
        roleName: member.role.name,
        permissions: base,
        portal: portal(member.role.code, "COMPANY"),
      });
    const agencyGrants = await db.agencyMembership.findMany({
      where: {
        companyId: member.companyId,
        userId,
        active: true,
        agency: { status: "ACTIVE", archivedAt: null },
      },
      include: { agency: true, role: true },
    });
    const agencies = base.includes("agencies.read")
      ? await db.agency.findMany({
          where: {
            companyId: member.companyId,
            status: "ACTIVE",
            archivedAt: null,
          },
        })
      : agencyGrants.map((v) => v.agency);
    for (const agency of agencies) {
      const grant = agencyGrants.find(
        (v) => v.agencyId === agency.id && v.role.scope === "AGENCY",
      );
      let p = [
        ...new Set([
          ...base,
          ...(grant ? await permissions(grant.roleId) : []),
        ]),
      ];
      if (!p.includes("workspace.access")) continue;
      const role = grant?.role ?? member.role;
      if (role.code === "courier") {
        const profile = await db.driverProfile.findUnique({
          where: { companyId_userId: { companyId: member.companyId, userId } },
        });
        if (profile?.status !== "ACTIVE") p = restrictedCourierPermissions(p);
      }
      result.push({
        key: `agency:${member.companyId}:${agency.id}`,
        scope: "AGENCY",
        companyId: member.companyId,
        agencyId: agency.id,
        companyName: member.company.name,
        agencyName: agency.name,
        roleCode: role.code,
        roleName: role.name,
        permissions: p,
        portal: portal(role.code, "AGENCY"),
      });
    }
  }
  const shops = await db.shopMembership.findMany({
    where: {
      userId,
      active: true,
      shop: { status: "ACTIVE", archivedAt: null },
    },
    include: { shop: true, role: true },
  });
  for (const grant of shops) {
    if (grant.role.scope !== "SHOP") continue;
    const p = await permissions(grant.roleId);
    if (!p.includes("workspace.access")) continue;
    result.push({
      key: `shop-home:${grant.shopId}`,
      scope: "SHOP",
      shopId: grant.shopId,
      shopName: grant.shop.name,
      companyName: "Ma boutique",
      roleCode: grant.role.code,
      roleName: grant.role.name,
      permissions: p.filter(code => code === "workspace.access" || code.startsWith("shop.")),
      portal: "boutique",
    });
    const collaborations = await db.companyShop.findMany({
      where: {
        shopId: grant.shopId,
        status: "ACTIVE",
        company: { status: "ACTIVE", archivedAt: null },
      },
      include: { company: true },
    });
    for (const c of collaborations)
      result.push({
        key: `shop:${c.companyId}:${grant.shopId}`,
        scope: "SHOP",
        companyId: c.companyId,
        shopId: grant.shopId,
        companyName: c.company.name,
        shopName: grant.shop.name,
        roleCode: grant.role.code,
        roleName: grant.role.name,
        permissions: p,
        portal: "boutique",
      });
  }
  const ids = [
    ...new Set(result.flatMap((v) => (v.companyId ? [v.companyId] : []))),
  ];
  const subscriptions = await db.subscription.findMany({
    where: { companyId: { in: ids } },
  });
  const now = new Date();
  for (const workspace of result) {
    if (!workspace.companyId) continue;
    const s =
      subscriptions.find((v) => v.companyId === workspace.companyId) ?? null;
    const status = effectiveStatus(s, now);
    workspace.subscriptionAccess = {
      valid: status === "ACTIVE",
      status,
      expiresAt: s?.expiresAt?.toISOString() ?? null,
    };
  }
  return result;
}
