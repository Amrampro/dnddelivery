import { effectiveStatus } from "./rules.js";
export class SubscriptionRepository {
    db;
    clock;
    async notifications(q) {
        const where = { sourceEvent: { startsWith: "SUBSCRIPTION_" } };
        const [total, items] = await this.db.$transaction([
            this.db.notification.count({ where }),
            this.db.notification.findMany({
                where,
                select: {
                    id: true,
                    companyId: true,
                    company: { select: { name: true } },
                    recipientAddress: true,
                    sourceEvent: true,
                    status: true,
                    attempts: true,
                    maxAttempts: true,
                    availableAt: true,
                    sentAt: true,
                    lastError: true,
                    createdAt: true,
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { total, items, page: q.page, size: q.size };
    }
    constructor(db, clock = () => new Date()) {
        this.db = db;
        this.clock = clock;
    }
    async payments(q, companyId) {
        const where = {
            ...(companyId ? { companyId } : {}),
            ...(q.status && ["PENDING", "APPROVED", "REJECTED"].includes(q.status)
                ? { status: q.status }
                : {}),
            ...(q.q
                ? {
                    company: {
                        OR: [
                            { name: { contains: q.q } },
                            { reference: { contains: q.q } },
                        ],
                    },
                }
                : {}),
        };
        const [total, items] = await this.db.$transaction([
            this.db.subscriptionPayment.count({ where }),
            this.db.subscriptionPayment.findMany({
                where,
                include: {
                    company: { select: { name: true, reference: true } },
                    subscriptionPeriod_paymentRecords: true,
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { items, total, page: q.page, size: q.size };
    }
    async periods(q, companyId) {
        const where = {
            ...(companyId ? { companyId } : {}),
            ...(q.q ? { company: { name: { contains: q.q } } } : {}),
        };
        const [total, items] = await this.db.$transaction([
            this.db.subscriptionPeriod.count({ where }),
            this.db.subscriptionPeriod.findMany({
                where,
                include: { company: { select: { name: true } }, price: true },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return { items, total, page: q.page, size: q.size };
    }
    async subscriptions(q) {
        const now = this.clock(), soon = new Date(now.getTime() + 3 * 86400000);
        let sub;
        switch (q.status) {
            case "ACTIVE":
                sub = {
                    status: "ACTIVE",
                    startedAt: { lte: now },
                    expiresAt: { gt: now },
                };
                break;
            case "SOON":
                sub = { status: "ACTIVE", expiresAt: { gt: now, lte: soon } };
                break;
            case "EXPIRED":
                sub = {
                    status: { in: ["ACTIVE", "EXPIRED", "PENDING"] },
                    expiresAt: { lte: now },
                };
                break;
            case "SUSPENDED":
            case "CANCELLED":
                sub = { status: q.status };
                break;
        }
        const where = {
            ...(q.q
                ? {
                    OR: [{ name: { contains: q.q } }, { reference: { contains: q.q } }],
                }
                : {}),
            ...(q.status === "NONE"
                ? { subscription_companyRecords: { none: {} } }
                : sub
                    ? { subscription_companyRecords: { some: sub } }
                    : {}),
        };
        const [total, companies] = await this.db.$transaction([
            this.db.company.count({ where }),
            this.db.company.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    reference: true,
                    status: true,
                    subscription_companyRecords: true,
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (q.page - 1) * q.size,
                take: q.size,
            }),
        ]);
        return {
            total,
            page: q.page,
            size: q.size,
            items: companies.map((c) => ({
                ...c,
                subscription: c.subscription_companyRecords[0] ?? null,
                subscriptionStatus: effectiveStatus(c.subscription_companyRecords[0] ?? null, now),
            })),
        };
    }
    async overview(days) {
        const now = this.clock(), from = new Date(now.getTime() - (days - 1) * 86400000);
        from.setUTCHours(0, 0, 0, 0);
        return this.db.$transaction(async (tx) => {
            const [active, expired, soon, none, pending, approved, amounts] = await Promise.all([
                tx.subscription.count({
                    where: {
                        status: "ACTIVE",
                        startedAt: { lte: now },
                        expiresAt: { gt: now },
                    },
                }),
                tx.subscription.count({
                    where: {
                        status: { in: ["ACTIVE", "EXPIRED", "PENDING"] },
                        expiresAt: { lte: now },
                    },
                }),
                tx.subscription.count({
                    where: {
                        status: "ACTIVE",
                        expiresAt: {
                            gt: now,
                            lte: new Date(now.getTime() + 3 * 86400000),
                        },
                    },
                }),
                tx.company.count({
                    where: { subscription_companyRecords: { none: {} } },
                }),
                tx.subscriptionPayment.count({ where: { status: "PENDING" } }),
                tx.subscriptionPayment.count({
                    where: {
                        status: "APPROVED",
                        validatedAt: { gte: from, lte: now },
                    },
                }),
                tx.subscriptionPayment.groupBy({
                    by: ["currency"],
                    where: {
                        status: "APPROVED",
                        validatedAt: { gte: from, lte: now },
                    },
                    _sum: { amount: true },
                }),
            ]);
            return {
                active,
                expired,
                soon,
                none,
                pending,
                approved,
                from,
                until: now,
                amounts: amounts.map((v) => ({
                    currency: v.currency,
                    amount: v._sum.amount?.toFixed(4) ?? "0",
                })),
            };
        }, { isolationLevel: "RepeatableRead" });
    }
    async detail(id, companyId) {
        return this.db.subscriptionPayment.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
            include: {
                company: { select: { name: true, reference: true, status: true } },
                subscriptionPeriod_paymentRecords: true,
            },
        });
    }
}
