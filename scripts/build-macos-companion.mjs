import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, chmod, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nodeArchiveName, parseBuildOptions } from "./companion-build-utils.mjs";

if (process.platform !== "darwin") {
  throw new Error("macOS 伴侣程序安装包只能在 macOS 上构建。");
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const { architecture } = parseBuildOptions(process.argv.slice(2));
const packageName = `ZhihuQuestionAssistant-Companion-${packageJson.version}-macos-${architecture}`;
const distDirectory = path.join(projectRoot, "dist");
const packageDirectory = path.join(distDirectory, packageName);
const zipPath = path.join(distDirectory, `${packageName}.zip`);
const payloadDirectory = path.join(packageDirectory, "payload");
const companionSource = path.join(projectRoot, "companion/macos");

await rm(packageDirectory, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(path.join(payloadDirectory, "runtime"), { recursive: true });
await mkdir(path.join(payloadDirectory, "app"), { recursive: true });

await assertNoNativeDependencies(path.join(projectRoot, "node_modules"));
const { nodeBinary, nodeLicense } = await resolveNodeRuntime(architecture, distDirectory);
await cp(nodeBinary, path.join(payloadDirectory, "runtime/node"));
await cp(nodeLicense, path.join(payloadDirectory, "runtime/NODE_LICENSE.txt"));
await chmod(path.join(payloadDirectory, "runtime/node"), 0o755);

const fileResult = spawnSync("/usr/bin/file", [path.join(payloadDirectory, "runtime/node")], { encoding: "utf8" });
const expectedArchitecture = architecture === "x64" ? "x86_64" : "arm64";
if (fileResult.status !== 0 || !fileResult.stdout.includes(expectedArchitecture)) {
  throw new Error(`Node 运行时架构校验失败：${fileResult.stdout || fileResult.stderr}`);
}

for (const entry of ["server", "node_modules", "package.json", "package-lock.json"]) {
  await cp(path.join(projectRoot, entry), path.join(payloadDirectory, "app", entry), { recursive: true });
}
await cp(path.join(projectRoot, "extension"), path.join(payloadDirectory, "extension"), { recursive: true });

for (const entry of ["installer.mjs", "install.command", "uninstall.command", "status.command", "README.md"]) {
  await cp(path.join(companionSource, entry), path.join(packageDirectory, entry));
}
for (const entry of ["install.command", "uninstall.command", "status.command"]) {
  await chmod(path.join(packageDirectory, entry), 0o755);
}

await writeFile(
  path.join(packageDirectory, "build-manifest.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      platform: "darwin",
      architecture,
      node: process.version,
      extensionId: "jjlamjjlldhcbojhlkaeggbhldllcood",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

const zipResult = spawnSync("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", packageDirectory, zipPath], {
  encoding: "utf8",
});
if (zipResult.status !== 0) {
  throw new Error(`创建 ZIP 失败：${(zipResult.stderr || zipResult.stdout).trim()}`);
}

console.log(`伴侣程序目录：${packageDirectory}`);
console.log(`分发包：${zipPath}`);

async function resolveNodeRuntime(targetArchitecture, cacheParent) {
  if (targetArchitecture === process.arch) {
    const nodeBinary = await realpath(process.execPath);
    return { nodeBinary, nodeLicense: path.resolve(path.dirname(nodeBinary), "../LICENSE") };
  }

  const version = process.version;
  const archiveName = nodeArchiveName(version, targetArchitecture);
  const releaseBaseURL = `https://nodejs.org/dist/${version}`;
  const cacheDirectory = path.join(cacheParent, ".cache", `node-${version}-darwin-${targetArchitecture}`);
  const archivePath = path.join(cacheDirectory, archiveName);
  const checksumsPath = path.join(cacheDirectory, "SHASUMS256.txt");
  const extractedDirectory = path.join(cacheDirectory, archiveName.replace(/\.tar\.gz$/, ""));
  const nodeBinary = path.join(extractedDirectory, "bin/node");
  const nodeLicense = path.join(extractedDirectory, "LICENSE");

  await mkdir(cacheDirectory, { recursive: true });
  await download(`${releaseBaseURL}/SHASUMS256.txt`, checksumsPath);
  await download(`${releaseBaseURL}/${archiveName}`, archivePath);

  const checksums = await readFile(checksumsPath, "utf8");
  const expectedChecksum = checksums
    .split(/\r?\n/)
    .find((line) => line.endsWith(`  ${archiveName}`))
    ?.split(/\s+/)[0];
  if (!expectedChecksum) throw new Error(`未在 Node.js SHASUMS256.txt 中找到 ${archiveName}`);
  const actualChecksum = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Node.js 运行时校验和不匹配：${archiveName}`);
  }

  await rm(extractedDirectory, { recursive: true, force: true });
  const tarResult = spawnSync("/usr/bin/tar", ["-xzf", archivePath, "-C", cacheDirectory], { encoding: "utf8" });
  if (tarResult.status !== 0) throw new Error(`解压 Node.js 运行时失败：${tarResult.stderr}`);
  return { nodeBinary, nodeLicense };
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
    if (entry.isDirectory()) {
      await assertNoNativeDependencies(entryPath);
    } else if (entry.name.endsWith(".node")) {
      throw new Error(`交叉构建前发现原生依赖：${entryPath}`);
    }
  }
}
