import "dotenv/config";
import { z } from "zod";
import { technicalLog } from "../utils/technical-log.js";

// Called by the backup scheduler after its own backup or restore verification.
const input = z.object({
  action: z.enum([
    "BACKUP_COMPLETED",
    "BACKUP_FAILED",
    "RESTORE_VERIFIED",
    "RESTORE_FAILED",
  ]),
  entityId: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
});
try {
  const value = input.parse({
    action: process.argv[2],
    entityId: process.argv[3],
  });
  await technicalLog({
    ...value,
    actorId: null,
    result: value.action.endsWith("FAILED") ? "FAILURE" : "SUCCESS",
  });
} catch {
  console.error(
    "Résultat d’exploitation non enregistré. Fournir un événement valide et une référence sans secret.",
  );
  process.exitCode = 1;
}
