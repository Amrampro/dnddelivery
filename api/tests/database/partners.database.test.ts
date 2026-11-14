import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { createDatabase } from "../../src/database/client.js";
import {
  PartnerService,
  type PartnerContext,
} from "../../src/modules/partners/service.js";
import { PartnerNotifications } from "../../src/modules/partners/notifications.js";
import {
  createPartnerRouter,
  createCompanyPartnerRouter,
  createPartnerRegistrationRouter,
} from "../../src/modules/partners/routes.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword, tokenHash } from "../../src/modules/auth/crypto.js";
import { errors } from "../../src/middlewares/errors.js";
import { loadWorkspaces } from "../../src/modules/auth/workspaces.js";
import { assertActiveCollaboration } from "../../src/modules/partners/access.js";
import * as v from "../../src/modules/partners/validation.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL partner shops: verified identity, multi-company collaboration, mobile decisions and isolation", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8),
    password = "Partner fixture password 2026",
    hash = await hashPassword(password);
  const owner = await db.user.create({
    data: {
      email: `partner-owner-${suffix}@example.invalid`,
      fullName: "Shop owner",
      passwordHash: hash,
    },
  });
  const admin = await db.user.create({
    data: {
      email: `partner-admin-${suffix}@example.invalid`,
      fullName: "Company administrator",
      passwordHash: hash,
    },
  });
  const outsider = await db.user.create({
    data: {
      email: `partner-outsider-${suffix}@example.invalid`,
      fullName: "Outsider",
      passwordHash: hash,
    },
  });
  const contact = {
    email: "partner-test@example.invalid",
    phone: "0000000000",
    address: "Fixture address",
    city: "Douala",
    countryCode: "CM",
  };
  const companies: Array<{ id: string; reference: string }> = [];
  const role = await db.role.findUniqueOrThrow({
    where: { code: "company_admin" },
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
  for (const key of ["X", "Y", "Z"]) {
    const company = await db.company.create({
      data: {
        ...contact,
        reference: `PARTNER-${key}-${suffix}`,
        name: `Carrier ${key}`,
        status: "ACTIVE",
      },
    });
    companies.push(company);
    await db.companyMembership.create({
      data: { companyId: company.id, userId: admin.id, roleId: role.id },
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
  }
  const x = companies[0]!,
    y = companies[1]!,
    z = companies[2]!;
  await db.agency.create({
    data: {
      address: contact.address,
      phone: contact.phone,
      companyId: x.id,
      reference: "CENTRE",
      name: "Partner authorized agency",
      city: "Douala",
    },
  });
  const mails: Array<{ to: string; link: string }> = [];
  let failMail = false;
  const service = new PartnerService(
    db,
    {
      available: () => !failMail,
      send: async (to, link) => {
        mails.push({ to, link });
      },
    },
    "http://localhost:5173",
  );
  const auth = new AuthService(
    prismaAuthStore(db),
    {
      secret: "partner-test-secret-32-characters-minimum",
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
    "/api/partners",
    createPartnerRouter(
      false,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(
    "/api/company",
    createCompanyPartnerRouter(
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(
    "/api/partner-registration",
    createPartnerRegistrationRouter(
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    access?: string,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "X-DND-Client": "mobile",
        "Content-Type": "application/json",
        ...(access ? { Authorization: "Bearer " + access } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  }
  async function client(email: string, key?: string) {
    const login = await auth.login(email, password, {
      client: "MOBILE",
      deviceName: "Partner mobile test",
      userAgent: null,
      ipHash: null,
    });
    const principal = await auth.authenticate(login.accessToken, "MOBILE");
    if (key) await auth.switchOrganization(principal, key);
    return {
      principal,
      request: (path: string, method = "GET", body?: unknown) =>
        request(path, method, body, login.accessToken),
    };
  }
  const token = () =>
    new URLSearchParams(new URL(mails.at(-1)!.link).hash.slice(1)).get(
      "token",
    )!;
  const registration = (email = owner.email) => ({
    name: "Fixture shop " + suffix,
    email,
    phone: contact.phone,
    address: contact.address,
    countryCode: "CM",
    city: "Douala",
    district: "Centre",
    legalName: null,
    description: null,
    fullName: "Shop owner",
    termsAccepted: true as const,
    website: "" as const,
  });
  let shopId = "",
    collabX = "",
    collabY = "",
    staffId = "";
  const context = (): PartnerContext => ({
    actorId: owner.id,
    scope: "SHOP",
    shopId,
  });
  const xc: PartnerContext = {
    actorId: admin.id,
    scope: "COMPANY",
    companyId: x.id,
  };
  let shopClient: Awaited<ReturnType<typeof client>>,
    companyClient: Awaited<ReturnType<typeof client>>;
  try {
    await t.test(
      "registration verifies email before assigning ownership and rejects automated/invalid input",
      async () => {
        const bad = await request("/partner-registration", "POST", {
          ...registration(),
          website: "spam",
        });
        assert.equal(bad.status, 400);
        const good = await request(
          "/partner-registration",
          "POST",
          registration(),
        );
        assert.equal(good.status, 202);
        assert.equal(
          await db.shopMembership.count({ where: { userId: owner.id } }),
          0,
        );
        assert.ok(mails.length === 1);
        const p = await db.shopInvitation.findUniqueOrThrow({
          where: { tokenHash: tokenHash(token()) },
        });
        assert.equal(p.email, owner.email);
        assert.ok(!JSON.stringify(p.payload).includes(token()));
      },
    );
    await t.test(
      "existing account recipient must authenticate; foreign user cannot claim shop or replace password",
      async () => {
        const raw = token(),
          old = owner.passwordHash;
        const no = await request("/partner-registration/accept", "POST", {
          token: raw,
          termsAccepted: true,
          password,
        });
        assert.equal(no.status, 403);
        const other = await client(outsider.email);
        const wrong = await other.request(
          "/partner-registration/accept-existing",
          "POST",
          { token: raw, termsAccepted: true },
        );
        assert.equal(wrong.status, 403);
        const target = await client(owner.email);
        const accepted = await target.request(
          "/partner-registration/accept-existing",
          "POST",
          { token: raw, termsAccepted: true },
        );
        assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
        shopId = accepted.body.shopId;
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
            .passwordHash,
          old,
        );
        assert.ok(
          (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
            .emailVerifiedAt,
        );
        assert.equal(
          (
            await request("/partner-registration/inspect", "POST", {
              token: raw,
            })
          ).status,
          410,
        );
      },
    );
    await t.test(
      "independent shop context exists without a carrier; profile edit is versioned and role cannot be forged",
      async () => {
        const ws = await loadWorkspaces(db, owner.id);
        assert.equal(ws.filter((w) => w.shopId === shopId).length, 1);
        shopClient = await client(owner.email, "shop-home:" + shopId);
        companyClient = await client(admin.email, "company:" + x.id);
        const p = await shopClient.request("/partners/profile");
        assert.equal(p.status, 200);
        assert.equal(p.body.name, registration().name);
        const input = { ...registration(), version: p.body.version };
        const { fullName, termsAccepted, website, ...profile } = input;
        void fullName;
        void termsAccepted;
        void website;
        const updated = await shopClient.request("/partners/profile", "PATCH", {
          ...profile,
          name: "Updated fixture shop",
        });
        assert.equal(updated.status, 200);
        assert.equal(
          (await shopClient.request("/partners/profile", "PATCH", profile))
            .status,
          409,
        );
        assert.equal(
          (
            await shopClient.request("/partners/profile", "PATCH", {
              ...profile,
              role: "shop_owner",
            })
          ).status,
          400,
        );
        assert.equal((await request("/partners/profile")).status, 401);
      },
    );
    await t.test(
      "shop requests first carrier; same side cannot self-accept and duplicate requests are rejected",
      async () => {
        const p = await shopClient.request("/partners/collaborations", "POST", {
          companyReference: x.reference,
        });
        assert.equal(p.status, 201, JSON.stringify(p.body));
        collabX = p.body.id;
        assert.equal(p.body.status, "PENDING");
        assert.equal(
          (
            await shopClient.request(
              `/partners/collaborations/${collabX}/accept`,
              "POST",
              { version: p.body.version },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await shopClient.request("/partners/collaborations", "POST", {
              companyReference: x.reference,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "company accepts on authenticated mobile; active collaboration visible to both",
      async () => {
        const pending = await companyClient.request(
          "/company/partner-requests",
        );
        assert.equal(pending.status, 200);
        assert.ok(
          pending.body.items.some((p: { id: string }) => p.id === collabX),
        );
        const current = await companyClient.request(
          "/company/partners/" + collabX,
        );
        const accepted = await companyClient.request(
          `/company/partners/${collabX}/accept`,
          "POST",
          { version: current.body.version },
        );
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.status, "ACTIVE");
        assert.equal(
          (await shopClient.request("/partners/collaborations/" + collabX)).body
            .status,
          "ACTIVE",
        );
      },
    );
    await t.test(
      "second company invitation requires shop acceptance; simultaneous partnerships are distinct",
      async () => {
        const yc: PartnerContext = {
          actorId: admin.id,
          scope: "COMPANY",
          companyId: y.id,
        };
        const p = await service.invitePartner(
          yc,
          v.companyInvite.parse({
            shopReference: (
              await db.shop.findUniqueOrThrow({ where: { id: shopId } })
            ).reference,
          }),
        );
        collabY = p.id;
        assert.equal((p as { status: string }).status, "PENDING");
        const accepted = await shopClient.request(
          `/partners/collaborations/${collabY}/accept`,
          "POST",
          { version: (p as { version: number }).version },
        );
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.status, "ACTIVE");
        assert.equal(
          await db.companyShop.count({ where: { shopId, status: "ACTIVE" } }),
          2,
        );
      },
    );
    await t.test(
      "carrier selector authorizes both active carriers but refuses arbitrary third company",
      async () => {
        const ws = await loadWorkspaces(db, owner.id);
        assert.ok(ws.some((w) => w.key === `shop:${x.id}:${shopId}`));
        assert.ok(ws.some((w) => w.key === `shop:${y.id}:${shopId}`));
        await auth.switchOrganization(
          shopClient.principal,
          `shop:${x.id}:${shopId}`,
        );
        await auth.switchOrganization(
          shopClient.principal,
          `shop:${y.id}:${shopId}`,
        );
        await assert.rejects(() =>
          auth.switchOrganization(
            shopClient.principal,
            `shop:${z.id}:${shopId}`,
          ),
        );
      },
    );
    await t.test(
      "company isolation hides other carrier collaboration and private directory contacts",
      async () => {
        assert.equal(
          (await companyClient.request("/company/partners/" + collabY)).status,
          404,
        );
        const list = await companyClient.request("/company/partners");
        assert.ok(
          list.body.items.every(
            (p: { companyId: string }) => p.companyId === x.id,
          ),
        );
        const directory = await shopClient.request(
          "/partners/directory/companies?reference=" + z.reference,
        );
        assert.equal(directory.body.items[0].id, z.id);
        assert.ok(!("email" in directory.body.items[0]));
        assert.ok(
          !(
            await companyClient.request("/company/partners/" + collabX)
          ).body.history.some(
            (e: { companyId?: string }) => e.companyId === y.id,
          ),
        );
      },
    );
    await t.test(
      "owner invites existing user without auto-grant and accepted employee cannot manage collaboration/users",
      async () => {
        const invited = await shopClient.request(
          "/partners/users/invite",
          "POST",
          {
            email: outsider.email,
            fullName: outsider.fullName,
            role: "shop_employee",
          },
        );
        assert.equal(invited.status, 201);
        assert.equal(
          await db.shopMembership.count({
            where: { shopId, userId: outsider.id },
          }),
          0,
        );
        const raw = token(),
          target = await client(outsider.email);
        const accepted = await target.request(
          "/partner-registration/accept-existing",
          "POST",
          { token: raw, termsAccepted: true },
        );
        assert.equal(accepted.status, 200);
        staffId = outsider.id;
        const employee = await client(outsider.email, "shop-home:" + shopId);
        assert.equal(
          (await employee.request("/partners/collaborations")).status,
          200,
        );
        assert.equal(
          (
            await employee.request("/partners/users/invite", "POST", {
              email: "fake@example.invalid",
              fullName: "Fake owner",
              role: "shop_owner",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await employee.request(
              `/partners/collaborations/${collabX}/suspend`,
              "POST",
              { version: 2, reason: "Forbidden" },
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "new invited user securely creates account; last owner removal is protected",
      async () => {
        const email = `partner-new-${suffix}@example.invalid`;
        const invited = await shopClient.request(
          "/partners/users/invite",
          "POST",
          { email, fullName: "New partner employee", role: "shop_manager" },
        );
        assert.equal(invited.status, 201);
        const accepted = await request("/partner-registration/accept", "POST", {
          token: token(),
          fullName: "New employee",
          password,
          termsAccepted: true,
        });
        assert.equal(accepted.status, 200);
        assert.ok(
          (
            await db.user.findUniqueOrThrow({ where: { email } })
          ).passwordHash.startsWith("$argon2id$"),
        );
        const m = await db.shopMembership.findUniqueOrThrow({
          where: { shopId_userId: { shopId, userId: owner.id } },
        });
        assert.equal(
          (
            await shopClient.request("/partners/users/" + owner.id, "DELETE", {
              version: m.version,
              reason: "Cannot remove last owner",
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "invitation sender permissions are rechecked at acceptance",
      async () => {
        const email = `partner-expired-sender-${suffix}@example.invalid`;
        await service.inviteUser(
          context(),
          v.invite.parse({
            email,
            fullName: "Not admitted",
            role: "shop_employee",
          }),
        );
        const raw = token();
        await db.shopMembership.update({
          where: { shopId_userId: { shopId, userId: owner.id } },
          data: { active: false },
        });
        await assert.rejects(() =>
          service.accept(
            v.accept.parse({ token: raw, password, termsAccepted: true }),
          ),
        );
        assert.equal(await db.user.count({ where: { email } }), 0);
        await db.shopMembership.update({
          where: { shopId_userId: { shopId, userId: owner.id } },
          data: { active: true },
        });
      },
    );
    await t.test(
      "company suspension revokes carrier selection, preserves history and other active carrier",
      async () => {
        const p = await service.detail(xc, collabX);
        const suspended = await companyClient.request(
          `/company/partners/${collabX}/suspend`,
          "POST",
          { version: p.version, reason: "Quality review" },
        );
        assert.equal(suspended.status, 200);
        assert.equal(suspended.body.status, "SUSPENDED");
        const ws = await loadWorkspaces(db, owner.id);
        assert.ok(!ws.some((w) => w.key === `shop:${x.id}:${shopId}`));
        assert.ok(ws.some((w) => w.key === `shop:${y.id}:${shopId}`));
        assert.equal(
          (await shopClient.request("/partners/collaborations/" + collabX))
            .status,
          200,
        );
        await assert.rejects(() =>
          db.$transaction((tx) => assertActiveCollaboration(tx, x.id, shopId)),
        );
      },
    );
    await t.test(
      "suspended partnership needs new explicit request and opposite approval; stale/concurrent decisions conflict",
      async () => {
        let p = await service.detail(context(), collabX);
        p = await service.action(context(), collabX, "request", {
          version: p.version,
        });
        assert.equal(p.status, "PENDING");
        const results = await Promise.allSettled([
          service.action(xc, collabX, "accept", { version: p.version }),
          service.action(xc, collabX, "accept", { version: p.version }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(results.filter((r) => r.status === "rejected").length, 1);
        assert.equal(
          (await service.detail(context(), collabX)).status,
          "ACTIVE",
        );
      },
    );
    await t.test(
      "rejection and termination keep histories and cannot silently reactivate",
      async () => {
        const zc: PartnerContext = {
          actorId: admin.id,
          scope: "COMPANY",
          companyId: z.id,
        };
        let p = await service.request(
          context(),
          v.request.parse({ companyReference: z.reference }),
        );
        p = await service.action(zc, p.id, "reject", {
          version: p.version,
          reason: "Capacity unavailable",
        });
        assert.equal(p.status, "REJECTED");
        await assert.rejects(() =>
          service.action(context(), p.id, "accept", { version: p.version }),
        );
        let current = await service.detail(context(), collabX);
        current = await service.action(context(), collabX, "terminate", {
          version: current.version,
          reason: "End of agreement",
        });
        assert.equal(current.status, "ENDED");
        assert.ok(current.history.length >= 5);
        assert.equal(await db.companyShop.count({ where: { id: collabX } }), 1);
        await assert.rejects(() =>
          service.action(xc, collabX, "accept", { version: current.version }),
        );
      },
    );
    await t.test(
      "expired carrier blocks new work while other carrier and independent shop profile stay usable",
      async () => {
        await db.subscription.update({
          where: { companyId: x.id },
          data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 1000) },
        });
        const p = await service.detail(context(), collabX);
        await assert.rejects(() =>
          service.action(context(), collabX, "request", { version: p.version }),
        );
        assert.equal(
          (await shopClient.request("/partners/profile")).status,
          200,
        );
        assert.equal(
          (await companyClient.request("/company/partners/" + collabX)).status,
          200,
        );
        await db.$transaction((tx) =>
          assertActiveCollaboration(tx, y.id, shopId),
        );
        const ws = await loadWorkspaces(db, owner.id);
        assert.ok(
          ws.some(
            (w) =>
              w.key === `shop:${y.id}:${shopId}` && w.subscriptionAccess?.valid,
          ),
        );
      },
    );
    await t.test(
      "SMTP failure does not undo invitation, resend rotates token, revoke and expiry reject old tokens",
      async () => {
        failMail = true;
        const result = await service.inviteUser(
          context(),
          v.invite.parse({
            email: `partner-fail-${suffix}@example.invalid`,
            fullName: "Mail failure",
            role: "shop_employee",
          }),
        );
        assert.equal(result.deliveryStatus, "FAILED");
        const old = await db.shopInvitation.findUniqueOrThrow({
          where: { id: result.id },
        });
        failMail = false;
        await service.invitationAction(context(), result.id, "resend");
        assert.notEqual(
          (
            await db.shopInvitation.findUniqueOrThrow({
              where: { id: result.id },
            })
          ).tokenHash,
          old.tokenHash,
        );
        const raw = token();
        await service.invitationAction(context(), result.id, "revoke");
        await assert.rejects(() => service.inspect(raw));
      },
    );
    await t.test(
      "failed registration delivery can retry without duplicate shop or invitation; SENT duplicate stays generic",
      async () => {
        const email = `partner-signup-failure-${suffix}@example.invalid`;
        failMail = true;
        await service.register(v.registration.parse(registration(email)));
        const pending = await db.shopInvitation.findFirstOrThrow({
          where: { email, kind: "REGISTRATION" },
        });
        assert.equal(pending.deliveryStatus, "FAILED");
        failMail = false;
        const before = mails.length;
        await service.register(
          v.registration.parse({
            ...registration(email),
            name: "Ignored replacement",
          }),
        );
        const resent = await db.shopInvitation.findUniqueOrThrow({
          where: { id: pending.id },
        });
        assert.equal(resent.deliveryStatus, "SENT");
        assert.notEqual(resent.tokenHash, pending.tokenHash);
        assert.equal(
          (resent.payload as { name: string }).name,
          registration(email).name,
        );
        assert.equal(mails.length, before + 1);
        await service.register(v.registration.parse(registration(email)));
        assert.equal(mails.length, before + 1);
        assert.equal(
          await db.shopInvitation.count({
            where: { email, kind: "REGISTRATION" },
          }),
          1,
        );
        assert.equal(await db.shop.count({ where: { email } }), 0);
      },
    );
    await t.test(
      "company can prepare unknown shop signup; verified recipient creates pending collaboration only",
      async () => {
        const yc: PartnerContext = {
          actorId: admin.id,
          scope: "COMPANY",
          companyId: y.id,
        };
        const email = `partner-invitedshop-${suffix}@example.invalid`;
        const result = await service.invitePartner(
          yc,
          v.companyInvite.parse({ email, shopName: "Invited shop" }),
        );
        assert.equal(
          "deliveryStatus" in result ? result.deliveryStatus : null,
          "SENT",
        );
        const raw = token();
        assert.equal((await service.inspect(raw)).requiresProfile, true);
        const created = await service.accept(
          v.accept.parse({
            token: raw,
            password,
            termsAccepted: true,
            profile: (({ fullName, termsAccepted, website, ...p }) => {
              void fullName;
              void termsAccepted;
              void website;
              return p;
            })(registration(email)),
          }),
        );
        const p = await db.companyShop.findUniqueOrThrow({
          where: {
            companyId_shopId: { companyId: y.id, shopId: created.shopId },
          },
        });
        assert.equal(p.status, "PENDING");
        assert.equal(p.origin, "COMPANY");
      },
    );
    await t.test(
      "notifications are deduplicated, durable and worker failure can be retried without business rollback",
      async () => {
        await db.$transaction((tx) => service.enqueue(tx, collabY, "ACCEPTED"));
        const before = await db.notification.count({
          where: { sourceId: collabY },
        });
        await db.$transaction((tx) => service.enqueue(tx, collabY, "ACCEPTED"));
        assert.equal(
          await db.notification.count({ where: { sourceId: collabY } }),
          before,
        );
        const jobs = new PartnerNotifications(service);
        const failed = await jobs.run(
          {
            send: async () => {
              throw Error("SMTP fixture failure");
            },
          },
          1000,
        );
        assert.ok(failed.failed > 0);
        assert.equal(
          (await service.detail(context(), collabY)).status,
          "ACTIVE",
        );
        await db.notification.updateMany({
          where: { sourceEvent: { startsWith: "PARTNER_" }, status: "FAILED" },
          data: { availableAt: new Date(Date.now() - 1) },
        });
        const sent = await jobs.run({ send: async () => {} }, 1000);
        assert.ok(sent.sent > 0);
        const inbox = await shopClient.request("/partners/notifications");
        assert.equal(inbox.status, 200);
        assert.ok(
          inbox.body.items.some(
            (n: { sourceEvent: string }) =>
              n.sourceEvent === "PARTNER_ACCEPTED",
          ),
        );
      },
    );
    await t.test(
      "audit contains actors and scoped history without tokens/hashes; removal preserves global account",
      async () => {
        const m = await db.shopMembership.findUniqueOrThrow({
          where: { shopId_userId: { shopId, userId: staffId } },
        });
        await service.removeUser({ ...context(), companyId: y.id }, staffId, {
          version: m.version,
          reason: "End of employment",
        });
        assert.ok(await db.user.findUnique({ where: { id: staffId } }));
        assert.equal(
          (await db.shopMembership.findUniqueOrThrow({ where: { id: m.id } }))
            .active,
          false,
        );
        const removal = await db.auditLog.findFirstOrThrow({
          where: { entityId: shopId, action: "PARTNER_USER_REMOVED" },
          orderBy: { createdAt: "desc" },
        });
        assert.equal(removal.companyId, null);
        const peer = await service.detail(
          { actorId: admin.id, scope: "COMPANY", companyId: y.id },
          collabY,
        );
        assert.ok(
          peer.history.every((a) => !a.action.startsWith("PARTNER_USER_")),
        );
        assert.ok(!JSON.stringify(peer.history).includes(staffId));
        const peerHistory = await service.history(
          { actorId: admin.id, scope: "COMPANY", companyId: y.id },
          v.query.parse({}),
        );
        assert.ok(
          peerHistory.items.every((a) => !a.action.startsWith("PARTNER_USER_")),
        );
        assert.ok(!JSON.stringify(peerHistory).includes("End of employment"));
        const history = await service.history(context(), v.query.parse({}));
        assert.ok(history.items.length > 10);
        assert.ok(history.items.every((a) => a.actorId));
        assert.ok(!JSON.stringify(history).includes("tokenHash"));
        assert.ok(!JSON.stringify(history).includes("passwordHash"));
        assert.equal(
          (
            history.items.find((a) => a.action === "PARTNER_USER_REMOVED")
              ?.metadata as { reason: string }
          ).reason,
          "End of employment",
        );
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
