import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { getAuthSettings } from "../config/auth.js";
import { env } from "../config/env.js";
import { disconnectDatabase, getDatabase } from "../database/client.js";
import { smtpMailer } from "../modules/auth/smtp.js";
import { digest } from "../modules/confirmation/security.js";
import { checkPrivateDirectory } from "../utils/private-storage.js";

let step = "environnement de production";
try {
  if (env.NODE_ENV !== "production") throw Error();
  step = "authentification et origines Web HTTPS";
  const auth = getAuthSettings();
  if (!env.CORS_ORIGINS.includes(auth.webUrl) ||
      env.CORS_ORIGINS.some(origin => new URL(origin).protocol !== "https:"))
    throw Error();
  step = "cl� de confirmation ind�pendante";
  digest("preflight");
  if (process.env.DELIVERY_SECRET === auth.secret) throw Error();
  step = "configuration SMTP";
  if (!smtpMailer().available()) throw Error();
  for (const key of ["DELIVERY_PROOF_DIR", "COMPANY_LOGO_DIR", "PRODUCT_IMAGE_DIR"] as const) {
    step = key;
    const directory = process.env[key];
    if (!directory || !isAbsolute(directory)) throw Error();
    await checkPrivateDirectory(directory);
    await access(directory, constants.R_OK | constants.W_OK);
  }
  step = "connexion MySQL et tables de r�f�rence";
  const role = await getDatabase().role.findUnique({ where: { code: "super_admin" } });
  if (role?.scope !== "GLOBAL") throw Error();
  console.log("Pr�contr�le API r�ussi.");
} catch {
  console.error(`Pr�contr�le API �chou� (${step}).`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
