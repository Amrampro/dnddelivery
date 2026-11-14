import "dotenv/config";
import { z } from "zod";
import { password, email } from "../src/modules/auth/validators.js";
const input = z
  .object({
    BOOTSTRAP_CONFIRM: z.literal("INITIALIZE_DND_SUPER_ADMIN"),
    BOOTSTRAP_EMAIL: z.string().trim().pipe(email),
    BOOTSTRAP_NAME: z.string().trim().min(2).max(160),
    BOOTSTRAP_PASSWORD: password,
  })
  .safeParse(process.env);
if (!input.success) {
  console.error(
    "Bootstrap refused: supply BOOTSTRAP_CONFIRM, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME and a password of 12-128 characters via the private environment. No account created.",
  );
  process.exit(1);
}
const { getDatabase, disconnectDatabase } = await import("../src/database/client.js");
const { hashPassword } = await import("../src/modules/auth/crypto.js");
try {
  const db = getDatabase(),
    encoded = await hashPassword(input.data.BOOTSTRAP_PASSWORD);
  const created = await db.$transaction(
    async (tx) => {
      const role = await tx.role.upsert({
        where: { code: "super_admin" },
        create: {
          code: "super_admin",
          name: "Super Administrateur",
          scope: "GLOBAL",
        },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM \`Role\` WHERE id = ${role.id} FOR UPDATE`;
      if (role.scope !== "GLOBAL")
        throw new Error("The super_admin role has an incompatible scope");
      const existing = await tx.globalRoleGrant.findFirst({
        include: { user: true },
      });
      if (existing) {
        if (
          existing.user.email === input.data.BOOTSTRAP_EMAIL &&
          existing.roleId === role.id
        )
          return false;
        throw new Error(
          "Bootstrap already completed for another account; refusing additional initial administrator",
        );
      }
      if (
        await tx.user.findUnique({
          where: { email: input.data.BOOTSTRAP_EMAIL },
        })
      )
        throw new Error(
          "Refusing to promote an existing account through bootstrap",
        );
      for (const code of [
        "workspace.access",
        "platform.manage",
        "subscriptions.validate",
      ]) {
        const permission = await tx.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        });
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
      const user = await tx.user.create({
        data: {
          email: input.data.BOOTSTRAP_EMAIL,
          fullName: input.data.BOOTSTRAP_NAME,
          passwordHash: encoded,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      await tx.globalRoleGrant.create({
        data: { userId: user.id, roleId: role.id, roleScope: "GLOBAL" },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "auth.initial_super_admin_created",
          entityType: "User",
          entityId: user.id,
        },
      });
      return true;
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
  console.log(
    created
      ? "Initial Super Administrator created. Remove bootstrap password variables from the environment."
      : "Already initialized for this account. No password, role or data changed.",
  );
} catch {
  console.error(
    "Bootstrap failed. Verify database, migrations and initialization state; no credentials are printed.",
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
