import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { parseDatabaseUrl, databaseTls } from "../config/database.js";
import { assertSecureNode } from "../config/runtime.js";
let database: PrismaClient | undefined;
export function createDatabase(value: string) {
  assertSecureNode();
  const url = new URL(parseDatabaseUrl(value));
  const ssl = databaseTls(url.toString());
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 5,
    timezone: "+00:00",
    initSql: "SET time_zone = '+00:00'",
    connectTimeout: 5000,
    ...(process.env.DATABASE_RSA_PUBLIC_KEY_FILE
      ? {
          cachingRsaPublicKey: readFileSync(
            process.env.DATABASE_RSA_PUBLIC_KEY_FILE,
            "utf8",
          ),
        }
      : {}),
    ...(ssl ? { ssl } : {}),
  });
  return new PrismaClient({ adapter });
}
export function getDatabase() {
  if (!database)
    database = createDatabase(parseDatabaseUrl(process.env.DATABASE_URL));
  return database;
}
export async function disconnectDatabase() {
  if (database) {
    await database.$disconnect();
    database = undefined;
  }
}
