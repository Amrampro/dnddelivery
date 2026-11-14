import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import type { FinancialService } from "./service.js";
const labels: Record<string, string> = {
  COLLECTION_DECLARED: "Encaissement d�clar�",
  COLLECTION_PARTIAL: "Encaissement partiel d�clar�",
  COLLECTION_NONE: "Aucun montant re�u",
  COLLECTION_EXCESS: "Exc�dent d'encaissement d�clar�",
  REMITTANCE_DECLARED: "Remise physique d�clar�e, r�ception � confirmer",
  REMITTANCE_CONFIRMED: "R�ception de fonds confirm�e",
  REMITTANCE_DISPUTED: "R�ception avec �cart ou contestation",
  REMITTANCE_REJECTED: "D�claration de remise rejet�e",
  REMITTANCE_CORRECTION_REQUESTED: "Nouvelle d�claration de remise demand�e",
  DISCREPANCY_OPENED: "�cart financier signal�",
  DISCREPANCY_REPORTED: "�cart financier d�clar�",
  DISCREPANCY_RESOLVED: "Suivi de l'�cart mis � jour",
  CORRECTION_REQUESTED: "R�gularisation demand�e",
  CORRECTION_APPROVED: "R�gularisation approuv�e",
  CORRECTION_REJECTED: "R�gularisation refus�e",
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
      .$executeRaw`UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Bail expir�' WHERE LEFT(sourceEvent,8)='FINANCE_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
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
              lastError: "Destinataire d�sormais non autoris�",
            },
          });
          cancelled++;
          continue;
        }
        const body = `${labels[String(payload.event ?? payload.action)] ?? "Mise � jour financi�re documentaire"} : ${String(payload.amount)} ${String(payload.currency)}. Consultez votre espace autoris� pour distinguer les d�clarations, r�ceptions confirm�es et �carts. Aucun paiement n'est ex�cut� par DND Delivery.`;
        if (row.channel === "PUSH")
          await adapter.push!(
            userId!,
            {
              title: "DND Delivery � Suivi financier",
              body,
              entityId: String(payload.entityId),
              companyId: row.companyId ?? undefined,
            },
            row.dedupeKey!,
          );
        else
          await adapter.send(
            row.recipientAddress,
            "DND Delivery � Op�ration financi�re",
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
            lastError: "Envoi impossible ; nouvelle tentative diff�r�e",
          },
        });
        failed++;
      }
    }
    return { sent, failed, cancelled, pushConfigured: !!adapter.push };
  }
}
