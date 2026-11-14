import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { expoNotification } from "../src/modules/confirmation/internal-notifications.js";
function adapter(active = true) {
  const revoked: string[] = [];
  const db = {
    userDevice: {
      async findMany() {
        return [
          {
            id: "device",
            pushToken: "ExpoPushToken[test-device]",
            sessionFamilyId: "family",
          },
        ];
      },
      async update(value: { where: { id: string } }) {
        revoked.push(value.where.id);
      },
    },
    session: {
      async count() {
        return active ? 1 : 0;
      },
    },
  } as unknown as PrismaClient;
  return { send: expoNotification(db), revoked };
}
test("push transport never sends for a revoked or expired session family", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Unexpected external call");
  };
  try {
    await assert.rejects(
      adapter(false).send("user", { deliveryId: "delivery" }),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("financial push carries only a safe destination and generic notification text", async () => {
  const original = globalThis.fetch;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://exp.host/--/api/v2/push/send");
    request = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ data: { status: "ok" } }));
  };
  try {
    await adapter().send("user", {
      module: "remises",
      companyId: "company",
      notificationId: "notice",
    });
    assert.deepEqual(request?.data, {
      module: "remises",
      companyId: "company",
      notificationId: "notice",
    });
    assert.equal(
      request?.body,
      "Une mise à jour est disponible dans votre espace sécurisé.",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("a DeviceNotRegistered ticket revokes the affected device and is not a success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: { status: "error", details: { error: "DeviceNotRegistered" } },
      }),
    );
  const f = adapter();
  try {
    await assert.rejects(f.send("user", { deliveryId: "delivery" }));
    assert.deepEqual(f.revoked, ["device"]);
  } finally {
    globalThis.fetch = original;
  }
});
test("an unsuccessful provider response is left for the durable worker retry", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(
      adapter().send("user", { deliveryId: "delivery" }),
      /Push unavailable/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
