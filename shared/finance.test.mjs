import { test } from "node:test";
import assert from "node:assert/strict";
import { exactUnits, decimal, financialMoney } from "./finance.ts";
import {
  initialFinanceValues,
  financeRequest,
  selectedRemittanceTotal,
} from "./finance-actions.ts";
import { moduleAccess, mobileModuleAccess } from "./workspace.ts";
test("agency refund form remains separate from a courier refund and uses the original source", () => {
  const target = {
      code: "CORRECT",
      entry: { id: "source", currency: "XAF", gross: "1000.0000" },
    },
    v = {
      ...initialFinanceValues(target),
      kind: "AGENCY_REFUND",
      amount: "300",
      reason: "Agency refund performed externally",
      externalReference: "Agency acknowledgement",
      acknowledged: true,
    };
  assert.throws(() => financeRequest(target, v, "stable-key"), /responsable/);
  assert.equal(
    financeRequest({ ...target, allowAgencyRefund: true }, v, "stable-key").body
      .collectionId,
    "source",
  );
  assert.equal(
    financeRequest({ ...target, allowAgencyRefund: true }, v, "stable-key").body
      .kind,
    "AGENCY_REFUND",
  );
});
const entry = {
  id: "collection-a",
  currency: "XAF",
  publicNumber: "ORDER-A",
  available: "15000.0000",
  gross: "20000.0000",
  legacy: false,
  blocked: false,
};
const obligation = {
  id: "order",
  publicNumber: "ORDER",
  currency: "XAF",
  expected: "25000.0000",
  declared: "20000.0000",
  remaining: "5000.0000",
  mission: { id: "mission", version: 7 },
};
const values = (t, extra = {}) => ({
  ...initialFinanceValues(t),
  acknowledged: true,
  ...extra,
});
test("financial display and totals never convert exact money to floating point", () => {
  assert.equal(decimal(exactUnits("0.1") + exactUnits("0.2")), "0.3000");
  assert.equal(
    financialMoney("999999999999999.9999", "USD"),
    "999 999 999 999 999,9999 USD",
  );
  assert.throws(() => exactUnits("2e3"));
});
test("every sensitive financial form requires explicit user verification", () => {
  const t = { code: "DECLARE", obligation };
  assert.throws(
    () => financeRequest(t, initialFinanceValues(t), "stable-key"),
    /Confirmez/,
  );
});
test("collection sends only a documentary declaration and preserves the observed mission version", () => {
  const t = { code: "DECLARE", obligation };
  const r = financeRequest(t, values(t), "stable-key");
  assert.equal(r.path, "/driver/collections");
  assert.equal(r.body.deliveryVersion, 7);
  assert.equal(r.body.amount, "5000.0000");
  assert.equal(r.body.operationKey, "stable-key");
  assert.equal("status" in r.body, false);
  assert.equal(JSON.stringify(r).includes("DELIVERED"), false);
});
test("zero and excess declarations require a reason and locale decimal input is normalized exactly", () => {
  const t = { code: "DECLARE", obligation };
  assert.throws(
    () => financeRequest(t, values(t, { amount: "0" }), "stable-key"),
    /motif/,
  );
  assert.throws(
    () => financeRequest(t, values(t, { amount: "6000" }), "stable-key"),
    /motif/,
  );
  assert.equal(
    financeRequest(t, values(t, { amount: "0,1250" }), "stable-key").body
      .amount,
    "0.1250",
  );
});
test("partial remittance selection is bounded, single-currency and stable across source pages", () => {
  const peer = { ...entry, id: "collection-b", available: "4000.0000" },
    t = { code: "REMIT", agencyId: "agency", entries: [entry, peer] },
    v = values(t, {
      currency: "XAF",
      lines: { "collection-a": "10000", "collection-b": "2000" },
    });
  const r = financeRequest(t, v, "stable-key");
  assert.equal(r.body.items.length, 2);
  assert.equal(selectedRemittanceTotal(v), "12000.0000");
  assert.throws(
    () =>
      financeRequest(
        t,
        { ...v, lines: { "collection-a": "15001" } },
        "stable-key",
      ),
    /dépasse/,
  );
  assert.throws(
    () => financeRequest(t, { ...v, currency: "EUR" }, "stable-key"),
    /devise/,
  );
});
test("frozen or legacy collections cannot be allocated by either client", () => {
  for (const flag of ["blocked", "legacy"]) {
    const t = {
      code: "REMIT",
      agencyId: "agency",
      entries: [{ ...entry, [flag]: true }],
    };
    assert.throws(
      () =>
        financeRequest(
          t,
          values(t, { currency: "XAF", lines: { "collection-a": "1" } }),
          "stable-key",
        ),
      /utilisable/,
    );
  }
});
test("conforming confirmation cannot silently receive less and a dispute keeps explicit line amounts", () => {
  const t = {
      code: "DECIDE",
      remittance: {
        id: "remit",
        version: 3,
        currency: "XAF",
        items: [{ id: "item", declaredAmount: "15000.0000" }],
      },
    },
    v = values(t, {
      reason: "Physical count confirmed",
      lines: { item: "14000" },
    });
  assert.throws(() => financeRequest(t, v, "stable-key"), /écart/);
  const r = financeRequest(t, { ...v, decision: "DISPUTE" }, "stable-key");
  assert.equal(r.body.items[0].confirmedAmount, "14000");
  assert.equal(r.body.version, 3);
  assert.equal(
    financeRequest(t, { ...v, decision: "REJECT" }, "stable-key").body.items
      .length,
    0,
  );
});
test("correction requests keep the original source and refunds need an external physical reference", () => {
  const t = { code: "CORRECT", entry };
  assert.throws(
    () =>
      financeRequest(
        t,
        values(t, {
          kind: "REFUND",
          amount: "1000",
          reason: "Already physically refunded",
        }),
        "stable-key",
      ),
    /référence|constat/,
  );
  const r = financeRequest(
    t,
    values(t, {
      kind: "REFUND",
      amount: "1000",
      reason: "Already physically refunded",
      externalReference: "Signed acknowledgement",
    }),
    "stable-key",
  );
  assert.equal(r.body.collectionId, entry.id);
  assert.equal(r.body.kind, "REFUND");
  assert.equal("approved" in r.body, false);
});
test("partial-payment exceptions neither reduce the obligation nor bypass delivery proof", () => {
  const t = { code: "EXCEPTION", obligation },
    r = financeRequest(
      t,
      values(t, { reason: "Documented supervisor exception" }),
      "stable-key",
    );
  assert.equal(r.body.kind, "EXCEPTION");
  assert.equal(r.body.amount, "0");
  assert.equal(r.body.deliveryId, "mission");
  assert.equal(JSON.stringify(r).includes("DELIVERED"), false);
});
test("navigation separates operational finance, courier finances and shop-only order tracking", () => {
  const base = {
    scope: "AGENCY",
    portal: "livreur",
    permissions: ["workspace.access", "collections.self.read"],
  };
  assert.ok(moduleAccess(base, "encaissements"));
  assert.ok(mobileModuleAccess(base, "encaissements"));
  assert.equal(moduleAccess(base, "remises"), undefined);
  assert.equal(
    moduleAccess({ ...base, portal: "stock" }, "encaissements"),
    undefined,
  );
  assert.ok(
    moduleAccess(
      {
        portal: "boutique",
        scope: "SHOP",
        permissions: ["workspace.access", "shop.collections.read"],
      },
      "suivi-financier",
    ),
  );
  assert.equal(
    moduleAccess(
      {
        portal: "boutique",
        scope: "SHOP",
        permissions: ["workspace.access", "shop.collections.read"],
      },
      "remises",
    ),
    undefined,
  );
});
