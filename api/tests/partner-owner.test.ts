import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { PartnerService } from "../src/modules/partners/service.js";
import { AuthError } from "../src/modules/auth/errors.js";

function fixture(roleCode = "shop_owner", active = true) {
  let writes = 0;
  const member = { id: "membership", version: 1, active, role: { code: roleCode } };
  const tx = {
    $queryRaw: async () => [],
    user: { findFirst: async () => ({ id: "actor" }) },
    shopMembership: {
      findFirst: async () => ({ role: { rolePermission_roleRecords: [
        { permission: { code: "shop.users.manage" } },
      ] } }),
      findUnique: async () => member,
      // More than one owner must not make an owner's affiliation editable.
      count: async () => 2,
      update: async () => { writes++; },
    },
    role: { findUniqueOrThrow: async () => ({ id: "manager-role" }) },
    auditLog: { create: async () => ({}) },
  };
  const db = { ...tx, $transaction: async (work: (value: typeof tx) => unknown) => work(tx) };
  const service = new PartnerService(db as unknown as PrismaClient,
    { available: () => false, send: async () => {} }, "https://example.invalid");
  return { service, writes: () => writes };
}
const context = { actorId: "actor", scope: "SHOP" as const, shopId: "shop" };
const protectedOwner = (error: unknown) => error instanceof AuthError &&
  error.code === "OWNER_PROTECTED" && error.status === 409;

test("owner affiliation cannot be edited, demoted or suspended, even with other owners", async () => {
  for (const active of [true, false]) {
    for (const input of [
      { version: 1, role: "shop_owner" as const, active: true },
      { version: 1, role: "shop_manager" as const, active: true },
      { version: 1, role: "shop_owner" as const, active: false },
    ]) {
      const f = fixture("shop_owner", active);
      await assert.rejects(f.service.changeUser(context, "owner", input), protectedOwner);
      assert.equal(f.writes(), 0);
    }
  }
});

test("owner cannot be removed through the delete path", async () => {
  const f = fixture();
  await assert.rejects(f.service.removeUser(context, "owner", {
    version: 1, reason: "Attempted removal",
  }), protectedOwner);
  assert.equal(f.writes(), 0);
});

test("ordinary shop employees remain editable", async () => {
  const f = fixture("shop_employee");
  await f.service.changeUser(context, "employee", {
    version: 1, role: "shop_manager", active: true,
  });
  assert.equal(f.writes(), 1);
});
