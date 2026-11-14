import { access, scope, agencyAllowed, } from "./access.js";
import { stockError } from "../stocks/access.js";
import { availableActions } from "./actions.js";
export const missionInclude = {
    company: { select: { id: true, name: true } },
    agency: { select: { id: true, name: true } },
    order: {
        include: {
            collaboration: { select: { shop: { select: { id: true, name: true } } } },
            orderItem_orderRecords: {
                where: { active: true },
                include: { stockReservation_orderItemRecords: true },
            },
        },
    },
    deliveryAssignment_deliveryRecords: { orderBy: { createdAt: "asc" } },
    legs: { orderBy: { createdAt: "asc" } },
    handovers: { orderBy: { createdAt: "asc" } },
    attempts: { orderBy: { createdAt: "asc" } },
    incidents: { orderBy: { createdAt: "asc" } },
    parcelReturn: true,
};
export class DeliveryReads {
    db;
    constructor(db) {
        this.db = db;
    }
    async find(tx, c, id, kind) {
        const auth = kind ?? (await access(tx, c)).kind;
        const p = await tx.delivery.findFirst({
            where: { ...scope(c, auth), id },
            include: missionInclude,
        });
        if (!p)
            throw stockError("DELIVERY_NOT_FOUND", "Mission introuvable.", 404);
        return p;
    }
    async dto(tx, c, p, auth) {
        const shop = auth.kind === "shop", driver = auth.kind === "driver";
        const users = shop
            ? []
            : await tx.user.findMany({
                where: {
                    id: {
                        in: [
                            ...new Set([
                                p.courierId,
                                p.custodyUserId,
                                ...p.deliveryAssignment_deliveryRecords.map((a) => a.courierId),
                                ...p.legs.map((l) => l.transporterId),
                                ...p.handovers.map((h) => h.targetCourierId),
                            ].filter((s) => !!s)),
                        ],
                    },
                },
                select: { id: true, fullName: true },
            }), names = new Map(users.map((u) => [u.id, u.fullName]));
        const agencies = await tx.agency.findMany({
            where: {
                companyId: p.companyId,
                id: {
                    in: [
                        ...new Set([
                            p.custodyAgencyId,
                            ...p.legs.flatMap((l) => [
                                l.originAgencyId,
                                l.destinationAgencyId,
                            ]),
                        ].filter((s) => !!s)),
                    ],
                },
            },
            select: { id: true, name: true },
        }), agencyNames = new Map(agencies.map((a) => [a.id, a.name]));
        const o = p.order, details = (o.recipientDetails ?? {});
        const recipientDetails = driver
            ? Object.fromEntries(Object.entries(details).filter(([k]) => [
                "district",
                "landmark",
                "accessInstructions",
                "desiredDeliveryAt",
                "latitude",
                "longitude",
            ].includes(k)))
            : details;
        return {
            actions: await availableActions(tx, c, p, auth),
            id: p.id,
            companyId: p.companyId,
            orderId: p.orderId,
            agencyId: p.agencyId,
            courierId: shop ? null : p.courierId,
            status: p.status,
            phase: p.phase,
            version: p.version,
            parcelReference: p.parcelReference,
            pickedUpAt: p.pickedUpAt,
            assignedAt: p.assignedAt,
            closedAt: p.closedAt,
            stockIssuedAt: p.stockIssuedAt,
            failureReason: shop ? null : p.failureReason,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            company: p.company,
            agency: p.agency,
            courier: shop
                ? undefined
                : p.courierId
                    ? { id: p.courierId, fullName: names.get(p.courierId) ?? "Livreur" }
                    : null,
            custody: {
                type: p.custodyType,
                agencyId: p.custodyAgencyId,
                ...(!shop
                    ? {
                        userId: p.custodyUserId,
                        holder: p.custodyUserId ? names.get(p.custodyUserId) : undefined,
                    }
                    : {}),
                agencyName: p.custodyAgencyId
                    ? agencyNames.get(p.custodyAgencyId)
                    : null,
            },
            order: {
                id: o.id,
                publicNumber: o.publicNumber,
                type: o.type,
                status: o.status,
                shopId: o.shopId,
                agencyId: o.agencyId,
                shopName: o.collaboration.shop.name,
                recipientName: o.recipientName,
                recipientPhone: o.recipientPhone,
                recipientAddress: o.recipientAddress,
                recipientCity: o.recipientCity,
                recipientCountry: o.recipientCountry,
                recipientDetails,
                pickup: o.pickup,
                parcelDescription: o.parcelDescription,
                notes: o.notes,
                collectionRequired: o.collectionRequired,
                ...(shop || auth.permissions.includes("deliveries.amount.read")
                    ? {
                        amountToCollect: o.amountToCollect.toString(),
                        currency: o.currency,
                    }
                    : {}),
                items: o.orderItem_orderRecords.map((i) => ({
                    id: i.id,
                    name: i.name,
                    sku: i.sku,
                    quantity: i.quantity,
                    reservations: i.stockReservation_orderItemRecords.map((r) => ({
                        id: r.id,
                        quantity: r.quantity,
                        status: r.status,
                    })),
                })),
            },
            assignments: shop
                ? []
                : p.deliveryAssignment_deliveryRecords.map((a) => ({
                    id: a.id,
                    courierId: a.courierId,
                    agencyId: a.agencyId,
                    purpose: a.purpose,
                    reason: a.reason,
                    createdAt: a.createdAt,
                    endedAt: a.endedAt,
                    courierName: names.get(a.courierId) ?? "Livreur",
                })),
            legs: p.legs.map((l) => ({
                id: l.id,
                originAgencyId: l.originAgencyId,
                destinationAgencyId: l.destinationAgencyId,
                ...(!shop
                    ? {
                        transporterId: l.transporterId,
                        transporterName: names.get(l.transporterId),
                    }
                    : {}),
                status: l.status,
                version: l.version,
                isReturn: l.isReturn,
                dispatchedAt: l.dispatchedAt,
                receivedAt: l.receivedAt,
                receivedAgencyId: l.receivedAgencyId,
                returnedToOrigin: l.returnedToOrigin,
                condition: l.condition,
                notes: shop ? null : l.notes,
                originName: agencyNames.get(l.originAgencyId) ?? "Agence",
                destinationName: agencyNames.get(l.destinationAgencyId) ?? "Agence",
            })),
            handovers: shop
                ? []
                : p.handovers.map((h) => ({
                    id: h.id,
                    deliveryId: h.deliveryId,
                    fromCourierId: h.fromCourierId,
                    targetCourierId: h.targetCourierId,
                    status: h.status,
                    reason: h.reason,
                    condition: h.condition,
                    createdAt: h.createdAt,
                    confirmedAt: h.confirmedAt,
                    version: h.version,
                    targetName: names.get(h.targetCourierId),
                })),
            attempts: p.attempts.map((a) => ({
                id: a.id,
                result: a.result,
                reason: a.reason,
                notes: shop ? null : a.notes,
                createdAt: a.createdAt,
                ...(!shop ? { courierId: a.courierId } : {}),
            })),
            incidents: p.incidents.map((i) => ({
                id: i.id,
                kind: i.kind,
                description: shop ? "Incident logistique signalé." : i.description,
                status: i.status,
                blocking: i.blocking,
                decision: i.decision,
                resolutionReason: shop ? null : i.resolutionReason,
                createdAt: i.createdAt,
                resolvedAt: i.resolvedAt,
                version: i.version,
            })),
            parcelReturn: p.parcelReturn
                ? {
                    id: p.parcelReturn.id,
                    agencyId: p.parcelReturn.agencyId,
                    status: p.parcelReturn.status,
                    reason: shop ? "Retour du colis" : p.parcelReturn.reason,
                    condition: p.parcelReturn.condition,
                    receivedAt: p.parcelReturn.receivedAt,
                    reintegratedAt: p.parcelReturn.reintegratedAt,
                    returnedToShopAt: p.parcelReturn.returnedToShopAt,
                    createdAt: p.parcelReturn.createdAt,
                }
                : null,
            permissions: auth.permissions,
            kind: auth.kind,
        };
    }
    async detail(c, id) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            return this.dto(tx, c, await this.find(tx, c, id, auth.kind), auth);
        });
    }
    async byOrder(c, orderId) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c), p = await tx.delivery.findFirst({
                where: { ...scope(c, auth.kind), orderId },
                include: missionInclude,
            });
            return p ? this.dto(tx, c, p, auth) : null;
        });
    }
    async list(c, q) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            if ((c.companyId && q.companyId && c.companyId !== q.companyId) ||
                (auth.kind === "driver" && q.courierId && q.courierId !== c.actorId) ||
                (c.scope === "AGENCY" && q.agencyId && q.agencyId !== c.agencyId))
                throw stockError("SCOPE_DENIED", "Filtre non autorisé.", 403);
            const where = {
                ...scope(c, auth.kind, q.history === "true"),
                ...(q.companyId ? { companyId: q.companyId } : {}),
                ...(q.agencyId ? { agencyId: q.agencyId } : {}),
                ...(q.courierId ? { courierId: q.courierId } : {}),
                ...(q.status ? { status: q.status } : {}),
                ...(q.phase ? { phase: q.phase } : {}),
                ...(q.incident
                    ? {
                        incidents: {
                            some: q.incident === "open" ? { status: "OPEN" } : {},
                        },
                    }
                    : {}),
                ...(q.returns ? { parcelReturn: { isNot: null } } : {}),
                ...(q.transfers ? { legs: { some: {} } } : {}),
                ...(q.q
                    ? {
                        AND: [
                            {
                                OR: [
                                    { parcelReference: { contains: q.q } },
                                    { order: { publicNumber: { contains: q.q } } },
                                    ...(auth.kind === "driver" && q.history === "true"
                                        ? []
                                        : [{ order: { recipientName: { contains: q.q } } }]),
                                ],
                            },
                        ],
                    }
                    : {}),
                ...(q.from || q.to
                    ? {
                        createdAt: {
                            ...(q.from ? { gte: new Date(q.from) } : {}),
                            ...(q.to
                                ? { lt: new Date(new Date(q.to).getTime() + 86400000) }
                                : {}),
                        },
                    }
                    : {}),
            };
            const [rows, total, waiting, active, failures, returns] = await Promise.all([
                tx.delivery.findMany({
                    where,
                    include: missionInclude,
                    skip: (q.page - 1) * q.size,
                    take: q.size,
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                }),
                tx.delivery.count({ where }),
                tx.delivery.count({
                    where: {
                        ...scope(c, auth.kind),
                        status: { in: ["PENDING", "ASSIGNED"] },
                    },
                }),
                tx.delivery.count({
                    where: { ...scope(c, auth.kind), status: "IN_PROGRESS" },
                }),
                tx.delivery.count({
                    where: { ...scope(c, auth.kind), phase: "FAILED" },
                }),
                tx.delivery.count({
                    where: {
                        ...scope(c, auth.kind),
                        phase: {
                            in: ["RETURN_REQUESTED", "RETURNING", "RETURN_ARRIVED"],
                        },
                    },
                }),
            ]);
            const items = auth.kind === "driver" && q.history === "true"
                ? rows.map((p) => ({
                    id: p.id,
                    parcelReference: p.parcelReference,
                    publicNumber: p.order.publicNumber,
                    status: p.status,
                    phase: p.phase,
                    createdAt: p.createdAt,
                    assignments: p.deliveryAssignment_deliveryRecords
                        .filter((a) => a.courierId === c.actorId && a.agencyId === c.agencyId)
                        .map((a) => ({
                        createdAt: a.createdAt,
                        endedAt: a.endedAt,
                        purpose: a.purpose,
                    })),
                }))
                : await Promise.all(rows.map((p) => this.dto(tx, c, p, auth)));
            return {
                items,
                total,
                page: q.page,
                size: q.size,
                summary: { waiting, active, failures, returns },
            };
        });
    }
    async history(c, id, q) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            await this.find(tx, c, id, auth.kind);
            const where = { deliveryId: id, companyId: c.companyId };
            const [rows, total] = await Promise.all([
                tx.deliveryEvent.findMany({
                    where,
                    include: { actor: { select: { fullName: true } } },
                    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
                    skip: (q.page - 1) * q.size,
                    take: q.size,
                }),
                tx.deliveryEvent.count({ where }),
            ]);
            return {
                items: rows.map((e) => ({
                    id: e.id,
                    action: e.action,
                    status: e.status,
                    previousStatus: e.previousStatus,
                    fromPhase: e.fromPhase,
                    toPhase: e.toPhase,
                    createdAt: e.createdAt,
                    agencyId: e.agencyId,
                    ...(auth.kind !== "shop"
                        ? {
                            actor: e.actor,
                            reason: e.reason,
                            notes: e.notes,
                            fromCustody: e.fromCustody,
                            toCustody: e.toCustody,
                            metadata: e.metadata,
                        }
                        : {}),
                })),
                total,
                page: q.page,
                size: q.size,
            };
        });
    }
    async queue(c, q) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            if (auth.kind !== "operator")
                throw stockError("PERMISSION_DENIED", "Dispatching réservé aux opérateurs.", 403);
            const where = {
                companyId: c.companyId,
                ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
                isDraft: false,
                status: "PENDING",
                delivery_orderRecords: { none: {} },
                ...(q.q
                    ? {
                        OR: [
                            { publicNumber: { contains: q.q } },
                            { recipientName: { contains: q.q } },
                        ],
                    }
                    : {}),
            };
            const [items, total] = await Promise.all([
                tx.order.findMany({
                    where,
                    select: {
                        id: true,
                        publicNumber: true,
                        version: true,
                        type: true,
                        agencyId: true,
                        shopId: true,
                        recipientName: true,
                        recipientAddress: true,
                        recipientCity: true,
                        pickup: true,
                        parcelDescription: true,
                        agency: { select: { id: true, name: true } },
                        collaboration: { select: { shop: { select: { name: true } } } },
                    },
                    skip: (q.page - 1) * q.size,
                    take: q.size,
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                }),
                tx.order.count({ where }),
            ]);
            return { items, total, page: q.page, size: q.size };
        });
    }
    async eligible(c, agencyId) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            if (auth.kind !== "operator")
                throw stockError("PERMISSION_DENIED", "Opération réservée au dispatching.", 403);
            agencyAllowed(c, agencyId);
            if (!(await tx.agency.findFirst({
                where: {
                    id: agencyId,
                    companyId: c.companyId,
                    status: "ACTIVE",
                    archivedAt: null,
                },
            })))
                throw stockError("AGENCY_DENIED", "Agence non autorisée.", 403);
            const members = await tx.agencyMembership.findMany({
                where: {
                    companyId: c.companyId,
                    agencyId,
                    active: true,
                    role: { code: "courier" },
                    membership: {
                        active: true,
                        organizationRole: "courier",
                        user: { status: "ACTIVE", archivedAt: null },
                    },
                },
                include: {
                    membership: {
                        include: { user: { select: { id: true, fullName: true } } },
                    },
                },
            });
            return Promise.all(members.map(async (m) => {
                const profile = await tx.driverProfile.findUnique({
                    where: {
                        companyId_userId: { companyId: c.companyId, userId: m.userId },
                    },
                }), activeMissions = await tx.deliveryAssignment.count({
                    where: {
                        companyId: c.companyId,
                        courierId: m.userId,
                        endedAt: null,
                    },
                });
                return {
                    id: m.userId,
                    fullName: m.membership.user.fullName,
                    availability: profile?.availability ?? "UNAVAILABLE",
                    status: profile?.status ?? "INACTIVE",
                    activeMissions,
                    eligible: profile?.status === "ACTIVE" &&
                        profile.availability === "AVAILABLE",
                };
            }));
        });
    }
    async options(c) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            const ids = auth.kind === "shop"
                ? (await tx.companyShop.findMany({
                    where: {
                        shopId: c.shopId,
                        ...(c.companyId ? { companyId: c.companyId } : {}),
                    },
                    select: { companyId: true },
                })).map((p) => p.companyId)
                : [c.companyId];
            const [agencies, companies] = await Promise.all([
                tx.agency.findMany({
                    where: {
                        companyId: { in: ids },
                        status: "ACTIVE",
                        archivedAt: null,
                        ...(c.scope === "AGENCY" ? { id: c.agencyId } : {}),
                    },
                    select: { id: true, name: true, companyId: true },
                    orderBy: { name: "asc" },
                }),
                tx.company.findMany({
                    where: { id: { in: ids } },
                    select: { id: true, name: true },
                }),
            ]);
            const destinationAgencies = await tx.agency.findMany({
                where: { companyId: { in: ids }, status: "ACTIVE", archivedAt: null },
                select: { id: true, name: true, companyId: true },
                orderBy: { name: "asc" },
            });
            return { agencies, companies, destinationAgencies };
        });
    }
    async handovers(c) {
        return this.db.$transaction(async (tx) => {
            const auth = await access(tx, c);
            if (auth.kind !== "driver")
                return [];
            const rows = await tx.parcelHandover.findMany({
                where: {
                    companyId: c.companyId,
                    agencyId: c.agencyId,
                    targetCourierId: c.actorId,
                    status: "PENDING",
                },
                include: {
                    delivery: {
                        select: {
                            parcelReference: true,
                            version: true,
                            order: { select: { publicNumber: true } },
                            agency: { select: { name: true } },
                        },
                    },
                },
                orderBy: { createdAt: "asc" },
            });
            return Promise.all(rows.map(async (h) => ({
                id: h.id,
                deliveryId: h.deliveryId,
                version: h.version,
                deliveryVersion: h.delivery.version,
                reason: h.reason,
                createdAt: h.createdAt,
                parcelReference: h.delivery.parcelReference,
                publicNumber: h.delivery.order.publicNumber,
                fromName: (await tx.user.findUniqueOrThrow({
                    where: { id: h.fromCourierId },
                    select: { fullName: true },
                })).fullName,
                agencyName: h.delivery.agency.name,
            })));
        });
    }
}
