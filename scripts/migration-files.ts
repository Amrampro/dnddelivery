import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function sqlChecksum(sql: string) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

// MySQL's published history stays untouched. MariaDB uses explicit, reviewed
// overrides for incompatible SQL; new portable migrations are included as-is.
export function prepareMigrationFiles(prismaRoot: string, engine = "mysql") {
  if (engine !== "mysql" && engine !== "mariadb")
    throw new Error("DATABASE_ENGINE must be mysql or mariadb");
  const source = join(prismaRoot, "migrations");
  if (engine === "mysql") return { path: source, cleanup: () => {} };
  const overrides = join(prismaRoot, "mariadb-overrides");
  const manifest: Record<string, string> = JSON.parse(readFileSync(join(overrides, "sources.json"), "utf8"));
  const names = readdirSync(source, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of Object.keys(manifest)) {
    if (!names.includes(name)) throw new Error(`Orphan MariaDB override: ${name}`);
  }
  const target = mkdtempSync(join(tmpdir(), "dnd-mariadb-migrations-"));
  const cleanup = () => rmSync(target, { recursive: true, force: true });
  try {
    copyFileSync(join(source, "migration_lock.toml"), join(target, "migration_lock.toml"));
    for (const name of names) {
      const original = readFileSync(join(source, name, "migration.sql"), "utf8");
      const override = join(overrides, name, "migration.sql");
      if (existsSync(override) !== Object.hasOwn(manifest, name))
        throw new Error(`Missing MariaDB override or source checksum: ${name}`);
      if (manifest[name] && manifest[name] !== sqlChecksum(original))
        throw new Error(`Source migration changed; review MariaDB override: ${name}`);
      const sql = existsSync(override) ? readFileSync(override, "utf8") : original;
      if (/\bREGEXP_LIKE\s*\(|\bDROP\s+CHECK\b/i.test(sql))
        throw new Error(`MariaDB-incompatible SQL requires a reviewed override: ${name}`);
      mkdirSync(join(target, name));
      writeFileSync(join(target, name, "migration.sql"), sql.replace(/\r\n/g, "\n"));
    }
    return { path: target, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
