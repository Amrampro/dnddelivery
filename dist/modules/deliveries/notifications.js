import { randomUUID } from "node:crypto";
import { recipientMessage, finishNotification, } from "../confirmation/communications.js";
import { Prisma } from "../../generated/prisma/client.js";
const labels = {
    ASSIGNED: "affectation enregistrée",
    REASSIGNED: "réaffectation enregistrée",
    HANDOVER_REQUESTED: "remise de garde à confirmer",
    HANDOVER_ACCEPTED: "remise de garde confirmée",
    PICKED_UP: "colis pris en charge",
    TRANSFER_DISPATCHED: "départ inter-agences enregistré",
    TRANSFER_RECEIVED: "réception inter-agences enregistrée",
    FINAL_DISTRIBUTION: "distribution finale commencée",
    ATTEMPT: "confirmation de remise en attente de preuve",
    ATTEMPT_FAILED: "tentative de livraison échouée",
    RETURN_STARTED: "retour engagé",
    RETURN_RECEIVED: "retour réceptionné",
};
export class DeliveryNotifications {
    service;
    clock;
    companyId;
    constructor(service, clock = () => new Date(), companyId) {
        this.service = service;
        this.clock = clock;
        this.companyId = companyId;
    }
    async run(adapter, limit = 100) {
        let sent = 0, failed = 0, cancelled = 0;
        const stale = new Date(this.clock().getTime() - 300000);
        await this.service.db
            .$executeRaw `UPDATE Notification SET status='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Bail expiré' WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,9)='DELIVERY_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
        const channels = adapter.push
            ? Prisma.sql `('EMAIL','PUSH')`
            : Prisma.sql `('EMAIL')`;
        for (let i = 0; i < limit; i++) {
            const owner = randomUUID();
            const row = await this.service.transaction(async (tx) => {
                const rows = await tx.$queryRaw `SELECT id FROM Notification WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,9)='DELIVERY_' AND channel IN ${channels} AND attempts<maxAttempts AND ((status IN ('PENDING','FAILED') AND availableAt<=${this.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
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
            if (!row)
                break;
            const where = {
                id: row.id,
                status: "PROCESSING",
                lockedBy: owner,
            };
            try {
                const payload = row.payload;
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
                            !!(await this.service.db.companyMembership.findFirst({
                                where: {
                                    companyId: row.companyId,
                                    userId: row.recipientUserId,
                                    active: true,
                                    organizationRole: "courier",
                                    employmentStatus: "ACTIVE",
                                    user: { status: "ACTIVE", archivedAt: null },
                                },
                            })) &&
                            !!(await this.service.db.driverProfile.findFirst({
                                where: {
                                    companyId: row.companyId,
                                    userId: row.recipientUserId,
                                    status: "ACTIVE",
                                },
                            }));
                }
                else
                    eligible =
                        eligible &&
                            delivery?.order.recipientEmail === row.recipientAddress &&
                            (delivery?.order.status !== "CANCELLED" ||
                                payload.event === "CANCELLED");
                if (!eligible) {
                    await finishNotification(this.service.db, row, where, {
                        status: "CANCELLED",
                        lockedAt: null,
                        lockedBy: null,
                        lastError: "Destinataire désormais non autorisé",
                    }, "CANCELLED");
                    cancelled++;
                    continue;
                }
                const body = `Commande ${String(payload.publicNumber)} : ${labels[String(payload.event)] ?? "événement logistique enregistré"}. Consultez votre espace autorisé pour l’état actuel.`;
                const message = row.recipientUserId
                    ? null
                    : await recipientMessage(this.service.db, row, this.clock());
                if (!row.recipientUserId && !message)
                    throw Error("Recipient unavailable");
                if (row.channel === "PUSH")
                    await adapter.push(row.recipientUserId, { title: "Mission DND Delivery", body, deliveryId: delivery.id }, row.id);
                else
                    await adapter.send(row.recipientAddress, message?.subject ?? "Suivi opérationnel · DND Delivery", message?.text ?? body, `${row.id}@deliveries.dnd`, message?.html);
                await finishNotification(this.service.db, row, where, {
                    status: "SENT",
                    deliveryState: "ACCEPTED",
                    providerAcceptedAt: this.clock(),
                    providerMessageId: `${row.id}@deliveries.dnd`,
                    sentAt: this.clock(),
                    lockedAt: null,
                    lockedBy: null,
                    lastError: null,
                }, "ACCEPTED");
                sent++;
            }
            catch {
                await finishNotification(this.service.db, row, where, {
                    status: "FAILED",
                    deliveryState: row.attempts < row.maxAttempts ? "RETRY_SCHEDULED" : "FAILED",
                    lastError: "Envoi indisponible ; reprise différée.",
                    availableAt: new Date(this.clock().getTime() +
                        Math.min(1440, 5 * 2 ** (row.attempts - 1)) * 60000),
                    lockedAt: null,
                    lockedBy: null,
                }, "FAILED");
                failed++;
            }
        }
        return { sent, failed, cancelled, pushUnavailable: !adapter.push };
    }
}
