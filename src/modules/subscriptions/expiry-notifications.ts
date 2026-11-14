import type { Prisma } from "../../generated/prisma/client.js";
// Call inside the renewal transaction. A future worker processes the durable outbox.
export async function enqueueExpiryNotices(
  tx: Prisma.TransactionClient,
  value: {
    companyId: string;
    periodId: string;
    endsAt: Date;
    userId: string;
    email: string;
  },
) {
  await tx.notification.createMany({
    skipDuplicates: true,
    data: [3, 0].map((days) => ({
      companyId: value.companyId,
      recipientUserId: value.userId,
      recipientAddress: value.email,
      channel: "EMAIL" as const,
      sourceEvent: "subscription.expiry",
      sourceId: value.periodId,
      template:
        days === 3 ? "subscription.expires_in_3_days" : "subscription.expired",
      payload: { periodId: value.periodId },
      availableAt: new Date(value.endsAt.getTime() - days * 86400000),
      dedupeKey: `expiry:${value.periodId}:${value.userId}:${days}`,
    })),
  });
}
