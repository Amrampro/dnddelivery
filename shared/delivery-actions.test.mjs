import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryActionRequest,
  initialActionValues,
} from "./delivery-actions.ts";
import { navigationLink } from "./deliveries.ts";
import { moduleAccess, mobileModuleAccess } from "./workspace.ts";
const mission = {
  id: "mission",
  version: 8,
  order: { agencyId: "origin" },
  incidents: [{ id: "incident", status: "OPEN", version: 3 }],
  legs: [{ id: "leg", version: 4 }],
};
const values = (extra = {}) => ({ ...initialActionValues(mission), ...extra });
test("arrival and confirmation requests cannot mark a parcel delivered", () => {
  assert.deepEqual(
    deliveryActionRequest(mission, "ARRIVED", values(), "stable-key").body,
    { version: 8, operationKey: "stable-key", event: "ARRIVED" },
  );
  assert.equal(
    deliveryActionRequest(mission, "ATTEMPT_CONFIRM", values(), "stable-key")
      .body.result,
    "AWAITING_CONFIRMATION",
  );
  assert.throws(() =>
    deliveryActionRequest(mission, "DELIVERED", values(), "stable-key"),
  );
});
test("reassignment and failed attempts require an explicit reason", () => {
  for (const action of [
    "REASSIGN",
    "ATTEMPT_FAIL",
    "RETURN_REQUEST",
    "RETRY",
    "CANCEL",
    "HANDOVER_CANCEL:handover",
  ])
    assert.throws(
      () => deliveryActionRequest(mission, action, values(), "stable-key"),
      /motif/,
    );
  const r = deliveryActionRequest(
    mission,
    "ATTEMPT_FAIL",
    values({ reason: "  Client absent  ", kind: "ABSENT" }),
    "stable-key",
  );
  assert.equal(r.body.reason, "Client absent");
  assert.equal(r.body.result, "FAILED");
});
test("receipt at the transport origin retains the intended leg and versions", () => {
  const r = deliveryActionRequest(
    mission,
    "TRANSFER_RETURN_ORIGIN:leg",
    values({ reason: "Route fermée" }),
    "stable-key",
  );
  assert.equal(r.path, "/deliveries/mission/transfers/leg/receive");
  assert.equal(r.body.returnToOrigin, true);
  assert.equal(r.body.legVersion, 4);
  assert.equal(r.body.version, 8);
  assert.throws(
    () =>
      deliveryActionRequest(
        mission,
        "TRANSFER_RECEIVE:unknown",
        values(),
        "stable-key",
      ),
    /introuvable/,
  );
});
test("accepting custody uses delivery and handover versions separately", () => {
  const r = deliveryActionRequest(
    undefined,
    "HANDOVER_ACCEPT",
    values(),
    "stable-key",
    { id: "handover", deliveryId: "mission", version: 2, deliveryVersion: 9 },
  );
  assert.equal(r.path, "/driver/handovers/handover/confirm");
  assert.equal(r.body.version, 9);
  assert.equal(r.body.handoverVersion, 2);
  assert.equal(r.body.deliveryId, "mission");
});
test("damaged returns cannot request stock reintegration from either form", () => {
  const r = deliveryActionRequest(
    mission,
    "RETURN_RECEIVE",
    values({ condition: "DAMAGED", restock: true }),
    "stable-key",
  );
  assert.equal(r.body.restock, false);
  assert.equal(
    deliveryActionRequest(
      mission,
      "RETURN_RECEIVE",
      values({ restock: true }),
      "stable-key",
    ).body.restock,
    true,
  );
});
test("incident decisions require an open incident and the selected resource", () => {
  assert.throws(
    () =>
      deliveryActionRequest(
        mission,
        "RESOLVE_INCIDENT",
        values({ reason: "Réaffecter", decision: "REASSIGN" }),
        "stable-key",
      ),
    /livreur/,
  );
  assert.throws(
    () =>
      deliveryActionRequest(
        mission,
        "RESOLVE_INCIDENT",
        values({ reason: "Retour agence", decision: "RETURN", agencyId: "" }),
        "stable-key",
      ),
    /agence/,
  );
  assert.throws(
    () =>
      deliveryActionRequest(
        mission,
        "RESOLVE_INCIDENT",
        values({ reason: "Réessayer", incidentId: "closed" }),
        "stable-key",
      ),
    /ouvert/,
  );
});
test("maps encodes the destination without injecting another query parameter", () => {
  const r = new URL(navigationLink("Rue A & B, Douala #2"));
  assert.equal(r.searchParams.get("query"), "Rue A & B, Douala #2");
  assert.equal(r.searchParams.size, 2);
});
test("delivery menus require the matching operational or personal permission", () => {
  const context = {
    portal: "agence",
    scope: "AGENCY",
    permissions: ["workspace.access", "deliveries.read"],
  };
  assert.equal(moduleAccess(context, "affectations"), undefined);
  assert.equal(mobileModuleAccess(context, "affectations"), undefined);
  assert.ok(
    moduleAccess(
      {
        ...context,
        permissions: [...context.permissions, "deliveries.assign"],
      },
      "affectations",
    ),
  );
  assert.equal(
    moduleAccess({ ...context, portal: "livreur" }, "courses"),
    undefined,
  );
  assert.ok(
    mobileModuleAccess(
      {
        ...context,
        portal: "livreur",
        permissions: ["workspace.access", "deliveries.self.read"],
      },
      "courses",
    ),
  );
  assert.ok(
    moduleAccess(
      {
        ...context,
        portal: "boutique",
        scope: "SHOP",
        permissions: ["workspace.access", "shop.deliveries.read"],
      },
      "suivi",
    ),
  );
});
