import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { z } from "zod";
import * as v from "./validation.js";
import { scopeStock, stockError, type StockContext } from "./access.js";
const productSelect = {
  id: true,
  name: true,
  sku: true,
  unit: true,
  active: true,
} as const;
export const balanceInclude = {
  company: { select: { id: true, name: true } },
  agency: { select: { id: true, reference: true, name: true } },
  product: { select: productSelect },
  collaboration: {
    select: { shop: { select: { id: true, reference: true, name: true } } },
  },
} as const;
export class StockReads {
  constructor(readonly db: PrismaClient) {}
  async fields(c: StockContext, q: z.infer<typeof v.query>) {
    const s = await scopeStock(this.db, c, q);
    return {
      companyId: s.companyId as string | { in: string[] },
      agencyId: s.agencyId as string | undefined,
      shopId: s.shopId as string | undefined,
    };
  }
  async product(id: string) {
    return this.db.product.findUniqueOrThrow({
      where: { id },
      select: productSelect,
    });
  }
  async actor(id: string | null) {
    return id
      ? this.db.user.findUnique({
          where: { id },
          select: { id: true, fullName: true },
        })
      : null;
  }
  async stockDto(
    p: Prisma.StockGetPayload<{ include: typeof balanceInclude }>,
  ) {
    const sums = await this.db.transferItem.aggregate({
      where: {
        companyId: p.companyId,
        shopId: p.shopId,
        productId: p.productId,
        transfer: { originAgencyId: p.agencyId, status: "IN_TRANSIT" },
      },
      _sum: {
        quantity: true,
        receivedQuantity: true,
        lostQuantity: true,
        returnedQuantity: true,
      },
    });
    const { collaboration, ...data } = p;
    return {
      ...data,
      shop: collaboration.shop,
      availableQuantity: p.physicalQuantity - p.reservedQuantity,
      inTransitQuantity:
        (sums._sum.quantity ?? 0) -
        (sums._sum.receivedQuantity ?? 0) -
        (sums._sum.lostQuantity ?? 0) -
        (sums._sum.returnedQuantity ?? 0),
    };
  }
  async balances(c: StockContext, q: z.infer<typeof v.query>, alerts = false) {
    const where = await scopeStock(this.db, c, q);
    let filtered: Prisma.StockWhereInput = where;
    if (alerts || q.low === "true" || q.status) {
      const rows = await this.db.stock.findMany({
        where,
        select: {
          id: true,
          physicalQuantity: true,
          reservedQuantity: true,
          alertThreshold: true,
        },
      });
      const ids = rows
        .filter((s) => {
          const available = s.physicalQuantity - s.reservedQuantity;
          if ((alerts || q.low === "true") && available > s.alertThreshold)
            return false;
          return q.status === "LOW"
            ? available <= s.alertThreshold
            : q.status === "OUT_OF_STOCK"
              ? available === 0
              : q.status === "AVAILABLE"
                ? available > 0
                : true;
        })
        .map((s) => s.id);
      filtered = { ...where, id: { in: ids } };
    }
    const [rows, total] = await Promise.all([
      this.db.stock.findMany({
        where: filtered,
        include: balanceInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.stock.count({ where: filtered }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.stockDto(p))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async stock(c: StockContext, id: string) {
    const where = await scopeStock(this.db, c);
    const p = await this.db.stock.findFirst({
      where: { ...where, id },
      include: balanceInclude,
    });
    if (!p) throw stockError("STOCK_NOT_FOUND", "Stock introuvable.", 404);
    return this.stockDto(p);
  }
  async movementReference(m: {
    operationKey: string;
    reservationId: string | null;
    transferId: string | null;
  }) {
    if (m.reservationId) {
      const p = await this.db.stockReservation.findUnique({
        where: { id: m.reservationId },
        select: { reference: true, idempotencyKey: true },
      });
      return p?.reference ?? p?.idempotencyKey ?? "Réservation";
    }
    if (m.transferId)
      return (
        (
          await this.db.transfer.findUnique({
            where: { id: m.transferId },
            select: { reference: true },
          })
        )?.reference ?? "Transfert"
      );
    const [kind, id] = m.operationKey.split(":");
    if (id && kind === "deposit")
      return (
        (
          await this.db.stockDeposit.findUnique({
            where: { id },
            select: { reference: true },
          })
        )?.reference ?? "Dépôt"
      );
    if (id && kind === "withdrawal")
      return (
        (
          await this.db.stockWithdrawal.findUnique({
            where: { id },
            select: { reference: true },
          })
        )?.reference ?? "Sortie"
      );
    if (id && kind === "inventory")
      return (
        (
          await this.db.inventorySession.findUnique({
            where: { id },
            select: { reference: true },
          })
        )?.reference ?? "Inventaire"
      );
    return m.operationKey;
  }
  async movements(c: StockContext, q: z.infer<typeof v.query>) {
    const stock = await scopeStock(this.db, c, q);
    const where = { stock };
    const [rows, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          stock: { include: balanceInclude },
          actor: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.stockMovement.count({ where }),
    ]);
    return {
      items: await Promise.all(
        rows.map(async (m) => ({
          ...m,
          reference: await this.movementReference(m),
          quantity: Math.abs(m.physicalDelta || m.reservedDelta),
          physicalBefore: m.physicalAfter - m.physicalDelta,
          reservedBefore: m.reservedAfter - m.reservedDelta,
          stock: await this.stockDto(m.stock),
        })),
      ),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async transferWhere(
    c: StockContext,
    q: z.infer<typeof v.query>,
  ): Promise<Prisma.TransferWhereInput> {
    const f = await this.fields(c, q);
    return {
      companyId: f.companyId,
      ...(q.q ? { reference: { contains: q.q } } : {}),
      ...(f.agencyId
        ? {
            OR: [
              { originAgencyId: f.agencyId },
              { destinationAgencyId: f.agencyId },
            ],
          }
        : {}),
      ...(f.shopId || q.productId
        ? {
            transferItem_transferRecords: {
              some: {
                ...(f.shopId ? { shopId: f.shopId } : {}),
                ...(q.productId ? { productId: q.productId } : {}),
              },
            },
          }
        : {}),
      ...(q.status
        ? { status: q.status as Prisma.EnumTransferStatusFilter["equals"] }
        : {}),
    };
  }
  async summary(c: StockContext, q: z.infer<typeof v.query>) {
    const where = await scopeStock(this.db, c, q),
      f = await this.fields(c, q);
    const transfers = await this.transferWhere(c, { ...q, status: undefined });
    // Physical and transit totals must describe the same committed database snapshot.
    return this.db.$transaction(
      async (tx) => {
        const [s, rows, transit, transferCount, inventory] = await Promise.all([
          tx.stock.aggregate({
            where,
            _sum: { physicalQuantity: true, reservedQuantity: true },
          }),
          tx.stock.findMany({
            where,
            select: {
              physicalQuantity: true,
              reservedQuantity: true,
              alertThreshold: true,
            },
          }),
          tx.transferItem.aggregate({
            where: {
              companyId: f.companyId,
              ...(f.shopId ? { shopId: f.shopId } : {}),
              ...(q.productId ? { productId: q.productId } : {}),
              transfer: {
                status: "IN_TRANSIT",
                ...(f.agencyId
                  ? {
                      OR: [
                        { originAgencyId: f.agencyId },
                        { destinationAgencyId: f.agencyId },
                      ],
                    }
                  : {}),
              },
            },
            _sum: {
              quantity: true,
              receivedQuantity: true,
              lostQuantity: true,
              returnedQuantity: true,
            },
          }),
          tx.transfer.count({
            where: {
              ...transfers,
              status: "IN_TRANSIT",
            },
          }),
          tx.inventoryItem.findMany({
            where: {
              companyId: f.companyId,
              ...(f.shopId ? { shopId: f.shopId } : {}),
              ...(q.productId ? { productId: q.productId } : {}),
              inventory: {
                status: { in: ["DRAFT", "SUBMITTED"] },
                ...(f.agencyId ? { agencyId: f.agencyId } : {}),
              },
            },
            select: { expectedPhysical: true, countedQuantity: true },
          }),
        ]);
        const physicalQuantity = s._sum.physicalQuantity ?? 0,
          reservedQuantity = s._sum.reservedQuantity ?? 0;
        return {
          physicalQuantity,
          reservedQuantity,
          availableQuantity: physicalQuantity - reservedQuantity,
          inTransitQuantity:
            (transit._sum.quantity ?? 0) -
            (transit._sum.receivedQuantity ?? 0) -
            (transit._sum.lostQuantity ?? 0) -
            (transit._sum.returnedQuantity ?? 0),
          lowStockCount: rows.filter(
            (s) => s.physicalQuantity - s.reservedQuantity <= s.alertThreshold,
          ).length,
          transferCount,
          inventoryVarianceCount: inventory.filter(
            (x) =>
              x.countedQuantity !== null &&
              x.countedQuantity !== x.expectedPhysical,
          ).length,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async options(c: StockContext) {
    const q = v.query.parse({ size: 50 });
    const f = await this.fields(c, q);
    const peers = await this.db.companyShop.findMany({
      where: {
        companyId: f.companyId,
        ...(c.scope === "SHOP" ? { shopId: c.shopId } : {}),
      },
      select: {
        company: { select: { id: true, name: true } },
        shop: { select: { id: true, reference: true, name: true } },
        status: true,
        allowedAgencyIds: true,
      },
    });
    const companies = [
      ...new Map(peers.map((p) => [p.company.id, p.company])).values(),
    ];
    let agencies;
    if (c.scope === "SHOP") {
      const stocks = await this.db.stock.findMany({
        where: { shopId: c.shopId, companyId: f.companyId },
        select: { agencyId: true },
        distinct: ["agencyId"],
      });
      agencies = await this.db.agency.findMany({
        where: { id: { in: stocks.map((s) => s.agencyId) } },
        select: { id: true, companyId: true, reference: true, name: true },
      });
    } else
      agencies = await this.db.agency.findMany({
        where: {
          companyId: c.companyId,
          status: "ACTIVE",
          archivedAt: null,
          ...(c.scope === "AGENCY" ? { id: c.agencyId } : {}),
        },
        select: { id: true, companyId: true, reference: true, name: true },
      });
    const destinationAgencies =
      c.scope === "SHOP"
        ? []
        : await this.db.agency.findMany({
            where: {
              companyId: c.companyId,
              status: "ACTIVE",
              archivedAt: null,
            },
            select: { id: true, companyId: true, reference: true, name: true },
          });
    return {
      companies,
      agencies,
      destinationAgencies,
      shops: [
        ...new Map(
          peers.map((p) => [
            p.shop.id,
            {
              ...p.shop,
              collaborationStatus: p.status,
              allowedAgencyIds: p.allowedAgencyIds,
            },
          ]),
        ).values(),
      ],
    };
  }
  async deposits(c: StockContext, q: z.infer<typeof v.query>) {
    const f = await this.fields(c, q);
    const where: Prisma.StockDepositWhereInput = {
      ...f,
      ...(q.status ? { status: q.status } : {}),
      ...(q.productId ? { items: { some: { productId: q.productId } } } : {}),
      ...(q.q ? { reference: { contains: q.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.stockDeposit.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.stockDeposit.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.deposit(c, p.id))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async deposit(c: StockContext, id: string) {
    const f = await this.fields(c, v.query.parse({}));
    const p = await this.db.stockDeposit.findFirst({
      where: { ...f, id },
      include: { items: true },
    });
    if (!p) throw stockError("DEPOSIT_NOT_FOUND", "Dépôt introuvable.", 404);
    const [agency, shop, actor, items] = await Promise.all([
      this.db.agency.findUniqueOrThrow({
        where: { id: p.agencyId },
        select: { id: true, name: true, reference: true },
      }),
      this.db.shop.findUniqueOrThrow({
        where: { id: p.shopId },
        select: { id: true, name: true, reference: true },
      }),
      this.actor(p.actorId),
      Promise.all(
        p.items.map(async (i) => ({
          ...i,
          product: await this.product(i.productId),
        })),
      ),
    ]);
    return { ...p, agency, shop, actor, items };
  }
  async reservations(c: StockContext, q: z.infer<typeof v.query>) {
    const stock = await scopeStock(this.db, c, q);
    const where: Prisma.StockReservationWhereInput = {
      stock,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { reference: { contains: q.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.stockReservation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.stockReservation.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.reservation(c, p.id))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async reservation(c: StockContext, id: string) {
    const stock = await scopeStock(this.db, c);
    const p = await this.db.stockReservation.findFirst({
      where: { id, stock },
      include: { stock: { include: balanceInclude } },
    });
    if (!p)
      throw stockError(
        "RESERVATION_NOT_FOUND",
        "Réservation introuvable.",
        404,
      );
    return {
      ...p,
      status: p.consumedAt ? "CONSUMED" : p.releasedAt ? "RELEASED" : "ACTIVE",
      reference: p.reference ?? p.idempotencyKey,
      stock: await this.stockDto(p.stock),
      product: p.stock.product,
      agency: p.stock.agency,
      shop: p.stock.collaboration.shop,
    };
  }
  async withdrawals(c: StockContext, q: z.infer<typeof v.query>) {
    const f = await this.fields(c, q);
    const where = { ...f, ...(q.q ? { reference: { contains: q.q } } : {}) };
    const [rows, total] = await Promise.all([
      this.db.stockWithdrawal.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.stockWithdrawal.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.withdrawal(c, p.id))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async withdrawal(c: StockContext, id: string) {
    const f = await this.fields(c, v.query.parse({}));
    const p = await this.db.stockWithdrawal.findFirst({ where: { ...f, id } });
    if (!p)
      throw stockError("WITHDRAWAL_NOT_FOUND", "Sortie introuvable.", 404);
    const stock = await this.stock(c, p.stockId);
    return {
      ...p,
      status: "CONFIRMED",
      stock,
      product: stock.product,
      agency: stock.agency,
      shop: stock.shop,
      actor: await this.actor(p.actorId),
    };
  }
  async transfers(c: StockContext, q: z.infer<typeof v.query>) {
    const where = await this.transferWhere(c, q);
    const [rows, total] = await Promise.all([
      this.db.transfer.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.transfer.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.transfer(c, p.id))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async transfer(c: StockContext, id: string) {
    const where = await this.transferWhere(c, v.query.parse({}));
    const p = await this.db.transfer.findFirst({
      where: { ...where, id },
      include: {
        origin: { select: { id: true, name: true, reference: true } },
        destination: { select: { id: true, name: true, reference: true } },
        transferItem_transferRecords: {
          where: c.scope === "SHOP" ? { shopId: c.shopId } : {},
          include: { product: { select: productSelect } },
        },
        transferEvent_transferRecords: {
          include: {
            actor: {
              select: { user: { select: { id: true, fullName: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!p)
      throw stockError("TRANSFER_NOT_FOUND", "Transfert introuvable.", 404);
    const incidents = await this.db.transferIncident.findMany({
      where: {
        companyId: p.companyId,
        transferId: id,
        ...(c.scope === "SHOP" ? { shopId: c.shopId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    const {
      origin,
      destination,
      transferItem_transferRecords,
      transferEvent_transferRecords,
      ...rest
    } = p;
    return {
      ...rest,
      originAgency: origin,
      destinationAgency: destination,
      actor: await this.actor(p.initiatedById),
      items: transferItem_transferRecords.map((i) => ({
        ...i,
        inTransitQuantity:
          p.status === "IN_TRANSIT"
            ? i.quantity -
              i.receivedQuantity -
              i.lostQuantity -
              i.returnedQuantity
            : 0,
      })),
      incidents: await Promise.all(
        incidents.map(async (i) => ({
          ...i,
          actor: await this.actor(i.actorId),
          resolver: await this.actor(i.resolvedById),
        })),
      ),
      events: transferEvent_transferRecords.map((e) => ({
        ...e,
        actor: e.actor.user,
      })),
    };
  }
  async inventories(c: StockContext, q: z.infer<typeof v.query>) {
    const f = await this.fields(c, q);
    const where: Prisma.InventorySessionWhereInput = {
      ...f,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { reference: { contains: q.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.inventorySession.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.db.inventorySession.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((p) => this.inventory(c, p.id))),
      total,
      page: q.page,
      size: q.size,
    };
  }
  async inventory(c: StockContext, id: string) {
    const f = await this.fields(c, v.query.parse({}));
    const p = await this.db.inventorySession.findFirst({
      where: { ...f, id },
      include: { items: true },
    });
    if (!p)
      throw stockError("INVENTORY_NOT_FOUND", "Inventaire introuvable.", 404);
    return {
      ...p,
      agency: await this.db.agency.findUniqueOrThrow({
        where: { id: p.agencyId },
        select: { id: true, name: true, reference: true },
      }),
      actor: await this.actor(p.actorId),
      items: await Promise.all(
        p.items
          .filter((i) => c.scope !== "SHOP" || i.shopId === c.shopId)
          .map(async (i) => ({
            ...i,
            variance:
              i.countedQuantity === null
                ? null
                : i.countedQuantity - i.expectedPhysical,
            product: await this.product(i.productId),
            stock: await this.stock(c, i.stockId),
          })),
      ),
    };
  }
}
