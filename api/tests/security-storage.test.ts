import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, unlink, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LocalProofStorage } from "../src/modules/confirmation/storage.js";
import { cleanupProofFiles } from "../src/modules/confirmation/cleanup.js";
import { persistLogo, readPrivateImage } from "../src/modules/admin/logos.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("security: proof directories cannot target any public application folder", () => {
  for (const folder of ["api/public", "webapp/public", "webapp/dist", "mobileapp/public", "mobileapp/dist"]) {
    const target = path.resolve(root, folder, "proofs");
    assert.throws(() => new LocalProofStorage(target), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
    if (process.platform === "win32")
      assert.throws(() => new LocalProofStorage(target.toUpperCase()), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
  }
});
test("security: a public-folder symlink cannot receive a private delivery photo", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "dnd-security-storage-"));
  const link = path.join(temporary, "proofs");
  try {
    await symlink(path.resolve(root, "webapp/public"), link, process.platform === "win32" ? "junction" : "dir");
    const storage = new LocalProofStorage(link);
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    await assert.rejects(storage.put(image, "image/png"), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
    await assert.rejects(persistLogo(image, "image/png", async () => {}, link), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
    await assert.rejects(cleanupProofFiles({} as PrismaClient, storage, true), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
    await assert.rejects(storage.remove("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp"), { code: "PROOF_STORAGE_PRIVATE_REQUIRED" });
  } finally { await unlink(link).catch(() => undefined); await rmdir(temporary); }
});

test("security: catalogue and logo reads reject symbolic files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dnd-security-media-"));
  const key = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp";
  const asset = path.join(directory, key);
  try {
    await writeFile(asset, "fixture");
    assert.equal((await readPrivateImage(directory, key)).toString(), "fixture");
    await unlink(asset);
    if (process.platform !== "win32") await symlink("/dev/null", asset, "file");
    await assert.rejects(readPrivateImage(directory, key));
  } finally {
    await unlink(asset).catch(() => undefined);
    await rmdir(directory);
  }
});
