import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { createDatabase } from "../../src/database/client.js";
import { SubscriptionService } from "../../src/modules/subscriptions/service.js";
import { SubscriptionRepository } from "../../src/modules/subscriptions/repository.js";
import { SubscriptionJobs } from "../../src/modules/subscriptions/jobs.js";
import { nextMonth, pageQuery } from "../../src/modules/subscriptions/rules.js";
import {
  assertNewOperation,
  assertSafeClosure,
} from "../../src/modules/subscriptions/access.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { createAuthRouter } from "../../src/modules/auth/auth.routes.js";
import { createSubscriptionRouter } from "../../src/modules/subscriptions/routes.js";
import { errors } from "../../src/middlewares/errors.js";
import { authorizeTenant } from "../../src/modules/authorization/tenant-access.js";
import { authorizationStore } from "../../src/repositories/authorization.repository.js";
import { localSmtp } from "../helpers/local-smtp.js";
import { subscriptionMailer } from "../../src/modules/auth/smtp.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw new Error("Dedicated database required");
test("MySQL SaaS subscriptions: exact payments, isolation, concurrency, expiry and outbox", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8);
  let now = new Date();
  // Preserve all historical test prices; use a monotonically increasing test clock on reruns.
  const lastPrice = await db.subscriptionPrice.findFirst({
    orderBy: { effectiveFrom: "desc" },
  });
  if (lastPrice && lastPrice.effectiveFrom >= now)
    now = new Date(lastPrice.effectiveFrom.getTime() + 1000);
  const service = new SubscriptionService(
      db,
      "test-preview-secret-32-characters",
      () => new Date(now),
    ),
    repo = new SubscriptionRepository(db, () => new Date(now)),
    jobs = new SubscriptionJobs(service);
  const password = "Subscription fixture password 2026",
    hash = await hashPassword(password);
  const owner = await db.user.create({
      data: {
        email: `saas-owner-${suffix}@example.invalid`,
        fullName: "SaaS test validator",
        passwordHash: hash,
      },
    }),
    second = await db.user.create({
      data: {
        email: `saas-second-${suffix}@example.invalid`,
        fullName: "Second validator",
        passwordHash: hash,
      },
    }),
    tenant = await db.user.create({
      data: {
        email: `saas-tenant-${suffix}@example.invalid`,
        fullName: "Subscription test admin",
        passwordHash: hash,
      },
    });
  const globalRole = await db.role.create({
      data: {
        code: `saas_global_${suffix}`,
        name: "SaaS global test",
        scope: "GLOBAL",
      },
    }),
    companyRole = await db.role.upsert({
      where: { code: "company_admin" },
      create: {
        code: "company_admin",
        name: "Company administrator",
        scope: "COMPANY",
      },
      update: {},
    });
  for (const [roleId, codes] of [
    [globalRole.id, ["workspace.access", "subscriptions.validate"]],
    [
      companyRole.id,
      [
        "workspace.access",
        "subscriptions.read",
        "subscriptions.declare",
        "orders.read",
        "stocks.reserve",
        "deliveries.read",
      ],
    ],
  ] as const) {
    for (const code of codes) {
      const p = await db.permission.upsert({
        where: { code },
        create: { code, description: code },
        update: {},
      });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: p.id } },
        create: { roleId, permissionId: p.id },
        update: {},
      });
    }
  }
  for (const userId of [owner.id, second.id])
    await db.globalRoleGrant.create({
      data: { userId, roleId: globalRole.id, roleScope: "GLOBAL" },
    });
  const contact = {
    email: "subscription@example.invalid",
    phone: "0000000000",
    address: "Test address",
    city: "Douala",
    countryCode: "CM",
  };
  const company = await db.company.create({
      data: {
        ...contact,
        name: `SaaS recette ${suffix}`,
        reference: `SAAS-${suffix}`,
        status: "ACTIVE",
      },
    }),
    foreign = await db.company.create({
      data: {
        ...contact,
        name: `SaaS foreign ${suffix}`,
        reference: `SAAS-X-${suffix}`,
        status: "ACTIVE",
      },
    });
  for (const c of [company, foreign])
    await db.companyMembership.create({
      data: {
        companyId: c.id,
        userId: tenant.id,
        roleId: companyRole.id,
        roleScope: "COMPANY",
      },
    });
  const auth = new AuthService(
    prismaAuthStore(db),
    {
      secret: "test-auth-secret-32-bytes-minimum-saas",
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
    "/api/auth",
    createAuthRouter(() => auth, ["http://localhost:5173"]),
  );
  app.use(
    "/api/admin",
    createSubscriptionRouter(
      true,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(
    "/api/company",
    createSubscriptionRouter(
      false,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  async function client(email: string, key: string) {
    const login = await auth.login(email, password, {
      client: "MOBILE",
      deviceName: "SaaS test",
      userAgent: null,
      ipHash: null,
    });
    let principal = await auth.authenticate(login.accessToken, "MOBILE");
    await auth.switchOrganization(principal, key);
    principal = await auth.authenticate(login.accessToken, "MOBILE");
    return {
      principal,
      request: async (path: string, method = "GET", body?: unknown) => {
        const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
          method,
          headers: {
            "X-DND-Client": "mobile",
            Authorization: `Bearer ${login.accessToken}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      },
    };
  }
  const admin = await client(owner.email, "global"),
    member = await client(tenant.email, `company:${company.id}`);
  let firstPayment = "",
    firstPeriod = "",
    priceId = "";
  const declaration = (reference = randomUUID()) => ({
    amount: "15000.0000",
    currency: "XAF",
    method: "MTN_MOBILE_MONEY" as const,
    externalReference: reference,
    paidAt: new Date(now.getTime() - 1000).toISOString(),
    notes: null,
    idempotencyKey: randomUUID(),
  });
  try {
    await t.test(
      "single plan configuration, permissions, immutable price history and optimistic conflict",
      async () => {
        assert.equal(
          (await member.request("/admin/subscription-plan")).status,
          403,
        );
        const old = await service.plan();
        const price = await service.updatePlan(owner.id, {
          name: "Plan mensuel test",
          amount: "15000",
          currency: "XAF",
          expectedPriceId: old.history[0]?.id ?? null,
        });
        priceId = price.id;
        assert.equal(
          (await admin.request("/admin/subscription-plan")).status,
          200,
        );
        await assert.rejects(
          service.updatePlan(owner.id, {
            name: "Conflict",
            amount: "1",
            currency: "XAF",
            expectedPriceId: null,
          }),
        );
        await assert.rejects(
          db.subscriptionPlan.create({
            data: { code: randomUUID(), name: "Forbidden second active offer" },
          }),
        );
      },
    );
    await t.test(
      "limited subscription access without active period; new operation denied, reads retained",
      async () => {
        assert.equal(
          (await member.request("/company/subscription")).body.status,
          "NONE",
        );
        await assert.rejects(
          authorizeTenant(
            authorizationStore(db),
            { userId: tenant.id, companyId: company.id },
            "stocks.reserve",
          ),
          { code: "SUBSCRIPTION_REQUIRED" },
        );
        await authorizeTenant(
          authorizationStore(db, () => now),
          { userId: tenant.id, companyId: company.id },
          "orders.read",
        );
      },
    );
    await t.test(
      "declaration persists pending, cannot forge tenant or auto-activate, idempotent retry and duplicate reference",
      async () => {
        assert.equal(
          (
            await member.request("/company/subscription/payments", "POST", {
              ...declaration(),
              companyId: foreign.id,
            })
          ).status,
          400,
        );
        const input = declaration();
        const p = await member.request(
          "/company/subscription/payments",
          "POST",
          input,
        );
        assert.equal(p.status, 201, JSON.stringify(p.body));
        firstPayment = p.body.id;
        assert.equal(p.body.status, "PENDING");
        assert.equal(
          (
            await member.request(
              "/company/subscription/payments",
              "POST",
              input,
            )
          ).body.id,
          firstPayment,
        );
        assert.equal(
          (
            await member.request("/company/subscription/payments", "POST", {
              ...input,
              idempotencyKey: randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal(
          await db.subscriptionPeriod.count({
            where: { companyId: company.id },
          }),
          0,
        );
        assert.equal(
          (
            await db.subscription.findUniqueOrThrow({
              where: { companyId: company.id },
            })
          ).status,
          "PENDING",
        );
      },
    );
    await t.test(
      "foreign detail and validation denied, global approval gets exact server preview",
      async () => {
        const p = await service.declare(tenant.id, foreign.id, declaration());
        assert.equal(
          (await member.request(`/company/subscription/payments/${p.id}`))
            .status,
          404,
        );
        assert.equal(
          (
            await member.request(
              `/admin/subscription-payments/${firstPayment}/approve`,
              "POST",
              { previewToken: "bad" },
            )
          ).status,
          403,
        );
        const preview = await admin.request(
          `/admin/subscription-payments/${firstPayment}/preview`,
        );
        assert.equal(preview.status, 200);
        assert.equal(preview.body.startsAt, now.toISOString());
        assert.equal(preview.body.endsAt, nextMonth(now).toISOString());
        const approved = await admin.request(
          `/admin/subscription-payments/${firstPayment}/approve`,
          "POST",
          { previewToken: preview.body.previewToken },
        );
        assert.equal(approved.status, 200, JSON.stringify(approved.body));
        firstPeriod = approved.body.id;
        const s = await db.subscription.findUniqueOrThrow({
          where: { companyId: company.id },
        });
        assert.equal(s.status, "ACTIVE");
        assert.equal(s.lastActivatedAt?.toISOString(), now.toISOString());
        await authorizeTenant(
          authorizationStore(db, () => now),
          { userId: tenant.id, companyId: company.id },
          "stocks.reserve",
        );
      },
    );
    await t.test(
      "double approval cannot create another period; processed SQL payment is immutable",
      async () => {
        const token = service.sign({});
        await assert.rejects(service.approve(owner.id, firstPayment, token), {
          code: "PAYMENT_PROCESSED",
        });
        assert.equal(
          await db.subscriptionPeriod.count({
            where: { paymentId: firstPayment },
          }),
          1,
        );
        await assert.rejects(
          db.subscriptionPayment.update({
            where: { id: firstPayment },
            data: { amount: "1" },
          }),
        );
        await assert.rejects(
          db.subscriptionPeriod.update({
            where: { id: firstPeriod },
            data: { amountApplied: "1" },
          }),
        );
      },
    );
    await t.test(
      "two concurrent validators grant exactly one monthly extension",
      async () => {
        now = new Date(now.getTime() + 1000);
        const p = await service.declare(tenant.id, company.id, declaration()),
          preview = await service.preview(p.id);
        const results = await Promise.allSettled([
          service.approve(owner.id, p.id, preview.previewToken),
          service.approve(second.id, p.id, preview.previewToken),
        ]);
        assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
        assert.equal(
          await db.subscriptionPeriod.count({ where: { paymentId: p.id } }),
          1,
        );
        const periods = await db.subscriptionPeriod.findMany({
          where: { companyId: company.id },
          orderBy: { startsAt: "asc" },
        });
        assert.equal(periods.length, 2);
        assert.equal(
          periods[0]!.endsAt.toISOString(),
          periods[1]!.startsAt.toISOString(),
        );
        assert.equal(
          periods[1]!.endsAt.toISOString(),
          nextMonth(periods[0]!.endsAt).toISOString(),
        );
      },
    );
    await t.test(
      "concurrent different payments invalidate the stale preview instead of overlapping periods",
      async () => {
        const a = await service.declare(tenant.id, company.id, declaration()),
          b = await service.declare(tenant.id, company.id, declaration());
        const pa = await service.preview(a.id),
          pb = await service.preview(b.id);
        const results = await Promise.allSettled([
          service.approve(owner.id, a.id, pa.previewToken),
          service.approve(second.id, b.id, pb.previewToken),
        ]);
        assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
        const failed = results.findIndex((v) => v.status === "rejected");
        const id = failed === 0 ? a.id : b.id;
        await service.approve(
          owner.id,
          id,
          (await service.preview(id)).previewToken,
        );
      },
    );
    await t.test(
      "rejection requires reason and preserves audit; own declaration cannot be approved",
      async () => {
        const p = await service.declare(tenant.id, company.id, declaration());
        assert.equal(
          (
            await admin.request(
              `/admin/subscription-payments/${p.id}/reject`,
              "POST",
              { reason: "" },
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.request(
              `/admin/subscription-payments/${p.id}/reject`,
              "POST",
              { reason: "Référence non retrouvée hors plateforme" },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await db.subscriptionPayment.findUniqueOrThrow({
              where: { id: p.id },
            })
          ).rejectionReason,
          "Référence non retrouvée hors plateforme",
        );
        await assert.rejects(service.reject(owner.id, p.id, "Again"));
        const corrected = await service.declare(tenant.id, company.id, {
          ...declaration(),
          externalReference: p.externalReference,
        });
        assert.notEqual(corrected.id, p.id);
        assert.equal(
          (
            await db.subscriptionPayment.findUniqueOrThrow({
              where: { id: p.id },
            })
          ).status,
          "REJECTED",
        );
        await db.companyMembership.create({
          data: {
            companyId: company.id,
            userId: owner.id,
            roleId: companyRole.id,
          },
        });
        const own = await service.declare(owner.id, company.id, declaration());
        await assert.rejects(
          service.approve(
            owner.id,
            own.id,
            (await service.preview(own.id)).previewToken,
          ),
          { code: "SELF_APPROVAL" },
        );
      },
    );
    await t.test(
      "J-3 and expiry-day notifications deduplicate on repeated jobs",
      async () => {
        const s = await db.subscription.findUniqueOrThrow({
          where: { companyId: company.id },
        });
        now = new Date(s.expiresAt!.getTime() - 3 * 86400000);
        await jobs.reminders();
        await jobs.reminders();
        assert.equal(
          await db.notification.count({
            where: {
              companyId: company.id,
              sourceEvent: "SUBSCRIPTION_REMINDER",
            },
          }),
          2,
        );
        now = new Date(s.expiresAt!.getTime());
        await jobs.reminders();
        await jobs.reminders();
        assert.equal(
          await db.notification.count({
            where: { companyId: company.id, sourceEvent: "SUBSCRIPTION_DUE" },
          }),
          2,
        );
      },
    );
    await t.test(
      "expiry is automatic, idempotent, conserves data and blocks even before job",
      async () => {
        const s = await db.subscription.findUniqueOrThrow({
          where: { companyId: company.id },
        });
        await assert.rejects(
          db.$transaction((tx) =>
            assertNewOperation(
              tx,
              { userId: tenant.id, companyId: company.id },
              "stocks.reserve",
              now,
            ),
          ),
          { code: "SUBSCRIPTION_REQUIRED" },
        );
        await jobs.expire();
        await jobs.expire();
        assert.equal(
          (await db.subscription.findUniqueOrThrow({ where: { id: s.id } }))
            .status,
          "EXPIRED",
        );
        assert.equal(
          await db.subscriptionEvent.count({
            where: { companyId: company.id, status: "EXPIRED" },
          }),
          1,
        );
        assert.equal(
          await db.subscriptionPeriod.count({
            where: { companyId: company.id },
          }),
          4,
        );
        assert.equal(
          (await member.request("/company/subscription")).status,
          200,
        );
      },
    );
    await t.test(
      "renewal after expiration starts at server reactivation, preserves periods and administrative suspension",
      async () => {
        now = new Date(now.getTime() + 86400000);
        const p = await service.declare(tenant.id, company.id, declaration()),
          v = await service.preview(p.id);
        assert.equal(v.startsAt.toISOString(), now.toISOString());
        await db.company.update({
          where: { id: company.id },
          data: { status: "SUSPENDED" },
        });
        await service.approve(owner.id, p.id, v.previewToken);
        assert.equal(
          (await db.company.findUniqueOrThrow({ where: { id: company.id } }))
            .status,
          "SUSPENDED",
        );
        assert.equal(
          (
            await db.subscription.findUniqueOrThrow({
              where: { companyId: company.id },
            })
          ).status,
          "ACTIVE",
        );
        assert.equal(
          (await member.request("/company/subscription")).status,
          403,
        );
        await db.company.update({
          where: { id: company.id },
          data: { status: "ACTIVE" },
        });
      },
    );
    await t.test(
      "price changes preserve previous periods and reject stale price confirmations",
      async () => {
        const pending = await service.declare(
            tenant.id,
            foreign.id,
            declaration(),
          ),
          v = await service.preview(pending.id);
        const price = await service.updatePlan(owner.id, {
          name: "Tarif mis à jour",
          amount: "16000",
          currency: "XAF",
          expectedPriceId: priceId,
        });
        priceId = price.id;
        await assert.rejects(
          service.approve(owner.id, pending.id, v.previewToken),
          { code: "PREVIEW_STALE" },
        );
        await assert.rejects(service.preview(pending.id), {
          code: "PRICE_MISMATCH",
        });
        assert.equal(
          (
            await db.subscriptionPeriod.findUniqueOrThrow({
              where: { id: firstPeriod },
            })
          ).amountApplied.toString(),
          "15000",
        );
        const latest = await db.subscriptionPrice.findUniqueOrThrow({
          where: { id: priceId },
        });
        assert.equal(latest.amount.toString(), "16000");
      },
    );
    await t.test(
      "notifications survive SMTP failure, retry under lease and reach real local SMTP",
      async () => {
        const before = await db.notification.count({
          where: { companyId: company.id },
        });
        assert.ok(before > 0);
        const failed = await jobs.notifications(
          {
            send: async () => {
              throw new Error("offline");
            },
          },
          100,
        );
        assert.ok(failed.failed > 0);
        const ready = new Date(now.getTime() + 6 * 60000);
        now = ready;
        const messages: string[] = [];
        const smtp = await localSmtp((message) => messages.push(message));
        try {
          const result = await jobs.notifications(
            subscriptionMailer({
              NODE_ENV: "test",
              SMTP_HOST: "127.0.0.1",
              SMTP_PORT: smtp.port,
              SMTP_FROM: "saas@example.invalid",
              SMTP_SECURE: "false",
            }),
            100,
          );
          assert.ok(result.sent > 0);
          assert.ok(messages.some((v) => v.includes("DND Delivery")));
          const again = await jobs.notifications(
            {
              send: async () => {
                throw new Error("unexpected");
              },
            },
            100,
          );
          assert.equal(again.sent, 0);
          assert.equal(again.failed, 0);
        } finally {
          await smtp.close();
        }
      },
    );
    await t.test(
      "global search/pagination, financial totals by currency and immutable history are real",
      async () => {
        const q = pageQuery.parse({ q: suffix, size: 1 });
        const rows = await repo.subscriptions(q);
        assert.equal(rows.items.length, 1);
        assert.equal(rows.total, 2);
        assert.ok((await repo.periods(q, company.id)).total >= 5);
        const stats = await repo.overview(366);
        assert.ok(stats.approved >= 5);
        assert.ok(stats.amounts.every((v) => typeof v.amount === "string"));
        assert.ok(
          await db.auditLog.count({
            where: { companyId: company.id, action: "SUBSCRIPTION_RENEWED" },
          }),
        );
      },
    );
    await t.test(
      "multi-tenant user switches away from expired company without losing account",
      async () => {
        const s = await db.subscription.findUniqueOrThrow({
          where: { companyId: foreign.id },
        });
        await db.subscription.update({
          where: { id: s.id },
          data: { status: "EXPIRED" },
        });
        await auth.switchOrganization(
          member.principal,
          `company:${foreign.id}`,
        );
        const profile = await auth.profile({
          ...member.principal,
          session: await db.session.findUniqueOrThrow({
            where: { id: member.principal.session.id },
          }),
        });
        assert.equal(profile.activeContext?.companyId, foreign.id);
        assert.equal(profile.activeContext?.subscriptionAccess?.valid, false);
        await auth.switchOrganization(
          {
            ...member.principal,
            session: await db.session.findUniqueOrThrow({
              where: { id: member.principal.session.id },
            }),
          },
          `company:${company.id}`,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: tenant.id } }))
            .status,
          "ACTIVE",
        );
      },
    );
    await t.test(
      "safe closure denies unknown deliveries, cross-tenant and create/assignment actions",
      async () => {
        await assert.rejects(
          db.$transaction((tx) =>
            assertSafeClosure(
              tx,
              { userId: tenant.id, companyId: company.id },
              randomUUID(),
              "DELIVERY_CLOSE",
              now,
            ),
          ),
        );
        await assert.rejects(
          db.$transaction((tx) =>
            assertSafeClosure(
              tx,
              { userId: tenant.id, companyId: company.id },
              randomUUID(),
              "CREATE" as "DELIVERY_CLOSE",
              now,
            ),
          ),
        );
      },
    );
    await t.test(
      "safe closure allows a previously picked-up parcel, rejects late pickup and another company",
      async () => {
        const s = await db.subscription.findUniqueOrThrow({
          where: { companyId: company.id },
        });
        const agency = await db.agency.create({
          data: {
            name: "Closure test agency",
            reference: randomUUID(),
            companyId: company.id,
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
            city: contact.city,
          },
        });
        const shop = await db.shop.create({
          data: {
            reference: randomUUID(),
            name: "Closure test shop",
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
          },
        });
        await db.companyShop.create({
          data: { companyId: company.id, shopId: shop.id, status: "ACTIVE" },
        });
        const order = await db.order.create({
          data: {
            companyId: company.id,
            shopId: shop.id,
            agencyId: agency.id,
            publicNumber: randomUUID(),
            createdById: tenant.id,
            type: "ONE_OFF",
            recipientName: "Test recipient",
            recipientEmail: contact.email,
            recipientPhone: contact.phone,
            recipientAddress: contact.address,
            recipientCity: contact.city,
            amountToCollect: "0",
            currency: "XAF",
          },
        });
        const courierRole = await db.role.create({
          data: {
            code: `closure_${suffix}`,
            name: "Closure courier test",
            scope: "AGENCY",
          },
        });
        await db.agencyMembership.create({
          data: {
            companyId: company.id,
            agencyId: agency.id,
            userId: tenant.id,
            roleId: courierRole.id,
            roleScope: "AGENCY",
          },
        });
        const delivery = await db.delivery.create({
          data: {
            companyId: company.id,
            orderId: order.id,
            agencyId: agency.id,
            courierId: tenant.id,
            status: "IN_PROGRESS",
            assignedAt: new Date(s.expiresAt!.getTime() - 2000),
            pickedUpAt: new Date(s.expiresAt!.getTime() - 1000),
          },
        });
        const expired = new Date(s.expiresAt!.getTime() + 1),
          selection = { userId: tenant.id, companyId: company.id };
        for (const action of [
          "DELIVERY_CLOSE",
          "DELIVERY_PROOF",
          "COLLECTION_DECLARE",
        ] as const)
          assert.equal(
            (
              await db.$transaction((tx) =>
                assertSafeClosure(tx, selection, delivery.id, action, expired),
              )
            ).id,
            delivery.id,
          );
        await assert.rejects(
          db.$transaction((tx) =>
            assertSafeClosure(
              tx,
              { ...selection, companyId: foreign.id },
              delivery.id,
              "DELIVERY_CLOSE",
              expired,
            ),
          ),
        );
        await db.delivery.update({
          where: { id: delivery.id },
          data: { pickedUpAt: s.expiresAt },
        });
        await assert.rejects(
          db.$transaction((tx) =>
            assertSafeClosure(
              tx,
              selection,
              delivery.id,
              "DELIVERY_CLOSE",
              expired,
            ),
          ),
        );
        assert.equal(
          await db.delivery.count({ where: { id: delivery.id } }),
          1,
        );
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
