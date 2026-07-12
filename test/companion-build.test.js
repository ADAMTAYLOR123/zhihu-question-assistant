import assert from "node:assert/strict";
import { test } from "node:test";

import { nodeArchiveName, parseBuildOptions, windowsNodeArchiveName } from "../scripts/companion-build-utils.mjs";

test("companion build accepts Intel and Apple Silicon targets", () => {
  assert.deepEqual(parseBuildOptions(["--arch=x64"]), { architecture: "x64" });
  assert.deepEqual(parseBuildOptions(["--arch", "arm64"]), { architecture: "arm64" });
  assert.throws(() => parseBuildOptions(["--arch=ia32"]), /x64 或 arm64/);
});

test("Node archive name matches the target architecture", () => {
  assert.equal(nodeArchiveName("v22.22.3", "x64"), "node-v22.22.3-darwin-x64.tar.gz");
  assert.equal(windowsNodeArchiveName("v22.22.3", "x64"), "node-v22.22.3-win-x64.zip");
});
