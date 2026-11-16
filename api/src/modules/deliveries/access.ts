import type { Prisma } from "../../generated/prisma/client.js";
import type { StockContext } from "../stocks/access.js";
import {
  authorizeTenant,
  authorizeShop,
} from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { stockError } from "../stocks/access.js";
import { assertSafeClosure } from "../subscriptions/access.js";
export type Context = StockContext;
export type Kind = "operator" | "driver" | "shop";
export const selection = (c: Context) => ({
  userId: c.actorId,
  companyId: c.companyId!,
  ...(c.scope === "AGENCY" ? { agencyId: c.agencyId! } : {}),
});
export async function access(
  tx: Prisma.TransactionClient,
  c: Context,
): Promise<{ kind: Kind; permissions: string[] }> {
  const store = authorizationStore(tx);
  if (c.scope === "SHOP") {
    if (!c.shopId)
      throw stockError("CONTEXT_REQUIRED", "Choisissez une boutique.", 403);
    await authorizeShop(store, c.actorId, c.shopId, "shop.deliveries.read");
    return {
      kind: "shop",
      permissions: [
        ...(await store.shopGrant(c.actorId, c.shopId))!.permissions,
      ],
    };
  }
  if (
    !c.companyId ||
    !["COMPANY", "AGENCY"].includes(c.scope) ||
    (c.scope === "AGENCY" && !c.agencyId)
  )
    throw stockError(
      "CONTEXT_REQUIRED",
      "Choisissez une entreprise ou agence.",
      403,
    );
  const company = await store.companyGrant(c.actorId, c.companyId),
    agency = c.agencyId
      ? await store.agencyGrant(c.actorId, c.companyId, c.agencyId)
      : null;
  const permissions = [
    ...new Set([
      ...(company?.active && company.scope === "COMPANY"
        ? company.permissions
        : []),
      ...(c.scope === "AGENCY" && agency?.active && agency.scope === "AGENCY"
        ? agency.permissions
        : []),
    ]),
  ];
  const kind: Kind = permissions.includes("deliveries.supervise.read")
    ? "operator"
    : "driver";
  await authorizeTenant(
    store,
    selection(c),
    kind === "operator" ? "deliveries.supervise.read" : "deliveries.self.read",
  );
  return { kind, permissions };
}
export function scope(
  c: Context,
  kind: Kind,
  history = false,
): Prisma.DeliveryWhereInput {
  if (kind === "shop")
    return {
      order: { shopId: c.shopId },
      ...(c.companyId ? { companyId: c.companyId } : {}),
    };
  if (kind === "driver")
    return {
      companyId: c.companyId,
      ...(history
        ? {
            deliveryAssignment_deliveryRecords: {
              some: {
                courierId: c.actorId,
                agencyId: c.agencyId,
                endedAt: { not: null },
              },
            },
          }
        : { courierId: c.actorId, agencyId: c.agencyId }),
    };
  return {
    companyId: c.companyId,
    ...(c.scope === "AGENCY"
      ? {
          OR: [
            { agencyId: c.agencyId },
            { order: { agencyId: c.agencyId } },
            {
              legs: {
                some: {
                  status: { in: ["IN_TRANSIT", "RECEIVED"] },
                  OR: [
                    { originAgencyId: c.agencyId },
                    { destinationAgencyId: c.agencyId },
                  ],
                },
              },
            },
            {
              parcelReturn: {
                agencyId: c.agencyId,
                status: { in: ["REQUESTED", "IN_TRANSIT"] },
              },
            },
          ],
        }
      : {}),
  };
}
export function agencyAllowed(c: Context, id: string) {
  if (c.scope === "SHOP" || (c.scope === "AGENCY" && c.agencyId !== id))
    throw stockError(
      "AGENCY_DENIED",
      "Cette action relève d’une autre agence.",
      403,
    );
}
export function expectPhase(p: { phase: string | null }, allowed: string[]) {
  if (!p.phase || !allowed.includes(p.phase))
    throw stockError(
      "DELIVERY_TRANSITION_DENIED",
      "Cette action n’est pas disponible à cette étape.",
    );
}
export async function permission(
  tx: Prisma.TransactionClient,
  c: Context,
  required: string,
  deliveryId?: string,
  safe = false,
) {
  const value = await access(tx, c);
  if (value.kind === "shop" || !value.permissions.includes(required))
    throw stockError(
      "PERMISSION_DENIED",
      "Cette opération n’est pas autorisée.",
      403,
    );
  if (!(await authorizationStore(tx).subscriptionValid(c.companyId!))) {
    if (!safe || !deliveryId)
      throw stockError(
        "SUBSCRIPTION_REQUIRED",
        "Abonnement expiré : nouvelle opération bloquée.",
        403,
      );
    await assertSafeClosure(tx, selection(c), deliveryId, "DELIVERY_CLOSE");
  }
  return value;
}
