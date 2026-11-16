import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationFixture } from "../helpers/confirmation-fixture.js";
import { loadWorkspaces } from "../../src/modules/auth/workspaces.js";
import * as v from "../../src/modules/collections/validation.js";
import { OrganizationService } from "../../src/modules/organization/service.js";

test("company courier works across agencies without agency memberships, with isolated missions and funds", async () => {
  const f = await confirmationFixture(true);
  try {
    const workspaces = await loadWorkspaces(f.db, f.courier.id);
    assert.ok(
      workspaces.some((w) => w.scope === "COMPANY" && w.portal === "livreur"),
    );
    assert.ok(!workspaces.some((w) => w.scope === "AGENCY"));
    for (const agencyId of [f.agency.id, f.otherAgency.id]) {
      const eligible = await f.d.eligible(f.cc, agencyId);
      assert.ok(eligible.some((d) => d.id === f.courier.id && !d.agencyLinked));
      const mission = await f.fresh("100", true, agencyId);
      assert.equal((await f.d.detail(f.dc, mission.id)).id, mission.id);
      await assert.rejects(f.d.detail(f.ec, mission.id));
      await assert.rejects(
        f.d.detail({ ...f.dc, companyId: f.other.id }, mission.id),
      );
      const entry = await f.finance.declare(
        f.dc,
        v.declaration.parse({
          deliveryId: mission.id,
          deliveryVersion: mission.version,
          operationKey: f.key(),
          amount: "100",
          method: "CASH",
        }),
      );
      const remit = await f.finance.createRemittance(
        f.dc,
        v.remittance.parse({
          agencyId,
          currency: "XAF",
          operationKey: f.key(),
          items: [{ collectionId: entry.entry.id, amount: "100" }],
        }),
      );
      assert.equal(remit.agencyId, agencyId);
      await f.verified(mission.id);
      await f.photo(mission.id);
      const confirmation = await f.s.confirmation(f.dc, mission.id);
      await f.s.complete(f.dc, mission.id, {
        ...f.action(confirmation),
        evidenceIds: confirmation.evidence
          .filter(
            (e) => e.current && e.kind === "HANDOVER" && e.status === "READY",
          )
          .map((e) => e.id),
      });
    }
    assert.equal(
      await f.db.agencyMembership.count({
        where: { companyId: f.company.id, userId: f.courier.id },
      }),
      0,
    );
    const organization = new OrganizationService(f.db);
    for (const agencyIds of [[f.agency.id], []]) {
      const membership = await f.db.companyMembership.findUniqueOrThrow({
        where: {
          companyId_userId: { companyId: f.company.id, userId: f.courier.id },
        },
      });
      await organization.updateEmployee(
        { ...f.cc, companyId: f.company.id },
        f.courier.id,
        {
          version: membership.version,
          role: "courier",
          agencyIds,
          status: "ACTIVE",
        },
      );
      const eligible = await f.d.eligible(f.ac, f.agency.id);
      assert.equal(
        eligible.find((d) => d.id === f.courier.id)?.agencyLinked,
        agencyIds.length > 0,
      );
      assert.ok(
        (await f.d.eligible(f.cc, f.otherAgency.id)).some(
          (d) => d.id === f.courier.id,
        ),
      );
    }
    await f.db.companyMembership.update({
      where: {
        companyId_userId: { companyId: f.company.id, userId: f.courier.id },
      },
      data: { active: false },
    });
    assert.equal((await loadWorkspaces(f.db, f.courier.id)).length, 0);
    assert.ok(
      !(await f.d.eligible(f.cc, f.agency.id)).some(
        (d) => d.id === f.courier.id,
      ),
    );
  } finally {
    await f.db.$disconnect();
  }
});
