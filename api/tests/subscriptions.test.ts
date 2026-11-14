import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextMonth,
  money,
  declarationInput,
} from "../src/modules/subscriptions/rules.js";
test("calendar monthly arithmetic clamps 29/30/31, leap years and retains UTC time", () => {
  for (const [a, b] of [
    ["2028-01-31", "2028-02-29"],
    ["2027-01-31", "2027-02-28"],
    ["2027-01-30", "2027-02-28"],
    ["2027-01-29", "2027-02-28"],
    ["2028-02-29", "2028-03-29"],
    ["2027-03-31", "2027-04-30"],
    ["2027-12-31", "2028-01-31"],
  ])
    assert.equal(
      nextMonth(new Date(a + "T12:34:56.789Z")).toISOString(),
      b + "T12:34:56.789Z",
    );
});
test("money is an exact decimal string, never exponent or binary float input", () => {
  for (const v of [
    "0",
    "-1",
    "1e3",
    "NaN",
    "0.00001",
    "1000000000000000",
    "1,5",
  ])
    assert.equal(money.safeParse(v).success, false);
  for (const v of ["0.0001", "12.3400", "999999999999999.9999"])
    assert.equal(money.parse(v), v);
  assert.equal(money.safeParse(1.1).success, false);
  assert.equal(
    declarationInput.safeParse({ companyId: "forged" }).success,
    false,
  );
});
