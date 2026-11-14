import { z } from "zod";
import { getDatabase } from "../../database/client.js";
import { getAuthSettings } from "../../config/auth.js";
import { invitationMailer } from "../auth/smtp.js";
import { AdminService } from "./service.js";
let service: AdminService | undefined;
export function getAdminService() {
  return (service ??= new AdminService(
    getDatabase(),
    invitationMailer(),
    getAuthSettings().webUrl,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(48)
      .parse(process.env.COMPANY_INVITATION_HOURS),
  ));
}
