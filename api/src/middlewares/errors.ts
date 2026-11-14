import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AuthError } from "../modules/auth/errors.js";
import { AccessDenied } from "../modules/authorization/tenant-access.js";
import { logger } from "../utils/logger.js";
export const notFound: RequestHandler = (_req, res) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route introuvable." } });
};
export const errors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AuthError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof AccessDenied) {
    res
      .status(403)
      .json({ error: { code: "ACCESS_DENIED", message: "Acc�s refus�." } });
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({
        error: {
          code: "INVALID_REQUEST",
          message: err.issues[0]?.message ?? "Requ�te invalide.",
        },
      });
    return;
  }
  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    [400, 413, 415].includes(Number(err.status))
      ? Number(err.status)
      : 500;
  logger.error(
    { errorType: err instanceof Error ? err.name : "UnknownError" },
    "Request failed",
  );
  res
    .status(status)
    .json({
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
        message:
          status === 500
            ? "Le service est temporairement indisponible."
            : "Requ�te invalide.",
      },
    });
};
