import type { Prisma } from "../../generated/prisma/client.js";
import { units, amount, sum, positive } from "./money.js";
export const collectionInclude = {
  delivery: {
    include: {
      order: {
        select: {
          id: true,
          publicNumber: true,
          shopId: true,
          companyId: true,
          agencyId: true,
          collectionRequired: true,
          amountToCollect: true,
          currency: true,
          status: true,
          collaboration: { select: { shop: { select: { name: true } } } },
        },
      },
    },
  },
  courier: {
    select: {
      membership: { select: { user: { select: { fullName: true } } } },
    },
  },
  remittanceItem_collectionRecords: { include: { remittance: true } },
} as const;
export type Entry = Prisma.CollectionGetPayload<{
  include: typeof collectionInclude;
}>;
export async function ledger(tx: Prisma.TransactionClient, rows: Entry[]) {
  const ids = rows.map((x) => x.id),
    itemIds = rows.flatMap((x) =>
      x.remittanceItem_collectionRecords.map((i) => i.id),
    );
  const corrections = ids.length
    ? await tx.financialCorrection.findMany({
        where: {
          companyId: { in: [...new Set(rows.map((r) => r.companyId))] },
          OR: [
            { collectionId: { in: ids } },
            { remittanceItemId: { in: itemIds } },
          ],
        },
      })
    : [];
  return rows.map((p) => {
    const approved = corrections.filter(
      (x) => x.status === "APPROVED" && x.collectionId === p.id,
    );
    const legacy = !p.operationKey;
    const gross = legacy
      ? 0n
      : units(p.declaredAmount ?? "0") +
        sum(
          approved
            .filter((x) => x.kind === "COLLECTION")
            .map((x) => units(x.toAmount) - units(x.fromAmount)),
        );
    const courierRefunded = sum(
      approved.filter((x) => x.kind === "REFUND").map((x) => units(x.toAmount)),
    );
    const agencyRefunded = sum(
        approved
          .filter((x) => x.kind === "AGENCY_REFUND")
          .map((x) => units(x.toAmount)),
      ),
      refunded = courierRefunded + agencyRefunded;
    const items = p.remittanceItem_collectionRecords.map((i) => {
      const r = i.remittance,
        active = !!r.operationKey && r.status === "DECLARED" && !r.confirmedAt;
      const received =
        !!r.operationKey &&
        !!r.confirmedAt &&
        ["CONFIRM", "DISPUTE"].includes(r.decision ?? "");
      const actual =
        (received ? units(i.confirmedAmount ?? "0") : 0n) +
        sum(
          corrections
            .filter(
              (x) =>
                x.kind === "RECEIPT" &&
                x.status === "APPROVED" &&
                x.remittanceItemId === i.id,
            )
            .map((x) => units(x.toAmount) - units(x.fromAmount)),
        );
      return {
        id: i.id,
        remittanceId: r.id,
        reference: r.reference,
        status: r.status,
        decision: r.decision,
        declared: amount(units(i.amount ?? "0")),
        confirmed: amount(actual),
        reserved: amount(active ? units(i.amount ?? "0") : 0n),
        received,
      };
    });
    const confirmed = sum(items.map((i) => units(i.confirmed))),
      reserved = sum(items.map((i) => units(i.reserved))),
      net = gross - refunded,
      liability = gross - courierRefunded - confirmed,
      available = liability - reserved;
    const blocked = corrections.some(
      (x) =>
        x.status === "PENDING" &&
        (x.collectionId === p.id ||
          items.some((i) => i.id === x.remittanceItemId)),
    );
    return {
      id: p.id,
      reference: p.reference,
      deliveryId: p.deliveryId,
      orderId: p.delivery.order.id,
      publicNumber: p.delivery.order.publicNumber,
      shopId: p.delivery.order.shopId,
      shopName: p.delivery.order.collaboration.shop.name,
      companyId: p.companyId,
      agencyId: p.agencyId,
      courierId: p.courierId,
      courierName: p.courier.membership.user.fullName,
      currency: p.currency,
      version: p.version,
      method: p.method,
      notes: p.notes,
      declaredAt: p.declaredAt,
      expectedSnapshot: p.expectedAmount.toFixed(4),
      declaredAmount: p.declaredAmount?.toFixed(4) ?? null,
      gross: amount(gross),
      refunded: amount(refunded),
      courierRefunded: amount(courierRefunded),
      agencyRefunded: amount(agencyRefunded),
      agencyRetained: amount(confirmed - agencyRefunded),
      net: amount(net),
      confirmed: amount(confirmed),
      reserved: amount(reserved),
      liability: amount(liability),
      available: amount(available),
      blocked,
      legacy,
      items,
    };
  });
}
export type LedgerEntry = Awaited<ReturnType<typeof ledger>>[number];
export function totals(rows: LedgerEntry[]) {
  return [...new Set(rows.map((r) => r.currency))].sort().map((currency) => {
    const group = rows.filter((r) => r.currency === currency),
      total = (
        key:
          | "gross"
          | "refunded"
          | "courierRefunded"
          | "agencyRefunded"
          | "agencyRetained"
          | "net"
          | "confirmed"
          | "reserved"
          | "liability"
          | "available",
      ) => amount(sum(group.map((r) => units(r[key]))));
    return {
      currency,
      gross: total("gross"),
      refunded: total("refunded"),
      courierRefunded: total("courierRefunded"),
      agencyRefunded: total("agencyRefunded"),
      agencyRetained: total("agencyRetained"),
      net: total("net"),
      confirmed: total("confirmed"),
      reserved: total("reserved"),
      liability: total("liability"),
      available: total("available"),
      unreconciled: group.filter((r) => r.legacy).length,
    };
  });
}
export function obligation(
  expected: bigint,
  net: bigint,
  hasDeclarations: boolean,
  refunded = 0n,
  disputed = false,
) {
  return {
    expected: amount(expected),
    declared: amount(net),
    remaining: amount(positive(expected - net)),
    excess: amount(positive(net - expected)),
    disputed,
    state:
      expected === 0n
        ? "NOT_REQUIRED"
        : !hasDeclarations
          ? "PENDING"
          : refunded > 0n && net === 0n
            ? "REFUNDED"
            : net === 0n
              ? "NONE_RECEIVED"
              : net < expected
                ? "PARTIAL"
                : net === expected
                  ? "DECLARED_COMPLETE"
                  : "EXCESS",
  };
}
