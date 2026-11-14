import test from "node:test";
import assert from "node:assert/strict";
import {
  createTransport,
  parseCredentials,
  type Credentials,
} from "../src/auth/transport.ts";
const initial = { accessToken: "old-access", refreshToken: "old-refresh" };
const rotated = { accessToken: "new-access", refreshToken: "new-refresh" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const denied = () =>
  json(
    { error: { code: "UNAUTHENTICATED", message: "Reconnectez-vous." } },
    401,
  );
function fixture(
  handler: (url: string, options: RequestInit) => Promise<Response> | Response,
  timeoutMs = 1000,
) {
  let saved: Credentials | null = initial;
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const client = createTransport({
    baseUrl: "http://local.invalid/api",
    timeoutMs,
    storage: {
      async read() {
        return saved;
      },
      async write(value) {
        saved = value;
      },
      async remove() {
        saved = null;
      },
    },
    fetcher: (async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return handler(String(url), options);
    }) as typeof fetch,
  });
  return { client, calls, saved: () => saved };
}
test("restoration validates credentials and attaches bearer without mutating headers", async () => {
  const f = fixture(() => json({ ok: true }));
  await f.client.restoreCredentials();
  const headers = { "Content-Type": "image/jpeg" };
  await f.client.api("/proofs", {
    method: "POST",
    body: new Blob(["photo"]),
    headers,
  });
  assert.equal(
    new Headers(f.calls[0]!.options.headers).get("Authorization"),
    "Bearer old-access",
  );
  assert.equal(
    new Headers(f.calls[0]!.options.headers).get("Content-Type"),
    "image/jpeg",
  );
  assert.deepEqual(headers, { "Content-Type": "image/jpeg" });
});
test("malformed and empty session payloads are refused", () => {
  for (const value of [
    null,
    {},
    { accessToken: "", refreshToken: "r" },
    { accessToken: "a", refreshToken: 9 },
  ])
    assert.throws(() => parseCredentials(value), { code: "INVALID_RESPONSE" });
  assert.deepEqual(
    parseCredentials({ ...initial, password: "ignored" }),
    initial,
  );
});
test("parallel unauthorized reads rotate refresh exactly once and retry using the new bearer", async () => {
  let refreshes = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 10));
      return json(rotated);
    }
    return new Headers(options.headers).get("Authorization") ===
      "Bearer new-access"
      ? json({ ok: true })
      : denied();
  });
  await f.client.restoreCredentials();
  assert.deepEqual(
    await Promise.all([f.client.api("/one"), f.client.api("/two")]),
    [{ ok: true }, { ok: true }],
  );
  assert.equal(refreshes, 1);
  assert.deepEqual(f.saved(), rotated);
});
test("a network failure never automatically repeats a financial write", async () => {
  const f = fixture(() => {
    throw new TypeError("offline");
  });
  await f.client.restoreCredentials();
  await assert.rejects(
    f.client.api("/driver/collections", {
      method: "POST",
      body: '{"operationKey":"same-key"}',
    }),
    { code: "NETWORK_ERROR" },
  );
  assert.equal(f.calls.length, 1);
});
test("401 retry preserves the exact write body and binary MIME", async () => {
  const f = fixture((url, options) =>
    url.endsWith("/auth/refresh")
      ? json(rotated)
      : new Headers(options.headers).get("Authorization") ===
          "Bearer new-access"
        ? json({ ok: true })
        : denied(),
  );
  await f.client.restoreCredentials();
  const body = new Blob(["photo"]);
  await f.client.api("/proofs", {
    method: "POST",
    body,
    headers: { "Content-Type": "image/webp" },
  });
  const writes = f.calls.filter((c) => c.url.endsWith("/proofs"));
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every(
      (c) =>
        c.options.body === body &&
        new Headers(c.options.headers).get("Content-Type") === "image/webp",
    ),
  );
});
test("revoked refresh clears persisted credentials and notifies once", async () => {
  const f = fixture(() => denied());
  await f.client.restoreCredentials();
  let count = 0;
  f.client.onSessionInvalid(() => count++);
  await assert.rejects(f.client.api("/private"), { status: 401 });
  assert.equal(f.saved(), null);
  assert.equal(count, 1);
  assert.equal(f.calls.length, 2);
});
test("a second 401 cannot start a refresh loop", async () => {
  const f = fixture((url) =>
    url.endsWith("/auth/refresh") ? json(rotated) : denied(),
  );
  await f.client.restoreCredentials();
  await assert.rejects(f.client.api("/private"), { status: 401 });
  assert.equal(f.calls.length, 3);
  assert.equal(f.saved(), null);
});
test("a temporary refresh outage retains the recoverable session", async () => {
  const f = fixture((url) => {
    if (url.endsWith("/auth/refresh")) throw Error("offline");
    return denied();
  });
  await f.client.restoreCredentials();
  await assert.rejects(f.client.api("/private"), { code: "NETWORK_ERROR" });
  assert.deepEqual(f.saved(), initial);
});
test("identical in-flight reads share a request, but later reads fetch fresh data", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async () => {
    await wait;
    return json({ ok: true });
  });
  const a = f.client.api("/orders"),
    b = f.client.api("/orders");
  assert.equal(f.calls.length, 1);
  release();
  await Promise.all([a, b]);
  await f.client.api("/orders");
  assert.equal(f.calls.length, 2);
});
test("context changes reject a late old-tenant response even if transport ignores abort", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async (url) => {
    if (url.endsWith("/orders")) {
      await wait;
      return json({ tenant: "old" });
    }
    return json({ tenant: "new" });
  });
  const old = f.client.api("/orders");
  const rejected = assert.rejects(old, { code: "CONTEXT_CHANGED" });
  await f.client.switchContext("company:new");
  release();
  await rejected;
});
test("context cannot switch while a sensitive write is unconfirmed", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async () => {
    await wait;
    return json({ ok: true });
  });
  const write = f.client.api("/collections", { method: "POST", body: "{}" });
  assert.throws(()=>f.client.assertCanSwitchContext(),{code:"OPERATION_PENDING"});
  await assert.rejects(f.client.switchContext("new"), {
    code: "OPERATION_PENDING",
  });
  assert.equal(f.calls.length, 1);
  release();
  await write;
});
test("requests cannot use the previous workspace while a switch is pending", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async () => {
    await wait;
    return json({ ok: true });
  });
  const change = f.client.switchContext("new");
  await assert.rejects(f.client.api("/orders"), { code: "CONTEXT_CHANGING" });
  release();
  await change;
});
test("caller abort is honored and never retried", async () => {
  const f = fixture(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal?.addEventListener("abort", () =>
          reject(Error("aborted")),
        ),
      ),
  );
  const controller = new AbortController();
  const pending = f.client.api("/orders", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: "REQUEST_CANCELLED" });
  assert.equal(f.calls.length, 1);
});
test("a response-body timeout remains bounded and reports unconfirmed operation", async () => {
  const f = fixture(
    (_url, options) =>
      ({
        status: 200,
        ok: true,
        json: () =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener("abort", () =>
              reject(Error("aborted")),
            ),
          ),
      }) as Response,
    15,
  );
  await assert.rejects(f.client.api("/slow"), { code: "REQUEST_TIMEOUT" });
});
test("invalid JSON is an explicit response failure, not a successful null value", async () => {
  const f = fixture(() => new Response("<html>broken</html>", { status: 200 }));
  await assert.rejects(f.client.api("/orders"), { code: "INVALID_RESPONSE" });
});
test("204 is a successful empty response", async () => {
  const f = fixture(() => new Response(null, { status: 204 }));
  assert.equal(await f.client.api("/empty"), undefined);
});
test("absolute or protocol-relative API paths cannot receive credentials", async () => {
  const f = fixture(() => json({}));
  await f.client.restoreCredentials();
  for (const path of [
    "https://other.invalid",
    "//other.invalid",
    "/\\other.invalid",
  ])
    await assert.rejects(f.client.api(path), { code: "INVALID_API_PATH" });
  assert.equal(f.calls.length, 0);
});
test("server refusal preserves session and never retries a business conflict", async () => {
  const f = fixture(() =>
    json(
      { error: { code: "VERSION_CONFLICT", message: "Rechargez la mission." } },
      409,
    ),
  );
  await f.client.restoreCredentials();
  await assert.rejects(
    f.client.api("/complete", { method: "POST", body: "{}" }),
    { code: "VERSION_CONFLICT" },
  );
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.saved(), initial);
});
test("logout revokes the server session before removing local credentials", async () => {
  const f = fixture(() => json({ ok: true }));
  await f.client.restoreCredentials();
  await f.client.logout();
  assert.equal(f.calls[0]!.url, "http://local.invalid/api/auth/logout");
  assert.equal(f.saved(), null);
});
test("offline logout is not reported as server revocation", async () => {
  const f = fixture(() => {
    throw Error("offline");
  });
  await f.client.restoreCredentials();
  await assert.rejects(f.client.logout(), { code: "NETWORK_ERROR" });
  assert.deepEqual(f.saved(), initial);
});
test("late reads cannot reappear after local session erasure", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async () => {
    await wait;
    return json({ private: true });
  });
  await f.client.restoreCredentials();
  const old = f.client.api("/orders");
  const rejected = assert.rejects(old, { code: "SESSION_CHANGED" });
  await f.client.forgetSession();
  release();
  await rejected;
  assert.equal(f.saved(), null);
});
test("timeouts are bounded even when the underlying transport ignores cancellation", async () => {
  const f = fixture(() => new Promise(() => undefined), 15);
  await assert.rejects(f.client.api("/unresponsive"), {
    code: "REQUEST_TIMEOUT",
  });
});
test("a late old-token 401 reuses the already-rotated token without another refresh", async () => {
  let release!: () => void;
  const delayed = new Promise<void>((r) => {
    release = r;
  });
  let refreshes = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith("/auth/refresh")) {
      refreshes++;
      return json(rotated);
    }
    if (
      new Headers(options.headers).get("Authorization") === "Bearer new-access"
    )
      return json({ ok: true });
    if (url.endsWith("/late")) await delayed;
    return denied();
  });
  await f.client.restoreCredentials();
  const late = f.client.api("/late");
  await f.client.api("/early");
  release();
  await late;
  assert.equal(refreshes, 1);
});
test("login responses are validated before writing sensitive storage", async () => {
  const f = fixture(() => json({ accessToken: "missing-refresh" }));
  await assert.rejects(f.client.login("x", "fake", "test"), {
    code: "INVALID_RESPONSE",
  });
  assert.deepEqual(f.saved(), initial);
});
test("a stale refresh cannot restore credentials after session erasure", async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const f = fixture(async (url) => {
    if (url.endsWith("/auth/refresh")) {
      await wait;
      return json(rotated);
    }
    return denied();
  });
  await f.client.restoreCredentials();
  const pending = f.client.api("/private");
  const rejected = assert.rejects(pending, { code: "SESSION_CHANGED" });
  while (!f.calls.some((c) => c.url.endsWith("/auth/refresh")))
    await new Promise((r) => setTimeout(r, 1));
  await f.client.forgetSession();
  release();
  await rejected;
  assert.equal(f.saved(), null);
});
