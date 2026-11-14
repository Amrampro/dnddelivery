import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("bootstrap refuses missing explicit initialization credentials before database access", () => {
  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (key.startsWith("BOOTSTRAP_")) delete environment[key];
  environment.DOTENV_CONFIG_PATH = "tests/nonexistent-private-environment";
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/bootstrap-super-admin.ts"],
    { encoding: "utf8", env: environment, timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bootstrap refused/);
  assert.ok(!result.stdout.includes("created"));
});
