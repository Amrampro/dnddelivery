import "dotenv/config";
import { z } from "zod";
import { getDatabase, disconnectDatabase } from "../src/database/client.js";
import { organizationGrants } from "../src/modules/organization/permissions.js";
import { partnerGrants } from "../src/modules/partners/permissions.js";
import { stockGrants } from "../src/modules/stocks/permissions.js";
import { orderGrants } from "../src/modules/orders/permissions.js";
import { deliveryGrants } from "../src/modules/deliveries/permissions.js";
import { financialGrants } from "../src/modules/collections/permissions.js";
import { confirmationGrants } from "../src/modules/confirmation/permissions.js";
import { reportGrants } from "../src/modules/reports/permissions.js";
const price = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,4})?$/)
  .refine((s) => Number(s) > 0);
const currency = z.string().regex(/^[A-Z]{3}$/);
const roles = [
  [
    "super_admin",
    "Super Administrateur",
    "GLOBAL",
    ["platform.manage", "subscriptions.validate"],
  ],
  [
    "company_admin",
    "Administrateur entreprise",
    "COMPANY",
    [
      "orders.read",
      "stocks.reserve",
      "company.manage",
      "companies.read",
      "agencies.read",
      "partners.read",
      "users.read",
      "subscriptions.read",
      "subscriptions.declare",
      "stocks.read",
      "deliveries.read",
      "collections.read",
      "notifications.read",
      "reports.read",
      "audit.read",
    ],
  ],
  ["company_member", "Employé entreprise", "COMPANY", []],
  [
    "agency_manager",
    "Responsable agence",
    "AGENCY",
    [
      "orders.read",
      "stocks.reserve",
      "agencies.read",
      "stocks.read",
      "deliveries.read",
      "collections.read",
      "reports.read",
    ],
  ],
  [
    "stock_manager",
    "Gestionnaire stock",
    "AGENCY",
    ["stocks.reserve", "stocks.read"],
  ],
  ["courier", "Livreur", "AGENCY", ["deliveries.read"]],
  ["shop_owner", "Boutique partenaire", "SHOP", ["orders.read"]],
] as const;
try {
  const db = getDatabase();
  await db.$transaction(async (tx) => {
    for (const [code, name, scope, permissions] of roles) {
      const role = await tx.role.upsert({
        where: { code },
        create: { code, name, scope },
        update: {},
      });
      if (role.scope !== scope)
        throw new Error("Existing seed role has incompatible scope");
      const effectivePermissions: readonly string[] =
        code === "company_member"
          ? permissions
          : [...permissions, "workspace.access"];
      for (const permissionCode of effectivePermissions) {
        const permission = await tx.permission.upsert({
          where: { code: permissionCode },
          create: { code: permissionCode, description: permissionCode },
          update: {},
        });
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
    }
    const grants: Record<string, readonly string[]> = { ...organizationGrants };
    for (const [code, permissions] of Object.entries(partnerGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(stockGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(orderGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(deliveryGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(financialGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(confirmationGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(reportGrants))
      grants[code] = [...(grants[code] ?? []), ...permissions];
    for (const [code, permissions] of Object.entries(grants)) {
      const role = await tx.role.upsert({
        where: { code },
        create: {
          code,
          name: code === "agency_employee" ? "Employé d’agence" : code,
          scope: code.startsWith("shop_")
            ? "SHOP"
            : code.startsWith("company_")
              ? "COMPANY"
              : "AGENCY",
        },
        update: {},
      });
      for (const code of permissions) {
        const permission = await tx.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        });
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
    }
    const companyCourier = await tx.role.upsert({
      where: { code: "company_courier" },
      create: {
        code: "company_courier",
        name: "Livreur entreprise",
        scope: "COMPANY",
      },
      update: {},
    });
    if (companyCourier.scope !== "COMPANY")
      throw new Error("Incompatible company courier scope");
    const courier = await tx.role.findUniqueOrThrow({
      where: { code: "courier" },
    });
    for (const link of await tx.rolePermission.findMany({
      where: { roleId: courier.id },
    })) {
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: companyCourier.id,
            permissionId: link.permissionId,
          },
        },
        create: { roleId: companyCourier.id, permissionId: link.permissionId },
        update: {},
      });
    }
    if (
      process.env.SUBSCRIPTION_SEED_PRICE ||
      process.env.SUBSCRIPTION_SEED_CURRENCY
    ) {
      const amount = price.parse(process.env.SUBSCRIPTION_SEED_PRICE);
      const appliedCurrency = currency.parse(
        process.env.SUBSCRIPTION_SEED_CURRENCY,
      );
      const plan = await tx.subscriptionPlan.upsert({
        where: { code: "reference" },
        create: {
          code: "reference",
          name: "Abonnement mensuel DND Delivery",
          referenceSlot: 1,
          active: true,
        },
        update: {},
      });
      if (
        !(await tx.subscriptionPrice.findFirst({ where: { planId: plan.id } }))
      ) {
        await tx.subscriptionPrice.create({
          data: {
            planId: plan.id,
            amount,
            currency: appliedCurrency,
            effectiveFrom: new Date(),
          },
        });
      }
    }
  });
  console.log(
    "Seed completed: reference roles only; no user account or password created. Existing prices preserved.",
  );
  if (!process.env.SUBSCRIPTION_SEED_PRICE)
    console.log(
      "Commercial plan/price not initialized: configure SUBSCRIPTION_SEED_PRICE and SUBSCRIPTION_SEED_CURRENCY explicitly.",
    );
} finally {
  await disconnectDatabase();
}
