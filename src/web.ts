import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";

export function serveWeb(app: Express, publicRoot: string) {
  if (!existsSync(join(publicRoot, "index.html"))) return;
  app.use(express.static(publicRoot, { dotfiles: "deny", index: false, maxAge: 0 }));
  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || !req.accepts("html") ||
        req.path.split("/").some(part => part.startsWith(".")) ||
        (extname(req.path) && req.path !== "/index.html")) return next();
    res.setHeader("Cache-Control", "no-cache");
    // Only this fixed public file may live below a hidden release directory.
    res.sendFile(join(publicRoot, "index.html"), { dotfiles: "allow" });
  });
}
