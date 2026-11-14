import { Prisma as ClientPrisma } from "../../generated/prisma/client.js";
import { serializable } from "../../database/transaction.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { authorizeShop, authorizeTenant, } from "../authorization/tenant-access.js";
import { AuthError } from "../auth/errors.js";
const fail = (code, message, status = 403) => new AuthError(status, code, message);
const select = {
    id: true,
    shopId: true,
    name: true,
    sku: true,
    description: true,
    category: true,
    unit: true,
    active: true,
    archivedAt: true,
    version: true,
    imageKey: true,
    createdAt: true,
    updatedAt: true,
    shop: { select: { id: true, reference: true, name: true } },
};
export class ProductService {
    db;
    constructor(db) {
        this.db = db;
    }
    async transaction(work) {
        try {
            return await serializable(this.db, work);
        }
        catch (e) {
            if (e instanceof ClientPrisma.PrismaClientKnownRequestError &&
                e.code === "P2002")
                throw fail("SKU_EXISTS", "Cette référence SKU est déjà utilisée dans votre boutique.", 409);
            throw e;
        }
    }
    async authorize(tx, c, write = false) {
        if (c.scope === "SHOP" && c.shopId) {
            if (write)
                await tx.$queryRaw `SELECT id FROM Shop WHERE id=${c.shopId} FOR UPDATE`;
            await authorizeShop(authorizationStore(tx), c.actorId, c.shopId, write ? "shop.products.manage" : "shop.products.read");
        }
        else if (!write &&
            c.companyId &&
            ["COMPANY", "AGENCY"].includes(c.scope)) {
            await authorizeTenant(authorizationStore(tx), {
                userId: c.actorId,
                companyId: c.companyId,
                ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
            }, "stocks.read");
        }
        else
            throw fail("CATALOG_FORBIDDEN", "Seule une boutique autorisée peut gérer son catalogue.");
    }
    async scope(tx, c) {
        if (c.scope === "SHOP")
            return { shopId: c.shopId };
        const links = await tx.companyShop.findMany({
            where: {
                companyId: c.companyId,
                status: "ACTIVE",
                shop: { status: "ACTIVE", archivedAt: null },
            },
            select: { shopId: true, allowedAgencyIds: true },
        });
        const allowed = links
            .filter((p) => c.scope !== "AGENCY" ||
            (Array.isArray(p.allowedAgencyIds) &&
                p.allowedAgencyIds.includes(c.agencyId)))
            .map((p) => p.shopId);
        return {
            OR: [
                { shopId: { in: allowed } },
                {
                    stock_productRecords: {
                        some: {
                            companyId: c.companyId,
                            ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
                        },
                    },
                },
            ],
        };
    }
    dto(p) {
        const { imageKey, ...rest } = p;
        return { ...rest, imageUrl: imageKey ? `/products/${p.id}/image` : null };
    }
    async list(c, q) {
        await this.authorize(this.db, c);
        if (c.scope === "SHOP" && q.shopId && q.shopId !== c.shopId)
            throw fail("CATALOG_FORBIDDEN", "Cette boutique n’est pas accessible.");
        const where = {
            AND: [
                await this.scope(this.db, c),
                ...(q.shopId ? [{ shopId: q.shopId }] : []),
                ...(q.status === "ACTIVE"
                    ? [{ active: true, archivedAt: null }]
                    : q.status === "ARCHIVED"
                        ? [{ OR: [{ active: false }, { archivedAt: { not: null } }] }]
                        : []),
                ...(q.q
                    ? [
                        {
                            OR: [
                                { name: { contains: q.q } },
                                { sku: { contains: q.q } },
                                { category: { contains: q.q } },
                            ],
                        },
                    ]
                    : []),
            ],
        };
        const [items, total] = await Promise.all([
            this.db.product.findMany({
                where,
                select,
                orderBy: [{ name: "asc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
            this.db.product.count({ where }),
        ]);
        return {
            items: items.map((p) => this.dto(p)),
            total,
            page: q.page,
            size: q.size,
        };
    }
    async find(tx, c, id) {
        const p = await tx.product.findFirst({
            where: { AND: [{ id }, await this.scope(tx, c)] },
            select,
        });
        if (!p)
            throw fail("PRODUCT_NOT_FOUND", "Produit introuvable dans cet environnement.", 404);
        return p;
    }
    async detail(c, id) {
        await this.authorize(this.db, c);
        return this.dto(await this.find(this.db, c, id));
    }
    audit(tx, c, id, action, metadata) {
        return tx.auditLog.create({
            data: {
                actorId: c.actorId,
                companyId: null,
                entityType: "Product",
                entityId: id,
                action,
                metadata: { ...metadata, shopId: c.shopId },
            },
        });
    }
    async create(c, input) {
        const id = await this.transaction(async (tx) => {
            await this.authorize(tx, c, true);
            const p = await tx.product.create({
                data: {
                    ...input,
                    shopId: c.shopId,
                    archivedAt: input.active ? null : new Date(),
                },
            });
            await this.audit(tx, c, p.id, "PRODUCT_CREATED", {
                name: p.name,
                sku: p.sku,
                unit: p.unit,
                active: p.active,
            });
            return p.id;
        });
        return this.detail(c, id);
    }
    async update(c, id, input) {
        await this.transaction(async (tx) => {
            await this.authorize(tx, c, true);
            const old = await this.find(tx, c, id);
            const next = {
                name: input.name ?? old.name,
                unit: input.unit ?? old.unit,
                active: input.active ?? old.active,
                sku: input.sku === undefined ? old.sku : input.sku,
                description: input.description === undefined ? old.description : input.description,
                category: input.category === undefined ? old.category : input.category,
            };
            if (old.version !== input.version)
                throw fail("VERSION_CONFLICT", "Ce produit a changé. Rechargez sa fiche.", 409);
            if (old.unit !== next.unit &&
                ((await tx.stockMovement.count({
                    where: { stock: { productId: id, shopId: c.shopId } },
                })) > 0 ||
                    (await tx.orderItem.count({
                        where: { productId: id, shopId: c.shopId },
                    })) > 0))
                throw fail("PRODUCT_UNIT_LOCKED", "L’unité d’un produit ayant un historique ne peut pas être modifiée. Créez un autre produit pour une unité différente.", 409);
            const { version, ...data } = input;
            void version;
            await tx.product.update({
                where: { id },
                data: {
                    ...next,
                    archivedAt: next.active ? null : (old.archivedAt ?? new Date()),
                    version: { increment: 1 },
                },
            });
            await this.audit(tx, c, id, next.active ? "PRODUCT_UPDATED" : "PRODUCT_ARCHIVED", {
                before: {
                    name: old.name,
                    sku: old.sku,
                    unit: old.unit,
                    active: old.active,
                },
                after: {
                    name: next.name,
                    sku: next.sku,
                    unit: next.unit,
                    active: next.active,
                },
                fields: Object.keys(data),
            });
        });
        return this.detail(c, id);
    }
    async setImage(c, id, n, key) {
        await this.transaction(async (tx) => {
            await this.authorize(tx, c, true);
            const p = await this.find(tx, c, id);
            if (p.version !== n)
                throw fail("VERSION_CONFLICT", "Ce produit a changé. Rechargez sa fiche.", 409);
            await tx.product.update({
                where: { id },
                data: { imageKey: key, version: { increment: 1 } },
            });
            await this.audit(tx, c, id, "PRODUCT_IMAGE_UPDATED", {});
        });
        return this.detail(c, id);
    }
    async imageKey(c, id) {
        await this.authorize(this.db, c);
        return (await this.find(this.db, c, id)).imageKey;
    }
}
