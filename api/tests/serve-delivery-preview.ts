// Explicit loopback recipe, never loaded by application startup.
import "./serve-stock-preview.js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { hashPassword } from "../src/modules/auth/crypto.js";
import { OrganizationService } from "../src/modules/organization/service.js";
import { OrderService } from "../src/modules/orders/service.js";
import { creation } from "../src/modules/orders/validation.js";
const url = process.env.DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DND_ADMIN_TEST_PREVIEW !== "1" ||
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test environment only");
const db = createDatabase(url),
  folder = path.resolve("../.local-preserved/bloc11");
await mkdir(folder, { recursive: true });
interface Account {
  kind: string;
  email: string;
  password: string;
  userId: string;
}
const base = JSON.parse(
  await readFile(
    path.resolve("../.local-preserved/bloc9/ui-accounts.json"),
    "utf8",
  ),
) as {
  companies: { id: string }[];
  agencies: { id: string; companyId: string; reference: string }[];
  shops: { id: string }[];
  products: { id: string }[];
  accounts: Account[];
};
let previous:
  { accounts: Account[]; orderId: string; oneOffId: string } | undefined;
try {
  previous = JSON.parse(
    await readFile(path.join(folder, "ui-accounts.json"), "utf8"),
  );
} catch {
  /* First recipe. */
}
const companyId = base.companies[0]!.id,
  shopId = base.shops[0]!.id,
  agencyId = base.agencies.find(
    (a) => a.companyId === companyId && a.reference === "DOUALA",
  )!.id;
const actorId = base.accounts.find((a) => a.kind === "company_admin")!.userId,
  owner = base.accounts.find((a) => a.kind === "shop_owner")!;
const context = { actorId, scope: "COMPANY" as const, companyId },
  organization = new OrganizationService(db),
  accounts: Account[] = [...base.accounts];
for (const kind of ["courier", "courier_peer"]) {
  const email = `bloc11-ui-${kind}@example.invalid`,
    password =
      previous?.accounts.find((a) => a.kind === kind)?.password ??
      randomBytes(24).toString("base64url");
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      fullName: kind === "courier" ? "Samuel · Livraison" : "Amina · Livraison",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
    update: { status: "ACTIVE" },
  });
  await organization.write(context, "employees.manage", (tx) =>
    organization.assign(
      tx,
      context,
      user.id,
      "courier",
      base.agencies.filter((a) => a.companyId === companyId).map((a) => a.id),
    ),
  );
  await db.driverProfile.update({
    where: { companyId_userId: { companyId, userId: user.id } },
    data: { status: "ACTIVE", availability: "AVAILABLE" },
  });
  accounts.push({ kind, email, password, userId: user.id });
}
const orders = new OrderService(db),
  ownerContext = { actorId: owner.userId, scope: "SHOP" as const, shopId };
const create = async (stock: boolean) =>
  orders.create(
    ownerContext,
    creation.parse({
      companyId,
      agencyId,
      shopId,
      clientKey: randomUUID(),
      type: stock ? "FROM_STOCK" : "ONE_OFF",
      recipient: {
        name: "Client de recette Bloc 11",
        email: "bloc11-recipient@example.invalid",
        phone: "+237699123456",
        country: "Cameroun",
        city: "Douala",
        address: "Rue de la recette, Bonapriso",
        accessInstructions: "Appeler à l’arrivée",
      },
      items: [
        {
          ...(stock ? { productId: base.products[0]!.id } : {}),
          name: stock ? "T-shirt bleu" : "Petit colis",
          quantity: stock ? 2 : 1,
        },
      ],
      pickup: stock
        ? undefined
        : {
            address: "Boutique Mboa, Douala",
            contact: "Propriétaire Mboa",
            phone: "+237699123456",
          },
      parcelDescription: "Colis scellé · recette logistique",
      collectionRequired: true,
      amountToCollect: "5000",
      currency: "XAF",
    }),
  );
const orderId = previous?.orderId ?? (await create(true)).id,
  oneOffId = previous?.oneOffId ?? (await create(false)).id;
await writeFile(
  path.join(folder, "ui-accounts.json"),
  JSON.stringify({ ...base, accounts, orderId, oneOffId }),
);
await db.$disconnect();
console.log(
  "Delivery recipe ready: guarded test accounts and persisted orders.",
);
