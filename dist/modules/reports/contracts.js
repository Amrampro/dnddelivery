export const reportKinds = ["overview", "orders", "deliveries", "agencies", "drivers", "stocks", "collections", "subscriptions", "audit"];
export const reportLabels = {
    overview: "Vue d’ensemble", orders: "Commandes", deliveries: "Livraisons",
    agencies: "Performances des agences", drivers: "Performances des livreurs",
    stocks: "Stocks et inventaires", collections: "Finances opérationnelles",
    subscriptions: "Activité SaaS", audit: "Journal d’audit",
};
export function availableReports(c) {
    if (c.scope === "GLOBAL")
        return c.permissions.includes("platform.manage") ? ["overview", "subscriptions", "audit"] : [];
    const p = c.permissions, has = (...names) => names.some(n => p.includes(n));
    const kinds = [];
    if (has("reports.read", "shop.orders.read"))
        kinds.push("orders");
    if (has("reports.read", "shop.deliveries.read", "deliveries.self.read"))
        kinds.push("deliveries");
    if (has("reports.read"))
        kinds.push("agencies", "drivers");
    if (has("stocks.read", "shop.stocks.read"))
        kinds.push("stocks");
    if (has("financial.supervise.read", "collections.self.read", "shop.collections.read"))
        kinds.push("collections");
    if (has("audit.read", "organization.audit.read"))
        kinds.push("audit");
    return kinds.length ? ["overview", ...kinds] : [];
}
