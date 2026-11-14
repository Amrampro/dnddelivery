import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, lstat } from "node:fs/promises";
import sharp from "sharp";
import { stockError } from "../stocks/access.js";
import { assertPrivateDirectory, checkPrivateDirectory } from "../../utils/private-storage.js";
export interface PrivateProofStorage {
  put(
    bytes: Buffer,
    mime: string,
  ): Promise<{ key: string; bytes: Buffer; checksum: string }>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalProofStorage implements PrivateProofStorage {
  readonly directory: string;
  constructor(
    directory = process.env.DELIVERY_PROOF_DIR || "storage/delivery-proofs",
  ) {
    this.directory = path.resolve(directory);
    assertPrivateDirectory(this.directory);
  }
  private file(key: string) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(key))
      throw stockError("PROOF_FILE_INVALID", "Preuve inaccessible.", 404);
    return path.join(this.directory, key);
  }
  async put(bytes: Buffer, mime: string) {
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > 5 * 1024 * 1024
    )
      throw stockError(
        "PROOF_SIZE_INVALID",
        "Photo de 5 Mo maximum requise.",
        400,
      );
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
      throw stockError(
        "PROOF_MIME_INVALID",
        "Choisissez une photo JPEG, PNG ou WebP.",
        400,
      );
    let output: Buffer;
    try {
      const image = sharp(bytes, {
          limitInputPixels: 16000000,
          failOn: "warning",
        }),
        meta = await image.metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
        `image/${meta.format}` !== mime ||
        (meta.pages ?? 1) !== 1
      )
        throw Error("Invalid image");
      output = await image
        .rotate()
        .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw stockError(
        "PROOF_IMAGE_INVALID",
        "Cette photo est illisible, trop grande ou d'un type interdit.",
        400,
      );
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await checkPrivateDirectory(this.directory);
    const key = randomUUID() + ".webp";
    await writeFile(this.file(key), output, { flag: "wx", mode: 0o600 });
    return {
      key,
      bytes: output,
      checksum: createHash("sha256").update(output).digest("hex"),
    };
  }
  async read(key: string) {
    try {
      await checkPrivateDirectory(this.directory);
      const file = this.file(key),
        stat = await lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 5 * 1024 * 1024
      )
        throw Error("Invalid file");
      return await readFile(file);
    } catch {
      throw stockError(
        "PROOF_FILE_UNAVAILABLE",
        "La photo n'est pas disponible. R�essayez l'envoi.",
        409,
      );
    }
  }
  async remove(key: string) {
    await checkPrivateDirectory(this.directory);
    await unlink(this.file(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
