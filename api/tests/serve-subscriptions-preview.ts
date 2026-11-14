// Explicit local-only UI recipe with real MySQL. Never imported by production.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
import { SubscriptionService } from "../src/modules/subscriptions/service.js";
import { localSmtp } from "./helpers/local-smtp.js";
const url = process.env.DATABASE_URL;
if (
  process.env.DND_ADMIN_TEST_PREVIEW !== "1" ||
  process.env.NODE_ENV !== "test" ||
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test environment only");
const db = createDatabase(url),
  folder = path.resolve("../.local-preserved/bloc6");
await mkdir(folder, { recursive: true });
const accounts = [];
for (const kind of ["global", "company"] as const) {
  const email = `bloc6-ui-${kind}@example.invalid`,
    password = randomBytes(24).toString("base64url");
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      fullName:
        kind === "global"
          ? "Recette SaaS · Administration"
          : "Recette SaaS · Entreprise",
      passwordHash: await hashPassword(password),
    },
    update: { status: "ACTIVE", passwordHash: await hashPassword(password) },
  });
  const role = await db.role.upsert({
    where: { code: kind === "global" ? "bloc6_ui_global" : "company_admin" },
    create: {
      code: kind === "global" ? "bloc6_ui_global" : "company_admin",
      name:
        kind === "global"
          ? "Super Administrateur"
          : "Administrateur entreprise",
      scope: kind === "global" ? "GLOBAL" : "COMPANY",
    },
    update: {},
  });
  for (const code of kind === "global"
    ? ["workspace.access", "platform.manage", "subscriptions.validate"]
    : ["workspace.access", "subscriptions.read", "subscriptions.declare"]) {
    const p = await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      create: { roleId: role.id, permissionId: p.id },
      update: {},
    });
  }
  if (kind === "global")
    await db.globalRoleGrant.upsert({
      where: { userId: user.id },
      create: { userId: user.id, roleId: role.id, roleScope: "GLOBAL" },
      update: { active: true, roleId: role.id },
    });
  else {
    const c = await db.company.upsert({
      where: { reference: "BLOC6-UI-RECETTE" },
      create: {
        reference: "BLOC6-UI-RECETTE",
        name: "Entreprise de recette SaaS",
        email: "recette@example.invalid",
        phone: "0000000000",
        address: "Adresse de recette",
        city: "Douala",
        countryCode: "CM",
        status: "ACTIVE",
      },
      update: {},
    });
    await db.companyMembership.upsert({
      where: { companyId_userId: { companyId: c.id, userId: user.id } },
      create: { companyId: c.id, userId: user.id, roleId: role.id },
      update: { active: true },
    });
    const service = new SubscriptionService(db, "local-ui-recipe-secret-only");
    const { current } = await service.plan();
    if (current) {
      const exists = await db.subscriptionPayment.findFirst({
        where: { companyId: c.id, status: "PENDING" },
      });
      if (!exists)
        await service.declare(user.id, c.id, {
          amount: current.amount.toFixed(4),
          currency: current.currency,
          method: "MTN_MOBILE_MONEY",
          externalReference: `RECETTE-${randomUUID()}`,
          paidAt: new Date(Date.now() - 1000).toISOString(),
          notes: "Déclaration de recette locale, aucun règlement réel.",
          idempotencyKey: randomUUID(),
        });
    }
  }
  accounts.push({ kind, email, password });
}
await writeFile(
  path.join(folder, "ui-accounts.json"),
  JSON.stringify(accounts),
);
const smtp = await localSmtp((message) => {
  void writeFile(path.join(folder, "latest-test-email.txt"), message);
});
Object.assign(process.env, {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(smtp.port),
  SMTP_FROM: "test@example.invalid",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_SECURE: "false",
});
const { app } = await import("../src/app.js");
const server = app.listen(4399, "127.0.0.1", () =>
  console.log("SaaS recipe: real MySQL API and local-only SMTP ready."),
);
async function close() {
  server.closeAllConnections();
  server.close();
  await smtp.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
