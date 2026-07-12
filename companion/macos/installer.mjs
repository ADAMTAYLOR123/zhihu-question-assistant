import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "com.bret.zhihu-question-assistant";
const EXTENSION_ID = "jjlamjjlldhcbojhlkaeggbhldllcood";
const PORT = 3000;
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const homeDirectory = os.homedir();
const installRoot = process.env.ZH_QA_INSTALL_ROOT || path.join(homeDirectory, "Library/Application Support/ZhihuQuestionAssistant");
const launchAgentsDirectory =
  process.env.ZH_QA_LAUNCH_AGENTS_DIR || path.join(homeDirectory, "Library/LaunchAgents");
const plistPath = path.join(launchAgentsDirectory, `${LABEL}.plist`);
const domain = `gui/${process.getuid()}`;
const skipLaunchctl = process.env.ZH_QA_SKIP_LAUNCHCTL === "1";

const command = process.argv[2] || "status";

if (process.platform !== "darwin") {
  throw new Error("当前伴侣程序仅支持 macOS。");
}

if (command === "install") {
  await install();
} else if (command === "uninstall") {
  await uninstall();
} else if (command === "restart") {
  await restart();
} else if (command === "status") {
  await status();
} else {
  throw new Error(`未知命令：${command}`);
}

async function install() {
  const payloadRoot = path.join(packageRoot, "payload");
  const bundledNode = path.join(payloadRoot, "runtime/node");
  const bundledApp = path.join(payloadRoot, "app");
  const bundledExtension = path.join(payloadRoot, "extension");
  await Promise.all([
    access(bundledNode, constants.X_OK),
    access(path.join(bundledApp, "server/index.js"), constants.R_OK),
    access(path.join(bundledExtension, "manifest.json"), constants.R_OK),
  ]);

  const installedEnvPath = path.join(installRoot, "app/.env");
  let existingEnv = "";
  try {
    existingEnv = await readFile(installedEnvPath, "utf8");
  } catch {
    // 首次安装时尚无配置。
  }

  stopService();
  await mkdir(installRoot, { recursive: true });
  await Promise.all([
    rm(path.join(installRoot, "app"), { recursive: true, force: true }),
    rm(path.join(installRoot, "runtime"), { recursive: true, force: true }),
    rm(path.join(installRoot, "extension"), { recursive: true, force: true }),
  ]);
  await cp(bundledApp, path.join(installRoot, "app"), { recursive: true });
  await cp(path.join(payloadRoot, "runtime"), path.join(installRoot, "runtime"), { recursive: true });
  await cp(bundledExtension, path.join(installRoot, "extension"), { recursive: true });
  await access(path.join(installRoot, "runtime/node"), constants.X_OK);
  await mkdir(path.join(installRoot, "logs"), { recursive: true });

  const envContent = await buildEnvironment(existingEnv);
  await writeFile(installedEnvPath, envContent, { mode: 0o600 });
  await mkdir(launchAgentsDirectory, { recursive: true });
  await writeFile(plistPath, buildPlist(), { mode: 0o600 });

  if (!skipLaunchctl) {
    runLaunchctl(["bootstrap", domain, plistPath], "后台服务加载失败");
    await waitForHealth();
  }

  console.log("知乎提问助手本地伴侣程序已安装。");
  console.log(`扩展目录：${path.join(installRoot, "extension")}`);
  console.log(`扩展 ID：${EXTENSION_ID}`);
  console.log("后端地址：http://127.0.0.1:3000");
}

async function uninstall() {
  stopService();
  await rm(plistPath, { force: true });
  await rm(installRoot, { recursive: true, force: true });
  console.log("知乎提问助手本地伴侣程序已卸载。");
}

async function restart() {
  if (skipLaunchctl) return;
  stopService();
  runLaunchctl(["bootstrap", domain, plistPath], "后台服务重启失败");
  await waitForHealth();
  console.log("后台服务已重启。");
}

async function status() {
  if (skipLaunchctl) {
    console.log(`测试模式：${installRoot}`);
    return;
  }
  const result = spawnSync("/bin/launchctl", ["print", `${domain}/${LABEL}`], { encoding: "utf8" });
  if (result.status === 0 && /state = running/.test(result.stdout)) {
    console.log("后台服务正在运行。");
  } else {
    console.log("后台服务未运行。");
    process.exitCode = 1;
  }
}

function stopService() {
  if (skipLaunchctl) return;
  spawnSync("/bin/launchctl", ["bootout", `${domain}/${LABEL}`], { encoding: "utf8" });
}

function runLaunchctl(args, errorMessage) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${errorMessage}：${(result.stderr || result.stdout).trim()}`);
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
    const codexBinary = await findCodexBinary();
    if (codexBinary) lines.push(`CODEX_BINARY=${codexBinary}`);
  }

  return `${lines.join("\n")}\n`;
}

function addDefault(lines, key, value) {
  if (!lines.some((line) => line.startsWith(`${key}=`))) lines.push(`${key}=${value}`);
}

async function findCodexBinary() {
  const candidates = [
    ...String(process.env.PATH || "")
      .split(":")
      .filter(Boolean)
      .map((directory) => path.join(directory, "codex")),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    path.join(homeDirectory, ".local/bin/codex"),
  ];
  for (const candidate of new Set(candidates)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 继续检查下一个常见位置。
    }
  }
  return "";
}

function buildPlist() {
  const nodePath = path.join(installRoot, "runtime/node");
  const serverPath = path.join(installRoot, "app/server/index.js");
  const appDirectory = path.join(installRoot, "app");
  const pathValue = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(homeDirectory, ".local/bin"),
    "/usr/bin",
    "/bin",
  ].join(":");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array><string>${xmlEscape(nodePath)}</string><string>${xmlEscape(serverPath)}</string></array>
    <key>WorkingDirectory</key><string>${xmlEscape(appDirectory)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key><string>${xmlEscape(homeDirectory)}</string>
      <key>PATH</key><string>${xmlEscape(pathValue)}</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>${xmlEscape(path.join(installRoot, "logs/server.out.log"))}</string>
    <key>StandardErrorPath</key><string>${xmlEscape(path.join(installRoot, "logs/server.err.log"))}</string>
  </dict>
</plist>
`;
}

function xmlEscape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function waitForHealth() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("后台服务已安装，但健康检查超时。请查看 logs/server.err.log。");
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
