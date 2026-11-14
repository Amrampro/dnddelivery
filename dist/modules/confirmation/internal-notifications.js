import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { StockService } from "../stocks/service.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { finishNotification } from "./communications.js";
export async function notifyAudience(tx, p, eventId, action) {
    if (![
        "ATTEMPT_FAILED",
        "COMPLETED",
        "RETRY_SCHEDULED",
        "RETRY",
        "CANCELLED",
        "RETURN_STARTED",
        "RETURN_RECEIVED",
    ].includes(action))
        return;
    const managers = await tx.companyMembership.findMany({
        where: {
            companyId: p.companyId,
            active: true,
            user: { status: "ACTIVE", archivedAt: null },
            OR: [
                { role: { code: "company_admin" } },
                {
                    agencyMembership_membershipRecords: {
                        some: {
                            agencyId: p.agencyId,
                            active: true,
                            role: { code: "agency_manager" },
                        },
                    },
                },
            ],
        },
        select: { userId: true, user: { select: { email: true } } },
    }), shops = await tx.shopMembership.findMany({
        where: {
            shopId: p.order.shopId,
            active: true,
            user: { status: "ACTIVE", archivedAt: null },
        },
        select: { userId: true, user: { select: { email: true } } },
    });
    const users = new Map([...managers, ...shops].map((u) => [u.userId, u]));
    for (const u of users.values())
        for (const channel of ["EMAIL", "PUSH"])
            await tx.notification.create({
                data: {
                    companyId: p.companyId,
                    recipientUserId: u.userId,
                    recipientAddress: channel === "EMAIL" ? u.user.email : u.userId,
                    channel,
                    sourceEvent: "CONFIRMATION_EVENT",
                    sourceId: eventId,
                    template: "confirmation_event",
                    payload: {
                        deliveryId: p.id,
                        publicNumber: p.order.publicNumber,
                        event: action,
                    },
                    dedupeKey: `confirmation:${eventId}:${channel}:${u.userId}`,
                    availableAt: new Date(),
                },
            });
}
export class ConfirmationNotifications {
    db;
    clock;
    companyId;
    stock;
    constructor(db, clock = () => new Date(), companyId) {
        this.db = db;
        this.clock = clock;
        this.companyId = companyId;
        this.stock = new StockService(db);
    }
    async run(adapter, limit = 100) {
        let sent = 0, failed = 0, cancelled = 0;
        const stale = new Date(this.clock().getTime() - 300000), channels = adapter.push
            ? Prisma.sql `('EMAIL','PUSH')`
            : Prisma.sql `('EMAIL')`;
        await this.db
            .$executeRaw `UPDATE Notification SET status='FAILED',deliveryState='FAILED',lockedAt=NULL,lockedBy=NULL,lastError='Bail expiré' WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,13)='CONFIRMATION_' AND status='PROCESSING' AND lockedAt<${stale} AND attempts>=maxAttempts`;
        for (let i = 0; i < limit; i++) {
            const lock = randomUUID(), row = await this.stock.transaction(async (tx) => {
                const ids = await tx.$queryRaw `SELECT id FROM Notification WHERE (${this.companyId ?? null} IS NULL OR companyId=${this.companyId ?? null}) AND LEFT(sourceEvent,13)='CONFIRMATION_' AND channel IN ${channels} AND attempts<maxAttempts AND ((status IN('PENDING','FAILED') AND availableAt<=${this.clock()}) OR (status='PROCESSING' AND lockedAt<${stale})) ORDER BY availableAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
                return ids[0]
                    ? tx.notification.update({
                        where: { id: ids[0].id },
                        data: {
                            status: "PROCESSING",
                            deliveryState: "PROCESSING",
                            lockedBy: lock,
                            lockedAt: this.clock(),
                            attempts: { increment: 1 },
                        },
                    })
                    : null;
            });
            if (!row)
                break;
            const where = {
                id: row.id,
                lockedBy: lock,
                status: "PROCESSING",
            };
            try {
                const payload = row.payload, p = await this.db.delivery.findFirst({
                    where: { id: String(payload.deliveryId), companyId: row.companyId },
                    include: { order: { select: { shopId: true } } },
                }), user = row.recipientUserId
                    ? await this.db.user.findFirst({
                        where: {
                            id: row.recipientUserId,
                            status: "ACTIVE",
                            archivedAt: null,
                        },
                    })
                    : null;
                const store = authorizationStore(this.db), company = p && user ? await store.companyGrant(user.id, p.companyId) : null, agency = p && user
                    ? await store.agencyGrant(user.id, p.companyId, p.agencyId)
                    : null, shop = p && user ? await store.shopGrant(user.id, p.order.shopId) : null;
                const supervise = [company, agency].some((g) => g?.active &&
                    g.permissions.includes(row.sourceEvent === "CONFIRMATION_EXCEPTION"
                        ? "delivery.exceptions.approve"
                        : "delivery.proofs.read"));
                const allowed = !!p &&
                    !!user &&
                    (await store.companyActive(p.companyId)) &&
                    (supervise ||
                        (row.sourceEvent !== "CONFIRMATION_EXCEPTION" &&
                            shop?.active &&
                            shop.permissions.includes("shop.deliveries.read"))) &&
                    (row.channel !== "EMAIL" || user.email === row.recipientAddress);
                if (!allowed) {
                    await finishNotification(this.db, row, where, {
                        status: "CANCELLED",
                        deliveryState: "CANCELLED",
                        lockedAt: null,
                        lockedBy: null,
                    }, "CANCELLED");
                    cancelled++;
                    continue;
                }
                if (row.channel === "PUSH")
                    await adapter.push(user.id, p.id, row.id);
                else
                    await adapter.send(row.recipientAddress, "Livraison à consulter · DND Delivery", `La commande ${String(payload.publicNumber)} comporte une mise à jour. Consultez votre espace autorisé pour examiner le suivi, les preuves ou les demandes d’exception.`, `${row.id}@confirmation.dnd`);
                await finishNotification(this.db, row, where, {
                    status: "SENT",
                    deliveryState: "ACCEPTED",
                    providerAcceptedAt: this.clock(),
                    providerMessageId: `${row.id}@confirmation.dnd`,
                    sentAt: this.clock(),
                    lockedAt: null,
                    lockedBy: null,
                    lastError: null,
                }, "ACCEPTED");
                sent++;
            }
            catch {
                await finishNotification(this.db, row, where, {
                    status: "FAILED",
                    deliveryState: row.attempts < row.maxAttempts ? "RETRY_SCHEDULED" : "FAILED",
                    availableAt: new Date(this.clock().getTime() +
                        Math.min(1440, 5 * 2 ** (row.attempts - 1)) * 60000),
                    lockedAt: null,
                    lockedBy: null,
                    lastError: "Envoi indisponible ; reprise différée.",
                }, "FAILED");
                failed++;
            }
        }
        return { sent, failed, cancelled, pushUnavailable: !adapter.push };
    }
}
export function expoPush(db) {
    const send = expoNotification(db);
    return (userId, deliveryId, key) => send(userId, { deliveryId, notificationId: key });
}
export function expoNotification(db) {
    return async (userId, data) => {
        let accepted = 0;
        const devices = await db.userDevice.findMany({
            where: { userId, revokedAt: null, sessionFamilyId: { not: null } },
        });
        for (const device of devices) {
            if (!(await db.session.count({
                where: {
                    userId,
                    familyId: device.sessionFamilyId,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
            })))
                continue;
            const result = await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: device.pushToken,
                    title: "DND Delivery",
                    body: "Une mise à jour est disponible dans votre espace sécurisé.",
                    data,
                    sound: "default",
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!result.ok)
                throw Error("Push unavailable");
            const body = (await result.json());
            if (body.data?.details?.error === "DeviceNotRegistered") {
                await db.userDevice.update({
                    where: { id: device.id },
                    data: { revokedAt: new Date() },
                });
                continue;
            }
            if (body.data?.status !== "ok")
                throw Error("Push not accepted");
            accepted++;
        }
        if (!accepted)
            throw Error("No authorized push device");
    };
}
