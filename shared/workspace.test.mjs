import { test } from "node:test";
import assert from "node:assert/strict";
import {
  definition,
  navigation,
  moduleAccess,
  mobileNavigation,
  mobileModuleAccess,
} from "./workspace.ts";
const fixtures = [
  [
    "super-admin",
    "GLOBAL",
    ["platform.manage", "subscriptions.validate"],
    "entreprises",
    "commandes",
  ],
  [
    "entreprise",
    "COMPANY",
    [
      "company.manage",
      "agencies.read",
      "users.read",
      "orders.read",
      "stocks.read",
      "deliveries.read",
      "collections.read",
      "reports.read",
      "subscriptions.read",
      "partners.read",
    ],
    "agences",
    "entreprises",
  ],
  [
    "agence",
    "AGENCY",
    ["orders.read", "stocks.read", "deliveries.read", "collections.read"],
    "commandes",
    "entreprises",
  ],
  ["stock", "AGENCY", ["stocks.read", "stocks.reserve"], "stocks", "commandes"],
  ["boutique", "SHOP", ["shop.orders.read"], "commandes", "encaissements"],
  [
    "livreur",
    "AGENCY",
    ["deliveries.read", "deliveries.self.read"],
    "courses",
    "stocks",
  ],
];
for (const [portal, scope, permissions, allowed, denied] of fixtures) {
  test(`${portal}: only effective permissions generate menus and route access on both platforms`, () => {
    const ctx = {
      portal,
      scope,
      key: "test",
      permissions: ["workspace.access", ...permissions],
    };
    assert.ok(definition(ctx));
    assert.ok(moduleAccess(ctx, allowed));
    assert.equal(moduleAccess(ctx, denied), undefined);
    assert.equal(moduleAccess(ctx, "../super-admin"), undefined);
    assert.ok(
      navigation(ctx).every((m) => ctx.permissions.includes(m.permission)),
    );
    const mobile = mobileNavigation(ctx);
    assert.ok(mobile.length >= 2 && mobile.length <= 5);
    assert.equal(mobile[0].id, "accueil");
    assert.equal(mobile.at(-1).id, "profil");
    assert.ok(mobile.every((m) => ctx.permissions.includes(m.permission)));
    assert.equal(mobileModuleAccess(ctx, denied), undefined);
    const removed = { ...ctx, permissions: ["workspace.access"] };
    assert.equal(moduleAccess(removed, allowed), undefined);
    assert.deepEqual(navigation({ ...ctx, permissions: [] }), []);
    assert.deepEqual(mobileNavigation({ ...ctx, permissions: [] }), []);
  });
}
test("unknown portal and missing affiliation never produce a workspace menu", () => {
  assert.deepEqual(
    navigation({
      portal: "unknown",
      scope: "COMPANY",
      key: "x",
      permissions: ["workspace.access"],
    }),
    [],
  );
});
test("company activity and stock movement shortcuts still enforce their permission", () => {
  const base = {
    scope: "COMPANY",
    key: "x",
    permissions: ["workspace.access"],
  };
  assert.equal(
    mobileModuleAccess({ ...base, portal: "entreprise" }, "activite"),
    undefined,
  );
  assert.equal(
    mobileModuleAccess({ ...base, portal: "stock" }, "mouvements"),
    undefined,
  );
});

test("shop management modules use explicit rights and keep employees away from user administration", () => {
  const employee = {
    portal: "boutique",
    scope: "SHOP",
    key: "shop-home:test",
    permissions: [
      "workspace.access",
      "shop.profile.read",
      "shop.collaborations.read",
      "shop.notifications.read",
    ],
  };
  assert.ok(moduleAccess(employee, "profil-boutique"));
  assert.ok(moduleAccess(employee, "transporteurs"));
  assert.equal(moduleAccess(employee, "utilisateurs-boutique"), undefined);
  assert.equal(moduleAccess(employee, "invitations-boutique"), undefined);
  assert.equal(moduleAccess(employee, "commandes"), undefined);
  const owner = {
    ...employee,
    permissions: [
      ...employee.permissions,
      "shop.users.read",
      "shop.users.manage",
    ],
  };
  assert.ok(moduleAccess(owner, "utilisateurs-boutique"));
  assert.ok(moduleAccess(owner, "invitations-boutique"));
});
