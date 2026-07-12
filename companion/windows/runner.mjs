import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const installRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = path.join(installRoot, "run");
const logsDirectory = path.join(installRoot, "logs");
const pidPath = path.join(runtimeDirectory, "runner.pid.json");
mkdirSync(runtimeDirectory, { recursive: true });
mkdirSync(logsDirectory, { recursive: true });

const stdout = openSync(path.join(logsDirectory, "server.out.log"), "a");
const stderr = openSync(path.join(logsDirectory, "server.err.log"), "a");
const child = spawn(path.join(installRoot, "runtime/node.exe"), [path.join(installRoot, "app/server/index.js")], {
  cwd: path.join(installRoot, "app"),
  env: process.env,
  stdio: ["ignore", stdout, stderr],
  windowsHide: true,
});

writeFileSync(pidPath, JSON.stringify({ runnerPid: process.pid, serverPid: child.pid }));

child.on("error", (error) => {
  writeFileSync(path.join(logsDirectory, "runner.error.log"), `${error.stack || error.message}\n`, { flag: "a" });
});

child.on("close", (code) => {
  rmSync(pidPath, { force: true });
  closeSync(stdout);
  closeSync(stderr);
  process.exit(code || 0);
});
