import path from "node:path";
import { readdir, lstat } from "node:fs/promises";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { LocalProofStorage } from "./storage.js";
import { checkPrivateDirectory } from "../../utils/private-storage.js";
/** Only old UUID-named files without any FileAsset are eligible; no recursive deletion. */
export async function cleanupProofFiles(
  db: PrismaClient,
  storage = new LocalProofStorage(),
  apply = false,
  now = new Date(),
) {
  const candidates: string[] = [],
    removed: string[] = [];
  let files;
  try {
    await checkPrivateDirectory(storage.directory);
    files = await readdir(storage.directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { dryRun: !apply, candidates, removed };
    throw error;
  }
  for (const file of files) {
    if (!file.isFile() || !/^[a-f0-9-]{36}\.webp$/.test(file.name)) continue;
    const stat = await lstat(path.join(storage.directory, file.name));
    if (stat.isSymbolicLink() || stat.mtimeMs >= now.getTime() - 86400000)
      continue;
    if (
      await db.fileAsset.findUnique({
        where: { storageKey: file.name },
        select: { id: true },
      })
    )
      continue;
    candidates.push(file.name);
    if (apply) {
      await storage.remove(file.name);
      removed.push(file.name);
    }
  }
  return { dryRun: !apply, candidates, removed };
}
