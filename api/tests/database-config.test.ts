import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDatabaseUrl, databaseTls, supportsMigrationDatabase } from "../src/config/database.js";

test("migrations require a MySQL 8 release with enforced CHECK constraints", () => {
  for (const version of ["8.0.16", "8.4.13", "8.4.13-commercial"])
    assert.equal(supportsMigrationDatabase(version), true);
  for (const version of ["", "10.4.32-MariaDB", "8.0.15", "8.4.13-MariaDB", "9.0.1"])
    assert.equal(supportsMigrationDatabase(version), false);
});

test("MariaDB migrations accept only the targeted 10.11 branch from 10.11.19", () => {
  for (const version of ["10.11.19-MariaDB-0+deb12u1", "10.11.19-MariaDB", "10.11.20-MariaDB"])
    assert.equal(supportsMigrationDatabase(version), true);
  for (const version of ["10.11.18-MariaDB", "10.11.19", "11.4.8-MariaDB", "10.11.19-MariaDBfake"])
    assert.equal(supportsMigrationDatabase(version), false);
});
test("database configuration requires a named MySQL database", () => {
  assert.equal(
    parseDatabaseUrl("mysql://example:example@127.0.0.1:3306/dnd_delivery"),
    "mysql://example:example@127.0.0.1:3306/dnd_delivery",
  );
  for (const value of [
    undefined,
    "postgres://host/db",
    "mysql://localhost/",
    "not-a-url",
  ])
    assert.throws(() => parseDatabaseUrl(value));
});
test("security: remote production MySQL cannot silently use plaintext", () => {
  assert.throws(() => databaseTls("mysql://db.example.invalid/dnd_delivery", "production"));
  assert.deepEqual(databaseTls("mysql://db.example.invalid/dnd_delivery?ssl=true", "production"), { rejectUnauthorized: true });
  assert.equal(databaseTls("mysql://127.0.0.1/dnd_delivery_test", "production"), undefined);
  assert.equal(databaseTls("mysql://db.example.invalid/dnd_delivery_test", "test"), undefined);
});
