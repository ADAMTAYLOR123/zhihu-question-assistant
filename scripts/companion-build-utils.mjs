export function parseBuildOptions(args, defaultArchitecture = process.arch) {
  let architecture = defaultArchitecture;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--arch") {
      architecture = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--arch=")) {
      architecture = argument.slice("--arch=".length);
    } else {
      throw new Error(`未知构建参数：${argument}`);
    }
  }
  if (!["x64", "arm64"].includes(architecture)) {
    throw new Error("目标架构必须是 x64 或 arm64。");
  }
  return { architecture };
}

export function nodeArchiveName(version, architecture) {
  return `node-${version}-darwin-${architecture}.tar.gz`;
}

export function windowsNodeArchiveName(version, architecture) {
  return `node-${version}-win-${architecture}.zip`;
}
