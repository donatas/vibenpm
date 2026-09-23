import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const PACKAGES_ROOT = join(REPO_ROOT, "packages");
const SCHEMA_PATH = join(REPO_ROOT, "schemas/agent-package.schema.json");
const OUTPUT_PATH = join(APP_ROOT, "src/generated/packages.json");
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_RELEASE_BYTES = 5 * 1024 * 1024;

export function compareSemverDesc(a, b) {
  const parse = (value) => {
    const [core, prerelease = ""] = value.split("-", 2);
    return { core: core.split(".").map(Number), prerelease };
  };
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return right.core[index] - left.core[index];
    }
  }
  if (!left.prerelease && right.prerelease) return -1;
  if (left.prerelease && !right.prerelease) return 1;
  return right.prerelease.localeCompare(left.prerelease, undefined, { numeric: true });
}

export function findManifestPaths(root = PACKAGES_ROOT) {
  if (!existsSync(root)) return [];
  const results = [];
  const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
  const levels = ["owner", "package", "version"];
  const visit = (directory, depth) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${relative(REPO_ROOT, path)}`);
      if (!entry.isDirectory()) {
        throw new Error(`Only directories are allowed at the ${levels[depth]} level: ${relative(REPO_ROOT, path)}`);
      }
      if (depth < 2 && !slugPattern.test(entry.name)) {
        throw new Error(`Invalid ${levels[depth]} directory name: ${relative(REPO_ROOT, path)}`);
      }
      if (depth === 2) {
        const manifestPath = join(path, "agent-package.json");
        if (!existsSync(manifestPath)) {
          throw new Error(`Release is missing agent-package.json: ${relative(REPO_ROOT, path)}`);
        }
        results.push(manifestPath);
      } else {
        visit(path, depth + 1);
      }
    }
  };
  visit(root, 0);
  return results.sort();
}

function listReleaseFiles(releasePath) {
  const files = [];
  let totalBytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${relative(REPO_ROOT, path)}`);
      }
      if (entry.isDirectory()) {
        visit(path);
      } else {
        const size = lstatSync(path).size;
        if (size > MAX_FILE_BYTES) {
          throw new Error(`${relative(REPO_ROOT, path)} exceeds the 1 MB file limit`);
        }
        totalBytes += size;
        files.push(relative(releasePath, path).split(sep).join("/"));
      }
    }
  };
  visit(releasePath);
  if (files.length > MAX_FILES) throw new Error(`${relative(REPO_ROOT, releasePath)} exceeds 100 files`);
  if (totalBytes > MAX_RELEASE_BYTES) throw new Error(`${relative(REPO_ROOT, releasePath)} exceeds 5 MB`);
  return files.sort();
}

function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
}

export function buildCatalog() {
  const validate = createValidator();
  const packages = new Map();
  const errors = [];

  for (const manifestPath of findManifestPaths()) {
    const releasePath = dirname(manifestPath);
    const pathParts = relative(PACKAGES_ROOT, releasePath).split(sep);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      errors.push(`${relative(REPO_ROOT, manifestPath)}: invalid JSON (${error.message})`);
      continue;
    }

    if (!validate(manifest)) {
      const details = validate.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
      errors.push(`${relative(REPO_ROOT, manifestPath)}: ${details}`);
      continue;
    }
    if (pathParts.length !== 3) {
      errors.push(`${relative(REPO_ROOT, manifestPath)} must be packages/<owner>/<name>/<version>/agent-package.json`);
      continue;
    }
    const [owner, name, version] = pathParts;
    if (owner !== manifest.owner.name || name !== manifest.name || version !== manifest.version) {
      errors.push(`${relative(REPO_ROOT, manifestPath)} does not match owner/name/version in its manifest`);
      continue;
    }

    try {
      const files = listReleaseFiles(releasePath);
      for (const entrypoint of manifest.entrypoints ?? []) {
        if (!files.includes(entrypoint)) {
          throw new Error(`entrypoint does not exist: ${entrypoint}`);
        }
      }
      const readmePath = join(releasePath, "README.md");
      const item = {
        version,
        description: manifest.description,
        owner: { name: manifest.owner.name, url: manifest.owner.url },
        homepage: manifest.homepage,
        repository: manifest.repository,
        license: manifest.license,
        keywords: manifest.keywords ?? [],
        entrypoints: manifest.entrypoints ?? [],
        files,
        readme: existsSync(readmePath) ? readFileSync(readmePath, "utf8") : undefined,
        packagePath: relative(REPO_ROOT, releasePath).split(sep).join("/"),
      };
      const id = `${owner}/${name}`;
      const packageItem = packages.get(id) ?? { id, owner, name, versions: [] };
      if (packageItem.versions.some((existing) => existing.version === version)) {
        throw new Error(`duplicate release ${id}@${version}`);
      }
      packageItem.versions.push(item);
      packages.set(id, packageItem);
    } catch (error) {
      errors.push(`${relative(REPO_ROOT, releasePath)}: ${error.message}`);
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return [...packages.values()]
    .map((item) => {
      item.versions.sort((left, right) => compareSemverDesc(left.version, right.version));
      return { ...item, latestVersion: item.versions[0].version };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function validateImmutableReleases(baseRef = process.env.VIBENPM_BASE_REF) {
  if (!baseRef) return;
  const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=DMR", `${baseRef}...HEAD`, "--", "packages"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const modifiedReleases = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((path) => path.split("/").length >= 5);
  if (modifiedReleases.length) {
    throw new Error(`Published release files are immutable; add a new version instead:\n${modifiedReleases.join("\n")}`);
  }
}

function main() {
  const flag = process.argv[2];
  const catalog = buildCatalog();
  validateImmutableReleases();
  if (flag === "--write") {
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`Wrote ${catalog.length} package(s) to ${relative(REPO_ROOT, OUTPUT_PATH)}`);
  } else {
    console.log(`Validated ${catalog.length} package(s)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
