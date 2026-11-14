// Loopback-only recipe harness. Creates no production defaults and never runs on startup.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
import { OrganizationService } from "../src/modules/organization/service.js";
import { localSmtp } from "./helpers/local-smtp.js";
const url = process.env.DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DND_ADMIN_TEST_PREVIEW !== "1" ||
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test environment only");
const db = createDatabase(url),
  folder = path.resolve("../.local-preserved/bloc7");
await mkdir(folder, { recursive: true });
const company = await db.company.upsert({
  where: { reference: "BLOC7-UI-RECETTE" },
  create: {
    name: "Entreprise de recette Organisation",
    reference: "BLOC7-UI-RECETTE",
    email: "organisation@example.invalid",
    phone: "0000000000",
    address: "Siège de recette",
    city: "Douala",
    countryCode: "CM",
    status: "ACTIVE",
  },
  update: {},
});
const plan = await db.subscriptionPlan.findUniqueOrThrow({
  where: { referenceSlot: 1 },
});
await db.subscription.upsert({
  where: { companyId: company.id },
  create: {
    companyId: company.id,
    planId: plan.id,
    status: "ACTIVE",
    startedAt: new Date(Date.now() - 86400000),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  },
  update: { status: "ACTIVE", expiresAt: new Date(Date.now() + 30 * 86400000) },
});
const agencies: Array<{id:string;reference:string}> = [];
for (const reference of ["CENTRE", "PORT"])
  agencies.push(
    await db.agency.upsert({
      where: { companyId_reference: { companyId: company.id, reference } },
      create: {
        companyId: company.id,
        reference,
        name: reference === "CENTRE" ? "Agence Centre" : "Agence du Port",
        phone: "0000000000",
        address: "Adresse de recette",
        city: "Douala",
        countryCode: "CM",
      },
      update: { status: "ACTIVE" },
    }),
  );
const accounts = [];
let actorId = "";
const service = new OrganizationService(db);
for (const kind of [
  "admin",
  "agency_manager",
  "stock_manager",
  "courier",
] as const) {
  const email = "bloc7-ui-" + kind + "@example.invalid",
    password = randomBytes(24).toString("base64url");
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await hashPassword(password),
      fullName: {
        admin: "Administratrice · Recette",
        agency_manager: "Responsable · Recette",
        stock_manager: "Gestionnaire stock · Recette",
        courier: "Livreur · Recette",
      }[kind],
    },
    update: { status: "ACTIVE", passwordHash: await hashPassword(password) },
  });
  if (kind === "admin") {
    actorId = user.id;
    const role = await db.role.findUniqueOrThrow({
      where: { code: "company_admin" },
    });
    await db.companyMembership.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      create: { companyId: company.id, userId: user.id, roleId: role.id },
      update: { active: true, roleId: role.id },
    });
  } else
    await service.write(
      { actorId, companyId: company.id, scope: "COMPANY" },
      "employees.manage",
      (tx) =>
        service.assign(
          tx,
          { actorId, companyId: company.id, scope: "COMPANY" },
          user.id,
          kind,
          agencies.map((a) => a.id),
        ),
    );
  accounts.push({ kind, email, password, userId: user.id });
}
const manager = accounts.find((a) => a.kind === "agency_manager")!;
await db.agency.update({
  where: { id: agencies[0]!.id },
  data: { primaryManagerUserId: manager.userId },
});
await writeFile(
  path.join(folder, "ui-accounts.json"),
  JSON.stringify({ companyId: company.id, agencies, accounts }),
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
  console.log("Organization recipe ready: real MySQL, loopback API and SMTP."),
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
