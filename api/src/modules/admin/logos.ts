import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AuthError } from "../auth/errors.js";
import type { AdminService } from "./service.js";
import { assertPrivateDirectory, checkPrivateDirectory } from "../../utils/private-storage.js";
export const companyLogoDirectory = () =>
  path.resolve(process.env.COMPANY_LOGO_DIR || "storage/company-logos");
export async function readPrivateImage(directory: string, key: string) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw Error("Invalid image key");
  await checkPrivateDirectory(directory);
  const file = path.join(directory, key);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw Error("Invalid image file");
  return readFile(file);
}
export async function persistLogo(
  bytes: Buffer,
  mime: string,
  work: (key: string) => Promise<unknown>,
  storageDirectory = companyLogoDirectory(),
) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(mime) ||
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > 2 * 1024 * 1024
  )
    throw new AuthError(
      400,
      "LOGO_INVALID",
      "Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.",
    );
  let data: Buffer;
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16000000,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1 ||
      `image/${meta.format}` !== mime
    )
      throw new Error("Unsupported image");
    data = await image
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AuthError(
      400,
      "LOGO_INVALID",
      "Cette image est illisible, trop grande ou d'un type non autoris�.",
    );
  }
  const key = `${randomUUID()}.webp`;
  const folder = path.resolve(storageDirectory);
  assertPrivateDirectory(folder);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await checkPrivateDirectory(folder);
  await writeFile(path.join(folder, key), data, { flag: "wx", mode: 0o600 });
  try {
    await work(key);
  } catch (e) {
    await unlink(path.join(folder, key)).catch(() => undefined);
    throw e;
  }
  // Previously associated images are retained for recovery; clean only confirmed unreferenced files during maintenance.
}
export async function putLogo(
  service: AdminService,
  actor: string,
  id: string,
  version: number,
  bytes: Buffer,
  mime: string,
) {
  await persistLogo(bytes, mime, (key) =>
    service.write(actor, async (tx) => {
      await service.lockCompany(tx, id, version);
      await tx.company.update({
        where: { id },
        data: { logoKey: key, version: { increment: 1 } },
      });
      await service.audit(tx, actor, id, "COMPANY_LOGO_UPDATED");
    }),
  );
  return service.detail(id);
}
export async function getLogo(service: Pick<AdminService, "db">, id: string) {
  const company = await service.db.company.findUnique({
    where: { id },
    select: { logoKey: true },
  });
  if (!company?.logoKey || !/^[a-f0-9-]{36}\.webp$/.test(company.logoKey))
    throw new AuthError(404, "LOGO_NOT_FOUND", "Aucun logo associ�.");
  try {
    const bytes = await readPrivateImage(companyLogoDirectory(), company.logoKey);
    return { mime: "image/webp", image: bytes.toString("base64") };
  } catch {
    throw new AuthError(404, "LOGO_NOT_FOUND", "Logo indisponible.");
  }
}
