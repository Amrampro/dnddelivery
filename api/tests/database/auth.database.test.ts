import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/database/client.js";
import { prismaAuthStore } from "../../src/modules/auth/prisma-auth.store.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { hashPassword } from "../../src/modules/auth/crypto.js";
const value = process.env.TEST_DATABASE_URL;
if (
  !value ||
  process.env.NODE_ENV !== "test" ||
  !/^dnd_delivery[\w]*_test$/.test(new URL(value).pathname.slice(1))
)
  throw new Error("Dedicated test database required");
const db = createDatabase(value);
test("MySQL authentication, rotation, dynamic memberships and reset tokens", async () => {
  const suffix = randomUUID(),
    password = "isolated mysql fixture password";
  const contact = {
    name: "Authentication test fixture",
    email: "fixture@example.invalid",
    phone: "0000000000",
    address: "Isolated test address",
    city: "Fixture city",
    countryCode: "CM",
  };
  const user = await db.user.create({
    data: {
      email: `${suffix}@example.invalid`,
      fullName: "Auth database fixture",
      passwordHash: await hashPassword(password),
    },
  });
  const a = await db.company.create({
      data: { ...contact, reference: randomUUID(), status: "ACTIVE" },
    }),
    b = await db.company.create({
      data: { ...contact, reference: randomUUID(), status: "ACTIVE" },
    });
  const baseRole = await db.role.create({
      data: {
        code: randomUUID(),
        name: "Base affiliation fixture",
        scope: "COMPANY",
      },
    }),
    companyRole = await db.role.create({
      data: {
        code: randomUUID(),
        name: "Company fixture role",
        scope: "COMPANY",
      },
    }),
    agencyRole = await db.role.create({
      data: {
        code: randomUUID(),
        name: "Agency fixture role",
        scope: "AGENCY",
      },
    });
  const permission = await db.permission.upsert({
    where: { code: "workspace.access" },
    create: {
      code: "workspace.access",
      description: "Professional workspace access",
    },
    update: {},
  });
  for (const role of [companyRole, agencyRole])
    await db.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
  await db.companyMembership.createMany({
    data: [
      { companyId: a.id, userId: user.id, roleId: baseRole.id },
      { companyId: b.id, userId: user.id, roleId: companyRole.id },
    ],
  });
  const agency = await db.agency.create({
    data: {
      companyId: a.id,
      reference: randomUUID(),
      name: "Fixture agency",
      address: contact.address,
      city: contact.city,
      phone: contact.phone,
    },
  });
  await db.agencyMembership.create({
    data: {
      companyId: a.id,
      agencyId: agency.id,
      userId: user.id,
      roleId: agencyRole.id,
    },
  });
  const sent: string[] = [];
  const service = new AuthService(
    prismaAuthStore(db),
    {
      secret: "isolated-mysql-test-secret-only-32bytes",
      accessSeconds: 60,
      refreshDays: 1,
      resetMinutes: 10,
      sameSite: "lax",
      secure: false,
      webUrl: "http://localhost:5173",
    },
    {
      available: () => true,
      send: async (_to, links) => {
        sent.push(links.web);
      },
    },
  );
  const login = await service.login(user.email, password, {
    client: "MOBILE",
    deviceName: "MySQL fixture",
    userAgent: null,
    ipHash: null,
  });
  let principal = await service.authenticate(login.accessToken, "MOBILE");
  assert.equal((await service.profile(principal)).organizations.length, 2);
  await service.switchOrganization(principal, `agency:${a.id}:${agency.id}`);
  principal = await service.authenticate(login.accessToken, "MOBILE");
  assert.equal(
    (await service.requirePermission(principal, "workspace.access")).agencyId,
    agency.id,
  );
  await db.agencyMembership.update({
    where: {
      companyId_agencyId_userId: {
        companyId: a.id,
        agencyId: agency.id,
        userId: user.id,
      },
    },
    data: { active: false },
  });
  await assert.rejects(
    service.requirePermission(principal, "workspace.access"),
  );
  await service.switchOrganization(principal, `company:${b.id}`);
  principal = await service.authenticate(login.accessToken, "MOBILE");
  await service.requirePermission(principal, "workspace.access");
  await db.company.update({
    where: { id: b.id },
    data: { status: "SUSPENDED" },
  });
  await assert.rejects(
    service.requirePermission(principal, "workspace.access"),
  );
  const next = await service.refresh(login.refreshToken, "MOBILE");
  await assert.rejects(service.refresh(login.refreshToken, "MOBILE"));
  await assert.rejects(service.authenticate(next.accessToken, "MOBILE"));
  await service.forgotPassword(user.email);
  await Promise.resolve();
  const token = new URL(sent[0]!).hash.split("token=")[1]!;
  await service.resetPassword(token, "changed mysql fixture password");
  await assert.rejects(
    service.resetPassword(token, "changed again fixture password"),
  );
  await assert.rejects(
    service.login(user.email, password, {
      client: "MOBILE",
      deviceName: "Test",
      userAgent: null,
      ipHash: null,
    }),
  );
  // Random fixtures remain in the explicitly dedicated test database; no pre-existing rows are deleted.
});
after(async () => {
  await db.$disconnect();
});
