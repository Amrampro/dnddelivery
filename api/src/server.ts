import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { checkAuthConfiguration } from "./config/auth.js";
import { recordTechnical, technicalLog } from "./utils/technical-log.js";
import { logger } from "./utils/logger.js";
import { disconnectDatabase } from "./database/client.js";
const server = createServer(app);
const auth = checkAuthConfiguration(process.env);
if (!auth.valid)
  logger.warn({ fields: auth.fields }, "Configuration d’authentification à corriger");
if (!process.env.DATABASE_URL)
  logger.warn({ fields: ["DATABASE_URL"] }, "Configuration MySQL à compléter");
server.on("listening", () => {
  logger.info({ port: env.PORT }, "DND Delivery API listening");
  recordTechnical({ action: "API_STARTED", result: "SUCCESS", actorId: null, entityId: `process:${process.pid}` });
});
server.listen(env.PORT, env.HOST);
server.on("error", (err) => {
  logger.fatal({ err }, "Server failed");
  process.exit(1);
});
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  const stopEvent = technicalLog({ action: "API_STOPPING", result: "INFO", actorId: null, entityId: `process:${process.pid}` })
    .catch(() => logger.error({ errorType: "TechnicalLogWriteFailed" }, "Journal technique indisponible"));
  logger.info({ signal }, "Stopping server");
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10000).unref();
  server.close(async (err) => {
    try {
      await Promise.all([disconnectDatabase(), stopEvent]);
      clearTimeout(deadline);
      process.exit(err ? 1 : 0);
    } catch (error) {
      logger.error({ err: error }, "Database shutdown failed");
      process.exit(1);
    }
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
