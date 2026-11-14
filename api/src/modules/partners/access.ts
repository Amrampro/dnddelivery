import type { Prisma } from "../../generated/prisma/client.js";
import { AuthError } from "../auth/errors.js";
/** Future order/stock mutations must call this inside their own transaction. */
export async function assertActiveCollaboration(
  tx: Prisma.TransactionClient,
  companyId: string,
  shopId: string,
) {
  const p = await tx.companyShop.findUnique({
    where: { companyId_shopId: { companyId, shopId } },
    include: { shop: true, company: true },
  });
  const now = new Date();
  const sub = await tx.subscription.findFirst({
    where: {
      companyId,
      status: "ACTIVE",
      startedAt: { lte: now },
      expiresAt: { gt: now },
    },
  });
  if (
    !p ||
    p.status !== "ACTIVE" ||
    p.shop.status !== "ACTIVE" ||
    p.shop.archivedAt ||
    p.company.status !== "ACTIVE" ||
    p.company.archivedAt ||
    !sub
  )
    throw new AuthError(
      403,
      "COLLABORATION_INACTIVE",
      "Cette collaboration ne permet pas de nouvelles op�rations. Les historiques sont conserv�s.",
    );
  return p;
}
