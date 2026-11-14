import { collectionInclude, ledger } from "./ledger.js";
import { units } from "./money.js";
import { stockError } from "../stocks/access.js";
export async function financialBlockers(tx, companyId, agencyId, courierId) {
    const where = {
        companyId,
        ...(agencyId ? { agencyId } : {}),
        ...(courierId ? { courierId } : {}),
    };
    const rows = await ledger(tx, await tx.collection.findMany({ where, include: collectionInclude }));
    const pending = await tx.financialCorrection.count({
        where: { ...where, status: "PENDING" },
    });
    return {
        count: rows.filter((r) => !r.legacy && (units(r.liability) !== 0n || units(r.reserved) > 0n)).length + pending,
        agencies: [
            ...new Set([
                ...rows
                    .filter((r) => !r.legacy && (units(r.liability) !== 0n || r.blocked))
                    .map((r) => r.agencyId),
                ...(await tx.financialCorrection.findMany({
                    where: { ...where, status: "PENDING" },
                    select: { agencyId: true },
                })).map((x) => x.agencyId),
            ]),
        ],
    };
}
export async function protectFinancialAffiliation(tx, companyId, userId, retainAgencies) {
    const blockers = await financialBlockers(tx, companyId, undefined, userId);
    if (blockers.count &&
        (!retainAgencies ||
            blockers.agencies.some((id) => !retainAgencies.includes(id))))
        throw stockError("FINANCIAL_SETTLEMENT_REQUIRED", "Des fonds ou corrections restent à régulariser dans les agences actuelles avant de retirer ces accès.");
}
