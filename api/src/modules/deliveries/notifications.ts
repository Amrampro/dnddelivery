import { randomUUID } from "node:crypto";
import {
  recipientMessage,
  finishNotification,
} from "../confirmation/communications.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { DeliveryService } from "./service.js";
const labels: Record<string, string> = {
  ASSIGNED: "affectation enregistr�e",
  REASSIGNED: "r�affectation enregistr�e",
  HANDOVER_REQUESTED: "remise de garde � confirmer",
  HANDOVER_ACCEPTED: "remise de garde confirm�e",
  PICKED_UP: "colis pris en charge",
  TRANSFER_DISPATCHED: "d�part inter-agences enregistr�",
  TRANSFER_RECEIVED: "r�ception inter-agences enregistr�e",
  FINAL_DISTRIBUTION: "distribution finale commenc�e",
  ATTEMPT: "confirmation de remise en attente de preuve",
  ATTEMPT_FAILED: "tentative de livraison �chou�e",
  RETURN_STARTED: "retour engag�",
  RETURN_RECEIVED: "retour r�ceptionn�",
};
export class DeliveryNotifications {
  constructor(
    readonly service: DeliveryService,
    readonly clock = () => new Date(),
    readonly companyId?: string,
  ) {}
  async run(
    adapter: {
      send(
        to: string,
        subject: string,
        text: string,
        messageId: string,
        html?: string,
      ): Promise<void>;
      push?: (
        userId: string,
        payload: { title: string; body: string; deliveryId: string },
        key: string,
      ) => Promise<void>;
    },
    limit = 100,
  ) {
    let sent = 0,
      failed = 0,
      cancelled = 0;
    const stale = new Date(this.clock().getTime() - 300000);
    await this.service.db
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Bail expir�' WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,9)='DELIVERY_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
    const channels = adapter.push
      ? Prisma.sql`('EMAIL','PUSH')`
      : Prisma.sql`('EMAIL')`;
    for (let i = 0; i < limit; i++) {
      const owner = randomUUID();
      const row = await this.service.transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM Notification WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,9)='DELIVERY_' AND channel IN ${channels} AND attempts<maxAttempts AND ((status IN ('PENDING','FAILED') AND availableAt<=${this.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        return rows[0]
          ? tx.notification.update({
              where: { id: rows[0].id },
              data: {
                status: "PROCESSING",
                deliveryState: "PROCESSING",
                lockedAt: this.clock(),
                lockedBy: owner,
                attempts: { increment: 1 },
              },
            })
          : null;
      });
      if (!row) break;
      const where = {
        id: row.id,
        status: "PROCESSING" as const,
        lockedBy: owner,
      };
      try {
        const payload = row.payload as Prisma.JsonObject;
        const delivery = await this.service.db.delivery.findFirst({
          where: {
            id: String(payload.deliveryId),
            companyId: row.companyId,
            company: { status: "ACTIVE", archivedAt: null },
          },
          include: {
            order: { select: { recipientEmail: true, status: true } },
          },
        });
        let eligible = !!delivery;
        if (row.recipientUserId) {
          eligible =
            eligible &&
            !!(await this.service.db.agencyMembership.findFirst({
              where: {
                companyId: row.companyId,
                userId: row.recipientUserId,
                active: true,
                role: { code: "courier" },
                membership: {
                  active: true,
                  user: { status: "ACTIVE", archivedAt: null },
                },
              },
            })) &&
            !!(await this.service.db.driverProfile.findFirst({
              where: {
                companyId: row.companyId,
                userId: row.recipientUserId,
                status: "ACTIVE",
              },
            }));
        } else
          eligible =
            eligible &&
            delivery?.order.recipientEmail === row.recipientAddress &&
            (delivery?.order.status !== "CANCELLED" ||
              payload.event === "CANCELLED");
        if (!eligible) {
          await finishNotification(
            this.service.db,
            row,
            where,
            {
              status: "CANCELLED",
              lockedAt: null,
              lockedBy: null,
              lastError: "Destinataire d�sormais non autoris�",
            },
            "CANCELLED",
          );
          cancelled++;
          continue;
        }
        const body = `Commande ${String(payload.publicNumber)} : ${labels[String(payload.event)] ?? "�v�nement logistique enregistr�"}. Consultez votre espace autoris� pour l'�tat actuel.`;
        const message = row.recipientUserId
          ? null
          : await recipientMessage(this.service.db, row, this.clock());
        if (!row.recipientUserId && !message)
          throw Error("Recipient unavailable");
        if (row.channel === "PUSH")
          await adapter.push!(
            row.recipientUserId!,
            { title: "Mission DND Delivery", body, deliveryId: delivery!.id },
            row.id,
          );
        else
          await adapter.send(
            row.recipientAddress,
            message?.subject ?? "Suivi op�rationnel � DND Delivery",
            message?.text ?? body,
            `${row.id}@deliveries.dnd`,
            message?.html,
          );
        await finishNotification(
          this.service.db,
          row,
          where,
          {
            status: "SENT",
            deliveryState: "ACCEPTED",
            providerAcceptedAt: this.clock(),
            providerMessageId: `${row.id}@deliveries.dnd`,
            sentAt: this.clock(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
          "ACCEPTED",
        );
        sent++;
      } catch {
        await finishNotification(
          this.service.db,
          row,
          where,
          {
            status: "FAILED",
            deliveryState:
              row.attempts < row.maxAttempts ? "RETRY_SCHEDULED" : "FAILED",
            lastError: "Envoi indisponible ; reprise diff�r�e.",
            availableAt: new Date(
              this.clock().getTime() +
                Math.min(1440, 5 * 2 ** (row.attempts - 1)) * 60000,
            ),
            lockedAt: null,
            lockedBy: null,
          },
          "FAILED",
        );
        failed++;
      }
    }
    return { sent, failed, cancelled, pushUnavailable: !adapter.push };
  }
}
