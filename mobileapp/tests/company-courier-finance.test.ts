import test from "node:test";
import assert from "node:assert/strict";
import {
  financeRequest,
  initialFinanceValues,
} from "../../shared/finance-actions.ts";
import type { FinanceEntry, FinanceFormTarget } from "../../shared/finance.ts";

const entry = (id: string, agencyId: string): FinanceEntry => ({
  id,
  agencyId,
  companyId: "company",
  reference: id,
  deliveryId: "delivery",
  orderId: "order",
  publicNumber: "ORDER",
  currency: "XAF",
  declaredAt: null,
  expectedSnapshot: "100",
  declaredAmount: "100",
  gross: "100",
  refunded: "0",
  net: "100",
  available: "100",
  legacy: false,
});
test("company courier remittance uses the selected agency and rejects mixed agencies", () => {
  const target: FinanceFormTarget = {
    code: "REMIT",
    entries: [entry("a", "agency-a"), entry("b", "agency-b")],
  };
  const values = {
    ...initialFinanceValues(target),
    acknowledged: true,
    agencyId: "agency-b",
    lines: { b: "100" },
  };
  const request = financeRequest(target, values, "operation-key");
  assert.equal(request.path, "/driver/cash-remittances");
  assert.equal("agencyId" in request.body && request.body.agencyId, "agency-b");
  assert.throws(() =>
    financeRequest(
      target,
      { ...values, lines: { a: "50", b: "50" } },
      "operation-key",
    ),
  );
  assert.throws(() =>
    financeRequest(
      target,
      { ...values, agencyId: "agency-a" },
      "operation-key",
    ),
  );
  assert.throws(() =>
    financeRequest(
      { ...target, agencyId: "agency-a" },
      values,
      "operation-key",
    ),
  );
});
