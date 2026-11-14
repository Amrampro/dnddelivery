import { randomUUID } from "node:crypto";
import {
  recipientMessage,
  finishNotification,
} from "../confirmation/communications.js";
import type { OrderService } from "./service.js";
export class OrderNotifications {
  constructor(
    readonly service: OrderService,
    readonly clock = () => new Date(),
    readonly companyId?: string,
  ) {}
  async run(
    mailer: {
      send(
        to: string,
        subject: string,
        text: string,
        messageId: string,
        html?: string,
      ): Promise<void>;
    },
    limit = 100,
  ) {
    let sent = 0,
      failed = 0,
      cancelled = 0;
    const stale = new Date(this.clock().getTime() - 300000);
    await this.service.db
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Lease expirée' WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND sourceEvent IN ('ORDER_SUBMITTED','ORDER_CANCELLED','TRACKING_ACCESS') AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
    for (let i = 0; i < limit; i++) {
      const owner = randomUUID();
      const row = await this.service.transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM Notification WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND sourceEvent IN ('ORDER_SUBMITTED','ORDER_CANCELLED','TRACKING_ACCESS') AND channel='EMAIL' AND attempts<maxAttempts AND ((status IN ('PENDING','FAILED') AND availableAt<=${this.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
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
        const order = await this.service.db.order.findFirst({
          where: {
            id: row.sourceId,
            companyId: row.companyId,
            recipientEmail: row.recipientAddress,
            isDraft: false,
            company: { status: "ACTIVE", archivedAt: null },
            ...(row.sourceEvent === "ORDER_SUBMITTED"
              ? { status: { not: "CANCELLED" as const } }
              : {}),
          },
        });
        if (!order) {
          await finishNotification(
            this.service.db,
            row,
            where,
            { status: "CANCELLED", lockedAt: null, lockedBy: null },
            "CANCELLED",
          );
          cancelled++;
          continue;
        }
        const message = await recipientMessage(
          this.service.db,
          row,
          this.clock(),
        );
        if (!message) throw Error("Recipient unavailable");
        await mailer.send(
          row.recipientAddress,
          message.subject,
          message.text,
          `${row.id}@orders.dnd`,
          message.html,
        );
        await finishNotification(
          this.service.db,
          row,
          where,
          {
            status: "SENT",
            deliveryState: "ACCEPTED",
            providerAcceptedAt: this.clock(),
            providerMessageId: `${row.id}@orders.dnd`,
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
            availableAt: new Date(
              this.clock().getTime() +
                Math.min(1440, 5 * 2 ** (row.attempts - 1)) * 60000,
            ),
            lockedAt: null,
            lockedBy: null,
            lastError: "Échec SMTP; reprise différée.",
          },
          "FAILED",
        );
        failed++;
      }
    }
    return { sent, failed, cancelled };
  }
}
