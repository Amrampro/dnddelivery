import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationChoice } from "./confirmation.ts";
const proof = (extra = {}) => ({
  eligible: true,
  otp: { status: "VERIFIED", current: true },
  evidence: [
    { id: "photo-a", kind: "HANDOVER", status: "READY", current: true },
    { id: "photo-b", kind: "HANDOVER", status: "READY", current: true },
  ],
  exceptions: [{ id: "approval", status: "APPROVED", current: true }],
  ...extra,
});
test("nominal confirmation combines a current OTP and selected current photos", () =>
  assert.deepEqual(confirmationChoice(proof(), ["photo-a"]), {
    evidenceIds: ["photo-a"],
  }));
test("a photo alone cannot choose nominal closure", () =>
  assert.throws(() => confirmationChoice(proof({ otp: null }), ["photo-a"])));
test("verified OTP from a previous assignment cannot choose nominal closure", () =>
  assert.throws(() =>
    confirmationChoice(proof({ otp: { status: "VERIFIED", current: false } }), [
      "photo-a",
    ]),
  ));
test("OTP without photos cannot choose closure", () =>
  assert.throws(() => confirmationChoice(proof(), [])));
test("old, attached, failure and unknown photos cannot be selected for a new confirmation", () => {
  for (const changed of [
    { current: false },
    { status: "ATTACHED" },
    { kind: "FAILURE" },
  ])
    assert.throws(() =>
      confirmationChoice(
        proof({
          evidence: [
            {
              id: "photo-a",
              kind: "HANDOVER",
              status: "READY",
              current: true,
              ...changed,
            },
          ],
        }),
        ["photo-a"],
      ),
    );
  assert.throws(() => confirmationChoice(proof(), ["unknown"]));
});
test("one photo cannot satisfy the approved exceptional procedure", () =>
  assert.throws(() =>
    confirmationChoice(proof({ otp: null }), ["photo-a"], "approval"),
  ));
test("an approved exception with two photo selections is explicit in the completion command", () =>
  assert.deepEqual(
    confirmationChoice(
      proof({ otp: null }),
      ["photo-a", "photo-b"],
      "approval",
    ),
    { evidenceIds: ["photo-a", "photo-b"], exceptionId: "approval" },
  ));
test("a pending, rejected or historic exception cannot replace OTP", () => {
  for (const changed of [
    { status: "PENDING" },
    { status: "REJECTED" },
    { current: false },
  ])
    assert.throws(() =>
      confirmationChoice(
        proof({
          exceptions: [
            { id: "approval", status: "APPROVED", current: true, ...changed },
          ],
        }),
        ["photo-a", "photo-b"],
        "approval",
      ),
    );
});
test("closed missions and duplicate photo selections are rejected by the interface", () => {
  assert.throws(() =>
    confirmationChoice(proof({ eligible: false }), ["photo-a"]),
  );
  assert.throws(() => confirmationChoice(proof(), ["photo-a", "photo-a"]));
});
