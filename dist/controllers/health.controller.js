import { getDatabase } from "../database/client.js";
import { getAuthSettings } from "../config/auth.js";
import { recordTechnical } from "../utils/technical-log.js";
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
let dependencyAvailable;
export const readiness = createReadiness(async () => {
    try {
        getAuthSettings();
        await getDatabase().session.findFirst({ select: { clientType: true, activeContext: true } });
        if (dependencyAvailable !== true)
            recordTechnical({ action: "DEPENDENCIES_AVAILABLE", result: "SUCCESS", actorId: null, entityId: "auth/MySQL" });
        dependencyAvailable = true;
    }
    catch (error) {
        if (dependencyAvailable !== false)
            recordTechnical({ action: "DEPENDENCIES_UNAVAILABLE", result: "FAILURE", actorId: null, entityId: "auth/MySQL" });
        dependencyAvailable = false;
        throw error;
    }
});
