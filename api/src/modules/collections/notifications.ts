import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import type { FinancialService } from "./service.js";
const labels: Record<string, string> = {
  COLLECTION_DECLARED: "Encaissement déclaré",
  COLLECTION_PARTIAL: "Encaissement partiel déclaré",
  COLLECTION_NONE: "Aucun montant reçu",
  COLLECTION_EXCESS: "Excédent d’encaissement déclaré",
  REMITTANCE_DECLARED: "Remise physique déclarée, réception à confirmer",
  REMITTANCE_CONFIRMED: "Réception de fonds confirmée",
  REMITTANCE_DISPUTED: "Réception avec écart ou contestation",
  REMITTANCE_REJECTED: "Déclaration de remise rejetée",
  REMITTANCE_CORRECTION_REQUESTED: "Nouvelle déclaration de remise demandée",
  DISCREPANCY_OPENED: "Écart financier signalé",
  DISCREPANCY_REPORTED: "Écart financier déclaré",
  DISCREPANCY_RESOLVED: "Suivi de l’écart mis à jour",
  CORRECTION_REQUESTED: "Régularisation demandée",
  CORRECTION_APPROVED: "Régularisation approuvée",
  CORRECTION_REJECTED: "Régularisation refusée",
};
export class FinancialNotifications {
  constructor(
    readonly service: FinancialService,
    readonly clock = () => new Date(),
  ) {}
  async run(
    adapter: {
      send(
        to: string,
        subject: string,
        text: string,
        messageId: string,
      ): Promise<void>;
      push?: (
        userId: string,
        payload: {
          title: string;
          body: string;
          entityId: string;
          companyId?: string;
        },
        key: string,
      ) => Promise<void>;
    },
    limit = 100,
  ) {
    let sent = 0,
      failed = 0,
      cancelled = 0;
    const stale = new Date(this.clock().getTime() - 300000),
      channels = adapter.push
        ? Prisma.sql`('EMAIL','PUSH')`
        : Prisma.sql`('EMAIL')`;
    await this.service.db
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Bail expiré' WHERE LEFT(sourceEvent,8)='FINANCE_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
    for (let i = 0; i < limit; i++) {
      const owner = randomUUID(),
        row = await this.service.transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM Notification WHERE LEFT(sourceEvent,8)='FINANCE_' AND channel IN ${channels} AND attempts<maxAttempts AND ((status IN('PENDING','FAILED') AND availableAt<=${this.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
          return rows[0]
            ? tx.notification.update({
                where: { id: rows[0].id },
                data: {
                  status: "PROCESSING",
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
        const payload = row.payload as Prisma.JsonObject,
          userId = row.recipientUserId,
          store = authorizationStore(this.service.db),
          company = row.companyId;
        const source = await this.service.db.financialEvent.findFirst({
          where: { id: String(payload.eventId), companyId: company },
        });
        const companyGrant = userId
            ? await store.companyGrant(userId, company)
            : null,
          agencyGrant =
            userId && source
              ? await store.agencyGrant(userId, company, source.agencyId)
              : null;
        const eligible =
          !!source &&
          !!userId &&
          (await store.userActive(userId)) &&
          (await store.companyActive(company)) &&
          !!companyGrant?.active &&
          (companyGrant.permissions.includes("financial.supervise.read") ||
            (!!agencyGrant?.active &&
              (await store.agencyActive(source.agencyId, company)) &&
              (agencyGrant.permissions.includes("financial.supervise.read") ||
                (agencyGrant.permissions.includes("collections.self.read") &&
                  source.courierId === userId))));
        if (!eligible) {
          await this.service.db.notification.updateMany({
            where,
            data: {
              status: "CANCELLED",
              lockedAt: null,
              lockedBy: null,
              lastError: "Destinataire désormais non autorisé",
            },
          });
          cancelled++;
          continue;
        }
        const body = `${labels[String(payload.event ?? payload.action)] ?? "Mise à jour financière documentaire"} : ${String(payload.amount)} ${String(payload.currency)}. Consultez votre espace autorisé pour distinguer les déclarations, réceptions confirmées et écarts. Aucun paiement n’est exécuté par DND Delivery.`;
        if (row.channel === "PUSH")
          await adapter.push!(
            userId!,
            {
              title: "DND Delivery · Suivi financier",
              body,
              entityId: String(payload.entityId),
              companyId: row.companyId ?? undefined,
            },
            row.dedupeKey!,
          );
        else
          await adapter.send(
            row.recipientAddress,
            "DND Delivery · Opération financière",
            body,
            `${row.id}@dnd-delivery.invalid`,
          );
        await this.service.db.notification.updateMany({
          where,
          data: {
            status: "SENT",
            sentAt: this.clock(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
        sent++;
      } catch {
        await this.service.db.notification.updateMany({
          where,
          data: {
            status: "FAILED",
            availableAt: new Date(
              this.clock().getTime() +
                Math.min(3600000, 30000 * 2 ** (row.attempts - 1)),
            ),
            lockedAt: null,
            lockedBy: null,
            lastError: "Envoi impossible ; nouvelle tentative différée",
          },
        });
        failed++;
      }
    }
    return { sent, failed, cancelled, pushConfigured: !!adapter.push };
  }
}
