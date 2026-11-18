import "dotenv/config";
import { technicalLog } from "../utils/technical-log.js";

// Schedule independently of the API so an API shutdown can still be observed.
const base = process.env.API_MONITOR_URL || "http://127.0.0.1:3000";
try {
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error("Invalid monitor URL");
  const response = await fetch(new URL("/api/ready", url), {
    signal: AbortSignal.timeout(8000),
  });
  const value = (await response.json()) as { status?: string };
  const available = response.status === 200 && value.status === "ready";
  await technicalLog({
    action: available ? "API_AVAILABLE" : "API_UNAVAILABLE",
    result: available ? "SUCCESS" : "FAILURE",
    actorId: null,
    entityId: "api-monitor",
    status: response.status,
  });
  if (!available) process.exitCode = 1;
} catch {
  await technicalLog({
    action: "API_UNAVAILABLE",
    result: "FAILURE",
    actorId: null,
    entityId: "api-monitor",
  }).catch(() => console.error("TechnicalLogWriteFailed"));
  process.exitCode = 1;
}
