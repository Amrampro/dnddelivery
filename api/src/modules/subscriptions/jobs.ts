import { randomUUID } from "node:crypto";
import { SubscriptionService } from "./service.js";
import type { Prisma } from "../../generated/prisma/client.js";
export interface SubscriptionMailer {
  send(
    to: string,
    subject: string,
    text: string,
    messageId: string,
  ): Promise<void>;
}
export class SubscriptionJobs {
  constructor(readonly service: SubscriptionService) {}
  async expire() {
    let processed = 0;
    for (;;) {
      const now = this.service.clock();
      const batch = await this.service.db.subscription.findMany({
        where: { status: "ACTIVE", expiresAt: { lte: now } },
        select: { companyId: true },
        take: 100,
      });
      if (!batch.length) break;
      for (const { companyId } of batch) {
        await this.service.transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM Company WHERE id=${companyId} FOR UPDATE`;
          const s = await tx.subscription.findUniqueOrThrow({
            where: { companyId },
          });
          if (
            s.status !== "ACTIVE" ||
            !s.expiresAt ||
            s.expiresAt > this.service.clock()
          )
            return;
          await tx.subscription.update({
            where: { id: s.id },
            data: { status: "EXPIRED", suspendedAt: now },
          });
          await tx.subscriptionEvent.create({
            data: {
              companyId,
              subscriptionId: s.id,
              status: "EXPIRED",
              reason: "Expiration automatique de la période",
            },
          });
          await this.service.audit(
            tx,
            null,
            companyId,
            "SUBSCRIPTION_EXPIRED",
            s.id,
            { expiresAt: s.expiresAt.toISOString() },
          );
          await this.service.enqueue(
            tx,
            companyId,
            "EXPIRED",
            `${s.id}:${s.expiresAt.toISOString()}`,
            { endsAt: s.expiresAt.toISOString() },
          );
          processed++;
        });
      }
    }
    return { processed };
  }
  async reminders() {
    const now = this.service.clock(),
      day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    let processed = 0;
    for (const [event, offset] of [
      ["REMINDER", 3],
      ["DUE", 0],
    ] as const) {
      const from = new Date(day.getTime() + offset * 86400000),
        until = new Date(from.getTime() + 86400000);
      let cursor: string | undefined;
      for (;;) {
        const batch = await this.service.db.subscription.findMany({
          where: {
            status: { in: ["ACTIVE", "EXPIRED"] },
            expiresAt: { gte: from, lt: until },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: "asc" },
          take: 100,
        });
        if (!batch.length) break;
        for (const s of batch) {
          await this.service.transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM Company WHERE id=${s.companyId} FOR UPDATE`;
            const current = await tx.subscription.findUniqueOrThrow({
              where: { id: s.id },
            });
            if (
              current.expiresAt?.getTime() !== s.expiresAt?.getTime() ||
              !["ACTIVE", "EXPIRED"].includes(current.status)
            )
              return;
            await this.service.enqueue(
              tx,
              s.companyId,
              event,
              `${s.id}:${s.expiresAt!.toISOString()}`,
              { endsAt: s.expiresAt!.toISOString() },
            );
            processed++;
          });
        }
        cursor = batch.at(-1)!.id;
      }
    }
    return { processed };
  }
  async notifications(mailer: SubscriptionMailer, limit = 100) {
    let sent = 0,
      failed = 0;
    const now = this.service.clock(),
      stale = new Date(now.getTime() - 5 * 60000);
    await this.service.db
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Lease expirée après la dernière tentative' WHERE LEFT(sourceEvent,13) = 'SUBSCRIPTION_' AND status='PROCESSING' AND lockedAt < ${stale} AND attempts >= maxAttempts`;
    for (let i = 0; i < limit; i++) {
      const owner = randomUUID();
      const row = await this.service.transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM Notification WHERE LEFT(sourceEvent,13) = 'SUBSCRIPTION_' AND attempts < maxAttempts AND ((status IN ('PENDING','FAILED') AND availableAt <= ${this.service.clock()}) OR (status='PROCESSING' AND lockedAt < ${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
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
        const p = row.payload as Prisma.JsonObject;
        const eligible = await this.service.db.companyMembership.findFirst({
          where: {
            companyId: row.companyId,
            userId: row.recipientUserId ?? "",
            active: true,
            role: { code: "company_admin" },
            user: {
              status: "ACTIVE",
              archivedAt: null,
              email: row.recipientAddress,
            },
          },
        });
        const subscription = await this.service.db.subscription.findUnique({
          where: { companyId: row.companyId },
        });
        const obsolete =
          [
            "SUBSCRIPTION_REMINDER",
            "SUBSCRIPTION_DUE",
            "SUBSCRIPTION_EXPIRED",
          ].includes(row.sourceEvent) &&
          (!subscription ||
            subscription.expiresAt?.toISOString() !== p.endsAt ||
            subscription?.status === "CANCELLED");
        if (!eligible || obsolete) {
          await this.service.db.notification.updateMany({
            where: { id: row.id, status: "PROCESSING", lockedBy: owner },
            data: {
              status: "CANCELLED",
              lockedAt: null,
              lockedBy: null,
              lastError: "Destinataire ou échéance remplacé",
            },
          });
          continue;
        }
        const labels: Record<string, string> = {
          SUBSCRIPTION_REMINDER: "Votre abonnement expire dans trois jours.",
          SUBSCRIPTION_DUE: "Votre abonnement arrive à échéance aujourd’hui.",
          SUBSCRIPTION_EXPIRED:
            "Votre abonnement a expiré. Les nouvelles opérations sont bloquées; les données sont conservées.",
          SUBSCRIPTION_RENEWED:
            "Votre règlement externe a été confirmé et votre abonnement renouvelé.",
          SUBSCRIPTION_REJECTED:
            "Votre déclaration de règlement externe a été rejetée.",
        };
        await mailer.send(
          row.recipientAddress,
          "Abonnement DND Delivery",
          `${labels[row.template] ?? "Votre abonnement a été mis à jour."}\n${p.endsAt ? `Échéance UTC : ${String(p.endsAt)}\n` : ""}${p.reason ? `Motif : ${String(p.reason)}\n` : ""}Consultez Mon abonnement dans votre espace Web. Les paiements sont réalisés hors plateforme.`,
          `${row.id}@subscriptions.dnd`,
        );
        await this.service.db.notification.updateMany({
          where: { id: row.id, status: "PROCESSING", lockedBy: owner },
          data: {
            status: "SENT",
            sentAt: this.service.clock(),
            lastError: null,
            lockedBy: null,
            lockedAt: null,
          },
        });
        sent++;
      } catch {
        await this.service.db.notification.updateMany({
          where: { id: row.id, status: "PROCESSING", lockedBy: owner },
          data: {
            status: "FAILED",
            lastError:
              "Échec SMTP; vérifier la configuration et le journal serveur.",
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
    return { sent, failed };
  }
}
