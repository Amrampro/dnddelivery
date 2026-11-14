import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareMigrationFiles, sqlChecksum } from "../scripts/migration-files.js";

const root = fileURLToPath(new URL("../prisma", import.meta.url));
test("MariaDB preserves all migration names and substitutes only reviewed SQL", () => {
  const prepared = prepareMigrationFiles(root, "mariadb");
  try {
    const originalNames = readdirSync(join(root, "migrations")).sort();
    assert.deepEqual(readdirSync(prepared.path).sort(), originalNames);
    const manifest = JSON.parse(readFileSync(join(root, "mariadb-overrides/sources.json"), "utf8"));
    for (const name of originalNames.filter(n => n !== "migration_lock.toml")) {
      const source = readFileSync(join(root, "migrations", name, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
      const sql = readFileSync(join(prepared.path, name, "migration.sql"), "utf8");
      if (!manifest[name]) assert.equal(sql, source);
      assert.doesNotMatch(sql, /REGEXP_LIKE|DROP CHECK/);
      // No business constraint or trigger may be silently removed.
      assert.equal((sql.match(/ADD CONSTRAINT/g) ?? []).length, (source.match(/ADD CONSTRAINT/g) ?? []).length);
      assert.equal((sql.match(/CREATE TRIGGER/g) ?? []).length, (source.match(/CREATE TRIGGER/g) ?? []).length);
    }
  } finally { prepared.cleanup(); }
  assert.equal(prepareMigrationFiles(root).path, join(root, "migrations"));
  assert.throws(() => prepareMigrationFiles(root, "unknown"));
});

test("new migrations are included; unsupported SQL and stale overrides fail closed", () => {
  const fixture = mkdtempSync(join(tmpdir(), "dnd-migration-test-"));
  try {
    mkdirSync(join(fixture, "migrations/new"), { recursive: true });
    mkdirSync(join(fixture, "mariadb-overrides/new"), { recursive: true });
    writeFileSync(join(fixture, "migrations/migration_lock.toml"), 'provider = "mysql"\n');
    const source = join(fixture, "migrations/new/migration.sql");
    const manifest = join(fixture, "mariadb-overrides/sources.json");
    writeFileSync(manifest, "{}");
    writeFileSync(source, "CREATE TABLE Example (id INT PRIMARY KEY);\n");
    const prepared = prepareMigrationFiles(fixture, "mariadb");
    prepared.cleanup();
    writeFileSync(source, "ALTER TABLE Example DROP CHECK example_check;\n");
    assert.throws(() => prepareMigrationFiles(fixture, "mariadb"), /incompatible/);
    writeFileSync(join(fixture, "mariadb-overrides/new/migration.sql"), "ALTER TABLE Example DROP CONSTRAINT example_check;\n");
    assert.throws(() => prepareMigrationFiles(fixture, "mariadb"), /checksum/);
    writeFileSync(manifest, JSON.stringify({ new: sqlChecksum(readFileSync(source, "utf8")) }));
    prepareMigrationFiles(fixture, "mariadb").cleanup();
    writeFileSync(source, "-- changed after review\n");
    assert.throws(() => prepareMigrationFiles(fixture, "mariadb"), /changed/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
