import { randomUUID } from "node:crypto";
import { hashPassword } from "../../src/modules/auth/crypto.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { MemoryAuthStore } from "./memory-auth.store.js";
import type { AuthSettings } from "../../src/config/auth.js";
import type { Workspace } from "../../src/modules/auth/types.js";
export const fixturePassword = "fixture-only passphrase 2026";
let encoded: Promise<string> | undefined;
export async function authFixture() {
  const store = new MemoryAuthStore();
  let now = new Date();
  const userId = randomUUID(),
    companyA = randomUUID(),
    companyB = randomUUID(),
    agencyA = randomUUID();
  store.data.users.set(userId, {
    id: userId,
    email: "auth-fixture@example.invalid",
    passwordHash: await (encoded ??= hashPassword(fixturePassword)),
    fullName: "Compte de test isolé",
    phone: null,
    status: "ACTIVE",
    archivedAt: null,
  });
  store.data.companies.set(companyA, true);
  store.data.companies.set(companyB, true);
  store.data.agencies.add(`${companyA}:${agencyA}`);
  store.data.companyGrants.set(`${userId}:${companyA}`, {
    active: true,
    scope: "COMPANY",
    permissions: [],
  });
  store.data.agencyGrants.set(`${userId}:${companyA}:${agencyA}`, {
    active: true,
    scope: "AGENCY",
    permissions: ["workspace.access", "orders.read"],
  });
  store.data.companyGrants.set(`${userId}:${companyB}`, {
    active: true,
    scope: "COMPANY",
    permissions: ["workspace.access", "orders.read"],
  });
  const choices: Workspace[] = [
    {
      key: `agency:${companyA}:${agencyA}`,
      scope: "AGENCY",
      companyId: companyA,
      agencyId: agencyA,
      companyName: "Entreprise de test A",
      agencyName: "Agence de test",
      roleCode: "agency_manager",
      roleName: "Responsable d’agence",
      permissions: [],
      portal: "agence",
    },
    {
      key: `company:${companyB}`,
      scope: "COMPANY",
      companyId: companyB,
      companyName: "Entreprise de test B",
      roleCode: "company_admin",
      roleName: "Administrateur d’entreprise",
      permissions: [],
      portal: "entreprise",
    },
  ];
  store.data.contexts.set(userId, choices);
  const sent: Array<{ to: string; web: string; mobile: string }> = [];
  let mailAvailable = true;
  const settings: AuthSettings = {
    secret: "test-fixture-secret-only-32-bytes-minimum",
    accessSeconds: 60,
    refreshDays: 1,
    resetMinutes: 10,
    sameSite: "lax",
    webUrl: "http://localhost:5173",
    secure: false,
  };
  const service = new AuthService(
    store,
    settings,
    {
      available: () => mailAvailable,
      send: async (to, links) => {
        sent.push({ to, ...links });
      },
    },
    () => now,
  );
  return {
    store,
    service,
    settings,
    userId,
    companyA,
    companyB,
    agencyA,
    choices,
    sent,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    disableMail: () => {
      mailAvailable = false;
    },
  };
}
