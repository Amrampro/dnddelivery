import { reportJobResult, reportJobFailure } from "../utils/job-log.js";
import "dotenv/config";
import { getDatabase, disconnectDatabase } from "../database/client.js";
import { cleanupProofFiles } from "../modules/confirmation/cleanup.js";
try {
    await reportJobResult(await cleanupProofFiles(getDatabase(), undefined, process.argv.includes("--apply")));
}
catch (e) {
    await reportJobFailure(e);
    console.error(e instanceof Error ? e.name : "ProofCleanupError");
    process.exitCode = 1;
}
finally {
    await disconnectDatabase();
}
