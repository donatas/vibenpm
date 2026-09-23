import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCatalog, compareSemverDesc, findManifestPaths } from "./catalog.mjs";

test("orders stable versions before prereleases and newest first", () => {
  const versions = ["1.0.0-beta.1", "2.0.0", "1.1.0", "1.0.0"];
  assert.deepEqual(versions.sort(compareSemverDesc), ["2.0.0", "1.1.0", "1.0.0", "1.0.0-beta.1"]);
});

test("the repository example builds into a catalog entry", () => {
  const catalog = buildCatalog();
  assert.equal(catalog.length, 2);
  const example = catalog.find(({ id }) => id === "vibenpm/hello-agent");
  assert.equal(example?.latestVersion, "1.0.0");
  assert.ok(example?.versions[0].files.includes("index.js"));
  assert.equal("email" in (example?.versions[0].owner ?? {}), false);
  const imap = catalog.find(({ id }) => id === "dd/imap");
  assert.equal(imap?.versions[0].owner.name, "dd");
  assert.equal(imap?.versions[0].entrypoints[0], "imap.ts");
});

test("rejects release folders without manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "vibenpm-"));
  try {
    mkdirSync(join(root, "owner", "package", "1.0.0"), { recursive: true });
    assert.throws(() => findManifestPaths(root), /missing agent-package\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects symbolic links in the package tree", () => {
  const root = mkdtempSync(join(tmpdir(), "vibenpm-"));
  try {
    mkdirSync(join(root, "owner", "package"), { recursive: true });
    writeFileSync(join(root, "target"), "not a release");
    symlinkSync(join(root, "target"), join(root, "owner", "package", "1.0.0"));
    assert.throws(() => findManifestPaths(root), /Symbolic links are not allowed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
