import { createHash, randomUUID } from "node:crypto";
import { DeliveryService } from "../deliveries/service.js";
import { fingerprint } from "../deliveries/core.js";
import { access, agencyAllowed } from "../deliveries/access.js";
import { stockError, checkVersion } from "../stocks/access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { ledger, collectionInclude } from "../collections/ledger.js";
import { units, sum } from "../collections/money.js";
import { currentAssignment, ensureOtp } from "./otp.js";
import { eligible, digest, matches } from "./security.js";
import { LocalProofStorage } from "./storage.js";
export class ConfirmationService extends DeliveryService {
    files;
    clock;
    constructor(db, files = new LocalProofStorage(), clock = () => new Date()) {
        super(db);
        this.files = files;
        this.clock = clock;
    }
    async authorize(tx, c, p, required) {
        const auth = await access(tx, c);
        if (auth.kind === "shop" || !auth.permissions.includes(required))
            throw stockError("PERMISSION_DENIED", "Action de confirmation non autorisée.", 403);
        agencyAllowed(c, p.agencyId);
        if (!(await authorizationStore(tx).subscriptionValid(p.companyId))) {
            const sub = await tx.subscription.findUnique({
                where: { companyId: p.companyId },
            }), now = this.clock();
            if (!sub?.expiresAt ||
                sub.expiresAt > now ||
                !["ACTIVE", "EXPIRED"].includes(sub.status) ||
                !p.pickedUpAt ||
                p.pickedUpAt >= sub.expiresAt ||
                !["IN_PROGRESS", "FAILED"].includes(p.status))
                throw stockError("SUBSCRIPTION_REQUIRED", "Seule une mission déjà prise en charge avant l’expiration peut être régularisée.", 403);
        }
        return auth;
    }
    requireFinal(c, p) {
        this.assigned(c, p);
        if (!eligible(p))
            throw stockError("CONFIRMATION_UNAVAILABLE", "La remise ne peut être confirmée à cette étape.");
    }
    async command(c, id, required, input, action, work) {
        await this.transaction(async (tx) => {
            if (!c.companyId)
                throw stockError("CONTEXT_REQUIRED", "Choisissez une agence.", 403);
            await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
            const p = await this.find(tx, c, id);
            await this.authorize(tx, c, p, required);
            const hash = fingerprint({ id, actor: c.actorId, action, input }), replay = await tx.deliveryEvent.findUnique({
                where: {
                    companyId_operationKey: {
                        companyId: p.companyId,
                        operationKey: input.operationKey,
                    },
                },
            });
            if (replay) {
                if (replay.requestHash !== hash)
                    throw stockError("IDEMPOTENCY_MISMATCH", "Cette opération a déjà un autre contenu.");
                return;
            }
            checkVersion(p.version, input.version);
            const change = await work(tx, p), next = await tx.delivery.update({
                where: { id },
                data: { ...change.data, version: { increment: 1 } },
            });
            if (change.orderStatus)
                await tx.order.update({
                    where: { id: p.orderId },
                    data: { status: change.orderStatus, version: { increment: 1 } },
                });
            await this.record(tx, c, p, next, action, input.operationKey, hash, "reason" in input ? String(input.reason) : undefined, undefined, change.metadata);
        });
        return this.confirmation(c, id);
    }
    async readAllowed(tx, c, id) {
        const a = await access(tx, c), required = a.kind === "shop"
            ? "shop.delivery.proofs.read"
            : a.kind === "driver"
                ? "delivery.proofs.self.read"
                : "delivery.proofs.read";
        if (!a.permissions.includes(required))
            throw stockError("PERMISSION_DENIED", "Consultation des preuves non autorisée.", 403);
        const p = await this.find(tx, c, id, a.kind);
        return { p, auth: a };
    }
    confirmation(c, id) {
        return this.transaction(async (tx) => {
            const { p, auth } = await this.readAllowed(tx, c, id), shop = auth.kind === "shop";
            const otp = await tx.deliveryOtp.findFirst({
                where: { companyId: p.companyId, deliveryId: id },
                orderBy: { createdAt: "desc" },
            }), proof = await tx.deliveryProof.findUnique({
                where: {
                    companyId_deliveryId: { companyId: p.companyId, deliveryId: id },
                },
            });
            const evidence = await tx.deliveryEvidence.findMany({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    ...(shop
                        ? { status: "ATTACHED" }
                        : auth.kind === "driver"
                            ? { courierId: c.actorId }
                            : {}),
                },
                orderBy: { createdAt: "asc" },
            }), exceptions = shop
                ? []
                : await tx.otpException.findMany({
                    where: { companyId: p.companyId, deliveryId: id },
                    orderBy: { createdAt: "desc" },
                });
            const a = p.courierId
                ? await tx.deliveryAssignment.findFirst({
                    where: {
                        companyId: p.companyId,
                        deliveryId: id,
                        endedAt: null,
                        activeSlot: 1,
                        purpose: "FINAL",
                    },
                })
                : null;
            const actors = shop
                ? []
                : await tx.user.findMany({
                    where: {
                        id: {
                            in: exceptions.flatMap((e) => e.decidedById ? [e.decidedById] : []),
                        },
                    },
                    select: { id: true, fullName: true },
                });
            const names = new Map(actors.map((u) => [u.id, u.fullName]));
            return {
                id,
                version: p.version,
                status: p.status,
                phase: p.phase,
                eligible: eligible(p),
                permissions: auth.permissions,
                kind: auth.kind,
                canVerify: eligible(p) &&
                    p.courierId === c.actorId &&
                    auth.permissions.includes("delivery.otp.verify"),
                canUpload: p.courierId === c.actorId &&
                    auth.permissions.includes("delivery.proofs.upload") &&
                    (eligible(p) || p.phase === "FAILED"),
                canRenew: eligible(p) &&
                    (auth.permissions.includes("delivery.otp.manage") ||
                        auth.permissions.includes("delivery.otp.verify")),
                canApprove: auth.permissions.includes("delivery.exceptions.approve"),
                canManageTracking: auth.permissions.includes("tracking.manage"),
                otp: otp
                    ? {
                        status: otp.status,
                        expiresAt: otp.expiresAt,
                        verifiedAt: otp.verifiedAt,
                        validationExpiresAt: otp.validationExpiresAt,
                        expired: otp.expiresAt <= this.clock() ||
                            (otp.status === "VERIFIED" &&
                                !!otp.validationExpiresAt &&
                                otp.validationExpiresAt <= this.clock()),
                        attempts: shop ? undefined : otp.attempts,
                        maxAttempts: shop ? undefined : otp.maxAttempts,
                        current: otp.assignmentId === a?.id && otp.activeSlot === 1,
                    }
                    : null,
                proof: proof
                    ? {
                        id: proof.id,
                        legacy: !proof.operationKey,
                        method: proof.method,
                        createdAt: proof.createdAt,
                        exceptionReason: shop ? undefined : proof.exceptionReason,
                    }
                    : null,
                evidence: evidence.map((e) => ({
                    id: e.id,
                    kind: e.kind,
                    status: e.status,
                    createdAt: e.createdAt,
                    current: e.assignmentId === (a?.id ?? proof?.assignmentId),
                    fileUrl: `/delivery-evidence/${e.id}/file`,
                })),
                exceptions: exceptions.map((e) => ({
                    id: e.id,
                    status: e.status,
                    version: e.version,
                    reason: e.reason,
                    decisionReason: e.decisionReason,
                    createdAt: e.createdAt,
                    decidedAt: e.decidedAt,
                    decidedByName: e.decidedById ? names.get(e.decidedById) : undefined,
                    expiresAt: e.expiresAt,
                    expired: e.expiresAt <= this.clock(),
                    current: e.assignmentId === (a?.id ?? proof?.assignmentId),
                    canDecide: e.status === "PENDING" &&
                        e.expiresAt > this.clock() &&
                        e.assignmentId === a?.id &&
                        e.requestedById !== c.actorId &&
                        e.courierId !== c.actorId &&
                        auth.permissions.includes("delivery.exceptions.approve"),
                })),
            };
        });
    }
    async renew(c, id, input) {
        const auth = await this.transaction((tx) => access(tx, c));
        const required = auth.permissions.includes("delivery.otp.manage")
            ? "delivery.otp.manage"
            : "delivery.otp.verify";
        return this.command(c, id, required, input, "OTP_RENEWED", async (tx, p) => {
            if (required === "delivery.otp.verify")
                this.requireFinal(c, p);
            else if (!eligible(p))
                throw stockError("OTP_UNAVAILABLE", "La mission n’est plus éligible.");
            await ensureOtp(tx, p, true, this.clock());
            return { data: {}, metadata: { reason: input.reason } };
        });
    }
    async verifyCode(c, id, input) {
        const outcome = await this.transaction(async (tx) => {
            if (!c.companyId)
                throw stockError("CONTEXT_REQUIRED", "Choisissez une agence.", 403);
            await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
            const p = await this.find(tx, c, id);
            await this.authorize(tx, c, p, "delivery.otp.verify");
            this.requireFinal(c, p);
            const assignment = await currentAssignment(tx, p), hash = digest(JSON.stringify({ id, actor: c.actorId, ...input }), "otp-request");
            const replay = await tx.otpAttempt.findUnique({
                where: {
                    companyId_operationKey: {
                        companyId: p.companyId,
                        operationKey: input.operationKey,
                    },
                },
            });
            if (replay) {
                if (replay.requestHash !== hash)
                    throw stockError("IDEMPOTENCY_MISMATCH", "Cette tentative correspond à un autre contenu.");
                return replay.outcome;
            }
            checkVersion(p.version, input.version);
            const otp = await tx.deliveryOtp.findFirst({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    activeSlot: 1,
                    assignmentId: assignment.id,
                },
            }), now = this.clock();
            let result = "OTP_UNAVAILABLE";
            if (otp) {
                if (otp.status === "LOCKED")
                    result = "OTP_LOCKED";
                else if (otp.status !== "PENDING")
                    result = "OTP_ALREADY_USED";
                else if (otp.expiresAt <= now) {
                    result = "OTP_EXPIRED";
                    await tx.deliveryOtp.update({
                        where: { id: otp.id },
                        data: { status: "EXPIRED", activeSlot: null },
                    });
                }
                else if (!matches(digest(input.code, "otp:" + otp.id), otp.codeHash)) {
                    result =
                        otp.attempts + 1 >= otp.maxAttempts
                            ? "OTP_LOCKED"
                            : "OTP_INCORRECT";
                    await tx.deliveryOtp.update({
                        where: { id: otp.id },
                        data: {
                            attempts: { increment: 1 },
                            ...(result === "OTP_LOCKED" ? { status: "LOCKED" } : {}),
                        },
                    });
                }
                else {
                    result = "VERIFIED";
                    await tx.deliveryOtp.update({
                        where: { id: otp.id },
                        data: {
                            status: "VERIFIED",
                            verifiedAt: now,
                            verifiedById: c.actorId,
                            validationExpiresAt: new Date(Math.min(otp.expiresAt.getTime(), now.getTime() + 600000)),
                        },
                    });
                    const next = await tx.delivery.update({
                        where: { id },
                        data: { version: { increment: 1 }, phase: "AWAITING_PROOF" },
                    });
                    await this.record(tx, c, p, next, "OTP_VERIFIED", input.operationKey, hash);
                }
            }
            await tx.otpAttempt.create({
                data: {
                    companyId: p.companyId,
                    deliveryId: id,
                    otpId: otp?.id,
                    actorId: c.actorId,
                    outcome: result,
                    operationKey: input.operationKey,
                    requestHash: hash,
                },
            });
            await tx.auditLog.create({
                data: {
                    companyId: p.companyId,
                    agencyId: p.agencyId,
                    actorId: c.actorId,
                    entityType: "Delivery",
                    entityId: id,
                    action: result,
                    metadata: { otpId: otp?.id ?? null },
                },
            });
            return result;
        });
        if (outcome !== "VERIFIED")
            throw stockError(outcome, outcome === "OTP_LOCKED"
                ? "Trop d’essais. Le code est bloqué temporairement."
                : outcome === "OTP_INCORRECT"
                    ? "Code incorrect. Vérifiez les six chiffres auprès du destinataire."
                    : "Code expiré, déjà utilisé ou indisponible. Demandez un renouvellement contrôlé.", outcome === "OTP_LOCKED" ? 429 : 409);
        return this.confirmation(c, id);
    }
    requestException(c, id, input) {
        return this.command(c, id, "delivery.exceptions.request", input, "OTP_EXCEPTION_REQUESTED", async (tx, p) => {
            this.requireFinal(c, p);
            const assignment = await currentAssignment(tx, p);
            if (await tx.otpException.count({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    assignmentId: assignment.id,
                    status: { in: ["PENDING", "APPROVED"] },
                },
            }))
                throw stockError("EXCEPTION_PENDING", "Une demande est déjà en cours.");
            const e = await tx.otpException.create({
                data: {
                    companyId: p.companyId,
                    deliveryId: id,
                    agencyId: p.agencyId,
                    assignmentId: assignment.id,
                    courierId: c.actorId,
                    requestedById: c.actorId,
                    reason: input.reason,
                    expiresAt: new Date(this.clock().getTime() + 3600000),
                },
            });
            await this.notifyException(tx, p, e.id);
            return {
                data: { phase: "AWAITING_PROOF" },
                metadata: { exceptionId: e.id },
            };
        });
    }
    async notifyException(tx, p, exceptionId) {
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
        });
        for (const u of managers)
            for (const channel of ["EMAIL", "PUSH"])
                await tx.notification.create({
                    data: {
                        companyId: p.companyId,
                        recipientUserId: u.userId,
                        recipientAddress: channel === "EMAIL" ? u.user.email : u.userId,
                        channel,
                        sourceEvent: "CONFIRMATION_EXCEPTION",
                        sourceId: exceptionId,
                        template: "confirmation_exception",
                        payload: { deliveryId: p.id, publicNumber: p.order.publicNumber },
                        dedupeKey: `otp-exception:${exceptionId}:${channel}:${u.userId}`,
                        availableAt: this.clock(),
                    },
                });
    }
    decideException(c, id, exceptionId, input) {
        return this.command(c, id, "delivery.exceptions.approve", { ...input, exceptionId }, "OTP_EXCEPTION_DECIDED", async (tx, p) => {
            if (!eligible(p))
                throw stockError("CONFIRMATION_UNAVAILABLE", "Cette mission n’est plus éligible.");
            const assignment = await currentAssignment(tx, p), e = await tx.otpException.findFirst({
                where: {
                    id: exceptionId,
                    companyId: p.companyId,
                    deliveryId: id,
                    assignmentId: assignment.id,
                },
            });
            if (!e || e.status !== "PENDING" || e.expiresAt <= this.clock())
                throw stockError("EXCEPTION_UNAVAILABLE", "Cette demande n’est plus disponible.");
            if (e.requestedById === c.actorId || e.courierId === c.actorId)
                throw stockError("SELF_APPROVAL_DENIED", "Un responsable distinct doit décider.", 403);
            checkVersion(e.version, input.exceptionVersion);
            if (input.approve &&
                (await tx.deliveryEvidence.count({
                    where: {
                        companyId: p.companyId,
                        deliveryId: id,
                        assignmentId: assignment.id,
                        kind: "HANDOVER",
                        status: "READY",
                    },
                })) < 2)
                throw stockError("EXTRA_EVIDENCE_REQUIRED", "Deux photos supplémentaires distinctes sont requises pour l’exception.");
            if (input.approve) {
                const ready = await tx.deliveryEvidence.findMany({
                    where: {
                        companyId: p.companyId,
                        deliveryId: id,
                        assignmentId: assignment.id,
                        kind: "HANDOVER",
                        status: "READY",
                    },
                    select: { fileId: true },
                });
                const hashes = await tx.fileAsset.findMany({
                    where: {
                        companyId: p.companyId,
                        id: { in: ready.map((e) => e.fileId) },
                        visibility: "PRIVATE",
                        archivedAt: null,
                    },
                    select: { checksumSha256: true },
                });
                if (new Set(hashes.map((f) => f.checksumSha256)).size < 2)
                    throw stockError("EXTRA_EVIDENCE_REQUIRED", "Deux photographies différentes sont requises avant l’approbation.");
            }
            await tx.otpException.update({
                where: { id: exceptionId },
                data: {
                    status: input.approve ? "APPROVED" : "REJECTED",
                    version: { increment: 1 },
                    decidedById: c.actorId,
                    decidedAt: this.clock(),
                    decisionReason: input.reason,
                },
            });
            return { data: {}, metadata: { exceptionId, approved: input.approve } };
        });
    }
    async upload(c, id, input, bytes, mime) {
        if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 5 * 1024 * 1024)
            throw stockError("PROOF_SIZE_INVALID", "Photo de 5 Mo maximum requise.", 400);
        const hash = fingerprint({
            id,
            actor: c.actorId,
            input,
            checksum: createHash("sha256").update(bytes).digest("hex"),
        });
        await this.transaction(async (tx) => {
            const p = await this.find(tx, c, id);
            await this.authorize(tx, c, p, "delivery.proofs.upload");
            this.assigned(c, p);
        });
        const saved = await this.files.put(bytes, mime), fileId = randomUUID();
        let retained = false;
        try {
            const result = await this.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
                const p = await this.find(tx, c, id);
                await this.authorize(tx, c, p, "delivery.proofs.upload");
                this.assigned(c, p);
                const prior = await tx.deliveryEvidence.findUnique({
                    where: {
                        companyId_operationKey: {
                            companyId: p.companyId,
                            operationKey: input.operationKey,
                        },
                    },
                });
                if (prior) {
                    if (prior.requestHash !== hash)
                        throw stockError("IDEMPOTENCY_MISMATCH", "Cette référence d’envoi possède un autre contenu.");
                    return prior;
                }
                if (input.kind === "HANDOVER" ? !eligible(p) : p.phase !== "FAILED")
                    throw stockError("PROOF_PHASE_INVALID", "Cette photo ne correspond pas à l’étape de la mission.");
                const assignment = await currentAssignment(tx, p);
                if ((await tx.deliveryEvidence.count({
                    where: {
                        companyId: p.companyId,
                        deliveryId: id,
                        assignmentId: assignment.id,
                        status: "READY",
                    },
                })) >= 8)
                    throw stockError("PROOF_LIMIT", "Huit photos maximum par affectation.");
                await tx.fileAsset.create({
                    data: {
                        id: fileId,
                        companyId: p.companyId,
                        storageKey: saved.key,
                        mimeType: "image/webp",
                        sizeBytes: BigInt(saved.bytes.length),
                        originalName: "preuve.webp",
                        checksumSha256: saved.checksum,
                        uploadedById: c.actorId,
                        visibility: "PRIVATE",
                    },
                });
                const e = await tx.deliveryEvidence.create({
                    data: {
                        companyId: p.companyId,
                        deliveryId: id,
                        agencyId: p.agencyId,
                        courierId: c.actorId,
                        assignmentId: assignment.id,
                        fileId,
                        kind: input.kind,
                        operationKey: input.operationKey,
                        requestHash: hash,
                    },
                }), next = await tx.delivery.update({
                    where: { id },
                    data: { version: { increment: 1 } },
                });
                await this.record(tx, c, p, next, "PHOTO_UPLOADED", input.operationKey, hash, undefined, undefined, { evidenceId: e.id, kind: e.kind });
                return e;
            });
            retained = result.fileId === fileId;
            return this.confirmation(c, id);
        }
        finally {
            if (!retained)
                await this.files.remove(saved.key);
        }
    }
    async file(c, evidenceId) {
        const file = await this.transaction(async (tx) => {
            const e = await tx.deliveryEvidence.findUnique({
                where: { id: evidenceId },
            });
            if (!e)
                throw stockError("PROOF_NOT_FOUND", "Preuve introuvable.", 404);
            const { auth } = await this.readAllowed(tx, c, e.deliveryId);
            if ((auth.kind === "shop" && e.status !== "ATTACHED") ||
                (auth.kind === "driver" && e.courierId !== c.actorId))
                throw stockError("PROOF_NOT_FOUND", "Preuve introuvable.", 404);
            await tx.auditLog.create({ data: { companyId: e.companyId, agencyId: e.agencyId, actorId: c.actorId, action: "PROOF_FILE_ACCESS_REQUESTED", entityType: "DeliveryEvidence", entityId: e.id, metadata: { deliveryId: e.deliveryId } } });
            return tx.fileAsset.findFirstOrThrow({
                where: {
                    id: e.fileId,
                    companyId: e.companyId,
                    visibility: "PRIVATE",
                    archivedAt: null,
                },
            });
        });
        return this.files.read(file.storageKey);
    }
    complete(c, id, input) {
        return this.command(c, id, "delivery.complete", input, "COMPLETED", async (tx, p) => {
            this.requireFinal(c, p);
            await this.noPending(tx, p);
            const assignment = await currentAssignment(tx, p), now = this.clock();
            if (await tx.deliveryProof.count({
                where: { companyId: p.companyId, deliveryId: id },
            }))
                throw stockError("DELIVERY_ALREADY_COMPLETED", "Cette remise est déjà confirmée.");
            if (await tx.deliveryIncident.count({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    blocking: true,
                    status: "OPEN",
                },
            }))
                throw stockError("BLOCKING_INCIDENT", "Un responsable doit d’abord résoudre l’incident bloquant.");
            if (await tx.financialCorrection.count({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    status: "PENDING",
                },
            }))
                throw stockError("FINANCIAL_REVIEW_PENDING", "Une régularisation financière est en attente. Faites-la examiner avant la clôture.");
            const rows = await tx.collection.findMany({
                where: { companyId: p.companyId, delivery: { orderId: p.orderId } },
                include: collectionInclude,
            }), entries = await ledger(tx, rows), net = sum(entries.map((e) => units(e.net)));
            if (p.order.collectionRequired &&
                (entries.some((e) => e.legacy) ||
                    net < units(p.order.amountToCollect))) {
                const all = await tx.financialCorrection.findMany({
                    where: {
                        companyId: p.companyId,
                        deliveryId: id,
                        kind: "EXCEPTION",
                        status: "APPROVED",
                    },
                });
                if (entries.some((e) => e.legacy) ||
                    !all.some((e) => units(e.fromAmount) === units(p.order.amountToCollect) &&
                        units(e.toAmount) === net))
                    throw stockError("COLLECTION_INCOMPLETE", "L’encaissement est incomplet. Une dérogation financière distincte et approuvée est nécessaire.");
            }
            let exception = null;
            const otp = await tx.deliveryOtp.findFirst({
                where: {
                    companyId: p.companyId,
                    deliveryId: id,
                    assignmentId: assignment.id,
                    courierId: c.actorId,
                    activeSlot: 1,
                    status: "VERIFIED",
                    verifiedById: c.actorId,
                    expiresAt: { gt: now },
                    validationExpiresAt: { gt: now },
                },
            });
            if (input.exceptionId)
                exception = await tx.otpException.findFirst({
                    where: {
                        id: input.exceptionId,
                        companyId: p.companyId,
                        deliveryId: id,
                        assignmentId: assignment.id,
                        courierId: c.actorId,
                        status: "APPROVED",
                        expiresAt: { gt: now },
                    },
                });
            if (!otp && !exception)
                throw stockError("OTP_REQUIRED", "Un code validé ou une exception approuvée est requis.");
            const evidence = await tx.deliveryEvidence.findMany({
                where: {
                    id: { in: input.evidenceIds },
                    companyId: p.companyId,
                    deliveryId: id,
                    assignmentId: assignment.id,
                    courierId: c.actorId,
                    status: "READY",
                    kind: "HANDOVER",
                },
            });
            if (evidence.length !== input.evidenceIds.length ||
                evidence.length < (exception ? 2 : 1))
                throw stockError("PHOTO_REQUIRED", exception
                    ? "L’exception exige deux photos distinctes."
                    : "Une photo de remise valide est requise.");
            const fileRows = await tx.fileAsset.findMany({
                where: {
                    id: { in: evidence.map((e) => e.fileId) },
                    companyId: p.companyId,
                    visibility: "PRIVATE",
                    archivedAt: null,
                },
            });
            if (fileRows.length !== evidence.length ||
                new Set(fileRows.map((f) => f.checksumSha256)).size <
                    (exception ? 2 : 1))
                throw stockError("PHOTO_REQUIRED", "Les preuves supplémentaires doivent être des photos distinctes disponibles.");
            for (const f of fileRows) {
                const bytes = await this.files.read(f.storageKey);
                if (createHash("sha256").update(bytes).digest("hex") !==
                    f.checksumSha256)
                    throw stockError("PROOF_FILE_UNAVAILABLE", "Une photo est indisponible ou altérée.");
            }
            const proof = await tx.deliveryProof.create({
                data: {
                    companyId: p.companyId,
                    deliveryId: id,
                    courierId: c.actorId,
                    assignmentId: assignment.id,
                    confirmedById: c.actorId,
                    method: exception ? "AUTHORIZED_EXCEPTION" : "OTP",
                    otpId: exception ? null : otp.id,
                    exceptionId: exception?.id,
                    exceptionAuthorizedById: exception?.decidedById,
                    exceptionReason: exception?.decisionReason,
                    operationKey: input.operationKey,
                    requestHash: fingerprint(input),
                },
            });
            for (const e of evidence)
                await tx.proofPhoto.create({
                    data: {
                        companyId: p.companyId,
                        proofId: proof.id,
                        fileId: e.fileId,
                    },
                });
            await tx.deliveryEvidence.updateMany({
                where: { id: { in: evidence.map((e) => e.id) } },
                data: { status: "ATTACHED", proofId: proof.id },
            });
            if (otp)
                await tx.deliveryOtp.update({
                    where: { id: otp.id },
                    data: { status: "CONSUMED", activeSlot: null, consumedAt: now },
                });
            if (exception)
                await tx.otpException.update({
                    where: { id: exception.id },
                    data: { status: "CONSUMED", version: { increment: 1 } },
                });
            await this.closeAssignment(tx, p);
            return {
                data: {
                    status: "DELIVERED",
                    phase: "DELIVERED",
                    closedAt: now,
                    custodyType: "RECIPIENT",
                    custodyUserId: null,
                    custodyAgencyId: null,
                },
                orderStatus: "DELIVERED",
                metadata: {
                    proofId: proof.id,
                    method: proof.method,
                    evidenceCount: evidence.length,
                    notes: input.notes ?? null,
                },
            };
        });
    }
    renewTracking(c, id, input) {
        return this.command(c, id, "tracking.manage", input, "TRACKING_RENEWED", async (tx, p) => {
            await tx.order.update({
                where: { id: p.orderId },
                data: { trackingVersion: { increment: 1 } },
            });
            await tx.trackingAccess.updateMany({
                where: {
                    companyId: p.companyId,
                    orderId: p.orderId,
                    revokedAt: null,
                },
                data: { revokedAt: this.clock() },
            });
            await tx.deliveryOtp.updateMany({ where: { companyId: p.companyId, deliveryId: p.id, activeSlot: 1, status: { in: ["PENDING", "VERIFIED", "LOCKED"] } }, data: { status: "REVOKED", activeSlot: null, invalidatedAt: this.clock() } });
            await tx.notification.create({
                data: {
                    companyId: p.companyId,
                    channel: "EMAIL",
                    recipientAddress: p.order.recipientEmail,
                    sourceEvent: "TRACKING_ACCESS",
                    sourceId: p.orderId,
                    template: "tracking_access",
                    payload: { publicNumber: p.order.publicNumber },
                    dedupeKey: `tracking-renew:${p.id}:${input.operationKey}`,
                    availableAt: this.clock(),
                },
            });
            return { data: {} };
        });
    }
    communications(c, id) {
        return this.transaction(async (tx) => {
            const { p, auth } = await this.readAllowed(tx, c, id), required = auth.kind === "shop"
                ? "shop.delivery.notifications.read"
                : "delivery.notifications.read";
            if (!auth.permissions.includes(required))
                throw stockError("PERMISSION_DENIED", "Consultation des notifications non autorisée.", 403);
            const rows = await tx.notification.findMany({
                where: {
                    companyId: p.companyId,
                    channel: "EMAIL",
                    recipientUserId: null,
                    OR: [
                        { sourceId: p.orderId },
                        { payload: { path: "$.deliveryId", equals: id } },
                    ],
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            });
            return rows.map((n) => ({
                id: n.id,
                event: n.sourceEvent,
                status: n.deliveryState ?? (n.status === "SENT" ? "ACCEPTED" : n.status),
                attempts: n.attempts,
                maxAttempts: n.maxAttempts,
                createdAt: n.createdAt,
                acceptedAt: n.providerAcceptedAt ?? n.sentAt,
                nextAttemptAt: n.status === "FAILED" && n.attempts < n.maxAttempts
                    ? n.availableAt
                    : null,
            }));
        });
    }
}
