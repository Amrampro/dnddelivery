import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import sharp from "sharp";
import express from "express";
import cookieParser from "cookie-parser";
import { createDatabase } from "../../src/database/client.js";
import { ProductService } from "../../src/modules/products/service.js";
import { createProductRouter } from "../../src/modules/products/routes.js";
import { PartnerService } from "../../src/modules/partners/service.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { errors } from "../../src/middlewares/errors.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL product catalogue: ownership, scoped partner reading, images, versions and history", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8),
    password = "Product fixture password 2026",
    hash = await hashPassword(password);
  t.after(() => db.$disconnect());
  const contact = {
    email: `product-${suffix}@example.invalid`,
    phone: "0000000000",
    address: "Fixture address",
    city: "Douala",
    countryCode: "CM",
  };
  const shop = await db.shop.create({
      data: {
        ...contact,
        reference: `PROD-S1-${suffix}`,
        name: "Product shop one",
      },
    }),
    other = await db.shop.create({
      data: {
        ...contact,
        reference: `PROD-S2-${suffix}`,
        name: "Product shop two",
      },
    });
  const company = await db.company.create({
    data: {
      ...contact,
      reference: `PROD-C-${suffix}`,
      name: "Product carrier",
      status: "ACTIVE",
    },
  });
  const agency = await db.agency.create({
      data: {
        companyId: company.id,
        reference: "CENTRE",
        name: "Centre",
        address: "Fixture",
        phone: "0000000000",
        city: "Douala",
        status: "ACTIVE",
      },
    }),
    foreign = await db.agency.create({
      data: {
        companyId: company.id,
        reference: "NORD",
        name: "Nord",
        address: "Fixture",
        phone: "0000000000",
        city: "Douala",
        status: "ACTIVE",
      },
    });
  const owner = await db.user.create({
      data: {
        email: `product-owner-${suffix}@example.invalid`,
        fullName: "Product owner",
        passwordHash: hash,
      },
    }),
    outsider = await db.user.create({
      data: {
        email: `product-outside-${suffix}@example.invalid`,
        fullName: "Other shop owner",
        passwordHash: hash,
      },
    }),
    employee = await db.user.create({
      data: {
        email: `product-worker-${suffix}@example.invalid`,
        fullName: "Shop employee",
        passwordHash: hash,
      },
    }),
    admin = await db.user.create({
      data: {
        email: `product-admin-${suffix}@example.invalid`,
        fullName: "Carrier admin",
        passwordHash: hash,
      },
    });
  for (const [user, store, code] of [
    [owner, shop, "shop_owner"],
    [outsider, other, "shop_owner"],
    [employee, shop, "shop_employee"],
  ] as const) {
    const role = await db.role.findUniqueOrThrow({ where: { code } });
    await db.shopMembership.create({
      data: { shopId: store.id, userId: user.id, roleId: role.id },
    });
  }
  const ar = await db.role.findUniqueOrThrow({
    where: { code: "company_admin" },
  });
  await db.companyMembership.create({
    data: { companyId: company.id, userId: admin.id, roleId: ar.id },
  });
  const pair = await db.companyShop.create({
    data: {
      companyId: company.id,
      shopId: shop.id,
      status: "ACTIVE",
      allowedAgencyIds: [agency.id],
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
  await db.subscription.create({
    data: {
      companyId: company.id,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const auth = new AuthService(
    prismaAuthStore(db),
    {
      secret: "product-test-only-secret-not-production-2026",
      accessSeconds: 600,
      refreshDays: 30,
      resetMinutes: 20,
      sameSite: "lax",
      webUrl: "http://localhost:5173",
      secure: false,
    },
    { available: () => false, send: async () => {} },
  );
  const service = new ProductService(db),
    partners = new PartnerService(
      db,
      { available: () => false, send: async () => {} },
      "http://localhost:5173",
    );
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(
    "/products",
    createProductRouter(
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  async function client(user: typeof owner, key: string) {
    const b = await auth.login(user.email, password, {
      client: "MOBILE",
      deviceName: "Product test",
      userAgent: null,
      ipHash: null,
    });
    await auth.switchOrganization(
      await auth.authenticate(b.accessToken, "MOBILE"),
      key,
    );
    return {
      accessToken: b.accessToken,
      async request(
        path: string,
        body?: unknown,
        method = body ? "POST" : "GET",
        headers: Record<string, string> = {},
      ) {
        const r = await fetch(`http://127.0.0.1:${port}/products${path}`, {
          method,
          headers: {
            "X-DND-Client": "mobile",
            Authorization: `Bearer ${b.accessToken}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: r.status,
          body: (await r.json()) as Record<string, unknown>,
        };
      },
      async select(k: string) {
        await auth.switchOrganization(
          await auth.authenticate(b.accessToken, "MOBILE"),
          k,
        );
      },
    };
  }
  try {
    const a = await client(owner, `shop-home:${shop.id}`),
      b = await client(outsider, `shop-home:${other.id}`),
      e = await client(employee, `shop-home:${shop.id}`),
      c = await client(admin, `company:${company.id}`);
    let id = "",
      version = 0;
    await t.test(
      "authorized owner creates once; duplicate SKU stays local and missing SKUs remain possible",
      async () => {
        const p = await a.request("", {
          name: "Téléphone",
          sku: "TEL-1",
          unit: "piece",
          category: "Téléphonie",
        });
        assert.equal(p.status, 201);
        id = String(p.body.id);
        version = Number(p.body.version);
        assert.equal(
          (
            await a.request("", {
              name: "Duplicate",
              sku: "TEL-1",
              unit: "piece",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await b.request("", {
              name: "Other catalogue",
              sku: "TEL-1",
              unit: "piece",
            })
          ).status,
          201,
        );
        assert.equal(
          (await a.request("", { name: "Sans SKU", unit: "piece" })).status,
          201,
        );
        assert.equal(
          (await a.request("", { name: "Autre sans SKU", unit: "piece" }))
            .status,
          201,
        );
      },
    );
    await t.test(
      "other shop, carrier and employee cannot edit owner catalogue or inject a shop identifier",
      async () => {
        assert.equal(
          (
            await b.request(
              `/${id}`,
              { version, name: "Stolen", unit: "piece" },
              "PATCH",
            )
          ).status,
          404,
        );
        assert.equal(
          (await e.request("", { name: "Denied", unit: "piece" })).status,
          403,
        );
        assert.equal(
          (
            await c.request(
              `/${id}`,
              { version, name: "Denied", unit: "piece" },
              "PATCH",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await a.request("", {
              name: "Injected",
              unit: "piece",
              shopId: other.id,
            })
          ).status,
          400,
        );
        assert.equal((await a.request(`?shopId=${other.id}`)).status, 403);
      },
    );
    await t.test(
      "company and selected agency only browse authorized products and no arbitrary agency context works",
      async () => {
        assert.equal((await c.request(`/${id}`)).status, 200);
        await c.select(`agency:${company.id}:${agency.id}`);
        assert.equal((await c.request(`/${id}`)).status, 200);
        await c.select(`agency:${company.id}:${foreign.id}`);
        assert.equal((await c.request(`/${id}`)).status, 404);
        await assert.rejects(() =>
          c.select(`agency:${company.id}:${randomUUID()}`),
        );
        await c.select(`company:${company.id}`);
      },
    );
    await t.test(
      "updates are versioned; archive preserves identity and restores explicitly",
      async () => {
        const p = await a.request(
          `/${id}`,
          {
            version,
            name: "Téléphone renommé",
            sku: "TEL-1",
            unit: "piece",
            active: false,
          },
          "PATCH",
        );
        assert.equal(p.status, 200);
        assert.equal(p.body.active, false);
        assert.ok(p.body.archivedAt);
        assert.equal(
          (
            await a.request(
              `/${id}`,
              { version, name: "Stale", unit: "piece" },
              "PATCH",
            )
          ).status,
          409,
        );
        version = Number(p.body.version);
        const partial = await a.request(
          `/${id}`,
          { version, name: "Nom modifié sans réactivation" },
          "PATCH",
        );
        assert.equal(partial.status, 200);
        assert.equal(partial.body.active, false);
        assert.equal(partial.body.sku, "TEL-1");
        assert.equal(partial.body.unit, "piece");
        version = Number(partial.body.version);
        const next = await a.request(
          `/${id}`,
          {
            version,
            name: "Téléphone",
            sku: "TEL-1",
            unit: "piece",
            active: true,
          },
          "PATCH",
        );
        assert.equal(next.status, 200);
        assert.equal(next.body.archivedAt, null);
        version = Number(next.body.version);
      },
    );
    await t.test(
      "unit labels cannot change after a physical history; inactive partners retain only historical product access",
      async () => {
        const stock = await db.stock.create({
          data: {
            companyId: company.id,
            agencyId: agency.id,
            shopId: shop.id,
            productId: id,
            physicalQuantity: 3,
          },
        });
        await db.stockMovement.create({
          data: {
            companyId: company.id,
            stockId: stock.id,
            actorId: admin.id,
            type: "DEPOSIT",
            physicalDelta: 3,
            reservedDelta: 0,
            physicalAfter: 3,
            reservedAfter: 0,
            operationKey: `product-fixture-${suffix}`,
          },
        });
        assert.equal(
          (
            await a.request(
              `/${id}`,
              { version, name: "Téléphone", sku: "TEL-1", unit: "carton" },
              "PATCH",
            )
          ).status,
          409,
        );
        await db.companyShop.update({
          where: { id: pair.id },
          data: { status: "ENDED" },
        });
        assert.equal((await c.request(`/${id}`)).status, 200);
        const list = await c.request("");
        assert.equal(list.body.total, 1);
        await db.companyShop.update({
          where: { id: pair.id },
          data: { status: "ACTIVE" },
        });
      },
    );
    await t.test(
      "shop independent catalogue remains writable when a selected carrier expires; images require decoding",
      async () => {
        await db.subscription.update({
          where: { companyId: company.id },
          data: { status: "EXPIRED" },
        });
        await a.select(`shop:${company.id}:${shop.id}`);
        const p = await a.request(
          `/${id}`,
          {
            version,
            name: "Téléphone validé",
            sku: "TEL-1",
            unit: "piece",
            active: true,
          },
          "PATCH",
        );
        assert.equal(p.status, 200);
        version = Number(p.body.version);
        const endpoint = `http://127.0.0.1:${port}/products/${id}/image`,
          headers = {
            "X-DND-Client": "mobile",
            Authorization: `Bearer ${a.accessToken}`,
            "Content-Type": "image/png",
            "X-Product-Version": String(version),
          };
        const bad = await fetch(endpoint, {
          method: "PUT",
          headers,
          body: Buffer.from("not an image"),
        });
        assert.equal(bad.status, 400);
        assert.equal(
          (await db.product.findUniqueOrThrow({ where: { id } })).imageKey,
          null,
        );
        const png = await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#033173" },
        })
          .png()
          .toBuffer();
        assert.equal(
          (await fetch(endpoint, { method: "PUT", headers, body: png })).status,
          200,
        );
        const before = await db.product.findUniqueOrThrow({ where: { id } });
        assert.ok(before.imageKey?.endsWith(".webp"));
        assert.equal((await a.request(`/${id}/image`)).body.mime, "image/webp");
        assert.equal(
          (await fetch(endpoint, { method: "PUT", headers, body: png })).status,
          409,
        );
        assert.equal(
          (await db.product.findUniqueOrThrow({ where: { id } })).imageKey,
          before.imageKey,
        );
        version = before.version;
      },
    );
    await t.test(
      "agency sharing is explicit, scoped and versioned without stock grants to shops",
      async () => {
        await db.subscription.update({
          where: { companyId: company.id },
          data: {
            status: "ACTIVE",
            startedAt: new Date(Date.now() - 60000),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const current = await db.companyShop.findUniqueOrThrow({
          where: { id: pair.id },
        });
        const updated = await partners.setAgencies(
          { actorId: admin.id, scope: "COMPANY", companyId: company.id },
          pair.id,
          { version: current.version, agencyIds: [agency.id, foreign.id] },
        );
        assert.equal(updated.version, current.version + 1);
        await assert.rejects(() =>
          partners.setAgencies(
            { actorId: owner.id, scope: "SHOP", shopId: shop.id },
            pair.id,
            { version: updated.version, agencyIds: [] },
          ),
        );
        await assert.rejects(() =>
          partners.setAgencies(
            { actorId: admin.id, scope: "COMPANY", companyId: company.id },
            pair.id,
            { version: updated.version, agencyIds: [randomUUID()] },
          ),
        );
        assert.equal(
          (await db.companyShop.findUniqueOrThrow({ where: { id: pair.id } }))
            .version,
          updated.version,
        );
        const audit = await db.auditLog.findMany({
          where: { entityId: id, action: { startsWith: "PRODUCT_" } },
        });
        assert.ok(audit.length >= 4);
        assert.ok(audit.every((x) => x.companyId === null));
        assert.ok(!JSON.stringify(audit).includes("passwordHash"));
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
