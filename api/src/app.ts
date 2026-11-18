import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { routes } from "./routes/index.js";
import { errors, notFound } from "./middlewares/errors.js";
import { httpLogSerializers } from "./utils/http-log.js";
import { fileURLToPath } from "node:url";
import { serveWeb } from "./web.js";
import { recordTechnical } from "./utils/technical-log.js";
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(pinoHttp({ logger, serializers: httpLogSerializers }));
app.use(express.json({ limit: "100kb", inflate: false }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 500 && req.path !== "/api/ready")
      recordTechnical({ action: "HTTP_SERVER_ERROR", result: "FAILURE",
        actorId: res.locals.principal?.user?.id ?? null,
        entityId: req.path.slice(0, 250), method: req.method,
        status: res.statusCode, requestId: String(req.id ?? "").slice(0, 100),
        errorType: res.locals.technicalErrorType, errorCode: res.locals.technicalErrorCode });
  });
  next();
});
app.use("/api", routes);
// Keep unknown API routes as JSON 404s instead of serving the SPA.
app.use("/api", notFound);
serveWeb(app, fileURLToPath(new URL("../public/", import.meta.url)));
app.use(notFound);
app.use(errors);
