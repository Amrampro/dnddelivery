import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { StockService } from "../stocks/service.js";
import { agencyWrite, collaborationAgency, checkVersion, stockError, } from "../stocks/access.js";
import { access, scope } from "./access.js";
import * as v from "./validation.js";
const include = {
    company: { select: { id: true, name: true } },
    agency: { select: { id: true, name: true } },
    collaboration: { select: { shop: { select: { id: true, name: true } } } },
    creator: { select: { id: true, fullName: true } },
    orderItem_orderRecords: {
        where: { active: true },
        include: { stockReservation_orderItemRecords: true },
    },
};
const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]))
        : value;
const hash = (value) => createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export class OrderService {
    db;
    stock;
    constructor(db) {
        this.db = db;
        this.stock = new StockService(db);
    }
    transaction(work) {
        return this.stock.transaction(work);
    }
    async target(tx, c, x, permission, active = true) {
        await access(tx, c, permission, true, x.companyId);
        if (c.scope === "SHOP" && x.shopId !== c.shopId)
            throw stockError("SHOP_DENIED", "Boutique non autorisée.", 403);
        await agencyWrite(tx, { ...c, companyId: x.companyId }, x.agencyId);
        await collaborationAgency(tx, x.companyId, x.shopId, [x.agencyId], active);
    }
    async find(tx, c, id) {
        await access(tx, c);
        const p = await tx.order.findFirst({ where: { ...scope(c), id }, include });
        if (!p)
            throw stockError("ORDER_NOT_FOUND", "Commande introuvable.", 404);
        return p;
    }
    detail(c, id) {
        return this.transaction(async (tx) => ({
            ...(await this.find(tx, c, id)),
            clientKey: undefined,
            requestHash: undefined,
        }));
    }
    async list(c, q) {
        return this.transaction(async (tx) => {
            await access(tx, c);
            if ((c.companyId && q.companyId && q.companyId !== c.companyId) ||
                (c.scope === "SHOP" && q.shopId && q.shopId !== c.shopId) ||
                (c.scope === "AGENCY" && q.agencyId && q.agencyId !== c.agencyId))
                throw stockError("SCOPE_DENIED", "Filtre non autorisé.", 403);
            const where = {
                ...scope(c),
                ...(q.companyId ? { companyId: q.companyId } : {}),
                ...(q.shopId ? { shopId: q.shopId } : {}),
                ...(q.agencyId ? { agencyId: q.agencyId } : {}),
                ...(q.status ? { status: q.status } : {}),
                ...(q.type ? { type: q.type } : {}),
                ...(q.draft ? { isDraft: q.draft === "true" } : {}),
                ...(q.collectionRequired
                    ? { collectionRequired: q.collectionRequired === "true" }
                    : {}),
                ...(q.q
                    ? {
                        OR: [
                            { publicNumber: { contains: q.q } },
                            { recipientName: { contains: q.q } },
                            { recipientEmail: { contains: q.q } },
                            { recipientPhone: { contains: q.q } },
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
            const dir = q.sort === "oldest" ? "asc" : "desc";
            const [items, total, drafts, pending, cancelled] = await Promise.all([
                tx.order.findMany({
                    where,
                    include,
                    skip: (q.page - 1) * q.size,
                    take: q.size,
                    orderBy: [{ createdAt: dir }, { id: dir }],
                }),
                tx.order.count({ where }),
                tx.order.count({
                    where: { ...scope(c), isDraft: true, status: "PENDING" },
                }),
                tx.order.count({
                    where: { ...scope(c), isDraft: false, status: "PENDING" },
                }),
                tx.order.count({ where: { ...scope(c), status: "CANCELLED" } }),
            ]);
            return {
                items: items.map((p) => ({
                    ...p,
                    clientKey: undefined,
                    requestHash: undefined,
                })),
                total,
                page: q.page,
                size: q.size,
                summary: { drafts, pending, cancelled },
            };
        });
    }
    async history(c, id) {
        return this.transaction(async (tx) => {
            await this.find(tx, c, id);
            return tx.orderEvent.findMany({
                where: { orderId: id },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                include: { actor: { select: { fullName: true } } },
            });
        });
    }
    async event(tx, c, p, action, previousStatus, metadata = {}) {
        await tx.orderEvent.create({
            data: {
                companyId: p.companyId,
                orderId: p.id,
                actorId: c.actorId,
                status: p.status,
                previousStatus,
                action,
                metadata,
            },
        });
        await tx.auditLog.create({
            data: {
                companyId: p.companyId,
                agencyId: p.agencyId,
                actorId: c.actorId,
                entityType: "Order",
                entityId: p.id,
                action: "ORDER_" + action,
                metadata: { shopId: p.shopId, ...metadata },
            },
        });
    }
    snapshot(x) {
        const r = x.recipient;
        return {
            recipientName: r.name,
            recipientEmail: r.email,
            recipientPhone: r.phone,
            recipientAddress: r.address,
            recipientCity: r.city,
            recipientCountry: r.country,
            recipientLatitude: r.latitude ?? null,
            recipientLongitude: r.longitude ?? null,
            recipientDetails: r,
        };
    }
    async customerLookup(c, email) {
        return this.transaction(async (tx) => {
            await access(tx, c, "create");
            const user = await tx.user.findFirst({
                where: {
                    email: email.trim().toLowerCase(),
                    customerEnabled: true,
                    emailVerifiedAt: { not: null },
                    status: "ACTIVE",
                    archivedAt: null,
                },
                select: { fullName: true, email: true, phone: true },
            });
            return { customer: user };
        });
    }
    fields(x) {
        return {
            ...this.snapshot(x),
            agencyId: x.agencyId,
            type: x.type,
            pickup: x.pickup ?? Prisma.DbNull,
            parcelDescription: x.parcelDescription,
            collectionRequired: x.collectionRequired,
            amountToCollect: x.amountToCollect,
            currency: x.currency,
            financialNotes: x.financialNotes ?? null,
            notes: x.notes ?? null,
        };
    }
    async addItems(tx, c, p, x) {
        for (const i of x.items) {
            const product = i.productId
                ? await tx.product.findFirst({
                    where: {
                        id: i.productId,
                        shopId: p.shopId,
                        active: true,
                        archivedAt: null,
                    },
                })
                : null;
            if (i.productId && !product)
                throw stockError("PRODUCT_DENIED", "Produit inactif ou non autorisé.", 403);
            const item = await tx.orderItem.create({
                data: {
                    companyId: p.companyId,
                    shopId: p.shopId,
                    orderId: p.id,
                    productId: i.productId,
                    name: product?.name ?? i.name,
                    sku: product?.sku ?? i.sku,
                    description: i.description ?? product?.description?.slice(0, 1000),
                    instructions: i.instructions,
                    quantity: i.quantity,
                    declaredValue: i.declaredValue,
                },
            });
            if (!p.isDraft && x.type === "FROM_STOCK") {
                const s = await tx.stock.findUnique({
                    where: {
                        companyId_agencyId_shopId_productId: {
                            companyId: p.companyId,
                            agencyId: p.agencyId,
                            shopId: p.shopId,
                            productId: i.productId,
                        },
                    },
                });
                if (!s)
                    throw stockError("STOCK_INSUFFICIENT", "Aucun stock disponible pour ce produit.");
                const r = await tx.stockReservation.create({
                    data: {
                        companyId: p.companyId,
                        shopId: p.shopId,
                        productId: i.productId,
                        stockId: s.id,
                        orderItemId: item.id,
                        quantity: i.quantity,
                        idempotencyKey: `order:${item.id}`,
                    },
                });
                await this.stock.movement(tx, { ...c, companyId: p.companyId }, s.id, "RESERVE", 0, i.quantity, `order:${item.id}`, `Commande ${p.id}`, { reservationId: r.id });
                await this.event(tx, c, { ...p, status: "PENDING" }, "STOCK_RESERVED", undefined, { reservationId: r.id, quantity: i.quantity });
            }
        }
    }
    async release(tx, c, p) {
        const rows = await tx.stockReservation.findMany({
            where: { orderItem: { orderId: p.id }, status: "ACTIVE" },
        });
        for (const r of rows) {
            await this.stock.movement(tx, { ...c, companyId: p.companyId }, r.stockId, "RELEASE", 0, -r.quantity, `order-release:${r.id}`, `Commande ${p.id}`, { reservationId: r.id });
            await tx.stockReservation.update({
                where: { id: r.id },
                data: {
                    status: "RELEASED",
                    releasedAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await this.event(tx, c, p, "STOCK_RELEASED", undefined, {
                reservationId: r.id,
                quantity: r.quantity,
            });
        }
    }
    async create(c, input) {
        const x = v.creation.parse(input), fingerprint = hash(x);
        const id = await this.transaction(async (tx) => {
            await this.target(tx, c, x, "create");
            const old = await tx.order.findUnique({
                where: {
                    companyId_createdById_clientKey: {
                        companyId: x.companyId,
                        createdById: c.actorId,
                        clientKey: x.clientKey,
                    },
                },
            });
            if (old) {
                await this.find(tx, c, old.id);
                if (old.requestHash !== fingerprint)
                    throw stockError("IDEMPOTENCY_MISMATCH", "Cette validation correspond à un autre contenu.");
                return old.id;
            }
            let recipientId = x.recipientId;
            if (recipientId &&
                !(await tx.recipient.findFirst({
                    where: {
                        id: recipientId,
                        companyId: x.companyId,
                        shopId: x.shopId,
                        archivedAt: null,
                    },
                })))
                throw stockError("RECIPIENT_DENIED", "Destinataire non autorisé.", 403);
            if (x.saveRecipient && !recipientId)
                recipientId = (await this.saveRecipient(tx, x)).id;
            const p = await tx.order.create({
                data: {
                    ...this.fields(x),
                    companyId: x.companyId,
                    shopId: x.shopId,
                    createdById: c.actorId,
                    recipientId,
                    publicNumber: `DND-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").toUpperCase()}`,
                    clientKey: x.clientKey,
                    requestHash: fingerprint,
                    isDraft: x.draft,
                    submittedAt: x.draft ? null : new Date(),
                },
            });
            await this.addItems(tx, c, p, x);
            await this.event(tx, c, p, x.draft ? "DRAFT_CREATED" : "SUBMITTED", undefined, {
                type: x.type,
                amountToCollect: x.amountToCollect,
                agencyId: p.agencyId,
            });
            if (!x.draft)
                await this.notify(tx, p);
            return p.id;
        });
        return this.detail(c, id);
    }
    async edit(c, id, input) {
        const x = v.edit.parse(input);
        await this.transaction(async (tx) => {
            await access(tx, c, "edit", true, x.companyId);
            const p = await this.find(tx, c, id);
            checkVersion(p.version, x.version);
            if (p.status !== "PENDING" ||
                (await tx.delivery.count({ where: { orderId: id } })))
                throw stockError("ORDER_LOCKED", "Cette commande ne peut plus être modifiée.");
            if (x.companyId !== p.companyId || x.shopId !== p.shopId)
                throw stockError("OWNER_IMMUTABLE", "Entreprise et boutique ne peuvent pas changer.", 403);
            await this.target(tx, c, x, "edit");
            if (p.isDraft &&
                x.recipientId &&
                !(await tx.recipient.findFirst({
                    where: {
                        id: x.recipientId,
                        companyId: p.companyId,
                        shopId: p.shopId,
                        archivedAt: null,
                    },
                })))
                throw stockError("RECIPIENT_DENIED", "Destinataire non autorisé.", 403);
            if (!p.isDraft && hash(p.recipientDetails) !== hash(x.recipient))
                throw stockError("RECIPIENT_SNAPSHOT_IMMUTABLE", "Les coordonnées soumises sont conservées. Annulez et recréez la commande pour changer le destinataire.");
            const previous = {
                agencyId: p.agencyId,
                type: p.type,
                amountToCollect: p.amountToCollect.toString(),
                currency: p.currency,
                collectionRequired: p.collectionRequired,
                financialNotes: p.financialNotes,
                notes: p.notes,
                pickup: p.pickup,
                parcelDescription: p.parcelDescription,
                recipient: p.recipientDetails,
                items: p.orderItem_orderRecords.map((i) => ({
                    productId: i.productId,
                    name: i.name,
                    quantity: i.quantity,
                    sku: i.sku,
                    description: i.description,
                    instructions: i.instructions,
                    declaredValue: i.declaredValue?.toString() ?? null,
                })),
            };
            const nextItems = x.items.map((i) => ({
                productId: i.productId ?? null,
                name: i.name,
                quantity: i.quantity,
                sku: i.sku ?? null,
                description: i.description ?? null,
                instructions: i.instructions ?? null,
                declaredValue: i.declaredValue
                    ? new Prisma.Decimal(i.declaredValue).toString()
                    : null,
            }));
            const replaceItems = p.agencyId !== x.agencyId ||
                p.type !== x.type ||
                hash(previous.items) !== hash(nextItems);
            if (replaceItems) {
                await this.release(tx, c, p);
                await tx.orderItem.updateMany({
                    where: { orderId: id, active: true },
                    data: { active: false },
                });
            }
            const updated = await tx.order.update({
                where: { id },
                data: {
                    ...this.fields(x),
                    ...(p.recipientEmail !== x.recipient.email
                        ? {
                            customerUserId: p.isDraft
                                ? null
                                : ((await tx.user.findFirst({
                                    where: {
                                        email: x.recipient.email,
                                        customerEnabled: true,
                                        emailVerifiedAt: { not: null },
                                        status: "ACTIVE",
                                        archivedAt: null,
                                    },
                                    select: { id: true },
                                }))?.id ?? null),
                            trackingVersion: { increment: 1 },
                        }
                        : {}),
                    ...(p.isDraft
                        ? {
                            recipientId: x.recipientId ??
                                (x.saveRecipient
                                    ? (await this.saveRecipient(tx, x)).id
                                    : p.recipientId),
                        }
                        : {}),
                    version: { increment: 1 },
                },
            });
            if (replaceItems)
                await this.addItems(tx, c, updated, x);
            await this.event(tx, c, updated, "UPDATED", p.status, {
                previous,
                next: {
                    agencyId: x.agencyId,
                    type: x.type,
                    amountToCollect: x.amountToCollect,
                    currency: x.currency,
                    collectionRequired: x.collectionRequired,
                    financialNotes: x.financialNotes ?? null,
                    notes: x.notes ?? null,
                    pickup: x.pickup ?? null,
                    parcelDescription: x.parcelDescription,
                    recipient: x.recipient,
                    items: x.items.map((i) => ({
                        productId: i.productId ?? null,
                        name: i.name,
                        quantity: i.quantity,
                        sku: i.sku ?? null,
                        description: i.description ?? null,
                        instructions: i.instructions ?? null,
                        declaredValue: i.declaredValue ?? null,
                    })),
                },
            });
        });
        return this.detail(c, id);
    }
    async submit(c, id, input) {
        await this.transaction(async (tx) => {
            const before = await this.find(tx, c, id);
            await access(tx, c, "create", true, before.companyId);
            const p = await this.find(tx, c, id);
            if (!p.isDraft) {
                if (p.submittedAt)
                    return;
                throw stockError("ORDER_LOCKED", "Commande non soumissible.");
            }
            checkVersion(p.version, input.version);
            if (p.status !== "PENDING")
                throw stockError("ORDER_LOCKED", "Brouillon abandonné.");
            await this.target(tx, c, p, "create");
            const x = v.content.parse({
                companyId: p.companyId,
                shopId: p.shopId,
                agencyId: p.agencyId,
                type: p.type,
                recipient: p.recipientDetails,
                items: p.orderItem_orderRecords.map((i) => ({
                    productId: i.productId ?? undefined,
                    name: i.name,
                    sku: i.sku ?? undefined,
                    description: i.description ?? undefined,
                    instructions: i.instructions ?? undefined,
                    quantity: i.quantity,
                    declaredValue: i.declaredValue?.toString(),
                })),
                pickup: p.pickup ?? undefined,
                parcelDescription: p.parcelDescription,
                collectionRequired: p.collectionRequired,
                amountToCollect: p.amountToCollect.toString(),
                currency: p.currency,
                financialNotes: p.financialNotes ?? undefined,
                notes: p.notes ?? undefined,
            });
            await tx.orderItem.updateMany({
                where: { orderId: id, active: true },
                data: { active: false },
            });
            const updated = await tx.order.update({
                where: { id },
                data: {
                    isDraft: false,
                    submittedAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await this.addItems(tx, c, updated, x);
            await this.event(tx, c, updated, "SUBMITTED", p.status);
            await this.notify(tx, updated);
        });
        return this.detail(c, id);
    }
    async cancel(c, id, input) {
        if (!input.reason)
            throw stockError("REASON_REQUIRED", "Indiquez le motif d’annulation.", 400);
        await this.transaction(async (tx) => {
            const before = await this.find(tx, c, id);
            await access(tx, c, "cancel", true, before.companyId);
            const p = await this.find(tx, c, id);
            if (p.status === "CANCELLED" && p.cancellationReason === input.reason)
                return;
            checkVersion(p.version, input.version);
            if (p.status !== "PENDING" ||
                (await tx.delivery.count({ where: { orderId: id } })))
                throw stockError("ORDER_LOCKED", "Annulation préalable indisponible à ce stade.");
            await this.target(tx, c, p, "cancel", false);
            await this.release(tx, c, p);
            const updated = await tx.order.update({
                where: { id },
                data: {
                    status: "CANCELLED",
                    cancellationReason: input.reason,
                    cancelledAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await this.event(tx, c, updated, p.isDraft ? "DRAFT_ABANDONED" : "CANCELLED", p.status, { reason: input.reason });
            if (!p.isDraft)
                await tx.notification.create({
                    data: {
                        companyId: p.companyId,
                        channel: "EMAIL",
                        recipientAddress: p.recipientEmail,
                        sourceEvent: "ORDER_CANCELLED",
                        sourceId: p.id,
                        template: "order_cancelled",
                        payload: { publicNumber: p.publicNumber },
                        dedupeKey: `order:${p.id}:cancelled`,
                        availableAt: new Date(),
                    },
                });
        });
        return this.detail(c, id);
    }
    async saveRecipient(tx, x) {
        const r = x.recipient;
        return tx.recipient.create({
            data: {
                companyId: x.companyId,
                shopId: x.shopId,
                name: r.name,
                email: r.email,
                phone: r.phone,
                address: r.address,
                city: r.city,
                country: r.country,
                latitude: r.latitude,
                longitude: r.longitude,
                details: r,
            },
        });
    }
    async recipients(c, q, id) {
        return this.transaction(async (tx) => {
            await access(tx, c);
            if ((c.companyId && q.companyId && c.companyId !== q.companyId) ||
                (c.scope === "SHOP" && q.shopId && c.shopId !== q.shopId))
                throw stockError("SCOPE_DENIED", "Répertoire non autorisé.", 403);
            const where = {
                archivedAt: null,
                ...(id ? { id } : {}),
                ...(c.scope === "SHOP"
                    ? {
                        shopId: c.shopId,
                        ...(c.companyId ? { companyId: c.companyId } : {}),
                    }
                    : { companyId: c.companyId }),
                ...(q.companyId ? { companyId: q.companyId } : {}),
                ...(q.shopId ? { shopId: q.shopId } : {}),
                ...(c.scope === "AGENCY"
                    ? { order_recipientRecords: { some: { agencyId: c.agencyId } } }
                    : {}),
                ...(q.q
                    ? {
                        OR: [
                            { name: { contains: q.q } },
                            { email: { contains: q.q } },
                            { phone: { contains: q.q } },
                        ],
                    }
                    : {}),
            };
            const [items, total] = await Promise.all([
                tx.recipient.findMany({
                    where,
                    skip: (q.page - 1) * q.size,
                    take: q.size,
                    orderBy: [{ name: "asc" }, { id: "asc" }],
                }),
                tx.recipient.count({ where }),
            ]);
            if (id && !items[0])
                throw stockError("RECIPIENT_NOT_FOUND", "Destinataire introuvable.", 404);
            return { items, total, page: q.page, size: q.size };
        });
    }
    async recipientWrite(c, x, id, version) {
        return this.transaction(async (tx) => {
            await this.target(tx, c, x, "create");
            if (!id)
                return this.saveRecipient(tx, x);
            const found = await tx.recipient.findFirst({
                where: {
                    id,
                    companyId: x.companyId,
                    shopId: x.shopId,
                    ...(c.scope === "AGENCY"
                        ? { order_recipientRecords: { some: { agencyId: c.agencyId } } }
                        : {}),
                },
            });
            if (!found)
                throw stockError("RECIPIENT_NOT_FOUND", "Destinataire introuvable.", 404);
            checkVersion(found.version, version);
            const r = x.recipient;
            return tx.recipient.update({
                where: { id },
                data: {
                    name: r.name,
                    email: r.email,
                    phone: r.phone,
                    address: r.address,
                    city: r.city,
                    country: r.country,
                    latitude: r.latitude ?? null,
                    longitude: r.longitude ?? null,
                    details: r,
                    version: { increment: 1 },
                },
            });
        });
    }
    async options(c) {
        return this.transaction(async (tx) => {
            await access(tx, c);
            const pairs = await tx.companyShop.findMany({
                where: {
                    status: "ACTIVE",
                    shop: { status: "ACTIVE", archivedAt: null },
                    company: { status: "ACTIVE", archivedAt: null },
                    ...(c.scope === "SHOP" ? { shopId: c.shopId } : {}),
                    ...(c.companyId ? { companyId: c.companyId } : {}),
                },
                select: {
                    companyId: true,
                    shopId: true,
                    allowedAgencyIds: true,
                    company: { select: { id: true, name: true } },
                    shop: { select: { id: true, name: true } },
                },
            });
            const agencyIds = pairs.flatMap((p) => Array.isArray(p.allowedAgencyIds)
                ? p.allowedAgencyIds.filter((s) => typeof s === "string")
                : []);
            const agencies = await tx.agency.findMany({
                where: {
                    id: { in: agencyIds },
                    status: "ACTIVE",
                    archivedAt: null,
                    ...(c.scope === "AGENCY" ? { id: c.agencyId } : {}),
                },
                select: { id: true, name: true, companyId: true },
                orderBy: { name: "asc" },
            });
            return {
                pairs: pairs.map((p) => ({
                    ...p,
                    allowedAgencyIds: Array.isArray(p.allowedAgencyIds)
                        ? p.allowedAgencyIds
                        : [],
                })),
                agencies,
            };
        });
    }
    async catalogue(c, x) {
        return this.transaction(async (tx) => {
            await this.target(tx, c, x, "read");
            const where = {
                shopId: x.shopId,
                active: true,
                archivedAt: null,
                ...(x.q
                    ? { OR: [{ name: { contains: x.q } }, { sku: { contains: x.q } }] }
                    : {}),
            };
            const [products, total] = await Promise.all([
                tx.product.findMany({
                    where,
                    skip: (x.page - 1) * x.size,
                    take: x.size,
                    orderBy: [{ name: "asc" }, { id: "asc" }],
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                        unit: true,
                        stock_productRecords: {
                            where: { companyId: x.companyId, agencyId: x.agencyId },
                            select: { physicalQuantity: true, reservedQuantity: true },
                        },
                    },
                }),
                tx.product.count({ where }),
            ]);
            return {
                items: products.map(({ stock_productRecords, ...p }) => ({
                    ...p,
                    availableQuantity: stock_productRecords.reduce((sum, s) => sum + s.physicalQuantity - s.reservedQuantity, 0),
                })),
                total,
                page: x.page,
                size: x.size,
            };
        });
    }
    async notify(tx, p) {
        const customer = await tx.user.findFirst({
            where: {
                email: p.recipientEmail,
                customerEnabled: true,
                emailVerifiedAt: { not: null },
                status: "ACTIVE",
                archivedAt: null,
            },
            select: { id: true },
        });
        if (customer)
            await tx.order.updateMany({
                where: { id: p.id, customerUserId: null, isDraft: false },
                data: { customerUserId: customer.id },
            });
        await tx.notification.create({
            data: {
                companyId: p.companyId,
                channel: "EMAIL",
                recipientAddress: p.recipientEmail,
                sourceEvent: "ORDER_SUBMITTED",
                sourceId: p.id,
                template: "order_registered",
                payload: { publicNumber: p.publicNumber },
                dedupeKey: `order:${p.id}:registered`,
                availableAt: new Date(),
            },
        });
    }
}
