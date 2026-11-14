import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../src/app.js";
import {env} from "../src/config/env.js";
import {
  digest,
  seal,
  unseal,
  otpCode,
} from "../src/modules/confirmation/security.js";
import * as v from "../src/modules/confirmation/validation.js";
test("tracking pages reveal nothing without a private session and malformed lookup stays generic", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const a = server.address();
    assert.ok(a && typeof a !== "string");
    const base = `http://127.0.0.1:${a.port}/api`;
    for (const ref of ["UNKNOWN", "DND-2026-PUBLIC-REFERENCE"]) {
      const r = await fetch(`${base}/tracking/${ref}`);
      assert.equal(r.status, 404);
      assert.equal(r.headers.get("cache-control"), "no-store");
      const body = JSON.stringify(await r.json());
      assert.ok(
        !/recipientEmail|recipientPhone|recipientAddress|codeHash/.test(body),
      );
    }
    const malformed = await fetch(base + "/tracking/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json",Origin:env.CORS_ORIGINS[0]!,"X-DND-Client":"web" },
      body: JSON.stringify({ reference: "UNKNOWN" }),
    });
    assert.equal(malformed.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("confirmation, files, exceptions, device registration and completion require authentication", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const a = server.address();
    assert.ok(a && typeof a !== "string");
    const base = `http://127.0.0.1:${a.port}/api`,
      id = "12345678-1234-4234-9234-123456789012";
    for (const path of [
      `deliveries/${id}/confirmation`,
      `deliveries/${id}/proofs`,
      `deliveries/${id}/communications`,
      `delivery-evidence/${id}/file`,
      `delivery-evidence/${id}/preview`,
    ])
      assert.equal((await fetch(base + "/" + path)).status, 401);
    for (const path of [
      `deliveries/${id}/otp/verify`,
      `deliveries/${id}/otp/resend`,
      `deliveries/${id}/proofs`,
      `deliveries/${id}/complete`,
      `deliveries/${id}/otp-exceptions`,
      `deliveries/${id}/otp-exceptions/${id}/decision`,
      `deliveries/${id}/tracking/renew`,
      "delivery-devices",
    ]) {
      const r = await fetch(base + "/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(r.status, 401, path);
    }
    assert.notEqual(
      (await fetch(base + "/notifications/process", { method: "POST" })).status,
      200,
    );
    assert.equal((await fetch(base + "/health")).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("encrypted secrets are context-bound and six digits use the server crypto primitive", () => {
  const value = "Test value only",
    sealed = seal(value, "order-one");
  assert.ok(sealed !== value);
  assert.ok(unseal(sealed, "order-one") === value);
  assert.throws(() => unseal(sealed, "order-two"));
  const bytes = Buffer.from(sealed, "base64url");
  bytes[13] = bytes[13]! ^ 1;
  assert.throws(() => unseal(bytes.toString("base64url"), "order-one"));
  assert.ok(digest("000001", "otp:a") !== digest("000001", "otp:b"));
  for (let i = 0; i < 25; i++) assert.ok(/^\d{6}$/.test(otpCode()));
});
test("proof commands reject client timestamps, guessed methods, duplicate sources and malformed OTP", () => {
  const id = "12345678-1234-4234-9234-123456789012",
    operationKey = "http-test-operation",
    base = { version: 1, operationKey };
  assert.equal(v.verify.safeParse({ ...base, code: "123456" }).success, true);
  for (const code of ["12345", "1234567", "1e2345", "abcdef"])
    assert.equal(v.verify.safeParse({ ...base, code }).success, false);
  assert.equal(
    v.upload.safeParse({
      operationKey,
      kind: "HANDOVER",
      receivedAt: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(
    v.complete.safeParse({ ...base, evidenceIds: [id, id] }).success,
    false,
  );
  assert.equal(
    v.complete.safeParse({ ...base, evidenceIds: [id], ignoreOtp: true })
      .success,
    false,
  );
});
