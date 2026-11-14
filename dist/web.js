import express from "express";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
export function serveWeb(app, publicRoot) {
    if (!existsSync(join(publicRoot, "index.html")))
        return;
    app.use(express.static(publicRoot, { dotfiles: "deny", index: false, maxAge: 0 }));
    app.use((req, res, next) => {
        if (!["GET", "HEAD"].includes(req.method) || !req.accepts("html") ||
            req.path.split("/").some(part => part.startsWith(".")) ||
            (extname(req.path) && req.path !== "/index.html"))
            return next();
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(join(publicRoot, "index.html"));
    });
}
