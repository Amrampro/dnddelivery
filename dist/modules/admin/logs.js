import { z } from "zod";
import { technicalEntries } from "../../utils/technical-log.js";
export const logsQuery = z
    .object({
    category: z.enum(["security", "technical"]).default("security"),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    size: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(254).default(""),
    result: z.enum(["SUCCESS", "FAILURE", "INFO"]).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
})
    .refine((v) => !v.from || !v.to || v.from <= v.to, "Période invalide.");
export async function administrationLogs(db, query) {
    const { page, size, search, from, to, result } = query;
    if (query.category === "technical") {
        const output = await technicalEntries(page, size, from, to, result, search);
        const ids = [
            ...new Set(output.items.flatMap((e) => (e.actorId ? [e.actorId] : []))),
        ];
        const users = await db.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, email: true, fullName: true },
        });
        return {
            ...output,
            page,
            size,
            items: output.items.map((item) => ({
                ...item,
                actor: users.find((u) => u.id === item.actorId) ?? null,
            })),
        };
    }
    const where = {
        ...(from || to
            ? {
                createdAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                },
            }
            : {}),
        ...(result === "FAILURE"
            ? {
                OR: [
                    { type: "LOGIN_FAILURE" },
                    { metadata: { path: "$.reason", equals: "access_denied" } },
                    { metadata: { path: "$.reason", equals: "mail_delivery_failed" } },
                ],
            }
            : {}),
        ...(result === "SUCCESS"
            ? {
                OR: [
                    { type: { in: ["LOGIN_SUCCESS", "LOGOUT", "TOKEN_REVOKED"] } },
                    {
                        type: "PASSWORD_RESET",
                        metadata: { path: "$.reason", equals: "password_changed" },
                    },
                    {
                        type: "PASSWORD_RESET",
                        metadata: { path: "$.reason", equals: "token_consumed" },
                    },
                ],
            }
            : {}),
        ...(result === "INFO"
            ? {
                type: "PERMISSIONS_CHANGED",
                NOT: { metadata: { path: "$.reason", equals: "access_denied" } },
            }
            : {}),
        ...(search
            ? {
                AND: [
                    {
                        OR: [
                            { id: { contains: search } },
                            { userId: { contains: search } },
                            { user: { fullName: { contains: search } } },
                            { user: { email: { contains: search } } },
                            {
                                metadata: {
                                    path: "$.attemptedEmail",
                                    string_contains: search,
                                },
                            },
                            { metadata: { path: "$.sessionId", string_contains: search } },
                        ],
                    },
                ],
            }
            : {}),
    };
    const [items, total] = await Promise.all([
        db.authEvent.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * size,
            take: size,
            include: { user: { select: { id: true, fullName: true, email: true } } },
        }),
        db.authEvent.count({ where }),
    ]);
    return {
        page,
        size,
        total,
        items: items.map((e) => {
            const m = (e.metadata ?? {});
            const denied = m.reason === "access_denied";
            const details = Object.fromEntries([
                "reason",
                "sessionId",
                "client",
                "scope",
                "attemptedEmail",
                "method",
                "path",
                "status",
                "requestId",
            ].flatMap((key) => typeof m[key] === "string" || typeof m[key] === "number"
                ? [[key, m[key]]]
                : []));
            return {
                id: e.id,
                createdAt: e.createdAt.toISOString(),
                action: denied ? "ACCESS_DENIED" : e.type,
                result: e.type === "LOGIN_FAILURE" ||
                    denied ||
                    m.reason === "mail_delivery_failed"
                    ? "FAILURE"
                    : e.type === "PERMISSIONS_CHANGED"
                        ? "INFO"
                        : "SUCCESS",
                actor: e.user,
                actorId: e.userId,
                entityId: typeof m.sessionId === "string" ? m.sessionId : (e.userId ?? null),
                details,
            };
        }),
    };
}
