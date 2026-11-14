import test from "node:test";
import assert from "node:assert/strict";
import { assertSecureNode } from "../src/config/runtime.js";
import { checkAuthConfiguration } from "../src/config/auth.js";
test("security: runtime must include the supported Node security release floor", t => {
  t.diagnostic(`Runtime used: ${process.versions.node}`);
  for (const version of ["22.23.4", "22.24.0", "24.22.1", "24.22.2", "26.12.1", "26.13.0"])
    assert.doesNotThrow(() => assertSecureNode(version));
  for (const version of ["22.13.0", "22.23.3", "24.22.0", "26.12.0", "20.20.0", "23.0.0", "27.0.0", "invalid"])
    assert.throws(() => assertSecureNode(version));
  assert.doesNotThrow(() => assertSecureNode());
});

test("auth configuration identifies invalid settings without returning input values", () => {
  const missing = checkAuthConfiguration({ NODE_ENV: "development" });
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.valid === false && missing.fields, ["AUTH_ACCESS_SECRET"]);

  const settings = { AUTH_ACCESS_SECRET: "a".repeat(32), WEB_APP_URL: "http://localhost:5173" };
  assert.equal(checkAuthConfiguration({ ...settings, NODE_ENV: "development" }).valid, true);
  const insecure = checkAuthConfiguration({ ...settings, NODE_ENV: "production" });
  assert.deepEqual(insecure.valid === false && insecure.fields, ["WEB_APP_URL"]);
  assert.equal(JSON.stringify(insecure).includes(settings.AUTH_ACCESS_SECRET), false);
});
