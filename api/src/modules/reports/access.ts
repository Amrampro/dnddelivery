import { Prisma } from "../../generated/prisma/client.js";
import { authorizeGlobal, authorizeShop, authorizeTenant } from "../authorization/tenant-access.js";
import { authorizationStore } from "../../repositories/authorization.repository.js";
import { stockError } from "../stocks/access.js";
import { availableReports, type ReportKind } from "./contracts.js";
import type { ReportQuery } from "./period.js";
export interface ReportContext { actorId: string; scope: "GLOBAL" | "COMPANY" | "AGENCY" | "SHOP"; companyId?: string; agencyId?: string; shopId?: string }
export async function reportAccess(tx: Prisma.TransactionClient, c: ReportContext, q: ReportQuery, kind: ReportKind) {
  const store = authorizationStore(tx);
  let permissions: readonly string[];
  if (c.scope === "GLOBAL") {
    await authorizeGlobal(store, c.actorId, "platform.manage");
    permissions = (await store.globalGrant(c.actorId))!.permissions;
  } else if (c.scope === "SHOP") {
    if (!c.shopId) throw stockError("CONTEXT_REQUIRED", "Choisissez une boutique.", 403);
    await authorizeShop(store, c.actorId, c.shopId, "workspace.access");
    permissions = (await store.shopGrant(c.actorId, c.shopId))!.permissions;
  } else {
    if (!c.companyId || (c.scope === "AGENCY" && !c.agencyId)) throw stockError("CONTEXT_REQUIRED", "Choisissez une organisation.", 403);
    await authorizeTenant(store, { userId: c.actorId, companyId: c.companyId, ...(c.scope === "AGENCY" ? { agencyId: c.agencyId! } : {}) }, "workspace.access");
    const company = await store.companyGrant(c.actorId, c.companyId), agency = c.agencyId ? await store.agencyGrant(c.actorId, c.companyId, c.agencyId) : null;
    permissions = [...(company?.active ? company.permissions : []), ...(agency?.active ? agency.permissions : [])];
  }
  const kinds = availableReports({ scope: c.scope, permissions });
  if (!kinds.includes(kind)) throw stockError("REPORT_DENIED", "Rapport non autoris�.", 403);
  const self = permissions.some(p=>["deliveries.self.read","collections.self.read"].includes(p)) && !permissions.includes("reports.read") && !permissions.includes("financial.supervise.read") && c.scope !== "SHOP";
  if ((c.scope !== "GLOBAL" && c.companyId && q.companyId && c.companyId !== q.companyId) ||
    (c.scope === "AGENCY" && q.agencyId && q.agencyId !== c.agencyId) ||
    (c.scope === "SHOP" && q.shopId && q.shopId !== c.shopId) ||
    (self && q.courierId && q.courierId !== c.actorId)) throw stockError("REPORT_SCOPE_DENIED", "Filtre hors de votre p�rim�tre.", 403);
  const companyId = c.companyId ?? q.companyId, agencyId = c.scope === "AGENCY" ? c.agencyId : q.agencyId,
    shopId = c.scope === "SHOP" ? c.shopId : q.shopId, courierId = self ? c.actorId : q.courierId;
  if (c.scope === "SHOP" && companyId && !await tx.companyShop.findUnique({ where: { companyId_shopId: { companyId, shopId: c.shopId! } } })) throw stockError("REPORT_SCOPE_DENIED", "Transporteur non associ�.", 403);
  return { kinds, self, permissions, companyId, agencyId, shopId, courierId };
}
export type ReportAccess = Awaited<ReturnType<typeof reportAccess>>;
// SQL identifiers are fixed by the application; every external value is parameterized.
export function field(alias: string, column: string) { return Prisma.raw(`\`${alias}\`.\`${column}\``); }
export function scopeSql(a: ReportAccess, alias: string, opts: { shop?: boolean; courier?: boolean; agency?: string } = {}) {
  const clauses: Prisma.Sql[] = [Prisma.sql`1=1`];
  if (a.companyId) clauses.push(Prisma.sql`${field(alias, "companyId")}=${a.companyId}`);
  if (a.agencyId) clauses.push(Prisma.sql`${field(alias, opts.agency ?? "agencyId")}=${a.agencyId}`);
  if (opts.shop && a.shopId) clauses.push(Prisma.sql`${field(alias, "shopId")}=${a.shopId}`);
  if (opts.courier && a.courierId) clauses.push(Prisma.sql`${field(alias, "courierId")}=${a.courierId}`);
  return Prisma.join(clauses, " AND ");
}

