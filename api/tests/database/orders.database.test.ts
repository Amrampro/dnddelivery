import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import { OrderService } from "../../src/modules/orders/service.js";
import { OrderNotifications } from "../../src/modules/orders/notifications.js";
import type { OrderContext } from "../../src/modules/orders/access.js";
import * as v from "../../src/modules/orders/validation.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL orders: submission, stock, drafts, identities, concurrency and outbox", async (t) => {
  const db = createDatabase(url),
    s = new OrderService(db),
    suffix = randomUUID().slice(0, 8);
  try {
    const admin = await db.user.create({
        data: {
          email: `order-admin-${suffix}@example.invalid`,
          fullName: "Order admin",
          passwordHash: "not-login-fixture",
        },
      }),
      owner = await db.user.create({
        data: {
          email: `order-owner-${suffix}@example.invalid`,
          fullName: "Order owner",
          passwordHash: "not-login-fixture",
        },
      }),
      manager = await db.user.create({
        data: {
          email: `order-manager-${suffix}@example.invalid`,
          fullName: "Order manager",
          passwordHash: "not-login-fixture",
        },
      });
    const contact = {
      email: "orders@example.invalid",
      phone: "+32470123456",
      address: "Rue du test 10",
      city: "Bruxelles",
      countryCode: "BE",
    };
    const company = await db.company.create({
        data: {
          ...contact,
          reference: `ORDER-${suffix}`,
          name: "Order carrier",
          status: "ACTIVE",
        },
      }),
      other = await db.company.create({
        data: {
          ...contact,
          reference: `ORDER-Y-${suffix}`,
          name: "Other order carrier",
          status: "ACTIVE",
        },
      });
    const a = await db.agency.create({
        data: {
          ...contact,
          companyId: company.id,
          reference: "A",
          name: "Order A",
        },
      }),
      b = await db.agency.create({
        data: {
          ...contact,
          companyId: company.id,
          reference: "B",
          name: "Order B",
        },
      }),
      hidden = await db.agency.create({
        data: {
          ...contact,
          companyId: company.id,
          reference: "H",
          name: "Not shared",
        },
      });
    const shop = await db.shop.create({
        data: {
          reference: `ORDER-S-${suffix}`,
          name: "Order boutique",
          email: owner.email,
          phone: contact.phone,
          address: contact.address,
        },
      }),
      foreignShop = await db.shop.create({
        data: {
          reference: `ORDER-SY-${suffix}`,
          name: "Other boutique",
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
        },
      });
    const role = async (code: string) =>
      (await db.role.findUniqueOrThrow({ where: { code } })).id;
    await db.companyMembership.create({
      data: {
        companyId: company.id,
        userId: admin.id,
        roleId: await role("company_admin"),
      },
    });
    await db.companyMembership.create({
      data: {
        companyId: company.id,
        userId: manager.id,
        roleId: await role("company_member"),
      },
    });
    await db.agencyMembership.create({
      data: {
        companyId: company.id,
        agencyId: a.id,
        userId: manager.id,
        roleId: await role("agency_manager"),
      },
    });
    await db.shopMembership.create({
      data: {
        shopId: shop.id,
        userId: owner.id,
        roleId: await role("shop_owner"),
      },
    });
    await db.companyShop.create({
      data: {
        companyId: company.id,
        shopId: shop.id,
        status: "ACTIVE",
        allowedAgencyIds: [a.id, b.id],
      },
    });
    await db.companyShop.create({
      data: {
        companyId: company.id,
        shopId: foreignShop.id,
        status: "ACTIVE",
        allowedAgencyIds: [a.id],
      },
    });
    const plan = await db.subscriptionPlan.findFirstOrThrow({
      where: { active: true },
    });
    await db.subscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    const products = await Promise.all(
      ["Shirt", "Shoes", "Concurrent"].map((name, i) =>
        db.product.create({ data: { shopId: shop.id, name, sku: `SKU-${i}` } }),
      ),
    );
    const cc: OrderContext = {
        actorId: admin.id,
        scope: "COMPANY",
        companyId: company.id,
      },
      sc: OrderContext = { actorId: owner.id, scope: "SHOP", shopId: shop.id },
      ac: OrderContext = {
        actorId: manager.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: a.id,
      };
    const dep = await s.stock.createDeposit(cc, {
      reference: `ORDER-FIX-${suffix}`,
      shopId: shop.id,
      agencyId: a.id,
      items: products.map((p, i) => ({
        productId: p.id,
        quantity: i === 2 ? 5 : 40,
      })),
    });
    await s.stock.depositAction(cc, dep.id, "confirm", {
      version: dep.version,
    });
    const body = (overrides: Record<string, unknown> = {}) =>
      v.creation.parse({
        companyId: company.id,
        shopId: shop.id,
        agencyId: a.id,
        type: "ONE_OFF",
        clientKey: randomUUID(),
        recipient: {
          name: "Camille Dupont",
          email: "camille@example.invalid",
          phone: "+32 (470) 12-34-56",
          country: "Belgique",
          city: "Bruxelles",
          address: "10 rue du Commerce",
          district: "Centre",
          landmark: "Place",
          accessInstructions: "Sonnette 3",
          observations: "Fragile",
          latitude: 50.85,
          longitude: 4.35,
        },
        pickup: {
          address: "Boutique Centre",
          contact: "Boutique",
          phone: "+237699123456",
          instructions: "Demander au comptoir",
        },
        items: [{ name: "Colis chaussures", quantity: 2 }],
        parcelDescription: "Colis emballé",
        collectionRequired: false,
        amountToCollect: "0",
        currency: "XAF",
        ...overrides,
      });
    const stockBody = (quantity = 3, product = products[0]!.id) =>
      body({
        type: "FROM_STOCK",
        items: [{ productId: product, name: "Catalogue", quantity }],
        pickup: undefined,
      });
    const editBody = (
      p: Awaited<ReturnType<typeof s.detail>>,
      changes: Record<string, unknown> = {},
    ) =>
      v.edit.parse({
        companyId: p.companyId,
        shopId: p.shopId,
        agencyId: p.agencyId,
        type: p.type,
        recipient: p.recipientDetails,
        items: p.orderItem_orderRecords.map((i) => ({
          productId: i.productId ?? undefined,
          name: i.name,
          quantity: i.quantity,
        })),
        pickup: p.pickup ?? undefined,
        parcelDescription: p.parcelDescription,
        collectionRequired: p.collectionRequired,
        amountToCollect: p.amountToCollect.toString(),
        currency: p.currency,
        version: p.version,
        ...changes,
      });
    const balance = () =>
      db.stock.findUniqueOrThrow({
        where: {
          companyId_agencyId_shopId_productId: {
            companyId: company.id,
            shopId: shop.id,
            agencyId: a.id,
            productId: products[0]!.id,
          },
        },
      });
    let one!: Awaited<ReturnType<typeof s.detail>>,
      stock!: typeof one,
      draft!: typeof one;
    await t.test(
      "shop creates one-off without recipient account or stock reservation",
      async () => {
        one = await s.create(sc, body());
        assert.equal(one.createdById, owner.id);
        assert.equal(one.recipientPhone, "+32470123456");
        assert.equal(one.amountToCollect.toString(), "0");
        assert.equal(
          await db.stockReservation.count({
            where: { orderItem: { orderId: one.id } },
          }),
          0,
        );
        assert.equal(
          await db.user.count({ where: { email: one.recipientEmail } }),
          0,
        );
      },
    );
    await t.test(
      "multiple stock articles reserve atomically, physical unchanged",
      async () => {
        stock = await s.create(sc, stockBody());
        assert.equal((await balance()).reservedQuantity, 3);
        assert.equal((await balance()).physicalQuantity, 40);
        assert.equal(stock.orderItem_orderRecords[0]!.name, "Shirt");
        const multi = await s.create(
          ac,
          body({
            type: "FROM_STOCK",
            items: products
              .slice(0, 2)
              .map((p) => ({ productId: p.id, name: p.name, quantity: 2 })),
          }),
        );
        assert.equal(multi.orderItem_orderRecords.length, 2);
        assert.equal(multi.createdById, manager.id);
        await s.cancel(ac, multi.id, {
          version: multi.version,
          reason: "Test completed",
        });
      },
    );
    await t.test(
      "insufficient last line rolls back entire order and first reservation",
      async () => {
        const before = await balance(),
          count = await db.order.count();
        await assert.rejects(
          s.create(
            sc,
            body({
              type: "FROM_STOCK",
              items: [
                { productId: products[0]!.id, name: "A", quantity: 1 },
                { productId: products[1]!.id, name: "B", quantity: 1000 },
              ],
            }),
          ),
        );
        assert.equal(await db.order.count(), count);
        assert.equal(
          (await balance()).reservedQuantity,
          before.reservedQuantity,
        );
      },
    );
    await t.test(
      "two concurrent orders cannot reserve four units each out of five",
      async () => {
        const result = await Promise.allSettled([
          s.create(sc, stockBody(4, products[2]!.id)),
          s.create(sc, stockBody(4, products[2]!.id)),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        const row = await db.stock.findFirstOrThrow({
          where: { productId: products[2]!.id },
        });
        assert.equal(row.physicalQuantity, 5);
        assert.equal(row.reservedQuantity, 4);
      },
    );
    await t.test(
      "same mobile client key concurrently creates only one order",
      async () => {
        const x = body(),
          before = await db.order.count();
        const rows = await Promise.all([s.create(sc, x), s.create(sc, x)]);
        assert.equal(rows[0]!.id, rows[1]!.id);
        assert.equal(await db.order.count(), before + 1);
        await assert.rejects(
          s.create(sc, { ...x, parcelDescription: "Different" }),
        );
      },
    );
    await t.test(
      "draft has no reservation, remains editable and can be abandoned",
      async () => {
        draft = await s.create(sc, { ...stockBody(4), draft: true });
        assert.equal(
          await db.stockReservation.count({
            where: { orderItem: { orderId: draft.id } },
          }),
          0,
        );
        draft = await s.edit(
          sc,
          draft.id,
          editBody(draft, {
            recipient: { ...body().recipient, name: "Draft recipient changed" },
          }),
        );
        assert.equal(draft.recipientName, "Draft recipient changed");
        const d = await s.create(sc, { ...stockBody(1), draft: true });
        await s.cancel(sc, d.id, { version: d.version, reason: "Abandon" });
        await assert.rejects(s.submit(sc, d.id, { version: d.version + 1 }));
      },
    );
    await t.test(
      "draft submission rechecks quantities and repeated submit is harmless",
      async () => {
        const submitted = await s.submit(sc, draft.id, {
          version: draft.version,
        });
        assert.equal(submitted.isDraft, false);
        assert.equal((await balance()).reservedQuantity, 7);
        await s.submit(sc, draft.id, { version: draft.version });
        assert.equal((await balance()).reservedQuantity, 7);
      },
    );
    await t.test(
      "quantity edits release previous reservation and create new one atomically",
      async () => {
        stock = await s.edit(
          sc,
          stock.id,
          editBody(stock, {
            items: [{ productId: products[0]!.id, name: "Shirt", quantity: 6 }],
          }),
        );
        assert.equal((await balance()).reservedQuantity, 10);
        const old = await db.stockReservation.findMany({
          where: { orderItem: { orderId: stock.id } },
        });
        assert.equal(old.filter((r) => r.status === "ACTIVE").length, 1);
        assert.equal(old.filter((r) => r.status === "RELEASED").length, 1);
      },
    );
    await t.test(
      "failed stock edit restores original active reservation and version",
      async () => {
        await assert.rejects(
          s.edit(
            sc,
            stock.id,
            editBody(stock, {
              items: [
                { productId: products[0]!.id, name: "Shirt", quantity: 1000 },
              ],
            }),
          ),
        );
        assert.equal((await balance()).reservedQuantity, 10);
        assert.equal((await s.detail(sc, stock.id)).version, stock.version);
      },
    );
    await t.test("stale version cannot overwrite another edit", async () => {
      await assert.rejects(
        s.edit(sc, stock.id, editBody(stock, { version: stock.version - 1 })),
      );
    });
    await t.test(
      "cancellation releases once, retains items and immutable history",
      async () => {
        const p = await s.cancel(sc, stock.id, {
          version: stock.version,
          reason: "Client renonce",
        });
        assert.equal(p.status, "CANCELLED");
        assert.equal((await balance()).reservedQuantity, 4);
        await s.cancel(sc, stock.id, {
          version: stock.version,
          reason: "Client renonce",
        });
        assert.equal((await balance()).reservedQuantity, 4);
        const history = await s.history(sc, stock.id);
        assert.ok(history.some((e) => e.action === "STOCK_RELEASED"));
        assert.ok(
          history.some(
            (e) => e.previousStatus === "PENDING" && e.status === "CANCELLED",
          ),
        );
        await assert.rejects(
          db.orderEvent.update({
            where: { id: history[0]!.id },
            data: { notes: "rewrite" },
          }),
        );
      },
    );
    await t.test(
      "linked reservation cannot be manually released or consumed",
      async () => {
        const r = await db.stockReservation.findFirstOrThrow({
          where: { orderItem: { orderId: draft.id }, status: "ACTIVE" },
        });
        await assert.rejects(
          s.stock.reservationAction(cc, r.id, "release", {
            version: r.version,
          }),
        );
        assert.equal((await balance()).reservedQuantity, 4);
      },
    );
    await t.test(
      "inactive collaboration blocks creation and submit, allows authorized cancellation",
      async () => {
        const d = await s.create(sc, { ...stockBody(1), draft: true });
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { status: "SUSPENDED" },
        });
        await assert.rejects(s.create(sc, body()));
        await assert.rejects(s.submit(sc, d.id, { version: d.version }));
        await s.cancel(sc, d.id, {
          version: d.version,
          reason: "Collaboration suspendue",
        });
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { status: "ACTIVE" },
        });
      },
    );
    await t.test(
      "company, shop and agency identifiers cannot widen authority",
      async () => {
        await assert.rejects(s.create(cc, body({ companyId: other.id })));
        await assert.rejects(s.create(sc, body({ shopId: foreignShop.id })));
        await assert.rejects(s.create(ac, body({ agencyId: b.id })));
        await assert.rejects(s.create(sc, body({ agencyId: hidden.id })));
        const p = await s.create(cc, body({ agencyId: b.id }));
        await assert.rejects(s.detail(ac, p.id));
        const wrong = { ...sc, shopId: foreignShop.id };
        await assert.rejects(s.detail(wrong, one.id));
        await assert.rejects(s.list(ac, v.query.parse({ agencyId: b.id })));
      },
    );
    await t.test(
      "shop current carrier cannot be overridden by request",
      async () => {
        await assert.rejects(s.create({ ...sc, companyId: other.id }, body()));
      },
    );
    await t.test(
      "recipient validations accept international numbers and reject invalid contacts",
      () => {
        for (const recipient of [
          { ...body().recipient, email: "bad" },
          { ...body().recipient, phone: "699123456" },
          { ...body().recipient, address: " " },
          { ...body().recipient, country: "" },
        ])
          assert.throws(() => body({ recipient }));
        assert.equal(
          body({ recipient: { ...body().recipient, phone: "+14155552671" } })
            .recipient.phone,
          "+14155552671",
        );
      },
    );
    await t.test(
      "exact collection amount rules and no automatic payment",
      async () => {
        assert.throws(() =>
          body({ collectionRequired: true, amountToCollect: "0" }),
        );
        assert.throws(() =>
          body({ collectionRequired: false, amountToCollect: "1" }),
        );
        assert.throws(() =>
          body({ collectionRequired: true, amountToCollect: "1e3" }),
        );
        const p = await s.create(
          cc,
          body({
            collectionRequired: true,
            amountToCollect: "123456789012345.1234",
          }),
        );
        assert.equal(p.amountToCollect.toString(), "123456789012345.1234");
        assert.equal(p.status, "PENDING");
      },
    );
    await t.test(
      "references remain unique under concurrent creation",
      async () => {
        const rows = await Promise.all(
          Array.from({ length: 5 }, () => s.create(cc, body())),
        );
        assert.equal(new Set(rows.map((p) => p.publicNumber)).size, 5);
        assert.ok(rows.every((p) => p.publicNumber.startsWith("DND-")));
      },
    );
    await t.test(
      "recipient directory scoped to shop and snapshots survive profile changes",
      async () => {
        const x = body({ saveRecipient: true }),
          p = await s.create(sc, x);
        assert.ok(p.recipientId);
        const found = await s.recipients(sc, v.query.parse({ q: "Camille" }));
        assert.ok(found.items.some((r) => r.id === p.recipientId));
        await s.recipientWrite(
          sc,
          {
            companyId: company.id,
            shopId: shop.id,
            agencyId: a.id,
            recipient: {
              ...x.recipient,
              name: "Directory revised",
              email: "changed@example.invalid",
            },
          },
          p.recipientId!,
          1,
        );
        assert.equal(
          (await s.detail(sc, p.id)).recipientName,
          "Camille Dupont",
        );
        await assert.rejects(
          s.recipients(sc, v.query.parse({ shopId: foreignShop.id })),
        );
        const second = await s.create(sc, { ...x, clientKey: randomUUID() });
        assert.notEqual(second.recipientId, p.recipientId);
        await assert.rejects(
          s.edit(
            sc,
            p.id,
            editBody(p, {
              recipient: { ...x.recipient, name: "Forbidden snapshot edit" },
            }),
          ),
        );
      },
    );
    await t.test(
      "status beyond pending prevents arbitrary edits and cancellation",
      async () => {
        const p = await s.create(cc, body());
        await db.order.update({
          where: { id: p.id },
          data: { status: "IN_DELIVERY" },
        });
        await assert.rejects(
          s.cancel(cc, p.id, { version: p.version, reason: "Too late" }),
        );
        await assert.rejects(s.edit(cc, p.id, editBody(p)));
      },
    );
    await t.test(
      "agency change releases old stock and reserves target; failure rolls back",
      async () => {
        const p = await s.create(cc, stockBody(2));
        await assert.rejects(s.edit(cc, p.id, editBody(p, { agencyId: b.id })));
        assert.equal((await s.detail(cc, p.id)).agencyId, a.id);
        const target = await s.stock.createDeposit(cc, {
          reference: `TARGET-${suffix}`,
          agencyId: b.id,
          shopId: shop.id,
          items: [{ productId: products[0]!.id, quantity: 10 }],
        });
        await s.stock.depositAction(cc, target.id, "confirm", {
          version: target.version,
        });
        const changed = await s.edit(cc, p.id, editBody(p, { agencyId: b.id }));
        assert.equal(changed.agencyId, b.id);
        assert.equal((await balance()).reservedQuantity, 4);
      },
    );
    await t.test(
      "server pagination, filters, items and history use persisted data",
      async () => {
        const p = await s.list(
          cc,
          v.query.parse({
            q: one.publicNumber,
            size: 1,
            type: "ONE_OFF",
            collectionRequired: "false",
          }),
        );
        assert.equal(p.total, 1);
        assert.equal(p.items[0]!.id, one.id);
        assert.ok(p.summary.pending > 0);
        const d = await s.list(sc, v.query.parse({ draft: "true" }));
        assert.ok(d.items.every((p) => p.isDraft));
        assert.ok((await s.history(sc, one.id)).length > 0);
      },
    );
    await t.test(
      "financial-only edits do not touch physical stock or reservations",
      async () => {
        const p = await s.create(cc, stockBody(1));
        const reservation =
          p.orderItem_orderRecords[0]!.stockReservation_orderItemRecords[0]!;
        const stockVersion = (await balance()).version;
        const updated = await s.edit(
          cc,
          p.id,
          editBody(p, {
            items: p.orderItem_orderRecords.map((i) => ({
              productId: i.productId ?? undefined,
              name: i.name,
              sku: i.sku ?? undefined,
              description: i.description ?? undefined,
              instructions: i.instructions ?? undefined,
              quantity: i.quantity,
              declaredValue: i.declaredValue?.toString(),
            })),
            collectionRequired: true,
            amountToCollect: "1200.1234",
            financialNotes: "À récupérer",
          }),
        );
        assert.equal((await balance()).version, stockVersion);
        assert.equal(
          updated.orderItem_orderRecords[0]!
            .stockReservation_orderItemRecords[0]!.id,
          reservation.id,
        );
        assert.equal(updated.amountToCollect.toString(), "1200.1234");
        await s.cancel(cc, p.id, {
          version: updated.version,
          reason: "Test terminé",
        });
      },
    );
    await t.test(
      "creation catalogue is paginated and never exposes another shop or agency",
      async () => {
        const rows = await s.catalogue(ac, {
          companyId: company.id,
          shopId: shop.id,
          agencyId: a.id,
          page: 1,
          size: 1,
        });
        assert.equal(rows.items.length, 1);
        assert.equal(rows.total, 3);
        await assert.rejects(
          s.catalogue(sc, {
            companyId: company.id,
            shopId: foreignShop.id,
            agencyId: a.id,
            page: 1,
            size: 20,
          }),
        );
        await assert.rejects(
          s.catalogue(ac, {
            companyId: company.id,
            shopId: shop.id,
            agencyId: b.id,
            page: 1,
            size: 20,
          }),
        );
      },
    );
    await t.test(
      "expired subscription blocks writes but keeps authorized reads",
      async () => {
        await db.subscription.updateMany({
          where: { companyId: company.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await assert.rejects(s.create(sc, body()));
        await assert.rejects(s.create(cc, body()));
        await assert.rejects(
          s.cancel(sc, draft.id, {
            version: (await s.detail(sc, draft.id)).version,
            reason: "Expired",
          }),
        );
        assert.ok((await s.list(sc, v.query.parse({}))).total > 0);
        await db.subscription.updateMany({
          where: { companyId: company.id },
          data: { expiresAt: new Date(Date.now() + 86400000) },
        });
      },
    );
    await t.test(
      "durable notification, SMTP failure does not roll back order, retry succeeds",
      async () => {
        const p = await s.create(cc, body());
        const notification = await db.notification.findUniqueOrThrow({
          where: { dedupeKey: `order:${p.id}:registered` },
        });
        assert.equal(notification.status, "PENDING");
        const worker = new OrderNotifications(s,()=>new Date(),p.companyId);
        await worker.run(
          {
            send: async () => {
              throw Error("SMTP offline");
            },
          },
          1000,
        );
        assert.ok(await s.detail(cc, p.id));
        assert.equal(
          (
            await db.notification.findUniqueOrThrow({
              where: { id: notification.id },
            })
          ).status,
          "FAILED",
        );
        await db.notification.update({
          where: { id: notification.id },
          data: { availableAt: new Date(0) },
        });
        let delivered = false;
        await worker.run(
          {
            send: async (to, _subject, text) => {
              if (to === p.recipientEmail) delivered = true;
              assert.ok(!/OTP|password/i.test(text));
              assert.ok(text.includes("/suivi#reference="));
              assert.ok(text.includes("&token="));
              assert.ok(!text.includes("Votre code de remise"));
            },
          },
          1000,
        );
        assert.ok(delivered);
        assert.equal(
          (
            await db.notification.findUniqueOrThrow({
              where: { id: notification.id },
            })
          ).status,
          "SENT",
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
