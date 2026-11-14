import type {
  Prisma,
  PrismaClient,
  FinancialEvent,
} from "../../generated/prisma/client.js";
import { access, filters, type Context, type Kind } from "./access.js";
import {
  collectionInclude,
  ledger,
  totals,
  obligation,
  type LedgerEntry,
} from "./ledger.js";
import { amount, units, sum } from "./money.js";
import { stockError } from "../stocks/access.js";
import type { Query } from "./validation.js";
import { remittanceStatus, correctionStatus } from "./validation.js";
export const paginate = <T>(items: T[], q: Query) => ({
  items: items.slice((q.page - 1) * q.size, q.page * q.size),
  total: items.length,
  page: q.page,
  size: q.size,
});
const publicActions = ["COLLECTION_DECLARED", "CORRECTION_APPROVED"];
export const remittanceInclude = {
  confirmer: { select: { user: { select: { fullName: true } } } },
  remittanceItem_remittanceRecords: {
    include: { collection: { include: collectionInclude } },
  },
  courier: {
    select: {
      membership: { select: { user: { select: { fullName: true } } } },
    },
  },
} as const;
export class FinancialReads {
  constructor(readonly db: PrismaClient) {}
  collectionScope(c: Context, kind: Kind, q: Query) {
    return {
      ...filters(c, q, kind),
      ...(kind === "shop" || q.shopId || q.orderId
        ? {
            delivery: {
              order: {
                ...(kind === "shop"
                  ? { shopId: c.shopId }
                  : q.shopId
                    ? { shopId: q.shopId }
                    : {}),
                ...(q.orderId ? { id: q.orderId } : {}),
              },
            },
          }
        : {}),
    };
  }
  async entries(
    tx: Prisma.TransactionClient,
    c: Context,
    kind: Kind,
    q: Query,
  ) {
    const rows = await tx.collection.findMany({
      where: this.collectionScope(c, kind, q),
      include: collectionInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return ledger(tx, rows);
  }
  shopEntry(x: LedgerEntry) {
    return {
      id: x.id,
      reference: x.reference,
      deliveryId: x.deliveryId,
      orderId: x.orderId,
      publicNumber: x.publicNumber,
      companyId: x.companyId,
      currency: x.currency,
      declaredAt: x.declaredAt,
      expectedSnapshot: x.expectedSnapshot,
      declaredAmount: x.declaredAmount,
      gross: x.gross,
      refunded: x.refunded,
      net: x.net,
      legacy: x.legacy,
    };
  }
  async collections(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c),
        rows = await this.entries(tx, c, auth.kind, q),
        items = rows
          .filter(
            (r) =>
              q.status !== "AVAILABLE" ||
              (!r.legacy && !r.blocked && units(r.available) > 0n),
          )
          .filter(
            (r) =>
              !q.q ||
              `${r.reference} ${r.publicNumber} ${r.courierName}`
                .toLowerCase()
                .includes(q.q.toLowerCase()),
          );
      return {
        ...paginate(
          auth.kind === "shop" ? items.map((r) => this.shopEntry(r)) : items,
          q,
        ),
        kind: auth.kind,
      };
    });
  }
  async findCollection(
    tx: Prisma.TransactionClient,
    c: Context,
    id: string,
    kind?: Kind,
  ) {
    const auth = kind ?? (await access(tx, c)).kind;
    const p = await tx.collection.findFirst({
      where: { ...this.collectionScope(c, auth, { page: 1, size: 20 }), id },
      include: collectionInclude,
    });
    if (!p)
      throw stockError(
        "COLLECTION_NOT_FOUND",
        "Encaissement introuvable.",
        404,
      );
    return p;
  }
  async collection(c: Context, id: string) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c),
        p = await this.findCollection(tx, c, id, auth.kind),
        entry = (await ledger(tx, [p]))[0]!;
      const events = await tx.financialEvent.findMany({
        where: {
          companyId: p.companyId,
          collectionId: p.id,
          ...(auth.kind === "shop" ? { action: { in: publicActions } } : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (auth.kind === "shop")
        return {
          kind: "shop" as const,
          entry: this.shopEntry(entry),
          events: events
            .filter(
              (e) =>
                e.action === "COLLECTION_DECLARED" ||
                ["COLLECTION", "REFUND", "AGENCY_REFUND"].includes(
                  String((e.metadata as Prisma.JsonObject | null)?.kind),
                ),
            )
            .map((e) => ({
              id: e.id,
              action: e.action,
              amount: e.amount.toFixed(4),
              currency: e.currency,
              createdAt: e.createdAt,
            })),
        };
      return {
        kind: auth.kind,
        entry,
        events: await this.eventDtos(tx, events),
      };
    });
  }
  async obligationsTx(
    tx: Prisma.TransactionClient,
    c: Context,
    q: Query,
    kind: Kind,
  ) {
    const f = filters(c, q, kind),
      {
        courierId: filterCourier,
        currency: filterCurrency,
        createdAt,
        agencyId: filterAgency,
        ...tenant
      } = f;
    const agencyScope: Prisma.OrderWhereInput =
      filterAgency && kind !== "driver"
        ? {
            OR: [
              { agencyId: filterAgency, delivery_orderRecords: { none: {} } },
              { delivery_orderRecords: { some: { agencyId: filterAgency } } },
            ],
          }
        : {};
    const where: Prisma.OrderWhereInput = {
      ...tenant,
      ...(q.orderId ? { id: q.orderId } : {}),
      ...agencyScope,
      isDraft: false,
      ...(createdAt ? { createdAt } : {}),
      ...(filterCurrency ? { currency: filterCurrency } : {}),
      ...(kind === "shop"
        ? { shopId: c.shopId }
        : q.shopId
          ? { shopId: q.shopId }
          : {}),
      ...(kind === "driver"
        ? {
            delivery_orderRecords: {
              some: { courierId: c.actorId, agencyId: c.agencyId },
            },
          }
        : filterCourier
          ? { delivery_orderRecords: { some: { courierId: filterCourier } } }
          : {}),
      ...(q.q
        ? {
            AND: [
              {
                OR: [
                  { publicNumber: { contains: q.q } },
                  { collaboration: { shop: { name: { contains: q.q } } } },
                ],
              },
            ],
          }
        : {}),
    };
    const orders = await tx.order.findMany({
      where,
      include: {
        company: { select: { name: true } },
        agency: { select: { name: true } },
        collaboration: { select: { shop: { select: { name: true } } } },
        delivery_orderRecords: {
          select: {
            id: true,
            version: true,
            phase: true,
            pickedUpAt: true,
            courierId: true,
            agencyId: true,
            custodyType: true,
            custodyUserId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const missions = orders.flatMap((o) =>
      o.delivery_orderRecords.map((d) => d.id),
    );
    const entries = await ledger(
      tx,
      await tx.collection.findMany({
        where: { deliveryId: { in: missions } },
        include: collectionInclude,
      }),
    );
    const discrepancies = missions.length
      ? await tx.financialDiscrepancy.findMany({
          where: {
            deliveryId: { in: missions },
            status: { in: ["OPEN", "REVIEW"] },
            ...(kind === "shop"
              ? {
                  kind: {
                    in: [
                      "PARTIAL",
                      "ZERO",
                      "OVER_COLLECTION",
                      "INPUT_ERROR",
                      "REFUND",
                      "CONTESTED",
                    ],
                  },
                }
              : {}),
          },
          select: { deliveryId: true },
        })
      : [];
    const exceptions = missions.length
      ? await tx.financialCorrection.findMany({
          where: {
            deliveryId: { in: missions },
            kind: "EXCEPTION",
            status: "APPROVED",
          },
          select: {
            deliveryId: true,
            reason: true,
            createdAt: true,
            fromAmount: true,
            toAmount: true,
          },
        })
      : [];
    return orders
      .map((o) => {
        const mission = o.delivery_orderRecords[0],
          rows = entries.filter((e) => e.orderId === o.id),
          net = sum(rows.map((r) => units(r.net))),
          refunds = sum(rows.map((r) => units(r.refunded)));
        const canDeclare =
          kind === "driver" &&
          !!mission &&
          mission.courierId === c.actorId &&
          mission.custodyUserId === c.actorId &&
          [
            "FINAL_DISTRIBUTION",
            "AT_DESTINATION",
            "AWAITING_PROOF",
            "FAILED",
          ].includes(mission.phase ?? "");
        return {
          id: o.id,
          publicNumber: o.publicNumber,
          companyId: o.companyId,
          companyName: o.company.name,
          agencyId: o.agencyId,
          agencyName: o.agency.name,
          shopId: o.shopId,
          shopName: o.collaboration.shop.name,
          currency: o.currency,
          version: o.version,
          orderStatus: o.status,
          createdAt: o.createdAt,
          collectionRequired: o.collectionRequired,
          ...obligation(
            units(o.amountToCollect),
            net,
            rows.length > 0,
            refunds,
            discrepancies.some((d) => d.deliveryId === mission?.id),
          ),
          gross: amount(sum(rows.map((r) => units(r.gross)))),
          refunded: amount(refunds),
          mission: mission
            ? {
                id: mission.id,
                version: mission.version,
                phase: mission.phase,
                pickedUpAt: mission.pickedUpAt,
                ...(kind !== "shop"
                  ? { courierId: mission.courierId, agencyId: mission.agencyId }
                  : {}),
              }
            : null,
          canDeclare,
          exception: exceptions.some(
            (e) =>
              e.deliveryId === mission?.id &&
              units(e.fromAmount) === units(o.amountToCollect) &&
              units(e.toAmount) === net,
          ),
          legacyEntries: rows.filter((r) => r.legacy).length,
        };
      })
      .filter(
        (o) =>
          !q.status ||
          (q.status === "DISPUTED" ? o.disputed : o.state === q.status),
      );
  }
  async obligations(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      return {
        ...paginate(await this.obligationsTx(tx, c, q, auth.kind), q),
        kind: auth.kind,
        permissions: auth.permissions,
      };
    });
  }
  remitScope(c: Context, kind: Kind, q: Query) {
    if (kind === "shop")
      throw stockError(
        "PERMISSION_DENIED",
        "Les remises internes ne sont pas accessibles aux boutiques.",
        403,
      );
    return filters(c, q, kind);
  }
  async findRemittance(
    tx: Prisma.TransactionClient,
    c: Context,
    id: string,
    kind?: Kind,
  ) {
    const k = kind ?? (await access(tx, c)).kind,
      p = await tx.remittance.findFirst({
        where: { ...this.remitScope(c, k, { page: 1, size: 20 }), id },
        include: remittanceInclude,
      });
    if (!p)
      throw stockError("REMITTANCE_NOT_FOUND", "Remise introuvable.", 404);
    return p;
  }
  async remittances(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c),
        where = this.remitScope(c, auth.kind, q),
        rows = await tx.remittance.findMany({
          where: {
            ...where,
            ...(q.status ? { status: remittanceStatus.parse(q.status) } : {}),
            ...(q.q ? { reference: { contains: q.q } } : {}),
          },
          include: {
            courier: {
              select: {
                membership: {
                  select: { user: { select: { fullName: true } } },
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
      return {
        ...paginate(
          rows.map((r) => ({
            ...r,
            declaredAmount: r.declaredAmount.toFixed(4),
            confirmedAmount: r.confirmedAmount?.toFixed(4) ?? null,
            courierName: r.courier.membership.user.fullName,
            legacy: !r.operationKey,
            operationKey: undefined,
            requestHash: undefined,
          })),
          q,
        ),
        kind: auth.kind,
      };
    });
  }
  async remittance(c: Context, id: string) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      this.remitScope(c, auth.kind, { page: 1, size: 20 });
      const r = await tx.remittance.findFirst({
        where: { ...filters(c, { page: 1, size: 20 }, auth.kind), id },
        include: remittanceInclude,
      });
      if (!r)
        throw stockError("REMITTANCE_NOT_FOUND", "Remise introuvable.", 404);
      const entries = await ledger(
          tx,
          r.remittanceItem_remittanceRecords.map((i) => i.collection),
        ),
        events = await tx.financialEvent.findMany({
          where: { companyId: r.companyId, remittanceId: r.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
      return {
        id: r.id,
        reference: r.reference,
        companyId: r.companyId,
        agencyId: r.agencyId,
        courierId: r.courierId,
        courierName: r.courier.membership.user.fullName,
        version: r.version,
        currency: r.currency,
        status: r.status,
        decision: r.decision,
        decisionReason: r.decisionReason,
        declaredAmount: r.declaredAmount.toFixed(4),
        confirmedAmount: r.confirmedAmount?.toFixed(4) ?? null,
        declaredAt: r.declaredAt,
        confirmedAt: r.confirmedAt,
        confirmedByName: r.confirmer?.user.fullName ?? null,
        effectiveConfirmedAmount: amount(
          sum(
            entries.flatMap((e) =>
              e.items
                .filter((i) => i.remittanceId === r.id)
                .map((i) => units(i.confirmed)),
            ),
          ),
        ),
        notes: r.notes,
        legacy: !r.operationKey,
        canConfirm:
          auth.permissions.includes("remittances.confirm") &&
          r.courierId !== c.actorId &&
          !r.confirmedAt &&
          r.status === "DECLARED" &&
          !!r.operationKey,
        items: r.remittanceItem_remittanceRecords.map((i) => {
          const entry = entries.find((e) => e.id === i.collectionId)!;
          return {
            id: i.id,
            collectionId: i.collectionId,
            publicNumber: i.collection.delivery.order.publicNumber,
            reference: i.collection.reference,
            declaredAmount: i.amount?.toFixed(4) ?? null,
            confirmedAmount: i.confirmedAmount?.toFixed(4) ?? null,
            effectiveConfirmed:
              entry.items.find((x) => x.id === i.id)?.confirmed ?? "0.0000",
          };
        }),
        events: await this.eventDtos(tx, events),
        permissions: auth.permissions,
      };
    });
  }
  eventDto(e: FinancialEvent) {
    return {
      ...e,
      amount: e.amount.toFixed(4),
      operationKey: undefined,
      requestHash: undefined,
    };
  }
  async eventDtos(tx: Prisma.TransactionClient, events: FinancialEvent[]) {
    const users = await tx.user.findMany({
        where: { id: { in: [...new Set(events.map((e) => e.actorId))] } },
        select: { id: true, fullName: true },
      }),
      names = new Map(users.map((u) => [u.id, u.fullName]));
    return events.map((e) => ({
      ...this.eventDto(e),
      actorName: names.get(e.actorId) ?? "Compte conservé",
    }));
  }
  async overview(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      q = { ...q, q: undefined, status: undefined };
      const auth = await access(tx, c),
        entries = await this.entries(tx, c, auth.kind, q),
        orders = await this.obligationsTx(tx, c, q, auth.kind);
      const groups = totals(entries),
        currencies = [
          ...new Set([
            ...groups.map((g) => g.currency),
            ...orders.map((o) => o.currency),
          ]),
        ];
      const money = currencies.sort().map((currency) => {
        const o = orders.filter((x) => x.currency === currency),
          g = groups.find((x) => x.currency === currency);
        return {
          expected: amount(sum(o.map((x) => units(x.expected)))),
          remaining: amount(sum(o.map((x) => units(x.remaining)))),
          ...(g ?? {
            currency,
            gross: "0.0000",
            refunded: "0.0000",
            courierRefunded: "0.0000",
            agencyRefunded: "0.0000",
            agencyRetained: "0.0000",
            net: "0.0000",
            confirmed: "0.0000",
            reserved: "0.0000",
            liability: "0.0000",
            available: "0.0000",
            unreconciled: 0,
          }),
        };
      });
      if (auth.kind === "shop")
        return {
          kind: auth.kind,
          permissions: auth.permissions,
          money: money.map((m) => ({
            currency: m.currency,
            expected: m.expected,
            net: m.net,
            remaining: m.remaining,
            refunded: m.refunded,
          })),
          balances: [],
          pendingRemittances: 0,
          openDiscrepancies: 0,
        };
      const groupKeys = [
          ...new Set(entries.map((e) => `${e.agencyId}:${e.courierId}`)),
        ],
        balances = groupKeys.flatMap((key) => {
          const rows = entries.filter(
            (e) => `${e.agencyId}:${e.courierId}` === key,
          );
          return totals(rows).map((t) => ({
            ...t,
            agencyId: rows[0]!.agencyId,
            courierId: rows[0]!.courierId,
            courierName: rows[0]!.courierName,
          }));
        });
      const scope = filters(c, q, auth.kind),
        pendingRemittances = await tx.remittance.count({
          where: {
            ...scope,
            status: "DECLARED",
            confirmedAt: null,
            ...(q.orderId
              ? {
                  remittanceItem_remittanceRecords: {
                    some: { collection: { delivery: { orderId: q.orderId } } },
                  },
                }
              : {}),
          },
        }),
        openDiscrepancies = await tx.financialDiscrepancy.count({
          where: {
            ...scope,
            status: { in: ["OPEN", "REVIEW"] },
            ...(q.orderId
              ? {
                  OR: [
                    {
                      deliveryId: {
                        in: orders.flatMap((o) =>
                          o.mission ? [o.mission.id] : [],
                        ),
                      },
                    },
                    { collectionId: { in: entries.map((e) => e.id) } },
                    {
                      remittanceId: {
                        in: entries.flatMap((e) =>
                          e.items.map((i) => i.remittanceId),
                        ),
                      },
                    },
                  ],
                }
              : {}),
          },
        });
      return {
        kind: auth.kind,
        permissions: auth.permissions,
        money,
        balances,
        pendingRemittances,
        openDiscrepancies,
      };
    });
  }
  async corrections(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      this.remitScope(c, auth.kind, q);
      const rows = await tx.financialCorrection.findMany({
        where: {
          ...filters(c, q, auth.kind),
          ...(q.status ? { status: correctionStatus.parse(q.status) } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return {
        ...paginate(
          rows.map((r) => ({
            ...r,
            fromAmount: r.fromAmount.toFixed(4),
            toAmount: r.toAmount.toFixed(4),
            canDecide:
              auth.permissions.includes("financial.corrections.approve") &&
              r.requestedById !== c.actorId &&
              r.courierId !== c.actorId &&
              r.status === "PENDING",
          })),
          q,
        ),
        permissions: auth.permissions,
      };
    });
  }
  async discrepancies(c: Context, q: Query, id?: string) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      this.remitScope(c, auth.kind, q);
      const rows = await tx.financialDiscrepancy.findMany({
        where: {
          ...filters(c, q, auth.kind),
          ...(id ? { id } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.q ? { reference: { contains: q.q } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (id && !rows.length)
        throw stockError("DISCREPANCY_NOT_FOUND", "Écart introuvable.", 404);
      return {
        ...paginate(
          rows.map((r) => ({
            ...r,
            amount: r.amount.toFixed(4),
            canResolve:
              auth.permissions.includes("financial.discrepancies.manage") &&
              r.status !== "CLOSED",
          })),
          q,
        ),
        permissions: auth.permissions,
      };
    });
  }
  async history(c: Context, q: Query) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      this.remitScope(c, auth.kind, q);
      const where = filters(c, q, auth.kind),
        [rows, total] = await Promise.all([
          tx.financialEvent.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (q.page - 1) * q.size,
            take: q.size,
          }),
          tx.financialEvent.count({ where }),
        ]);
      return {
        items: await this.eventDtos(tx, rows),
        total,
        page: q.page,
        size: q.size,
      };
    });
  }
  async options(c: Context) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      const agencies =
        auth.kind === "shop"
          ? []
          : await tx.agency.findMany({
              where: {
                companyId: c.companyId,
                ...(c.scope === "AGENCY" ? { id: c.agencyId } : {}),
              },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            });
      const companies =
        auth.kind === "shop"
          ? await tx.company.findMany({
              where: {
                companyShop_companyRecords: { some: { shopId: c.shopId } },
                ...(c.companyId ? { id: c.companyId } : {}),
              },
              select: { id: true, name: true },
            })
          : [];
      return {
        agencies,
        companies,
        kind: auth.kind,
        permissions: auth.permissions,
      };
    });
  }
  async notifications(c: Context) {
    return this.db.$transaction(async (tx) => {
      const auth = await access(tx, c);
      if (auth.kind === "shop") return [];
      const notices = await tx.notification.findMany({
        where: {
          recipientUserId: c.actorId,
          companyId: c.companyId,
          sourceEvent: { startsWith: "FINANCE_" },
          channel: "PUSH",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          sourceId: true,
          sourceEvent: true,
          payload: true,
          createdAt: true,
          status: true,
        },
      });
      const events = await tx.financialEvent.findMany({
          where: {
            id: { in: notices.map((n) => n.sourceId) },
            companyId: c.companyId,
            ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
            ...(auth.kind === "driver" ? { courierId: c.actorId } : {}),
          },
          select: { id: true },
        }),
        allowed = new Set(events.map((e) => e.id));
      return notices
        .filter((n) => allowed.has(n.sourceId))
        .slice(0, 30)
        .map(({ id, sourceEvent, payload, createdAt, status }) => ({
          id,
          sourceEvent,
          payload,
          createdAt,
          status,
        }));
    });
  }
}
