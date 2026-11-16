import type { Prisma } from "../../generated/prisma/client.js";
import {
  authorizeShop,
  authorizeTenant,
} from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { stockError, type StockContext } from "../stocks/access.js";
export type OrderContext = StockContext;
export async function access(
  tx: Prisma.TransactionClient,
  c: OrderContext,
  permission = "read",
  write = false,
  companyId = c.companyId,
) {
  const store = authorizationStore(tx);
  if (c.scope === "SHOP") {
    if (!c.shopId)
      throw stockError("SHOP_DENIED", "Choisissez une boutique.", 403);
    await authorizeShop(
      store,
      c.actorId,
      c.shopId,
      "shop.orders." + permission,
    );
    if (c.companyId && companyId && c.companyId !== companyId)
      throw stockError("COMPANY_DENIED", "Agence de livraison non autorisée.", 403);
    if (write && !companyId)
      throw stockError("CONTEXT_REQUIRED", "Choisissez l’agence de livraison.", 403);
    if (write) {
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${companyId!} FOR UPDATE`;
      if (
        !(await store.companyActive(companyId!)) ||
        !(await store.subscriptionValid(companyId!))
      )
        throw stockError(
          "SUBSCRIPTION_REQUIRED",
          "Entreprise inactive ou abonnement expiré.",
          403,
        );
    }
  } else {
    if (
      !c.companyId ||
      (c.scope === "AGENCY" && !c.agencyId) ||
      (companyId && companyId !== c.companyId)
    )
      throw stockError("COMPANY_DENIED", "Contexte non autorisé.", 403);
    if (write)
      await tx.$queryRaw`SELECT id FROM Company WHERE id=${c.companyId} FOR UPDATE`;
    await authorizeTenant(
      store,
      {
        userId: c.actorId,
        companyId: c.companyId,
        ...(c.scope === "AGENCY" ? { agencyId: c.agencyId! } : {}),
      },
      "orders." + permission,
    );
  }
}
export function scope(c: OrderContext): Prisma.OrderWhereInput {
  return c.scope === "SHOP"
    ? { shopId: c.shopId, ...(c.companyId ? { companyId: c.companyId } : {}) }
    : {
        companyId: c.companyId,
        ...(c.scope === "AGENCY" ? { agencyId: c.agencyId } : {}),
      };
}
