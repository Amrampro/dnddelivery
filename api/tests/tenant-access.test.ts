import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  authorizeTenant,
  authorizeGlobal,
  authorizeShop,
  tenantFilter,
  AccessDenied,
  type AuthorizationStore,
  type TenantContext,
} from "../src/modules/authorization/tenant-access.js";
const userId = randomUUID(),
  companyId = randomUUID(),
  agencyId = randomUUID(),
  shopId = randomUUID();
function store(
  overrides: Partial<AuthorizationStore> = {},
): AuthorizationStore {
  return {
    userActive: async () => true,
    companyActive: async () => true,
    subscriptionValid: async () => true,
    companyGrant: async () => ({
      active: true,
      scope: "COMPANY",
      permissions: ["orders.read"],
    }),
    agencyActive: async () => true,
    agencyGrant: async () => null,
    shopActive: async () => true,
    shopIdentityActive: async () => true,
    shopGrant: async () => ({
      active: true,
      scope: "SHOP",
      permissions: ["orders.read"],
    }),
    globalGrant: async () => null,
    ...overrides,
  };
}
test("tenant access issues an immutable context with mandatory filters", async () => {
  const ctx = await authorizeTenant(
    store(),
    { userId, companyId, agencyId },
    "orders.read",
  );
  assert.deepEqual(tenantFilter(ctx, "orders.read"), { companyId, agencyId });
  assert.ok(Object.isFrozen(ctx));
  assert.throws(() => tenantFilter(ctx, "stocks.reserve"), AccessDenied);
  assert.throws(
    () => tenantFilter({ ...ctx } as TenantContext, "orders.read"),
    AccessDenied,
  );
});
test("missing affiliations, suspended tenant and inactive user are rejected", async () => {
  for (const override of [
    { companyGrant: async () => null },
    { companyActive: async () => false },
    { userActive: async () => false },
    {
      companyGrant: async () => ({
        active: false,
        scope: "COMPANY" as const,
        permissions: ["orders.read"],
      }),
    },
  ]) {
    await assert.rejects(
      authorizeTenant(store(override), { userId, companyId }, "orders.read"),
      AccessDenied,
    );
  }
});
test("agency scope cannot be expanded to company scope", async () => {
  const db = store({
    companyGrant: async () => ({
      active: true,
      scope: "COMPANY",
      permissions: [],
    }),
    agencyGrant: async () => ({
      active: true,
      scope: "AGENCY",
      permissions: ["orders.read"],
    }),
  });
  await authorizeTenant(db, { userId, companyId, agencyId }, "orders.read");
  await assert.rejects(
    authorizeTenant(db, { userId, companyId }, "orders.read"),
    AccessDenied,
  );
  await assert.rejects(
    authorizeTenant(
      store({ agencyActive: async () => false }),
      { userId, companyId, agencyId },
      "orders.read",
    ),
    AccessDenied,
  );
});
test("shop account can select two collaborations while preserving shop filter", async () => {
  for (const tenant of [companyId, randomUUID()]) {
    const ctx = await authorizeTenant(
      store({ companyGrant: async () => null }),
      { userId, companyId: tenant, shopId },
      "orders.read",
    );
    assert.deepEqual(tenantFilter(ctx, "orders.read"), {
      companyId: tenant,
      shopId,
    });
  }
  await assert.rejects(
    authorizeTenant(
      store({ shopActive: async () => false }),
      { userId, companyId, shopId },
      "orders.read",
    ),
    AccessDenied,
  );
  await assert.rejects(
    authorizeTenant(
      store({ shopGrant: async () => null }),
      { userId, companyId, shopId },
      "orders.read",
    ),
    AccessDenied,
  );
});
test("global privilege requires a separate grant, never just a tenant id", async () => {
  await assert.rejects(
    authorizeGlobal(store(), userId, "platform.manage"),
    AccessDenied,
  );
  await authorizeGlobal(
    store({
      globalGrant: async () => ({
        active: true,
        scope: "GLOBAL",
        permissions: ["platform.manage"],
      }),
    }),
    userId,
    "platform.manage",
  );
});
test("malformed or ambiguous scopes are rejected", async () => {
  await assert.rejects(
    authorizeTenant(
      store(),
      { userId, companyId, agencyId, shopId },
      "orders.read",
    ),
  );
  await assert.rejects(
    authorizeTenant(store(), { userId, companyId: "invalid" }, "orders.read"),
  );
});

test('shop identity permissions do not depend on a carrier and cannot authorize tenant operations', async()=>{
  const own=()=>({active:true,scope:'SHOP' as const,permissions:['workspace.access','shop.profile.write','shop.collaborations.read']});
  const s=store({companyActive:async()=>false,subscriptionValid:async()=>false,shopGrant:async()=>own()});
  await authorizeShop(s,userId,shopId,'shop.profile.write');
  await authorizeShop(s,userId,shopId,'workspace.access');
  await assert.rejects(()=>authorizeShop(s,userId,shopId,'orders.read'),AccessDenied);
  await assert.rejects(()=>authorizeShop(store({shopIdentityActive:async()=>false,shopGrant:async()=>own()}),userId,shopId,'shop.profile.write'),AccessDenied);
  await assert.rejects(()=>authorizeShop(store({shopGrant:async()=>({...own(),active:false})}),userId,shopId,'shop.profile.write'),AccessDenied);
  await assert.rejects(()=>authorizeShop(store({shopGrant:async()=>({...own(),scope:'COMPANY'})}),userId,shopId,'shop.profile.write'),AccessDenied);
});
