import type {
  PrismaClient,
  Notification,
  Prisma,
} from "../../generated/prisma/client.js";
import { StockService } from "../stocks/service.js";
import { trackingLink, publicDeliveryEvents } from "./tracking.js";
import { ensureOtp } from "./otp.js";
import { eligible, unseal } from "./security.js";
import { AuthError } from "../auth/errors.js";
export interface RecipientMailer {
  send(
    to: string,
    subject: string,
    text: string,
    messageId: string,
    html?: string,
  ): Promise<void>;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function recipientMessage(
  db: PrismaClient,
  row: Notification,
  now = new Date(),
) {
  return new StockService(db).transaction(async (tx) => {
    const payload = row.payload as Prisma.JsonObject,
      deliveryId =
        typeof payload.deliveryId === "string" ? payload.deliveryId : null;
    const o = await tx.order.findFirst({
      where: {
        companyId: row.companyId,
        recipientEmail: row.recipientAddress,
        isDraft: false,
        ...(deliveryId
          ? { delivery_orderRecords: { some: { id: deliveryId } } }
          : { id: row.sourceId }),
      },
    });
    if (!o) return null;
    await tx.$queryRaw`SELECT id FROM Company WHERE id=${o.companyId} FOR UPDATE`;
    const link = await trackingLink(tx, o, now),
      action = String(payload.event ?? row.sourceEvent),
      title =
        action === "ORDER_SUBMITTED"
          ? "Votre commande est enregistr�e"
          : action === "TRACKING_ACCESS"
            ? "Votre lien personnel de suivi"
            : action === "ORDER_CANCELLED"
              ? "Votre commande a �t� annul�e"
              : (publicDeliveryEvents[action] ??
                "Votre suivi a �t� mis � jour");
    let code: string | undefined;
    if (["FINAL_DISTRIBUTION", "OTP_RENEWED"].includes(action) && deliveryId) {
      const d = await tx.delivery.findUnique({ where: { id: deliveryId } });
      if (d && eligible(d)) {
        try {
          const otp = await ensureOtp(tx, d, false, now);
          if (otp.status === "PENDING" && otp.sealedCode)
            code = unseal(otp.sealedCode, "otp:" + otp.id);
        } catch (e) {
          if (
            !(e instanceof AuthError) ||
            ![
              "OTP_LOCKED",
              "OTP_COOLDOWN",
              "OTP_RENEWAL_LIMIT",
              "OTP_UNAVAILABLE",
            ].includes(e.code)
          )
            throw e;
        }
      }
    }
    const caution = code
      ? `Votre code de remise : ${code}. Il expire dans trente minutes au maximum. Communiquez ce code uniquement lorsque le livreur vous pr�sente votre colis.`
      : action === "COMPLETED"
        ? "La remise a �t� confirm�e avec les preuves requises. Consultez votre suivi pour les d�tails."
        : "Consultez le suivi pour conna�tre la situation actuelle. Le lien est personnel ; ne le partagez pas.";
    const subject = title + " � DND Delivery",
      text = `${title}\nCommande ${o.publicNumber}\n\n${caution}\n\nSuivre mon colis : ${link}\n\nDND Delivery - Plus proches de vos clients. Ce message ne confirme aucun paiement.`;
    const html = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7fb;color:#033173;font:16px Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:28px;background:#fff;border-radius:16px"><p style="font-size:23px;font-weight:bold">DND Delivery</p><p style="color:#0BB058">Plus proches de vos clients.</p><h1 style="font-size:25px">${escape(title)}</h1><p style="overflow-wrap:anywhere">Commande ${escape(o.publicNumber)}</p><p style="line-height:1.6">${escape(caution)}</p><p style="margin:28px 0"><a style="display:inline-block;padding:14px 22px;background:#033173;color:#fff;border-radius:10px;text-decoration:none" href="${escape(link)}">Suivre mon colis</a></p><p style="font-size:13px;color:#53647c">Ce lien personnel ne permet ni de modifier une commande ni de confirmer un paiement.</p></main></body></html>`;
    return { subject, text, html };
  });
}
export async function attemptOutcome(
  db: Pick<PrismaClient, "notificationAttempt">,
  row: Notification,
  outcome: "ACCEPTED" | "FAILED" | "CANCELLED",
) {
  await db.notificationAttempt.createMany({
    data: [
      {
        companyId: row.companyId,
        notificationId: row.id,
        attempt: row.attempts,
        outcome,
      },
    ],
    skipDuplicates: true,
  });
}
export async function finishNotification(
  db: PrismaClient,
  row: Notification,
  where: Prisma.NotificationWhereInput,
  data: Prisma.NotificationUpdateManyMutationInput,
  outcome: "ACCEPTED" | "FAILED" | "CANCELLED",
) {
  return db.$transaction(async (tx) => {
    const result = await tx.notification.updateMany({ where, data });
    if (result.count) await attemptOutcome(tx, row, outcome);
    return result.count;
  });
}
