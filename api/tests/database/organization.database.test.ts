import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import { createDatabase } from "../../src/database/client.js";
import { OrganizationService } from "../../src/modules/organization/service.js";
import { createOrganizationRouter } from "../../src/modules/organization/routes.js";
import { AdminService } from "../../src/modules/admin/service.js";
import { createInvitationRouter } from "../../src/modules/admin/routes.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { hashPassword, tokenHash } from "../../src/modules/auth/crypto.js";
import { errors } from "../../src/middlewares/errors.js";
import { assertDriverAssignable } from "../../src/modules/organization/access.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1))
)
  throw Error("Dedicated test database required");
test("MySQL internal organization: agencies, secure staff acceptance, scope, drivers and audit", async (t) => {
  const db = createDatabase(url),
    suffix = randomUUID().slice(0, 8),
    password = "Organization fixture password 2026",
    hash = await hashPassword(password);
  const admin = await db.user.create({
    data: {
      email: "org-admin-" + suffix + "@example.invalid",
      fullName: "Organization administrator",
      passwordHash: hash,
    },
  });
  const staff = await db.user.create({
    data: {
      email: "org-staff-" + suffix + "@example.invalid",
      fullName: "Existing staff account",
      passwordHash: hash,
    },
  });
  const outsider = await db.user.create({
    data: {
      email: "org-outsider-" + suffix + "@example.invalid",
      fullName: "Other account",
      passwordHash: hash,
    },
  });
  const companyRole = await db.role.findUniqueOrThrow({
    where: { code: "company_admin" },
  });
  const contact = {
    email: "org@example.invalid",
    phone: "0000000000",
    address: "Organization fixture",
    city: "Douala",
    countryCode: "CM",
  };
  const company = await db.company.create({
    data: {
      ...contact,
      name: "Organization " + suffix,
      reference: "ORG-" + suffix,
      status: "ACTIVE",
    },
  });
  const foreign = await db.company.create({
    data: {
      ...contact,
      name: "Other organization " + suffix,
      reference: "ORG-X-" + suffix,
      status: "ACTIVE",
    },
  });
  for (const c of [company, foreign]) {
    await db.companyMembership.create({
      data: {
        companyId: c.id,
        userId: admin.id,
        roleId: companyRole.id,
        roleScope: "COMPANY",
      },
    });
    const plan = await db.subscriptionPlan.upsert({
      where: { referenceSlot: 1 },
      create: {
        code: "reference",
        name: "Reference test plan",
        referenceSlot: 1,
        active: true,
      },
      update: {},
    });
    await db.subscription.create({
      data: {
        companyId: c.id,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
  }
  const emails: Array<{ to: string; link: string }> = [];
  let failMail = false;
  const adminService = new AdminService(
    db,
    {
      available: () => !failMail,
      send: async (to, link) => {
        emails.push({ to, link });
      },
    },
    "http://localhost:5173",
    48,
  );
  const service = new OrganizationService(db, adminService),
    auth = new AuthService(
      prismaAuthStore(db),
      {
        secret: "organization-test-secret-32-characters",
        accessSeconds: 600,
        refreshDays: 1,
        resetMinutes: 10,
        sameSite: "lax",
        webUrl: "http://localhost:5173",
        secure: false,
      },
      { available: () => false, send: async () => {} },
    );
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(
    "/api/company",
    createOrganizationRouter(
      false,
      false,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(
    "/api/driver",
    createOrganizationRouter(
      false,
      true,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(
    "/api/invitations",
    createInvitationRouter(
      () => adminService,
      ["http://localhost:5173"],
      () => auth,
    ),
  );
  app.use(
    "/api/admin/companies/:companyId/organization",
    createOrganizationRouter(
      true,
      false,
      () => auth,
      () => service,
      ["http://localhost:5173"],
    ),
  );
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  async function client(email: string, contextKey?: string) {
    const login = await auth.login(email, password, {
      client: "MOBILE",
      deviceName: "Organization mobile test",
      userAgent: null,
      ipHash: null,
    });
    let p = await auth.authenticate(login.accessToken, "MOBILE");
    if (contextKey) {
      await auth.switchOrganization(p, contextKey);
      p = await auth.authenticate(login.accessToken, "MOBILE");
    }
    return {
      principal: p,
      request: async (
        path: string,
        method = "GET",
        body?: unknown,
        extra: Record<string, string> = {},
      ) => {
        const r = await fetch("http://127.0.0.1:" + port + "/api" + path, {
          method,
          headers: {
            "X-DND-Client": "mobile",
            Authorization: "Bearer " + login.accessToken,
            "Content-Type": "application/json",
            ...extra,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      },
    };
  }
  const owner = await client(admin.email, "company:" + company.id),
    other = await client(outsider.email),
    recipient = await client(staff.email);
  const c = {
    actorId: admin.id,
    companyId: company.id,
    scope: "COMPANY" as const,
  };
  const agencyInput = (reference: string) => ({
    reference,
    name: "Agence " + reference,
    phone: contact.phone,
    email: null,
    countryCode: "CM",
    city: "Douala",
    zone: "Quartier test",
    address: contact.address,
    locationNotes: null,
  });
  const token = () =>
    new URLSearchParams(new URL(emails.at(-1)!.link).hash.slice(1)).get(
      "token",
    )!;
  let a = "",
    b = "",
    foreignAgency = "",
    newCourier = "",
    manager = "",
    invitationId = "";
  try {
    await t.test(
      "authorized company profile edit is whitelisted and versioned; status/reference cannot be forged",
      async () => {
        const p = await owner.request("/company/profile");
        assert.equal(p.status, 200);
        assert.equal(p.body.id, company.id);
        const input = {
          version: p.body.version,
          tradeName: "Nom commercial " + suffix,
          address: contact.address,
          phone: contact.phone,
          email: contact.email,
          city: contact.city,
          countryCode: "CM",
          description: "Profil de recette",
        };
        assert.equal(
          (
            await owner.request("/company/profile", "PATCH", {
              ...input,
              status: "ACTIVE",
            })
          ).status,
          400,
        );
        assert.equal(
          (await owner.request("/company/profile", "PATCH", input)).status,
          200,
        );
        assert.equal(
          (await owner.request("/company/profile", "PATCH", input)).status,
          409,
        );
        assert.equal(
          (await db.company.findUniqueOrThrow({ where: { id: company.id } }))
            .reference,
          company.reference,
        );
      },
    );
    await t.test(
      "agency creation persists, enforces tenant reference uniqueness without subscription charge",
      async () => {
        assert.equal(
          (await other.request("/company/agencies", "POST", agencyInput("NO")))
            .status,
          403,
        );
        const before = await db.subscriptionPayment.count({
          where: { companyId: company.id },
        });
        const created = await owner.request(
          "/company/agencies",
          "POST",
          agencyInput("A-" + suffix),
        );
        assert.equal(created.status, 201, JSON.stringify(created.body));
        a = created.body.id;
        b = (
          await owner.request(
            "/company/agencies",
            "POST",
            agencyInput("B-" + suffix),
          )
        ).body.id;
        assert.ok(b);
        assert.equal(
          (
            await owner.request(
              "/company/agencies",
              "POST",
              agencyInput("A-" + suffix),
            )
          ).status,
          409,
        );
        foreignAgency = (
          await service.createAgency(
            { ...c, companyId: foreign.id },
            agencyInput("A-" + suffix),
          )
        ).id;
        assert.equal(
          await db.subscriptionPayment.count({
            where: { companyId: company.id },
          }),
          before,
        );
      },
    );
    await t.test(
      "search/pagination and cross-company agency ID isolation; strict fields and hostile origin",
      async () => {
        const list = await owner.request(
          "/company/agencies?q=" + suffix + "&size=1",
        );
        assert.equal(list.body.total, 2);
        assert.equal(list.body.items.length, 1);
        assert.equal(
          (await owner.request("/company/agencies/" + foreignAgency)).status,
          404,
        );
        assert.equal(
          (
            await owner.request("/company/agencies", "POST", {
              ...agencyInput("X-" + suffix),
              companyId: foreign.id,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await owner.request(
              "/company/agencies",
              "POST",
              agencyInput("Y-" + suffix),
              { Origin: "https://hostile.invalid" },
            )
          ).status,
          403,
        );
      },
    );
    await t.test("agency modification and stale version conflict", async () => {
      const agency = (await owner.request("/company/agencies/" + a)).body;
      const updated = await owner.request("/company/agencies/" + a, "PATCH", {
        ...agencyInput(agency.reference),
        name: "Agence modifiée",
        version: agency.version,
      });
      assert.equal(updated.status, 200);
      assert.equal(
        (
          await owner.request("/company/agencies/" + a, "PATCH", {
            ...agencyInput(agency.reference),
            version: agency.version,
          })
        ).status,
        409,
      );
    });
    await t.test(
      "existing account invitation never grants access until authenticated recipient accepts",
      async () => {
        const invite = await owner.request(
          "/company/employees/invite",
          "POST",
          {
            email: staff.email,
            fullName: "Existing staff",
            role: "agency_manager",
            agencyIds: [a, b],
          },
        );
        assert.equal(invite.status, 201, JSON.stringify(invite.body));
        invitationId = invite.body.id;
        const raw = token(),
          stored = await db.companyInvitation.findUniqueOrThrow({
            where: { id: invitationId },
          });
        assert.notEqual(stored.tokenHash, raw);
        assert.equal(stored.tokenHash, tokenHash(raw));
        assert.equal(
          await db.companyMembership.count({
            where: { companyId: company.id, userId: staff.id },
          }),
          0,
        );
        const inspected = await adminService.inspect(raw);
        assert.equal(inspected.existingAccount, true);
        assert.equal(
          (
            await other.request("/invitations/accept-existing", "POST", {
              token: raw,
            })
          ).status,
          403,
        );
        const oldHash = (
          await db.user.findUniqueOrThrow({ where: { id: staff.id } })
        ).passwordHash;
        assert.equal(
          (
            await recipient.request("/invitations/accept-existing", "POST", {
              token: raw,
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: staff.id } }))
            .passwordHash,
          oldHash,
        );
        assert.equal(
          (
            await recipient.request("/invitations/accept-existing", "POST", {
              token: raw,
            })
          ).status,
          400,
        );
        manager = staff.id;
        assert.equal(
          await db.agencyMembership.count({
            where: { companyId: company.id, userId: staff.id, active: true },
          }),
          2,
        );
      },
    );
    await t.test(
      "agency manager has only authorized agency/team, cannot edit company or pick foreign scope",
      async () => {
        const m = await client(staff.email, "agency:" + company.id + ":" + a);
        assert.equal((await m.request("/company/agencies")).body.total, 1);
        assert.equal(
          (await m.request("/company/employees")).body.items.length,
          1,
        );
        assert.equal((await m.request("/company/agencies/" + b)).status, 404);
        assert.equal(
          (await m.request("/company/employees?agencyId=" + b)).status,
          403,
        );
        assert.equal(
          (await m.request("/company/agencies", "POST", agencyInput("DENIED")))
            .status,
          403,
        );
        assert.equal(
          (await m.request("/company/profile", "PATCH", {})).status,
          403,
        );
      },
    );
    await t.test(
      "principal manager must be assigned, changes audited",
      async () => {
        const agency = await db.agency.findUniqueOrThrow({ where: { id: a } });
        assert.equal(
          (
            await owner.request(
              "/company/agencies/" + a + "/primary",
              "PATCH",
              { version: agency.version, userId: outsider.id },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await owner.request(
              "/company/agencies/" + a + "/primary",
              "PATCH",
              { version: agency.version, userId: manager },
            )
          ).status,
          200,
        );
        assert.equal(
          (await db.agency.findUniqueOrThrow({ where: { id: a } }))
            .primaryManagerUserId,
          manager,
        );
      },
    );
    await t.test(
      "new courier account activation uses same invitation system, no default password, two agencies",
      async () => {
        const email = "org-courier-" + suffix + "@example.invalid";
        const created = await owner.request(
          "/company/employees/invite",
          "POST",
          {
            email,
            fullName: "New courier test",
            role: "courier",
            agencyIds: [a, b],
          },
        );
        assert.equal(created.status, 201);
        const raw = token();
        assert.equal(await db.user.count({ where: { email } }), 0);
        const accepted = await other.request("/invitations/accept", "POST", {
          token: raw,
          fullName: "Courier test",
          password,
        });
        assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
        newCourier = (await db.user.findUniqueOrThrow({ where: { email } })).id;
        const profile = await db.driverProfile.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: newCourier },
          },
        });
        assert.equal(profile.status, "ACTIVE");
        assert.equal(profile.availability, "UNAVAILABLE");
        assert.equal(
          await db.agencyMembership.count({
            where: { companyId: company.id, userId: newCourier, active: true },
          }),
          2,
        );
      },
    );
    await t.test(
      "courier mobile transport changes own availability only, with server time and version",
      async () => {
        const user = await db.user.findUniqueOrThrow({
            where: { id: newCourier },
          }),
          courier = await client(user.email, "agency:" + company.id + ":" + a);
        const p = await courier.request("/driver/profile");
        assert.equal(p.status, 200);
        assert.equal(p.body.user.id, newCourier);
        const d = p.body.driverProfile;
        const changed = await courier.request("/driver/availability", "PATCH", {
          version: d.version,
          availability: "AVAILABLE",
        });
        assert.equal(changed.status, 200, JSON.stringify(changed.body));
        assert.equal(changed.body.availability, "AVAILABLE");
        assert.ok(
          new Date(changed.body.availabilityChangedAt).getTime() <= Date.now(),
        );
        assert.equal(
          (
            await courier.request("/driver/availability", "PATCH", {
              version: changed.body.version,
              availability: "UNAVAILABLE",
              userId: manager,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await owner.request("/driver/availability", "PATCH", {
              version: changed.body.version,
              availability: "UNAVAILABLE",
            })
          ).status,
          403,
        );
        assert.equal(
          (await courier.request("/company/agencies/" + a)).body
            .agencyMembership_agencyRecords,
          undefined,
        );
      },
    );
    await t.test(
      "driver profile suspension forces unavailable and removes operational permission immediately",
      async () => {
        let d = await db.driverProfile.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: newCourier },
          },
        });
        const changed = await owner.request(
          "/company/drivers/" + newCourier,
          "PATCH",
          {
            version: d.version,
            employeeNumber: "D-" + suffix,
            status: "SUSPENDED",
            transport: "MOTORBIKE",
            notes: "Note de recette",
          },
        );
        assert.equal(changed.status, 200);
        d = changed.body;
        assert.equal(d.availability, "UNAVAILABLE");
        const courier = await client(
          (await db.user.findUniqueOrThrow({ where: { id: newCourier } }))
            .email,
          "agency:" + company.id + ":" + a,
        );
        assert.equal((await courier.request("/driver/profile")).status, 200);
        assert.equal(
          (
            await courier.request("/driver/availability", "PATCH", {
              version: d.version,
              availability: "AVAILABLE",
            })
          ).status,
          403,
        );
        await assert.rejects(
          auth.requirePermission(courier.principal, "deliveries.read"),
        );
      },
    );
    await t.test(
      "courier profile reactivation and exact multi-agency assignment stay within tenant",
      async () => {
        const d = await db.driverProfile.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: newCourier },
          },
        });
        assert.equal(
          (
            await owner.request("/company/drivers/" + newCourier, "PATCH", {
              version: d.version,
              employeeNumber: "D-" + suffix,
              status: "ACTIVE",
              transport: "BICYCLE",
              notes: null,
            })
          ).status,
          200,
        );
        const m = await db.companyMembership.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: newCourier },
          },
        });
        assert.equal(
          (
            await owner.request(
              "/company/drivers/" + newCourier + "/assignments",
              "PATCH",
              {
                version: m.version,
                role: "courier",
                agencyIds: [foreignAgency],
                status: "ACTIVE",
              },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await owner.request(
              "/company/drivers/" + newCourier + "/assignments",
              "PATCH",
              {
                version: m.version,
                role: "courier",
                agencyIds: [b],
                status: "ACTIVE",
              },
            )
          ).status,
          200,
        );
        assert.equal(
          await db.agencyMembership.count({
            where: { companyId: company.id, userId: newCourier, active: true },
          }),
          1,
        );
      },
    );
    await t.test(
      "inactive agency conserves records, removes context and denies new assignments",
      async () => {
        const agency = await db.agency.findUniqueOrThrow({ where: { id: b } });
        const changed = await owner.request(
          "/company/agencies/" + b + "/status",
          "PATCH",
          {
            version: agency.version,
            status: "INACTIVE",
            reason: "Travaux de recette",
          },
        );
        assert.equal(changed.status, 200, JSON.stringify(changed.body));
        assert.equal(
          await db.agencyMembership.count({
            where: { companyId: company.id, agencyId: b },
          }),
          2,
        );
        const m = await db.companyMembership.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: newCourier },
          },
        });
        assert.equal(
          (
            await owner.request("/company/employees/" + newCourier, "PATCH", {
              version: m.version,
              role: "courier",
              agencyIds: [b],
              status: "ACTIVE",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await owner.request("/company/employees/invite", "POST", {
              email: "inactive-" + suffix + "@example.invalid",
              fullName: "No",
              role: "employee",
              agencyIds: [b],
            })
          ).status,
          409,
        );
        const current = await db.agency.findUniqueOrThrow({ where: { id: b } });
        assert.equal(
          (
            await owner.request("/company/agencies/" + b + "/status", "PATCH", {
              version: current.version,
              status: "ACTIVE",
              reason: "Réouverture",
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "withdrawal revokes current access and clears principal without deleting account or other tenant",
      async () => {
        const otherMembership = await db.companyMembership.create({
          data: {
            companyId: foreign.id,
            userId: staff.id,
            roleId: companyRole.id,
          },
        });
        const session = await client(
          staff.email,
          "agency:" + company.id + ":" + a,
        );
        const m = await db.companyMembership.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: staff.id },
          },
        });
        assert.equal(
          (
            await owner.request(
              "/company/employees/" + staff.id + "/affiliation",
              "DELETE",
              { version: m.version, reason: "Fin de collaboration test" },
            )
          ).status,
          200,
        );
        assert.equal((await session.request("/company/agencies")).status, 403);
        assert.equal(
          (await db.agency.findUniqueOrThrow({ where: { id: a } }))
            .primaryManagerUserId,
          null,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: staff.id } })).status,
          "ACTIVE",
        );
        assert.equal(
          (
            await db.companyMembership.findUniqueOrThrow({
              where: { id: otherMembership.id },
            })
          ).active,
          true,
        );
        await auth.switchOrganization(
          session.principal,
          "company:" + foreign.id,
        );
      },
    );
    await t.test(
      "company administrator and last administrator cannot be demoted through personnel endpoint",
      async () => {
        const m = await db.companyMembership.findUniqueOrThrow({
          where: {
            companyId_userId: { companyId: company.id, userId: admin.id },
          },
        });
        assert.equal(
          (
            await owner.request("/company/employees/" + admin.id, "PATCH", {
              version: m.version,
              role: "employee",
              agencyIds: [],
              status: "INACTIVE",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await owner.request(
              "/company/employees/" + admin.id + "/affiliation",
              "DELETE",
              { version: m.version, reason: "Forbidden" },
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "invitation resend rotates token, SMTP failure is retriable, expiration and revocation are final",
      async () => {
        failMail = true;
        const email = "retry-org-" + suffix + "@example.invalid";
        const created = await owner.request(
          "/company/employees/invite",
          "POST",
          {
            email,
            fullName: "Retry employee",
            role: "employee",
            agencyIds: [],
          },
        );
        assert.equal(created.body.invitationDelivery, "FAILED");
        const id = created.body.id;
        let i = await db.companyInvitation.findUniqueOrThrow({ where: { id } });
        failMail = false;
        assert.equal(
          (
            await owner.request(
              "/company/staff-invitations/" + id + "/resend",
              "POST",
              { version: i.version },
            )
          ).body.invitationDelivery,
          "SENT",
        );
        const raw = token();
        i = await db.companyInvitation.findUniqueOrThrow({ where: { id } });
        assert.equal(
          (
            await owner.request(
              "/company/staff-invitations/" + id + "/resend",
              "POST",
              { version: i.version },
            )
          ).status,
          200,
        );
        await assert.rejects(adminService.inspect(raw));
        const currentRaw = token();
        await db.companyInvitation.update({
          where: { id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await assert.rejects(adminService.inspect(currentRaw));
        i = await db.companyInvitation.findUniqueOrThrow({ where: { id } });
        assert.equal(
          (
            await owner.request(
              "/company/staff-invitations/" + id + "/revoke",
              "POST",
              { version: i.version },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await other.request("/invitations/accept", "POST", {
              token: currentRaw,
              fullName: "No",
              password,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "expired subscription blocks organization writes, preserves reads, global may intervene",
      async () => {
        const sub = await db.subscription.findUniqueOrThrow({
          where: { companyId: company.id },
        });
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            expiresAt: new Date(Date.now() - 1000),
            startedAt: new Date(Date.now() - 86400000),
          },
        });
        assert.equal(
          (
            await owner.request(
              "/company/agencies",
              "POST",
              agencyInput("EXPIRED"),
            )
          ).status,
          403,
        );
        assert.equal((await owner.request("/company/agencies")).status, 200);
        const globalRole = await db.role.create({
          data: {
            code: "org_global_" + suffix,
            name: "Organization global test",
            scope: "GLOBAL",
          },
        });
        for (const code of ["platform.manage", "workspace.access"]) {
          const permission = await db.permission.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
          });
          await db.rolePermission.create({
            data: { roleId: globalRole.id, permissionId: permission.id },
          });
        }
        await db.globalRoleGrant.create({
          data: { userId: admin.id, roleId: globalRole.id },
        });
        const global = await client(admin.email, "global");
        assert.equal(
          (
            await global.request(
              "/admin/companies/" + company.id + "/organization/agencies",
              "POST",
              agencyInput("GLOBAL-" + suffix),
            )
          ).status,
          201,
        );
        await db.subscription.update({
          where: { id: sub.id },
          data: { expiresAt: new Date(Date.now() + 86400000) },
        });
      },
    );
    await t.test(
      "administrative suspension remains independent and blocks tenant immediately",
      async () => {
        await db.company.update({
          where: { id: company.id },
          data: { status: "SUSPENDED" },
        });
        assert.equal((await owner.request("/company/agencies")).status, 403);
        await db.company.update({
          where: { id: company.id },
          data: { status: "ACTIVE" },
        });
      },
    );
    await t.test(
      "stock manager is scoped to assigned agencies without administration or staff listing",
      async () => {
        const invite = await owner.request(
          "/company/employees/invite",
          "POST",
          {
            email: outsider.email,
            fullName: "Stock manager",
            role: "stock_manager",
            agencyIds: [a, b],
          },
        );
        assert.equal(invite.status, 201);
        assert.equal(
          (
            await other.request("/invitations/accept-existing", "POST", {
              token: token(),
            })
          ).status,
          200,
        );
        const stock = await client(
          outsider.email,
          "agency:" + company.id + ":" + a,
        );
        assert.equal((await stock.request("/company/agencies")).body.total, 1);
        assert.equal((await stock.request("/company/employees")).status, 403);
        assert.equal(
          (await stock.request("/company/profile", "PATCH", {})).status,
          403,
        );
        const self = await stock.request("/company/organization/self");
        assert.equal(
          self.body.agencyMembership_membershipRecords.filter(
            (m: { active: boolean }) => m.active,
          ).length,
          2,
        );
      },
    );
    await t.test(
      "open agency operations prevent silent deactivation without deleting data",
      async () => {
        const shop = await db.shop.create({
          data: {
            reference: randomUUID(),
            name: "Organization blocker shop",
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
          },
        });
        await db.companyShop.create({
          data: { companyId: company.id, shopId: shop.id, status: "ACTIVE" },
        });
        const order = await db.order.create({
          data: {
            companyId: company.id,
            shopId: shop.id,
            agencyId: a,
            publicNumber: randomUUID(),
            createdById: admin.id,
            type: "ONE_OFF",
            recipientName: "Fixture recipient",
            recipientEmail: contact.email,
            recipientPhone: contact.phone,
            recipientAddress: contact.address,
            recipientCity: contact.city,
            amountToCollect: "0",
            currency: "XAF",
          },
        });
        const agency = await db.agency.findUniqueOrThrow({ where: { id: a } });
        assert.equal(
          (
            await owner.request("/company/agencies/" + a + "/status", "PATCH", {
              version: agency.version,
              status: "INACTIVE",
              reason: "Must not lose unfinished order",
            })
          ).status,
          409,
        );
        assert.equal(
          (await db.agency.findUniqueOrThrow({ where: { id: a } })).status,
          "ACTIVE",
        );
        assert.equal(await db.order.count({ where: { id: order.id } }), 1);
        await db.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
      },
    );
    await t.test(
      "future dispatch eligibility requires active available courier and authorized agency",
      async () => {
        await assert.rejects(
          db.$transaction((tx) =>
            assertDriverAssignable(tx, company.id, b, newCourier),
          ),
        );
        const courier = await client(
          (await db.user.findUniqueOrThrow({ where: { id: newCourier } }))
            .email,
          "agency:" + company.id + ":" + b,
        );
        const current = (await courier.request("/driver/profile")).body
          .driverProfile;
        assert.equal(
          (
            await courier.request("/driver/availability", "PATCH", {
              version: current.version,
              availability: "AVAILABLE",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await db.$transaction((tx) =>
              assertDriverAssignable(tx, company.id, b, newCourier),
            )
          ).userId,
          newCourier,
        );
        await assert.rejects(
          db.$transaction((tx) =>
            assertDriverAssignable(tx, foreign.id, foreignAgency, newCourier),
          ),
        );
      },
    );
    await t.test('global administrator withdrawal also clears agency responsibility and affiliations',async()=>{
      const m=await db.companyMembership.findUniqueOrThrow({where:{companyId_userId:{companyId:company.id,userId:manager}}});
      await service.updateEmployee(c,manager,{version:m.version,role:'agency_manager',agencyIds:[a,b],status:'ACTIVE'});
      const agency=await db.agency.findUniqueOrThrow({where:{id:a}});await service.primary(c,a,{version:agency.version,userId:manager});
      let current=await db.company.findUniqueOrThrow({where:{id:company.id}});await adminService.addAdmin(admin.id,company.id,manager,current.version,false);
      current=await db.company.findUniqueOrThrow({where:{id:company.id}});await adminService.removeAdmin(admin.id,company.id,manager,current.version);
      assert.equal((await db.agency.findUniqueOrThrow({where:{id:a}})).primaryManagerUserId,null);
      assert.equal(await db.agencyMembership.count({where:{companyId:company.id,userId:manager,active:true}}),0);
      assert.equal((await db.companyMembership.findUniqueOrThrow({where:{companyId_userId:{companyId:foreign.id,userId:manager}}})).active,true);
    });
    await t.test(
      "audit and invitations omit secrets and are tenant-scoped",
      async () => {
        const history = await owner.request("/company/organization/history");
        assert.equal(history.status, 200);
        assert.ok(history.body.total > 10);
        assert.ok(!JSON.stringify(history.body).includes("tokenHash"));
        const invites = await owner.request("/company/staff-invitations");
        assert.equal(invites.status, 200);
        assert.ok(invites.body.items.length > 0);
        assert.ok(!JSON.stringify(invites.body).includes("tokenHash"));
        const drivers = await owner.request("/company/drivers?q=Courier");
        assert.ok(
          drivers.body.items.some(
            (m: { userId: string }) => m.userId === newCourier,
          ),
        );
      },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
