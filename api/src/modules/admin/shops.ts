import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AuthError } from "../auth/errors.js";
import type { ListQuery } from "./validation.js";

const shopSelect = {
  id: true,
  reference: true,
  name: true,
  legalName: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  countryCode: true,
  status: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShopSelect;

export async function listShops(db: PrismaClient, query: ListQuery) {
  const where: Prisma.ShopWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.country ? { countryCode: query.country } : {}),
    ...(query.city ? { city: { contains: query.city } } : {}),
    ...(query.q
      ? {
          OR: ["name", "reference", "email", "legalName"].map((field) => ({
            [field]: { contains: query.q },
          })),
        }
      : {}),
  };
  const direction = query.sort === "oldest" ? "asc" : "desc";
  const [total, items] = await db.$transaction(
    [
      db.shop.count({ where }),
      db.shop.findMany({
        where,
        select: shopSelect,
        orderBy: [{ createdAt: direction }, { id: direction }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function shopDetail(db: PrismaClient, id: string) {
  const shop = await db.shop.findUnique({ where: { id }, select: shopSelect });
  if (!shop)
    throw new AuthError(404, "SHOP_NOT_FOUND", "Boutique introuvable.");
  const [owners, collaborations, history] = await Promise.all([
    db.shopMembership.findMany({
      where: { shopId: id, role: { code: "shop_owner" } },
      select: {
        active: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    }),
    db.companyShop.findMany({
      where: { shopId: id },
      select: {
        id: true,
        status: true,
        company: { select: { id: true, name: true, reference: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.auditLog.findMany({
      where: { entityType: "Shop", entityId: id },
      select: {
        id: true,
        action: true,
        createdAt: true,
        metadata: true,
        actor: { select: { fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
  ]);
  return { shop, owners, collaborations, history };
}

/** Called only inside AdminService.write: global authorization and serializable transaction. */
export async function changeShopStatus(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  input: {
    version: number;
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";
    reason: string;
  },
) {
  await tx.$queryRaw`SELECT id FROM Shop WHERE id = ${id} FOR UPDATE`;
  const shop = await tx.shop.findUnique({ where: { id }, select: shopSelect });
  if (!shop)
    throw new AuthError(404, "SHOP_NOT_FOUND", "Boutique introuvable.");
  if (shop.version !== input.version)
    throw new AuthError(
      409,
      "VERSION_CONFLICT",
      "La boutique a changé. Rechargez sa fiche.",
    );
  if (shop.archivedAt || shop.status === "ARCHIVED")
    throw new AuthError(
      409,
      "SHOP_ARCHIVED",
      "Cette boutique a été supprimée et archivée.",
    );
  if (shop.status === input.status)
    throw new AuthError(
      409,
      "STATUS_UNCHANGED",
      "Ce statut est déjà appliqué.",
    );
  const now = new Date();
  const updated = await tx.shop.update({
    where: { id },
    data: {
      status: input.status,
      version: { increment: 1 },
      ...(input.status === "ARCHIVED" ? { archivedAt: now } : {}),
    },
    select: shopSelect,
  });
  if (input.status === "ARCHIVED")
    await tx.shopInvitation.updateMany({
      where: { shopId: id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  await tx.auditLog.create({
    data: {
      actorId,
      entityType: "Shop",
      entityId: id,
      action:
        input.status === "ARCHIVED"
          ? "PLATFORM_SHOP_ARCHIVED"
          : "PLATFORM_SHOP_STATUS_CHANGED",
      metadata: {
        name: shop.name,
        reference: shop.reference,
        from: shop.status,
        to: input.status,
        reason: input.reason,
        previousVersion: shop.version,
      },
    },
  });
  return { shop: updated };
}
