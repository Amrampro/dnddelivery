import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import { registerDevice } from "../../src/modules/confirmation/devices.js";
import type { AuthPrincipal } from "../../src/modules/auth/types.js";

test("MySQL security: concurrent push ownership and revoked sessions", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (process.env.NODE_ENV !== "test" || !url || !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)))
    throw Error("Dedicated test database required");
  const db = createDatabase(url);
  async function principal(): Promise<AuthPrincipal> {
    const user = await db.user.create({ data: { fullName: "Security fixture", email: `${randomUUID()}@example.invalid`, passwordHash: "Not a login fixture" } });
    const session = await db.session.create({ data: { userId: user.id,
      familyId: randomUUID(), refreshTokenHash: randomUUID().replaceAll("-", "").repeat(2),
      expiresAt: new Date(Date.now() + 600000), clientType: "MOBILE", deviceName: "Security test" } });
    return { user, session };
  }
  try {
    const [a, b] = await Promise.all([principal(), principal()]);
    const input = { token: `ExpoPushToken[${randomUUID()}]`, platform: "android" as const };
    const results = await Promise.allSettled([registerDevice(db, a, input), registerDevice(db, b, input)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejection = results.find(r => r.status === "rejected");
    assert.ok(rejection?.status === "rejected");
    assert.equal(rejection.reason.code, "DEVICE_IN_USE");
    const owner = await db.userDevice.findUniqueOrThrow({ where: { pushToken: input.token } });
    const winner = owner.userId === a.user.id ? a : b;
    const loser = winner === a ? b : a;
    const released = { ...input, token: `ExpoPushToken[${randomUUID()}]` };
    await db.userDevice.create({ data: { pushToken: released.token,
      userId: winner.user.id, platform: "android", sessionFamilyId: winner.session.familyId, revokedAt: new Date() } });
    const claims = await Promise.allSettled([registerDevice(db, a, released), registerDevice(db, b, released)]);
    assert.equal(claims.filter(r => r.status === "fulfilled").length, 1);
    const denied = claims.find(r => r.status === "rejected");
    assert.ok(denied?.status === "rejected");
    assert.equal(denied.reason.code, "DEVICE_IN_USE");
    await assert.rejects(registerDevice(db, loser, input), { code: "DEVICE_IN_USE" });
    await registerDevice(db, winner, input);
    await db.session.update({ where: { id: winner.session.id }, data: { revokedAt: new Date() } });
    await assert.rejects(registerDevice(db, winner, { ...input, token: `ExpoPushToken[${randomUUID()}]` }), { status: 401 });
    await registerDevice(db, loser, input);
    assert.equal((await db.userDevice.findUniqueOrThrow({ where: { pushToken: input.token } })).userId, loser.user.id);
  } finally { await db.$disconnect(); }
});
