import type { Prisma } from "../../generated/prisma/client.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import {
  authorizeTenant,
  type TenantSelection,
} from "../authorization/tenant-access.js";
import { AuthError } from "../auth/errors.js";
/** Invoke inside the same transaction as a future business mutation, after company lock. */
export async function assertNewOperation(
  tx: Prisma.TransactionClient,
  selection: TenantSelection,
  permission: string,
  now = new Date(),
) {
  await authorizeTenant(
    authorizationStore(tx, () => now),
    selection,
    permission,
  );
  const s = await tx.subscription.findUnique({
    where: { companyId: selection.companyId },
  });
  if (
    !s ||
    s.status !== "ACTIVE" ||
    !s.startedAt ||
    s.startedAt > now ||
    !s.expiresAt ||
    s.expiresAt <= now
  )
    throw new AuthError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "Un abonnement valide est nécessaire pour une nouvelle opération.",
    );
}
export type ClosureAction =
  "DELIVERY_CLOSE" | "DELIVERY_PROOF" | "COLLECTION_DECLARE";
/** No create/assign exception. ID, tenant, pickup cutoff and courier are checked from MySQL. */
export async function assertSafeClosure(
  tx: Prisma.TransactionClient,
  selection: TenantSelection,
  deliveryId: string,
  action: ClosureAction,
  now = new Date(),
) {
  if (
    !["DELIVERY_CLOSE", "DELIVERY_PROOF", "COLLECTION_DECLARE"].includes(action)
  )
    throw new AuthError(403, "CLOSURE_DENIED", "Action de clôture refusée.");
  await authorizeTenant(authorizationStore(tx), selection, "deliveries.read");
  const d = await tx.delivery.findFirst({
    where: {
      id: deliveryId,
      companyId: selection.companyId,
      ...(selection.agencyId ? { agencyId: selection.agencyId } : {}),
    },
  });
  const s = await tx.subscription.findUnique({
    where: { companyId: selection.companyId },
  });
  const membership = await tx.companyMembership.findUnique({
    where: {
      companyId_userId: {
        companyId: selection.companyId,
        userId: selection.userId,
      },
    },
    include: { role: true },
  });
  const tracedActive =
    !!d?.phase &&
    [
      "WITH_COURIER",
      "IN_TRANSIT",
      "INTER_AGENCY_TRANSIT",
      "ARRIVED_AGENCY",
      "AT_AGENCY",
      "FINAL_DISTRIBUTION",
      "AT_DESTINATION",
      "AWAITING_PROOF",
      "FAILED",
      "RETURN_REQUESTED",
      "RETURNING",
      "RETURN_ARRIVED",
    ].includes(d.phase);
  if (
    selection.shopId ||
    !d ||
    !s?.expiresAt ||
    s.expiresAt > now ||
    s.status === "CANCELLED" ||
    s.status === "SUSPENDED" ||
    !d.pickedUpAt ||
    d.pickedUpAt >= s.expiresAt ||
    (d.closedAt && !(tracedActive && d.status === "FAILED")) ||
    (d.status !== "IN_PROGRESS" &&
      !(tracedActive && ["FAILED", "PENDING"].includes(d.status))) ||
    (d.courierId !== selection.userId &&
      membership?.role.code !== "company_admin")
  )
    throw new AuthError(
      403,
      "CLOSURE_DENIED",
      "Seules les livraisons déjà prises en charge avant expiration peuvent être clôturées par leur livreur ou administrateur.",
    );
  return d;
}
