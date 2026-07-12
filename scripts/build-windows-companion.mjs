import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { windowsNodeArchiveName } from "./companion-build-utils.mjs";

if (process.platform !== "darwin") {
  throw new Error("当前 Windows 交叉构建器需要在 macOS 上运行。");
}

const architecture = "x64";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const packageName = `ZhihuQuestionAssistant-Companion-${packageJson.version}-windows-${architecture}`;
const distDirectory = path.join(projectRoot, "dist");
const packageDirectory = path.join(distDirectory, packageName);
const payloadDirectory = path.join(packageDirectory, "payload");
const zipPath = path.join(distDirectory, `${packageName}.zip`);
const sourceDirectory = path.join(projectRoot, "companion/windows");

await assertNoNativeDependencies(path.join(projectRoot, "node_modules"));
const { nodeBinary, nodeLicense } = await resolveWindowsNode(distDirectory, architecture);

await rm(packageDirectory, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(path.join(payloadDirectory, "runtime"), { recursive: true });
await mkdir(path.join(payloadDirectory, "app"), { recursive: true });
await cp(nodeBinary, path.join(payloadDirectory, "runtime/node.exe"));
await cp(nodeLicense, path.join(payloadDirectory, "runtime/NODE_LICENSE.txt"));

const fileResult = spawnSync("/usr/bin/file", [path.join(payloadDirectory, "runtime/node.exe")], { encoding: "utf8" });
if (fileResult.status !== 0 || !/PE32\+.*x86-64/i.test(fileResult.stdout)) {
  throw new Error(`Windows Node 架构校验失败：${fileResult.stdout || fileResult.stderr}`);
}

for (const entry of ["server", "node_modules", "package.json", "package-lock.json"]) {
  await cp(path.join(projectRoot, entry), path.join(payloadDirectory, "app", entry), { recursive: true });
}
await cp(path.join(projectRoot, "extension"), path.join(payloadDirectory, "extension"), { recursive: true });
for (const entry of ["installer.mjs", "runner.mjs", "install.cmd", "status.cmd", "uninstall.cmd", "README.md"]) {
  await cp(path.join(sourceDirectory, entry), path.join(packageDirectory, entry));
}
for (const entry of ["install.cmd", "status.cmd", "uninstall.cmd"]) {
  const filePath = path.join(packageDirectory, entry);
  const content = (await readFile(filePath, "utf8")).replace(/\r?\n/g, "\r\n");
  await writeFile(filePath, content);
}

await writeFile(
  path.join(packageDirectory, "build-manifest.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      platform: "win32",
      architecture,
      node: process.version,
      extensionId: "jjlamjjlldhcbojhlkaeggbhldllcood",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

const zipResult = spawnSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", packageDirectory, zipPath], { encoding: "utf8" });
if (zipResult.status !== 0) throw new Error(`创建 Windows ZIP 失败：${zipResult.stderr || zipResult.stdout}`);

console.log(`Windows 伴侣程序目录：${packageDirectory}`);
console.log(`Windows 分发包：${zipPath}`);

async function resolveWindowsNode(cacheParent, targetArchitecture) {
  const version = process.version;
  const archiveName = windowsNodeArchiveName(version, targetArchitecture);
  const releaseBaseURL = `https://nodejs.org/dist/${version}`;
  const cacheDirectory = path.join(cacheParent, ".cache", `node-${version}-win-${targetArchitecture}`);
  const archivePath = path.join(cacheDirectory, archiveName);
  const checksumsPath = path.join(cacheDirectory, "SHASUMS256.txt");
  const extractedDirectory = path.join(cacheDirectory, archiveName.replace(/\.zip$/, ""));
  await mkdir(cacheDirectory, { recursive: true });
  await download(`${releaseBaseURL}/SHASUMS256.txt`, checksumsPath);
  await download(`${releaseBaseURL}/${archiveName}`, archivePath);

  const checksums = await readFile(checksumsPath, "utf8");
  const expected = checksums
    .split(/\r?\n/)
    .find((line) => line.endsWith(`  ${archiveName}`))
    ?.split(/\s+/)[0];
  if (!expected) throw new Error(`未在 Node.js SHASUMS256.txt 中找到 ${archiveName}`);
  const actual = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  if (actual !== expected) throw new Error(`Node.js 运行时校验和不匹配：${archiveName}`);

  await rm(extractedDirectory, { recursive: true, force: true });
  const extractResult = spawnSync("/usr/bin/ditto", ["-x", "-k", archivePath, cacheDirectory], { encoding: "utf8" });
  if (extractResult.status !== 0) throw new Error(`解压 Windows Node.js 失败：${extractResult.stderr}`);
  return { nodeBinary: path.join(extractedDirectory, "node.exe"), nodeLicense: path.join(extractedDirectory, "LICENSE") };
}

async function download(url, destination) {
  console.log(`下载：${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）：${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function assertNoNativeDependencies(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertNoNativeDependencies(entryPath);
    else if (entry.name.endsWith(".node")) throw new Error(`交叉构建前发现原生依赖：${entryPath}`);
  }
}
