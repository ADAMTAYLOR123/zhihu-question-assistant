import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("Windows companion installs per-user and starts without a visible console", async () => {
  const installer = await readFile(new URL("companion/windows/installer.mjs", projectRoot), "utf8");
  const runner = await readFile(new URL("companion/windows/runner.mjs", projectRoot), "utf8");
  assert.match(installer, /LOCALAPPDATA/);
  assert.match(installer, /HKCU/);
  assert.match(installer, /wscript\.exe/i);
  assert.match(runner, /server\/index\.js/);
});

test("Windows package exposes install, status and uninstall entry points", async () => {
  const install = await readFile(new URL("companion/windows/install.cmd", projectRoot), "utf8");
  const status = await readFile(new URL("companion/windows/status.cmd", projectRoot), "utf8");
  const uninstall = await readFile(new URL("companion/windows/uninstall.cmd", projectRoot), "utf8");
  assert.match(install, /node\.exe/i);
  assert.match(status, /status/i);
  assert.match(uninstall, /uninstall/i);
});
