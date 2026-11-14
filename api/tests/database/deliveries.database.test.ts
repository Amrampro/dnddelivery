import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import { DeliveryService } from "../../src/modules/deliveries/service.js";
import { OrderService } from "../../src/modules/orders/service.js";
import { DeliveryNotifications } from "../../src/modules/deliveries/notifications.js";
import { agencyBlockers } from "../../src/modules/organization/access.js";
import type { Context } from "../../src/modules/deliveries/access.js";
import * as v from "../../src/modules/deliveries/validation.js";
import { creation } from "../../src/modules/orders/validation.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL delivery operations: dispatch, physical custody, transport, failures and returns", async (t) => {
  const db = createDatabase(url),
    s = new DeliveryService(db),
    orders = new OrderService(db),
    suffix = randomUUID().slice(0, 8);
  try {
    const role = async (code: string) =>
      (await db.role.findUniqueOrThrow({ where: { code } })).id;
    const user = async (name: string) =>
      db.user.create({
        data: {
          email: `delivery-${name}-${suffix}@example.invalid`,
          fullName: name,
          passwordHash: "Not a login fixture",
        },
      });
    const admin = await user("admin"),
      manager = await user("manager"),
      owner = await user("owner"),
      d1 = await user("courier-one"),
      d2 = await user("courier-two"),
      d3 = await user("courier-three"),
      alien = await user("foreign-courier");
    const contact = {
      email: "delivery@example.invalid",
      phone: "+32470123456",
      address: "Test address",
      city: "Douala",
      countryCode: "CM",
    };
    const company = await db.company.create({
        data: {
          ...contact,
          reference: `DEL-${suffix}`,
          name: "Delivery carrier",
          status: "ACTIVE",
        },
      }),
      other = await db.company.create({
        data: {
          ...contact,
          reference: `DEL-Y-${suffix}`,
          name: "Other carrier",
          status: "ACTIVE",
        },
      });
    const agency = async (companyId: string, reference: string) =>
      db.agency.create({
        data: { ...contact, companyId, reference, name: "Agency " + reference },
      });
    const a = await agency(company.id, "A"),
      b = await agency(company.id, "B"),
      third = await agency(company.id, "C"),
      foreign = await agency(other.id, "X");
    for (const companyId of [company.id, other.id])
      await db.companyMembership.create({
        data: {
          companyId,
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
    for (const [u, companyId, agencies] of [
      [d1, company.id, [a.id]],
      [d2, company.id, [a.id]],
      [d3, company.id, [b.id, third.id]],
      [alien, other.id, [foreign.id]],
    ] as const) {
      await db.companyMembership.create({
        data: {
          companyId,
          userId: u.id,
          roleId: await role("company_member"),
          organizationRole: "courier",
        },
      });
      for (const agencyId of agencies)
        await db.agencyMembership.create({
          data: {
            companyId,
            agencyId,
            userId: u.id,
            roleId: await role("courier"),
          },
        });
      await db.driverProfile.create({
        data: {
          companyId,
          userId: u.id,
          status: "ACTIVE",
          availability: "AVAILABLE",
        },
      });
    }
    const shop = await db.shop.create({
        data: {
          reference: `DEL-S-${suffix}`,
          name: "Delivery shop",
          email: owner.email,
          phone: contact.phone,
          address: contact.address,
        },
      }),
      secretShop = await db.shop.create({
        data: {
          reference: `DEL-SY-${suffix}`,
          name: "Private shop",
          email: "secret@example.invalid",
          phone: contact.phone,
          address: contact.address,
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
        allowedAgencyIds: [a.id, b.id, third.id],
      },
    });
    await db.companyShop.create({
      data: {
        companyId: other.id,
        shopId: shop.id,
        status: "ACTIVE",
        allowedAgencyIds: [foreign.id],
      },
    });
    const plan = await db.subscriptionPlan.findFirstOrThrow({
      where: { active: true },
    });
    for (const companyId of [company.id, other.id])
      await db.subscription.create({
        data: {
          companyId,
          planId: plan.id,
          status: "ACTIVE",
          startedAt: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() + 86400000 * 20),
        },
      });
    const product = await db.product.create({
      data: { shopId: shop.id, name: "Delivery shirts", sku: "DEL-P" },
    });
    const cc: Context = {
        actorId: admin.id,
        scope: "COMPANY",
        companyId: company.id,
      },
      ac: Context = {
        actorId: manager.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: a.id,
      },
      bc: Context = { ...cc, scope: "AGENCY", agencyId: b.id },
      sc: Context = { actorId: owner.id, scope: "SHOP", shopId: shop.id },
      dc: Context = {
        actorId: d1.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: a.id,
      },
      ec: Context = { ...dc, actorId: d2.id },
      tc: Context = { ...dc, actorId: d3.id, agencyId: b.id };
    const deposit = await s.stock.createDeposit(cc, {
      reference: `DEL-DEP-${suffix}`,
      shopId: shop.id,
      agencyId: a.id,
      items: [{ productId: product.id, quantity: 100 }],
    });
    await s.stock.depositAction(cc, deposit.id, "confirm", {
      version: deposit.version,
    });
    const action = (
      p: { version: number },
      extra: Record<string, unknown> = {},
    ) => ({
      ...v.action.parse({
        version: p.version,
        operationKey: randomUUID(),
        reason: "Delivery recipe reason",
      }),
      ...extra,
    });
    const orderInput = (
      stock = false,
      companyId = company.id,
      agencyId = a.id,
    ) =>
      creation.parse({
        companyId,
        agencyId,
        shopId: shop.id,
        clientKey: randomUUID(),
        type: stock ? "FROM_STOCK" : "ONE_OFF",
        recipient: {
          name: "Recipient",
          email: "recipient@example.invalid",
          phone: "+14155552671",
          country: "Cameroon",
          city: "Douala",
          address: "Recipient address",
          accessInstructions: "Door 2",
        },
        items: [
          {
            ...(stock ? { productId: product.id } : {}),
            name: "Parcel",
            quantity: 2,
          },
        ],
        pickup: stock
          ? undefined
          : {
              address: "Shop collection",
              contact: "Shop owner",
              phone: "+237699123456",
            },
        parcelDescription: "Sealed parcel",
        collectionRequired: true,
        amountToCollect: "2500.1234",
        currency: "XAF",
      });
    type M = Awaited<ReturnType<typeof s.detail>>;
    const create = async (stock = false) => {
      const o = await orders.create(sc, orderInput(stock));
      return s.create(cc, {
        orderId: o.id,
        orderVersion: o.version,
        operationKey: randomUUID(),
      });
    };
    const assign = async (p: M, courierId = d1.id) =>
      s.assign(cc, p.id, { ...action(p), courierId });
    const pickup = async (stock = false) => {
      let p = await create(stock);
      p = await assign(p);
      if (stock) p = await s.prepare(ac, p.id, action(p));
      return s.pickup(dc, p.id, action(p));
    };
    const balance = () =>
      db.stock.findUniqueOrThrow({
        where: {
          companyId_agencyId_shopId_productId: {
            companyId: company.id,
            agencyId: a.id,
            shopId: shop.id,
            productId: product.id,
          },
        },
      });
    let one!: M, stock!: M;
    await t.test(
      "creates one mission/parcel per submitted order and rejects drafts",
      async () => {
        one = await create();
        assert.equal(one.phase, "WAITING_COLLECTION");
        assert.equal(one.custody.type, "SHOP");
        assert.equal(one.status, "PENDING");
        assert.ok(one.parcelReference?.startsWith("COLIS-"));
        await assert.rejects(
          s.create(cc, {
            orderId: one.orderId,
            orderVersion: 1,
            operationKey: randomUUID(),
          }),
        );
        const draft = await orders.create(sc, { ...orderInput(), draft: true });
        await assert.rejects(
          s.create(cc, {
            orderId: draft.id,
            orderVersion: draft.version,
            operationKey: randomUUID(),
          }),
        );
      },
    );
    await t.test(
      "valid dispatch records assignment but does not confer physical custody",
      async () => {
        one = await assign(one);
        assert.equal(one.status, "ASSIGNED");
        assert.equal(one.custody.type, "SHOP");
        assert.equal(one.pickedUpAt, null);
        assert.equal(one.assignments.length, 1);
        assert.equal(one.courierId, d1.id);
      },
    );
    await t.test(
      "unavailable, suspended, foreign and wrong-agency couriers cannot be assigned",
      async () => {
        const p = await create();
        await db.driverProfile.update({
          where: { companyId_userId: { companyId: company.id, userId: d2.id } },
          data: { status: "SUSPENDED", availability: "UNAVAILABLE" },
        });
        await assert.rejects(assign(p, d2.id));
        await db.driverProfile.update({
          where: { companyId_userId: { companyId: company.id, userId: d2.id } },
          data: { status: "ACTIVE", availability: "UNAVAILABLE" },
        });
        await assert.rejects(assign(p, d2.id));
        await assert.rejects(assign(p, alien.id));
        await assert.rejects(assign(p, d3.id));
        await db.driverProfile.update({
          where: { companyId_userId: { companyId: company.id, userId: d2.id } },
          data: { availability: "AVAILABLE" },
        });
        await assert.rejects(
          s.assign(sc, p.id, { ...action(p), courierId: d1.id }),
        );
        await assert.rejects(
          s.assign(dc, p.id, { ...action(p), courierId: d1.id }),
        );
      },
    );
    await t.test("concurrent assignment has one active winner", async () => {
      const p = await create(),
        results = await Promise.allSettled([
          assign(p, d1.id),
          assign(p, d2.id),
        ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        await db.deliveryAssignment.count({
          where: { deliveryId: p.id, endedAt: null },
        }),
        1,
      );
    });
    await t.test(
      "declared availability and multiple active missions remain distinct",
      async () => {
        const drivers = await s.eligible(ac, a.id),
          driver = drivers.find((d) => d.id === d1.id)!;
        assert.ok(driver.activeMissions >= 1);
        assert.equal(driver.availability, "AVAILABLE");
        assert.equal(driver.eligible, true);
        const p = await assign(await create());
        assert.equal(p.courierId, d1.id);
        await assert.rejects(s.eligible(ac, b.id));
      },
    );
    await t.test(
      "courier reads only current own assignments; operators and shops stay scoped",
      async () => {
        assert.equal((await s.detail(dc, one.id)).courierId, d1.id);
        await assert.rejects(s.detail(ec, one.id));
        await assert.rejects(s.detail({ ...cc, companyId: other.id }, one.id));
        await assert.rejects(
          s.detail({ ...sc, shopId: secretShop.id }, one.id),
        );
        const view = await s.detail(sc, one.id);
        assert.equal(view.courierId, null);
        assert.deepEqual(view.assignments, []);
        assert.deepEqual(view.handovers, []);
        assert.equal(view.order.amountToCollect, "2500.1234");
        const mine = await s.list(dc, v.query.parse({}));
        assert.ok(
          mine.items.every((p) => "courierId" in p && p.courierId === d1.id),
        );
        await assert.rejects(s.list(dc, v.query.parse({ courierId: d2.id })));
      },
    );
    await t.test(
      "reassignment before pickup requires a reason and closes the prior assignment",
      async () => {
        await assert.rejects(
          s.assign(
            cc,
            one.id,
            { ...action(one), reason: undefined, courierId: d2.id },
            true,
          ),
        );
        one = await s.assign(
          ac,
          one.id,
          { ...action(one), courierId: d2.id },
          true,
        );
        assert.equal(one.courierId, d2.id);
        assert.equal(one.assignments.length, 2);
        assert.ok(one.assignments[0]!.endedAt);
        await assert.rejects(s.detail(dc, one.id));
      },
    );
    await t.test(
      "one-off pickup changes custody without fabricating agency stock",
      async () => {
        const before = await balance(),
          count = await db.stockMovement.count();
        one = await s.pickup(ec, one.id, action(one));
        assert.equal(one.custody.type, "COURIER");
        assert.equal(one.custody.userId, d2.id);
        assert.ok(one.pickedUpAt);
        assert.equal(one.status, "IN_PROGRESS");
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        assert.equal(await db.stockMovement.count(), count);
      },
    );
    await t.test(
      "stock pickup requires preparation, atomically consumes exact reservations",
      async () => {
        stock = await assign(await create(true));
        await assert.rejects(s.pickup(dc, stock.id, action(stock)));
        stock = await s.prepare(ac, stock.id, action(stock));
        const before = await balance();
        stock = await s.pickup(dc, stock.id, action(stock));
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity - 2,
        );
        assert.equal(
          (await balance()).reservedQuantity,
          before.reservedQuantity - 2,
        );
        assert.ok(stock.stockIssuedAt);
        assert.equal(stock.order.items[0]!.reservations[0]!.status, "CONSUMED");
      },
    );
    await t.test(
      "repeated and concurrent pickup cannot issue stock twice",
      async () => {
        await assert.rejects(s.pickup(dc, stock.id, action(stock)));
        let p = await assign(await create(true));
        p = await s.prepare(ac, p.id, action(p));
        const before = await balance(),
          request = action(p);
        const results = await Promise.all([
          s.pickup(dc, p.id, request),
          s.pickup(dc, p.id, request),
        ]);
        assert.equal(results[0]!.id, results[1]!.id);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity - 2,
        );
        await assert.rejects(
          s.pickup(dc, p.id, { ...request, reason: "different content" }),
        );
      },
    );
    await t.test(
      "a failed issue rolls back mission, reservation status and pickup event",
      async () => {
        let p = await assign(await create(true));
        p = await s.prepare(ac, p.id, action(p));
        const r = p.order.items[0]!.reservations[0]!;
        await db.stockReservation.update({
          where: { id: r.id },
          data: { status: "RELEASED" },
        });
        const before = await balance();
        await assert.rejects(s.pickup(dc, p.id, action(p)));
        assert.equal((await s.detail(dc, p.id)).pickedUpAt, null);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        await db.stockReservation.update({
          where: { id: r.id },
          data: { status: "ACTIVE" },
        });
      },
    );
    await t.test(
      "physical reassignment keeps old custody until new courier accepts handover",
      async () => {
        const p = await s.assign(
          cc,
          stock.id,
          { ...action(stock), courierId: d2.id },
          true,
        );
        assert.equal(p.courierId, d1.id);
        assert.equal(p.custody.userId, d1.id);
        const h = p.handovers.at(-1)!;
        await assert.rejects(s.detail(ec, p.id));
        const incoming = await s.handovers(ec);
        assert.ok(incoming.some((row) => row.id === h.id));
        assert.ok(
          !("recipientPhone" in incoming.find((row) => row.id === h.id)!),
        );
        await assert.rejects(
          s.confirmHandover(dc, p.id, h.id, {
            ...action(p),
            condition: "GOOD",
            handoverVersion: h.version,
          }),
        );
        await s.confirmHandover(ec, p.id, h.id, {
          ...action(p),
          condition: "GOOD",
          handoverVersion: h.version,
        });
        stock = await s.detail(ec, p.id);
        assert.equal(stock.courierId, d2.id);
        assert.equal(stock.custody.userId, d2.id);
        await assert.rejects(s.detail(dc, p.id));
        assert.equal(
          stock.assignments.filter((a) => a.endedAt === null).length,
          1,
        );
      },
    );
    await t.test(
      "courier progression reaches confirmation pending, never delivered without proof",
      async () => {
        one = await s.progress(ec, one.id, {
          ...action(one),
          event: "DEPARTED",
        });
        one = await s.progress(ec, one.id, {
          ...action(one),
          event: "FINAL_DISTRIBUTION",
        });
        one = await s.progress(ec, one.id, {
          ...action(one),
          event: "ARRIVED",
        });
        one = await s.attempt(ec, one.id, {
          ...action(one),
          result: "AWAITING_CONFIRMATION",
        });
        assert.equal(one.phase, "AWAITING_PROOF");
        assert.notEqual(one.status, "DELIVERED");
        await assert.rejects(
          s.progress(ec, one.id, { ...action(one), event: "DELIVERED" }),
        );
        await assert.rejects(
          db.delivery.update({
            where: { id: one.id },
            data: { status: "DELIVERED", closedAt: new Date() },
          }),
        );
        assert.throws(() =>
          v.progress.parse({ ...action(one), event: "DELIVERED" }),
        );
      },
    );
    await t.test(
      "failed attempts require reason, retain history and never credit stock",
      async () => {
        const before = await balance();
        await assert.rejects(
          s.attempt(ec, stock.id, {
            ...action(stock),
            reason: undefined,
            result: "FAILED",
          }),
        );
        stock = await s.attempt(ec, stock.id, {
          ...action(stock),
          result: "FAILED",
          kind: "ABSENT",
          reason: "Recipient absent at address",
        });
        assert.equal(stock.status, "FAILED");
        assert.equal(stock.custody.userId, d2.id);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        assert.equal(stock.attempts.length, 1);
        assert.ok(stock.incidents.some((i) => i.kind === "ABSENT"));
      },
    );
    await t.test(
      "authorized incident decision allows a new attempt without erasing the first",
      async () => {
        const incident = stock.incidents.find((i) => i.status === "OPEN")!;
        await assert.rejects(s.retry(cc, stock.id, action(stock)));
        stock = await s.resolveIncident(ac, stock.id, incident.id, {
          ...action(stock),
          incidentVersion: incident.version,
          decision: "RETRY",
        });
        assert.equal(stock.phase, "FINAL_DISTRIBUTION");
        stock = await s.progress(ec, stock.id, {
          ...action(stock),
          event: "ARRIVED",
        });
        stock = await s.attempt(ec, stock.id, {
          ...action(stock),
          result: "FAILED",
          kind: "REFUSED",
          reason: "Recipient refuses package",
        });
        assert.equal(stock.attempts.length, 2);
        assert.equal(stock.attempts[0]!.reason, "ABSENT");
      },
    );
    await t.test(
      "return request and arrival do not restock; confirmed good receipt does",
      async () => {
        const before = await balance();
        stock = await s.requestReturn(cc, stock.id, {
          ...action(stock),
          agencyId: a.id,
        });
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        await assert.rejects(
          s.receiveReturn(ac, stock.id, {
            ...action(stock),
            condition: "GOOD",
            restock: true,
          }),
        );
        stock = await s.progress(ec, stock.id, {
          ...action(stock),
          event: "RETURN_STARTED",
        });
        stock = await s.progress(ec, stock.id, {
          ...action(stock),
          event: "RETURN_ARRIVED",
        });
        stock = await s.receiveReturn(ac, stock.id, {
          ...action(stock),
          condition: "GOOD",
          restock: true,
        });
        assert.equal(stock.custody.type, "AGENCY");
        assert.equal(stock.courierId, null);
        assert.equal(stock.order.status, "RETURNED");
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity + 2,
        );
        await assert.rejects(
          s.receiveReturn(ac, stock.id, {
            ...action(stock),
            condition: "GOOD",
            restock: true,
          }),
        );
      },
    );
    await t.test(
      "damaged physical return remains quarantined without available stock credit",
      async () => {
        let p = await pickup(true);
        const before = await balance();
        p = await s.requestReturn(cc, p.id, { ...action(p), agencyId: a.id });
        p = await s.progress(dc, p.id, {
          ...action(p),
          event: "RETURN_STARTED",
        });
        await assert.rejects(
          s.receiveReturn(ac, p.id, {
            ...action(p),
            condition: "DAMAGED",
            restock: true,
          }),
        );
        p = await s.receiveReturn(ac, p.id, {
          ...action(p),
          condition: "DAMAGED",
          restock: false,
        });
        assert.equal(p.phase, "QUARANTINED");
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        await assert.rejects(s.reintegrate(cc, p.id, action(p)));
        p = await s.returnShop(cc, p.id, action(p));
        assert.equal(p.custody.type, "SHOP");
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
      },
    );
    await t.test(
      "one-off parcel may be received into an agency without entering catalogue stock",
      async () => {
        let p = await pickup();
        p = await s.progress(dc, p.id, {
          ...action(p),
          event: "ARRIVED_AGENCY",
        });
        const before = await db.stockMovement.count();
        p = await s.receiveAgency(ac, p.id, {
          ...action(p),
          condition: "GOOD",
        });
        assert.equal(p.custody.type, "AGENCY");
        assert.equal(p.courierId, null);
        assert.equal(p.phase, "AT_AGENCY");
        assert.equal(await db.stockMovement.count(), before);
      },
    );
    await t.test(
      "inter-agency departure consumes stock once and destination receipt tracks custody",
      async () => {
        let p = await create(true);
        p = await s.prepare(ac, p.id, action(p));
        p = await s.createTransfer(ac, p.id, {
          ...action(p),
          destinationAgencyId: b.id,
          transporterId: d1.id,
        });
        const leg = p.legs.at(-1)!;
        const before = await balance();
        p = await s.dispatchTransfer(ac, p.id, leg.id, {
          ...action(p),
          legVersion: leg.version,
        });
        assert.equal(p.custody.type, "TRANSPORT");
        assert.equal(p.custody.userId, d1.id);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity - 2,
        );
        await assert.rejects(
          s.receiveTransfer(ac, p.id, leg.id, {
            ...action(p),
            condition: "GOOD",
            legVersion: p.legs.at(-1)!.version,
          }),
        );
        p = await s.receiveTransfer(bc, p.id, leg.id, {
          ...action(p),
          condition: "GOOD",
          legVersion: p.legs.at(-1)!.version,
        });
        assert.equal(p.agencyId, b.id);
        assert.equal(p.custody.type, "AGENCY");
        assert.equal(p.courierId, null);
        assert.equal(
          await db.stock.count({
            where: {
              companyId: company.id,
              agencyId: b.id,
              productId: product.id,
            },
          }),
          0,
        );
        p = await s.assign(bc, p.id, { ...action(p), courierId: d3.id });
        const after = await balance();
        p = await s.pickup(tc, p.id, action(p));
        assert.equal(
          (await balance()).physicalQuantity,
          after.physicalQuantity,
        );
        assert.equal(p.custody.userId, d3.id);
      },
    );
    await t.test(
      "several inter-agency legs retain chronological agency and transport history",
      async () => {
        let p = await pickup();
        p = await s.progress(dc, p.id, {
          ...action(p),
          event: "ARRIVED_AGENCY",
        });
        p = await s.receiveAgency(ac, p.id, {
          ...action(p),
          condition: "GOOD",
        });
        p = await s.createTransfer(ac, p.id, {
          ...action(p),
          destinationAgencyId: b.id,
          transporterId: d1.id,
        });
        let l = p.legs.at(-1)!;
        p = await s.dispatchTransfer(ac, p.id, l.id, {
          ...action(p),
          legVersion: l.version,
        });
        p = await s.receiveTransfer(bc, p.id, l.id, {
          ...action(p),
          condition: "GOOD",
          legVersion: p.legs.at(-1)!.version,
        });
        p = await s.createTransfer(bc, p.id, {
          ...action(p),
          destinationAgencyId: third.id,
          transporterId: d3.id,
        });
        l = p.legs.at(-1)!;
        p = await s.dispatchTransfer(bc, p.id, l.id, {
          ...action(p),
          legVersion: l.version,
        });
        p = await s.receiveTransfer({ ...bc, agencyId: third.id }, p.id, l.id, {
          ...action(p),
          condition: "GOOD",
          legVersion: p.legs.at(-1)!.version,
        });
        assert.equal(p.legs.filter((l) => l.status === "RECEIVED").length, 2);
        assert.equal(p.custody.agencyId, third.id);
        const history = await s.history(ac, p.id, v.query.parse({ size: 50 }));
        assert.ok(
          history.items.some((e) => e.action === "TRANSFER_DISPATCHED"),
        );
        assert.ok(
          history.items.every(
            (e, i, all) => i === 0 || e.createdAt >= all[i - 1]!.createdAt,
          ),
        );
        assert.ok(history.items.some((e) => e.fromCustody && e.toCustody));
      },
    );
    await t.test(
      "cross-company transport and unauthorized driver operations are refused",
      async () => {
        const p = await create();
        await assert.rejects(
          s.createTransfer(ac, p.id, {
            ...action(p),
            destinationAgencyId: foreign.id,
            transporterId: d1.id,
          }),
        );
        await assert.rejects(s.pickup(dc, one.id, action(one)));
        await assert.rejects(
          s.progress(dc, one.id, { ...action(one), event: "ARRIVED" }),
        );
      },
    );
    await t.test(
      "validated logistics events and delivery attempts are immutable",
      async () => {
        const events = await db.deliveryEvent.findMany({
          where: { deliveryId: stock.id },
        });
        assert.ok(events.length > 5);
        await assert.rejects(
          db.deliveryEvent.update({
            where: { id: events[0]!.id },
            data: { notes: "Changed" },
          }),
        );
        const attempt = await db.deliveryAttempt.findFirstOrThrow({
          where: { deliveryId: stock.id },
        });
        await assert.rejects(
          db.deliveryAttempt.update({
            where: { id: attempt.id },
            data: { notes: "Changed" },
          }),
        );
      },
    );
    await t.test(
      "pre-pickup cancellation releases stock, while pickup cannot be cancelled",
      async () => {
        let p = await assign(await create(true));
        const before = await balance();
        p = await s.cancel(ac, p.id, action(p));
        assert.equal(p.status, "CANCELLED");
        assert.equal(
          (await balance()).reservedQuantity,
          before.reservedQuantity - 2,
        );
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        await assert.rejects(s.cancel(cc, one.id, action(one)));
      },
    );
    await t.test(
      "expired subscription blocks new missions, assignments, pickup and retry",
      async () => {
        const p = await assign(await create());
        await db.subscription.update({
          where: { companyId: company.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await assert.rejects(
          s.create(cc, {
            orderId: p.orderId,
            orderVersion: 1,
            operationKey: randomUUID(),
          }),
        );
        await assert.rejects(
          s.assign(cc, p.id, { ...action(p), courierId: d2.id }, true),
        );
        await assert.rejects(s.pickup(dc, p.id, action(p)));
        await assert.rejects(s.retry(cc, one.id, action(one)));
        assert.ok((await s.list(dc, v.query.parse({}))).total > 0);
        await db.subscription.update({
          where: { companyId: company.id },
          data: { expiresAt: new Date(Date.now() + 86400000) },
        });
      },
    );
    await t.test(
      "previously picked up mission may fail and return safely after expiry without restocking",
      async () => {
        let p = await pickup(true);
        await db.subscription.update({
          where: { companyId: company.id },
          data: { expiresAt: new Date(p.pickedUpAt!.getTime() + 1) },
        });
        p = await s.attempt(dc, p.id, {
          ...action(p),
          result: "FAILED",
          kind: "TRANSPORT",
          reason: "Vehicle failure",
        });
        p = await s.requestReturn(cc, p.id, { ...action(p), agencyId: a.id });
        p = await s.progress(dc, p.id, {
          ...action(p),
          event: "RETURN_STARTED",
        });
        const before = await balance();
        await assert.rejects(
          s.receiveReturn(cc, p.id, {
            ...action(p),
            condition: "GOOD",
            restock: true,
          }),
        );
        p = await s.receiveReturn(cc, p.id, {
          ...action(p),
          condition: "GOOD",
          restock: false,
        });
        assert.equal(p.order.status, "RETURNED");
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        await db.subscription.update({
          where: { companyId: company.id },
          data: { expiresAt: new Date(Date.now() + 86400000) },
        });
        p = await s.reintegrate(cc, p.id, action(p));
        assert.ok(p.parcelReturn?.reintegratedAt);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity + 2,
        );
      },
    );
    await t.test(
      "outbox retains mission and major recipient notifications without sending in transaction",
      async () => {
        const notes = await db.notification.findMany({
          where: {
            companyId: company.id,
            sourceEvent: { startsWith: "DELIVERY_" },
          },
        });
        assert.ok(
          notes.some(
            (n) => n.channel === "PUSH" && n.recipientUserId === d1.id,
          ),
        );
        assert.ok(
          notes.some(
            (n) =>
              n.channel === "EMAIL" &&
              n.recipientAddress === "recipient@example.invalid",
          ),
        );
        assert.ok(notes.every((n) => n.status === "PENDING"));
        assert.ok(
          notes.every(
            (n) => !JSON.stringify(n.payload).includes("Recipient address"),
          ),
        );
      },
    );
    await t.test(
      "notification failures preserve missions and retry, with push waiting for infrastructure",
      async () => {
        const row = await db.notification.findFirstOrThrow({
          where: {
            companyId: company.id,
            channel: "EMAIL",
            recipientUserId: d1.id,
            sourceEvent: { startsWith: "DELIVERY_" },
          },
        });
        const push = await db.notification.findFirstOrThrow({
          where: {
            companyId: company.id,
            channel: "PUSH",
            sourceEvent: { startsWith: "DELIVERY_" },
          },
        });
        await db.notification.update({
          where: { id: row.id },
          data: { availableAt: new Date(0) },
        });
        const worker = new DeliveryNotifications(s,()=>new Date(),company.id);
        const failed = await worker.run(
          {
            send: async () => {
              throw Error("SMTP unavailable");
            },
          },
          1,
        );
        assert.equal(failed.failed, 1);
        assert.equal(
          (await db.notification.findUniqueOrThrow({ where: { id: row.id } }))
            .status,
          "FAILED",
        );
        assert.equal(
          (await db.notification.findUniqueOrThrow({ where: { id: push.id } }))
            .attempts,
          0,
        );
        await db.notification.update({
          where: { id: row.id },
          data: { availableAt: new Date(0) },
        });
        const sent = await worker.run(
          {
            send: async (_to, _subject, text) => {
              assert.ok(!/OTP|Recipient address|password|token/i.test(text));
            },
          },
          1,
        );
        assert.equal(sent.sent, 1);
        await db.notification.update({
          where: { id: push.id },
          data: { availableAt: new Date(0) },
        });
        let pushed = false;
        await worker.run(
          {
            send: async () => {},
            push: async (userId, payload) => {
              pushed = true;
              assert.ok(userId);
              assert.ok(payload.deliveryId);
            },
          },
          1,
        );
        assert.ok(pushed);
        assert.equal(
          (await db.notification.findUniqueOrThrow({ where: { id: push.id } }))
            .status,
          "SENT",
        );
      },
    );
    await t.test(
      "transport incident can return to its real origin before physical restocking",
      async () => {
        let p = await create(true);
        p = await s.prepare(ac, p.id, action(p));
        p = await s.createTransfer(ac, p.id, {
          ...action(p),
          destinationAgencyId: b.id,
          transporterId: d1.id,
        });
        const leg = p.legs.at(-1)!;
        p = await s.dispatchTransfer(ac, p.id, leg.id, {
          ...action(p),
          legVersion: leg.version,
        });
        const before = await balance();
        p = await s.incident(dc, p.id, {
          ...action(p),
          kind: "TRANSPORT",
          description: "Road closed; parcel returning to origin",
          blocking: true,
        });
        p = await s.receiveTransfer(ac, p.id, leg.id, {
          ...action(p),
          condition: "GOOD",
          legVersion: p.legs.at(-1)!.version,
          returnToOrigin: true,
        });
        assert.equal(p.legs.at(-1)!.receivedAgencyId, a.id);
        assert.equal(p.legs.at(-1)!.returnedToOrigin, true);
        assert.equal(p.custody.agencyId, a.id);
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity,
        );
        const incident = p.incidents.find((i) => i.status === "OPEN")!;
        p = await s.resolveIncident(ac, p.id, incident.id, {
          ...action(p),
          incidentVersion: incident.version,
          decision: "RETURN",
          agencyId: a.id,
        });
        p = await s.receiveReturn(ac, p.id, {
          ...action(p),
          condition: "GOOD",
          restock: true,
        });
        assert.equal(
          (await balance()).physicalQuantity,
          before.physicalQuantity + 2,
        );
        assert.equal(p.order.status, "RETURNED");
      },
    );
    await t.test(
      "pending handover can be cancelled safely to unblock an already picked up parcel after expiry",
      async () => {
        let p = await pickup();
        p = await s.assign(cc, p.id, { ...action(p), courierId: d2.id }, true);
        const h = p.handovers.at(-1)!;
        await db.subscription.update({
          where: { companyId: company.id },
          data: { expiresAt: new Date(p.pickedUpAt!.getTime() + 1) },
        });
        try {
          await assert.rejects(
            s.progress(dc, p.id, { ...action(p), event: "DEPARTED" }),
          );
          p = await s.cancelHandover(cc, p.id, h.id, action(p));
          assert.equal(p.custody.userId, d1.id);
          assert.equal(p.handovers.at(-1)!.status, "CANCELLED");
          p = await s.requestReturn(cc, p.id, { ...action(p), agencyId: a.id });
          p = await s.progress(dc, p.id, {
            ...action(p),
            event: "RETURN_STARTED",
          });
          p = await s.receiveReturn(cc, p.id, {
            ...action(p),
            condition: "GOOD",
            restock: false,
          });
          assert.equal(p.order.status, "RETURNED");
        } finally {
          await db.subscription.update({
            where: { companyId: company.id },
            data: { expiresAt: new Date(Date.now() + 86400000) },
          });
        }
      },
    );
    await t.test(
      "an agency holding a quarantined parcel cannot disappear from operational blockers",
      async () => {
        const f = await agency(company.id, "Physical return only");
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { allowedAgencyIds: [a.id, b.id, third.id, f.id] },
        });
        await db.agencyMembership.create({
          data: {
            companyId: company.id,
            agencyId: f.id,
            userId: d1.id,
            roleId: await role("courier"),
          },
        });
        const o = await orders.create(sc, orderInput(false, company.id, f.id));
        let p = await s.create(cc, {
          orderId: o.id,
          orderVersion: o.version,
          operationKey: randomUUID(),
        });
        p = await assign(p);
        const fc = { ...dc, agencyId: f.id };
        p = await s.pickup(fc, p.id, action(p));
        p = await s.requestReturn(cc, p.id, { ...action(p), agencyId: f.id });
        p = await s.progress(fc, p.id, {
          ...action(p),
          event: "RETURN_STARTED",
        });
        p = await s.receiveReturn(cc, p.id, {
          ...action(p),
          condition: "DAMAGED",
          restock: false,
        });
        const blockers = await db.$transaction((tx) =>
          agencyBlockers(tx, company.id, f.id),
        );
        assert.equal(blockers.deliveries, 1);
        assert.equal(blockers.stock, 0);
        assert.equal(blockers.orders, 0);
        assert.equal(p.phase, "QUARANTINED");
      },
    );
    await t.test(
      "a collection incident can be resolved for a fresh authorized pickup without stock effects",
      async () => {
        let p = await assign(await create());
        const before = await db.stockMovement.count();
        p = await s.incident(dc, p.id, {
          ...action(p),
          kind: "TRANSPORT",
          description: "Collection postponed before any physical handover",
          blocking: true,
        });
        const incident = p.incidents.find((i) => i.status === "OPEN")!;
        p = await s.resolveIncident(ac, p.id, incident.id, {
          ...action(p),
          incidentVersion: incident.version,
          decision: "RETRY",
        });
        assert.equal(p.phase, "WAITING_COLLECTION");
        assert.equal(p.custody.type, "SHOP");
        assert.equal(p.order.status, "CONFIRMED");
        p = await s.pickup(dc, p.id, action(p));
        assert.equal(p.custody.userId, d1.id);
        assert.equal(await db.stockMovement.count(), before);
      },
    );
  } finally {
    await db.$disconnect();
  }
});
