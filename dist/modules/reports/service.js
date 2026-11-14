import { Prisma } from "../../generated/prisma/client.js";
import { reportAccess, scopeSql, field } from "./access.js";
import { reportPeriod } from "./period.js";
import { reportLabels } from "./contracts.js";
import { stockError } from "../stocks/access.js";
import { collectionInclude, ledger, totals, obligation } from "../collections/ledger.js";
import { units, sum } from "../collections/money.js";
const n = (x) => Number(x ?? 0);
const cell = (v) => v instanceof Date ? v.toISOString() : v == null ? null : typeof v === "number" ? v : String(v);
const dateSql = (alias, p, column = "createdAt") => Prisma.sql `${field(alias, column)}>=${p.start} AND ${field(alias, column)}<${p.end}`;
const addMetric = (r, key, label, value, unit) => r.metrics.push({ key, label, value, ...(unit ? { unit } : {}) });
export class ReportService {
    db;
    timezone;
    clock;
    constructor(db, timezone = process.env.REPORT_TIMEZONE ?? "Africa/Douala", clock = () => new Date()) {
        this.db = db;
        this.timezone = timezone;
        this.clock = clock;
    }
    async options(c) {
        return this.db.$transaction(async (tx) => {
            const a = await reportAccess(tx, c, { preset: "30d", page: 1, size: 20 }, "overview");
            const companies = c.scope === "GLOBAL" ? await tx.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }) : c.scope === "SHOP" ? (await tx.companyShop.findMany({ where: { shopId: c.shopId, ...(c.companyId ? { companyId: c.companyId } : {}) }, select: { company: { select: { id: true, name: true } } }, take: 200 })).map(x => x.company) : [];
            const agencies = c.scope === "GLOBAL" || c.scope === "SHOP" ? [] : await tx.agency.findMany({ where: { companyId: a.companyId, ...(a.agencyId ? { id: a.agencyId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
            const shops = c.scope === "SHOP" || c.scope === "GLOBAL" || a.self ? [] : (await tx.companyShop.findMany({ where: { companyId: a.companyId, ...(a.agencyId ? { allowedAgencyIds: { array_contains: a.agencyId } } : {}) }, select: { shop: { select: { id: true, name: true } } }, take: 200 })).map(x => x.shop);
            const couriers = c.scope === "GLOBAL" || c.scope === "SHOP" || !a.permissions.includes("drivers.read") ? [] : (await tx.driverProfile.findMany({ where: { companyId: a.companyId, ...(a.agencyId ? { membership: { agencyMembership_membershipRecords: { some: { companyId: a.companyId, agencyId: a.agencyId, active: true } } } } : {}) }, select: { userId: true, membership: { select: { user: { select: { fullName: true } } } } }, take: 200 })).map(x => ({ id: x.userId, name: x.membership.user.fullName }));
            return { kinds: a.kinds, companies, agencies, shops, couriers, limit: 200 };
        });
    }
    async run(c, kind, q) {
        return this.db.$transaction(async (tx) => {
            const a = await reportAccess(tx, c, q, kind), now = this.clock(), p = reportPeriod(q, this.timezone, now);
            const organization = c.scope === "GLOBAL" ? "DND Delivery — SaaS" : c.scope === "SHOP" ? (await tx.shop.findUniqueOrThrow({ where: { id: c.shopId }, select: { name: true } })).name : (await tx.company.findUniqueOrThrow({ where: { id: c.companyId }, select: { name: true } })).name;
            const r = { kind, title: reportLabels[kind], organization, generatedAt: now.toISOString(), period: { from: p.from, to: p.to, timezone: p.timezone, start: p.start.toISOString(), end: p.end.toISOString() }, filters: { ...q, companyId: a.companyId, agencyId: a.agencyId, shopId: a.shopId, courierId: a.courierId }, metrics: [], tables: [], series: [], notes: [] };
            // Reject irrelevant filters instead of silently changing their meaning.
            if (kind !== "audit" && (q.actorId || q.action || q.module))
                throw stockError("REPORT_FILTER_INVALID", "Filtres d’audit réservés au journal.", 400);
            if (kind === "audit")
                await this.audit(tx, c, a, q, p, r);
            else if (c.scope === "GLOBAL") {
                if (q.agencyId || q.shopId || q.courierId || q.status || q.type)
                    throw stockError("REPORT_FILTER_INVALID", "Filtres opérationnels indisponibles dans les agrégats SaaS.", 400);
                await this.saas(tx, a, q, p, r, now);
            }
            else {
                const selected = kind === "overview" ? a.kinds : [kind];
                if ((q.status || q.type) && selected.some(k => ["stocks", "collections"].includes(k)))
                    throw stockError("REPORT_FILTER_INVALID", "Statut et type sont réservés aux rapports logistiques.", 400);
                if (selected.includes("orders"))
                    await this.orders(tx, a, q, p, r);
                if (selected.includes("deliveries"))
                    await this.deliveries(tx, a, q, p, r);
                if (selected.includes("agencies"))
                    await this.performance(tx, a, q, p, r, false);
                if (selected.includes("drivers"))
                    await this.performance(tx, a, q, p, r, true);
                if (kind === "agencies" && !a.courierId && !q.status && !q.type && a.kinds.includes("stocks"))
                    await this.stocks(tx, a, q, p, r);
                if (["agencies", "drivers"].includes(kind) && !q.status && !q.type && a.kinds.includes("collections"))
                    await this.finance(tx, c, a, q, p, r);
                if (selected.includes("stocks") && !(kind === "overview" && a.courierId))
                    await this.stocks(tx, a, q, p, r);
                if (selected.includes("collections"))
                    await this.finance(tx, c, a, q, p, r);
                if (kind === "overview" && a.permissions.includes("reports.read") && !a.shopId && !a.courierId)
                    await this.organization(tx, a, r);
            }
            r.notes = [...new Set(r.notes)];
            return r;
        }, { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 });
    }
    async table(tx, r, q, key, title, columns, sql, keys) {
        const count = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) AS total FROM (${sql}) counted`);
        const rows = await tx.$queryRaw(Prisma.sql `${sql} ORDER BY 1 LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
        r.tables.push({ key, title, columns, rows: rows.map(row => keys.map(k => ["declared", "confirmed", "amount"].includes(k) && row[k] != null ? new Prisma.Decimal(String(row[k])).toFixed(4) : cell(row[k]))), total: n(count[0]?.total), page: q.page, size: q.size });
    }
    orderWhere(a, q, alias = "o") {
        return Prisma.sql `${scopeSql(a, alias, { shop: true })}
      ${q.status ? Prisma.sql `AND ${field(alias, "status")}=${q.status}` : Prisma.empty}
      ${q.type ? Prisma.sql `AND ${field(alias, "type")}=${q.type}` : Prisma.empty}
      ${a.courierId ? Prisma.sql `AND EXISTS (SELECT 1 FROM Delivery od WHERE od.companyId=${field(alias, "companyId")} AND od.orderId=${field(alias, "id")} AND od.courierId=${a.courierId})` : Prisma.empty}`;
    }
    deliveryWhere(a, q) {
        return Prisma.sql `${scopeSql(a, "d", { courier: true })}
      ${q.status ? Prisma.sql `AND d.status=${q.status}` : Prisma.empty}
      AND EXISTS (SELECT 1 FROM \`Order\` o WHERE o.companyId=d.companyId AND o.id=d.orderId AND o.isDraft=0
      ${a.shopId ? Prisma.sql `AND o.shopId=${a.shopId}` : Prisma.empty}
      ${q.type ? Prisma.sql `AND o.type=${q.type}` : Prisma.empty})`;
    }
    async orders(tx, a, q, p, r) {
        const where = this.orderWhere(a, q), base = Prisma.sql `FROM \`Order\` o WHERE ${where} AND o.isDraft=0 AND ${dateSql("o", p)}`;
        const rows = await tx.$queryRaw(Prisma.sql `SELECT o.status, COUNT(*) AS total ${base} GROUP BY o.status`);
        addMetric(r, "orders.created", "Commandes créées", rows.reduce((s, x) => s + n(x.total), 0));
        r.tables.push({ key: "orders.status", title: "Commandes par statut à la génération", columns: ["Statut", "Commandes"], rows: rows.map(x => [cell(x.status), n(x.total)]), total: rows.length, page: 1, size: rows.length });
        await this.table(tx, r, q, "orders.type", "Types de commandes", ["Type", "Commandes"], Prisma.sql `SELECT o.type,COUNT(*) total ${base} GROUP BY o.type`, ["type", "total"]);
        await this.table(tx, r, q, "orders.shops", "Commandes par boutique et transporteur", ["Boutique", "Transporteur", "Commandes"], Prisma.sql `SELECT s.name boutique,c.name transporteur,COUNT(*) total FROM \`Order\` o JOIN Shop s ON s.id=o.shopId JOIN Company c ON c.id=o.companyId WHERE ${where} AND o.isDraft=0 AND ${dateSql("o", p)} GROUP BY o.shopId,o.companyId,s.name,c.name`, ["boutique", "transporteur", "total"]);
        const previous = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) total FROM \`Order\` o WHERE ${where} AND o.isDraft=0 AND ${dateSql("o", p.previous)}`);
        r.comparison = { from: p.previous.from, to: p.previous.to, orders: n(previous[0]?.total) };
        const cases = p.boundaries.slice(0, -1).map((start, i) => Prisma.sql `WHEN o.createdAt>=${start} AND o.createdAt<${p.boundaries[i + 1]} THEN ${new Intl.DateTimeFormat("en-CA", { timeZone: p.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start)}`);
        const series = await tx.$queryRaw(Prisma.sql `SELECT CASE ${Prisma.join(cases, " ")} END day,COUNT(*) total ${base} GROUP BY day ORDER BY day`);
        r.series = series.map(x => ({ date: String(x.day), value: n(x.total) }));
        r.notes.push("Commandes hors brouillons : cohorte créée dans la période ; statuts actuels, y compris archives. Comparaison avec les mêmes filtres sur la période calendaire précédente de même durée.", "Aucune échéance promise n’est enregistrée : aucun retard contractuel n’est inventé.");
    }
    async deliveries(tx, a, q, p, r) {
        const w = this.deliveryWhere(a, q);
        const rows = await tx.$queryRaw(Prisma.sql `SELECT d.status,COUNT(*) total FROM Delivery d WHERE ${w} AND ${dateSql("d", p, "closedAt")} GROUP BY d.status`);
        const ok = rows.filter(x => x.status === "DELIVERED").reduce((s, x) => s + n(x.total), 0), failed = rows.filter(x => x.status === "FAILED").reduce((s, x) => s + n(x.total), 0);
        addMetric(r, "deliveries.success", "Livraisons réussies", ok);
        addMetric(r, "deliveries.failed", "Livraisons échouées clôturées", failed);
        addMetric(r, "deliveries.rate", "Taux de réussite", ok + failed ? (100 * ok / (ok + failed)).toFixed(2) : null, "%");
        const [stats] = await tx.$queryRaw(Prisma.sql `SELECT AVG(CASE WHEN d.pickedUpAt IS NOT NULL AND d.closedAt>=d.pickedUpAt THEN TIMESTAMPDIFF(MICROSECOND,d.pickedUpAt,d.closedAt)/60000000 END) minutes,
      SUM(NOT EXISTS(SELECT 1 FROM DeliveryAttempt da WHERE da.companyId=d.companyId AND da.deliveryId=d.id AND da.result='FAILED')) firstSuccess
      FROM Delivery d WHERE ${w} AND d.status='DELIVERED' AND ${dateSql("d", p, "closedAt")}`);
        addMetric(r, "deliveries.minutes", "Délai moyen enlèvement → remise", stats?.minutes == null ? null : Number(stats.minutes).toFixed(2), "min");
        addMetric(r, "deliveries.first", "Réussite sans tentative échouée enregistrée", ok ? (100 * n(stats?.firstSuccess) / ok).toFixed(2) : null, "%");
        const [active] = await tx.$queryRaw(Prisma.sql `SELECT SUM(d.status='PENDING') pending,SUM(d.status='ASSIGNED') assigned,SUM(d.status='IN_PROGRESS') progress FROM Delivery d WHERE ${w}`);
        for (const [key, label] of [["pending", "Missions en attente"], ["assigned", "Missions affectées"], ["progress", "Livraisons en cours"]])
            addMetric(r, "deliveries." + key, label, n(active?.[key]));
        const [openIncidents] = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) total FROM DeliveryIncident i JOIN Delivery d ON d.companyId=i.companyId AND d.id=i.deliveryId WHERE ${w} AND i.status='OPEN'`);
        addMetric(r, "deliveries.openIncidents", "Incidents ouverts", n(openIncidents?.total));
        await this.table(tx, r, q, "deliveries.attempts", "Tentatives enregistrées dans la période", ["Résultat", "Motif", "Tentatives"], Prisma.sql `SELECT t.result,t.reason,COUNT(*) total FROM DeliveryAttempt t JOIN Delivery d ON d.companyId=t.companyId AND d.id=t.deliveryId WHERE ${w} AND ${dateSql("t", p)} ${a.self ? Prisma.sql `AND t.courierId=${a.courierId}` : Prisma.empty} GROUP BY t.result,t.reason`, ["result", "reason", "total"]);
        await this.table(tx, r, q, "deliveries.incidents", "Incidents par type et état", ["Type", "État", "Incidents"], Prisma.sql `SELECT i.kind,i.status,COUNT(*) total FROM DeliveryIncident i JOIN Delivery d ON d.companyId=i.companyId AND d.id=i.deliveryId WHERE ${w} AND ${dateSql("i", p)} GROUP BY i.kind,i.status`, ["kind", "status", "total"]);
        await this.table(tx, r, q, "deliveries.returns", "Retours", ["État", "Retours"], Prisma.sql `SELECT t.status,COUNT(*) total FROM DeliveryReturn t JOIN Delivery d ON d.companyId=t.companyId AND d.id=t.deliveryId WHERE ${w} AND ${dateSql("t", p)} GROUP BY t.status`, ["status", "total"]);
        await this.table(tx, r, q, "deliveries.legs", "Acheminements inter-agences", ["État", "Trajets"], Prisma.sql `SELECT l.status,COUNT(*) total FROM ParcelLeg l JOIN Delivery d ON d.companyId=l.companyId AND d.id=l.deliveryId WHERE ${w} AND ${dateSql("l", p)} GROUP BY l.status`, ["status", "total"]);
        await this.table(tx, r, q, "deliveries.history", "Historique des missions créées dans la période", ["Référence", "Statut", "Création UTC", "Affectation UTC", "Enlèvement UTC", "Clôture UTC"], Prisma.sql `SELECT d.parcelReference,d.status,d.createdAt,d.assignedAt,d.pickedUpAt,d.closedAt FROM Delivery d WHERE ${w} AND ${dateSql("d", p)}`, ["parcelReference", "status", "createdAt", "assignedAt", "pickedUpAt", "closedAt"]);
        r.notes.push("Clôtures dans la période : DELIVERED / (DELIVERED + FAILED). Les échecs encore ouverts sont visibles dans les tentatives. Une mission compte une seule fois malgré les réaffectations.", "Durée moyenne : closedAt − pickedUpAt, seulement remises réussies aux dates cohérentes. Sans donnée, valeur indisponible. Le premier essai signifie absence d’échec enregistré, pas une preuve d’absence d’incident non saisi.");
    }
    async performance(tx, a, q, p, r, driver) {
        const dimension = driver ? Prisma.sql `d.courierId` : Prisma.sql `d.agencyId`;
        const name = driver ? Prisma.sql `u.fullName` : Prisma.sql `ag.name`, join = driver ? Prisma.sql `LEFT JOIN User u ON u.id=d.courierId` : Prisma.sql `JOIN Agency ag ON ag.companyId=d.companyId AND ag.id=d.agencyId`;
        await this.table(tx, r, q, driver ? "drivers" : "agencies", driver ? "Performance logistique par livreur" : "Comparaison des agences", [driver ? "Livreur" : "Agence", "Missions créées", "Réussies", "Échouées", "Délai moyen (min)"], Prisma.sql `SELECT ${name} name,COUNT(*) missions,SUM(d.status='DELIVERED') success,SUM(d.status='FAILED') failed,AVG(CASE WHEN d.status='DELIVERED' AND d.closedAt>=d.pickedUpAt THEN TIMESTAMPDIFF(MICROSECOND,d.pickedUpAt,d.closedAt)/60000000 END) minutes FROM Delivery d ${join} WHERE ${this.deliveryWhere(a, q)} AND ${dateSql("d", p)} GROUP BY ${dimension},${name}`, ["name", "missions", "success", "failed", "minutes"]);
        if (driver) {
            await this.table(tx, r, q, "drivers.assignments", "Affectations enregistrées (distinctes des missions)", ["Livreur", "Affectations", "Enlèvements enregistrés"], Prisma.sql `SELECT u.fullName courierName,COUNT(*) assignments,SUM(EXISTS(SELECT 1 FROM DeliveryEvent e WHERE e.companyId=x.companyId AND e.deliveryId=x.deliveryId AND e.actorId=x.courierId AND e.action='PICKED_UP' AND e.createdAt>=x.createdAt AND (x.endedAt IS NULL OR e.createdAt<=x.endedAt))) pickups FROM DeliveryAssignment x JOIN Delivery d ON d.companyId=x.companyId AND d.id=x.deliveryId JOIN User u ON u.id=x.courierId WHERE ${this.deliveryWhere({ ...a, courierId: undefined }, q)} AND ${dateSql("x", p)} ${a.courierId ? Prisma.sql `AND x.courierId=${a.courierId}` : Prisma.empty} GROUP BY x.courierId,u.fullName`, ["courierName", "assignments", "pickups"]);
        }
        else {
            await this.table(tx, r, q, "agencies.orders", "Commandes reçues par agence", ["Agence", "Commandes créées", "Annulées"], Prisma.sql `SELECT ag.name,COUNT(*) total,SUM(o.status='CANCELLED') cancelled FROM \`Order\` o JOIN Agency ag ON ag.id=o.agencyId AND ag.companyId=o.companyId WHERE ${this.orderWhere(a, q)} AND o.isDraft=0 AND ${dateSql("o", p)} GROUP BY o.agencyId,ag.name`, ["name", "total", "cancelled"]);
            await this.table(tx, r, q, "agencies.incidents", "Incidents par agence dans la période", ["Agence", "Type", "État", "Incidents"], Prisma.sql `SELECT ag.name,i.kind,i.status,COUNT(*) total FROM DeliveryIncident i JOIN Delivery d ON d.companyId=i.companyId AND d.id=i.deliveryId JOIN Agency ag ON ag.id=i.agencyId AND ag.companyId=i.companyId WHERE ${this.deliveryWhere(a, q)} AND ${dateSql("i", p)} GROUP BY i.agencyId,ag.name,i.kind,i.status`, ["name", "kind", "status", "total"]);
            await this.table(tx, r, q, "agencies.returns", "Retours par agence", ["Agence", "État", "Retours"], Prisma.sql `SELECT ag.name,t.status,COUNT(*) total FROM DeliveryReturn t JOIN Delivery d ON d.companyId=t.companyId AND d.id=t.deliveryId JOIN Agency ag ON ag.id=t.agencyId AND ag.companyId=t.companyId WHERE ${this.deliveryWhere(a, q)} AND ${dateSql("t", p)} GROUP BY t.agencyId,ag.name,t.status`, ["name", "status", "total"]);
            if (!a.shopId && !q.status && !q.type)
                await this.table(tx, r, q, "agencies.drivers", "Livreurs actifs par agence — photographie actuelle", ["Agence", "Livreurs actifs", "Disponibles"], Prisma.sql `SELECT ag.name,COUNT(*) total,SUM(dp.availability='AVAILABLE') available FROM AgencyMembership m JOIN Agency ag ON ag.id=m.agencyId AND ag.companyId=m.companyId JOIN DriverProfile dp ON dp.companyId=m.companyId AND dp.userId=m.userId WHERE ${scopeSql(a, "m")} AND m.active=1 AND dp.status='ACTIVE' ${a.courierId ? Prisma.sql `AND m.userId=${a.courierId}` : Prisma.empty} GROUP BY m.agencyId,ag.name`, ["name", "total", "available"]);
        }
        r.notes.push("Comparaisons : cohorte de missions créées dans la période, statut et livreur actuels. Les affectations sont présentées séparément ; aucun classement automatique.");
    }
    async stocks(tx, a, q, p, r) {
        if (q.courierId)
            throw stockError("REPORT_FILTER_INVALID", "Le stock ne dépend pas d’un livreur.", 400);
        const w = scopeSql(a, "s", { shop: true });
        const [s] = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) positions,COUNT(DISTINCT s.productId) products,COALESCE(SUM(s.physicalQuantity),0) physical,COALESCE(SUM(s.reservedQuantity),0) reserved,COALESCE(SUM(CAST(s.physicalQuantity AS SIGNED)-CAST(s.reservedQuantity AS SIGNED)),0) available,SUM(s.physicalQuantity=s.reservedQuantity) outOfStock,SUM(CAST(s.physicalQuantity AS SIGNED)-CAST(s.reservedQuantity AS SIGNED)<=s.alertThreshold) low FROM Stock s WHERE ${w}`);
        for (const [k, l] of [["products", "Produits suivis"], ["physical", "Quantité physique"], ["available", "Quantité disponible"], ["reserved", "Quantité réservée"], ["low", "Positions à stock faible"], ["outOfStock", "Positions en rupture"]])
            addMetric(r, "stocks." + k, l, n(s?.[k]));
        const [transit] = await tx.$queryRaw(Prisma.sql `SELECT COUNT(DISTINCT t.id) transfers,COALESCE(SUM(CAST(i.quantity AS SIGNED)-CAST(i.receivedQuantity AS SIGNED)-CAST(i.lostQuantity AS SIGNED)-CAST(i.returnedQuantity AS SIGNED)),0) quantity FROM TransferItem i JOIN Transfer t ON t.companyId=i.companyId AND t.id=i.transferId WHERE ${scopeSql(a, "t", { agency: "originAgencyId" })} AND t.status='IN_TRANSIT' ${a.shopId ? Prisma.sql `AND i.shopId=${a.shopId}` : Prisma.empty}`);
        addMetric(r, "stocks.transit", "Quantité en transit (agence d’origine)", n(transit?.quantity));
        addMetric(r, "stocks.transfers", "Transferts en cours (agence d’origine)", n(transit?.transfers));
        await this.table(tx, r, q, "stocks.balances", "Stocks actuels par agence et boutique", ["Agence", "Boutique", "Produit", "Physique", "Réservé", "Disponible", "Seuil"], Prisma.sql `SELECT ag.name agency,sh.name shop,p.name product,s.physicalQuantity physical,s.reservedQuantity reserved,CAST(s.physicalQuantity AS SIGNED)-CAST(s.reservedQuantity AS SIGNED) available,s.alertThreshold threshold FROM Stock s JOIN Product p ON p.id=s.productId AND p.shopId=s.shopId JOIN Agency ag ON ag.companyId=s.companyId AND ag.id=s.agencyId JOIN Shop sh ON sh.id=s.shopId WHERE ${w}`, ["agency", "shop", "product", "physical", "reserved", "available", "threshold"]);
        await this.table(tx, r, q, "stocks.movements", "Mouvements enregistrés", ["Type", "Mouvements", "Variation physique", "Variation réservée"], Prisma.sql `SELECT m.type,COUNT(*) total,SUM(m.physicalDelta) physical,SUM(m.reservedDelta) reserved FROM StockMovement m JOIN Stock s ON s.companyId=m.companyId AND s.id=m.stockId WHERE ${w} AND ${dateSql("m", p)} GROUP BY m.type`, ["type", "total", "physical", "reserved"]);
        await this.table(tx, r, q, "stocks.agencies", "Répartition actuelle par agence et boutique", ["Agence", "Boutique", "Physique", "Réservé", "Disponible"], Prisma.sql `SELECT ag.name agency,sh.name shop,SUM(s.physicalQuantity) physical,SUM(s.reservedQuantity) reserved,SUM(CAST(s.physicalQuantity AS SIGNED)-CAST(s.reservedQuantity AS SIGNED)) available FROM Stock s JOIN Agency ag ON ag.id=s.agencyId AND ag.companyId=s.companyId JOIN Shop sh ON sh.id=s.shopId WHERE ${w} GROUP BY s.agencyId,s.shopId,ag.name,sh.name`, ["agency", "shop", "physical", "reserved", "available"]);
        await this.table(tx, r, q, "stocks.inventories", "Inventaires et écarts comptés", ["Référence", "État", "Lignes comptées", "Écart physique"], Prisma.sql `SELECT v.reference,v.status,COUNT(i.countedQuantity) counted,SUM(CASE WHEN i.countedQuantity IS NOT NULL THEN CAST(i.countedQuantity AS SIGNED)-CAST(i.expectedPhysical AS SIGNED) END) difference FROM InventorySession v JOIN InventoryItem i ON i.companyId=v.companyId AND i.inventoryId=v.id WHERE ${scopeSql(a, "v")} ${a.shopId ? Prisma.sql `AND i.shopId=${a.shopId}` : Prisma.empty} AND ${dateSql("v", p)} GROUP BY v.id,v.reference,v.status`, ["reference", "status", "counted", "difference"]);
        r.notes.push("Stocks : photographie actuelle, pas un stock historique à la fin de période. Disponible = physique − réservé. Transit = quantité − reçue − perdue − retournée, transferts IN_TRANSIT à l’origine, identique au moteur Bloc 9. Mouvements et inventaires filtrés par date de création ; écart compté ne signifie pas correction approuvée.");
    }
    async finance(tx, c, a, q, p, r) {
        const where = { ...(a.companyId ? { companyId: a.companyId } : {}), ...(a.agencyId ? { agencyId: a.agencyId } : {}), ...(a.courierId ? { courierId: a.courierId } : {}), ...(a.shopId ? { delivery: { order: { shopId: a.shopId } } } : {}), createdAt: { gte: p.start, lt: p.end } };
        const count = await tx.collection.count({ where });
        if (count > 2000)
            throw stockError("REPORT_TOO_LARGE", "Plus de 2 000 encaissements : réduisez la période ou le périmètre.", 422);
        const entries = await ledger(tx, await tx.collection.findMany({ where, include: collectionInclude, take: 2000, orderBy: { id: "asc" } }));
        const money = totals(entries);
        const dailyCases = p.boundaries.slice(0, -1).map((start, i) => Prisma.sql `WHEN co.createdAt>=${start} AND co.createdAt<${p.boundaries[i + 1]} THEN ${new Intl.DateTimeFormat("en-CA", { timeZone: p.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start)}`);
        const evolution = await tx.$queryRaw(Prisma.sql `SELECT CASE ${Prisma.join(dailyCases, " ")} END day,co.currency,COUNT(*) total,SUM(co.declaredAmount) amount FROM Collection co JOIN Delivery d ON d.companyId=co.companyId AND d.id=co.deliveryId JOIN \`Order\` o ON o.companyId=d.companyId AND o.id=d.orderId WHERE ${scopeSql(a, "co", { courier: true })} ${a.shopId ? Prisma.sql `AND o.shopId=${a.shopId}` : Prisma.empty} AND co.operationKey IS NOT NULL AND ${dateSql("co", p)} GROUP BY day,co.currency ORDER BY day,co.currency`);
        r.tables.push({ key: "finance.evolution", title: "Déclarations originales par jour et devise (hors corrections)", columns: ["Date locale", "Devise", "Déclarations", "Montant original"], rows: evolution.slice((q.page - 1) * q.size, q.page * q.size).map(x => [String(x.day), String(x.currency), n(x.total), new Prisma.Decimal(String(x.amount)).toFixed(4)]), total: evolution.length, page: q.page, size: q.size });
        if (r.kind === "collections")
            r.series = [...new Set(evolution.map(x => String(x.day)))].map(day => ({ date: day, value: evolution.filter(x => String(x.day) === day).reduce((s, x) => s + n(x.total), 0) }));
        const isShop = c.scope === "SHOP";
        const keys = isShop ? ["currency", "gross", "refunded", "net"] : ["currency", "gross", "refunded", "net", "confirmed", "liability", "reserved", "available"];
        r.tables.push({ key: "finance.totals", title: "Cohorte d’encaissements — soldes actuels par devise", columns: isShop ? ["Devise", "Déclaré corrigé", "Remboursé", "Net client"] : ["Devise", "Déclaré corrigé", "Remboursé", "Net client", "Reçu agence", "Responsabilité livreur", "Remises en attente", "Disponible à remettre"], rows: money.map(x => keys.map(k => cell(x[k]))), total: money.length, page: 1, size: money.length });
        const expected = await tx.$queryRaw(Prisma.sql `SELECT o.currency,COALESCE(SUM(o.amountToCollect),0) expected FROM \`Order\` o WHERE ${this.orderWhere(a, q)} AND o.isDraft=0 AND o.collectionRequired=1 AND ${dateSql("o", p)} GROUP BY o.currency`);
        r.tables.push({ key: "finance.expected", title: "Attendu des commandes créées dans la période", columns: ["Devise", "Attendu actuel"], rows: expected.map(x => [cell(x.currency), new Prisma.Decimal(String(x.expected)).toFixed(4)]), total: expected.length, page: 1, size: expected.length });
        const orderBase = Prisma.sql `FROM \`Order\` o WHERE ${this.orderWhere(a, q)} AND o.isDraft=0 AND o.collectionRequired=1 AND ${dateSql("o", p)}`;
        const [orderCount] = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) total ${orderBase}`);
        const orders = await tx.$queryRaw(Prisma.sql `SELECT o.id,o.publicNumber,o.currency,o.amountToCollect ${orderBase} ORDER BY o.id LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
        const ids = orders.map(o => String(o.id));
        const relatedWhere = { delivery: { orderId: { in: ids } }, ...(a.courierId ? { courierId: a.courierId } : {}), ...(a.agencyId ? { agencyId: a.agencyId } : {}) };
        if (await tx.collection.count({ where: relatedWhere }) > 2000)
            throw stockError("REPORT_TOO_LARGE", "Trop de déclarations sur ces commandes. Réduisez les filtres.", 422);
        const current = await ledger(tx, await tx.collection.findMany({ where: relatedWhere, include: collectionInclude, take: 2000 }));
        r.tables.push({ key: "finance.obligations", title: "Attendu et reste client — commandes de la période", columns: ["Commande", "Devise", "Attendu", "Net déclaré", "Reste client", "État"], rows: orders.map(o => { const items = current.filter(e => e.orderId === o.id), net = sum(items.map(e => units(e.net))), b = obligation(units(String(o.amountToCollect)), net, items.length > 0); return [String(o.publicNumber), String(o.currency), b.expected, b.declared, b.remaining, b.state]; }), total: n(orderCount?.total), page: q.page, size: q.size });
        if (!isShop && !a.shopId) {
            const agencies = await tx.agency.findMany({ where: { id: { in: [...new Set(entries.map(e => e.agencyId))] } }, select: { id: true, name: true } }), names = new Map(agencies.map(x => [x.id, x.name]));
            for (const driver of [false, true]) {
                const groups = [...new Set(entries.map(e => driver ? e.courierId : e.agencyId))].sort();
                const rows = groups.flatMap(id => { const items = entries.filter(e => (driver ? e.courierId : e.agencyId) === id); return totals(items).map(t => [driver ? items[0].courierName : names.get(id) ?? id, t.currency, t.gross, t.confirmed, t.liability]); });
                r.tables.push({ key: driver ? "finance.drivers" : "finance.agencies", title: driver ? "Responsabilité financière par livreur" : "Fonds par agence", columns: [driver ? "Livreur" : "Agence", "Devise", "Déclaré corrigé", "Reçu agence", "Responsabilité livreur"], rows: rows.slice((q.page - 1) * q.size, q.page * q.size), total: rows.length, page: q.page, size: q.size });
            }
            await this.table(tx, r, q, "finance.remittances", "Remises annoncées dans la période", ["Devise", "État", "Décision", "Remises", "Déclaré", "Confirmé"], Prisma.sql `SELECT m.currency,m.status,m.decision,COUNT(*) total,SUM(m.declaredAmount) declared,SUM(m.confirmedAmount) confirmed FROM Remittance m WHERE ${scopeSql(a, "m", { courier: true })} AND ${dateSql("m", p)} ${a.shopId ? Prisma.sql `AND EXISTS (SELECT 1 FROM RemittanceItem ri JOIN Collection co ON co.id=ri.collectionId AND co.companyId=ri.companyId JOIN Delivery d ON d.id=co.deliveryId AND d.companyId=co.companyId JOIN \`Order\` o ON o.id=d.orderId AND o.companyId=d.companyId WHERE ri.remittanceId=m.id AND ri.companyId=m.companyId AND o.shopId=${a.shopId})` : Prisma.empty} GROUP BY m.currency,m.status,m.decision`, ["currency", "status", "decision", "total", "declared", "confirmed"]);
            await this.table(tx, r, q, "finance.discrepancies", "Écarts financiers", ["Devise", "Type", "État", "Écarts", "Montant"], Prisma.sql `SELECT f.currency,f.kind,f.status,COUNT(*) total,SUM(f.amount) amount FROM FinancialDiscrepancy f WHERE ${scopeSql(a, "f", { courier: true })} AND ${dateSql("f", p)} GROUP BY f.currency,f.kind,f.status`, ["currency", "kind", "status", "total", "amount"]);
            await this.table(tx, r, q, "finance.corrections", "Régularisations", ["Devise", "Type", "État", "Demandes"], Prisma.sql `SELECT f.currency,f.kind,f.status,COUNT(*) total FROM FinancialCorrection f WHERE ${scopeSql(a, "f", { courier: true })} AND ${dateSql("f", p)} GROUP BY f.currency,f.kind,f.status`, ["currency", "kind", "status", "total"]);
        }
        addMetric(r, "finance.unreconciled", "Encaissements historiques non rapprochables", entries.filter(x => x.legacy).length);
        r.notes.push("Finances : moteur ledger du Bloc 12 réutilisé, calcul exact à quatre décimales et devises séparées. Cohorte des encaissements créés dans la période, corrections et remises actuelles incluses ; ces soldes ne sont pas une clôture historique. Les lignes héritées non rapprochables sont signalées, exclues des montants.", "Attendu des commandes, fonds déclarés, fonds reçus agence et paiements SaaS restent distincts. Un filtre boutique ne permet pas d’attribuer une remise regroupée entière à cette boutique.");
    }
    async organization(tx, a, r) {
        const companyId = a.companyId;
        const agency = a.agencyId ? { agencyId: a.agencyId } : {};
        addMetric(r, "organization.agencies", "Agences actives", await tx.agency.count({ where: { companyId, ...(a.agencyId ? { id: a.agencyId } : {}), status: "ACTIVE", archivedAt: null } }));
        addMetric(r, "organization.shops", "Boutiques partenaires actives", await tx.companyShop.count({ where: { companyId, status: "ACTIVE", ...(a.agencyId ? { allowedAgencyIds: { array_contains: a.agencyId } } : {}) } }));
        addMetric(r, "organization.staff", "Affiliations actives", a.agencyId ? await tx.agencyMembership.count({ where: { companyId, ...agency, active: true } }) : await tx.companyMembership.count({ where: { companyId, active: true } }));
        const [drivers] = await tx.$queryRaw(Prisma.sql `SELECT COUNT(*) total,SUM(p.availability='AVAILABLE') available FROM DriverProfile p WHERE p.companyId=${companyId} AND p.status='ACTIVE' ${a.agencyId ? Prisma.sql `AND EXISTS(SELECT 1 FROM AgencyMembership m WHERE m.companyId=p.companyId AND m.userId=p.userId AND m.agencyId=${a.agencyId} AND m.active=1)` : Prisma.empty}`);
        addMetric(r, "organization.drivers", "Livreurs actifs", n(drivers?.total));
        addMetric(r, "organization.available", "Livreurs disponibles", n(drivers?.available));
    }
    async saas(tx, a, q, p, r, now) {
        const company = a.companyId ? { id: a.companyId } : {};
        for (const [key, label, status] of [["total", "Entreprises enregistrées", undefined], ["active", "Entreprises actives", "ACTIVE"], ["suspended", "Entreprises suspendues", "SUSPENDED"]])
            addMetric(r, "saas." + key, label, await tx.company.count({ where: { ...company, ...(status ? { status } : {}) } }));
        const w = a.companyId ? Prisma.sql `companyId=${a.companyId}` : Prisma.sql `1=1`;
        const [s] = await tx.$queryRaw(Prisma.sql `SELECT SUM(status='ACTIVE' AND expiresAt<=${now}) expired,SUM(status='EXPIRED') explicitExpired,SUM(status='ACTIVE' AND startedAt<=${now} AND expiresAt>${now} AND expiresAt<=${new Date(now.getTime() + 7 * 86400000)}) soon FROM Subscription WHERE ${w}`);
        addMetric(r, "saas.expired", "Abonnements expirés", n(s?.expired) + n(s?.explicitExpired));
        addMetric(r, "saas.soon", "Échéance sous sept jours", n(s?.soon));
        addMetric(r, "saas.new", "Nouvelles périodes d’abonnement", await tx.subscriptionPeriod.count({ where: { ...(a.companyId ? { companyId: a.companyId } : {}), createdAt: { gte: p.start, lt: p.end } } }));
        await this.table(tx, r, q, "saas.payments", "Paiements externes d’abonnement confirmés", ["Devise", "Paiements", "Montant confirmé"], Prisma.sql `SELECT currency,COUNT(*) total,SUM(amount) amount FROM SubscriptionPayment WHERE ${w} AND status='APPROVED' AND validatedAt>=${p.start} AND validatedAt<${p.end} GROUP BY currency`, ["currency", "total", "amount"]);
        await this.table(tx, r, q, "saas.companies", "Entreprises inscrites dans la période", ["Entreprise", "État", "Inscription"], Prisma.sql `SELECT c.name,c.status,c.createdAt FROM Company c WHERE ${a.companyId ? Prisma.sql `c.id=${a.companyId}` : Prisma.sql `1=1`} AND ${dateSql("c", p)}`, ["name", "status", "createdAt"]);
        const bins = p.boundaries.slice(0, -1).map((start, i) => Prisma.sql `WHEN c.createdAt>=${start} AND c.createdAt<${p.boundaries[i + 1]} THEN ${new Intl.DateTimeFormat("en-CA", { timeZone: p.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start)}`);
        const evolution = await tx.$queryRaw(Prisma.sql `SELECT CASE ${Prisma.join(bins, " ")} END day,COUNT(*) total FROM Company c WHERE ${a.companyId ? Prisma.sql `c.id=${a.companyId}` : Prisma.sql `1=1`} AND ${dateSql("c", p)} GROUP BY day ORDER BY day`);
        r.series = evolution.map(x => ({ date: String(x.day), value: n(x.total) }));
        addMetric(r, "saas.activity", "Événements d’audit enregistrés", await tx.auditLog.count({ where: { ...(a.companyId ? { companyId: a.companyId } : {}), createdAt: { gte: p.start, lt: p.end } } }));
        r.notes.push("SaaS uniquement : aucun encaissement de livraison ajouté aux abonnements. Échéances : photographie actuelle ; paiements par validation et périodes par création. Les données personnelles opérationnelles sont exclues.");
    }
    async audit(tx, c, a, q, p, r) {
        if (q.shopId || q.courierId || q.type || q.status)
            throw stockError("REPORT_FILTER_INVALID", "Filtres non applicables au journal d’audit.", 400);
        const where = { companyId: c.scope === "GLOBAL" ? null : a.companyId, ...(a.agencyId ? { agencyId: a.agencyId } : {}), createdAt: { gte: p.start, lt: p.end }, ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.action ? { action: q.action } : {}), ...(q.module ? { entityType: q.module } : {}) };
        if (c.scope === "GLOBAL" && q.companyId)
            throw stockError("REPORT_SCOPE_DENIED", "Le journal global est limité aux opérations de plateforme.", 403);
        const total = await tx.auditLog.count({ where });
        const rows = await tx.auditLog.findMany({ where, select: { id: true, actorId: true, actor: { select: { fullName: true } }, action: true, entityType: true, entityId: true, companyId: true, agencyId: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (q.page - 1) * q.size, take: q.size });
        r.tables.push({ key: "audit", title: "Opérations enregistrées — lecture seule", columns: ["Date UTC", "Auteur", "Action", "Entité", "Identifiant", "Entreprise", "Agence"], rows: rows.map(x => [x.createdAt.toISOString(), x.actor?.fullName ?? x.actorId, x.action, x.entityType, x.entityId, x.companyId, x.agencyId]), total, page: q.page, size: q.size });
        r.notes.push("Métadonnées libres, corps de requêtes, mots de passe, jetons et OTP exclus du DTO par liste positive de champs. Le journal global ne donne pas accès aux journaux des entreprises. Le résultat d’une opération n’est pas déduit s’il n’est pas enregistré.");
    }
}
