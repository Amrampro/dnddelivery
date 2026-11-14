import type { Prisma, Delivery } from "../../generated/prisma/client.js";
import { randomUUID } from "node:crypto";
import { stockError } from "../stocks/access.js";
import { digest, eligible, otpCode, seal, unseal } from "./security.js";
export type Tx = Prisma.TransactionClient;
export async function currentAssignment(tx: Tx, p: Delivery) {
  const a = await tx.deliveryAssignment.findFirst({
    where: {
      companyId: p.companyId,
      deliveryId: p.id,
      courierId: p.courierId!,
      agencyId: p.agencyId,
      endedAt: null,
      activeSlot: 1,
      purpose: "FINAL",
    },
  });
  if (!a)
    throw stockError(
      "ASSIGNMENT_REQUIRED",
      "Affectation finale active requise.",
      403,
    );
  return a;
}
export async function ensureOtp(
  tx: Tx,
  p: Delivery,
  renew = false,
  now = new Date(),
) {
  if (!eligible(p))
    throw stockError(
      "OTP_UNAVAILABLE",
      "Le code est disponible uniquement pendant la distribution finale.",
    );
  const assignment = await currentAssignment(tx, p);
  const sub = await tx.subscription.findUnique({
    where: { companyId: p.companyId },
  });
  if (
    !sub?.expiresAt ||
    !["ACTIVE", "EXPIRED"].includes(sub.status) ||
    (sub.expiresAt <= now && p.pickedUpAt! >= sub.expiresAt) ||
    !(await tx.driverProfile.count({
      where: { companyId: p.companyId, userId: p.courierId!, status: "ACTIVE" },
    })) ||
    !(await tx.agencyMembership.count({
      where: {
        companyId: p.companyId,
        agencyId: p.agencyId,
        userId: p.courierId!,
        active: true,
        role: { code: "courier" },
        membership: {
          active: true,
          user: { status: "ACTIVE", archivedAt: null },
        },
      },
    }))
  )
    throw stockError(
      "OTP_UNAVAILABLE",
      "Cette mission n’est plus autorisée à recevoir un code.",
      403,
    );
  const previous = await tx.deliveryOtp.findFirst({
    where: { companyId: p.companyId, deliveryId: p.id },
    orderBy: { createdAt: "desc" },
  });
  if (
    previous?.status === "LOCKED" &&
    previous.updatedAt.getTime() + 900000 > now.getTime()
  )
    throw stockError(
      "OTP_LOCKED",
      "Trop d’essais. Attendez quinze minutes avant un renouvellement.",
      429,
    );
  if (
    !renew &&
    previous?.activeSlot === 1 &&
    previous.assignmentId === assignment.id &&
    ["PENDING", "VERIFIED"].includes(previous.status) &&
    previous.expiresAt > now
  )
    return previous;
  if (previous && previous.createdAt.getTime() + 60000 > now.getTime())
    throw stockError(
      "OTP_COOLDOWN",
      "Attendez une minute entre deux codes.",
      429,
    );
  const recent = await tx.deliveryOtp.count({
    where: {
      companyId: p.companyId,
      deliveryId: p.id,
      createdAt: { gte: new Date(now.getTime() - 3600000) },
    },
  });
  if (recent >= 3)
    throw stockError(
      "OTP_RENEWAL_LIMIT",
      "Trois codes au maximum par heure pour cette livraison.",
      429,
    );
  await tx.deliveryOtp.updateMany({
    where: { companyId: p.companyId, deliveryId: p.id, activeSlot: 1 },
    data: { status: "REVOKED", activeSlot: null, invalidatedAt: now },
  });
  const recentRows = await tx.deliveryOtp.findMany({
    where: {
      companyId: p.companyId,
      deliveryId: p.id,
      sealedCode: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const forbidden = new Set(
    recentRows.map((o) => unseal(o.sealedCode!, "otp:" + o.id)),
  );
  const id = randomUUID();
  let code = otpCode();
  while (forbidden.has(code)) code = otpCode();
  const created=await tx.deliveryOtp.create({
    data: {
      id,
      companyId: p.companyId,
      deliveryId: p.id,
      courierId: p.courierId!,
      assignmentId: assignment.id,
      activeSlot: 1,
      codeHash: digest(code, "otp:" + id),
      sealedCode: seal(code, "otp:" + id),
      expiresAt: new Date(now.getTime() + 1800000),
    },
  });
  await tx.auditLog.create({data:{companyId:p.companyId,agencyId:p.agencyId,action:"OTP_ISSUED",entityType:"Delivery",entityId:p.id,metadata:{otpId:created.id,assignmentId:assignment.id,expiresAt:created.expiresAt.toISOString(),supersedesId:previous?.id??null}}});
  return created;
}
