import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
const value = process.env.TEST_DATABASE_URL;
if (!value) {
  console.error(
    "NOT RUN: TEST_DATABASE_URL is missing. Provide a dedicated MySQL 8 test database ending in _test. No migration was applied.",
  );
  process.exit(2);
}
const url = new URL(value);
if (
  process.env.NODE_ENV === "production" ||
  url.protocol !== "mysql:" ||
  !/^dnd_delivery[\w]*_test$/.test(url.pathname.slice(1))
)
  throw new Error(
    "Refusing to run outside a dedicated dnd_delivery*_test MySQL database",
  );
const logs = mkdtempSync(join(tmpdir(), "dnd-database-logs-"));
// HTTP fixtures run in a fresh CI environment, independently of private .env keys.
const environment = {
  ...process.env,
  DATABASE_URL: value,
  NODE_ENV: "test",
  AUTH_ACCESS_SECRET: randomBytes(32).toString("hex"),
  DELIVERY_SECRET: randomBytes(32).toString("hex"),
  TECHNICAL_LOG_DIR: logs,
  AUTH_COOKIE_SAMESITE: "lax",
  WEB_APP_URL: "http://localhost:5173",
};
try {
  for (const args of [
    ["--import", "tsx", "scripts/migrate-deploy.ts"],
    // Business fixtures require the reference roles, permissions and subscription plan.
    // Seed before the suite as well as afterwards to exercise repeatable initialization.
    ["--import", "tsx", "prisma/seed.ts"],
    [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/database/integrity.test.ts",
      "tests/database/auth.database.test.ts",
      "tests/database/admin.database.test.ts",
      "tests/database/subscriptions.database.test.ts",
      "tests/database/organization.database.test.ts",
      "tests/database/partners.database.test.ts",
      "tests/database/products.database.test.ts",
      "tests/database/stocks.database.test.ts",
      "tests/database/orders.database.test.ts",
      "tests/database/deliveries.database.test.ts",
      "tests/database/collections.database.test.ts",
      "tests/database/confirmation.database.test.ts",
      "tests/database/customers.database.test.ts",
      "tests/database/mobile.database.test.ts",
      "tests/database/security.database.test.ts",
      "tests/database/penetration.database.test.ts",
      "tests/database/reports.database.test.ts",
      "tests/database/admin-logs.database.test.ts",
    ],
    ["--import", "tsx", "prisma/seed.ts"],
    ["--import", "tsx", "--test", "tests/database/lifecycle.database.test.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env: {
        ...environment,
        SUBSCRIPTION_SEED_PRICE: "1000.0000",
        SUBSCRIPTION_SEED_CURRENCY: "XAF",
      },
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  if (dirname(resolve(logs)) === resolve(tmpdir()))
    rmSync(logs, { recursive: true, force: true });
  else {
    console.error("Unsafe database-test log cleanup path");
    process.exitCode = 1;
  }
}
