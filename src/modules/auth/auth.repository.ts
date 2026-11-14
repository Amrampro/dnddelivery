import type { PrismaClient } from "../../generated/prisma/client.js";
import { z } from "zod";
export function authRepository(db: PrismaClient) {
  return {
    findActiveSessionByHash(tokenHash: string, now = new Date()) {
      const hash = z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .parse(tokenHash);
      return db.session.findFirst({
        where: {
          refreshTokenHash: hash,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { status: "ACTIVE", archivedAt: null },
        },
        select: { id: true, userId: true, familyId: true, expiresAt: true },
      });
    },
  };
}
