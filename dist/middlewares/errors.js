import { ZodError } from "zod";
import { AuthError } from "../modules/auth/errors.js";
import { AccessDenied } from "../modules/authorization/tenant-access.js";
import { logger } from "../utils/logger.js";
import { recordTechnical } from "../utils/technical-log.js";
export const notFound = (_req, res) => {
    res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Route introuvable." } });
};
export const errors = async (err, _req, res, _next) => {
    res.locals.technicalErrorType = err instanceof Error && /^[a-zA-Z0-9_]{1,80}$/.test(err.name) ? err.name : "ServerError";
    res.locals.technicalErrorCode = err && typeof err.code === "string" && /^[a-zA-Z0-9_]{1,40}$/.test(err.code) ? err.code : undefined;
    const denied = (err instanceof AuthError && [401, 403].includes(err.status)) || err instanceof AccessDenied;
    if (denied && res.locals.securityEvent && !(err instanceof AuthError && err.code === "INVALID_CREDENTIALS")) {
        const userId = res.locals.principal?.user?.id ?? null;
        const metadata = { reason: "access_denied", method: _req.method,
            path: _req.path.slice(0, 250), status: String(err instanceof AuthError ? err.status : 403),
            requestId: String(_req.id ?? "").slice(0, 100) };
        try {
            await res.locals.securityEvent(userId, metadata);
        }
        catch {
            recordTechnical({ action: "SECURITY_LOG_UNAVAILABLE", result: "FAILURE", actorId: userId, entityId: "MySQL" });
        }
    }
    if (err instanceof AuthError) {
        res
            .status(err.status)
            .json({ error: { code: err.code, message: err.message } });
        return;
    }
    if (err instanceof AccessDenied) {
        res
            .status(403)
            .json({ error: { code: "ACCESS_DENIED", message: "Accès refusé." } });
        return;
    }
    if (err instanceof ZodError) {
        res
            .status(400)
            .json({
            error: {
                code: "INVALID_REQUEST",
                message: err.issues[0]?.message ?? "Requête invalide.",
            },
        });
        return;
    }
    const status = typeof err === "object" &&
        err !== null &&
        "status" in err &&
        [400, 413, 415].includes(Number(err.status))
        ? Number(err.status)
        : 500;
    logger.error({ errorType: err instanceof Error ? err.name : "UnknownError" }, "Request failed");
    res
        .status(status)
        .json({
        error: {
            code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
            message: status === 500
                ? "Le service est temporairement indisponible."
                : "Requête invalide.",
        },
    });
};
