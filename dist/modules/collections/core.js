import { createHash, randomUUID } from "node:crypto";
import { FinancialReads } from "./read.js";
import { StockService } from "../stocks/service.js";
import { permission, access, agencyAllowed, selection, } from "./access.js";
import { checkVersion, stockError, agencyWrite } from "../stocks/access.js";
import { assertSafeClosure } from "../subscriptions/access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { collectionInclude, ledger } from "./ledger.js";
import { amount, units, sum, bounded, positive } from "./money.js";
const canonical = (x) => Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
        ? Object.fromEntries(Object.entries(x)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]))
        : x;
export class FinancialCore extends FinancialReads {
    transaction(work) {
        return new StockService(this.db).transaction(work);
    }
    async write(c, required, input, action, work) {
        if (c.scope === "SHOP" || !c.companyId)
            throw stockError("PERMISSION_DENIED", "Opération réservée à l’équipe autorisée.", 403);
        return this.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
            await permission(tx, c, required);
            const hash = createHash("sha256")
                .update(JSON.stringify(canonical({ actorId: c.actorId, action, input })))
                .digest("hex");
            const replay = await tx.financialEvent.findUnique({
                where: {
                    companyId_operationKey: {
                        companyId: c.companyId,
                        operationKey: input.operationKey,
                    },
                },
            });
            if (replay) {
                if (replay.requestHash !== hash)
                    throw stockError("IDEMPOTENCY_MISMATCH", "Cette clé correspond à une autre opération.");
                return replay.entityId;
            }
            const result = await work(tx);
            await this.emit(tx, c, {
                ...result.event,
                action,
                entityId: result.id,
                operationKey: input.operationKey,
                requestHash: hash,
            });
            return result.id;
        });
    }
    async emit(tx, c, data) {
        const e = await tx.financialEvent.create({
            data: { ...data, companyId: c.companyId, actorId: c.actorId },
        });
        await tx.auditLog.create({
            data: {
                companyId: c.companyId,
                agencyId: e.agencyId,
                actorId: c.actorId,
                action: "FINANCE_" + e.action,
                entityType: "FinancialOperation",
                entityId: e.entityId,
                metadata: {
                    eventId: e.id,
                    orderId: e.orderId,
                    collectionId: e.collectionId,
                    remittanceId: e.remittanceId,
                    courierId: e.courierId,
                    amount: e.amount.toFixed(4),
                    currency: e.currency,
                    previousStatus: e.previousStatus,
                    status: e.status,
                    reason: e.reason,
                    details: (e.metadata ?? null),
                },
            },
        });
        await this.notify(tx, c, e);
        return e;
    }
    async notify(tx, c, e) {
        const event = e.action === "COLLECTION_DECLARED"
            ? e.status === "PARTIAL"
                ? "COLLECTION_PARTIAL"
                : e.status === "NONE_RECEIVED"
                    ? "COLLECTION_NONE"
                    : e.status === "EXCESS"
                        ? "COLLECTION_EXCESS"
                        : "COLLECTION_DECLARED"
            : e.action === "REMITTANCE_DECIDED"
                ? e.status === "CONFIRMED"
                    ? "REMITTANCE_CONFIRMED"
                    : e.metadata?.decision ===
                        "REQUEST_CORRECTION"
                        ? "REMITTANCE_CORRECTION_REQUESTED"
                        : e.status === "CANCELLED"
                            ? "REMITTANCE_REJECTED"
                            : "REMITTANCE_DISPUTED"
                : e.action;
        const admins = await tx.companyMembership.findMany({
            where: {
                companyId: c.companyId,
                active: true,
                role: { code: "company_admin" },
            },
            select: { userId: true },
        });
        const managers = await tx.agencyMembership.findMany({
            where: {
                companyId: c.companyId,
                agencyId: e.agencyId,
                active: true,
                role: { code: "agency_manager" },
                membership: { active: true },
            },
            select: { userId: true },
        });
        const ids = [
            ...new Set([...admins, ...managers]
                .map((x) => x.userId)
                .concat(e.courierId ? [e.courierId] : [])),
        ];
        const users = await tx.user.findMany({
            where: { id: { in: ids }, status: "ACTIVE", archivedAt: null },
            select: { id: true, email: true },
        });
        for (const user of users)
            for (const channel of ["EMAIL", "PUSH"])
                await tx.notification.create({
                    data: {
                        companyId: c.companyId,
                        recipientUserId: user.id,
                        recipientAddress: channel === "EMAIL" ? user.email : user.id,
                        channel,
                        sourceEvent: "FINANCE_" + event,
                        sourceId: e.id,
                        template: "financial_event",
                        availableAt: new Date(),
                        dedupeKey: `finance:${e.id}:${user.id}:${channel}`,
                        payload: {
                            eventId: e.id,
                            action: e.action,
                            event,
                            status: e.status,
                            agencyId: e.agencyId,
                            entityId: e.entityId,
                            amount: e.amount.toFixed(4),
                            currency: e.currency,
                        },
                    },
                });
    }
    async addDiscrepancy(tx, c, data) {
        const d = await tx.financialDiscrepancy.create({
            data: {
                ...data,
                companyId: c.companyId,
                reference: "ECART-" + randomUUID().toUpperCase(),
                createdById: c.actorId,
            },
        });
        let orderId;
        if (d.deliveryId)
            orderId = (await tx.delivery.findUniqueOrThrow({ where: { id: d.deliveryId } })).orderId;
        await this.emit(tx, c, {
            agencyId: d.agencyId,
            courierId: d.courierId,
            orderId,
            collectionId: d.collectionId,
            remittanceId: d.remittanceId,
            discrepancyId: d.id,
            action: "DISCREPANCY_OPENED",
            entityId: d.id,
            status: "OPEN",
            amount: d.amount,
            currency: d.currency,
            reason: d.description,
        });
        return d;
    }
    async validNewOperation(tx, c) {
        if (!(await authorizationStore(tx).subscriptionValid(c.companyId)))
            throw stockError("SUBSCRIPTION_REQUIRED", "Un abonnement valide est requis pour modifier une obligation commerciale.", 403);
    }
    async declare(c, input) {
        const id = await this.write(c, "collections.declare", input, "COLLECTION_DECLARED", async (tx) => {
            const auth = await access(tx, c);
            if (auth.kind !== "driver")
                throw stockError("DRIVER_REQUIRED", "Seul le livreur peut déclarer son encaissement.", 403);
            const p = await tx.delivery.findFirst({
                where: {
                    id: input.deliveryId,
                    companyId: c.companyId,
                    agencyId: c.agencyId,
                    courierId: c.actorId,
                },
                include: {
                    order: true,
                    deliveryAssignment_deliveryRecords: {
                        where: { endedAt: null, activeSlot: 1 },
                    },
                },
            });
            if (!p)
                throw stockError("MISSION_DENIED", "Cette mission ne vous appartient pas.", 403);
            checkVersion(p.version, input.deliveryVersion);
            if (!p.pickedUpAt ||
                p.custodyUserId !== c.actorId ||
                p.custodyType !== "COURIER" ||
                ![
                    "FINAL_DISTRIBUTION",
                    "AT_DESTINATION",
                    "AWAITING_PROOF",
                    "FAILED",
                ].includes(p.phase ?? "") ||
                !p.deliveryAssignment_deliveryRecords.some((a) => a.courierId === c.actorId && a.purpose === "FINAL"))
                throw stockError("COLLECTION_PHASE_DENIED", "L’encaissement se déclare pendant la distribution finale de votre mission.");
            if (!(await authorizationStore(tx).subscriptionValid(c.companyId)))
                await assertSafeClosure(tx, selection(c), p.id, "COLLECTION_DECLARE");
            if (!p.order.collectionRequired ||
                units(p.order.amountToCollect) === 0n)
                throw stockError("COLLECTION_NOT_REQUIRED", "Aucun encaissement n’est prévu pour cette commande.");
            await agencyWrite(tx, c, p.agencyId);
            const previous = await ledger(tx, await tx.collection.findMany({
                where: { companyId: p.companyId, deliveryId: p.id },
                include: collectionInclude,
            }));
            if (previous.some((r) => r.legacy))
                throw stockError("LEGACY_REVIEW_REQUIRED", "L’historique ancien doit être rapproché avant une nouvelle déclaration.");
            const received = units(input.amount), net = sum(previous.map((r) => units(r.net))), expected = units(p.order.amountToCollect), remaining = positive(expected - net);
            if (received === 0n && remaining === 0n)
                throw stockError("COLLECTION_ALREADY_COVERED", "Le montant attendu est déjà couvert. Une nouvelle déclaration nulle est inutile.");
            if ((received === 0n || received > remaining) && !input.reason)
                throw stockError("REASON_REQUIRED", "Indiquez le motif d’un montant nul ou excédentaire.", 400);
            bounded(net + received);
            const row = await tx.collection.create({
                data: {
                    companyId: p.companyId,
                    deliveryId: p.id,
                    agencyId: p.agencyId,
                    courierId: c.actorId,
                    legacySlot: null,
                    reference: "ENC-" + randomUUID().toUpperCase(),
                    expectedAmount: p.order.amountToCollect,
                    declaredAmount: input.amount,
                    currency: p.order.currency,
                    method: input.method,
                    status: "DECLARED",
                    declaredAt: new Date(),
                    notes: input.notes,
                    operationKey: input.operationKey,
                    requestHash: createHash("sha256")
                        .update(JSON.stringify(input))
                        .digest("hex"),
                },
            });
            await tx.collectionEvent.create({
                data: {
                    companyId: p.companyId,
                    collectionId: row.id,
                    actorId: c.actorId,
                    status: "DECLARED",
                    notes: input.reason ?? input.notes,
                },
            });
            if (received === 0n || received < remaining || received > remaining) {
                const kind = received === 0n
                    ? "ZERO"
                    : received < remaining
                        ? "PARTIAL"
                        : "OVER_COLLECTION";
                await this.addDiscrepancy(tx, c, {
                    agencyId: p.agencyId,
                    courierId: c.actorId,
                    deliveryId: p.id,
                    collectionId: row.id,
                    kind,
                    amount: amount(received < remaining
                        ? remaining - received
                        : received - remaining),
                    currency: row.currency,
                    description: input.reason ??
                        (kind === "PARTIAL"
                            ? "Encaissement partiel déclaré ; décision du responsable attendue."
                            : "Écart d’encaissement déclaré."),
                    sourceKey: `collection:${row.id}:${kind}`,
                });
            }
            return {
                id: row.id,
                event: {
                    agencyId: p.agencyId,
                    courierId: c.actorId,
                    orderId: p.orderId,
                    collectionId: row.id,
                    action: "COLLECTION_DECLARED",
                    entityId: row.id,
                    status: received === 0n && net === 0n
                        ? "NONE_RECEIVED"
                        : net + received < expected
                            ? "PARTIAL"
                            : net + received === expected
                                ? "DECLARED_COMPLETE"
                                : "EXCESS",
                    amount: input.amount,
                    currency: row.currency,
                    reason: input.reason,
                    metadata: {
                        expectedSnapshot: p.order.amountToCollect.toFixed(4),
                        method: row.method,
                        notes: input.notes ?? null,
                    },
                },
            };
        });
        return this.collection(c, id);
    }
    async createRemittance(c, input) {
        const id = await this.write(c, "remittances.declare", input, "REMITTANCE_DECLARED", async (tx) => {
            const auth = await access(tx, c);
            if (auth.kind !== "driver")
                throw stockError("DRIVER_REQUIRED", "Le livreur déclare lui-même sa remise.", 403);
            agencyAllowed(c, input.agencyId);
            await agencyWrite(tx, c, input.agencyId);
            const rows = await tx.collection.findMany({
                where: {
                    id: { in: input.items.map((i) => i.collectionId) },
                    companyId: c.companyId,
                    courierId: c.actorId,
                    agencyId: input.agencyId,
                    currency: input.currency,
                },
                include: collectionInclude,
            });
            if (rows.length !== input.items.length)
                throw stockError("ALLOCATION_DENIED", "Chaque encaissement doit vous appartenir, dans cette agence et cette devise.", 403);
            const accounts = await ledger(tx, rows);
            for (const item of input.items) {
                const a = accounts.find((x) => x.id === item.collectionId);
                if (a.legacy || a.blocked)
                    throw stockError("COLLECTION_FROZEN", "Une correction ou un historique à rapprocher bloque cet encaissement.");
                if (units(item.amount) <= 0n ||
                    units(item.amount) > units(a.available))
                    throw stockError("BALANCE_EXCEEDED", "Le montant dépasse les fonds encore disponibles pour cette remise.");
            }
            const total = bounded(sum(input.items.map((i) => units(i.amount)))), r = await tx.remittance.create({
                data: {
                    companyId: c.companyId,
                    reference: "REM-" + randomUUID().toUpperCase(),
                    agencyId: input.agencyId,
                    courierId: c.actorId,
                    declaredAmount: total,
                    currency: input.currency,
                    notes: input.notes,
                    operationKey: input.operationKey,
                    requestHash: createHash("sha256")
                        .update(JSON.stringify(input))
                        .digest("hex"),
                },
            });
            await tx.remittanceItem.createMany({
                data: input.items.map((i) => ({
                    companyId: c.companyId,
                    remittanceId: r.id,
                    collectionId: i.collectionId,
                    courierId: c.actorId,
                    agencyId: input.agencyId,
                    currency: input.currency,
                    amount: i.amount,
                    legacySlot: null,
                })),
            });
            await tx.remittanceEvent.create({
                data: {
                    companyId: r.companyId,
                    remittanceId: r.id,
                    actorId: c.actorId,
                    status: r.status,
                    notes: input.notes,
                },
            });
            return {
                id: r.id,
                event: {
                    agencyId: r.agencyId,
                    courierId: c.actorId,
                    remittanceId: r.id,
                    action: "REMITTANCE_DECLARED",
                    entityId: r.id,
                    status: r.status,
                    amount: total,
                    currency: r.currency,
                    metadata: { collections: input.items.length },
                },
            };
        });
        return this.remittance(c, id);
    }
    async decideRemittance(c, id, input) {
        await this.write(c, "remittances.confirm", { ...input, id }, "REMITTANCE_DECIDED", async (tx) => {
            const r = await this.findRemittance(tx, c, id);
            agencyAllowed(c, r.agencyId);
            checkVersion(r.version, input.version);
            if (r.courierId === c.actorId)
                throw stockError("SELF_CONFIRMATION_DENIED", "Vous ne pouvez pas recevoir votre propre remise.", 403);
            if (!r.operationKey || r.status !== "DECLARED" || r.confirmedAt)
                throw stockError("REMITTANCE_ALREADY_DECIDED", "Cette remise a déjà été traitée ou doit être rapprochée.");
            const receiving = ["CONFIRM", "DISPUTE"].includes(input.decision), items = r.remittanceItem_remittanceRecords;
            if (receiving &&
                (input.items.length !== items.length ||
                    new Set(input.items.map((i) => i.id)).size !== items.length ||
                    input.items.some((i) => !items.some((x) => x.id === i.id))))
                throw stockError("RECEIPT_ALLOCATION_REQUIRED", "Précisez le montant réellement reçu pour chaque ligne.", 400);
            if (!receiving && input.items.length)
                throw stockError("NO_RECEIPT_EXPECTED", "Un rejet ou une demande de correction ne confirme aucun fonds.", 400);
            const accounts = await ledger(tx, items.map((i) => i.collection));
            let actual = 0n;
            for (const item of items) {
                const a = accounts.find((e) => e.id === item.collectionId), value = receiving
                    ? units(input.items.find((i) => i.id === item.id).confirmedAmount)
                    : 0n;
                if (a.legacy || a.blocked)
                    throw stockError("COLLECTION_FROZEN", "Traitez la correction en attente avant de valider la remise.");
                if (value > units(a.available) + units(item.amount))
                    throw stockError("BALANCE_EXCEEDED", "Le montant constaté dépasse les fonds traçables disponibles, en tenant compte des autres remises.");
                if (input.decision === "CONFIRM" && value !== units(item.amount))
                    throw stockError("RECEIPT_MISMATCH", "Utilisez la décision avec écart si les montants diffèrent.");
                actual += value;
                await tx.remittanceItem.update({
                    where: { id: item.id },
                    data: { confirmedAmount: amount(value) },
                });
            }
            const status = input.decision === "CONFIRM"
                ? "CONFIRMED"
                : input.decision === "REJECT"
                    ? "CANCELLED"
                    : "DISPUTED";
            await tx.remittance.update({
                where: { id: r.id },
                data: {
                    status,
                    confirmedAmount: bounded(actual),
                    confirmedAt: new Date(),
                    confirmedById: c.actorId,
                    decision: input.decision,
                    decisionReason: input.reason,
                    version: { increment: 1 },
                },
            });
            await tx.remittanceEvent.create({
                data: {
                    companyId: r.companyId,
                    remittanceId: r.id,
                    actorId: c.actorId,
                    status,
                    notes: input.reason,
                },
            });
            if (input.decision !== "CONFIRM")
                await this.addDiscrepancy(tx, c, {
                    agencyId: r.agencyId,
                    courierId: r.courierId,
                    remittanceId: r.id,
                    kind: input.decision === "DISPUTE"
                        ? actual > units(r.declaredAmount)
                            ? "EXCESS_REMITTANCE"
                            : "SHORT_REMITTANCE"
                        : "CONTESTED",
                    amount: amount(actual > units(r.declaredAmount)
                        ? actual - units(r.declaredAmount)
                        : units(r.declaredAmount) - actual),
                    currency: r.currency,
                    description: input.reason,
                    sourceKey: `remittance:${r.id}:decision`,
                });
            return {
                id: r.id,
                event: {
                    agencyId: r.agencyId,
                    courierId: r.courierId,
                    remittanceId: r.id,
                    action: "REMITTANCE_DECIDED",
                    entityId: r.id,
                    previousStatus: r.status,
                    status,
                    amount: amount(actual),
                    currency: r.currency,
                    reason: input.reason,
                    metadata: {
                        decision: input.decision,
                        declaredAmount: r.declaredAmount.toFixed(4),
                    },
                },
            };
        });
        return this.remittance(c, id);
    }
}
