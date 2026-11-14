// Test-only accounts for visual navigation checks. Never imported by the API runtime.
import { randomUUID } from "node:crypto";
import type { Workspace } from "../../src/modules/auth/types.js";
import type { authFixture } from "./auth-fixture.js";
export function addUiRoleFixtures(f: Awaited<ReturnType<typeof authFixture>>) {
  const original = f.store.data.users.get(f.userId)!;
  const configurations: Array<{
    portal: Workspace["portal"];
    roleCode: string;
    roleName: string;
    scope: Workspace["scope"];
    permissions: string[];
  }> = [
    {
      portal: "super-admin",
      roleCode: "super_admin",
      roleName: "Super Administrateur",
      scope: "GLOBAL",
      permissions: ["platform.manage", "subscriptions.validate"],
    },
    {
      portal: "entreprise",
      roleCode: "company_admin",
      roleName: "Administrateur entreprise",
      scope: "COMPANY",
      permissions: [
        "company.manage",
        "agencies.read",
        "partners.read",
        "users.read",
        "subscriptions.read",
        "stocks.read",
        "orders.read",
        "deliveries.read",
        "collections.read",
        "notifications.read",
        "reports.read",
        "audit.read",
      ],
    },
    {
      portal: "agence",
      roleCode: "agency_manager",
      roleName: "Responsable d’agence",
      scope: "AGENCY",
      permissions: [
        "orders.read",
        "agencies.read",
        "stocks.read",
        "deliveries.read",
        "collections.read",
        "reports.read",
      ],
    },
    {
      portal: "stock",
      roleCode: "stock_manager",
      roleName: "Gestionnaire de stock",
      scope: "AGENCY",
      permissions: ["stocks.read", "stocks.reserve"],
    },
    {
      portal: "boutique",
      roleCode: "shop_owner",
      roleName: "Boutique partenaire",
      scope: "SHOP",
      permissions: ["orders.read"],
    },
    {
      portal: "livreur",
      roleCode: "courier",
      roleName: "Livreur",
      scope: "AGENCY",
      permissions: ["deliveries.read"],
    },
  ];
  for (const config of configurations) {
    const id = randomUUID(),
      company = randomUUID(),
      agency = randomUUID(),
      shop = randomUUID();
    f.store.data.users.set(id, {
      ...original,
      id,
      email: `${config.portal}@example.invalid`,
      fullName: "Camille Martin · Test UI",
    });
    f.store.data.companies.set(company, true);
    const grant = {
      active: true,
      scope: config.scope,
      permissions: ["workspace.access", ...config.permissions],
    };
    if (config.scope === "GLOBAL") f.store.data.globalGrants.set(id, grant);
    else if (config.scope === "SHOP") {
      f.store.data.shops.add(`${company}:${shop}`);
      f.store.data.shopGrants.set(`${id}:${shop}`, grant);
    } else {
      f.store.data.companyGrants.set(
        `${id}:${company}`,
        config.scope === "COMPANY"
          ? grant
          : { active: true, scope: "COMPANY", permissions: [] },
      );
      if (config.scope === "AGENCY") {
        f.store.data.agencies.add(`${company}:${agency}`);
        f.store.data.agencyGrants.set(`${id}:${company}:${agency}`, grant);
      }
    }
    const context: Workspace = {
      key:
        config.scope === "GLOBAL"
          ? "global"
          : `${config.scope.toLowerCase()}:${company}:${config.scope === "SHOP" ? shop : agency}`,
      scope: config.scope,
      portal: config.portal,
      roleCode: config.roleCode,
      roleName: config.roleName,
      permissions: [],
      companyName:
        config.scope === "GLOBAL"
          ? "Administration DND Delivery · Test"
          : "DND Logistique · Test",
      ...(config.scope !== "GLOBAL" ? { companyId: company } : {}),
      ...(config.scope === "AGENCY"
        ? { agencyId: agency, agencyName: "Agence centrale · Test" }
        : {}),
      ...(config.scope === "SHOP"
        ? { shopId: shop, shopName: "Boutique partenaire · Test" }
        : {}),
    };
    f.store.data.contexts.set(id, [context]);
  }
}
