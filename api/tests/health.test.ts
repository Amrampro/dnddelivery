import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { app } from "../src/app.js";
import { createReadiness } from "../src/controllers/health.controller.js";
test("HTTP contract, security, CORS and unknown routes", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ["/api/health", "/api/v1/health"]) {
      const res = await fetch(base + path, {
        headers: { Origin: "http://localhost:5173" },
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).status, "ok");
      assert.equal(
        res.headers.get("access-control-allow-origin"),
        "http://localhost:5173",
      );
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    }
    const blocked = await fetch(base + "/api/health", {
      headers: { Origin: "https://untrusted.invalid" },
    });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(base + "/api/missing")).status, 404);
    const invalid = await fetch(base + "/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(invalid.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Concurrent readiness requests share a probe and time out", async () => {
  const service = express();
  let probes = 0;
  service.get("/ready", createReadiness(() => {
    probes++;
    return new Promise<void>(() => {});
  }, 250));
  const server = service.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/ready`;
    const [first, second] = await Promise.all([fetch(url), fetch(url)]);
    for (const response of [first, second]) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { status: "unavailable" });
    }
    assert.equal(probes, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("Readiness reports a fresh result after a failed dependency check", async () => {
  const service = express();
  let available = false;
  service.get("/ready", createReadiness(async () => {
    if (!available) throw Error("private connection error");
  }));
  const server = service.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/ready`;
    const failed = await fetch(url);
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: "unavailable" });
    available = true;
    const ready = await fetch(url);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
