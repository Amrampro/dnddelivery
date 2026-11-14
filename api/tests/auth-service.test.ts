import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { verifyPassword, tokenHash } from "../src/modules/auth/crypto.js";
const mobile = {
  client: "MOBILE" as const,
  deviceName: "Appareil de test",
  userAgent: null,
  ipHash: null,
};
test("Argon2id login, hash-only refresh storage and private profile", async () => {
  const f = await authFixture(),
    session = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  assert.ok(
    f.store.data.users.get(f.userId)?.passwordHash.startsWith("$argon2id$"),
  );
  assert.ok(
    !JSON.stringify([...f.store.data.sessions.values()]).includes(
      session.refreshToken,
    ),
  );
  const p = await f.service.authenticate(session.accessToken, "MOBILE");
  const profile = await f.service.profile(p);
  assert.equal(profile.organizations.length, 2);
  assert.ok(!("passwordHash" in profile.user));
});
test("wrong password, unknown address and disabled account have generic login failure", async () => {
  const f = await authFixture();
  for (const [email, password] of [
    ["auth-fixture@example.invalid", "wrong"],
    ["missing@example.invalid", "wrong"],
  ])
    await assert.rejects(f.service.login(email!, password!, mobile), {
      code: "INVALID_CREDENTIALS",
    });
  f.store.data.users.get(f.userId)!.status = "DISABLED";
  await assert.rejects(
    f.service.login("auth-fixture@example.invalid", fixturePassword, mobile),
    { code: "INVALID_CREDENTIALS" },
  );
});
test("expired access token is refused and refresh restores access", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  f.advance(61000);
  await assert.rejects(f.service.authenticate(s.accessToken, "MOBILE"));
  const next = await f.service.refresh(s.refreshToken, "MOBILE");
  await f.service.authenticate(next.accessToken, "MOBILE");
  assert.notEqual(next.refreshToken, s.refreshToken);
});
test("refresh reuse commits family revocation, including the successor access token", async () => {
  const f = await authFixture(),
    old = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    ),
    next = await f.service.refresh(old.refreshToken, "MOBILE");
  await assert.rejects(f.service.refresh(old.refreshToken, "MOBILE"));
  await assert.rejects(f.service.authenticate(next.accessToken, "MOBILE"));
  assert.ok(
    f.store.data.events.some((e) => e.metadata.reason === "refresh_reuse"),
  );
});
test("concurrent refresh replay cannot leave an active successor", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    ),
    results = await Promise.allSettled([
      f.service.refresh(s.refreshToken, "MOBILE"),
      f.service.refresh(s.refreshToken, "MOBILE"),
    ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.listSessions(f.userId, new Date())).length, 0);
});
test("logout and logout-all invalidate access tokens immediately", async () => {
  const f = await authFixture(),
    a = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    ),
    b = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  await f.service.logout(a.refreshToken, "MOBILE");
  await assert.rejects(f.service.authenticate(a.accessToken, "MOBILE"));
  const p = await f.service.authenticate(b.accessToken, "MOBILE");
  await f.service.logoutAll(p);
  await assert.rejects(f.service.authenticate(b.accessToken, "MOBILE"));
});
test("disabled users cannot use existing sessions", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  f.store.data.users.get(f.userId)!.status = "DISABLED";
  await assert.rejects(f.service.authenticate(s.accessToken, "MOBILE"));
  await assert.rejects(f.service.refresh(s.refreshToken, "MOBILE"));
});
test("current tenant and agency affiliations are required for switching and every protected call", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  let p = await f.service.authenticate(s.accessToken, "MOBILE");
  await assert.rejects(
    f.service.switchOrganization(p, `company:${randomUUID()}`),
    { code: "CONTEXT_DENIED" },
  );
  await assert.rejects(
    f.service.switchOrganization(p, `agency:${f.companyA}:${randomUUID()}`),
    { code: "CONTEXT_DENIED" },
  );
  await f.service.switchOrganization(p, f.choices[0]!.key);
  p = await f.service.authenticate(s.accessToken, "MOBILE");
  assert.equal(
    (await f.service.requirePermission(p, "workspace.access")).agencyId,
    f.agencyA,
  );
  f.store.data.agencyGrants.get(
    `${f.userId}:${f.companyA}:${f.agencyA}`,
  )!.active = false;
  await assert.rejects(f.service.requirePermission(p, "workspace.access"));
  await f.service.switchOrganization(p, f.choices[1]!.key);
  p = await f.service.authenticate(s.accessToken, "MOBILE");
  assert.equal(
    (await f.service.requirePermission(p, "orders.read")).companyId,
    f.companyB,
  );
  f.store.data.companies.set(f.companyB, false);
  await assert.rejects(f.service.requirePermission(p, "orders.read"));
});
test("permission removal takes effect without waiting for JWT expiry", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  let p = await f.service.authenticate(s.accessToken, "MOBILE");
  await f.service.switchOrganization(p, f.choices[1]!.key);
  p = await f.service.authenticate(s.accessToken, "MOBILE");
  f.store.data.companyGrants.get(`${f.userId}:${f.companyB}`)!.permissions = [
    "workspace.access",
  ];
  await assert.rejects(f.service.requirePermission(p, "orders.read"));
});
test("global admin is independent of client company suspension", async () => {
  const f = await authFixture();
  f.store.data.globalGrants.set(f.userId, {
    active: true,
    scope: "GLOBAL",
    permissions: ["workspace.access", "platform.manage"],
  });
  f.store.data.contexts
    .get(f.userId)!
    .push({
      key: "global",
      scope: "GLOBAL",
      companyName: "Administration de test",
      roleCode: "super_admin",
      roleName: "Super Administrateur",
      permissions: [],
      portal: "super-admin",
    });
  const s = await f.service.login(
    "auth-fixture@example.invalid",
    fixturePassword,
    mobile,
  );
  let p = await f.service.authenticate(s.accessToken, "MOBILE");
  await f.service.switchOrganization(p, "global");
  f.store.data.companies.set(f.companyA, false);
  p = await f.service.authenticate(s.accessToken, "MOBILE");
  assert.equal(
    (await f.service.requirePermission(p, "platform.manage")).scope,
    "GLOBAL",
  );
});
test("reset token is hashed, single-use, expires and revokes every session", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    );
  await f.service.forgotPassword("auth-fixture@example.invalid");
  await Promise.resolve();
  const raw = new URL(f.sent[0]!.web).hash.split("token=")[1]!;
  assert.equal(f.sent[0]!.mobile, f.sent[0]!.web);
  assert.equal(new URL(f.sent[0]!.mobile).origin, f.settings.webUrl);
  assert.ok(!new URL(f.sent[0]!.mobile).searchParams.has("token"));
  assert.ok(
    [...f.store.data.resets.values()].some(
      (t) => t.tokenHash === tokenHash(raw),
    ),
  );
  assert.ok(!JSON.stringify([...f.store.data.resets.values()]).includes(raw));
  await f.service.resetPassword(raw, "a new fixture passphrase");
  assert.ok(
    await verifyPassword(
      f.store.data.users.get(f.userId)!.passwordHash,
      "a new fixture passphrase",
    ),
  );
  await assert.rejects(
    f.service.resetPassword(raw, "another fixture passphrase"),
  );
  await assert.rejects(f.service.authenticate(s.accessToken, "MOBILE"));
  await f.service.forgotPassword("auth-fixture@example.invalid");
  const expired = new URL(f.sent[1]!.web).hash.split("token=")[1]!;
  f.advance(601000);
  await assert.rejects(
    f.service.resetPassword(expired, "another fixture passphrase"),
  );
});
test("SMTP unavailable does not distinguish existing and unknown accounts", async () => {
  const f = await authFixture();
  f.disableMail();
  for (const email of [
    "auth-fixture@example.invalid",
    "unknown@example.invalid",
  ])
    await assert.rejects(f.service.forgotPassword(email), {
      code: "MAIL_UNAVAILABLE",
    });
  assert.equal(f.sent.length, 0);
});
test("web CSRF binding and session client separation are enforced", async () => {
  const f = await authFixture(),
    s = await f.service.login("auth-fixture@example.invalid", fixturePassword, {
      ...mobile,
      client: "WEB",
    });
  await assert.rejects(f.service.refresh(s.refreshToken, "WEB", "wrong"), {
    code: "CSRF_REJECTED",
  });
  await assert.rejects(f.service.refresh(s.refreshToken, "MOBILE"));
  await assert.rejects(f.service.authenticate(s.accessToken, "MOBILE"));
  await f.service.refresh(s.refreshToken, "WEB", s.csrfToken!);
});
test("password changes revoke all devices and foreign device revocation is refused", async () => {
  const f = await authFixture(),
    s = await f.service.login(
      "auth-fixture@example.invalid",
      fixturePassword,
      mobile,
    ),
    p = await f.service.authenticate(s.accessToken, "MOBILE");
  await assert.rejects(f.service.revokeSession(p, randomUUID()), {
    code: "SESSION_NOT_FOUND",
  });
  await assert.rejects(
    f.service.changePassword(p, "wrong", "another fixture password"),
    { code: "PASSWORD_INCORRECT" },
  );
  await f.service.changePassword(
    p,
    fixturePassword,
    "another fixture password",
  );
  await assert.rejects(f.service.authenticate(s.accessToken, "MOBILE"));
});

