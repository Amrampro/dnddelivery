import { z } from "zod";
export const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "mysql:" && url.pathname.length > 1;
  }, "A named MySQL database URL is required");
export function parseDatabaseUrl(value: unknown) {
  return databaseUrlSchema.parse(value);
}
export function migrationDatabaseEngine(version: string): "mysql" | "mariadb" | undefined {
  const maria = /^10\.11\.(\d+)-MariaDB(?:$|[-+])/.exec(version);
  if (maria && Number(maria[1]) >= 19) return "mariadb";
  const match = /^8\.(\d+)\.(\d+)(?:$|[-+])/.exec(version);
  if (match && !/mariadb/i.test(version) &&
    (Number(match[1]) > 0 || Number(match[2]) >= 16)) return "mysql";
  return undefined;
}
export function supportsMigrationDatabase(version: string) {
  return migrationDatabaseEngine(version) !== undefined;
}
export function databaseTls(value: string, environment = process.env.NODE_ENV) {
  const url = new URL(value);
  const encrypted = url.searchParams.get("ssl") === "true";
  if (environment === "production" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !encrypted)
    throw new Error("Remote production MySQL connections require ssl=true and certificate verification");
  return encrypted ? { rejectUnauthorized: true as const } : undefined;
}
