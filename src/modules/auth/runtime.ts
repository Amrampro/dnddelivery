import { getAuthSettings } from "../../config/auth.js";
import { getDatabase } from "../../database/client.js";
import { AuthError } from "./errors.js";
import { AuthService } from "./auth.service.js";
import { prismaAuthStore } from "./prisma-auth.store.js";
import { smtpMailer } from "./smtp.js";
let service: AuthService | undefined;
export function getAuthService() {
  if (service) return service;
  const settings = getAuthSettings();
  if (!process.env.DATABASE_URL)
    throw new AuthError(
      503,
      "DATABASE_UNAVAILABLE",
      "La base de données des comptes n’est pas configurée.",
    );
  service = new AuthService(
    prismaAuthStore(getDatabase()),
    settings,
    smtpMailer(),
  );
  return service;
}
