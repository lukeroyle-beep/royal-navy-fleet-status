import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRIVATE_ROOT_ENV = "RNFS_PRIVATE_DATA_ROOT";
export const PRIVATE_FIXTURE_ENV = "RNFS_PRIVATE_DATA_FIXTURE";

const repositoryRoot = realDirectory(fileURLToPath(new URL("../../", import.meta.url)));
const legacyRoot = realDirectory(path.join(repositoryRoot, "data/internal/provenance"));
const syntheticRoot = path.join(repositoryRoot, "scripts/fixtures/private-input");
const manifestName = "private-input-manifest.json";
const defaultFiles = Object.freeze({
  vessels: "vessels.json",
  sources: "sources.json",
  evidence: "evidence.json",
  assessments: "assessments.json",
  sweepRuns: "sweep-runs",
  shoreEstablishments: "shore-establishments.json",
  shorePhotoSources: "shore-photo-sources.json",
});
const requiredFileKeys = Object.freeze(Object.keys(defaultFiles));

export function resolvePrivateInputs({ environment = process.env } = {}) {
  const hasConfiguredRoot = Object.hasOwn(environment, PRIVATE_ROOT_ENV);
  if (!hasConfiguredRoot) {
    if (environment[PRIVATE_FIXTURE_ENV] === "1") {
      throw new Error(`${PRIVATE_FIXTURE_ENV}=1 requires ${PRIVATE_ROOT_ENV}.`);
    }
    return createContext({ mode: "legacy", root: legacyRoot, files: defaultFiles });
  }

  const configuredRoot = String(environment[PRIVATE_ROOT_ENV] ?? "").trim();
  if (!configuredRoot) throw new Error(`${PRIVATE_ROOT_ENV} must not be empty.`);
  if (!path.isAbsolute(configuredRoot)) {
    throw new Error(`${PRIVATE_ROOT_ENV} must be an absolute path.`);
  }
  const resolvedRoot = realDirectory(configuredRoot, PRIVATE_ROOT_ENV);
  const resolvedSyntheticRoot = fs.existsSync(syntheticRoot)
    ? realDirectory(syntheticRoot)
    : path.resolve(syntheticRoot);

  if (samePath(resolvedRoot, resolvedSyntheticRoot)) {
    if (environment[PRIVATE_FIXTURE_ENV] !== "1") {
      throw new Error(
        `The committed synthetic private fixture requires ${PRIVATE_FIXTURE_ENV}=1.`,
      );
    }
    const manifest = readManifest(resolvedRoot, "rnfs-synthetic-private-inputs");
    return createContext({ mode: "synthetic", root: resolvedRoot, files: manifest.files });
  }

  if (isWithin(repositoryRoot, resolvedRoot)) {
    throw new Error(
      `${PRIVATE_ROOT_ENV} must resolve outside the public repository checkout.`,
    );
  }
  if (environment[PRIVATE_FIXTURE_ENV] === "1") {
    throw new Error(`${PRIVATE_FIXTURE_ENV}=1 is valid only for the committed synthetic fixture.`);
  }
  const manifest = readManifest(resolvedRoot, "rnfs-private-inputs");
  return createContext({ mode: "external", root: resolvedRoot, files: manifest.files });
}

export function repositoryRootPath() {
  return repositoryRoot;
}

export function syntheticPrivateInputRoot() {
  return syntheticRoot;
}

function createContext({ mode, root, files }) {
  const resolvedFiles = validateFileMap(root, files);
  for (const key of requiredFileKeys) {
    const target = resolvedFiles[key];
    if (!target || !fs.existsSync(target)) throw new Error(`Private input ${key} is missing.`);
    assertResolvedInsideRoot(root, target, key);
    const expectedDirectory = key === "sweepRuns";
    if (fs.statSync(target).isDirectory() !== expectedDirectory) {
      throw new Error(`Private input ${key} has the wrong filesystem type.`);
    }
  }
  return Object.freeze({
    mode,
    root,
    pathFor(key, { mustExist = true } = {}) {
      const target = resolvedFiles[key];
      if (!target) throw new Error(`Private input manifest has no ${key} entry.`);
      if (mustExist && !fs.existsSync(target)) {
        throw new Error(`Private input ${key} is missing.`);
      }
      if (mustExist) assertResolvedInsideRoot(root, target, key);
      return target;
    },
    readJson(key) {
      const target = this.pathFor(key);
      let value;
      try {
        value = JSON.parse(fs.readFileSync(target, "utf8"));
      } catch (error) {
        throw new Error(`Private input ${key} is not valid JSON: ${safeMessage(error)}`);
      }
      return value;
    },
  });
}

function readManifest(root, expectedKind) {
  const manifestPath = path.join(root, manifestName);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${PRIVATE_ROOT_ENV} is missing ${manifestName}.`);
  }
  assertResolvedInsideRoot(root, manifestPath, "manifest");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Private input manifest is not valid JSON: ${safeMessage(error)}`);
  }
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.kind !== expectedKind ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  ) {
    throw new Error(`Private input manifest must be schemaVersion 1 and kind ${expectedKind}.`);
  }
  for (const key of requiredFileKeys) {
    if (!Object.hasOwn(manifest.files, key)) {
      throw new Error(`Private input manifest is missing ${key}.`);
    }
  }
  return manifest;
}

function validateFileMap(root, files) {
  const resolved = {};
  for (const [key, value] of Object.entries(files)) {
    if (typeof value !== "string" || !value.trim() || path.isAbsolute(value)) {
      throw new Error(`Private input manifest has an invalid ${key} path.`);
    }
    const target = path.resolve(root, value);
    if (!isWithin(root, target)) {
      throw new Error(`Private input manifest ${key} escapes its configured root.`);
    }
    resolved[key] = target;
  }
  return Object.freeze(resolved);
}

function assertResolvedInsideRoot(root, target, key) {
  const resolved = fs.realpathSync.native(target);
  if (!isWithin(root, resolved)) {
    throw new Error(`Private input ${key} resolves outside its configured root.`);
  }
}

function realDirectory(value, label = "Private input root") {
  let resolved;
  try {
    resolved = fs.realpathSync.native(value);
  } catch {
    throw new Error(`${label} must identify an existing directory.`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} must identify an existing directory.`);
  }
  return resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-GB") === right.toLocaleLowerCase("en-GB")
    : left === right;
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
}
