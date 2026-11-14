import "dotenv/config";
import { defineConfig } from "prisma/config";
import { fileURLToPath } from "node:url";
import { prepareMigrationFiles } from "./scripts/migration-files.js";
if (process.env.DATABASE_ENGINE === "mariadb" && process.argv.includes("dev"))
  throw new Error("Create migrations in the canonical MySQL development history, then review/test MariaDB overrides. migrate dev cannot write to the temporary MariaDB history.");
const migrations = prepareMigrationFiles(fileURLToPath(new URL("./prisma", import.meta.url)), process.env.DATABASE_ENGINE);
process.once("exit", migrations.cleanup);
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: migrations.path, seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
