import { spawn, spawnSync } from "node:child_process";
import { constants, readFileSync } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "ZhihuQuestionAssistant";
const EXTENSION_ID = "jjlamjjlldhcbojhlkaeggbhldllcood";
const PORT = 3000;
const platform = process.env.ZH_QA_TEST_PLATFORM || process.platform;
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local");
const installRoot = process.env.ZH_QA_INSTALL_ROOT || path.join(localAppData, APP_NAME);
const skipSystemActions = process.env.ZH_QA_SKIP_SYSTEM_ACTIONS === "1";
const command = process.argv[2] || "status";

if (platform !== "win32") throw new Error("当前伴侣程序仅支持 Windows。");

if (command === "install") await install();
else if (command === "uninstall") await uninstall();
else if (command === "restart") await restart();
else if (command === "status") await status();
else throw new Error(`未知命令：${command}`);

async function install() {
  const payloadRoot = path.join(packageRoot, "payload");
  await Promise.all([
    access(path.join(payloadRoot, "runtime/node.exe"), constants.R_OK),
    access(path.join(payloadRoot, "app/server/index.js"), constants.R_OK),
    access(path.join(payloadRoot, "extension/manifest.json"), constants.R_OK),
    access(path.join(packageRoot, "runner.mjs"), constants.R_OK),
  ]);

  let existingEnv = "";
  try {
    existingEnv = await readFile(path.join(installRoot, "app/.env"), "utf8");
  } catch {
    // 首次安装时尚无配置。
  }

  stopService();
  await mkdir(installRoot, { recursive: true });
  for (const entry of ["app", "runtime", "extension"]) {
    await rm(path.join(installRoot, entry), { recursive: true, force: true });
    await cp(path.join(payloadRoot, entry), path.join(installRoot, entry), { recursive: true });
  }
  await cp(path.join(packageRoot, "runner.mjs"), path.join(installRoot, "runner.mjs"));
  await mkdir(path.join(installRoot, "logs"), { recursive: true });
  await mkdir(path.join(installRoot, "run"), { recursive: true });
  await writeFile(path.join(installRoot, "app/.env"), await buildEnvironment(existingEnv), { mode: 0o600 });
  await writeFile(path.join(installRoot, "start-hidden.vbs"), buildVbs(), "utf8");

  if (!skipSystemActions) {
    registerStartup();
    startService();
    await waitForHealth();
  }

  console.log("知乎提问助手 Windows 本地伴侣程序已安装。");
  console.log(`扩展目录：${path.join(installRoot, "extension")}`);
  console.log(`扩展 ID：${EXTENSION_ID}`);
}

async function uninstall() {
  stopService();
  if (!skipSystemActions) {
    spawnSync("reg.exe", ["DELETE", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", APP_NAME, "/f"], {
      windowsHide: true,
    });
  }
  await rm(installRoot, { recursive: true, force: true });
  console.log("知乎提问助手 Windows 本地伴侣程序已卸载。");
}

async function restart() {
  stopService();
  if (!skipSystemActions) {
    startService();
    await waitForHealth();
  }
  console.log("后台服务已重启。");
}

async function status() {
  const healthy = await isHealthy();
  console.log(healthy ? "后台服务正在运行。" : "后台服务未运行。");
  if (!healthy) process.exitCode = 1;
}

function registerStartup() {
  const commandValue = `"${path.join(process.env.SystemRoot || "C:\\Windows", "System32/wscript.exe")}" "${path.join(
    installRoot,
    "start-hidden.vbs",
  )}"`;
  const result = spawnSync(
    "reg.exe",
    ["ADD", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", APP_NAME, "/t", "REG_SZ", "/d", commandValue, "/f"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) throw new Error(`注册 Windows 登录自启动失败：${result.stderr || result.stdout}`);
}

function startService() {
  const child = spawn("wscript.exe", [path.join(installRoot, "start-hidden.vbs")], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function stopService() {
  if (skipSystemActions) return;
  try {
    const pidData = JSON.parse(readFileSync(path.join(installRoot, "run/runner.pid.json"), "utf8"));
    if (Number.isInteger(pidData.runnerPid)) {
      spawnSync("taskkill.exe", ["/PID", String(pidData.runnerPid), "/T", "/F"], { windowsHide: true });
    }
  } catch {
    // 服务未运行或 PID 文件已失效。
  }
}

async function buildEnvironment(existingEnv) {
  const lines = existingEnv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allowedIndex = lines.findIndex((line) => line.startsWith("ALLOWED_EXTENSION_IDS="));
  if (allowedIndex >= 0) {
    const ids = new Set(lines[allowedIndex].slice("ALLOWED_EXTENSION_IDS=".length).split(",").filter(Boolean));
    ids.add(EXTENSION_ID);
    lines[allowedIndex] = `ALLOWED_EXTENSION_IDS=${[...ids].join(",")}`;
  } else {
    lines.unshift(`ALLOWED_EXTENSION_IDS=${EXTENSION_ID}`);
  }
  addDefault(lines, "OPENAI_TIMEOUT_MS", "120000");
  addDefault(lines, "CODEX_TIMEOUT_MS", "180000");
  addDefault(lines, "PORT", String(PORT));
  if (!lines.some((line) => line.startsWith("CODEX_BINARY="))) {
    const codexBinary = findNativeCodex();
    if (codexBinary) lines.push(`CODEX_BINARY=${codexBinary}`);
  }
  return `${lines.join("\r\n")}\r\n`;
}

function addDefault(lines, key, value) {
  if (!lines.some((line) => line.startsWith(`${key}=`))) lines.push(`${key}=${value}`);
}

function findNativeCodex() {
  if (skipSystemActions) return "";
  const result = spawnSync("where.exe", ["codex.exe"], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() || "" : "";
}

function buildVbs() {
  const nodePath = path.join(installRoot, "runtime/node.exe").replaceAll('"', '""');
  const runnerPath = path.join(installRoot, "runner.mjs").replaceAll('"', '""');
  return `Set shell = CreateObject("WScript.Shell")\r\nshell.Run """${nodePath}"" ""${runnerPath}""", 0, False\r\n`;
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("后台服务健康检查超时，请查看 logs\\server.err.log。");
}

function isHealthy() {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port: PORT, path: "/health", timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
