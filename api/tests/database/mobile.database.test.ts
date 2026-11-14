import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { AccessDenied } from "../../src/modules/authorization/tenant-access.js";
test("mobile notification integration preserves current scopes and sanitized payloads", async (t) => {
  const f = await confirmationFixture();
  try {
    const p = await f.fresh();
    await t.test(
      "an OTP exception appears in the responsible manager inbox",
      async () => {
        await f.s.requestException(f.dc, p.id, {
          ...f.action(await f.s.confirmation(f.dc, p.id)),
          reason: "Recipient cannot obtain the OTP during test",
        });
        const rows = await f.d.notifications(f.ac);
        assert.ok(
          rows.some(
            (n) =>
              n.sourceEvent === "CONFIRMATION_EXCEPTION" &&
              n.payload.deliveryId === p.id &&
              n.payload.event === "OTP_EXCEPTION_REQUESTED",
          ),
        );
      },
    );
    await t.test(
      "private notification payload fields are not returned to the mobile client",
      async () => {
        await f.db.notification.create({
          data: {
            companyId: f.company.id,
            recipientUserId: f.admin.id,
            recipientAddress: f.admin.id,
            channel: "PUSH",
            sourceEvent: "CONFIRMATION_EVENT",
            sourceId: f.key(),
            template: "test",
            dedupeKey: f.key(),
            availableAt: new Date(),
            payload: {
              deliveryId: p.id,
              event: "COMPLETED",
              publicNumber: p.order.publicNumber,
              code: "never-return",
              internalNotes: "private",
            },
          },
        });
        const rows = await f.d.notifications(f.cc);
        assert.ok(rows.length);
        assert.ok(!JSON.stringify(rows).includes("never-return"));
        assert.ok(!JSON.stringify(rows).includes("internalNotes"));
      },
    );
    await t.test(
      "the same administrator in another agency cannot read this agency inbox item",
      async () => {
        const rows = await f.d.notifications({
          ...f.cc,
          scope: "AGENCY",
          agencyId: f.otherAgency.id,
        });
        assert.ok(!rows.some((n) => n.payload.deliveryId === p.id));
      },
    );
    await t.test(
      "withdrawn affiliation immediately blocks inbox access",
      async () => {
        await f.db.agencyMembership.updateMany({
          where: { userId: f.manager.id, companyId: f.company.id },
          data: { active: false },
        });
        await assert.rejects(f.d.notifications(f.ac), AccessDenied);
      },
    );
  } finally {
    await f.db.$disconnect();
  }
});
