import { z } from "zod";
import { AuthError } from "../modules/auth/errors.js";
const schema = z.object({
  AUTH_ACCESS_SECRET: z.string().min(32),
  AUTH_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(1800)
    .default(600),
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  AUTH_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  WEB_APP_URL: z.url().default("http://localhost:5173"),
});
const secureConfigurationMessage =
  "La configuration sécurisée de l’authentification doit être complétée.";

export function checkAuthConfiguration(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    return {
      valid: false as const,
      fields: result.error.issues.map(issue => String(issue.path[0])),
      message: "L’authentification n’est pas configurée sur le serveur.",
    };
  }
  const settings = result.data;
  const secure = input.NODE_ENV === "production";
  const fields: string[] = [];
  if (settings.AUTH_COOKIE_SAMESITE === "none" && !secure)
    fields.push("AUTH_COOKIE_SAMESITE");
  if (secure && new URL(settings.WEB_APP_URL).protocol !== "https:")
    fields.push("WEB_APP_URL");
  return fields.length
    ? { valid: false as const, fields, message: secureConfigurationMessage }
    : { valid: true as const, settings, secure };
}

export type AuthSettings = ReturnType<typeof getAuthSettings>;
export function getAuthSettings() {
  const result = checkAuthConfiguration(process.env);
  if (!result.valid)
    throw new AuthError(503, "AUTH_NOT_CONFIGURED", result.message);
  const { settings: v, secure } = result;
  return {
    secret: v.AUTH_ACCESS_SECRET,
    accessSeconds: v.AUTH_ACCESS_TTL_SECONDS,
    refreshDays: v.AUTH_REFRESH_TTL_DAYS,
    resetMinutes: v.AUTH_RESET_TTL_MINUTES,
    sameSite: v.AUTH_COOKIE_SAMESITE,
    webUrl: new URL(v.WEB_APP_URL).origin,
    secure,
  };
}
