import { spawnSync } from "node:child_process";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Unit/HTTP fixtures must never connect to the developer's private database.
const environment = { ...process.env, NODE_ENV: "test" };
delete environment.DATABASE_URL;
delete environment.AUTH_ACCESS_SECRET;
environment.DOTENV_CONFIG_PATH = "tests/nonexistent-private-environment";
environment.DELIVERY_SECRET = randomBytes(32).toString("hex");
const logs = mkdtempSync(join(tmpdir(), "dnd-unit-logs-"));
environment.TECHNICAL_LOG_DIR = logs;
try {
  const cli = fileURLToPath(
    new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [cli, "--test", "tests/*.test.ts"],
    {
      env: environment,
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (dirname(resolve(logs)) === resolve(tmpdir()))
    rmSync(logs, { recursive: true, force: true });
  else process.exitCode = 1;
}
