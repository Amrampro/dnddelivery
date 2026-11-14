import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import sharp from "sharp";
import { createDatabase } from "../../src/database/client.js";
import { AdminService } from "../../src/modules/admin/service.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { createAuthRouter } from "../../src/modules/auth/auth.routes.js";
import {
  createAdminRouter,
  createInvitationRouter,
} from "../../src/modules/admin/routes.js";
import { errors } from "../../src/middlewares/errors.js";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw new Error("Dedicated test database required");
test("MySQL company administration: transactions, invitations, permissions and audit", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8).toUpperCase(),
    password = "Bloc5 fixture-only password 2026";
  const sent: Array<{ to: string; link: string }> = [];
  let failMail = false;
  const service = new AdminService(
    db,
    {
      available: () => !failMail,
      send: async (to, link) => {
        sent.push({ to, link });
      },
    },
    "http://localhost:5173",
    24,
  );
  const auth = new AuthService(
    prismaAuthStore(db),
    {
      secret: "mysql-test-secret-only-32-bytes-minimum",
      accessSeconds: 600,
      refreshDays: 1,
      resetMinutes: 10,
      sameSite: "lax",
      webUrl: "http://localhost:5173",
      secure: false,
    },
    { available: () => false, send: async () => {} },
  );
  const hash = await hashPassword(password),
    owner = await db.user.create({
      data: {
        email: `owner-${suffix}@example.invalid`,
        fullName: "Owner test",
        passwordHash: hash,
      },
    }),
    other = await db.user.create({
      data: {
        email: `admin-${suffix}@example.invalid`,
        fullName: "Admin test",
        passwordHash: hash,
      },
    }),
    second = await db.user.create({
      data: {
        email: `second-${suffix}@example.invalid`,
        fullName: "Second admin test",
        passwordHash: hash,
      },
    });
  const globalRole = await db.role.create({
      data: {
        code: `global_${suffix}`,
        name: "Global fixture",
        scope: "GLOBAL",
      },
    }),
    companyRole = await db.role.upsert({
      where: { code: "company_admin" },
      create: {
        code: "company_admin",
        name: "Administrateur entreprise",
        scope: "COMPANY",
      },
      update: {},
    });
  for (const [roleId, codes] of [
    [globalRole.id, ["workspace.access", "platform.manage"]],
    [companyRole.id, ["workspace.access", "company.manage", "orders.read"]],
  ] as const)
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
  await db.globalRoleGrant.create({
    data: { userId: owner.id, roleId: globalRole.id, roleScope: "GLOBAL" },
  });
  const app = express();
  app.use(express.json({ limit: "100kb" }), cookieParser());
  const origins = ["http://localhost:5173"];
  app.use(
    "/api/auth",
    createAuthRouter(() => auth, origins),
  );
  app.use(
    "/api/admin",
    createAdminRouter(
      () => auth,
      () => service,
      origins,
    ),
  );
  app.use(
    "/api/invitations",
    createInvitationRouter(() => service, origins),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  function client() {
    let cookies = "",
      csrf = "";
    return {
      request: async (
        path: string,
        method = "GET",
        body?: unknown,
        headers: Record<string, string> = {},
      ) => {
        const response = await fetch(base + path, {
          method,
          headers: {
            Origin: origins[0]!,
            "X-DND-Client": "web",
            ...(cookies ? { Cookie: cookies } : {}),
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          ...(body
            ? {
                body: Buffer.isBuffer(body)
                  ? new Uint8Array(body)
                  : JSON.stringify(body),
              }
            : {}),
        });
        const set = response.headers.getSetCookie();
        if (set.length) cookies = set.map((v) => v.split(";")[0]).join("; ");
        return response;
      },
      login: async (email: string) => {
        const response = await fetch(base + "/auth/login", {
          method: "POST",
          headers: {
            Origin: origins[0]!,
            "X-DND-Client": "web",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(response.status, 200);
        cookies = response.headers
          .getSetCookie()
          .map((v) => v.split(";")[0])
          .join("; ");
        csrf = (await response.json()).csrfToken;
      },
    };
  }
  const admin = client(),
    tenant = client(),
    anonymous = client();
  const fields = (reference: string) => ({
    name: `Entreprise ${suffix} ${reference}`,
    reference: `B5-${suffix}-${reference}`,
    email: `contact-${suffix}@example.invalid`,
    phone: "+237 600000000",
    address: "Adresse de test",
    city: "Douala",
    countryCode: "CM",
    status: "ACTIVE" as const,
    administrator: { mode: "existing" as const, userId: other.id },
  });
  let companyId = "",
    foreignId = "";
  try {
    await t.test(
      "global routes reject anonymous users and require a verified global context",
      async () => {
        assert.equal((await anonymous.request("/admin/companies")).status, 401);
        await admin.login(owner.email);
        assert.equal((await admin.request("/admin/dashboard")).status, 403);
        assert.equal(
          (
            await admin.request("/auth/switch-organization", "POST", {
              contextKey: "global",
            })
          ).status,
          200,
        );
        assert.equal((await admin.request("/admin/dashboard")).status, 200);
      },
    );
    await t.test(
      "strict validation and rollback of company creation when administrator association fails",
      async () => {
        const before = await db.company.count();
        assert.equal(
          (
            await admin.request("/admin/companies", "POST", fields("CSRF"), {
              "X-CSRF-Token": "",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await admin.request("/admin/companies", "POST", fields("ORIGIN"), {
              Origin: "https://hostile.invalid",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await admin.request("/admin/companies", "POST", {
              ...fields("BAD"),
              globalRole: "super_admin",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.request("/admin/companies", "POST", {
              ...fields("BAD"),
              email: "invalid",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.request("/admin/companies", "POST", {
              ...fields("ROLLBACK"),
              administrator: { mode: "existing", userId: randomUUID() },
            })
          ).status,
          409,
        );
        assert.equal(await db.company.count(), before);
      },
    );
    await t.test(
      "company and existing administrator are created atomically; duplicate reference is rejected",
      async () => {
        const response = await admin.request(
          "/admin/companies",
          "POST",
          fields("A"),
        );
        assert.equal(response.status, 201);
        const body = await response.json();
        companyId = body.company.id;
        assert.equal(body.company.primaryAdminUserId, other.id);
        assert.equal(
          await db.companyMembership.count({
            where: { companyId, userId: other.id },
          }),
          1,
        );
        assert.equal(await db.subscription.count({ where: { companyId } }), 0);
        assert.equal(
          (await admin.request("/admin/companies", "POST", fields("A"))).status,
          409,
        );
        const b = await admin.request("/admin/companies", "POST", fields("B"));
        assert.equal(b.status, 201);
        foreignId = (await b.json()).company.id;
      },
    );
    await t.test(
      "company administrator cannot use global routes or take over another company",
      async () => {
        await tenant.login(other.email);
        const me = await (await tenant.request("/auth/me")).json();
        const choice = me.organizations.find(
          (v: { companyId: string }) => v.companyId === companyId,
        );
        assert.ok(choice);
        assert.equal(
          (
            await tenant.request("/auth/switch-organization", "POST", {
              contextKey: choice.key,
            })
          ).status,
          200,
        );
        assert.equal((await tenant.request("/admin/companies")).status, 403);
        assert.equal(
          (
            await tenant.request(
              `/admin/companies/${foreignId}/status`,
              "PATCH",
              { version: 1, status: "SUSPENDED", reason: "Unauthorized" },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await tenant.request(`/admin/companies/${foreignId}`, "PATCH", {
              name: "Takeover",
              version: 1,
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "updates are scoped, immutable reference is rejected, concurrent stale updates conflict",
      async () => {
        const c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        const payload = {
          name: `Modifiée ${suffix}`,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city,
          countryCode: c.countryCode,
          tradeName: null,
          registrationNumber: null,
          description: "Description",
          version: c.version,
        };
        assert.equal(
          (
            await admin.request(`/admin/companies/${companyId}`, "PATCH", {
              ...payload,
              reference: "CHANGE",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}`,
              "PATCH",
              payload,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}`,
              "PATCH",
              payload,
            )
          ).status,
          409,
        );
        assert.notEqual(
          (await db.company.findUniqueOrThrow({ where: { id: foreignId } }))
            .name,
          payload.name,
        );
      },
    );
    await t.test(
      "suspension immediately blocks tenant context; reactivation restores it independently",
      async () => {
        let c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/status`,
              "PATCH",
              {
                version: c.version,
                status: "SUSPENDED",
                reason: "Contrôle administratif",
              },
            )
          ).status,
          200,
        );
        assert.equal((await tenant.request("/auth/workspace")).status, 403);
        assert.equal(
          (await db.company.findUniqueOrThrow({ where: { id: foreignId } }))
            .status,
          "ACTIVE",
        );
        c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/status`,
              "PATCH",
              {
                version: c.version,
                status: "ACTIVE",
                reason: "Contrôle terminé",
              },
            )
          ).status,
          200,
        );
        assert.equal((await tenant.request("/auth/workspace")).status, 200);
      },
    );
    await t.test(
      "last active administrator cannot be removed; primary replacement stays within the company",
      async () => {
        let c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/admins/${other.id}`,
              "DELETE",
              { version: c.version },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/admins`,
              "POST",
              { version: c.version, userId: second.id, primary: true },
            )
          ).status,
          200,
        );
        c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
        assert.equal(c.primaryAdminUserId, second.id);
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/admins/${other.id}`,
              "DELETE",
              { version: c.version },
            )
          ).status,
          200,
        );
        assert.equal((await tenant.request("/auth/workspace")).status, 403);
        assert.equal(
          (
            await db.companyMembership.findUniqueOrThrow({
              where: {
                companyId_userId: { companyId: foreignId, userId: other.id },
              },
            })
          ).active,
          true,
        );
      },
    );
    await t.test(
      "new invitation is persisted hashed; SMTP failure preserves a retriable company and invitation",
      async () => {
        failMail = true;
        const response = await admin.request("/admin/companies", "POST", {
          ...fields("INVITED"),
          administrator: {
            mode: "invite",
            email: `invited-${suffix}@example.invalid`,
            fullName: "Invité test",
          },
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.equal(body.invitationDelivery, "FAILED");
        const inv = await db.companyInvitation.findFirstOrThrow({
          where: { companyId: body.company.id },
        });
        assert.equal(inv.deliveryStatus, "FAILED");
        assert.equal(inv.tokenHash.length, 64);
        assert.equal(await db.user.count({ where: { email: inv.email } }), 0);
        failMail = false;
        assert.equal(
          (
            await admin.request(`/admin/invitations/${inv.id}/resend`, "POST", {
              version: inv.version,
            })
          ).status,
          200,
        );
        const token = new URL(sent.at(-1)!.link).hash.slice("#token=".length);
        const again = await db.companyInvitation.findUniqueOrThrow({
          where: { id: inv.id },
        });
        assert.notEqual(again.tokenHash, inv.tokenHash);
        assert.ok(
          !JSON.stringify(await service.detail(body.company.id)).includes(
            token,
          ),
        );
        assert.equal(again.deliveryStatus, "SENT");
        const accept = await anonymous.request("/invitations/accept", "POST", {
          token,
          fullName: "Administrateur activé",
          password,
        });
        assert.equal(accept.status, 200);
        assert.equal(
          (
            await anonymous.request("/invitations/accept", "POST", {
              token,
              fullName: "Replay",
              password,
            })
          ).status,
          400,
        );
        const activated = await db.user.findUniqueOrThrow({
          where: { email: inv.email },
        });
        assert.match(activated.passwordHash, /argon2id/);
        assert.equal(
          await db.companyMembership.count({
            where: {
              companyId: inv.companyId,
              userId: activated.id,
              active: true,
            },
          }),
          1,
        );
        assert.equal(
          (await db.company.findUniqueOrThrow({ where: { id: inv.companyId } }))
            .primaryAdminUserId,
          activated.id,
        );
      },
    );
    await t.test(
      "concurrent administrator removals leave at least one active administrator",
      async () => {
        let c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        await service.addAdmin(owner.id, companyId, other.id, c.version, false);
        c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
        const responses = await Promise.all([
          admin.request(
            `/admin/companies/${companyId}/admins/${other.id}`,
            "DELETE",
            { version: c.version },
          ),
          admin.request(
            `/admin/companies/${companyId}/admins/${second.id}`,
            "DELETE",
            { version: c.version },
          ),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          await db.companyMembership.count({
            where: { companyId, active: true, role: { code: "company_admin" } },
          }),
          1,
        );
      },
    );
    await t.test(
      "expired, revoked and rotated invitations are refused; existing email never changes its password",
      async () => {
        let c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/admins/invite`,
              "POST",
              { version: c.version, email: other.email, fullName: "Existing" },
            )
          ).status,
          409,
        );
        const make = async (label: string) => {
          c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
          assert.equal(
            (
              await admin.request(
                `/admin/companies/${companyId}/admins/invite`,
                "POST",
                {
                  version: c.version,
                  email: `${label}-${suffix}@example.invalid`,
                  fullName: "Invité",
                },
              )
            ).status,
            201,
          );
          const token = new URL(sent.at(-1)!.link).hash.slice(7);
          const inv = await db.companyInvitation.findFirstOrThrow({
            where: { email: `${label}-${suffix}@example.invalid`, companyId },
          });
          return { token, inv };
        };
        const expired = await make("expired");
        await db.companyInvitation.update({
          where: { id: expired.inv.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal(
          (
            await anonymous.request("/invitations/inspect", "POST", {
              token: expired.token,
            })
          ).status,
          400,
        );
        const revoked = await make("revoked");
        assert.equal(
          (
            await admin.request(
              `/admin/invitations/${revoked.inv.id}/revoke`,
              "POST",
              { version: revoked.inv.version },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await anonymous.request("/invitations/accept", "POST", {
              token: revoked.token,
              fullName: "Invalid",
              password,
            })
          ).status,
          400,
        );
        const raced = await make("race");
        await db.user.create({
          data: {
            email: raced.inv.email,
            fullName: "Created separately",
            passwordHash: hash,
          },
        });
        assert.equal(
          (
            await anonymous.request("/invitations/accept", "POST", {
              token: raced.token,
              fullName: "Takeover",
              password: "different fixture password",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await db.user.findUniqueOrThrow({
              where: { email: raced.inv.email },
            })
          ).passwordHash,
          hash,
        );
        const rotated = await make("rotated");
        assert.equal(
          (
            await admin.request(
              `/admin/invitations/${rotated.inv.id}/resend`,
              "POST",
              { version: rotated.inv.version },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await anonymous.request("/invitations/inspect", "POST", {
              token: rotated.token,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "server-side search, pagination, dashboard and audit use persisted data only",
      async () => {
        const page = await (
          await admin.request(`/admin/companies?q=${suffix}&pageSize=1&page=1`)
        ).json();
        const next = await (
          await admin.request(`/admin/companies?q=${suffix}&pageSize=1&page=2`)
        ).json();
        assert.equal(page.items.length, 1);
        assert.ok(page.total >= 3);
        assert.notEqual(page.items[0].id, next.items[0].id);
        const dashboard = await (
          await admin.request("/admin/dashboard?days=7")
        ).json();
        assert.equal(dashboard.counts.total, await db.company.count());
        assert.equal(dashboard.trend.length, 7);
        const events = await db.auditLog.findMany({ where: { companyId } });
        for (const action of [
          "COMPANY_CREATED",
          "COMPANY_UPDATED",
          "COMPANY_SUSPENDED",
          "COMPANY_REACTIVATED",
          "COMPANY_ADMIN_REMOVED",
        ])
          assert.ok(events.some((e) => e.action === action));
        assert.ok(events.every((e) => e.actorId && e.createdAt));
        assert.ok(!JSON.stringify(events).includes(password));
        assert.equal(
          (await admin.request("/admin/companies?pageSize=999")).status,
          400,
        );
      },
    );
    await t.test(
      "logos reject forged or oversized data and persist only a private sanitized file",
      async () => {
        const c = await db.company.findUniqueOrThrow({
          where: { id: companyId },
        });
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/logo`,
              "PUT",
              Buffer.from("<svg/>"),
              {
                "Content-Type": "image/png",
                "X-Company-Version": String(c.version),
              },
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/logo`,
              "PUT",
              Buffer.alloc(2 * 1024 * 1024 + 1),
              {
                "Content-Type": "image/png",
                "X-Company-Version": String(c.version),
              },
            )
          ).status,
          413,
        );
        const image = await sharp({
          create: { width: 12, height: 12, channels: 3, background: "#033173" },
        })
          .png()
          .toBuffer();
        assert.equal(
          (
            await admin.request(
              `/admin/companies/${companyId}/logo`,
              "PUT",
              image,
              {
                "Content-Type": "image/png",
                "X-Company-Version": String(c.version),
              },
            )
          ).status,
          200,
        );
        const logo = await (
          await admin.request(`/admin/companies/${companyId}/logo`)
        ).json();
        assert.equal(logo.mime, "image/webp");
        assert.ok(Buffer.from(logo.image, "base64").length > 0);
        assert.equal(
          (await tenant.request(`/admin/companies/${companyId}/logo`)).status,
          403,
        );
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
