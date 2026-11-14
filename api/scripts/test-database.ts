import "dotenv/config";
import { spawnSync } from "node:child_process";
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
const environment = { ...process.env, DATABASE_URL: value, NODE_ENV: "test" };
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
    "tests/database/mobile.database.test.ts",
    "tests/database/security.database.test.ts",
    "tests/database/penetration.database.test.ts",
    "tests/database/reports.database.test.ts",
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
  if (result.status !== 0) process.exit(result.status ?? 1);
}
