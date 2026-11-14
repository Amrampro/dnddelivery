import { spawn } from "node:child_process";
import { error as logError } from "node:console";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const portableNode = fileURLToPath(
  new URL("../../.local-preserved/runtime/node-v22.23.4-win-x64/node.exe", import.meta.url),
);
const node = process.platform === "win32" && existsSync(portableNode)
  ? portableNode
  : process.execPath;
const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
// tsx watch ignores dotfiles even when they are explicitly included.
// Use Node's recursive file watcher on platforms supporting --watch-path.
const watchPaths = process.platform === "win32" || process.platform === "darwin";
const command = watchPaths
  ? ["--watch-path=src", ...(existsSync(".env") ? ["--watch-path=.env"] : []),
      "--import", "tsx", "src/server.ts"]
  : [tsx, "watch", "src/server.ts"];
const watcher = spawn(node, [...command, ...process.argv.slice(2)], {
  stdio: "inherit",
});

watcher.on("error", (error) => {
  logError(`Impossible de lancer l'API : ${error.message}`);
  process.exitCode = 1;
});
watcher.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
