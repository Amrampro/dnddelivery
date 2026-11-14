import type { Prisma, Delivery } from "../../generated/prisma/client.js";
import { eligible } from "./security.js";
/** Called in the existing logistics transaction; no SMTP or file IO here. */
export async function invalidateConfirmation(
  tx: Prisma.TransactionClient,
  old: Delivery | undefined,
  next: Delivery,
) {
  if (
    old &&
    (!eligible(next) ||
      old.courierId !== next.courierId ||
      old.agencyId !== next.agencyId)
  ) {
    await tx.deliveryOtp.updateMany({
      where: {
        companyId: next.companyId,
        deliveryId: next.id,
        activeSlot: 1,
        status: { in: ["PENDING", "VERIFIED", "LOCKED"] },
      },
      data: { status: "REVOKED", activeSlot: null, invalidatedAt: new Date() },
    });
    await tx.otpException.updateMany({
      where: {
        companyId: next.companyId,
        deliveryId: next.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      data: { status: "REVOKED", version: { increment: 1 } },
    });
    await tx.deliveryEvidence.updateMany({
      where: {
        companyId: next.companyId,
        deliveryId: next.id,
        kind: "HANDOVER",
        status: "READY",
      },
      data: { status: "RETIRED" },
    });
  }
}
