import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { Writable } from "node:stream";
import express from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { app } from "../src/app.js";
import { httpLogSerializers } from "../src/utils/http-log.js";
import { requireAuthentication } from "../src/modules/auth/auth.middleware.js";
import { errors } from "../src/middlewares/errors.js";
import cookieParser from "cookie-parser";
import { authFixture, fixturePassword } from "./helpers/auth-fixture.js";
import { randomUUID } from "node:crypto";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";

async function serve(application: typeof app) {
  const server = application.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { base: `http://127.0.0.1:${address.port}`, close: () =>
    new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}

test("security: unauthenticated access is denied across all protected modules", async () => {
  const h = await serve(app);
  const id = "00000000-0000-4000-8000-000000000001";
  try {
    for (const path of ["auth/me", "auth/sessions", "admin/dashboard", "admin/companies",
      "admin/subscriptions", "company/profile", "company/employees", "company/agencies",
      "company/subscription", "company/partners", "partners/profile", "products", "stocks",
      "stock-deposits", "stock-withdrawals", "stock-transfers", "inventories", "orders", "recipients",
      "deliveries", "driver/missions", "driver/profile", "collections", "cash-remittances",
      "financial-overview", "financial-notifications", "delivery-devices",
      `delivery-evidence/${id}/file`, `delivery-evidence/${id}/preview`,
      `deliveries/${id}/confirmation`, `deliveries/${id}/communications`]) {
      const r = await fetch(`${h.base}/api/${path}`);
      assert.equal(r.status, 401, path);
      assert.equal(r.headers.get("cache-control"), "no-store", path);
      assert.ok(!JSON.stringify(await r.json()).match(/passwordHash|stack|mysql:|refreshToken/));
    }
    for (const path of [`deliveries/${id}/complete`, `deliveries/${id}/otp/verify`,
      `deliveries/${id}/proofs`, "orders", "stock-deposits", "cash-remittances", "delivery-devices"]) {
      const r = await fetch(`${h.base}/api/${path}`, { method: "POST",
        headers: { "Content-Type": "application/json", "X-DND-Client": "mobile" }, body: "{}" });
      assert.equal(r.status, 401, path);
    }
  } finally { await h.close(); }
});

test("security: compressed, oversized and malformed JSON are rejected without crashing the API", async () => {
  const h = await serve(app);
  try {
    for (const [body, headers, expected] of [
      [gzipSync(Buffer.from('{"email":"fixture@example.invalid"}')), { "Content-Encoding": "gzip" }, 415],
      ["x".repeat(110000), {}, 413], ["{invalid", {}, 400],
    ] as const) {
      const response = await fetch(`${h.base}/api/auth/login`, { method: "POST",
        headers: { "Content-Type": "application/json", ...headers }, body });
      assert.equal(response.status, expected);
      assert.equal((await fetch(`${h.base}/api/health`)).status, 200);
    }
  } finally { await h.close(); }
});

test("security: real HTTP access logs exclude query secrets, cookies and capability referrers", async () => {
  let output = "";
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
  const a = express();
  a.use(pinoHttp({ logger: pino({}, stream), serializers: httpLogSerializers }));
  a.get("/probe", (_q, s) => { s.cookie("session", "secret-response"); s.json({ ok: true }); });
  const h = await serve(a);
  try {
    const response = await fetch(`${h.base}/probe?token=secret-query&email=secret-email`, {
      headers: { Cookie: "session=secret-cookie", Authorization: "Bearer secret-bearer",
        Referer: "https://example.invalid/reset?token=secret-referrer", "X-CSRF-Token": "secret-csrf" },
    });
    await response.text();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(output.includes("/probe"));
    for (const secret of ["secret-query", "secret-email", "secret-cookie", "secret-bearer", "secret-referrer", "secret-csrf", "secret-response"])
      assert.ok(!output.includes(secret), secret);
  } finally { await h.close(); }
});

test("security: a stale browser context cannot read or mutate the newly selected company", async () => {
  for (const client of ["WEB", "MOBILE"] as const) {
    const f = await authFixture();
    const bundle = await f.service.login("auth-fixture@example.invalid", fixturePassword,
      { client, deviceName: "Security test", ipHash: null, userAgent: null });
    const p = await f.service.authenticate(bundle.accessToken, client);
    await f.service.switchOrganization(p, f.choices[0]!.key);
    let mutations = 0;
    const a = express();
    a.use(express.json());
    a.use(cookieParser());
    a.use("/auth", createAuthRouter(() => f.service, ["http://localhost:5173"]));
    a.use(requireAuthentication(() => f.service));
    a.get("/probe", (_q,s) => s.json({ ok: true }));
    a.post("/probe", (_q,s) => { mutations++; s.json({ ok: true }); });
    a.use(errors);
    const h = await serve(a);
    const headers = { "X-DND-Client": client.toLowerCase(), "X-DND-Context": f.choices[0]!.key,
      "X-DND-User": p.user.id,
      ...(client === "WEB" ? { Cookie: `dnd_access=${bundle.accessToken}` } : { Authorization: `Bearer ${bundle.accessToken}` }) };
    try {
      assert.equal((await fetch(h.base + "/probe", { headers })).status, 200);
      await f.service.switchOrganization(p, f.choices[1]!.key);
      for (const method of ["GET", "POST"]) {
        const r = await fetch(h.base + "/probe", { method, headers });
        assert.equal(r.status, 403);
        assert.equal((await r.json()).error.code, "CONTEXT_CHANGED");
      }
      assert.equal(mutations, 0);
      assert.equal((await fetch(h.base + "/probe", { headers: { ...headers, "X-DND-Context": f.choices[1]!.key } })).status, 200);
      const otherId = randomUUID();
      const otherEmail = `${otherId}@example.invalid`;
      f.store.data.users.set(otherId, { ...p.user, id: otherId, email: otherEmail });
      f.store.data.contexts.set(otherId, f.choices);
      f.store.data.companyGrants.set(`${otherId}:${f.companyB}`, structuredClone(f.store.data.companyGrants.get(`${p.user.id}:${f.companyB}`)!));
      const otherBundle = await f.service.login(otherEmail, fixturePassword,
        { client, deviceName: "Other test account", ipHash: null, userAgent: null });
      const otherPrincipal = await f.service.authenticate(otherBundle.accessToken, client);
      await f.service.switchOrganization(otherPrincipal, f.choices[1]!.key);
      const switched = await fetch(h.base + "/probe", { method: "POST", headers: { ...headers,
        "X-DND-Context": f.choices[1]!.key,
        ...(client === "WEB" ? { Cookie: `dnd_access=${otherBundle.accessToken}` } : { Authorization: `Bearer ${otherBundle.accessToken}` }) } });
      assert.equal(switched.status, 403);
      assert.equal((await switched.json()).error.code, "SESSION_CHANGED");
      assert.equal(mutations, 0);
      const profileMutation = await fetch(h.base + "/auth/me", { method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Origin: "http://localhost:5173",
          ...(otherBundle.csrfToken ? { "X-CSRF-Token": otherBundle.csrfToken } : {}),
          ...(client === "WEB" ? { Cookie: `dnd_access=${otherBundle.accessToken}` } : { Authorization: `Bearer ${otherBundle.accessToken}` }) },
        body: JSON.stringify({ fullName: "Unexpected account mutation", phone: null }) });
      assert.equal(profileMutation.status, 403);
      assert.equal((await profileMutation.json()).error.code, "SESSION_CHANGED");
      assert.notEqual(f.store.data.users.get(otherId)!.fullName, "Unexpected account mutation");
    } finally { await h.close(); }
  }
});
