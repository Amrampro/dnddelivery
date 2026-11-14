import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AuthError } from "../modules/auth/errors.js";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const publicRoots = [path.resolve("public"), ...["api/public", "webapp/public", "webapp/dist", "mobileapp/public", "mobileapp/dist"].map(p => path.resolve(repository, p))];
const normalized = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
export function assertPrivateDirectory(directory: string, roots = publicRoots) {
  const candidate = normalized(path.resolve(directory));
  if (roots.some(root => { const relative = path.relative(normalized(root), candidate);
    return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); }))
    throw new AuthError(503, "PROOF_STORAGE_PRIVATE_REQUIRED", "Le répertoire de preuves doit rester hors des répertoires publics.");
}
export async function checkPrivateDirectory(directory: string) {
  const actual = await realpath(directory);
  const roots = await Promise.all(publicRoots.map(root => realpath(root).catch(() => root)));
  assertPrivateDirectory(actual, roots);
}
