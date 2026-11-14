import "dotenv/config";
import { getDatabase, disconnectDatabase } from "../database/client.js";
import { cleanupProofFiles } from "../modules/confirmation/cleanup.js";
try {
  console.log(
    await cleanupProofFiles(
      getDatabase(),
      undefined,
      process.argv.includes("--apply"),
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.name : "ProofCleanupError");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
