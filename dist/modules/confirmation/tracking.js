import { StockService } from "../stocks/service.js";
import { stockError } from "../stocks/access.js";
import { token, digest, seal, unseal, eligible } from "./security.js";
import { ensureOtp } from "./otp.js";
export const trackingUnavailable = () => stockError("TRACKING_UNAVAILABLE", "Ce suivi est expiré ou inaccessible. Demandez un nouveau lien.", 404);
export const publicDeliveryEvents = {
    CREATED: "Livraison préparée",
    ASSIGNED: "Colis affecté",
    REASSIGNED: "Affectation mise à jour",
    PICKED_UP: "Colis pris en charge",
    TRANSFER_DISPATCHED: "Colis en transit",
    TRANSFER_RECEIVED: "Arrivée dans une agence",
    DEPARTED: "Colis en transit",
    ARRIVED_AGENCY: "Arrivée dans une agence",
    FINAL_DISTRIBUTION: "En cours de distribution",
    ARRIVED: "Livreur arrivé à destination",
    ATTEMPT: "Remise en cours de vérification",
    ATTEMPT_FAILED: "Tentative de livraison échouée",
    RETRY_SCHEDULED: "Nouvelle tentative programmée",
    RETRY: "Nouvelle tentative programmée",
    RETURN_REQUESTED: "Retour demandé",
    RETURN_STARTED: "Retour du colis en cours",
    RETURN_RECEIVED: "Colis retourné à l’agence",
    RETURNED_TO_SHOP: "Colis retourné à l’expéditeur",
    CANCELLED: "Livraison annulée",
    COMPLETED: "Livraison confirmée",
    INCIDENT_RESOLVED: "Incident examiné",
};
export async function trackingLink(tx, o, now = new Date()) {
    let grant = await tx.trackingAccess.findFirst({
        where: {
            companyId: o.companyId,
            orderId: o.id,
            version: o.trackingVersion,
            kind: "LINK",
            revokedAt: null,
            expiresAt: { gt: new Date(now.getTime() + 86400000) },
        },
        orderBy: { createdAt: "desc" },
    });
    if (!grant) {
        const raw = token();
        grant = await tx.trackingAccess.create({
            data: {
                companyId: o.companyId,
                orderId: o.id,
                version: o.trackingVersion,
                kind: "LINK",
                tokenHash: digest(raw),
                sealedToken: seal(raw, "tracking:" + o.id),
                expiresAt: new Date(now.getTime() + 30 * 86400000),
            },
        });
        await tx.auditLog.create({ data: { companyId: o.companyId, action: "TRACKING_LINK_ISSUED", entityType: "Order", entityId: o.id, metadata: { grantId: grant.id, expiresAt: grant.expiresAt.toISOString() } } });
    }
    const origin = process.env.WEB_APP_URL || "http://localhost:5173";
    return `${origin}/suivi#reference=${encodeURIComponent(o.publicNumber)}&token=${unseal(grant.sealedToken, "tracking:" + o.id)}`;
}
export class TrackingService {
    db;
    clock;
    stock;
    constructor(db, clock = () => new Date()) {
        this.db = db;
        this.clock = clock;
        this.stock = new StockService(db);
    }
    transaction(work) {
        return this.stock.transaction(work);
    }
    async throttle(tx, value, max, duration) {
        const key = digest(value, "throttle"), now = this.clock();
        await tx.trackingThrottle.upsert({
            where: { key },
            create: { key, count: 0, resetsAt: new Date(now.getTime() + duration) },
            update: {},
        });
        await tx.$queryRaw `SELECT \`key\` FROM TrackingThrottle WHERE \`key\`=${key} FOR UPDATE`;
        let row = await tx.trackingThrottle.findUniqueOrThrow({ where: { key } });
        if (row.resetsAt <= now)
            row = await tx.trackingThrottle.update({
                where: { key },
                data: { count: 0, resetsAt: new Date(now.getTime() + duration) },
            });
        if (row.count >= max)
            return false;
        await tx.trackingThrottle.update({
            where: { key },
            data: { count: { increment: 1 } },
        });
        return true;
    }
    async lookup(input, ip) {
        await this.transaction(async (tx) => {
            if (!(await this.throttle(tx, "lookup-ip:" + ip, 20, 3600000)))
                return;
            if (!(await this.throttle(tx, "lookup-order:" + input.reference.toUpperCase(), 5, 3600000)))
                return;
            const o = await tx.order.findFirst({
                where: {
                    publicNumber: input.reference.toUpperCase(),
                    recipientEmail: input.email.trim().toLowerCase(),
                    isDraft: false,
                    company: { status: "ACTIVE", archivedAt: null },
                },
            });
            if (o)
                await tx.notification.upsert({
                    where: {
                        dedupeKey: `tracking:${o.id}:${Math.floor(this.clock().getTime() / 900000)}`,
                    },
                    create: {
                        companyId: o.companyId,
                        channel: "EMAIL",
                        recipientAddress: o.recipientEmail,
                        sourceEvent: "TRACKING_ACCESS",
                        sourceId: o.id,
                        template: "tracking_access",
                        payload: { publicNumber: o.publicNumber },
                        dedupeKey: `tracking:${o.id}:${Math.floor(this.clock().getTime() / 900000)}`,
                        availableAt: this.clock(),
                    },
                    update: {},
                });
        });
        return {
            message: "Si ces informations correspondent à une commande, un lien personnel sera envoyé à l’adresse enregistrée. Consultez votre messagerie.",
        };
    }
    async verify(reference, raw, ip) {
        const result = await this.transaction(async (tx) => {
            if (!(await this.throttle(tx, "verify-ip:" + ip, 30, 900000)))
                return null;
            const link = await tx.trackingAccess.findUnique({
                where: { tokenHash: digest(raw) },
            }), now = this.clock();
            if (!link ||
                link.kind !== "LINK" ||
                link.revokedAt ||
                link.expiresAt <= now)
                return null;
            const o = await tx.order.findFirst({
                where: {
                    id: link.orderId,
                    companyId: link.companyId,
                    publicNumber: reference,
                    isDraft: false,
                    trackingVersion: link.version,
                },
            });
            if (!o)
                return null;
            const session = token();
            await tx.trackingAccess.create({
                data: {
                    companyId: o.companyId,
                    orderId: o.id,
                    version: o.trackingVersion,
                    kind: "SESSION",
                    tokenHash: digest(session),
                    expiresAt: new Date(Math.min(link.expiresAt.getTime(), now.getTime() + 86400000)),
                },
            });
            await tx.auditLog.create({ data: { companyId: o.companyId, action: "TRACKING_ACCESS_VERIFIED", entityType: "Order", entityId: o.id, metadata: { linkId: link.id } } });
            return { session, reference: o.publicNumber };
        });
        if (!result)
            throw trackingUnavailable();
        return result;
    }
    async authorized(tx, reference, raw) {
        const grant = await tx.trackingAccess.findUnique({
            where: { tokenHash: digest(raw) },
        });
        if (!grant ||
            grant.kind !== "SESSION" ||
            grant.revokedAt ||
            grant.expiresAt <= this.clock())
            throw trackingUnavailable();
        const o = await tx.order.findFirst({
            where: {
                id: grant.orderId,
                companyId: grant.companyId,
                publicNumber: reference,
                isDraft: false,
                trackingVersion: grant.version,
                company: { status: "ACTIVE", archivedAt: null },
            },
            include: {
                company: { select: { name: true } },
                collaboration: { select: { shop: { select: { name: true } } } },
                delivery_orderRecords: {
                    select: {
                        id: true,
                        status: true,
                        phase: true,
                        closedAt: true,
                        failureReason: true,
                    },
                },
            },
        });
        if (!o)
            throw trackingUnavailable();
        return o;
    }
    detail(reference, raw) {
        return this.transaction(async (tx) => {
            const o = await this.authorized(tx, reference, raw), d = o.delivery_orderRecords[0];
            const events = d
                ? await tx.deliveryEvent.findMany({
                    where: {
                        companyId: o.companyId,
                        deliveryId: d.id,
                        action: { in: Object.keys(publicDeliveryEvents) },
                    },
                    orderBy: { sequence: "asc" },
                    select: { id: true, action: true, createdAt: true },
                })
                : [];
            const cancellations = await tx.orderEvent.findMany({
                where: { companyId: o.companyId, orderId: o.id, action: "CANCELLED" },
                select: { id: true, createdAt: true },
            });
            const recordedProof = d
                ? await tx.deliveryProof.findFirst({
                    where: {
                        companyId: o.companyId,
                        deliveryId: d.id,
                        operationKey: { not: null },
                    },
                    select: { id: true },
                })
                : null;
            return {
                reference: o.publicNumber,
                company: o.company.name,
                shop: o.collaboration.shop.name,
                status: o.status,
                phase: d?.phase,
                createdAt: o.createdAt,
                updatedAt: new Date(Math.max(o.updatedAt.getTime(), ...events.map((e) => e.createdAt.getTime()))),
                confirmedAt: o.status === "DELIVERED" && recordedProof ? d?.closedAt : null,
                otpAvailable: !!d &&
                    ["FINAL_DISTRIBUTION", "AT_DESTINATION", "AWAITING_PROOF"].includes(d.phase ?? "") &&
                    d.status === "IN_PROGRESS",
                failure: d?.status === "FAILED"
                    ? { ABSENT: "Le destinataire était absent.", UNREACHABLE: "Le destinataire n’a pas pu être joint.", ADDRESS_NOT_FOUND: "L’adresse de remise n’a pas pu être trouvée.", REFUSED: "Le colis a été refusé.", OTP_UNAVAILABLE: "Le code de remise n’a pas pu être obtenu." }[d.failureReason ?? ""] ?? "La remise n’a pas pu aboutir. Contactez votre expéditeur pour la suite."
                    : null,
                events: [
                    { id: o.id, label: "Commande enregistrée", createdAt: o.createdAt },
                    ...events.map((e) => ({
                        id: e.id,
                        label: publicDeliveryEvents[e.action],
                        createdAt: e.createdAt,
                    })),
                    ...cancellations.map((e) => ({
                        id: e.id,
                        label: "Commande annulée",
                        createdAt: e.createdAt,
                    })),
                ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
                refreshedAt: this.clock(),
            };
        });
    }
    async code(reference, raw) {
        const hint = await this.db.trackingAccess.findUnique({
            where: { tokenHash: digest(raw) },
            select: { companyId: true },
        });
        if (!hint)
            throw trackingUnavailable();
        return this.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM Company WHERE id=${hint.companyId} FOR UPDATE`;
            const o = await this.authorized(tx, reference, raw);
            const p = await tx.delivery.findUnique({
                where: { companyId_orderId: { companyId: o.companyId, orderId: o.id } },
            });
            if (!p || !eligible(p))
                throw stockError("OTP_UNAVAILABLE", "Le code n’est pas disponible à cette étape.");
            const otp = await ensureOtp(tx, p, false, this.clock());
            if (otp.status !== "PENDING")
                throw stockError("OTP_ALREADY_VERIFIED", "Le code a déjà été validé. La clôture reste soumise aux preuves requises.");
            return {
                code: unseal(otp.sealedCode, "otp:" + otp.id),
                expiresAt: otp.expiresAt,
                instruction: "Communiquez ce code uniquement lorsque le livreur vous présente votre colis.",
            };
        });
    }
}
