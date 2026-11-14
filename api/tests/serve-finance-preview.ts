// Explicit loopback-only recipe. Never imported by normal application startup.
import "./serve-delivery-preview.js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { OrderService } from "../src/modules/orders/service.js";
import { DeliveryService } from "../src/modules/deliveries/service.js";
import { creation } from "../src/modules/orders/validation.js";
const url = process.env.DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DND_ADMIN_TEST_PREVIEW !== "1" ||
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test environment required");
const db = createDatabase(url),
  folder = path.resolve("../.local-preserved/bloc12");
await mkdir(folder, { recursive: true });
const base = JSON.parse(
  await readFile(
    path.resolve("../.local-preserved/bloc11/ui-accounts.json"),
    "utf8",
  ),
) as {
  companies: { id: string }[];
  agencies: { id: string; companyId: string; reference: string }[];
  shops: { id: string }[];
  accounts: { kind: string; userId: string; email: string; password: string }[];
};
let previous: { orderId: string; deliveryId: string } | undefined;
try {
  previous = JSON.parse(
    await readFile(path.join(folder, "ui-accounts.json"), "utf8"),
  );
} catch {
  /* First recipe run. */
}
const companyId = base.companies[0]!.id,
  agencyId = base.agencies.find(
    (a) => a.companyId === companyId && a.reference === "DOUALA",
  )!.id,
  shopId = base.shops[0]!.id,
  owner = base.accounts.find((a) => a.kind === "shop_owner")!,
  admin = base.accounts.find((a) => a.kind === "company_admin")!,
  courier = base.accounts.find((a) => a.kind === "courier")!;
let orderId = previous?.orderId,
  deliveryId = previous?.deliveryId;
if (!orderId || !deliveryId) {
  const orders = new OrderService(db),
    deliveries = new DeliveryService(db),
    operator = { actorId: admin.userId, scope: "COMPANY" as const, companyId },
    driver = {
      actorId: courier.userId,
      scope: "AGENCY" as const,
      companyId,
      agencyId,
    };
  const order = await orders.create(
    { actorId: owner.userId, scope: "SHOP", shopId },
    creation.parse({
      companyId,
      agencyId,
      shopId,
      clientKey: randomUUID(),
      type: "ONE_OFF",
      recipient: {
        name: "Client de recette financière",
        email: "bloc12-recipient@example.invalid",
        phone: "+237699123456",
        country: "Cameroun",
        city: "Douala",
        address: "Adresse de recette financière, Bonapriso",
      },
      items: [{ name: "Colis de recette financière", quantity: 1 }],
      pickup: {
        address: "Boutique de recette",
        contact: "Propriétaire Mboa",
        phone: "+237699123456",
      },
      parcelDescription:
        "Colis scellé pour la recette des déclarations financières",
      collectionRequired: true,
      amountToCollect: "25000",
      currency: "XAF",
    }),
  );
  let mission = await deliveries.create(operator, {
    orderId: order.id,
    orderVersion: order.version,
    operationKey: randomUUID(),
  });
  mission = await deliveries.assign(operator, mission.id, {
    version: mission.version,
    operationKey: randomUUID(),
    courierId: courier.userId,
  });
  mission = await deliveries.pickup(driver, mission.id, {
    version: mission.version,
    operationKey: randomUUID(),
  });
  mission = await deliveries.progress(driver, mission.id, {
    version: mission.version,
    operationKey: randomUUID(),
    event: "FINAL_DISTRIBUTION",
  });
  orderId = order.id;
  deliveryId = mission.id;
}
await writeFile(
  path.join(folder, "ui-accounts.json"),
  JSON.stringify({ ...base, companyId, agencyId, shopId, orderId, deliveryId }),
);
await db.$disconnect();
console.log(
  "Finance recipe ready: persisted financial mission, guarded local accounts and SMTP sink.",
);
