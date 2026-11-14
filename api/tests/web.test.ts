import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { serveWeb } from "../src/web.js";
import { notFound } from "../src/middlewares/errors.js";

test("integrated web supports deep links without exposing private files or masking API errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "dnd-web-test-"));
  const publicRoot = join(root, "public");
  mkdirSync(publicRoot);
  mkdirSync(join(publicRoot, "assets"));
  writeFileSync(join(publicRoot, "index.html"), "<!doctype html><title>DND fixture</title>");
  writeFileSync(join(publicRoot, "assets/app.js"), "console.log('public');");
  writeFileSync(join(root, ".env"), "PRIVATE_FIXTURE=never-public");
  const app = express();
  app.use("/api", notFound);
  serveWeb(app, publicRoot);
  app.use(notFound);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ["/", "/connexion", "/espace/commandes"]) {
      const response = await fetch(base + path, { headers: { Accept: "text/html" } });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /DND fixture/);
      assert.equal(response.headers.get("cache-control"), "no-cache");
    }
    assert.equal((await fetch(base + "/assets/app.js")).status, 200);
    for (const path of ["/api/missing", "/api", "/.env", "/prisma/schema.prisma", "/assets/missing.js"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /PRIVATE_FIXTURE|DND fixture/);
    }
    assert.equal((await fetch(base + "/connexion", { method: "POST" })).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
