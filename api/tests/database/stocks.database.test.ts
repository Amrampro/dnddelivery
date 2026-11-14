import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { createDatabase } from "../../src/database/client.js";
import { StockService } from "../../src/modules/stocks/service.js";
import { createStockRouter } from "../../src/modules/stocks/routes.js";
import type { StockContext } from "../../src/modules/stocks/access.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { errors } from "../../src/middlewares/errors.js";
import * as v from "../../src/modules/stocks/validation.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL stock operations: exact custody, reservation concurrency, transfer receipts, inventory and isolation", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8),
    password = "Stock fixture password 2026",
    passwordHash = await hashPassword(password);
  const admin = await db.user.create({
      data: {
        email: `stock-admin-${suffix}@example.invalid`,
        fullName: "Stock company administrator",
        passwordHash,
      },
    }),
    stockUser = await db.user.create({
      data: {
        email: `stock-user-${suffix}@example.invalid`,
        fullName: "Stock keeper",
        passwordHash,
      },
    }),
    manager = await db.user.create({
      data: {
        email: `stock-manager-${suffix}@example.invalid`,
        fullName: "Agency supervisor",
        passwordHash,
      },
    }),
    owner = await db.user.create({
      data: {
        email: `stock-owner-${suffix}@example.invalid`,
        fullName: "Commercial owner",
        passwordHash,
      },
    });
  const companyRole = await db.role.findUniqueOrThrow({
      where: { code: "company_admin" },
    }),
    memberRole = await db.role.findUniqueOrThrow({
      where: { code: "company_member" },
    }),
    stockRole = await db.role.findUniqueOrThrow({
      where: { code: "stock_manager" },
    }),
    managerRole = await db.role.findUniqueOrThrow({
      where: { code: "agency_manager" },
    }),
    shopRole = await db.role.findUniqueOrThrow({
      where: { code: "shop_owner" },
    });
  const contact = {
    email: "stocks@example.invalid",
    phone: "0000000000",
    address: "Stock fixture address",
    city: "Douala",
    countryCode: "CM",
  };
  const company = await db.company.create({
      data: {
        ...contact,
        reference: "STOCK-" + suffix,
        name: "Custodian X " + suffix,
        status: "ACTIVE",
      },
    }),
    foreign = await db.company.create({
      data: {
        ...contact,
        reference: "STOCK-Y-" + suffix,
        name: "Custodian Y " + suffix,
        status: "ACTIVE",
      },
    });
  const plan = await db.subscriptionPlan.upsert({
    where: { referenceSlot: 1 },
    create: {
      code: "reference",
      name: "Reference test plan",
      referenceSlot: 1,
      active: true,
    },
    update: {},
  });
  for (const c of [company, foreign]) {
    await db.companyMembership.create({
      data: { companyId: c.id, userId: admin.id, roleId: companyRole.id },
    });
    await db.subscription.create({
      data: {
        companyId: c.id,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
  }
  const a = await db.agency.create({
      data: {
        ...contact,
        companyId: company.id,
        reference: "A",
        name: "Origin A",
      },
    }),
    b = await db.agency.create({
      data: {
        ...contact,
        companyId: company.id,
        reference: "B",
        name: "Destination B",
      },
    }),
    hidden = await db.agency.create({
      data: {
        ...contact,
        companyId: company.id,
        reference: "C",
        name: "Unshared C",
      },
    }),
    otherAgency = await db.agency.create({
      data: {
        ...contact,
        companyId: foreign.id,
        reference: "Y",
        name: "Foreign Y",
      },
    });
  for (const u of [stockUser, manager]) {
    await db.companyMembership.create({
      data: { companyId: company.id, userId: u.id, roleId: memberRole.id },
    });
    for (const agency of [a, b])
      await db.agencyMembership.create({
        data: {
          companyId: company.id,
          agencyId: agency.id,
          userId: u.id,
          roleId: u.id === stockUser.id ? stockRole.id : managerRole.id,
        },
      });
  }
  const shop = await db.shop.create({
      data: {
        name: "Shop owner A " + suffix,
        reference: "STOCK-SHOP-" + suffix,
        email: owner.email,
        phone: contact.phone,
        address: contact.address,
      },
    }),
    otherShop = await db.shop.create({
      data: {
        name: "Shop owner B " + suffix,
        reference: "STOCK-SHOP-B-" + suffix,
        email: "stock-b@example.invalid",
        phone: contact.phone,
        address: contact.address,
      },
    });
  await db.shopMembership.create({
    data: { shopId: shop.id, userId: owner.id, roleId: shopRole.id },
  });
  for (const c of [company, foreign])
    await db.companyShop.create({
      data: {
        companyId: c.id,
        shopId: shop.id,
        status: "ACTIVE",
        allowedAgencyIds: c.id === company.id ? [a.id, b.id] : [otherAgency.id],
      },
    });
  await db.companyShop.create({
    data: {
      companyId: company.id,
      shopId: otherShop.id,
      status: "ACTIVE",
      allowedAgencyIds: [a.id, b.id],
    },
  });
  const p1 = await db.product.create({
      data: { shopId: shop.id, sku: "P1", name: "Fixture shirts" },
    }),
    p2 = await db.product.create({
      data: { shopId: shop.id, sku: "P2", name: "Fixture shoes" },
    }),
    p3 = await db.product.create({
      data: { shopId: shop.id, sku: "P3", name: "Five concurrency units" },
    }),
    foreignProduct = await db.product.create({
      data: { shopId: otherShop.id, sku: "P1", name: "Other shop shirts" },
    });
  const service = new StockService(db);
  const cc: StockContext = {
      actorId: admin.id,
      scope: "COMPANY",
      companyId: company.id,
    },
    fc: StockContext = {
      actorId: admin.id,
      scope: "COMPANY",
      companyId: foreign.id,
    },
    ac: StockContext = {
      actorId: stockUser.id,
      scope: "AGENCY",
      companyId: company.id,
      agencyId: a.id,
    },
    bc: StockContext = { ...ac, agencyId: b.id },
    mc: StockContext = {
      actorId: manager.id,
      scope: "AGENCY",
      companyId: company.id,
      agencyId: a.id,
    };

  const auth = new AuthService(
    prismaAuthStore(db),
    {
      secret: "stock-test-secret-at-least-32-characters",
      accessSeconds: 600,
      refreshDays: 1,
      resetMinutes: 10,
      sameSite: "lax",
      webUrl: "http://localhost:5173",
      secure: false,
    },
    { available: () => false, send: async () => {} },
  );
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(
    "/api",
    createStockRouter(
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  async function client(email: string, key: string) {
    const login = await auth.login(email, password, {
      client: "MOBILE",
      deviceName: "Stock mobile test",
      userAgent: null,
      ipHash: null,
    });
    const p = await auth.authenticate(login.accessToken, "MOBILE");
    await auth.switchOrganization(p, key);
    return {
      request: async (path: string, method = "GET", body?: unknown) => {
        const r = await fetch(base + path, {
          method,
          headers: {
            "X-DND-Client": "mobile",
            "Content-Type": "application/json",
            Authorization: "Bearer " + login.accessToken,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      },
    };
  }
  const companyClient = await client(admin.email, "company:" + company.id),
    origin = await client(stockUser.email, `agency:${company.id}:${a.id}`),
    destination = await client(stockUser.email, `agency:${company.id}:${b.id}`),
    supervisor = await client(manager.email, `agency:${company.id}:${a.id}`),
    shopClient = await client(owner.email, "shop-home:" + shop.id);
  const q = v.query.parse({});
  const dep = (
    reference: string,
    items = [
      { productId: p1.id, quantity: 100 },
      { productId: p2.id, quantity: 50 },
      { productId: p3.id, quantity: 5 },
    ],
  ) => v.deposit.parse({ reference, agencyId: a.id, shopId: shop.id, items });
  let depositId = "",
    s1 = "",
    s2 = "",
    s3 = "",
    transferId = "",
    inventoryId = "";
  const stock = async (id: string) =>
    db.stock.findUniqueOrThrow({ where: { id } });
  try {
    await t.test(
      "draft multi-product deposit does not create physical stock; confirmation on mobile is atomic and idempotent",
      async () => {
        const created = await origin.request(
          "/stock-deposits",
          "POST",
          dep("DEP-INITIAL"),
        );
        assert.equal(created.status, 201, JSON.stringify(created.body));
        depositId = created.body.id;
        assert.equal(created.body.status, "DRAFT");
        assert.equal(
          await db.stock.count({ where: { companyId: company.id } }),
          0,
        );
        const duplicate = await origin.request(
          "/stock-deposits",
          "POST",
          dep("DEP-INITIAL"),
        );
        assert.equal(duplicate.body.id, depositId);
        const confirmed = await origin.request(
          `/stock-deposits/${depositId}/confirm`,
          "POST",
          { version: created.body.version },
        );
        assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
        assert.equal(confirmed.body.status, "CONFIRMED");
        assert.equal(confirmed.body.items.length, 3);
        s1 = (
          await db.stock.findUniqueOrThrow({
            where: {
              companyId_agencyId_shopId_productId: {
                companyId: company.id,
                agencyId: a.id,
                shopId: shop.id,
                productId: p1.id,
              },
            },
          })
        ).id;
        s2 = (
          await db.stock.findUniqueOrThrow({
            where: {
              companyId_agencyId_shopId_productId: {
                companyId: company.id,
                agencyId: a.id,
                shopId: shop.id,
                productId: p2.id,
              },
            },
          })
        ).id;
        s3 = (
          await db.stock.findUniqueOrThrow({
            where: {
              companyId_agencyId_shopId_productId: {
                companyId: company.id,
                agencyId: a.id,
                shopId: shop.id,
                productId: p3.id,
              },
            },
          })
        ).id;
        assert.equal((await stock(s1)).physicalQuantity, 100);
        assert.equal(
          (
            await origin.request(
              `/stock-deposits/${depositId}/confirm`,
              "POST",
              { version: created.body.version },
            )
          ).status,
          409,
        );
        assert.equal(
          await db.stockMovement.count({
            where: { stockId: s1, type: "DEPOSIT" },
          }),
          1,
        );
      },
    );
    await t.test(
      "negative, fractional, oversized quantities and duplicate product lines are rejected before writes",
      async () => {
        for (const quantity of [-1, 0, 1.5, 2147483648])
          assert.equal(
            (
              await origin.request("/stock-deposits", "POST", {
                ...dep("INVALID"),
                items: [{ productId: p1.id, quantity }],
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await origin.request("/stock-deposits", "POST", {
              ...dep("DUP-LINE"),
              items: [
                { productId: p1.id, quantity: 1 },
                { productId: p1.id, quantity: 1 },
              ],
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await origin.request("/stock-deposits", "POST", {
              ...dep("FOREIGN-PRODUCT"),
              items: [{ productId: foreignProduct.id, quantity: 1 }],
            })
          ).status,
          403,
        );
        assert.equal((await stock(s1)).physicalQuantity, 100);
      },
    );
    await t.test(
      "unshared, foreign and selected-agency boundaries cannot be widened by identifiers",
      async () => {
        assert.equal(
          (
            await origin.request("/stock-deposits", "POST", {
              ...dep("FOREIGN-AGENCY"),
              agencyId: otherAgency.id,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await companyClient.request("/stock-deposits", "POST", {
              ...dep("UNSHARED"),
              agencyId: hidden.id,
            })
          ).status,
          403,
        );
        assert.equal(
          (await origin.request("/stocks?agencyId=" + b.id)).status,
          403,
        );
        assert.equal(
          (await origin.request("/stocks?companyId=" + foreign.id)).status,
          403,
        );
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { allowedAgencyIds: [] },
        });
        assert.equal(
          (
            await origin.request(
              "/stock-deposits",
              "POST",
              dep("NO-SHARED-AGENCIES", [{ productId: p1.id, quantity: 1 }]),
            )
          ).status,
          403,
        );
        assert.equal((await origin.request("/stocks")).status, 200);
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { allowedAgencyIds: [a.id, b.id] },
        });
        const p = await service.createDeposit(
          cc,
          v.deposit.parse({
            ...dep("OTHER-B"),
            agencyId: b.id,
            items: [{ productId: p1.id, quantity: 2 }],
          }),
        );
        await service.depositAction(cc, p.id, "confirm", {
          version: p.version,
        });
        const rows = await origin.request("/stocks");
        assert.ok(
          rows.body.items.every(
            (s: { agencyId: string }) => s.agencyId === a.id,
          ),
        );
        assert.equal(
          (await origin.request("/stock-deposits/" + p.id)).status,
          404,
        );
      },
    );
    await t.test(
      "shop reads its products across two carriers and cannot mutate balances or inspect another owner",
      async () => {
        const d = await service.createDeposit(
          fc,
          v.deposit.parse({
            reference: "FOREIGN-CARRIER",
            agencyId: otherAgency.id,
            shopId: shop.id,
            items: [{ productId: p1.id, quantity: 7 }],
          }),
        );
        await service.depositAction(fc, d.id, "confirm", {
          version: d.version,
        });
        const other = await service.createDeposit(
          cc,
          v.deposit.parse({
            reference: "OTHER-SHOP",
            agencyId: a.id,
            shopId: otherShop.id,
            items: [{ productId: foreignProduct.id, quantity: 9 }],
          }),
        );
        await service.depositAction(cc, other.id, "confirm", {
          version: other.version,
        });
        const read = await shopClient.request("/stocks");
        assert.equal(read.status, 200);
        assert.ok(
          read.body.items.every(
            (s: { shopId: string }) => s.shopId === shop.id,
          ),
        );
        assert.ok(
          read.body.items.some(
            (s: { companyId: string }) => s.companyId === foreign.id,
          ),
        );
        assert.equal(
          (await shopClient.request("/stocks?shopId=" + otherShop.id)).status,
          403,
        );
        assert.equal(
          (
            await shopClient.request(
              "/stock-deposits",
              "POST",
              dep("SHOP-MUTATE"),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await shopClient.request("/stock-withdrawals", "POST", {
              reference: "SHOP-OUT",
              stockId: s1,
              quantity: 1,
              kind: "RETURN",
              reason: "Forbidden",
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "concurrent reservations cannot oversell five units and preserve physical stock",
      async () => {
        const results = await Promise.all([
          origin.request("/stock-reservations", "POST", {
            reference: "CONCURRENT-A",
            stockId: s3,
            quantity: 4,
          }),
          origin.request("/stock-reservations", "POST", {
            reference: "CONCURRENT-B",
            stockId: s3,
            quantity: 4,
          }),
        ]);
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 1);
        assert.equal((await stock(s3)).physicalQuantity, 5);
        assert.equal((await stock(s3)).reservedQuantity, 4);
        const same = results.find((r) => r.status === 201)!;
        const repeat = await origin.request("/stock-reservations", "POST", {
          reference: same.body.reference,
          stockId: s3,
          quantity: 4,
        });
        assert.equal(repeat.body.id, same.body.id);
        assert.equal(
          (
            await origin.request("/stock-withdrawals", "POST", {
              reference: "RESERVED-WITHDRAW",
              stockId: s3,
              quantity: 2,
              kind: "WITHDRAWAL",
              reason: "Cannot withdraw reserved",
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "release and explicit consumption are separate transitions with no double release or physical reduction at reservation",
      async () => {
        const p = await db.stockReservation.findFirstOrThrow({
          where: { stockId: s3 },
        });
        const release = await origin.request(
          `/stock-reservations/${p.id}/release`,
          "POST",
          { version: p.version, reason: "Reservation cancelled" },
        );
        assert.equal(release.status, 200);
        assert.equal((await stock(s3)).physicalQuantity, 5);
        assert.equal((await stock(s3)).reservedQuantity, 0);
        assert.equal(
          (
            await origin.request(
              `/stock-reservations/${p.id}/release`,
              "POST",
              { version: release.body.version },
            )
          ).status,
          409,
        );
        const r = await service.createReservation(
          ac,
          v.reservation.parse({
            reference: "CONSUME-3",
            stockId: s3,
            quantity: 3,
          }),
        );
        assert.equal(
          (
            await origin.request(
              `/stock-reservations/${r.id}/consume`,
              "POST",
              { version: r.version },
            )
          ).status,
          400,
        );
        const reserveOnlyRole = await db.role.create({
          data: {
            code: "reserve_only_" + suffix,
            name: "Reservation without physical withdrawal",
            scope: "AGENCY",
          },
        });
        const permissions = await db.permission.findMany({
          where: {
            code: { in: ["workspace.access", "stocks.read", "stocks.reserve"] },
          },
        });
        await db.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: reserveOnlyRole.id,
            permissionId: p.id,
          })),
        });
        const limitedUser = await db.user.create({
          data: {
            email: `stock-reserve-only-${suffix}@example.invalid`,
            fullName: "Reservation-only operator",
            passwordHash,
          },
        });
        await db.companyMembership.create({
          data: {
            companyId: company.id,
            userId: limitedUser.id,
            roleId: memberRole.id,
          },
        });
        await db.agencyMembership.create({
          data: {
            companyId: company.id,
            agencyId: a.id,
            userId: limitedUser.id,
            roleId: reserveOnlyRole.id,
          },
        });
        const limited = await client(
          limitedUser.email,
          `agency:${company.id}:${a.id}`,
        );
        assert.equal(
          (
            await limited.request(
              `/stock-reservations/${r.id}/consume`,
              "POST",
              {
                version: r.version,
                reason: "Missing physical withdrawal permission",
              },
            )
          ).status,
          403,
        );
        assert.equal((await stock(s3)).physicalQuantity, 5);
        assert.equal((await stock(s3)).reservedQuantity, 3);
        const consumed = await origin.request(
          `/stock-reservations/${r.id}/consume`,
          "POST",
          {
            version: r.version,
            reason: "Physical issue to authorized operations counter",
          },
        );
        assert.equal(consumed.status, 200);
        assert.equal((await stock(s3)).physicalQuantity, 2);
        assert.equal((await stock(s3)).reservedQuantity, 0);
      },
    );
    await t.test(
      "manual withdrawals are identified, bounded by availability and idempotent by business reference",
      async () => {
        const input = {
          reference: "MANUAL-RETURN",
          stockId: s1,
          quantity: 3,
          kind: "RETURN",
          reason: "Commercial owner withdrawal",
          recipient: "Shop representative",
        };
        const p = await origin.request("/stock-withdrawals", "POST", input);
        assert.equal(p.status, 201);
        assert.equal((await stock(s1)).physicalQuantity, 97);
        assert.equal(
          (await origin.request("/stock-withdrawals", "POST", input)).body.id,
          p.body.id,
        );
        assert.equal((await stock(s1)).physicalQuantity, 97);
        assert.equal(
          (
            await origin.request("/stock-withdrawals", "POST", {
              ...input,
              quantity: 4,
            })
          ).status,
          409,
        );
        assert.equal(
          (await origin.request("/stock-withdrawals/" + p.body.id)).status,
          200,
        );
      },
    );
    await t.test(
      "cancelled deposits never enter custody and archived product cannot be received",
      async () => {
        const d = await service.createDeposit(
          ac,
          dep("CANCEL-DEPOSIT", [{ productId: p2.id, quantity: 8 }]),
        );
        const cancelled = await service.depositAction(ac, d.id, "cancel", {
          version: d.version,
          reason: "Not physically delivered",
        });
        assert.equal(cancelled.status, "CANCELLED");
        assert.equal((await stock(s2)).physicalQuantity, 50);
        await assert.rejects(() =>
          service.depositAction(ac, d.id, "confirm", {
            version: cancelled.version,
          }),
        );
        const next = await service.createDeposit(
          ac,
          dep("ARCHIVED-PRODUCT", [{ productId: p2.id, quantity: 1 }]),
        );
        await db.product.update({
          where: { id: p2.id },
          data: { active: false },
        });
        await assert.rejects(() =>
          service.depositAction(ac, next.id, "confirm", {
            version: next.version,
          }),
        );
        assert.equal((await stock(s2)).physicalQuantity, 50);
        await db.product.update({
          where: { id: p2.id },
          data: { active: true },
        });
      },
    );
    await t.test(
      "thresholds use actual available quantities, have stale protection and repeated reads emit no duplicate alerts",
      async () => {
        const s = await stock(s3);
        const set = await origin.request(
          "/stocks/" + s3 + "/threshold",
          "PATCH",
          { version: s.version, alertThreshold: 3 },
        );
        assert.equal(set.status, 200);
        assert.equal(
          (
            await origin.request("/stocks/" + s3 + "/threshold", "PATCH", {
              version: s.version,
              alertThreshold: 1,
            })
          ).status,
          409,
        );
        const alerts = await origin.request("/stocks/alerts");
        assert.ok(alerts.body.items.some((s: { id: string }) => s.id === s3));
        const before = await db.notification.count({
          where: { companyId: company.id },
        });
        await origin.request("/stocks/alerts");
        assert.equal(
          await db.notification.count({ where: { companyId: company.id } }),
          before,
        );
      },
    );
    await t.test(
      "transfer draft does not move stock; dispatch creates transit counted once outside physical balances",
      async () => {
        const created = await origin.request("/stock-transfers", "POST", {
          reference: "TRANSFER-PARTIAL",
          originAgencyId: a.id,
          destinationAgencyId: b.id,
          shopId: shop.id,
          items: [{ productId: p1.id, quantity: 10 }],
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        transferId = created.body.id;
        assert.equal((await stock(s1)).physicalQuantity, 97);
        const departed = await origin.request(
          `/stock-transfers/${transferId}/dispatch`,
          "POST",
          { version: created.body.version },
        );
        assert.equal(departed.status, 200);
        assert.equal((await stock(s1)).physicalQuantity, 87);
        assert.equal(departed.body.items[0].inTransitQuantity, 10);
        const summary = await companyClient.request("/stocks/summary");
        assert.equal(summary.status, 200);
        assert.equal(summary.body.inTransitQuantity, 10);
        assert.equal(
          summary.body.physicalQuantity + summary.body.inTransitQuantity,
          97 + 50 + 2 + 2 + 9,
        );
        assert.equal(
          (
            await origin.request(
              `/stock-transfers/${transferId}/dispatch`,
              "POST",
              { version: departed.body.version },
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "only destination agency receives; partial receipt adds actual quantity and rejects over-receipt and stale replays",
      async () => {
        const p = await service.transfer(cc, transferId);
        const item = p.items[0]!;
        assert.equal(
          (
            await origin.request(
              `/stock-transfers/${transferId}/receive`,
              "POST",
              { version: p.version, items: [{ itemId: item.id, quantity: 3 }] },
            )
          ).status,
          403,
        );
        const received = await destination.request(
          `/stock-transfers/${transferId}/receive`,
          "POST",
          { version: p.version, items: [{ itemId: item.id, quantity: 3 }] },
        );
        assert.equal(received.status, 200);
        assert.equal(received.body.status, "IN_TRANSIT");
        assert.equal(received.body.items[0].receivedQuantity, 3);
        assert.equal(received.body.items[0].inTransitQuantity, 7);
        assert.equal(
          (
            await destination.request(
              `/stock-transfers/${transferId}/receive`,
              "POST",
              {
                version: received.body.version,
                items: [{ itemId: item.id, quantity: 8 }],
              },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await destination.request(
              `/stock-transfers/${transferId}/receive`,
              "POST",
              { version: p.version, items: [{ itemId: item.id, quantity: 3 }] },
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "incidents retain unresolved transit, prevent double declaration and ordinary receipt cannot consume disputed units",
      async () => {
        let p = await service.transfer(cc, transferId);
        p = await service.declareIncident(
          bc,
          transferId,
          v.incident.parse({
            version: p.version,
            itemId: p.items[0]!.id,
            quantity: 2,
            kind: "MISSING",
            description: "Two units absent from parcel",
          }),
        );
        assert.equal(p.incidents[0]!.status, "OPEN");
        assert.equal(p.items[0]!.inTransitQuantity, 7);
        await assert.rejects(() =>
          service.declareIncident(
            bc,
            transferId,
            v.incident.parse({
              version: p.version,
              itemId: p.items[0]!.id,
              quantity: 6,
              kind: "OTHER",
              description: "Overlap denied",
            }),
          ),
        );
        await assert.rejects(() =>
          service.receiveTransfer(
            bc,
            transferId,
            v.receipt.parse({
              version: p.version,
              items: [{ itemId: p.items[0]!.id, quantity: 6 }],
            }),
          ),
        );
        p = await service.receiveTransfer(
          bc,
          transferId,
          v.receipt.parse({
            version: p.version,
            items: [{ itemId: p.items[0]!.id, quantity: 5 }],
          }),
        );
        assert.equal(p.items[0]!.inTransitQuantity, 2);
        assert.equal(p.status, "IN_TRANSIT");
      },
    );
    await t.test(
      "incident physical restoration requires target agency permission; return is distinct from confirmed loss",
      async () => {
        const p = await service.transfer(cc, transferId),
          incident = p.incidents[0]!;
        assert.equal(
          (
            await origin.request(
              `/stock-transfers/${transferId}/incidents/${incident.id}/resolve`,
              "POST",
              {
                version: p.version,
                action: "CONFIRM_LOSS",
                reason: "Stock keeper cannot approve loss",
              },
            )
          ).status,
          403,
        );
        await assert.rejects(() =>
          service.resolveIncident(
            mc,
            transferId,
            incident.id,
            v.resolution.parse({
              version: p.version,
              action: "RECOVER_TO_DESTINATION",
              reason: "Source cannot modify destination physical stock",
            }),
          ),
        );
        const before = (await stock(s1)).physicalQuantity;
        const resolved = await supervisor.request(
          `/stock-transfers/${transferId}/incidents/${incident.id}/resolve`,
          "POST",
          {
            version: p.version,
            action: "RETURN_TO_ORIGIN",
            reason: "Missing parcel located and returned to origin",
          },
        );
        assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
        assert.equal(resolved.body.status, "RECEIVED");
        assert.equal(resolved.body.items[0].returnedQuantity, 2);
        assert.equal(resolved.body.items[0].lostQuantity, 0);
        assert.equal((await stock(s1)).physicalQuantity, before + 2);
      },
    );
    await t.test(
      "authorized loss resolution closes only transit and does not fabricate a physical adjustment or restitution",
      async () => {
        let p = await service.createTransfer(
          cc,
          v.transfer.parse({
            reference: "TRANSFER-LOSS",
            originAgencyId: a.id,
            destinationAgencyId: b.id,
            shopId: shop.id,
            items: [{ productId: p2.id, quantity: 3 }],
          }),
        );
        p = await service.transferAction(cc, p.id, "dispatch", {
          version: p.version,
        });
        p = await service.declareIncident(
          cc,
          p.id,
          v.incident.parse({
            version: p.version,
            itemId: p.items[0]!.id,
            quantity: 3,
            kind: "DAMAGED",
            description: "Goods destroyed in transit",
          }),
        );
        const before = (await stock(s2)).physicalQuantity;
        const result = await service.resolveIncident(
          cc,
          p.id,
          p.incidents[0]!.id,
          v.resolution.parse({
            version: p.version,
            action: "CONFIRM_LOSS",
            reason: "Documented inspection authorized writeoff",
          }),
        );
        assert.equal(result.items[0]!.lostQuantity, 3);
        assert.equal(result.status, "RECEIVED");
        assert.equal((await stock(s2)).physicalQuantity, before);
        assert.equal((await service.summary(cc, q)).inTransitQuantity, 0);
      },
    );
    await t.test(
      "cross-company transfers and unshared destination agencies are rejected",
      async () => {
        for (const destinationAgencyId of [otherAgency.id, hidden.id])
          assert.equal(
            (
              await companyClient.request("/stock-transfers", "POST", {
                reference: "BAD-" + destinationAgencyId.slice(0, 8),
                originAgencyId: a.id,
                destinationAgencyId,
                shopId: shop.id,
                items: [{ productId: p1.id, quantity: 1 }],
              })
            ).status,
            403,
          );
        assert.equal(
          (await origin.request("/stock-transfers?agencyId=" + hidden.id))
            .status,
          403,
        );
      },
    );
    await t.test(
      "inventory snapshots physical/reserved versions, counts justified differences and requires approval permission",
      async () => {
        let p = await service.createInventory(
          ac,
          v.inventory.parse({
            reference: "INVENTORY-OK",
            agencyId: a.id,
            shopId: shop.id,
          }),
        );
        inventoryId = p.id;
        const first = p.items.find((i) => i.stockId === s1)!;
        const count = p.items.map((i) => ({
          itemId: i.id,
          countedQuantity: i.expectedPhysical + (i.id === first.id ? 2 : 0),
          reason:
            i.id === first.id
              ? "Two physical units found during supervised count"
              : undefined,
        }));
        const counted = await origin.request(
          `/inventories/${p.id}/count`,
          "POST",
          { version: p.version, items: count },
        );
        assert.equal(counted.status, 200);
        p = counted.body;
        const submitted = await origin.request(
          `/inventories/${p.id}/submit`,
          "POST",
          { version: p.version },
        );
        assert.equal(submitted.status, 200);
        assert.equal(
          (
            await origin.request(`/inventories/${p.id}/approve`, "POST", {
              version: submitted.body.version,
              reason: "Not permitted",
            })
          ).status,
          403,
        );
        const before = (await stock(s1)).physicalQuantity;
        const approved = await supervisor.request(
          `/inventories/${p.id}/approve`,
          "POST",
          { version: submitted.body.version, reason: "Countercheck completed" },
        );
        assert.equal(approved.status, 200, JSON.stringify(approved.body));
        assert.equal(approved.body.status, "APPROVED");
        assert.equal((await stock(s1)).physicalQuantity, before + 2);
        assert.equal(
          (
            await supervisor.request(`/inventories/${p.id}/approve`, "POST", {
              version: approved.body.version,
              reason: "Replay",
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "inventory approval rejects stale snapshots after intervening real stock movement, then rejection keeps balances",
      async () => {
        let p = await service.createInventory(
          ac,
          v.inventory.parse({
            reference: "INVENTORY-STALE",
            agencyId: a.id,
            shopId: shop.id,
          }),
        );
        p = await service.countInventory(
          ac,
          p.id,
          v.count.parse({
            version: p.version,
            items: p.items.map((i) => ({
              itemId: i.id,
              countedQuantity: i.expectedPhysical,
            })),
          }),
        );
        p = await service.inventoryAction(ac, p.id, "submit", {
          version: p.version,
        });
        const d = await service.createDeposit(
          ac,
          dep("POST-SNAPSHOT", [{ productId: p1.id, quantity: 1 }]),
        );
        await service.depositAction(ac, d.id, "confirm", {
          version: d.version,
        });
        const before = (await stock(s1)).physicalQuantity;
        await assert.rejects(() =>
          service.inventoryAction(mc, p.id, "approve", {
            version: p.version,
            reason: "Must re-count changed balances",
          }),
        );
        assert.equal((await stock(s1)).physicalQuantity, before);
        const rejected = await service.inventoryAction(mc, p.id, "reject", {
          version: p.version,
          reason: "Snapshot stale after additional receipt",
        });
        assert.equal(rejected.status, "REJECTED");
      },
    );
    await t.test(
      "inventory adjustment cannot reduce physical stock beneath active reservations; whole approval rolls back",
      async () => {
        const r = await service.createReservation(
          ac,
          v.reservation.parse({
            reference: "INVENTORY-RESERVE",
            stockId: s1,
            quantity: 5,
          }),
        );
        let p = await service.createInventory(
          ac,
          v.inventory.parse({
            reference: "INVENTORY-BELOW-RESERVED",
            agencyId: a.id,
            shopId: shop.id,
          }),
        );
        p = await service.countInventory(
          ac,
          p.id,
          v.count.parse({
            version: p.version,
            items: p.items.map((i) => ({
              itemId: i.id,
              countedQuantity: i.stockId === s1 ? 2 : i.expectedPhysical,
              reason: "Supervised discrepancy",
            })),
          }),
        );
        p = await service.inventoryAction(ac, p.id, "submit", {
          version: p.version,
        });
        const before = (await stock(s1)).physicalQuantity;
        await assert.rejects(() =>
          service.inventoryAction(mc, p.id, "approve", {
            version: p.version,
            reason: "Cannot consume reserved units by adjustment",
          }),
        );
        assert.equal((await stock(s1)).physicalQuantity, before);
        await service.reservationAction(ac, r.id, "release", {
          version: r.version,
          reason: "Close fixture reservation",
        });
      },
    );
    await t.test(
      "posted movement content and audit are immutable in MySQL and errors require compensating operations",
      async () => {
        const movement = await db.stockMovement.findFirstOrThrow({
          where: { stockId: s1 },
        });
        await assert.rejects(() =>
          db.stockMovement.update({
            where: { id: movement.id },
            data: { notes: "Attempted rewrite" },
          }),
        );
        await assert.rejects(() =>
          db.stockMovement.delete({ where: { id: movement.id } }),
        );
        const moves = await origin.request("/stocks/movements?size=2");
        assert.equal(moves.status, 200);
        assert.equal(moves.body.items.length, 2);
        assert.ok(moves.body.total > 2);
        const m = moves.body.items[0];
        assert.equal(m.physicalAfter, m.physicalBefore + m.physicalDelta);
        assert.equal(m.reservedAfter, m.reservedBefore + m.reservedDelta);
        assert.ok(m.actor.fullName);
      },
    );
    await t.test(
      "failed multi-product confirmation rolls back every balance and movement and leaves deposit unconfirmed",
      async () => {
        const products = [p1, p2].sort((a, b) => a.id.localeCompare(b.id));
        const first = products[0]!,
          second = products[1]!;
        const before = await db.stock.findMany({
          where: { id: { in: [s1, s2] } },
        });
        const d = await service.createDeposit(
          ac,
          dep("ROLLBACK-MULTI", [
            { productId: first.id, quantity: 1 },
            { productId: second.id, quantity: 2147483647 },
          ]),
        );
        await assert.rejects(() =>
          service.depositAction(ac, d.id, "confirm", { version: d.version }),
        );
        assert.equal(
          (await db.stockDeposit.findUniqueOrThrow({ where: { id: d.id } }))
            .status,
          "DRAFT",
        );
        for (const b of before)
          assert.equal(
            (await stock(b.id)).physicalQuantity,
            b.physicalQuantity,
          );
        assert.equal(
          await db.stockMovement.count({
            where: {
              companyId: company.id,
              operationKey: { startsWith: `deposit:${d.id}:` },
            },
          }),
          0,
        );
      },
    );
    await t.test(
      "summary keeps physical and transit totals in one snapshot during dispatch and receipt",
      async () => {
        const product = await db.product.create({
          data: {
            shopId: shop.id,
            sku: "SNAPSHOT",
            name: "Concurrent dashboard product",
          },
        });
        const draft = await service.createDeposit(cc, {
          reference: "SNAPSHOT-DEPOSIT",
          agencyId: a.id,
          shopId: shop.id,
          items: [{ productId: product.id, quantity: 20 }],
        });
        await service.depositAction(cc, draft.id, "confirm", {
          version: draft.version,
        });
        const transfer = await service.createTransfer(cc, {
          reference: "SNAPSHOT-TRANSFER",
          originAgencyId: a.id,
          destinationAgencyId: b.id,
          shopId: shop.id,
          items: [{ productId: product.id, quantity: 4 }],
        });
        const query = v.query.parse({ productId: product.id });
        const first = Array.from({ length: 4 }, () =>
          service.summary(cc, query),
        );
        await Promise.all([
          service.transferAction(cc, transfer.id, "dispatch", {
            version: transfer.version,
          }),
          ...first,
        ]);
        for (const s of await Promise.all(first))
          assert.equal(s.physicalQuantity + s.inTransitQuantity, 20);
        const dispatched = await service.transfer(cc, transfer.id);
        const second = Array.from({ length: 4 }, () =>
          service.summary(cc, query),
        );
        await Promise.all([
          service.receiveTransfer(cc, transfer.id, {
            version: dispatched.version,
            items: [{ itemId: dispatched.items[0]!.id, quantity: 4 }],
          }),
          ...second,
        ]);
        for (const s of await Promise.all(second))
          assert.equal(s.physicalQuantity + s.inTransitQuantity, 20);
      },
    );
    await t.test(
      "inactive collaboration blocks new stock work but permits historical custody and explicit owner restitution",
      async () => {
        let engaged = await service.createTransfer(
          ac,
          v.transfer.parse({
            reference: "PRE-END-TRANSIT",
            originAgencyId: a.id,
            destinationAgencyId: b.id,
            shopId: shop.id,
            items: [{ productId: p1.id, quantity: 1 }],
          }),
        );
        engaged = await service.transferAction(ac, engaged.id, "dispatch", {
          version: engaged.version,
        });
        await db.companyShop.update({
          where: {
            companyId_shopId: { companyId: company.id, shopId: shop.id },
          },
          data: { status: "ENDED" },
        });
        assert.equal(
          (
            await origin.request(
              "/stock-deposits",
              "POST",
              dep("AFTER-END", [{ productId: p1.id, quantity: 1 }]),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await origin.request("/stock-reservations", "POST", {
              reference: "AFTER-END-R",
              stockId: s1,
              quantity: 1,
            })
          ).status,
          403,
        );
        const closed = await destination.request(
          `/stock-transfers/${engaged.id}/receive`,
          "POST",
          {
            version: engaged.version,
            items: [{ itemId: engaged.items[0]!.id, quantity: 1 }],
          },
        );
        assert.equal(closed.status, 200);
        assert.equal(closed.body.status, "RECEIVED");
        const before = (await stock(s1)).physicalQuantity;
        const returned = await origin.request("/stock-withdrawals", "POST", {
          reference: "END-RESTITUTION",
          stockId: s1,
          quantity: 1,
          kind: "RETURN",
          reason: "Return held property to owner after partnership ended",
        });
        assert.equal(returned.status, 201);
        assert.equal((await stock(s1)).physicalQuantity, before - 1);
        assert.equal((await shopClient.request("/stocks")).status, 200);
        assert.equal(
          (await shopClient.request("/stock-deposits/" + depositId)).status,
          200,
        );
      },
    );
    await t.test(
      "expired company subscription blocks even new restitution while other carrier read/access remains independent",
      async () => {
        await db.subscription.update({
          where: { companyId: company.id },
          data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 1) },
        });
        assert.equal(
          (
            await origin.request("/stock-withdrawals", "POST", {
              reference: "EXPIRED-RETURN",
              stockId: s1,
              quantity: 1,
              kind: "RETURN",
              reason: "Requires company renewal first",
            })
          ).status,
          403,
        );
        assert.equal(
          (await origin.request("/inventories/" + inventoryId)).status,
          200,
        );
        const rows = await shopClient.request(
          "/stocks?companyId=" + foreign.id,
        );
        assert.equal(rows.status, 200);
        assert.ok(
          rows.body.items.every(
            (s: { companyId: string }) => s.companyId === foreign.id,
          ),
        );
        assert.equal((await service.summary(fc, q)).physicalQuantity, 7);
      },
    );
    await t.test(
      "audit identifies stock operations without exposing secrets and all counters are derived from database balances",
      async () => {
        const audit = await db.auditLog.findMany({
          where: { companyId: company.id, action: { startsWith: "STOCK_" } },
        });
        assert.ok(audit.length > 25);
        assert.ok(audit.every((a) => a.actorId && a.agencyId));
        assert.ok(!JSON.stringify(audit).includes("passwordHash"));
        const all = await service.balances(cc, v.query.parse({ size: 50 }));
        const summary = await service.summary(cc, q);
        assert.equal(
          summary.physicalQuantity,
          all.items.reduce((sum, i) => sum + i.physicalQuantity, 0),
        );
        assert.equal(
          summary.availableQuantity,
          summary.physicalQuantity - summary.reservedQuantity,
        );
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
