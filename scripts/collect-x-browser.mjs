import fs from "node:fs";
import path from "node:path";

import { resolvePrivateInputs, repositoryRootPath } from "./lib/private-inputs.mjs";
import { validateSourceRegistry } from "./lib/provenance.mjs";
import {
  assertSessionBinding,
  createXBrowserSession,
  finalizeXBrowserSession,
  mergeXBrowserSessionProgress,
  recordXBrowserObservation,
  summarizeXBrowserSession,
  validateXBrowserSession,
  writeJsonAtomic,
} from "./lib/x-browser-collection.mjs";

const mode = requiredValue("--mode=");
const sessionDirectory = path.resolve(requiredValue("--session="));
assertPrivateDirectory(sessionDirectory, "X browser session");
const sessionPath = path.join(sessionDirectory, "session.json");
const runPath = path.resolve(requiredValue("--run="));
assertPrivateArtifactPath(runPath, "Sweep run");

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const knownVesselIds = [
  ...entities.vessels.map((vessel) => vessel.vesselId),
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateSourceRegistry(registry, knownVesselIds, entities.vessels.map((vessel) => vessel.vesselId));
const publicProjection = readJson(
  path.join(repositoryRootPath(), "data", "royal-navy", "vessels.json"),
  "public vessel projection",
);
const run = readJson(runPath, "sweep run");

if (mode === "prepare") {
  prepare();
} else if (mode === "record") {
  record();
} else if (mode === "status") {
  status();
} else if (mode === "finalise") {
  finalise();
} else {
  throw new Error("X browser mode must be prepare, record, status, or finalise.");
}

function prepare() {
  const sourceIds = optionalList("--source-ids=");
  const scope = optionalValue("--scope=") || (sourceIds === null ? "full" : "canary");
  const createdAt = optionalValue("--at=") || new Date().toISOString();
  const proposed = createXBrowserSession({ registry, run, sourceIds, scope, createdAt });
  let session = proposed;
  if (fs.existsSync(sessionPath)) {
    session = readJson(sessionPath, "X browser session");
    assertSessionBinding(session, { registry, run });
    if (
      session.sessionId !== proposed.sessionId ||
      session.selectionHash !== proposed.selectionHash ||
      session.scope !== proposed.scope
    ) {
      throw new Error("Existing X browser session does not match the requested immutable selection.");
    }
  }
  const resumeDirectory = optionalValue("--resume-from=");
  if (resumeDirectory) {
    const resolvedResume = path.resolve(resumeDirectory);
    assertPrivateDirectory(resolvedResume, "X browser resume session");
    const resume = readJson(path.join(resolvedResume, "session.json"), "X browser resume session");
    mergeXBrowserSessionProgress(session, resume, { registry, run });
  }
  writeJsonAtomic(sessionPath, session);
  printSummary(session);
}

function record() {
  const observationPath = path.resolve(requiredValue("--observation="));
  assertInsideDirectory(sessionDirectory, observationPath, "Browser observation");
  const session = readJson(sessionPath, "X browser session");
  const observation = readJson(observationPath, "browser observation");
  recordXBrowserObservation({
    session,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    observation,
  });
  writeJsonAtomic(sessionPath, session);
  printSummary(session);
}

function status() {
  const session = readJson(sessionPath, "X browser session");
  assertSessionBinding(session, { registry, run });
  printSummary(session);
}

function finalise() {
  const completedAt = optionalValue("--at=") || new Date().toISOString();
  const outputPath = optionalValue("--output=")
    ? path.resolve(optionalValue("--output="))
    : path.join(sessionDirectory, "x-browser-run.json");
  assertInsideDirectory(sessionDirectory, outputPath, "X browser artifact");
  const session = readJson(sessionPath, "X browser session");
  const artifact = finalizeXBrowserSession({ session, registry, entities, run, completedAt });
  writeJsonAtomic(outputPath, artifact);
  writeJsonAtomic(runPath, run);
  console.log(JSON.stringify({
    runId: artifact.runId,
    sessionId: artifact.sessionId,
    scope: artifact.scope,
    classification: artifact.summary.classification,
    selectedRequiredCoverage: artifact.summary.selectedRequiredCoverage,
    fullRequiredCoverage: artifact.summary.fullRequiredCoverage,
    selectedAccountCount: artifact.summary.selectedAccountCount,
    checkedAccountCount: artifact.summary.checkedAccountCount,
    requiredBlockerCount: artifact.summary.requiredBlockerCount,
    optionalBlockerCount: artifact.summary.optionalBlockerCount,
    uniquePostCount: artifact.summary.uniquePostCount,
    publicationEligible: false,
  }, null, 2));
  if (artifact.summary.requiredBlockerCount > 0) process.exitCode = 2;
}

function printSummary(session) {
  validateXBrowserSession(session);
  console.log(JSON.stringify(summarizeXBrowserSession(session), null, 2));
}

function readJson(targetPath, label) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is unavailable or invalid JSON: ${safeMessage(error)}`);
  }
}

function requiredValue(prefix) {
  const value = optionalValue(prefix);
  if (!value) {
    throw new Error(
      "Usage: node scripts/collect-x-browser.mjs --mode=<prepare|record|status|finalise> " +
      "--run=<sweep-run.json> --session=<private-directory> [--source-ids=<id,id>] " +
      "[--observation=<session-file.json>] [--resume-from=<private-directory>] [--output=<session-file.json>]",
    );
  }
  return value;
}

function optionalValue(prefix) {
  const argument = process.argv.find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : null;
}

function optionalList(prefix) {
  const value = optionalValue(prefix);
  return value === null ? null : value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function assertPrivateDirectory(targetPath, label) {
  const root = repositoryRootPath();
  const relative = path.relative(root, targetPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`${label} must be outside the repository.`);
  }
}

function assertPrivateArtifactPath(targetPath, label) {
  const root = repositoryRootPath();
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  const normalized = relative.split(path.sep).join("/");
  if (normalized === "osint-sweep-run.json" || normalized.startsWith(".cache/private-inputs/")) return;
  throw new Error(`${label} must be outside the repository or use an existing ignored private path.`);
}

function assertInsideDirectory(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the private X browser session directory.`);
  }
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ").slice(0, 200);
}
