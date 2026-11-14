import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, utimes, access as fileAccess } from "node:fs/promises";
import path from "node:path";
import { cleanupProofFiles } from "../../src/modules/confirmation/cleanup.js";
import sharp from "sharp";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { ConfirmationService } from "../../src/modules/confirmation/service.js";
import { TrackingService } from "../../src/modules/confirmation/tracking.js";
import { LocalProofStorage } from "../../src/modules/confirmation/storage.js";
import { OrderNotifications } from "../../src/modules/orders/notifications.js";
import { DeliveryNotifications } from "../../src/modules/deliveries/notifications.js";
import { ConfirmationNotifications } from "../../src/modules/confirmation/internal-notifications.js";
import { localSmtp } from "../helpers/local-smtp.js";
import { subscriptionMailer } from "../../src/modules/auth/smtp.js";
import { unseal } from "../../src/modules/confirmation/security.js";
const denied = (code: string) => (e: unknown) =>
  !!e && typeof e === "object" && "code" in e && e.code === code;
test("MySQL recipient tracking, OTP, private photos, independent exceptions and final delivery", async (t) => {
  const f = await confirmationFixture(),
    {
      db,
      s,
      tracking,
      d,
      finance,
      cc,
      ac,
      dc,
      ec,
      sc,
      xc,
      vc,
      key,
      action,
      fresh,
      recipient,
      code,
      photo,
      verified,
    } = f;
  const close = async (id: string, extra: Record<string, unknown> = {}) => {
    const p = await s.confirmation(dc, id);
    return s.complete(dc, id, {
      ...action(p),
      evidenceIds: p.evidence
        .filter(
          (e) => e.current && e.kind === "HANDOVER" && e.status === "READY",
        )
        .map((e) => e.id),
      ...extra,
    });
  };
  try {
    await t.test(
      "lookup valid, unknown and wrong email return identical responses and no PII",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id),
          a = await tracking.lookup(
            { reference: r.reference, email: r.order.recipientEmail },
            "lookup-a-" + p.id,
          ),
          b = await tracking.lookup(
            { reference: "UNKNOWN-REFERENCE", email: r.order.recipientEmail },
            "lookup-b-" + p.id,
          ),
          c = await tracking.lookup(
            { reference: r.reference, email: "other@example.invalid" },
            "lookup-c-" + p.id,
          );
        assert.deepEqual(a, b);
        assert.deepEqual(a, c);
        assert.ok(!JSON.stringify(a).includes(r.order.recipientEmail));
        assert.equal(
          await db.notification.count({
            where: {
              companyId: f.company.id,
              sourceEvent: "TRACKING_ACCESS",
              sourceId: r.order.id,
            },
          }),
          1,
        );
      },
    );
    await t.test(
      "lookup is durably throttled and repeated requests deduplicate the mail",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id);
        for (let i = 0; i < 8; i++)
          await tracking.lookup(
            { reference: r.reference, email: r.order.recipientEmail },
            "lookup-limit-" + p.id,
          );
        assert.equal(
          await db.notification.count({
            where: {
              companyId: f.company.id,
              sourceEvent: "TRACKING_ACCESS",
              sourceId: r.order.id,
            },
          }),
          1,
        );
        assert.ok(await db.trackingThrottle.count());
      },
    );
    await t.test(
      "public reference alone cannot authenticate; link and session are bound to one order",
      async () => {
        const p = await fresh(),
          q = await fresh(),
          r = await recipient(p.id),
          other = await recipient(q.id);
        await assert.rejects(
          tracking.detail(r.reference, "a".repeat(43)),
          denied("TRACKING_UNAVAILABLE"),
        );
        await assert.rejects(
          tracking.verify(other.reference, r.raw, "wrong-order"),
          denied("TRACKING_UNAVAILABLE"),
        );
        await assert.rejects(
          tracking.detail(other.reference, r.session),
          denied("TRACKING_UNAVAILABLE"),
        );
        const detail = await tracking.detail(r.reference, r.session);
        assert.equal(detail.reference, r.reference);
      },
    );
    await t.test(
      "tracking DTO is a real chronology with no address, phone, employees, hashes or photos",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id),
          detail = await tracking.detail(r.reference, r.session),
          text = JSON.stringify(detail);
        assert.ok(
          detail.events.some((e) => e.label === "Colis pris en charge"),
        );
        assert.ok(
          detail.events.some((e) => e.label === "En cours de distribution"),
        );
        for (const secret of [
          r.order.recipientEmail,
          r.order.recipientPhone,
          r.order.recipientAddress,
          f.courier.email,
          f.courier.id,
          "codeHash",
          "sealedCode",
          "fileUrl",
        ])
          assert.ok(!text.includes(secret));
        assert.equal(detail.confirmedAt, null);
      },
    );
    await t.test(
      "expired links and sessions are denied without revealing the order",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id);
        await db.trackingAccess.updateMany({
          where: { orderId: r.order.id },
          data: { expiresAt: new Date(0) },
        });
        await assert.rejects(
          tracking.verify(r.reference, r.raw, "expired"),
          denied("TRACKING_UNAVAILABLE"),
        );
        await assert.rejects(
          tracking.detail(r.reference, r.session),
          denied("TRACKING_UNAVAILABLE"),
        );
      },
    );
    await t.test(
      "controlled tracking renewal revokes old links and sessions and queues one new mail",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id),
          before = await s.confirmation(cc, p.id),
          input = action(before);
          await code(p.id);
        await s.renewTracking(cc, p.id, input);
        await s.renewTracking(cc, p.id, input);
          assert.equal((await db.deliveryOtp.findFirstOrThrow({where:{deliveryId:p.id}})).status,"REVOKED");
        await assert.rejects(
          tracking.detail(r.reference, r.session),
          denied("TRACKING_UNAVAILABLE"),
        );
        await assert.rejects(
          tracking.verify(r.reference, r.raw, "revoked"),
          denied("TRACKING_UNAVAILABLE"),
        );
        assert.equal(
          await db.notification.count({
            where: {
              dedupeKey: `tracking-renew:${p.id}:${input.operationKey}`,
            },
          }),
          1,
        );
      },
    );
    await t.test(
      "OTP is unavailable before physical pickup and not included in creation notification payload",
      async () => {
        const p = await fresh("0", false),
          r = await recipient(p.id);
        await assert.rejects(
          tracking.code(r.reference, r.session),
          denied("OTP_UNAVAILABLE"),
        );
        assert.equal(
          await db.deliveryOtp.count({ where: { deliveryId: p.id } }),
          0,
        );
        const n = await db.notification.findUniqueOrThrow({
          where: { dedupeKey: `order:${r.order.id}:registered` },
        });
        assert.ok(!/code|otp|token/i.test(JSON.stringify(n.payload)));
      },
    );
    await t.test(
      "server generates six digits and only encrypted code plus keyed hash are persisted",
      async () => {
        const p = await fresh(),
          raw = await code(p.id),
          row = await db.deliveryOtp.findFirstOrThrow({
            where: { deliveryId: p.id },
          });
        assert.ok(/^\d{6}$/.test(raw));
        assert.ok(row.codeHash.length === 64);
        assert.ok(
          row.codeHash !== createHash("sha256").update(raw).digest("hex"),
        );
        assert.ok(row.sealedCode !== raw);
        assert.ok(unseal(row.sealedCode!, "otp:" + row.id) === raw);
        const dto = JSON.stringify(await s.confirmation(dc, p.id));
        assert.ok(!dto.includes(row.codeHash));
        assert.ok(!dto.includes(row.sealedCode!));
      },
    );
    await t.test(
      "correct OTP creates a verification, not a delivered order or proof",
      async () => {
        const p = await fresh(),
          info = await verified(p.id);
        assert.equal(info.otp?.status, "VERIFIED");
        assert.equal(info.status, "IN_PROGRESS");
        assert.equal(info.phase, "AWAITING_PROOF");
        assert.equal(info.proof, null);
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: p.id } }),
          0,
        );
      },
    );
    await t.test(
      "wrong OTP persists attempts and audit while idempotent replay consumes no extra attempt",
      async () => {
        const p = await fresh(),
          raw = await code(p.id),
          input = {
            ...action(p),
            code: raw === "000000" ? "000001" : "000000",
          };
        await assert.rejects(
          s.verifyCode(dc, p.id, input),
          denied("OTP_INCORRECT"),
        );
        await assert.rejects(
          s.verifyCode(dc, p.id, input),
          denied("OTP_INCORRECT"),
        );
        const row = await db.deliveryOtp.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        assert.equal(row.attempts, 1);
        assert.equal(
          await db.otpAttempt.count({ where: { deliveryId: p.id } }),
          1,
        );
        assert.ok(
          await db.auditLog.count({
            where: { entityId: p.id, action: "OTP_INCORRECT" },
          }),
        );
      },
    );
    await t.test(
      "five failures lock the challenge; correct code and immediate regeneration are refused",
      async () => {
        const p = await fresh(),
          raw = await code(p.id),
          wrong = raw === "000000" ? "000001" : "000000";
        for (let i = 0; i < 5; i++)
          await assert.rejects(
            s.verifyCode(dc, p.id, { ...action(p), code: wrong }),
            denied(i === 4 ? "OTP_LOCKED" : "OTP_INCORRECT"),
          );
        await assert.rejects(
          s.verifyCode(dc, p.id, { ...action(p), code: raw }),
          denied("OTP_LOCKED"),
        );
        await assert.rejects(
          s.renew(dc, p.id, action(p)),
          denied("OTP_LOCKED"),
        );
        assert.equal(
          (
            await db.deliveryOtp.findFirstOrThrow({
              where: { deliveryId: p.id },
            })
          ).attempts,
          5,
        );
      },
    );
    await t.test("expired OTP is refused and recorded", async () => {
      const p = await fresh(),
        raw = await code(p.id),
        late = new ConfirmationService(
          db,
          f.files,
          () => new Date(Date.now() + 1900000),
        );
      await assert.rejects(
        late.verifyCode(dc, p.id, { ...action(p), code: raw }),
        denied("OTP_EXPIRED"),
      );
      assert.equal(
        (await db.deliveryOtp.findFirstOrThrow({ where: { deliveryId: p.id } }))
          .status,
        "EXPIRED",
      );
    });
    await t.test(
      "controlled regeneration invalidates the previous numeric code and enforces cooldown",
      async () => {
        const p = await fresh(),
          old = await code(p.id);
        await assert.rejects(
          s.renew(dc, p.id, action(p)),
          denied("OTP_COOLDOWN"),
        );
        const now = new Date(Date.now() + 61000),
          later = new ConfirmationService(db, f.files, () => now);
        await later.renew(dc, p.id, action(p));
        const rows = await db.deliveryOtp.findMany({
            where: { deliveryId: p.id },
            orderBy: { createdAt: "desc" },
          }),
          current = rows.find((r) => r.activeSlot === 1)!;
        assert.ok(unseal(current.sealedCode!, "otp:" + current.id) !== old);
        assert.equal(rows.find((r) => r.id !== current.id)?.status, "REVOKED");
        const updated = await s.confirmation(dc, p.id);
        await assert.rejects(
          s.verifyCode(dc, p.id, { ...action(updated), code: old }),
          denied("OTP_INCORRECT"),
        );
      },
    );
    await t.test(
      "regeneration is capped at three challenges per rolling hour",
      async () => {
        const p = await fresh();
        await code(p.id);
        for (let i = 1; i <= 2; i++) {
          const later = new ConfirmationService(
            db,
            f.files,
            () => new Date(Date.now() + i * 61000),
          );
          await later.renew(dc, p.id, action(await s.confirmation(dc, p.id)));
        }
        const later = new ConfirmationService(
          db,
          f.files,
          () => new Date(Date.now() + 250000),
        );
        await assert.rejects(
          later.renew(dc, p.id, action(await s.confirmation(dc, p.id))),
          denied("OTP_RENEWAL_LIMIT"),
        );
      },
    );
    await t.test(
      "unassigned courier, another company, another agency and another shop cannot read or verify",
      async () => {
        const p = await fresh(),
          raw = await code(p.id);
        await assert.rejects(
          s.verifyCode(ec, p.id, { ...action(p), code: raw }),
        );
        await assert.rejects(
          s.confirmation({ ...cc, companyId: f.other.id }, p.id),
        );
        await assert.rejects(
          s.confirmation({ ...ac, agencyId: f.otherAgency.id }, p.id),
        );
        await assert.rejects(s.confirmation(xc, p.id));
      },
    );
    await t.test(
      "successful verification cannot be repeated under a new operation key",
      async () => {
        const p = await fresh(),
          raw = await code(p.id),
          info = await s.verifyCode(dc, p.id, { ...action(p), code: raw });
        await assert.rejects(
          s.verifyCode(dc, p.id, { ...action(info), code: raw }),
          denied("OTP_ALREADY_USED"),
        );
      },
    );
    await t.test(
      "valid upload is normalized, private, server timestamped and stripped of EXIF",
      async () => {
        const p = await fresh(),
          before = Date.now(),
          info = await photo(p.id),
          e = info.evidence[0]!,
          row = await db.deliveryEvidence.findUniqueOrThrow({
            where: { id: e.id },
          }),
          file = await db.fileAsset.findUniqueOrThrow({
            where: { id: row.fileId },
          }),
          bytes = await s.file(dc, e.id),
          meta = await sharp(bytes).metadata();
        assert.equal(file.visibility, "PRIVATE");
        assert.equal(file.mimeType, "image/webp");
        assert.equal(meta.format, "webp");
        assert.equal(meta.exif, undefined);
        assert.ok(
          file.createdAt.getTime() >= before &&
            file.createdAt.getTime() <= Date.now(),
        );
        assert.ok(!file.storageKey.includes("/"));
        assert.ok(!file.originalName.includes("Private"));
      },
    );
    await t.test(
      "forbidden MIME, forged image and oversized data are rejected",
      async () => {
        const p = await fresh();
        await assert.rejects(
          s.upload(
            dc,
            p.id,
            { operationKey: key(), kind: "HANDOVER" },
            Buffer.from("fake"),
            "application/pdf",
          ),
          denied("PROOF_MIME_INVALID"),
        );
        await assert.rejects(
          s.upload(
            dc,
            p.id,
            { operationKey: key(), kind: "HANDOVER" },
            Buffer.from("not a JPEG"),
            "image/jpeg",
          ),
          denied("PROOF_IMAGE_INVALID"),
        );
        await assert.rejects(
          s.upload(
            dc,
            p.id,
            { operationKey: key(), kind: "HANDOVER" },
            Buffer.alloc(5 * 1024 * 1024 + 1),
            "image/jpeg",
          ),
          denied("PROOF_SIZE_INVALID"),
        );
      },
    );
    await t.test(
      "photo upload is idempotent and key reuse with another file is refused",
      async () => {
        const p = await fresh(),
          bytes = await sharp({
            create: {
              width: 10,
              height: 10,
              channels: 3,
              background: "#aa3322",
            },
          })
            .png()
            .toBuffer(),
          input = { operationKey: key(), kind: "HANDOVER" as const };
        await s.upload(dc, p.id, input, bytes, "image/png");
        await s.upload(dc, p.id, input, bytes, "image/png");
        assert.equal(
          await db.deliveryEvidence.count({ where: { deliveryId: p.id } }),
          1,
        );
        await assert.rejects(
          s.upload(dc, p.id, input, Buffer.from("different"), "image/png"),
        );
      },
    );
    await t.test(
      "private photos deny peers and other shops; shop sees only final attached evidence",
      async () => {
        const p = await fresh(),
          info = await photo(p.id),
          id = info.evidence[0]!.id;
        await assert.rejects(s.file(ec, id));
        await assert.rejects(s.file(xc, id));
        await assert.rejects(s.file(sc, id));
        assert.ok((await s.file(ac, id)).length > 0);
        assert.equal((await s.confirmation(sc, p.id)).evidence.length, 0);
      },
    );
    await t.test(
      "closing without verified OTP is refused even with a photo",
      async () => {
        const p = await fresh();
        await photo(p.id);
        await assert.rejects(close(p.id), denied("OTP_REQUIRED"));
        assert.equal((await s.confirmation(dc, p.id)).status, "IN_PROGRESS");
      },
    );
    await t.test(
      "closing without a photo is refused even after valid OTP",
      async () => {
        const p = await fresh();
        await verified(p.id);
        await assert.rejects(close(p.id), denied("PHOTO_REQUIRED"));
      },
    );
    await t.test(
      "missing file prevents final SQL closure and leaves verification usable",
      async () => {
        const p = await fresh();
        await verified(p.id);
        const info = await photo(p.id),
          e = await db.deliveryEvidence.findUniqueOrThrow({
            where: { id: info.evidence[0]!.id },
          }),
          file = await db.fileAsset.findUniqueOrThrow({
            where: { id: e.fileId },
          });
        await f.files.remove(file.storageKey);
        await assert.rejects(close(p.id), denied("PROOF_FILE_UNAVAILABLE"));
        assert.equal((await s.confirmation(dc, p.id)).otp?.status, "VERIFIED");
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: p.id } }),
          0,
        );
      },
    );
    await t.test(
      "valid OTP and photo close once, preserve attribution, consume code and expose authorized proof",
      async () => {
        const p = await fresh(),
          raw = await code(p.id);
        await s.verifyCode(dc, p.id, { ...action(p), code: raw });
        await photo(p.id);
        const info = await s.confirmation(dc, p.id),
          input = {
            ...action(info),
            evidenceIds: info.evidence.map((e) => e.id),
          },
          done = await s.complete(dc, p.id, input);
        await s.complete(dc, p.id, input);
        assert.equal(done.status, "DELIVERED");
        assert.equal(done.otp?.status, "CONSUMED");
        assert.ok(done.proof);
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: p.id } }),
          1,
        );
        assert.equal(
          (await db.order.findUniqueOrThrow({ where: { id: p.order.id } }))
            .status,
          "DELIVERED",
        );
        assert.equal(
          await db.deliveryAssignment.count({
            where: { deliveryId: p.id, endedAt: null },
          }),
          0,
        );
        assert.ok((await s.file(sc, info.evidence[0]!.id)).length > 0);
        const proof = await db.deliveryProof.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        assert.equal(proof.confirmedById, f.courier.id);
        assert.equal(proof.courierId, f.courier.id);
        assert.ok(proof.assignmentId);
        await assert.rejects(
          s.complete(dc, p.id, {
            ...input,
            operationKey: key(),
            version: done.version,
          }),
          denied("CONFIRMATION_UNAVAILABLE"),
        );
        await assert.rejects(
          s.verifyCode(dc, p.id, { ...action(done), code: raw }),
        );
        const r = await recipient(p.id),
          publicView = await tracking.detail(r.reference, r.session);
        assert.equal(publicView.status, "DELIVERED");
        assert.ok(
          publicView.events.some((e) => e.label === "Livraison confirmée"),
        );
        assert.ok(publicView.confirmedAt);
        assert.equal(publicView.otpAvailable, false);
      },
    );
    await t.test(
      "concurrent complete requests produce only one proof and one delivery event",
      async () => {
        const p = await fresh();
        await verified(p.id);
        await photo(p.id);
        const info = await s.confirmation(dc, p.id),
          results = await Promise.allSettled(
            [1, 2].map(() =>
              s.complete(dc, p.id, {
                ...action(info),
                evidenceIds: info.evidence.map((e) => e.id),
              }),
            ),
          );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await db.deliveryProof.count({ where: { deliveryId: p.id } }),
          1,
        );
        assert.equal(
          await db.deliveryEvent.count({
            where: { deliveryId: p.id, action: "COMPLETED" },
          }),
          1,
        );
      },
    );
    await t.test(
      "financial shortfall blocks nominal closing and preserves the collected funds",
      async () => {
        const p = await fresh("1000");
        await finance.declare(dc, {
          deliveryId: p.id,
          deliveryVersion: p.version,
          operationKey: key(),
          amount: "400",
          method: "CASH",
        });
        await verified(p.id);
        await photo(p.id);
        await assert.rejects(close(p.id), denied("COLLECTION_INCOMPLETE"));
        const row = await db.collection.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        assert.equal(row.declaredAmount?.toFixed(4), "400.0000");
        assert.equal((await s.confirmation(dc, p.id)).status, "IN_PROGRESS");
      },
    );
    await t.test(
      "independently approved financial exception permits delivery but leaves responsibility and customer remainder",
      async () => {
        const p = await fresh("1000");
        await finance.declare(dc, {
          deliveryId: p.id,
          deliveryVersion: p.version,
          operationKey: key(),
          amount: "400",
          method: "CASH",
        });
        await verified(p.id);
        await photo(p.id);
        const request = await finance.requestCorrection(cc, {
          operationKey: key(),
          kind: "EXCEPTION",
          deliveryId: p.id,
          amount: "0",
          reason: "Responsible approval for partial customer collection",
        });
        await finance.decideCorrection(vc, request.id, {
          operationKey: key(),
          version: request.version,
          approve: true,
          reason: "Independent financial authorization documented",
        });
        await close(p.id);
        const o = await finance.obligations(cc, {
          page: 1,
          size: 20,
          orderId: p.order.id,
        });
        assert.equal(o.items[0]?.remaining, "600.0000");
        const overview = await finance.overview(cc, {
          page: 1,
          size: 20,
          orderId: p.order.id,
        });
        assert.ok(
          overview.money[0] &&
            "liability" in overview.money[0] &&
            overview.money[0].liability === "400.0000",
        );
      },
    );
    await t.test(
      "OTP exception requires two distinct photos, a different approver and a recorded reason",
      async () => {
        const p = await fresh();
        await photo(p.id, "#2244aa");
        await s.requestException(
          dc,
          p.id,
          action(await s.confirmation(dc, p.id)),
        );
        let info = await s.confirmation(ac, p.id),
          e = info.exceptions[0]!;
        await assert.rejects(
          s.decideException(ac, p.id, e.id, {
            ...action(info),
            exceptionVersion: e.version,
            approve: true,
          }),
          denied("EXTRA_EVIDENCE_REQUIRED"),
        );
        await photo(p.id, "#eeaa22");
        info = await s.confirmation(ac, p.id);
        e = info.exceptions[0]!;
        await s.decideException(ac, p.id, e.id, {
          ...action(info),
          exceptionVersion: e.version,
          approve: true,
        });
        const done = await close(p.id, { exceptionId: e.id });
        assert.equal(done.proof?.method, "AUTHORIZED_EXCEPTION");
        const proof = await db.deliveryProof.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        assert.equal(proof.exceptionAuthorizedById, f.manager.id);
        assert.equal(proof.otpId, null);
        assert.equal(
          await db.proofPhoto.count({ where: { proofId: proof.id } }),
          2,
        );
      },
    );
    await t.test("rejected OTP exception cannot close a delivery", async () => {
      const p = await fresh();
      await photo(p.id);
      await photo(p.id, "#ff1122");
      await s.requestException(
        dc,
        p.id,
        action(await s.confirmation(dc, p.id)),
      );
      const info = await s.confirmation(ac, p.id),
        e = info.exceptions[0]!;
      await s.decideException(ac, p.id, e.id, {
        ...action(info),
        exceptionVersion: e.version,
        approve: false,
      });
      await assert.rejects(
        close(p.id, { exceptionId: e.id }),
        denied("OTP_REQUIRED"),
      );
    });
    await t.test(
      "requester cannot approve even after temporarily acquiring a supervisory role",
      async () => {
        const p = await fresh();
        await photo(p.id);
        await photo(p.id, "#abcdef");
        await s.requestException(
          dc,
          p.id,
          action(await s.confirmation(dc, p.id)),
        );
        const info = await s.confirmation(dc, p.id),
          e = info.exceptions[0]!,
          role = await db.role.findUniqueOrThrow({
            where: { code: "company_admin" },
          });
        await db.companyMembership.update({
          where: {
            companyId_userId: { companyId: f.company.id, userId: f.courier.id },
          },
          data: { roleId: role.id },
        });
        try {
          await assert.rejects(
            s.decideException({ ...cc, actorId: f.courier.id }, p.id, e.id, {
              ...action(info),
              exceptionVersion: e.version,
              approve: true,
            }),
            denied("SELF_APPROVAL_DENIED"),
          );
        } finally {
          await db.companyMembership.update({
            where: {
              companyId_userId: {
                companyId: f.company.id,
                userId: f.courier.id,
              },
            },
            data: {
              roleId: (
                await db.role.findUniqueOrThrow({
                  where: { code: "company_member" },
                })
              ).id,
            },
          });
        }
      },
    );
    await t.test(
      "physical reassignment invalidates issued OTP and excludes historical courier photos",
      async () => {
        const p = await fresh();
        await code(p.id);
        await photo(p.id);
        const current = await d.detail(cc, p.id);
        const offered = await d.assign(
            cc,
            p.id,
            { ...action(current), courierId: f.peer.id },
            true,
          ),
          handover = offered.handovers.at(-1)!;
        await d.confirmHandover(ec, p.id, handover.id, {
          ...action(offered),
          handoverVersion: handover.version,
          condition: "GOOD",
        });
        const old = await db.deliveryOtp.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        assert.equal(old.status, "REVOKED");
        const info = await s.confirmation(ec, p.id);
        assert.equal(info.evidence.length, 0);
        await assert.rejects(
          s.complete(ec, p.id, {
            ...action(info),
            evidenceIds: [
              (
                await db.deliveryEvidence.findFirstOrThrow({
                  where: { deliveryId: p.id },
                })
              ).id,
            ],
          }),
        );
      },
    );
    await t.test(
      "failure needs no OTP, accepts an optional explanatory photo and invalidates an issued code",
      async () => {
        const p = await fresh();
        await verified(p.id);
        const current = await d.detail(dc, p.id);
        await d.attempt(dc, p.id, {
          ...action(current),
          result: "FAILED",
          kind: "ABSENT",
        });
        assert.equal(
          (
            await db.deliveryOtp.findFirstOrThrow({
              where: { deliveryId: p.id },
            })
          ).status,
          "REVOKED",
        );
        const info = await photo(p.id, "#555555", "FAILURE");
        assert.equal(info.status, "FAILED");
        assert.equal(info.proof, null);
        assert.equal(info.evidence[0]?.kind, "FAILURE");
        assert.ok(
          await db.notification.count({
            where: {
              companyId: f.company.id,
              sourceEvent: "CONFIRMATION_EVENT",
              payload: { path: "$.deliveryId", equals: p.id },
            },
          }),
        );
      },
    );
    await t.test(
      "expiry allows safe closure of a previously picked mission but suspension refuses it",
      async () => {
        const p = await fresh();
        await verified(p.id);
        await photo(p.id);
        await db.subscription.update({
          where: { companyId: f.company.id },
          data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 100) },
        });
        try {
          assert.equal((await close(p.id)).status, "DELIVERED");
        } finally {
          await db.subscription.update({
            where: { companyId: f.company.id },
            data: {
              status: "ACTIVE",
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
        }
        const q = await fresh();
        await verified(q.id);
        await photo(q.id);
        await db.subscription.update({
          where: { companyId: f.company.id },
          data: { status: "SUSPENDED" },
        });
        try {
          await assert.rejects(close(q.id));
        } finally {
          await db.subscription.update({
            where: { companyId: f.company.id },
            data: { status: "ACTIVE" },
          });
        }
      },
    );
    await t.test(
      "database prevents direct delivered status without proof and preserves proof and security history",
      async () => {
        const p = await fresh();
        await assert.rejects(
          db.delivery.update({
            where: { id: p.id },
            data: {
              status: "DELIVERED",
              phase: "DELIVERED",
              closedAt: new Date(),
            },
          }),
        );
        await verified(p.id);
        await photo(p.id);
        await close(p.id);
        const proof = await db.deliveryProof.findFirstOrThrow({
            where: { deliveryId: p.id },
          }),
          attempt = await db.otpAttempt.findFirstOrThrow({
            where: { deliveryId: p.id },
          });
        await assert.rejects(
          db.deliveryProof.update({
            where: { id: proof.id },
            data: { exceptionReason: "Changed" },
          }),
        );
        await assert.rejects(
          db.otpAttempt.delete({ where: { id: attempt.id } }),
        );
      },
    );
    await t.test(
      "filesystem traversal and out-of-scope proof identifiers are denied",
      async () => {
        const storage = new LocalProofStorage(f.files.directory);
        await assert.rejects(storage.read("../api/.env"));
        await assert.rejects(s.file(sc, key()));
      },
    );
    await t.test(
      "creation and status mail include a private link; SMTP failure schedules retry with immutable attempts",
      async () => {
        const p = await fresh(),
          n = await db.notification.findUniqueOrThrow({
            where: { dedupeKey: `order:${p.order.id}:registered` },
          }),
          worker = new OrderNotifications(
            f.orders,
            () => new Date(),
            f.company.id,
          );
        await worker.run(
          {
            send: async () => {
              throw Error("Offline");
            },
          },
          1000,
        );
        assert.equal(
          (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
            .status,
          "FAILED",
        );
        await db.notification.update({
          where: { id: n.id },
          data: { availableAt: new Date(0) },
        });
        let seen = false;
        await worker.run(
          {
            send: async (to, _subject, text, _id, html) => {
              if (to === n.recipientAddress) {
                seen = true;
                assert.ok(text.includes("/suivi#reference="));
                assert.ok(!text.includes("Votre code de remise"));
                assert.ok(html?.includes("#033173"));
              }
            },
          },
          1000,
        );
        assert.ok(seen);
        const accepted = await db.notification.findUniqueOrThrow({
          where: { id: n.id },
        });
        assert.equal(accepted.deliveryState, "ACCEPTED");
        assert.ok(accepted.providerAcceptedAt);
        assert.ok(
          (await db.notificationAttempt.count({
            where: { notificationId: n.id },
          })) >= 2,
        );
      },
    );
    await t.test(
      "real local SMTP accepts final delivery message and a private tracking link without claiming delivered email",
      async () => {
        const p = await fresh();
        await verified(p.id);
        await photo(p.id);
        await close(p.id);
        const event = await db.deliveryEvent.findFirstOrThrow({
            where: { deliveryId: p.id, action: "COMPLETED" },
          }),
          n = await db.notification.findUniqueOrThrow({
            where: { dedupeKey: `delivery:${event.id}:recipient` },
          }),
          messages: string[] = [],
          smtp = await localSmtp((message) => messages.push(message));
        try {
          const mailer = subscriptionMailer({
            NODE_ENV: "test",
            SMTP_HOST: "127.0.0.1",
            SMTP_PORT: String(smtp.port),
            SMTP_FROM: "proof@example.invalid",
            SMTP_SECURE: "false",
          });
          await new DeliveryNotifications(
            d,
            () => new Date(),
            f.company.id,
          ).run(mailer, 1000);
          const result = await db.notification.findUniqueOrThrow({
            where: { id: n.id },
          });
          assert.equal(result.deliveryState, "ACCEPTED");
          assert.equal(result.status, "SENT");
          assert.ok(
            messages.some(
              (m) =>
                m.includes("Livraison confirm") ||
                m.includes("Livraison confirm".replace("é", "=C3=A9")),
            ),
          );
        } finally {
          await smtp.close();
        }
      },
    );
    await t.test(
      "internal notifications revalidate scopes and push remains pending without an adapter",
      async () => {
        const p = await fresh();
        await s.requestException(
          dc,
          p.id,
          action(await s.confirmation(dc, p.id)),
        );
        const info = await s.confirmation(ac, p.id),
          exception = info.exceptions[0]!,
          mail = await db.notification.findUniqueOrThrow({
            where: {
              dedupeKey: `otp-exception:${exception.id}:EMAIL:${f.manager.id}`,
            },
          });
        await db.agencyMembership.update({
          where: {
            companyId_agencyId_userId: {
              companyId: f.company.id,
              agencyId: f.agency.id,
              userId: f.manager.id,
            },
          },
          data: { active: false },
        });
        try {
          await new ConfirmationNotifications(
            db,
            () => new Date(),
            f.company.id,
          ).run({ send: async () => {} }, 1000);
          assert.equal(
            (
              await db.notification.findUniqueOrThrow({
                where: { id: mail.id },
              })
            ).status,
            "CANCELLED",
          );
        } finally {
          await db.agencyMembership.update({
            where: {
              companyId_agencyId_userId: {
                companyId: f.company.id,
                agencyId: f.agency.id,
                userId: f.manager.id,
              },
            },
            data: { active: true },
          });
        }
        const push = await db.notification.findUniqueOrThrow({
          where: {
            dedupeKey: `otp-exception:${exception.id}:PUSH:${f.manager.id}`,
          },
        });
        assert.equal(push.status, "PENDING");
        assert.equal(push.attempts, 0);
      },
    );
    await t.test(
      "public code expiry, photo evidence and confirmation never create stock movements or financial receipts",
      async () => {
        const before = await db.stockMovement.count({
            where: { companyId: f.company.id },
          }),
          p = await fresh();
        await verified(p.id);
        await photo(p.id);
        await close(p.id);
        assert.equal(
          await db.stockMovement.count({ where: { companyId: f.company.id } }),
          before,
        );
        assert.equal(
          await db.collection.count({ where: { deliveryId: p.id } }),
          0,
        );
        assert.equal(
          await db.remittance.count({ where: { companyId: f.company.id } }),
          0,
        );
        const r = await recipient(p.id);
        await assert.rejects(
          tracking.code(r.reference, r.session),
          denied("OTP_UNAVAILABLE"),
        );
      },
    );
    await t.test(
      "an earlier failed attempt cannot supply the photo for a new final delivery",
      async () => {
        const p = await fresh(),
          original = await photo(p.id),
          photoId = original.evidence[0]!.id;
        let mission = await d.detail(dc, p.id);
        mission = await d.attempt(dc, p.id, {
          ...action(mission),
          result: "FAILED",
          kind: "ABSENT",
        });
        assert.equal(
          (
            await db.deliveryEvidence.findUniqueOrThrow({
              where: { id: photoId },
            })
          ).status,
          "RETIRED",
        );
        const incident = mission.incidents.find((i) => i.status === "OPEN")!;
        await d.resolveIncident(ac, p.id, incident.id, {
          ...action(mission),
          incidentVersion: incident.version,
          decision: "RETRY",
        });
        await verified(p.id);
        const info = await s.confirmation(dc, p.id);
        await assert.rejects(
          s.complete(dc, p.id, { ...action(info), evidenceIds: [photoId] }),
          denied("PHOTO_REQUIRED"),
        );
        await photo(p.id, "#9944aa");
        assert.equal((await close(p.id)).status, "DELIVERED");
      },
    );
    await t.test(
      "cleanup removes only old unreferenced UUID files and preserves referenced evidence",
      async () => {
        const p = await fresh(),
          info = await photo(p.id),
          e = await db.deliveryEvidence.findUniqueOrThrow({
            where: { id: info.evidence[0]!.id },
          }),
          asset = await db.fileAsset.findUniqueOrThrow({
            where: { id: e.fileId },
          }),
          orphan = key() + ".webp",
          young = key() + ".webp",
          old = new Date(Date.now() - 172800000);
        await writeFile(
          path.join(f.files.directory, orphan),
          Buffer.from("Unreferenced test file"),
        );
        await writeFile(
          path.join(f.files.directory, young),
          Buffer.from("Recent test file"),
        );
        await utimes(path.join(f.files.directory, orphan), old, old);
        await utimes(path.join(f.files.directory, asset.storageKey), old, old);
        const dry = await cleanupProofFiles(db, f.files, false);
        assert.ok(dry.candidates.includes(orphan));
        assert.ok(!dry.candidates.includes(asset.storageKey));
        assert.ok(!dry.candidates.includes(young));
        await fileAccess(path.join(f.files.directory, orphan));
        await cleanupProofFiles(db, f.files, true);
        await assert.rejects(fileAccess(path.join(f.files.directory, orphan)));
        await fileAccess(path.join(f.files.directory, asset.storageKey));
      },
    );
    await t.test(
      "final photo links and file metadata are immutable",
      async () => {
        const p = await fresh();
        await verified(p.id);
        await photo(p.id);
        await close(p.id);
        const proof = await db.deliveryProof.findFirstOrThrow({
            where: { deliveryId: p.id },
          }),
          link = await db.proofPhoto.findFirstOrThrow({
            where: { proofId: proof.id },
          });
        await assert.rejects(db.proofPhoto.delete({ where: { id: link.id } }));
        await assert.rejects(
          db.fileAsset.update({
            where: { id: link.fileId },
            data: { checksumSha256: "0".repeat(64) },
          }),
        );
      },
    );
    await t.test(
      "pending financial correction freezes final closing until independently reviewed",
      async () => {
        const p = await fresh("1000");
        await finance.declare(dc, {
          deliveryId: p.id,
          deliveryVersion: p.version,
          operationKey: key(),
          amount: "1000",
          method: "CASH",
        });
        await verified(p.id);
        await photo(p.id);
        const collection = await db.collection.findFirstOrThrow({
          where: { deliveryId: p.id },
        });
        await finance.requestCorrection(dc, {
          operationKey: key(),
          kind: "COLLECTION",
          collectionId: collection.id,
          amount: "900",
          reason: "Declaration is under review before final delivery",
        });
        await assert.rejects(close(p.id), denied("FINANCIAL_REVIEW_PENDING"));
      },
    );
    await t.test(
      "an OTP exception does not waive the independent financial requirement",
      async () => {
        const p = await fresh("1000");
        await photo(p.id);
        await photo(p.id, "#f21a8c");
        await s.requestException(
          dc,
          p.id,
          action(await s.confirmation(dc, p.id)),
        );
        const info = await s.confirmation(ac, p.id),
          e = info.exceptions[0]!;
        await s.decideException(ac, p.id, e.id, {
          ...action(info),
          exceptionVersion: e.version,
          approve: true,
        });
        await assert.rejects(
          close(p.id, { exceptionId: e.id }),
          denied("COLLECTION_INCOMPLETE"),
        );
      },
    );
    await t.test(
      "suspended courier cannot verify, receive a new recipient code or complete",
      async () => {
        const p = await fresh(),
          raw = await code(p.id);
        await db.driverProfile.update({
          where: {
            companyId_userId: { companyId: f.company.id, userId: f.courier.id },
          },
          data: { status: "SUSPENDED",availability:"UNAVAILABLE" },
        });
        try {
          await assert.rejects(
            s.verifyCode(dc, p.id, { ...action(p), code: raw }),
          );
          const r = await recipient(p.id);
          await assert.rejects(
            tracking.code(r.reference, r.session),
            denied("OTP_UNAVAILABLE"),
          );
        } finally {
          await db.driverProfile.update({
            where: {
              companyId_userId: {
                companyId: f.company.id,
                userId: f.courier.id,
              },
            },
            data: { status: "ACTIVE",availability:"AVAILABLE" },
          });
        }
      },
    );
    await t.test(
      "session verification throttling is durable across service instances",
      async () => {
        const p = await fresh(),
          r = await recipient(p.id);
        for (let i = 0; i < 30; i++)
          await assert.rejects(
            tracking.verify(
              r.reference,
              "x".repeat(43),
              "brute-force-" + f.company.id,
            ),
          );
        await assert.rejects(
          new TrackingService(db).verify(
            r.reference,
            r.raw,
            "brute-force-" + f.company.id,
          ),
          denied("TRACKING_UNAVAILABLE"),
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
