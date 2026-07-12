import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("distribution manifest has a stable extension id", async () => {
  const manifest = JSON.parse(await readFile(new URL("extension/manifest.json", projectRoot), "utf8"));
  const publicKey = Buffer.from(manifest.key, "base64");
  const hex = createHash("sha256").update(publicKey).digest("hex").slice(0, 32);
  const extensionId = [...hex].map((value) => String.fromCharCode(97 + Number.parseInt(value, 16))).join("");
  assert.equal(extensionId, "jjlamjjlldhcbojhlkaeggbhldllcood");
});

test("macOS companion scripts use the bundled runtime and fixed extension id", async () => {
  const installer = await readFile(new URL("companion/macos/installer.mjs", projectRoot), "utf8");
  const launcher = await readFile(new URL("companion/macos/install.command", projectRoot), "utf8");
  assert.match(installer, /jjlamjjlldhcbojhlkaeggbhldllcood/);
  assert.match(installer, /Library[\s\S]*LaunchAgents/);
  assert.match(launcher, /payload\/runtime\/node/);
});
