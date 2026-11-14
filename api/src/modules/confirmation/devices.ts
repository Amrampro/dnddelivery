import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthPrincipal } from "../auth/types.js";
import { serializable } from "../../database/transaction.js";
import { unauthorized } from "../auth/errors.js";
import { stockError } from "../stocks/access.js";

export async function registerDevice(
  db: PrismaClient,
  p: AuthPrincipal,
  input: { token: string; platform: "ios" | "android" },
) {
  return serializable(db, async (tx) => {
    // Serialize ownership checks and the upsert, including the absent-token case.
    const session = await tx.session.findFirst({
      where: { id: p.session.id, userId: p.user.id, revokedAt: null,
        expiresAt: { gt: new Date() }, user: { status: "ACTIVE", archivedAt: null } },
    });
    if (!session) throw unauthorized();
    const device = await tx.userDevice.findUnique({ where: { pushToken: input.token } });
    if (device && device.userId !== p.user.id && !device.revokedAt &&
      device.sessionFamilyId && await tx.session.count({ where: {
        userId: device.userId, familyId: device.sessionFamilyId,
        revokedAt: null, expiresAt: { gt: new Date() },
      } }))
      throw stockError("DEVICE_IN_USE", "Cet appareil poss�de encore une autre session active. D�connectez cette session avant de l'enregistrer.", 409);
    const data = { userId: p.user.id, platform: input.platform,
      sessionFamilyId: session.familyId, revokedAt: null };
    const row = await tx.userDevice.upsert({ where: { pushToken: input.token },
      create: { ...data, pushToken: input.token }, update: data });
    return { id: row.id, registered: true };
  });
}
