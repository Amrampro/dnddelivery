import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { createDatabase } from "../../src/database/client.js";
import { administrationLogs, logsQuery } from "../../src/modules/admin/logs.js";
import { createAdminRouter } from "../../src/modules/admin/routes.js";
import { AdminService } from "../../src/modules/admin/service.js";
import { errors } from "../../src/middlewares/errors.js";
import { authFixture, fixturePassword } from "../helpers/auth-fixture.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { technicalLog } from "../../src/utils/technical-log.js";

test("global administration logs return real identities, filter results and deny company access", async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(
    url &&
      process.env.NODE_ENV === "test" &&
      /^dnd_delivery\w*_test$/.test(new URL(url).pathname.slice(1)),
  );
  const db = createDatabase(url);
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      fullName: "Auteur logs " + suffix,
      email: suffix + "@example.invalid",
      passwordHash: await hashPassword(randomUUID()),
    },
  });
  const fixture = await authFixture();
  const app = express();
  app.use(
    "/admin",
    createAdminRouter(
      () => fixture.service,
      () => ({ db }) as AdminService,
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await db.authEvent.createMany({
      data: [
        {
          userId: user.id,
          type: "LOGIN_SUCCESS",
          metadata: { sessionId: suffix },
        },
        {
          userId: user.id,
          type: "LOGIN_FAILURE",
          metadata: {
            attemptedEmail: user.email,
            reason: "invalid_credentials",
            password: "never-return-this",
          },
        },
        {
          userId: user.id,
          type: "PERMISSIONS_CHANGED",
          metadata: { reason: "access_denied", path: "/api/admin/logs" },
        },
        {
          userId: user.id,
          type: "PASSWORD_RESET",
          metadata: { reason: "mail_delivery_failed" },
        },
      ],
    });
    const query = logsQuery.parse({ search: user.id });
    const all = await administrationLogs(db, query);
    assert.equal(all.total, 4);
    assert.ok(
      all.items.every(
        (row) => row.actor?.id === user.id && row.actor.email === user.email,
      ),
    );
    assert.ok(!JSON.stringify(all).includes("never-return-this"));
    assert.equal(
      (await administrationLogs(db, { ...query, result: "FAILURE" })).total,
      3,
    );
    assert.equal(
      (await administrationLogs(db, { ...query, result: "SUCCESS" })).total,
      1,
    );
    assert.equal(
      (await administrationLogs(db, { ...query, size: 1, page: 2 })).items
        .length,
      1,
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const route = `http://127.0.0.1:${address.port}/admin/logs?search=${user.id}`;
    assert.equal((await fetch(route)).status, 401);
    const account = fixture.store.data.users.get(fixture.userId)!;
    const meta = {
      client: "MOBILE" as const,
      deviceName: "Fixture",
      userAgent: null,
      ipHash: null,
    };
    const denied = await fixture.service.login(
      account.email,
      fixturePassword,
      meta,
    );
    assert.equal(
      (
        await fetch(route, {
          headers: {
            "X-DND-Client": "mobile",
            Authorization: `Bearer ${denied.accessToken}`,
          },
        })
      ).status,
      403,
    );
    assert.equal(fixture.store.data.events.at(-1)?.userId, account.id);
    assert.equal(fixture.store.data.events.at(-1)?.metadata.reason, "access_denied");
    fixture.store.data.globalGrants.set(account.id, {
      active: true,
      scope: "GLOBAL",
      permissions: ["platform.manage", "workspace.access"],
    });
    fixture.store.data.contexts.set(account.id, [
      {
        key: "global",
        scope: "GLOBAL",
        companyName: "DND Delivery",
        roleCode: "super_admin",
        roleName: "Super administrateur",
        portal: "super-admin",
        permissions: ["platform.manage", "workspace.access"],
      },
    ]);
    const allowed = await fixture.service.login(
      account.email,
      fixturePassword,
      meta,
    );
    const response = await fetch(route, {
      headers: {
        "X-DND-Client": "mobile",
        Authorization: `Bearer ${allowed.accessToken}`,
      },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 4);
    await technicalLog({
      action: "HTTP_SERVER_ERROR",
      result: "FAILURE",
      actorId: user.id,
      entityId: suffix,
      status: 500,
    });
    const technical = await administrationLogs(
      db,
      logsQuery.parse({ category: "technical", search: suffix }),
    );
    assert.equal(technical.total, 1);
    assert.equal(technical.items[0]?.actor?.email, user.email);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
