export const reportKinds = ["overview", "orders", "deliveries", "agencies", "drivers", "stocks", "collections", "subscriptions", "audit"] as const;
export type ReportKind = typeof reportKinds[number];
export const reportLabels: Record<ReportKind, string> = {
  overview: "Vue d’ensemble", orders: "Commandes", deliveries: "Livraisons",
  agencies: "Performances des agences", drivers: "Performances des livreurs",
  stocks: "Stocks et inventaires", collections: "Finances opérationnelles",
  subscriptions: "Activité SaaS", audit: "Journal d’audit",
};
export interface ReportContext { scope: string; permissions: readonly string[] }
export function availableReports(c: ReportContext): ReportKind[] {
  if (c.scope === "GLOBAL") return c.permissions.includes("platform.manage") ? ["overview", "subscriptions", "audit"] : [];
  const p = c.permissions, has = (...names: string[]) => names.some(n => p.includes(n));
  const kinds: ReportKind[] = [];
  if (has("reports.read", "shop.orders.read")) kinds.push("orders");
  if (has("reports.read", "shop.deliveries.read", "deliveries.self.read")) kinds.push("deliveries");
  if (has("reports.read")) kinds.push("agencies", "drivers");
  if (has("stocks.read", "shop.stocks.read")) kinds.push("stocks");
  if (has("financial.supervise.read", "collections.self.read", "shop.collections.read")) kinds.push("collections");
  if (has("audit.read", "organization.audit.read")) kinds.push("audit");
  return kinds.length ? ["overview", ...kinds] : [];
}
export type ReportCell = string | number | null;
export interface ReportTable { key: string; title: string; columns: string[]; rows: ReportCell[][]; total: number; page: number; size: number }
export interface ReportMetric { key: string; label: string; value: string | number | null; unit?: string }
export interface Report {
  kind: ReportKind; title: string; organization: string; generatedAt: string;
  period: { from: string; to: string; timezone: string; start: string; end: string };
  filters: Record<string, string | number | boolean | undefined>;
  metrics: ReportMetric[]; tables: ReportTable[];
  series: { date: string; value: number }[];
  comparison?: { from: string; to: string; orders: number };
  notes: string[];
}
