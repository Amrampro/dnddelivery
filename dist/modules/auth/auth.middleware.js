import { AuthError, unauthorized } from "./errors.js";
export const clientType = (req) => req.get("X-DND-Client") === "mobile" ? "MOBILE" : "WEB";
export function principal(res) {
    return res.locals.principal;
}
export function requireAuthentication(service, checkContext = true) {
    return async (req, res, next) => {
        try {
            const type = clientType(req);
            const bearer = req.get("Authorization");
            const token = type === "MOBILE" && bearer?.startsWith("Bearer ")
                ? bearer.slice(7)
                : type === "WEB"
                    ? req.cookies?.dnd_access
                    : undefined;
            if (typeof token !== "string")
                throw unauthorized();
            const authenticated = await service().authenticate(token, type);
            const expected = req.get("X-DND-Context");
            if (req.get("X-DND-User") !== undefined && req.get("X-DND-User") !== authenticated.user.id)
                throw new AuthError(403, "SESSION_CHANGED", "Le compte connecté a changé dans une autre fenêtre. Actualisez vos accès avant de poursuivre.");
            const selected = authenticated.session.activeContext;
            const actual = selected && typeof selected === "object" && "key" in selected ? selected.key : null;
            if (checkContext && expected !== undefined && expected !== actual)
                throw new AuthError(403, "CONTEXT_CHANGED", "Votre environnement a changé dans une autre fenêtre. Actualisez vos accès avant de poursuivre.");
            res.locals.principal = authenticated;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
export function requirePermission(service, permission) {
    return async (_req, res, next) => {
        try {
            res.locals.workspace = await service().requirePermission(principal(res), permission);
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
export function requireTrustedOrigin(origins) {
    return (req, _res, next) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method))
            return next();
        const origin = req.get("Origin");
        let source = origin;
        try {
            if (!source && req.get("Referer"))
                source = new URL(req.get("Referer")).origin;
        }
        catch {
            /* Invalid referrer is rejected below. */
        }
        if (source && !origins.includes(source))
            return next(new AuthError(403, "ORIGIN_REJECTED", "Origine de la requête refusée."));
        if (clientType(req) === "WEB" &&
            (!source || req.get("X-DND-Client") !== "web"))
            return next(new AuthError(403, "ORIGIN_REJECTED", "La vérification de sécurité a échoué."));
        next();
    };
}
export function requireCsrf(service) {
    return (req, res, next) => {
        try {
            service().checkCsrf(principal(res).session, req.get("X-CSRF-Token"));
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
