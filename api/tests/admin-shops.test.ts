import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { AdminService } from "../src/modules/admin/service.js";
import { createCompany } from "../src/modules/admin/validation.js";
import {
  authorizeShop,
  AccessDenied,
} from "../src/modules/authorization/tenant-access.js";
import { authorizationStore } from "../src/repositories/authorization.repository.js";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { loadUnavailableOrganizations } from "../src/modules/auth/workspaces.js";

function fixture(global = true) {
  const id = randomUUID(),
    actor = randomUUID();
  let shop = {
    id,
    name: "Boutique test",
    reference: "TEST",
    status: "ACTIVE",
    archivedAt: null as Date | null,
    version: 1,
  };
  let revoked = false;
  const audit: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    user: { findFirst: async () => ({ id: actor }) },
    globalRoleGrant: {
      findUnique: async () =>
        global ? { active: true, roleId: "global", roleScope: "GLOBAL" } : null,
    },
    rolePermission: {
      findMany: async ({ where }: { where: { roleId: string } }) => [
        {
          permission: {
            code:
              where.roleId === "global"
                ? "platform.manage"
                : "shop.products.manage",
          },
        },
      ],
    },
    shopMembership: {
      findUnique: async () => ({
        active: true,
        roleId: "owner",
        roleScope: "SHOP",
      }),
    },
    shop: {
      findUnique: async () => shop,
      findFirst: async () =>
        shop.status === "ACTIVE" && !shop.archivedAt ? shop : null,
      update: async ({
        data,
      }: {
        data: { status: string; archivedAt?: Date };
      }) => (shop = { ...shop, ...data, version: shop.version + 1 }),
    },
    shopInvitation: {
      updateMany: async () => {
        revoked = true;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (v: unknown) => {
        audit.push(v);
        return {};
      },
    },
  };
  const db = {
    ...tx,
    $transaction: async (work: (value: typeof tx) => unknown) => work(tx),
  } as unknown as PrismaClient;
  return {
    id,
    actor,
    db,
    audit,
    shop: () => shop,
    revoked: () => revoked,
    service: new AdminService(
      db,
      { available: () => false, send: async () => {} },
      "https://example.invalid",
    ),
  };
}
test("global shop suspension blocks catalogue writes; reactivation restores owner rights", async () => {
  const f = fixture();
  await authorizeShop(
    authorizationStore(f.db),
    f.actor,
    f.id,
    "shop.products.manage",
  );
  await f.service.shopStatus(f.actor, f.id, {
    version: 1,
    status: "SUSPENDED",
    reason: "Vérification",
  });
  await assert.rejects(
    authorizeShop(
      authorizationStore(f.db),
      f.actor,
      f.id,
      "shop.products.manage",
    ),
    AccessDenied,
  );
  assert.equal(f.revoked(), false);
  await f.service.shopStatus(f.actor, f.id, {
    version: 2,
    status: "ACTIVE",
    reason: "Vérifiée",
  });
  await authorizeShop(
    authorizationStore(f.db),
    f.actor,
    f.id,
    "shop.products.manage",
  );
  assert.equal(f.audit.length, 2);
});
test("shop deletion archives and revokes pending invitations without deleting business records", async () => {
  const f = fixture();
  await f.service.shopStatus(f.actor, f.id, {
    version: 1,
    status: "ARCHIVED",
    reason: "Fermeture",
  });
  assert.equal(f.shop().status, "ARCHIVED");
  assert.ok(f.shop().archivedAt);
  assert.ok(f.revoked());
  assert.match(JSON.stringify(f.audit), /PLATFORM_SHOP_ARCHIVED/);
  await assert.rejects(
    f.service.shopStatus(f.actor, f.id, {
      version: 2,
      status: "ACTIVE",
      reason: "Reprise",
    }),
    { code: "SHOP_ARCHIVED" },
  );
});
test("ordinary users cannot modify shops through the global service", async () => {
  const f = fixture(false);
  await assert.rejects(
    f.service.shopStatus(f.actor, f.id, {
      version: 1,
      status: "SUSPENDED",
      reason: "Tentative",
    }),
    AccessDenied,
  );
  assert.equal(f.shop().version, 1);
  assert.equal(f.audit.length, 0);
});
test("stale or unchanged shop status requests cannot overwrite a decision", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.shopStatus(f.actor, f.id, {
      version: 9,
      status: "SUSPENDED",
      reason: "Ancienne fiche",
    }),
    { code: "VERSION_CONFLICT" },
  );
  await assert.rejects(
    f.service.shopStatus(f.actor, f.id, {
      version: 1,
      status: "ACTIVE",
      reason: "Identique",
    }),
    { code: "STATUS_UNCHANGED" },
  );
  assert.equal(f.audit.length, 0);
});
test("company creation defaults to active but preserves explicit inactive choice", () => {
  const fields = {
    name: "Entreprise",
    reference: "TEST",
    email: "test@example.invalid",
    phone: "000",
    countryCode: "CM",
    city: "Douala",
    address: "Adresse",
    administrator: { mode: "existing", userId: randomUUID() },
  };
  assert.equal(createCompany.parse(fields).status, "ACTIVE");
  assert.equal(
    createCompany.parse({ ...fields, status: "INACTIVE" }).status,
    "INACTIVE",
  );
});
const meta = {
  client: "WEB" as const,
  deviceName: "Test",
  userAgent: null,
  ipHash: null,
};
test("login selects the only active company, without granting an inactive company", async () => {
  const f = await authFixture();
  f.store.data.contexts.set(
    f.userId,
    f.store.data.contexts.get(f.userId)!.filter((c) => c.scope === "COMPANY"),
  );
  const login = async () => {
    const s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      meta,
    );
    return f.service.profile(
      await f.service.authenticate(s.accessToken, "WEB"),
    );
  };
  assert.equal((await login()).activeContext?.portal, "entreprise");
  for (const id of f.store.data.companies.keys())
    f.store.data.companies.set(id, false);
  const denied = await login();
  assert.equal(denied.activeContext, null);
  assert.equal(denied.organizations.length, 0);
});
test("login keeps the chooser when several authorized workspaces exist", async () => {
  const f = await authFixture();
  const s = await f.service.login(
    "auth-fixture@example.invalid",
    fixturePassword,
    meta,
  );
  const p = await f.service.profile(
    await f.service.authenticate(s.accessToken, "WEB"),
  );
  assert.equal(p.organizations.length, 2);
  assert.equal(p.activeContext, null);
});
test("unavailable organization diagnostics are scoped to the signed-in member and grant no access", async () => {
  const userId = randomUUID();
  const check = (where: { userId: string; active: boolean }) => {
    assert.equal(where.userId, userId);
    assert.equal(where.active, true);
  };
  const db = {
    companyMembership: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; active: boolean };
      }) => {
        check(where);
        return [
          {
            company: {
              name: "Entreprise inactive",
              status: "INACTIVE",
              archivedAt: null,
            },
          },
        ];
      },
    },
    shopMembership: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; active: boolean };
      }) => {
        check(where);
        return [
          {
            shop: {
              name: "Boutique suspendue",
              status: "SUSPENDED",
              archivedAt: null,
            },
          },
        ];
      },
    },
  } as unknown as PrismaClient;
  assert.deepEqual(await loadUnavailableOrganizations(db, userId), [
    { kind: "COMPANY", name: "Entreprise inactive", status: "INACTIVE" },
    { kind: "SHOP", name: "Boutique suspendue", status: "SUSPENDED" },
  ]);
});
