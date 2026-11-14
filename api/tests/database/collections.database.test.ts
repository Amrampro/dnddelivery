import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import { FinancialService } from "../../src/modules/collections/service.js";
import { FinancialNotifications } from "../../src/modules/collections/notifications.js";
import { OrderService } from "../../src/modules/orders/service.js";
import { DeliveryService } from "../../src/modules/deliveries/service.js";
import { OrganizationService } from "../../src/modules/organization/service.js";
import { financialBlockers } from "../../src/modules/collections/protection.js";
import { localSmtp } from "../helpers/local-smtp.js";
import { subscriptionMailer } from "../../src/modules/auth/smtp.js";
import { creation } from "../../src/modules/orders/validation.js";
import * as v from "../../src/modules/collections/validation.js";
import type { Context } from "../../src/modules/collections/access.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL operational finance: exact declarations, reserved remittances, independent receipts and immutable corrections", async (t) => {
  const db = createDatabase(url),
    s = new FinancialService(db),
    d = new DeliveryService(db),
    orders = new OrderService(db),
    suffix = randomUUID().slice(0, 8);
  try {
    const role = async (code: string) =>
      (await db.role.findUniqueOrThrow({ where: { code } })).id;
    const user = async (name: string) =>
      db.user.create({
        data: {
          email: `fin-${name}-${suffix}@example.invalid`,
          fullName: name,
          passwordHash: "Not a login fixture",
        },
      });
    const admin = await user("admin"),
      approver = await user("approver"),
      manager = await user("manager"),
      peerManager = await user("manager-B"),
      courier = await user("courier"),
      peer = await user("courier-peer"),
      alien = await user("courier-foreign"),
      owner = await user("owner"),
      otherOwner = await user("other-owner");
    const contact = {
      email: "finance@example.invalid",
      phone: "+237699123456",
      address: "Recipe address",
      countryCode: "CM",
      city: "Douala",
    };
    const company = await db.company.create({
        data: {
          ...contact,
          reference: `FIN-${suffix}`,
          name: "Finance carrier",
          status: "ACTIVE",
        },
      }),
      other = await db.company.create({
        data: {
          ...contact,
          reference: `FIN-X-${suffix}`,
          name: "Other finance carrier",
          status: "ACTIVE",
        },
      });
    const agency = async (companyId: string, reference: string) =>
      db.agency.create({
        data: { ...contact, companyId, reference, name: "Agency " + reference },
      });
    const a = await agency(company.id, "A"),
      b = await agency(company.id, "B"),
      foreign = await agency(other.id, "X");
    for (const u of [admin, approver])
      for (const companyId of [company.id, other.id])
        await db.companyMembership.create({
          data: {
            companyId,
            userId: u.id,
            roleId: await role("company_admin"),
          },
        });
    for (const [u, companyId, ids, code] of [
      [manager, company.id, [a.id], "agency_manager"],
      [peerManager, company.id, [b.id], "agency_manager"],
      [courier, company.id, [a.id, b.id], "courier"],
      [peer, company.id, [a.id], "courier"],
      [alien, other.id, [foreign.id], "courier"],
    ] as const) {
      await db.companyMembership.create({
        data: {
          companyId,
          userId: u.id,
          roleId: await role("company_member"),
          ...(code === "courier" ? { organizationRole: "courier" } : {}),
        },
      });
      for (const agencyId of ids)
        await db.agencyMembership.create({
          data: { companyId, agencyId, userId: u.id, roleId: await role(code) },
        });
      if (code === "courier")
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
          reference: `FIN-S-${suffix}`,
          name: "Finance shop",
          email: owner.email,
          phone: contact.phone,
          address: contact.address,
        },
      }),
      secretShop = await db.shop.create({
        data: {
          reference: `FIN-SS-${suffix}`,
          name: "Private shop",
          email: otherOwner.email,
          phone: contact.phone,
          address: contact.address,
        },
      });
    for (const [u, sh] of [
      [owner, shop],
      [otherOwner, secretShop],
    ] as const)
      await db.shopMembership.create({
        data: { shopId: sh.id, userId: u.id, roleId: await role("shop_owner") },
      });
    for (const companyId of [company.id, other.id])
      await db.companyShop.create({
        data: {
          companyId,
          shopId: shop.id,
          status: "ACTIVE",
          allowedAgencyIds:
            companyId === company.id ? [a.id, b.id] : [foreign.id],
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
    const cc: Context = {
        actorId: admin.id,
        scope: "COMPANY",
        companyId: company.id,
      },
      vc: Context = { ...cc, actorId: approver.id },
      ac: Context = {
        actorId: manager.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: a.id,
      },
      bc: Context = {
        actorId: peerManager.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: b.id,
      },
      dc: Context = {
        actorId: courier.id,
        scope: "AGENCY",
        companyId: company.id,
        agencyId: a.id,
      },
      ec: Context = { ...dc, actorId: peer.id },
      sc: Context = { actorId: owner.id, scope: "SHOP", shopId: shop.id },
      xc: Context = {
        actorId: alien.id,
        scope: "AGENCY",
        companyId: other.id,
        agencyId: foreign.id,
      };
    const key = () => randomUUID(),
      action = (p: { version: number }) => ({
        version: p.version,
        operationKey: key(),
        reason: "Financial recipe decision",
      });
    const fresh = async (
      expected = "25000",
      currency = "XAF",
      driver = courier.id,
      agencyId = a.id,
      engage = true,
    ) => {
      const o = await orders.create(
        sc,
        creation.parse({
          companyId: company.id,
          shopId: shop.id,
          agencyId,
          clientKey: key(),
          type: "ONE_OFF",
          recipient: {
            name: "Financial recipient",
            email: "recipient@example.invalid",
            phone: "+237699123456",
            country: "Cameroun",
            city: "Douala",
            address: "Recipe destination",
          },
          items: [{ name: "Parcel", quantity: 1 }],
          pickup: {
            address: "Shop collection",
            contact: "Owner",
            phone: contact.phone,
          },
          parcelDescription: "Sealed recipe parcel",
          collectionRequired: expected !== "0",
          amountToCollect: expected,
          currency,
        }),
      );
      let p = await d.create(cc, {
        orderId: o.id,
        orderVersion: o.version,
        operationKey: key(),
      });
      p = await d.assign(cc, p.id, { ...action(p), courierId: driver });
      if (engage) {
        const c = { ...dc, actorId: driver, agencyId };
        p = await d.pickup(c, p.id, action(p));
        p = await d.progress(c, p.id, {
          ...action(p),
          event: "FINAL_DISTRIBUTION",
        });
      }
      return p;
    };
    const declare = async (
      p: { id: string },
      value: string,
      c = dc,
      extra: Record<string, unknown> = {},
    ) => {
      const current = await d.detail(c, p.id);
      return s.declare(
        c,
        v.declaration.parse({
          deliveryId: p.id,
          deliveryVersion: current.version,
          operationKey: key(),
          amount: value,
          method: "CASH",
          ...extra,
        }),
      );
    };
    const remit = async (
      items: Array<{ collectionId: string; amount: string }>,
      c = dc,
      currency = "XAF",
    ) =>
      s.createRemittance(
        c,
        v.remittance.parse({
          agencyId: c.agencyId,
          currency,
          operationKey: key(),
          items,
        }),
      );
    const confirm = async (
      r: Awaited<ReturnType<typeof remit>>,
      c = ac,
      decision = "CONFIRM",
      values?: string[],
    ) =>
      s.decideRemittance(
        c,
        r.id,
        v.decision.parse({
          ...action(r),
          decision,
          items: ["CONFIRM", "DISPUTE"].includes(decision)
            ? r.items.map((i, n) => ({
                id: i.id,
                confirmedAmount: values?.[n] ?? i.declaredAmount,
              }))
            : [],
        }),
      );
    const entry = async (id: string, c = dc) => {
      const result = await s.collection(c, id);
      if (result.kind === "shop")
        throw Error("Internal ledger assertion requires a courier or operator");
      return result.entry;
    };
    const current = async (id: string) =>
      db.delivery.findUniqueOrThrow({ where: { id } });
    const obligation = async (id: string, c = cc) =>
      (await s.obligations(c, { page: 1, size: 50 })).items.find(
        (x) => x.id === id,
      )!;
    let main!: Awaited<ReturnType<typeof fresh>>,
      first!: Awaited<ReturnType<typeof declare>>,
      second!: Awaited<ReturnType<typeof declare>>;
    await t.test(
      "an obligation creates no declaration on assignment and a no-collection order refuses money",
      async () => {
        const p = await fresh("0");
        assert.equal((await obligation(p.order.id)).state, "NOT_REQUIRED");
        await assert.rejects(declare(p, "1"));
        assert.equal(
          await db.collection.count({ where: { deliveryId: p.id } }),
          0,
        );
        main = await fresh();
        assert.equal((await obligation(main.order.id)).state, "PENDING");
        assert.equal(
          await db.collection.count({ where: { deliveryId: main.id } }),
          0,
        );
        const assignment = await db.deliveryAssignment.findFirstOrThrow({
          where: { deliveryId: main.id, activeSlot: 1 },
        });
        assert.equal(
          assignment.expectedAmountSnapshot?.toFixed(4),
          "25000.0000",
        );
      },
    );
    await t.test(
      "partial, complete and multiple declarations preserve every receipt and exact remaining amount",
      async () => {
        first = await declare(main, "20000");
        let o = await obligation(main.order.id);
        assert.equal(o.state, "PARTIAL");
        assert.equal(o.remaining, "5000.0000");
        assert.equal(o.disputed, true);
        second = await declare(main, "5000");
        o = await obligation(main.order.id);
        assert.equal(o.state, "DECLARED_COMPLETE");
        assert.equal(o.remaining, "0.0000");
        assert.equal(
          await db.collection.count({ where: { deliveryId: main.id } }),
          2,
        );
        assert.equal((await current(main.id)).status, "IN_PROGRESS");
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: main.id } }),
          0,
        );
      },
    );
    await t.test(
      "zero requires a reason and excess is recorded as an explicit discrepancy",
      async () => {
        const p = await fresh("1000");
        await assert.rejects(declare(p, "0"));
        const x = await declare(p, "0", dc, {
          reason: "Recipient paid nothing",
        });
        assert.equal((await obligation(p.order.id)).state, "NONE_RECEIVED");
        await assert.rejects(declare(p, "1100"));
        const y = await declare(p, "1100", dc, {
          reason: "External overpayment received",
        });
        assert.equal((await obligation(p.order.id)).excess, "100.0000");
        assert.equal(
          await db.financialDiscrepancy.count({
            where: { collectionId: { in: [x.entry.id, y.entry.id] } },
          }),
          2,
        );
      },
    );
    await t.test(
      "another driver, foreign company, unpicked mission and transport-only stage cannot collect",
      async () => {
        await assert.rejects(declare(main, "1", ec));
        await assert.rejects(
          s.declare(
            xc,
            v.declaration.parse({
              deliveryId: main.id,
              deliveryVersion: main.version,
              operationKey: key(),
              amount: "1",
              method: "CASH",
            }),
          ),
        );
        const p = await fresh("1000", "XAF", courier.id, a.id, false);
        await assert.rejects(declare(p, "1000"));
        const physical = await d.pickup(dc, p.id, action(p));
        await assert.rejects(declare(physical, "1000"));
      },
    );
    await t.test(
      "idempotency survives mobile retry and rejects different content under the same key",
      async () => {
        const p = await fresh("0.3000", "USD"),
          input = v.declaration.parse({
            deliveryId: p.id,
            deliveryVersion: p.version,
            operationKey: key(),
            amount: "0.1000",
            method: "BANK_TRANSFER",
          });
        const results = await Promise.all([
          s.declare(dc, input),
          s.declare(dc, input),
        ]);
        assert.equal(results[0].entry.id, results[1].entry.id);
        assert.equal(
          await db.collection.count({ where: { deliveryId: p.id } }),
          1,
        );
        await assert.rejects(s.declare(dc, { ...input, amount: "0.2" }));
        await declare(p, "0.2000");
        assert.equal((await obligation(p.order.id)).declared, "0.3000");
      },
    );
    await t.test(
      "amount validation refuses floats, exponent notation, negatives and oversized values",
      () => {
        for (const value of [1.2, "1e3", "-1", "0.00001", "1000000000000000"]) {
          assert.equal(v.money.safeParse(value).success, false);
        }
      },
    );
    await t.test(
      "declared remittance reserves selected funds but does not reduce the driver liability",
      async () => {
        const r = await remit([
          { collectionId: first.entry.id, amount: "15000" },
          { collectionId: second.entry.id, amount: "3000" },
        ]);
        const a1 = await entry(first.entry.id);
        assert.equal("liability" in a1 && a1.liability, "20000.0000");
        assert.equal("available" in a1 && a1.available, "5000.0000");
        assert.equal("confirmed" in a1 && a1.confirmed, "0.0000");
        const done = await confirm(r);
        assert.equal(done.confirmedAmount, "18000.0000");
        assert.equal(done.status, "CONFIRMED");
        const left = await entry(first.entry.id);
        assert.equal("liability" in left && left.liability, "5000.0000");
        const tail = await remit([
          { collectionId: first.entry.id, amount: "5000" },
          { collectionId: second.entry.id, amount: "2000" },
        ]);
        await confirm(tail);
        assert.equal(
          "liability" in (await entry(first.entry.id)) &&
            ((await entry(first.entry.id)) as { liability: string }).liability,
          "0.0000",
        );
      },
    );
    await t.test(
      "two concurrent remittances cannot allocate the same available money twice",
      async () => {
        const p = await fresh("10000"),
          x = await declare(p, "10000"),
          results = await Promise.allSettled([
            remit([{ collectionId: x.entry.id, amount: "7000" }]),
            remit([{ collectionId: x.entry.id, amount: "7000" }]),
          ]);
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        assert.equal(results.filter((x) => x.status === "rejected").length, 1);
        const e = await entry(x.entry.id);
        assert.equal("reserved" in e && e.reserved, "7000.0000");
        assert.equal("liability" in e && e.liability, "10000.0000");
      },
    );
    await t.test(
      "duplicate remittance creation and confirmation retry do not double count receipts",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          input = v.remittance.parse({
            agencyId: a.id,
            currency: "XAF",
            operationKey: key(),
            items: [{ collectionId: x.entry.id, amount: "1000" }],
          }),
          [r, r2] = await Promise.all([
            s.createRemittance(dc, input),
            s.createRemittance(dc, input),
          ]);
        assert.equal(r.id, r2.id);
        const body = v.decision.parse({
          ...action(r),
          decision: "CONFIRM",
          items: r.items.map((i) => ({
            id: i.id,
            confirmedAmount: i.declaredAmount,
          })),
        });
        const replies = await Promise.all([
          s.decideRemittance(ac, r.id, body),
          s.decideRemittance(ac, r.id, body),
        ]);
        assert.equal(replies[0].confirmedAmount, "1000.0000");
        await assert.rejects(
          s.decideRemittance(ac, r.id, { ...body, operationKey: key() }),
        );
        assert.equal(
          "confirmed" in (await entry(x.entry.id)) &&
            ((await entry(x.entry.id)) as { confirmed: string }).confirmed,
          "1000.0000",
        );
      },
    );
    await t.test(
      "the declaring courier cannot confirm even with a second supervisory role",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await remit([{ collectionId: x.entry.id, amount: "1000" }]);
        const original = await db.agencyMembership.findUniqueOrThrow({
          where: {
            companyId_agencyId_userId: {
              companyId: company.id,
              agencyId: a.id,
              userId: courier.id,
            },
          },
        });
        const dual = await db.role.create({
          data: {
            code: "fin-dual-" + suffix,
            name: "Separation test role",
            scope: "AGENCY",
          },
        });
        for (const code of [
          "workspace.access",
          "financial.supervise.read",
          "remittances.confirm",
        ])
          await db.rolePermission.create({
            data: {
              roleId: dual.id,
              permissionId: (
                await db.permission.findUniqueOrThrow({ where: { code } })
              ).id,
            },
          });
        await db.agencyMembership.update({
          where: { id: original.id },
          data: { roleId: dual.id },
        });
        try {
          await assert.rejects(confirm(r, dc), /propre remise/);
        } finally {
          await db.agencyMembership.update({
            where: { id: original.id },
            data: { roleId: original.roleId },
          });
        }
      },
    );
    await t.test(
      "the agency receives line-level actual amounts and shortage remains owed",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await remit([{ collectionId: x.entry.id, amount: "800" }]);
        await assert.rejects(confirm(r, ac, "CONFIRM", ["600"]));
        const received = await confirm(r, ac, "DISPUTE", ["600"]);
        assert.equal(received.confirmedAmount, "600.0000");
        assert.equal(received.status, "DISPUTED");
        const e = await entry(x.entry.id);
        assert.equal("liability" in e && e.liability, "400.0000");
        assert.equal("reserved" in e && e.reserved, "0.0000");
        assert.equal(
          await db.financialDiscrepancy.count({
            where: { remittanceId: r.id, kind: "SHORT_REMITTANCE" },
          }),
          1,
        );
        await assert.rejects(
          remit([{ collectionId: x.entry.id, amount: "401" }]),
        );
      },
    );
    await t.test(
      "a received excess is bounded by real unallocated funds, never a fabricated balance",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await remit([{ collectionId: x.entry.id, amount: "500" }]);
        await assert.rejects(confirm(r, ac, "DISPUTE", ["1001"]));
        const done = await confirm(r, ac, "DISPUTE", ["700"]);
        assert.equal(done.confirmedAmount, "700.0000");
        assert.equal(
          "liability" in (await entry(x.entry.id)) &&
            ((await entry(x.entry.id)) as { liability: string }).liability,
          "300.0000",
        );
      },
    );
    await t.test(
      "rejection or correction request releases allocation without pretending funds were received",
      async () => {
        for (const decision of ["REJECT", "REQUEST_CORRECTION"]) {
          const p = await fresh("1000"),
            x = await declare(p, "1000"),
            r = await remit([{ collectionId: x.entry.id, amount: "1000" }]);
          await confirm(r, ac, decision);
          const e = await entry(x.entry.id);
          assert.equal("available" in e && e.available, "1000.0000");
          assert.equal("confirmed" in e && e.confirmed, "0.0000");
        }
      },
    );
    await t.test(
      "currency, agency, courier and collection ownership cannot be mixed in a remittance",
      async () => {
        const p = await fresh("1000", "EUR"),
          x = await declare(p, "1000");
        await assert.rejects(
          remit([{ collectionId: x.entry.id, amount: "1000" }]),
        );
        await assert.rejects(
          remit([{ collectionId: x.entry.id, amount: "1000" }], ec, "EUR"),
        );
        await assert.rejects(
          s.createRemittance(
            dc,
            v.remittance.parse({
              agencyId: b.id,
              currency: "EUR",
              operationKey: key(),
              items: [{ collectionId: x.entry.id, amount: "1000" }],
            }),
          ),
        );
        const r = await remit(
          [{ collectionId: x.entry.id, amount: "1000" }],
          dc,
          "EUR",
        );
        await assert.rejects(confirm(r, bc));
        await assert.rejects(s.remittance(xc, r.id));
      },
    );
    await t.test(
      "collection correction requires a distinct approver and keeps the immutable original",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "900"),
          request = await s.requestCorrection(
            dc,
            v.correction.parse({
              kind: "COLLECTION",
              collectionId: x.entry.id,
              amount: "800",
              reason: "Original entry was mistyped",
              operationKey: key(),
            }),
          );
        assert.equal(
          "gross" in (await entry(x.entry.id)) &&
            ((await entry(x.entry.id)) as { gross: string }).gross,
          "900.0000",
        );
        await assert.rejects(
          remit([{ collectionId: x.entry.id, amount: "100" }]),
        );
        await assert.rejects(
          s.decideCorrection(dc, request.id, {
            ...action(request),
            approve: true,
          }),
        );
        await s.decideCorrection(cc, request.id, {
          ...action(request),
          approve: true,
        });
        const e = await entry(x.entry.id);
        assert.equal("gross" in e && e.gross, "800.0000");
        assert.equal(
          (
            await db.collection.findUniqueOrThrow({ where: { id: x.entry.id } })
          ).declaredAmount?.toFixed(4),
          "900.0000",
        );
        await assert.rejects(
          s.decideCorrection(cc, request.id, {
            ...action(request),
            approve: true,
          }),
        );
      },
    );
    await t.test(
      "an administrator cannot approve their own request, and corrections cannot erase remitted money",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await remit([{ collectionId: x.entry.id, amount: "700" }]);
        await confirm(r);
        await assert.rejects(
          s.requestCorrection(
            cc,
            v.correction.parse({
              kind: "COLLECTION",
              collectionId: x.entry.id,
              amount: "600",
              reason: "Invalid reduction below received money",
              operationKey: key(),
            }),
          ),
        );
        const request = await s.requestCorrection(
          cc,
          v.correction.parse({
            kind: "COLLECTION",
            collectionId: x.entry.id,
            amount: "900",
            reason: "Administrative data correction",
            operationKey: key(),
          }),
        );
        await assert.rejects(
          s.decideCorrection(cc, request.id, {
            ...action(request),
            approve: true,
          }),
        );
        await s.decideCorrection(vc, request.id, {
          ...action(request),
          approve: true,
        });
      },
    );
    await t.test(
      "receipt corrections preserve the decided remittance and adjust the exact driver liability",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await confirm(
            await remit([{ collectionId: x.entry.id, amount: "800" }]),
          );
        const request = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "RECEIPT",
            remittanceItemId: r.items[0]!.id,
            amount: "700",
            reason: "Counted receipt was overstated",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(cc, request.id, {
          ...action(request),
          approve: true,
        });
        assert.equal(
          (await s.remittance(cc, r.id)).confirmedAmount,
          "800.0000",
        );
        assert.equal(
          (await s.remittance(cc, r.id)).items[0]!.effectiveConfirmed,
          "700.0000",
        );
        const e = await entry(x.entry.id);
        assert.equal("liability" in e && e.liability, "300.0000");
      },
    );
    await t.test(
      "failed delivery retains money and an approved external refund reduces only the documented funds",
      async () => {
        let p = await fresh("1000");
        const x = await declare(p, "1000");
        p = await d.attempt(dc, p.id, {
          ...action(p),
          result: "FAILED",
          kind: "REFUSED",
        });
        assert.equal(
          "gross" in (await entry(x.entry.id)) &&
            ((await entry(x.entry.id)) as { gross: string }).gross,
          "1000.0000",
        );
        const refund = await s.requestCorrection(
          dc,
          v.correction.parse({
            kind: "REFUND",
            collectionId: x.entry.id,
            amount: "300",
            externalReference: "Physical refund acknowledged in recipe",
            reason: "Refund already performed outside platform",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(cc, refund.id, {
          ...action(refund),
          approve: true,
        });
        const e = await entry(x.entry.id);
        assert.equal("refunded" in e && e.refunded, "300.0000");
        assert.equal("liability" in e && e.liability, "700.0000");
        assert.equal((await current(p.id)).status, "FAILED");
        await assert.rejects(
          s.requestCorrection(
            dc,
            v.correction.parse({
              kind: "REFUND",
              collectionId: x.entry.id,
              amount: "701",
              externalReference: "No funds",
              reason: "Exceeds remaining cash",
              operationKey: key(),
            }),
          ),
        );
      },
    );
    await t.test(
      "expected amount changes before pickup are reviewed and after pickup require explicit exception authority",
      async () => {
        let p = await fresh("1000", "XAF", courier.id, a.id, false);
        const request = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "EXPECTED",
            deliveryId: p.id,
            amount: "1200",
            reason: "Shop instruction corrected before pickup",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(cc, request.id, {
          ...action(request),
          approve: true,
        });
        assert.equal(
          (
            await db.order.findUniqueOrThrow({ where: { id: p.order.id } })
          ).amountToCollect.toFixed(4),
          "1200.0000",
        );
        p = await d.detail(cc, p.id);
        p = await d.pickup(dc, p.id, action(p));
        p = await d.progress(dc, p.id, {
          ...action(p),
          event: "FINAL_DISTRIBUTION",
        });
        await assert.rejects(
          s.requestCorrection(
            ac,
            v.correction.parse({
              kind: "EXPECTED",
              deliveryId: p.id,
              amount: "1300",
              reason: "Insufficient exceptional authority",
              operationKey: key(),
            }),
          ),
        );
        const exceptional = await s.requestCorrection(
          cc,
          v.correction.parse({
            kind: "EXPECTED",
            deliveryId: p.id,
            amount: "1300",
            reason: "Exceptional change after physical pickup",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(vc, exceptional.id, {
          ...action(exceptional),
          approve: true,
        });
        assert.equal((await current(p.id)).status, "IN_PROGRESS");
        assert.equal((await obligation(p.order.id)).expected, "1300.0000");
        await assert.rejects(
          s.declare(
            dc,
            v.declaration.parse({
              deliveryId: p.id,
              deliveryVersion: p.version,
              amount: "1300",
              method: "CASH",
              operationKey: key(),
            }),
          ),
        );
      },
    );
    await t.test(
      "partial-payment exception is explicit, does not erase remaining money and never supplies delivery proof",
      async () => {
        const p = await fresh("1000");
        await declare(p, "800");
        const request = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "EXCEPTION",
            deliveryId: p.id,
            amount: "0",
            reason: "Supervisor documents external shortfall exception",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(cc, request.id, {
          ...action(request),
          approve: true,
        });
        const o = await obligation(p.order.id);
        assert.equal(o.exception, true);
        assert.equal(o.remaining, "200.0000");
        assert.equal((await current(p.id)).status, "IN_PROGRESS");
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: p.id } }),
          0,
        );
      },
    );
    await t.test(
      "reassignment preserves the money with its actual collecting driver",
      async () => {
        let p = await fresh("1000");
        const x = await declare(p, "600");
        p = await d.assign(
          cc,
          p.id,
          { ...action(p), courierId: peer.id },
          true,
        );
        const h = p.handovers.find((h) => h.status === "PENDING")!;
        await d.confirmHandover(ec, p.id, h.id, {
          ...action(p),
          condition: "GOOD",
          handoverVersion: h.version,
        });
        p = await d.detail(ec, p.id);
        await declare(p, "400", ec);
        assert.equal(
          "liability" in (await entry(x.entry.id)) &&
            ((await entry(x.entry.id)) as { liability: string }).liability,
          "600.0000",
        );
        await assert.rejects(s.collection(ec, x.entry.id));
        await assert.rejects(declare(p, "1", dc));
        assert.equal((await obligation(p.order.id)).declared, "1000.0000");
      },
    );
    await t.test(
      "changing agency does not move funds and outstanding liabilities protect affiliations",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000");
        await assert.rejects(
          s.collection({ ...dc, agencyId: b.id }, x.entry.id),
        );
        const blocked = await db.$transaction((tx) =>
          financialBlockers(tx, company.id, a.id, courier.id),
        );
        assert.ok(blocked.count > 0);
        const organization = new OrganizationService(db);
        const member = await db.companyMembership.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: courier.id },
          },
        });
        await assert.rejects(
          organization.removeEmployee(
            { ...cc, companyId: company.id },
            courier.id,
            {
              version: member.version,
              reason: "Cannot abandon financial responsibility",
            },
          ),
        );
      },
    );
    await t.test(
      "shop reads only its order finances and never internal agency receipts or other shops",
      async () => {
        const own = await s.collection(sc, first.entry.id);
        assert.equal("liability" in own.entry, false);
        assert.equal("items" in own.entry, false);
        assert.equal("courierId" in own.entry, false);
        await assert.rejects(
          s.collection(
            { ...sc, actorId: otherOwner.id, shopId: secretShop.id },
            first.entry.id,
          ),
        );
        await assert.rejects(s.remittances(sc, { page: 1, size: 20 }));
        await assert.rejects(s.history(sc, { page: 1, size: 20 }));
        const summary = await s.overview(sc, { page: 1, size: 20 });
        assert.equal("confirmed" in summary.money[0]!, false);
        assert.equal("liability" in summary.money[0]!, false);
      },
    );
    await t.test(
      "discrepancies keep amount, author and resolution chronology without deleting debt",
      async () => {
        const report = await s.reportDiscrepancy(
            ac,
            v.discrepancy.parse({
              collectionId: first.entry.id,
              kind: "INPUT_ERROR",
              amount: "50",
              description: "Supervisor documents a financial review",
              operationKey: key(),
            }),
          ),
          item = report.items[0]!;
        const review = await s.resolveDiscrepancy(ac, item.id, {
            ...action(item),
            status: "REVIEW",
          }),
          resolved = await s.resolveDiscrepancy(ac, item.id, {
            ...action(review.items[0]!),
            status: "RESOLVED",
          });
        await s.resolveDiscrepancy(ac, item.id, {
          ...action(resolved.items[0]!),
          status: "CLOSED",
        });
        assert.equal(
          await db.financialEvent.count({
            where: { discrepancyId: item.id, action: "DISCREPANCY_RESOLVED" },
          }),
          3,
        );
        await assert.rejects(
          db.financialDiscrepancy.delete({ where: { id: item.id } }),
        );
      },
    );
    await t.test(
      "expiry permits settling existing funds and engaged collections but forbids a new commercial obligation",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "600"),
          unpicked = await fresh("1000", "XAF", courier.id, a.id, false),
          before = await current(p.id);
        await db.subscription.update({
          where: { companyId: company.id },
          data: {
            status: "EXPIRED",
            expiresAt: new Date(before.pickedUpAt!.getTime() + 1),
          },
        });
        try {
          await declare(p, "400");
          const r = await remit([{ collectionId: x.entry.id, amount: "600" }]);
          await confirm(r);
          assert.equal(
            "liability" in (await entry(x.entry.id)) &&
              ((await entry(x.entry.id)) as { liability: string }).liability,
            "0.0000",
          );
          await assert.rejects(declare(unpicked, "1000"));
          await assert.rejects(
            s.requestCorrection(
              cc,
              v.correction.parse({
                kind: "EXPECTED",
                deliveryId: p.id,
                amount: "1500",
                reason: "No new commercial change after expiry",
                operationKey: key(),
              }),
            ),
          );
        } finally {
          await db.subscription.update({
            where: { companyId: company.id },
            data: {
              status: "ACTIVE",
              expiresAt: new Date(Date.now() + 86400000 * 20),
            },
          });
        }
      },
    );
    await t.test(
      "suspended courier cannot collect but can regularize already documented funds",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000");
        await db.driverProfile.update({
          where: {
            companyId_userId: { companyId: company.id, userId: courier.id },
          },
          data: { status: "SUSPENDED", availability: "UNAVAILABLE" },
        });
        try {
          await assert.rejects(
            declare(p, "1", dc, {
              reason: "Collection blocked while suspended",
            }),
          );
          const r = await remit([{ collectionId: x.entry.id, amount: "1000" }]);
          await confirm(r);
        } finally {
          await db.driverProfile.update({
            where: {
              companyId_userId: { companyId: company.id, userId: courier.id },
            },
            data: { status: "ACTIVE", availability: "AVAILABLE" },
          });
        }
      },
    );
    await t.test(
      "financial statements and decisions are immutable in MySQL and do not touch stocks",
      async () => {
        await assert.rejects(
          db.collection.update({
            where: { id: first.entry.id },
            data: { declaredAmount: "1" },
          }),
        );
        const decided = await db.remittance.findFirstOrThrow({
          where: { companyId: company.id, status: "CONFIRMED" },
        });
        await assert.rejects(
          db.remittance.update({
            where: { id: decided.id },
            data: { confirmedAmount: "1" },
          }),
        );
        const event = await db.financialEvent.findFirstOrThrow({
          where: { companyId: company.id },
        });
        await assert.rejects(
          db.financialEvent.update({
            where: { id: event.id },
            data: { reason: "erase history" },
          }),
        );
        await assert.rejects(
          db.financialEvent.delete({ where: { id: event.id } }),
        );
        assert.equal(
          await db.stockMovement.count({ where: { companyId: company.id } }),
          0,
        );
      },
    );
    await t.test(
      "notifications and audit are transactional, failed delivery never means money received by agency",
      async () => {
        assert.ok(
          await db.notification.count({
            where: {
              companyId: company.id,
              sourceEvent: "FINANCE_COLLECTION_DECLARED",
              channel: "PUSH",
              status: "PENDING",
            },
          }),
        );
        assert.ok(
          await db.auditLog.count({
            where: {
              companyId: company.id,
              action: "FINANCE_REMITTANCE_DECIDED",
            },
          }),
        );
        const history = await s.history(ac, { page: 1, size: 50 });
        assert.ok(history.items.length > 0);
        assert.equal(JSON.stringify(history).includes("operationKey"), false);
      },
    );
    await t.test(
      "SMTP failure keeps operations and retries; push stays pending without an adapter",
      async () => {
        // Restrict this worker recipe to its own notifications, preserving all unrelated jobs.
        const ids = (
          await db.notification.findMany({
            where: {
              companyId: company.id,
              sourceEvent: { startsWith: "FINANCE_" },
              channel: "EMAIL",
            },
            select: { id: true },
          })
        ).map((x) => x.id);
        assert.ok(ids.length);
        let now = new Date();
        const worker = new FinancialNotifications(s, () => now),
          beforeCount = await db.collection.count({
            where: { companyId: company.id },
          });
        const result = await worker.run(
          {
            send: async () => {
              throw Error("Local SMTP offline");
            },
          },
          1,
        );
        assert.equal(result.failed, 1);
        assert.equal(
          await db.collection.count({ where: { companyId: company.id } }),
          beforeCount,
        );
        now = new Date(now.getTime() + 60000);
        const sent = await worker.run({ send: async () => {} }, 1);
        assert.equal(sent.sent, 1);
        const pending = await db.notification.findFirstOrThrow({
          where: {
            companyId: company.id,
            channel: "PUSH",
            sourceEvent: { startsWith: "FINANCE_" },
          },
        });
        assert.equal(pending.status, "PENDING");
        assert.equal(pending.attempts, 0);
      },
    );
    await t.test(
      "approval after an intervening pickup cannot silently upgrade an ordinary expected-amount request",
      async () => {
        let p = await fresh("1000", "XAF", courier.id, a.id, false);
        const req = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "EXPECTED",
            deliveryId: p.id,
            amount: "1100",
            reason: "Requested before pickup",
            operationKey: key(),
          }),
        );
        p = await d.pickup(dc, p.id, action(p));
        await assert.rejects(
          s.decideCorrection(cc, req.id, { ...action(req), approve: true }),
          /exceptionnelle/,
        );
        await s.decideCorrection(cc, req.id, {
          ...action(req),
          approve: false,
        });
        assert.equal((await obligation(p.order.id)).expected, "1000.0000");
      },
    );
    await t.test(
      "concurrent correction requests freeze one source and preserve a single independent decision",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          body = v.correction.parse({
            kind: "COLLECTION",
            collectionId: x.entry.id,
            amount: "900",
            reason: "Correction requires independent review",
            operationKey: key(),
          });
        const results = await Promise.allSettled([
          s.requestCorrection(dc, body),
          s.requestCorrection(dc, { ...body, operationKey: key() }),
        ]);
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        const req = (
          await s.corrections(cc, { page: 1, size: 50, status: "PENDING" })
        ).items.find((r) => r.collectionId === x.entry.id)!;
        const decision = { ...action(req), approve: true };
        await s.decideCorrection(cc, req.id, decision);
        await s.decideCorrection(cc, req.id, decision);
        assert.equal((await entry(x.entry.id)).gross, "900.0000");
        assert.equal(
          await db.financialEvent.count({
            where: { correctionId: req.id, action: "CORRECTION_APPROVED" },
          }),
          1,
        );
        await assert.rejects(
          db.financialCorrection.update({
            where: { id: req.id },
            data: { toAmount: "1" },
          }),
        );
      },
    );
    await t.test(
      "a parcel transported to another agency keeps order ownership and collects in the actual financial agency",
      async () => {
        let p = await fresh("1000", "XAF", courier.id, a.id, false);
        p = await d.pickup(dc, p.id, action(p));
        p = await d.progress(dc, p.id, {
          ...action(p),
          event: "ARRIVED_AGENCY",
        });
        p = await d.receiveAgency(ac, p.id, {
          ...action(p),
          condition: "GOOD",
        });
        p = await d.createTransfer(ac, p.id, {
          ...action(p),
          destinationAgencyId: b.id,
          transporterId: courier.id,
        });
        let leg = p.legs.find((l) => l.status === "DRAFT")!;
        p = await d.dispatchTransfer(ac, p.id, leg.id, {
          ...action(p),
          legVersion: leg.version,
        });
        leg = p.legs.find((l) => l.id === leg.id)!;
        p = await d.receiveTransfer(bc, p.id, leg.id, {
          ...action(p),
          legVersion: leg.version,
          condition: "GOOD",
        });
        p = await d.assign(bc, p.id, { ...action(p), courierId: courier.id });
        const dbDriver = { ...dc, agencyId: b.id };
        p = await d.pickup(dbDriver, p.id, action(p));
        p = await d.progress(dbDriver, p.id, {
          ...action(p),
          event: "FINAL_DISTRIBUTION",
        });
        assert.ok(
          (await s.obligations(dbDriver, { page: 1, size: 50 })).items.some(
            (o) => o.id === p.order.id,
          ),
        );
        const x = await declare(p, "1000", dbDriver);
        assert.equal((await entry(x.entry.id, dbDriver)).agencyId, b.id);
        await assert.rejects(s.collection(ac, x.entry.id));
        await assert.rejects(
          remit([{ collectionId: x.entry.id, amount: "1000" }], dc),
        );
        const r = await remit(
          [{ collectionId: x.entry.id, amount: "1000" }],
          dbDriver,
        );
        await confirm(r, bc);
      },
    );
    await t.test(
      "shop history excludes internal receipt corrections while preserving customer collection totals",
      async () => {
        const correction = await db.financialCorrection.findFirstOrThrow({
          where: { companyId: company.id, kind: "RECEIPT", status: "APPROVED" },
        });
        const detail = await s.collection(sc, correction.collectionId!);
        assert.equal(
          detail.events.filter((e) => e.action === "CORRECTION_APPROVED")
            .length,
          0,
        );
        assert.equal(detail.entry.net, "1000.0000");
        assert.equal(JSON.stringify(detail).includes("700.0000"), false);
        assert.deepEqual(await s.notifications(sc), []);
      },
    );
    await t.test(
      "revoked supervisory role removes other drivers' notices both in-app and before SMTP delivery",
      async () => {
        const membership = await db.agencyMembership.findUniqueOrThrow({
          where: {
            companyId_agencyId_userId: {
              companyId: company.id,
              agencyId: a.id,
              userId: manager.id,
            },
          },
        });
        const notice = await db.notification.findFirstOrThrow({
          where: {
            companyId: company.id,
            recipientUserId: manager.id,
            channel: "EMAIL",
            status: "PENDING",
            sourceEvent: { startsWith: "FINANCE_" },
          },
        });
        await db.agencyMembership.update({
          where: { id: membership.id },
          data: { roleId: await role("courier") },
        });
        try {
          assert.deepEqual(await s.notifications(ac), []);
          await db.notification.update({
            where: { id: notice.id },
            data: { availableAt: new Date(0) },
          });
          const result = await new FinancialNotifications(s).run(
            {
              send: async () => {
                throw Error("A revoked notice must never be sent");
              },
            },
            1,
          );
          assert.equal(result.cancelled, 1);
          assert.equal(
            (
              await db.notification.findUniqueOrThrow({
                where: { id: notice.id },
              })
            ).status,
            "CANCELLED",
          );
        } finally {
          await db.agencyMembership.update({
            where: { id: membership.id },
            data: { roleId: membership.roleId },
          });
        }
      },
    );
    await t.test(
      "a real local SMTP sink receives a financial notice with one stable Message-ID",
      async () => {
        const messages: string[] = [],
          smtp = await localSmtp((message) => messages.push(message));
        try {
          const worker = new FinancialNotifications(
            s,
            () => new Date(Date.now() + 60000),
          );
          const result = await worker.run(
            subscriptionMailer({
              NODE_ENV: "test",
              SMTP_HOST: "127.0.0.1",
              SMTP_PORT: String(smtp.port),
              SMTP_FROM: "test@example.invalid",
              SMTP_USER: "",
              SMTP_PASSWORD: "",
              SMTP_SECURE: "false",
            }),
            1,
          );
          assert.equal(result.sent, 1);
          assert.equal(messages.length, 1);
          assert.match(
            messages[0]!,
            /Message-ID: <[0-9a-f-]+@dnd-delivery.invalid>/i,
          );
        } finally {
          await smtp.close();
        }
      },
    );
    await t.test(
      "an agency refund after receipt never recreates a courier debt or erases the historical receipt",
      async () => {
        const p = await fresh("1000"),
          x = await declare(p, "1000"),
          r = await confirm(
            await remit([{ collectionId: x.entry.id, amount: "1000" }]),
          );
        const body = v.correction.parse({
          kind: "AGENCY_REFUND",
          collectionId: x.entry.id,
          amount: "300",
          externalReference: "Agency refund physically acknowledged",
          reason: "Refund already paid externally by agency",
          operationKey: key(),
        });
        await assert.rejects(s.requestCorrection(dc, body));
        const req = await s.requestCorrection(ac, body);
        await s.decideCorrection(cc, req.id, { ...action(req), approve: true });
        const e = await entry(x.entry.id);
        assert.equal(e.refunded, "300.0000");
        assert.equal(e.agencyRefunded, "300.0000");
        assert.equal(e.courierRefunded, "0.0000");
        assert.equal(e.liability, "0.0000");
        assert.equal(e.confirmed, "1000.0000");
        assert.equal(e.agencyRetained, "700.0000");
        assert.equal(e.net, "700.0000");
        await assert.rejects(
          s.requestCorrection(ac, {
            ...body,
            amount: "701",
            operationKey: key(),
          }),
        );
        await assert.rejects(
          s.requestCorrection(
            ac,
            v.correction.parse({
              kind: "RECEIPT",
              remittanceItemId: r.items[0]!.id,
              amount: "200",
              reason: "Must not erase an already refunded receipt",
              operationKey: key(),
            }),
          ),
        );
        assert.equal(
          (await s.collection(sc, x.entry.id)).entry.net,
          "700.0000",
        );
        assert.equal(
          (await s.remittance(cc, r.id)).confirmedAmount,
          "1000.0000",
        );
      },
    );
    await t.test(
      "partial-payment exceptions are reviewed against the expected and actually declared snapshots",
      async () => {
        const p = await fresh("1000");
        await declare(p, "800");
        const req = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "EXCEPTION",
            deliveryId: p.id,
            amount: "0",
            reason: "Partial collection reviewed by supervisor",
            operationKey: key(),
          }),
        );
        assert.equal(req.fromAmount, "1000.0000");
        assert.equal(req.toAmount, "800.0000");
        await declare(p, "100");
        await assert.rejects(
          s.decideCorrection(cc, req.id, { ...action(req), approve: true }),
        );
        await s.decideCorrection(cc, req.id, {
          ...action(req),
          approve: false,
        });
        const next = await s.requestCorrection(
          ac,
          v.correction.parse({
            kind: "EXCEPTION",
            deliveryId: p.id,
            amount: "0",
            reason: "New snapshot reviewed after additional collection",
            operationKey: key(),
          }),
        );
        await s.decideCorrection(cc, next.id, {
          ...action(next),
          approve: true,
        });
        assert.equal((await obligation(p.order.id)).exception, true);
        await declare(p, "100");
        assert.equal((await obligation(p.order.id)).exception, false);
        assert.equal((await current(p.id)).status, "IN_PROGRESS");
      },
    );
  } finally {
    await db.$disconnect();
  }
});
