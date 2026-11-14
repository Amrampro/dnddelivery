import { randomUUID } from "node:crypto";
import type { PartnerService } from "./service.js";
import type { Prisma } from "../../generated/prisma/client.js";
export class PartnerNotifications {
  constructor(readonly service: PartnerService) {}
  async run(
    mailer: {
      send(
        to: string,
        subject: string,
        text: string,
        messageId: string,
      ): Promise<void>;
    },
    limit = 100,
  ) {
    let sent = 0,
      failed = 0,
      cancelled = 0;
    const stale = new Date(this.service.clock().getTime() - 5 * 60000);
    await this.service.db
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Lease expir�e apr�s la derni�re tentative' WHERE LEFT(sourceEvent,8)='PARTNER_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
    for (let i = 0; i < limit; i++) {
      const owner = randomUUID();
      const row = await this.service.transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM Notification WHERE LEFT(sourceEvent,8)='PARTNER_' AND attempts<maxAttempts AND ((status IN ('PENDING','FAILED') AND availableAt<=${this.service.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!rows[0]) return null;
        return tx.notification.update({
          where: { id: rows[0].id },
          data: {
            status: "PROCESSING",
            lockedAt: this.service.clock(),
            lockedBy: owner,
            attempts: { increment: 1 },
          },
        });
      });
      if (!row) break;
      try {
        const payload = row.payload as Prisma.JsonObject,
          shopId = String(payload.shopId ?? "");
        const eligible = await this.service.db.user.findFirst({
          where: {
            id: row.recipientUserId ?? "",
            email: row.recipientAddress,
            status: "ACTIVE",
            archivedAt: null,
            OR: [
              {
                companyMembership_userRecords: {
                  some: {
                    companyId: row.companyId,
                    active: true,
                    role: { code: "company_admin" },
                  },
                },
              },
              {
                shopMembership_userRecords: { some: { shopId, active: true } },
              },
            ],
          },
        });
        if (!eligible) {
          await this.service.db.notification.updateMany({
            where: { id: row.id, status: "PROCESSING", lockedBy: owner },
            data: {
              status: "CANCELLED",
              lockedAt: null,
              lockedBy: null,
              lastError: "Destinataire non autoris�",
            },
          });
          cancelled++;
          continue;
        }
        const labels: Record<string, string> = {
          REQUESTED: "Une demande de collaboration a �t� re�ue.",
          ACCEPTED: "La collaboration a �t� accept�e.",
          REJECTED: "La collaboration a �t� refus�e.",
          SUSPENDED: "La collaboration a �t� suspendue.",
          ENDED: "La collaboration est termin�e.",
          REQUEST: "Une nouvelle autorisation de collaboration est demand�e.",
        };
        await mailer.send(
          row.recipientAddress,
          "Collaboration DND Delivery",
          `${labels[String(payload.event)] ?? "Votre collaboration a chang�."}\nBoutique : ${String(payload.shopName)}\nEntreprise : ${String(payload.companyName)}\nConsultez votre espace DND Delivery pour les d�tails.`,
          `${row.id}@partners.dnd`,
        );
        await this.service.db.notification.updateMany({
          where: { id: row.id, status: "PROCESSING", lockedBy: owner },
          data: {
            status: "SENT",
            sentAt: this.service.clock(),
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        sent++;
      } catch {
        await this.service.db.notification.updateMany({
          where: { id: row.id, status: "PROCESSING", lockedBy: owner },
          data: {
            status: "FAILED",
            lastError:
              "�chec SMTP; v�rifier la configuration et relancer le worker.",
            availableAt: new Date(
              this.service.clock().getTime() +
                Math.min(1440, 5 * 2 ** (row.attempts - 1)) * 60000,
            ),
            lockedAt: null,
            lockedBy: null,
          },
        });
        failed++;
      }
    }
    return { sent, failed, cancelled };
  }
}
