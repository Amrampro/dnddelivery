import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "../../src/database/client.js";
import { loadWorkspaces } from "../../src/modules/auth/workspaces.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !/^dnd_delivery[\w]*_test$/.test(new URL(url).pathname.slice(1)))
  throw new Error("Dedicated local test database required");

test("migration restores an active company admin workspace without the seed", async () => {
  const db = createDatabase(url);
  const rollback = new Error("Rollback test fixture and reference grants");
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { code: "company_admin" } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id, permission: { code: "workspace.access" } } });
      const user = await tx.user.create({ data: {
        email: `${randomUUID()}@example.invalid`, fullName: "Admin migration fixture", passwordHash: "unused",
      } });
      const company = await tx.company.create({ data: {
        reference: randomUUID(), name: "Active company", email: user.email,
        phone: "000", address: "Fixture", city: "Yaounde", countryCode: "CM", status: "ACTIVE",
      } });
      await tx.companyMembership.create({ data: { companyId: company.id, userId: user.id, roleId: role.id, active: true } });
      assert.deepEqual(await loadWorkspaces(tx, user.id), []);
      const otherGrants = await tx.rolePermission.count({ where: { roleId: { not: role.id } } });
      const sql = readFileSync(new URL("../../prisma/migrations/20261116150000_company_admin_base_permissions/migration.sql", import.meta.url), "utf8");
      const statements = sql.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
      const apply = async () => { for (const statement of statements) await tx.$executeRawUnsafe(statement); };
      await apply();
      const [workspace] = await loadWorkspaces(tx, user.id);
      assert.equal(workspace?.portal, "entreprise");
      assert.equal(workspace?.companyId, company.id);
      assert.ok(workspace.permissions.includes("company.manage"));
      assert.ok(!workspace.permissions.includes("platform.manage"));
      const grantCount = await tx.rolePermission.count();
      await apply();
      assert.equal(await tx.rolePermission.count(), grantCount, "migration is idempotent");
      assert.equal(await tx.rolePermission.count({ where: { roleId: { not: role.id } } }), otherGrants);
      await tx.company.update({ where: { id: company.id }, data: { status: "SUSPENDED" } });
      assert.deepEqual(await loadWorkspaces(tx, user.id), [], "suspension still denies access");
      await tx.company.update({ where: { id: company.id }, data: { status: "ACTIVE" } });
      await tx.companyMembership.updateMany({ where: { companyId: company.id, userId: user.id }, data: { active: false } });
      assert.deepEqual(await loadWorkspaces(tx, user.id), [], "revocation still denies access");
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