test('standalone shop workspace stays available without a carrier and revoked membership immediately blocks it', async()=>{
 const f=await authFixture(),shopId=randomUUID();
 const key=`shop-home:${shopId}`;
 f.store.data.shopGrants.set(`${f.userId}:${shopId}`,{active:true,scope:'SHOP',permissions:['workspace.access','shop.profile.read','shop.profile.write']});
 f.store.data.contexts.set(f.userId,[{key,scope:'SHOP',shopId,companyName:'Ma boutique',shopName:'Boutique sans transporteur',roleCode:'shop_owner',roleName:'Propriétaire',permissions:[],portal:'boutique'}]);
 const s=await f.service.login('auth-fixture@example.invalid',fixturePassword,mobile);
 let p=await f.service.authenticate(s.accessToken,'MOBILE');
 await f.service.switchOrganization(p,key);
 p=await f.service.authenticate(s.accessToken,'MOBILE');
 assert.equal((await f.service.requirePermission(p,'shop.profile.write')).companyId,undefined);
 await assert.rejects(f.service.requirePermission(p,'orders.read'));
 await assert.rejects(f.service.switchOrganization(p,`shop:${randomUUID()}:${shopId}`),{code:'CONTEXT_DENIED'});
 f.store.data.shopGrants.get(`${f.userId}:${shopId}`)!.active=false;
 await assert.rejects(f.service.requirePermission(p,'shop.profile.read'));
});
