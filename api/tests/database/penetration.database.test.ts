import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { getAuthSettings } from "../../src/config/auth.js";
import { disconnectDatabase } from "../../src/database/client.js";
import { app } from "../../src/app.js";
import express from "express";
import { PartnerService } from "../../src/modules/partners/service.js";
import { createPartnerRegistrationRouter } from "../../src/modules/partners/routes.js";
import { errors } from "../../src/middlewares/errors.js";
import { registration } from "../../src/modules/partners/validation.js";

test("local penetration: real HTTP authentication, tenant boundaries and hostile inputs", async t => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(process.env.NODE_ENV === "test" && url && process.env.DATABASE_URL === url && /^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)), "Dedicated database required");
  // Test-process configuration only; never persist or print signing keys.
  process.env.AUTH_ACCESS_SECRET = randomBytes(32).toString("hex");
  process.env.WEB_APP_URL = "http://localhost:5173";
  process.env.AUTH_COOKIE_SAMESITE = "lax";
  process.env.AUTH_ACCESS_TTL_SECONDS = "600";
  process.env.AUTH_REFRESH_TTL_DAYS = "1";
  process.env.AUTH_RESET_TTL_MINUTES = "10";
  const settings = getAuthSettings();
  const f = await confirmationFixture();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const auth = new AuthService(prismaAuthStore(f.db), settings, { available: () => false, send: async () => {} });
  const fixturePassword = "Penetration fixture only 2026";
  const passwordHash = await hashPassword(fixturePassword);
  const actors: Record<string, { token: string; userId: string; key: string }> = {};
  let requests = 0;
  let blockedOutboundFetches = 0;
  const fetcher = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (target.hostname !== "127.0.0.1") {
      blockedOutboundFetches++;
      throw Error("Non-loopback fetch blocked by penetration harness");
    }
    return fetcher(input, options);
  };
  async function request(role: string | null, path: string, method = "GET", body?: unknown, headers: Record<string,string> = {}) {
    requests++;
    const actor = role ? actors[role]! : null;
    return fetch(base + path, { method, headers: {
      "X-DND-Client": "mobile", ...(actor ? { Authorization: `Bearer ${actor.token}`, "X-DND-User": actor.userId, "X-DND-Context": actor.key } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  }
  try {
    for (const [name, context] of Object.entries({ company: f.cc, agency: f.ac, courier: f.dc, peer: f.ec, shop: f.sc, outsider: f.xc })) {
      const user = await f.db.user.update({ where: { id: context.actorId }, data: { passwordHash } });
      const bundle = await auth.login(user.email, fixturePassword, { client: "MOBILE", deviceName: "Local penetration fixture", userAgent: null, ipHash: null });
      const p = await auth.authenticate(bundle.accessToken, "MOBILE");
      const profile = await auth.profile(p);
      const selected = profile.organizations.find(w => w.scope === context.scope && w.companyId === context.companyId && w.agencyId === context.agencyId && w.shopId === context.shopId);
      assert.ok(selected, name);
      await auth.switchOrganization(p, selected.key);
      actors[name] = { token: bundle.accessToken, userId: user.id, key: selected.key };
    }
    const mission = await f.fresh("1000");
    const ownOrder = mission.orderId;

    await t.test("positive controls: all six sessions are valid and authorized users can read the mission", async () => {
      for (const role of Object.keys(actors)) assert.equal((await request(role, "/auth/me")).status, 200, role);
      for (const role of ["company", "agency", "courier", "shop"]) assert.equal((await request(role, `/deliveries/${mission.id}`)).status, 200, role);
    });
    await t.test("IDOR: another courier and an unrelated shop cannot read orders, proofs or mission", async () => {
      for (const role of ["peer", "outsider"]) for (const endpoint of [`/deliveries/${mission.id}`, `/deliveries/${mission.id}/confirmation`, `/orders/${ownOrder}`]) {
        const r = await request(role, endpoint); assert.ok([403,404].includes(r.status), `${role} ${endpoint}: ${r.status}`);
      }
    });
    await t.test("scope tampering and forged role headers cannot elevate a tenant to global admin", async () => {
      for (const role of Object.keys(actors)) {
        const r = await request(role, "/admin/companies", "GET", undefined, { "X-Role": "super_admin", "X-Company-Id": f.other.id, "X-Forwarded-For": "127.0.0.1" });
        assert.equal(r.status, 403, role);
      }
      for (const path of [`/orders?companyId=${f.other.id}`, `/stocks?companyId=${f.other.id}`, `/financial-overview?companyId=${f.other.id}`])
        assert.equal((await request("company", path)).status, 403, path);
    });
    await t.test("JWT forgery: alg=none, altered subject and signature confusion are rejected", async () => {
      const original = actors.courier!.token.split(".");
      const claims = JSON.parse(Buffer.from(original[1]!,"base64url").toString());
      // Keep a real, live subject/session so a broken signature check would
      // actually authenticate; random nonexistent IDs would hide that defect.
      const payload = Buffer.from(JSON.stringify({ ...claims, role: "super_admin" })).toString("base64url");
      const subject = Buffer.from(JSON.stringify({ ...claims, sub: f.admin.id })).toString("base64url");
      for (const token of [Buffer.from('{"alg":"none"}').toString("base64url")+"."+payload+".", original[0]+"."+payload+"."+original[2], original[0]+"."+subject+"."+original[2], "undefined", "null", original.slice(0,2).join(".")+".invalid"]) {
        const r = await request(null, "/auth/me", "GET", undefined, { Authorization: "Bearer "+token });
        assert.equal(r.status, 401);
      }
    });
    await t.test("SQL/NoSQL/query fuzzing cannot expand result sets or expose server internals", async () => {
      for (const value of ["' OR 1=1 --", "'; SELECT SLEEP(1); --", "{\"$ne\":null}", "<svg/onload=alert(1)>", "../.env", "\\u0000", "%252e%252e%252f"]) {
        const r = await request("company", "/orders?q="+encodeURIComponent(value));
        assert.equal(r.status, 200); assert.equal((await r.json()).items.length, 0);
      }
      for (const path of ["/orders?companyId[$ne]=x", "/orders?page[$gt]=0", "/orders?size=10000000", "/orders?companyId='OR1=1", "/orders?page=1&page=2"])
        assert.equal((await request("company", path)).status, 400, path);
    });
    await t.test("mass assignment cannot grant global privileges or change account identifiers", async () => {
      for (const extra of [{role:"super_admin"},{id:f.admin.id},{status:"ACTIVE",passwordHash:"attacker"},JSON.parse('{"__proto__":{"isAdmin":true}}')]) {
        assert.equal((await request("courier", "/auth/me", "PATCH", {fullName:"Attempted elevation",phone:null,...extra})).status,400);
      }
      assert.equal(await f.db.globalRoleGrant.count({where:{userId:f.courier.id}}),0);
      assert.equal((await request("courier", "/admin/companies")).status,403);
    });
    await t.test("path traversal and diagnostic-file guesses never return private files", async () => {
      for (const path of ["/.env", "/../.env", "/%2e%2e%2f.env", "/storage/delivery-proofs/test.webp", "/delivery-evidence/..%2f..%2f.env/file", "/prisma/schema.prisma", "/debug", "/notifications/process"]) {
        const r = await request("courier", path); assert.ok([400,403,404].includes(r.status), path+": "+r.status);
        assert.ok(!/AUTH_ACCESS_SECRET=|DELIVERY_SECRET=|DATABASE_URL=|BEGIN PRIVATE KEY/.test(await r.text()));
      }
    });
    await t.test("pagination overflow is rejected before reaching the database", async () => {
      for (const endpoint of ["/orders", "/stocks", "/products", "/financial-overview"])
        assert.equal((await request("company", endpoint+"?page=2147483647&size=50")).status, 400, endpoint);
    });
    await t.test("malformed and spoofed photo payloads fail as validation errors, never server errors", async () => {
      for (const body of [{uri:"http://169.254.169.254/latest/meta-data/"},[1,2,3],"not a photograph"]) {
        const r=await request("courier", `/deliveries/${mission.id}/proofs?operationKey=${randomUUID()}&kind=HANDOVER`,"POST",body);
        assert.equal(r.status,400);
      }
      requests++;
      const badImage=await fetch(base+`/deliveries/${mission.id}/proofs?operationKey=${randomUUID()}&kind=HANDOVER`,{method:"POST",headers:{"X-DND-Client":"mobile",Authorization:"Bearer "+actors.courier!.token,"Content-Type":"image/png"},body:'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'});
      assert.equal(badImage.status,400);
      assert.equal(await f.db.deliveryEvidence.count({where:{deliveryId:mission.id}}),0);
    });
    await t.test("public registration must not reveal address existence through SMTP response timing", async () => {
      let release!: () => void, entered!: () => void;
      const gate=new Promise<void>(resolve=>{release=resolve;});
      const started=new Promise<void>(resolve=>{entered=resolve;});
      const service=new PartnerService(f.db,{available:()=>true,send:async()=>{entered();await gate;}},"http://localhost:5173");
      const send=service.sendInvitation.bind(service);
      let delivery:Promise<unknown>|undefined;
      service.sendInvitation=(id,raw)=>{const work=send(id,raw);delivery=work;return work;};
      const a=express();a.use(express.json());a.use("/signup",createPartnerRegistrationRouter(()=>auth,()=>service,["http://localhost:5173"]));a.use(errors);
      const s=a.listen(0,"127.0.0.1");await once(s,"listening");
      const address=s.address();assert.ok(address&&typeof address!=="string");
      const target=`http://127.0.0.1:${address.port}/signup`;
      const fields={name:"Local privacy fixture",fullName:"Fictitious owner",phone:"+237699123456",address:"Fictitious address",countryCode:"CM",city:"Douala",district:"Test",termsAccepted:true,website:""};
      let pending:Promise<Response>|undefined;
      try{
        requests++;pending=fetch(target,{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({...fields,email:`privacy-${randomUUID()}@example.invalid`})});
        await started;
        let timer:ReturnType<typeof setTimeout>|undefined;
        const response=await Promise.race([pending,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1500);})]);
        if(timer)clearTimeout(timer);
        assert.ok(response,"SMTP latency must not hold the public response open for only unknown addresses");
        assert.equal(response.status,202);
        const body=await response.json();
        requests++;const existing=await fetch(target,{method:"POST",headers:{"X-DND-Client":"mobile","Content-Type":"application/json"},body:JSON.stringify({...fields,email:f.shop.email})});
        assert.equal(existing.status,202);assert.deepEqual(await existing.json(),body);
      }finally{release();await delivery;await pending;s.closeAllConnections();await new Promise<void>(resolve=>s.close(()=>resolve()));}
      // Recovery after a process died before completing its deferred delivery.
      const orphanEmail=`orphan-${randomUUID()}@example.invalid`;
      const orphan=await service.prepare(f.db,{kind:"REGISTRATION",email:orphanEmail,fullName:fields.fullName,payload:{...fields}});
      const before=await f.db.shopInvitation.update({where:{id:orphan.id},data:{updatedAt:new Date(Date.now()-6*60000)}});
      await service.register(registration.parse({...fields,email:orphanEmail}),true);
      await delivery;
      const recovered=await f.db.shopInvitation.findUniqueOrThrow({where:{id:orphan.id}});
      assert.equal(recovered.deliveryStatus,"SENT");assert.notEqual(recovered.tokenHash,before.tokenHash);
      assert.equal(await f.db.shopInvitation.count({where:{kind:"REGISTRATION",email:orphanEmail}}),1);
    });
    await t.test("OTP replay and parallel guessing cannot evade the attempt limit", async () => {
      const actual=await f.code(mission.id),wrong=actual==="000000"?"000001":"000000";
      const attempt={version:mission.version,operationKey:randomUUID(),code:wrong};
      const first=await request("courier",`/deliveries/${mission.id}/otp/verify`,"POST",attempt);
      assert.equal(first.status,409);
      const row=()=>f.db.deliveryOtp.findFirstOrThrow({where:{deliveryId:mission.id},orderBy:{createdAt:"desc"}});
      assert.equal((await row()).attempts,1);
      assert.equal((await request("courier",`/deliveries/${mission.id}/otp/verify`,"POST",attempt)).status,409);
      assert.equal((await row()).attempts,1);
      const changed=await request("courier",`/deliveries/${mission.id}/otp/verify`,"POST",{...attempt,code:actual});
      assert.equal(changed.status,409);
      const results=await Promise.all(Array.from({length:4},()=>request("courier",`/deliveries/${mission.id}/otp/verify`,"POST",{...attempt,operationKey:randomUUID()})));
      for(const r of results)assert.ok([409,429].includes(r.status));
      assert.equal((await row()).status,"LOCKED");assert.equal((await row()).attempts,5);
      assert.equal((await request("courier",`/deliveries/${mission.id}/otp/verify`,"POST",{...attempt,operationKey:randomUUID(),code:actual})).status,429);
      assert.equal((await f.db.delivery.findUniqueOrThrow({where:{id:mission.id}})).status,"IN_PROGRESS");
    });
    await t.test("revoked refresh and bearer cannot regain a session", async () => {
      const actor=actors.peer!;
      const p=await auth.authenticate(actor.token,"MOBILE");await auth.logoutAll(p);
      assert.equal((await request("peer","/auth/me")).status,401);
      assert.equal((await request("peer","/deliveries")).status,401);
    });
    assert.equal(blockedOutboundFetches,0,"Untrusted inputs must not trigger an outbound fetch");
    console.log(JSON.stringify({localPenetrationRequests:requests,actors:Object.keys(actors).length,blockedOutboundFetches,nodeVersion:process.versions.node}));
  } finally {
    globalThis.fetch = fetcher;
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await f.db.$disconnect();await disconnectDatabase();
  }
});
