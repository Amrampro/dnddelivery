import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { CustomerService } from "../../src/modules/customers/service.js";
import { tokenHash, hashPassword } from "../../src/modules/auth/crypto.js";
import { recipientMessage } from "../../src/modules/confirmation/communications.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { getAuthSettings } from "../../src/config/auth.js";
import express from "express";
import cookieParser from "cookie-parser";
import { createCustomerRouter } from "../../src/modules/customers/routes.js";
import { createAdminRouter } from "../../src/modules/admin/routes.js";
import { errors } from "../../src/middlewares/errors.js";
import { disconnectDatabase } from "../../src/database/client.js";

test("customer registration, ownership and public/private tracking boundaries", async (t) => {
  const f = await confirmationFixture(true);
  const sent: { to: string; text: string }[] = [];
  const service = new CustomerService(
    f.db,
    {
      send: async (to, _subject, text) => {
        sent.push({ to, text });
      },
    },
    "https://example.invalid",
  );
  const password = "Test-client-only-2026!";
  const token = () => sent.at(-1)!.text.match(/#token=([A-Za-z0-9_-]+)/)![1]!;
  try {
    const mission = await f.fresh();
    const order = await f.db.order.findUniqueOrThrow({
      where: { id: mission.orderId },
    });
    let customerId = "";
    await t.test(
      "registration creates no account before email verification, and token is not stored raw",
      async () => {
        await service.register({
          email: order.recipientEmail,
          fullName: "Client Test",
          phone: "+237699123456",
          termsAccepted: true,
        });
        assert.equal(
          await f.db.user.findUnique({
            where: { email: order.recipientEmail },
          }),
          null,
        );
        const row = await f.db.customerRegistration.findUniqueOrThrow({
          where: { tokenHash: tokenHash(token()) },
        });
        assert.notEqual(row.tokenHash, token());
        await assert.rejects(
          service.accept({
            token: "invalid-token-that-is-not-a-real-token",
            password,
          }),
        );
        await service.accept({ token: token(), password });
        const customer = await f.db.user.findUniqueOrThrow({
          where: { email: order.recipientEmail },
        });
        customerId = customer.id;
        assert.equal(customer.customerEnabled, true);
        assert.ok(customer.emailVerifiedAt);
        await assert.rejects(service.accept({ token: token(), password }));
        assert.equal(
          (await f.db.order.findUniqueOrThrow({ where: { id: order.id } }))
            .customerUserId,
          customer.id,
        );
      },
    );
    await t.test(
      "verified customers log in without any professional affiliation",
      async () => {
        const auth = new AuthService(prismaAuthStore(f.db), getAuthSettings(), {
          available: () => false,
          send: async () => {},
        });
        const session = await auth.login(order.recipientEmail, password, {
          client: "MOBILE",
          deviceName: "test",
          userAgent: null,
          ipHash: null,
        });
        const profile = await auth.profile(
          await auth.authenticate(session.accessToken, "MOBILE"),
        );
        assert.equal(profile.user.customerEnabled, true);
        assert.equal(profile.organizations.length, 0);
      },
    );
    await t.test(
      "existing and future orders appear in the recipient account",
      async () => {
        const before = await service.orders(customerId, 1);
        assert.ok(before.items.some((o) => o.reference === order.publicNumber));
        const next = await f.fresh();
        assert.equal(
          (await f.db.order.findUniqueOrThrow({ where: { id: next.orderId } }))
            .customerUserId,
          customerId,
        );
        assert.equal((await service.orders(customerId, 1)).total, 2);
        assert.equal(
          (await f.orders.customerLookup(f.sc, order.recipientEmail)).customer
            ?.fullName,
          "Client Test",
        );
        await assert.rejects(
          f.orders.customerLookup(f.dc, order.recipientEmail),
        );
      },
    );
    await t.test(
      "public reference+email returns only status and safe events, no private access",
      async () => {
        const result = await f.tracking.publicStatus(
          { reference: order.publicNumber, email: order.recipientEmail },
          "test-" + randomUUID(),
        );
        assert.equal(result.reference, order.publicNumber);
        assert.ok(result.events.length > 0);
        for (const key of [
          "code",
          "otpAvailable",
          "recipientEmail",
          "recipientAddress",
          "recipientName",
          "company",
          "shop",
          "proofs",
        ])
          assert.equal(key in result, false);
        await assert.rejects(
          f.tracking.publicStatus(
            { reference: order.publicNumber, email: "wrong@example.invalid" },
            "test-" + randomUUID(),
          ),
        );
        await assert.rejects(f.tracking.code(order.publicNumber, ""));
      },
    );
    await t.test(
      "only owner can see order and receive the valid handover code",
      async () => {
        const detail = await f.tracking.detail(
          order.publicNumber,
          "",
          customerId,
        );
        assert.equal(detail.otpAvailable, true);
        const code = await f.tracking.code(order.publicNumber, "", customerId);
        assert.match(code.code, /^\d{6}$/);
        await assert.rejects(
          f.tracking.detail(order.publicNumber, "", f.owner.id),
        );
        await assert.rejects(
          f.tracking.code(order.publicNumber, "", f.owner.id),
        );
        await assert.rejects(service.orders(f.owner.id, 1));
        const row = await f.db.notification.findFirstOrThrow({
          where: {
            companyId: f.company.id,
            recipientAddress: order.recipientEmail,
            sourceEvent: "DELIVERY_FINAL_DISTRIBUTION",
            payload: { path: "$.deliveryId", equals: mission.id },
          },
        });
        const mail = await recipientMessage(f.db, row);
        assert.ok(mail?.text.includes(code.code));
      },
    );
    await t.test(
      "registration cannot reset an existing professional account password or profile",
      async () => {
        const email = "existing-" + randomUUID() + "@example.invalid";
        const original = await f.db.user.create({
          data: {
            email,
            fullName: "Existing person",
            phone: "+237600000000",
            passwordHash: await hashPassword(password),
          },
        });
        await service.register({
          email,
          fullName: "Wrong replacement",
          phone: "+237611111111",
          termsAccepted: true,
        });
        await assert.rejects(
          service.accept({
            token: token(),
            password: "Attacker-password-2026",
          }),
        );
        assert.equal(
          (await f.db.user.findUniqueOrThrow({ where: { id: original.id } }))
            .customerEnabled,
          false,
        );
        await service.accept({ token: token(), password });
        const current = await f.db.user.findUniqueOrThrow({
          where: { id: original.id },
        });
        assert.equal(current.fullName, original.fullName);
        assert.equal(current.passwordHash, original.passwordHash);
      },
    );
    await t.test(
      "HTTP customer endpoints enforce authentication, CSRF and global-only user directory",
      async () => {
        const app = express();
        app.use(express.json(), cookieParser());
        app.use("/api/customers", createCustomerRouter());
        app.use("/api/admin", createAdminRouter());
        app.use(errors);
        const auth = new AuthService(prismaAuthStore(f.db), getAuthSettings(), {
          available: () => false,
          send: async () => {},
        });
        const server = app.listen(0, "127.0.0.1");
        try {
          await new Promise<void>((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
          });
          const address = server.address();
          assert.ok(address && typeof address !== "string");
          const base = `http://127.0.0.1:${address.port}/api`;
          assert.equal((await fetch(base + "/customers/orders")).status, 401);
          const mobile = await auth.login(order.recipientEmail, password, {
            client: "MOBILE",
            deviceName: "test",
            userAgent: null,
            ipHash: null,
          });
          const headers = {
            "X-DND-Client": "mobile",
            Authorization: `Bearer ${mobile.accessToken}`,
          };
          const orders = await fetch(base + "/customers/orders", { headers });
          assert.equal(orders.status, 200);
          assert.equal((await orders.json()).total, 2);
          assert.equal(
            (await fetch(base + "/admin/users", { headers })).status,
            403,
          );
          const web = await auth.login(order.recipientEmail, password, {
            client: "WEB",
            deviceName: "test",
            userAgent: null,
            ipHash: null,
          });
          const origin = (await import("../../src/config/env.js")).env
            .CORS_ORIGINS[0]!;
          const cookie = {
            Cookie: `dnd_access=${web.accessToken}`,
            Origin: origin,
            "X-DND-Client": "web",
            "Content-Type": "application/json",
          };
          const path = base + `/customers/orders/${order.publicNumber}/code`;
          assert.equal(
            (await fetch(path, { method: "POST", headers: cookie, body: "{}" }))
              .status,
            403,
          );
          const response = await fetch(path, {
            method: "POST",
            headers: { ...cookie, "X-CSRF-Token": web.csrfToken! },
            body: "{}",
          });
          assert.equal(response.status, 200);
          assert.match((await response.json()).code, /^\d{6}$/);
          const role = await f.db.role.findFirstOrThrow({
            where: {
              scope: "GLOBAL",
              rolePermission_roleRecords: {
                some: { permission: { code: "platform.manage" } },
              },
            },
          });
          await f.db.globalRoleGrant.create({
            data: { userId: customerId, roleId: role.id },
          });
          await auth.switchOrganization(
            await auth.authenticate(mobile.accessToken, "MOBILE"),
            "global",
          );
          const users = await fetch(
            base +
              "/admin/users?kind=customer&search=" +
              encodeURIComponent(order.recipientEmail),
            { headers },
          );
          assert.equal(users.status, 200);
          const result = await users.json();
          assert.equal(result.items[0].id, customerId);
          assert.equal("passwordHash" in result.items[0], false);
        } finally {
          server.closeAllConnections();
          await new Promise<void>((resolve) => server.close(() => resolve()));
          await disconnectDatabase();
        }
      },
    );
    await t.test(
      "changing account email does not transfer previously linked orders",
      async () => {
        const old = order.recipientEmail;
        await f.db.user.update({
          where: { id: customerId },
          data: { email: "changed-" + randomUUID() + "@example.invalid" },
        });
        const other = await f.db.user.create({
          data: {
            email: old,
            fullName: "Different mailbox holder",
            passwordHash: "not a login",
            customerEnabled: true,
            emailVerifiedAt: new Date(),
          },
        });
        assert.equal((await service.orders(other.id, 1)).total, 0);
        assert.equal((await service.orders(customerId, 1)).total, 2);
      },
    );
    await t.test("suspended users lose direct order/code access", async () => {
      await f.db.user.update({
        where: { id: customerId },
        data: { status: "DISABLED" },
      });
      await assert.rejects(service.orders(customerId, 1));
      await assert.rejects(
        f.tracking.detail(order.publicNumber, "", customerId),
      );

      await assert.rejects(f.tracking.code(order.publicNumber, "", customerId));
    });
    await t.test(
      "expired verification and SMTP failure create no account",
      async () => {
        const email = "expired-" + randomUUID() + "@example.invalid";
        await service.register({
          email,
          fullName: "Expired",
          phone: "+237699999999",
          termsAccepted: true,
        });
        await f.db.customerRegistration.update({
          where: { tokenHash: tokenHash(token()) },
          data: { expiresAt: new Date(0) },
        });
        await assert.rejects(service.accept({ token: token(), password }));
        const broken = new CustomerService(f.db, {
          send: async () => {
            throw Error("offline");
          },
        });
        await assert.rejects(
          broken.register({
            email: "fail-" + email,
            fullName: "Fail",
            phone: "+237699999999",
            termsAccepted: true,
          }),
        );
        assert.equal(await f.db.user.count({ where: { email } }), 0);
      },
    );
  } finally {
    await Promise.all([f.db.$disconnect(), disconnectDatabase()]);
  }
});
