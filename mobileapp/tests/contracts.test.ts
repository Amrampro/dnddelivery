import test from "node:test";
import assert from "node:assert/strict";
import { parseProfile, parseWorkspace } from "../src/auth/contracts.ts";
import {
  notificationDelivery,
  deliveryModule,
  notificationTarget,
  notificationModule,
} from "../src/confirmation/notification-target.ts";
const context = {
  key: "agency:a",
  scope: "AGENCY" as const,
  agencyId: "a",
  companyName: "Company",
  roleCode: "courier",
  roleName: "Livreur",
  portal: "livreur",
  permissions: ["deliveries.self.read"],
};
test("a malformed workspace or permission array cannot authorize navigation", () => {
  for (const value of [
    null,
    {},
    { ...context, permissions: "all" },
    { ...context, permissions: [3] },
  ])
    assert.throws(() => parseWorkspace(value), { code: "INVALID_WORKSPACE" });
  assert.equal(parseWorkspace(context).key, "agency:a");
});
test("a valid signed-in profile can have no active organization", () => {
  const p = {
    user: {
      id: "a",
      email: "a@example.invalid",
      fullName: "Courier",
      phone: null,
    },
    organizations: [context],
    activeContext: null,
    csrfToken: null,
  };
  assert.equal(parseProfile(p).activeContext, null);
  assert.throws(
    () => parseProfile({ ...p, organizations: [{ permissions: "all" }] }),
    { code: "INVALID_PROFILE" },
  );
});
test("notification payloads cannot inject a URL or arbitrary route", () => {
  for (const value of [
    null,
    { url: "https://other.invalid" },
    { deliveryId: "../../admin" },
    { deliveryId: 9 },
  ])
    assert.equal(notificationDelivery(value), undefined);
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(notificationDelivery({ deliveryId: id, url: "ignored" }), id);
});
test("notification destinations follow current API permissions and selected agency", () => {
  assert.equal(deliveryModule(context), "courses");
  assert.equal(deliveryModule({ ...context, scope: "COMPANY" }), undefined);
  assert.equal(
    deliveryModule({ ...context, permissions: ["deliveries.supervise.read"] }),
    "livraisons",
  );
  assert.equal(
    deliveryModule({
      ...context,
      scope: "SHOP",
      permissions: ["shop.deliveries.read"],
    }),
    "suivi",
  );
  assert.equal(deliveryModule({ ...context, permissions: [] }), undefined);
});
test("a financial alert requires the matching company and actual remittance permission", () => {
  const companyId = "123e4567-e89b-42d3-a456-426614174000";
  const target = notificationTarget({ module: "remises", companyId })!;
  assert.equal(
    notificationModule(target, {
      ...context,
      companyId,
      permissions: ["remittances.self.read"],
    }),
    "remises",
  );
  assert.equal(
    notificationModule(target, {
      ...context,
      companyId: "another",
      permissions: ["remittances.read"],
    }),
    undefined,
  );
  assert.equal(
    notificationModule(target, { ...context, companyId, permissions: [] }),
    undefined,
  );
  assert.equal(notificationTarget({ module: "admin", companyId }), undefined);
});
