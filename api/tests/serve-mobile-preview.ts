// Guarded local recipe; never part of application startup or a production seed.
import "./serve-confirmation-preview.js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabase } from "../src/database/client.js";
import { OrderService } from "../src/modules/orders/service.js";
import { DeliveryService } from "../src/modules/deliveries/service.js";
import { creation } from "../src/modules/orders/validation.js";
import { trackingLink } from "../src/modules/confirmation/tracking.js";
const url = process.env.DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DND_ADMIN_TEST_PREVIEW !== "1" ||
  !url ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated local test database required");
const db = createDatabase(url),
  folder = path.resolve("../.local-preserved/bloc14");
await mkdir(folder, { recursive: true });
const base = JSON.parse(
  await readFile("../.local-preserved/bloc13/ui-private.json", "utf8"),
) as {
  companyId: string;
  shopId: string;
  agencyId: string;
  accounts: Array<{ kind: string; userId: string }>;
};
let keys: { clientKey: string; missionKey: string };
try {
  keys = JSON.parse(await readFile(path.join(folder, "ui-state.json"), "utf8"));
} catch {
  keys = { clientKey: randomUUID(), missionKey: randomUUID() };
  await writeFile(path.join(folder, "ui-state.json"), JSON.stringify(keys));
}
try {
  const owner = base.accounts.find((a) => a.kind === "shop_owner")!,
    admin = base.accounts.find((a) => a.kind === "company_admin")!;
  const order = await new OrderService(db).create(
    { actorId: owner.userId, scope: "SHOP", shopId: base.shopId },
    creation.parse({
      companyId: base.companyId,
      shopId: base.shopId,
      agencyId: base.agencyId,
      clientKey: keys.clientKey,
      type: "ONE_OFF",
      recipient: {
        name: "Destinataire de recette mobile",
        email: "bloc14-recipient@example.invalid",
        phone: "+237699123456",
        country: "Cameroun",
        city: "Douala",
        address: "Adresse fictive de recette mobile, Bonapriso",
      },
      items: [{ name: "Colis de recette Android Bloc 14", quantity: 1 }],
      pickup: {
        address: "Boutique de recette mobile",
        contact: "Boutique Mboa",
        phone: "+237699123456",
      },
      parcelDescription: "Colis fictif pour recette du client natif",
      collectionRequired: true,
      amountToCollect: "5000",
      currency: "XAF",
    }),
  );
  let mission = await db.delivery.findFirst({
    where: { companyId: base.companyId, orderId: order.id },
  });
  if (!mission)
    mission = await db.delivery.findUniqueOrThrow({
      where: {
        id: (
          await new DeliveryService(db).create(
            {
              actorId: admin.userId,
              scope: "COMPANY",
              companyId: base.companyId,
            },
            {
              orderId: order.id,
              orderVersion: order.version,
              operationKey: keys.missionKey,
            },
          )
        ).id,
      },
    });
  const persisted = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    }),
    link = await db.$transaction((tx) => trackingLink(tx, persisted));
  await writeFile(
    path.join(folder, "ui-private.json"),
    JSON.stringify({
      ...base,
      orderId: order.id,
      deliveryId: mission.id,
      reference: order.publicNumber,
      link,
    }),
  );
  console.log(
    "Mobile recipe ready: persisted new mission and existing role accounts, local SMTP only.",
  );
} finally {
  await db.$disconnect();
}
