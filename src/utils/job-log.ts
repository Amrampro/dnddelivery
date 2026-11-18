import path from "node:path";
import { technicalLog } from "./technical-log.js";

const jobId = () =>
  [
    path.basename(process.argv[1] ?? "job"),
    ...process.argv.slice(2).filter((value) => /^[a-z-]{1,40}$/.test(value)),
  ].join(" ");
function hasFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) =>
      (/^(failed|errors)$/i.test(key) &&
        typeof item === "number" &&
        item > 0) ||
      hasFailure(item),
  );
}
export async function reportJobResult(value: unknown) {
  console.log(value);
  await technicalLog({
    action: hasFailure(value) ? "JOB_PARTIAL_FAILURE" : "JOB_COMPLETED",
    result: hasFailure(value) ? "FAILURE" : "SUCCESS",
    actorId: null,
    entityId: jobId(),
  }).catch(() => console.error("TechnicalLogWriteFailed"));
}
export async function reportJobFailure(error?: unknown) {
  const errorType = error instanceof Error && /^[a-zA-Z0-9_]{1,80}$/.test(error.name) ? error.name : "JobError";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  await technicalLog({
    action: "JOB_FAILED",
    result: "FAILURE",
    actorId: null,
    entityId: jobId(),
    errorType,
    ...(/^[a-zA-Z0-9_]{1,40}$/.test(code) ? { errorCode: code } : {}),
  }).catch(() => console.error("TechnicalLogWriteFailed"));
}
