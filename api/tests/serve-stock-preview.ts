// Explicit recipe fixture; never used by application startup.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
import { OrganizationService } from "../src/modules/organization/service.js";
import { ProductService } from "../src/modules/products/service.js";
import { StockService } from "../src/modules/stocks/service.js";
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
  folder = path.resolve("../.local-preserved/bloc9");
await mkdir(folder, { recursive: true });
interface RecipeAccount {
  kind: string;
  email: string;
  password: string;
  userId: string;
}
let previous: { accounts: RecipeAccount[]; secret: string } | undefined;
try {
  previous = JSON.parse(
    await readFile(path.join(folder, "ui-accounts.json"), "utf8"),
  );
} catch {
  /* First recipe run. */
}
const secret = previous?.secret ?? randomBytes(48).toString("base64url");
process.env.AUTH_ACCESS_SECRET = secret;
const companies: Array<{ id: string; reference: string }> = [];
for (const [i, name] of [
  "DND Stock · Transporteur Centre",
  "DND Stock · Autre transporteur",
].entries()) {
  const reference = `BLOC9-UI-C${i + 1}`;
  const company = await db.company.upsert({
    where: { reference },
    create: {
      reference,
      name,
      email: `bloc9-c${i}@example.invalid`,
      phone: "0000000000",
      address: "Adresse de recette",
      countryCode: "CM",
      city: "Douala",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });
  companies.push(company);
  const plan = await db.subscriptionPlan.findUniqueOrThrow({
    where: { referenceSlot: 1 },
  });
  await db.subscription.upsert({
    where: { companyId: company.id },
    create: {
      companyId: company.id,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
    update: {
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
}
const agencies: Array<{ id: string; reference: string; companyId: string }> =
  [];
for (const [i, c] of companies.entries())
  for (const reference of i === 0 ? ["DOUALA", "YAOUNDE"] : ["DOUALA"])
    agencies.push(
      await db.agency.upsert({
        where: { companyId_reference: { companyId: c.id, reference } },
        create: {
          companyId: c.id,
          reference,
          name: `Agence ${reference === "DOUALA" ? "Douala" : "Yaoundé"}`,
          address: "Adresse de recette",
          city: reference === "DOUALA" ? "Douala" : "Yaoundé",
          countryCode: "CM",
          phone: "0000000000",
          status: "ACTIVE",
        },
        update: { status: "ACTIVE" },
      }),
    );
const shops: Array<{ id: string; reference: string }> = [];
for (const [i, name] of [
  "Boutique Mboa · Stocks",
  "Boutique séparée · Stocks",
].entries())
  shops.push(
    await db.shop.upsert({
      where: { reference: `BLOC9-UI-S${i + 1}` },
      create: {
        reference: `BLOC9-UI-S${i + 1}`,
        name,
        email: `bloc9-shop${i}@example.invalid`,
        phone: "0000000000",
        address: "Adresse de recette",
        countryCode: "CM",
        city: "Douala",
        district: "Bonapriso",
        status: "ACTIVE",
      },
      update: { status: "ACTIVE" },
    }),
  );
for (const c of companies)
  for (const s of shops)
    await db.companyShop.upsert({
      where: { companyId_shopId: { companyId: c.id, shopId: s.id } },
      create: {
        companyId: c.id,
        shopId: s.id,
        status: "ACTIVE",
        origin: "COMPANY",
        allowedAgencyIds: agencies
          .filter((a) => a.companyId === c.id)
          .map((a) => a.id),
        acceptedAt: new Date(),
        startedAt: new Date(),
      },
      update: {
        status: "ACTIVE",
        allowedAgencyIds: agencies
          .filter((a) => a.companyId === c.id)
          .map((a) => a.id),
      },
    });
const accounts: RecipeAccount[] = [],
  organization = new OrganizationService(db);
let actorId = "";
for (const kind of [
  "company_admin",
  "stock_manager",
  "agency_manager",
  "shop_owner",
] as const) {
  const email = `bloc9-ui-${kind}@example.invalid`,
    password =
      previous?.accounts.find((a) => a.kind === kind)?.password ??
      randomBytes(24).toString("base64url");
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      fullName: {
        company_admin: "Administration stock",
        stock_manager: "Gestionnaire stock",
        agency_manager: "Responsable agence",
        shop_owner: "Propriétaire Mboa",
      }[kind],
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
    update: { status: "ACTIVE", passwordHash: await hashPassword(password) },
  });
  if (kind === "company_admin") {
    actorId = user.id;
    const role = await db.role.findUniqueOrThrow({ where: { code: kind } });
    for (const c of companies)
      await db.companyMembership.upsert({
        where: { companyId_userId: { companyId: c.id, userId: user.id } },
        create: { companyId: c.id, userId: user.id, roleId: role.id },
        update: { active: true, roleId: role.id },
      });
  } else if (kind === "shop_owner") {
    const role = await db.role.findUniqueOrThrow({ where: { code: kind } });
    await db.shopMembership.upsert({
      where: { shopId_userId: { shopId: shops[0]!.id, userId: user.id } },
      create: { shopId: shops[0]!.id, userId: user.id, roleId: role.id },
      update: { active: true, roleId: role.id },
    });
  } else
    await organization.write(
      { actorId, scope: "COMPANY", companyId: companies[0]!.id },
      "employees.manage",
      (tx) =>
        organization.assign(
          tx,
          { actorId, scope: "COMPANY", companyId: companies[0]!.id },
          user.id,
          kind,
          agencies
            .filter((a) => a.companyId === companies[0]!.id)
            .map((a) => a.id),
        ),
    );
  accounts.push({ kind, email, password, userId: user.id });
}
const owner = accounts.find((a) => a.kind === "shop_owner")!,
  catalogue = new ProductService(db),
  products: Array<{ id: string; name: string }> = [];
for (const [sku, name] of [
  ["TSHIRT-BLEU", "T-shirt bleu"],
  ["SAC-VERT", "Sac de voyage vert"],
]) {
  const p = await db.product.findUnique({
    where: { shopId_sku: { shopId: shops[0]!.id, sku: sku! } },
  });
  products.push(
    p ??
      (await catalogue.create(
        { actorId: owner.userId, scope: "SHOP", shopId: shops[0]!.id },
        {
          name: name!,
          sku: sku!,
          description: null,
          category: "Articles unitaires",
          unit: "piece",
          active: true,
        },
      )),
  );
}
const stocks = new StockService(db),
  peer = companies[1]!,
  peerAgency = agencies.find((a) => a.companyId === peer.id)!;
let deposit = await db.stockDeposit.findUnique({
  where: {
    companyId_reference: {
      companyId: peer.id,
      reference: "BLOC9-RECETTE-AUTRE",
    },
  },
});
if (!deposit)
  deposit = await stocks.createDeposit(
    { actorId, scope: "COMPANY", companyId: peer.id },
    {
      reference: "BLOC9-RECETTE-AUTRE",
      agencyId: peerAgency.id,
      shopId: shops[0]!.id,
      items: [{ productId: products[0]!.id, quantity: 7 }],
      notes: "Dépôt réel de recette via le service métier.",
    },
  );
if (deposit.status === "DRAFT")
  await stocks.depositAction(
    { actorId, scope: "COMPANY", companyId: peer.id },
    deposit.id,
    "confirm",
    { version: deposit.version },
  );
await writeFile(
  path.join(folder, "ui-accounts.json"),
  JSON.stringify({ companies, agencies, shops, products, accounts, secret }),
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
  console.log("Stock recipe ready: real MySQL and loopback API."),
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
