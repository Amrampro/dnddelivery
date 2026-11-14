import { getDatabase } from "../database/client.js";
import { getAuthSettings } from "../config/auth.js";
export const health = (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok", service: "dnd-delivery-api", version: "1.0.0" });
};
// Share only concurrent checks so polling cannot queue one DB connection per request.
export function createReadiness(check, timeoutMs = 2500) {
    let pending;
    return async (_req, res) => {
        res.set("Cache-Control", "no-store");
        pending ??= Promise.resolve().then(check).then(() => true, () => false)
            .finally(() => { pending = undefined; });
        let timeout;
        try {
            const ready = await Promise.race([
                pending,
                new Promise(resolve => { timeout = setTimeout(() => resolve(false), timeoutMs); }),
            ]);
            res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
        }
        finally {
            clearTimeout(timeout);
        }
    };
}
export const readiness = createReadiness(async () => {
    getAuthSettings();
    // The initial schema alone predates the session fields required by login.
    await getDatabase().session.findFirst({ select: { clientType: true, activeContext: true } });
});
