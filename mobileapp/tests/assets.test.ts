import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";

const root = resolve(".");
function checkSignature(file: string) {
  const bytes = readFileSync(file);
  if (extname(file).toLowerCase() === ".png") {
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], file);
  } else {
    assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255], file);
  }
}
function components(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(folder, entry.name);
    return entry.isDirectory() ? components(file) : file.endsWith(".tsx") ? [file] : [];
  });
}

test("component image extensions match their bytes for Android packaging", () => {
  let checked = 0;
  for (const file of [...components(resolve(root, "app")), ...components(resolve(root, "src"))]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/require\((["'])(.+\.(?:png|jpe?g))\1\)/g)) {
      checkSignature(resolve(dirname(file), match[2]!));
      checked++;
    }
  }
  assert.ok(checked > 0, "The test must inspect real component image references.");
});

test("Expo icon, splash and adaptive assets have the declared PNG signature", () => {
  const config = JSON.parse(readFileSync(resolve(root, "app.json"), "utf8")).expo;
  const assets = new Set<string>([
    config.icon,
    config.android.adaptiveIcon.foregroundImage,
    config.web.favicon,
    ...config.plugins.flatMap((plugin: unknown) => {
      if (!Array.isArray(plugin)) return [];
      const options = plugin[1] as { image?: string } | undefined;
      return options?.image ? [options.image] : [];
    }),
  ]);
  for (const asset of assets) checkSignature(resolve(root, asset));
});

test("correctly named header logo preserves every byte of the official legacy image", () => {
  assert.deepEqual(
    readFileSync(resolve(root, "assets/generated/brand-logo.jpg")),
    readFileSync(resolve(root, "assets/icon.png")),
  );
});
