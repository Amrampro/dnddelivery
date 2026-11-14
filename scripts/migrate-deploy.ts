import "dotenv/config";
import { spawnSync } from "node:child_process";
import { migrationDatabaseEngine } from "../src/config/database.js";
import { disconnectDatabase, getDatabase } from "../src/database/client.js";

let supported = false;
try {
  const versions = await getDatabase().$queryRaw<Array<{ version: string }>>`
    SELECT VERSION() AS version
  `;
  const actualEngine = migrationDatabaseEngine(versions[0]?.version ?? "");
  const configuredEngine = process.env.DATABASE_ENGINE ?? "mysql";
  supported = actualEngine !== undefined && actualEngine === configuredEngine;
  if (!supported) {
    console.error("Migration refusée. Utiliser MySQL 8.0.16+ (branche 8) ou MariaDB 10.11.19+ (branche 10.11), et définir DATABASE_ENGINE=mysql ou mariadb selon le serveur.");
    process.exitCode = 1;
  }
} catch {
  console.error("Migration interrompue avant toute écriture. Vérifiez DATABASE_URL et l’accès à MySQL.");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}

if (supported) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
