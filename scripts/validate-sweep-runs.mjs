import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  evaluateStoredSweepCoverage,
  validateReleaseSweepGate,
  validateSweepBaselineAgainstState,
  validateSweepRunShape,
} from "./lib/sweep.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { readReleaseMetadata } from "../src/utils/release.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateInputs = resolvePrivateInputs();
const runDirectory = privateInputs.pathFor("sweepRuns");
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidence = privateInputs.readJson("evidence");
const assessments = privateInputs.readJson("assessments");
const release = readReleaseMetadata(entities.metadata);
const files = fs.existsSync(runDirectory)
  ? fs.readdirSync(runDirectory).filter((name) => name.endsWith(".json")).sort()
  : [];
const runs = files.map((name) => {
  const run = readJson(path.join(runDirectory, name));
  validateSweepRunShape(run);
  const coverage = evaluateStoredSweepCoverage(run, { evidenceItems: evidence.evidence });
  if (!run.complete || !run.completedAt || !coverage.pass) {
    throw new Error(
      `Stored sweep ${run.runId} is not a complete coverage record: ` +
        (coverage.reasons.join("; ") || "run was not finalised"),
    );
  }
  if (JSON.stringify(run.coverage) !== JSON.stringify(coverage)) {
    throw new Error(`Stored sweep ${run.runId} has stale coverage totals.`);
  }
  return run;
});

assertUnique(runs.map((run) => run.runId));
const baseRef = readArgument("--base-ref");
if (baseRef && privateInputs.mode !== "legacy") {
  throw new Error("--base-ref append-only validation applies only to the checked-in legacy migration ledger; external private storage must use its owner-controlled version history.");
}
const newFiles = validateAppendOnlyHistory(baseRef, files);
if (baseRef && newFiles.length) {
  const baseEntities = readJsonAtRef(baseRef, "data/internal/provenance/vessels.json");
  const baseAssessments = readJsonAtRef(baseRef, "data/internal/provenance/assessments.json");
  const runByFile = new Map(files.map((name, index) => [name, runs[index]]));
  for (const name of newFiles) {
    const run = runByFile.get(name);
    if (run.coverageDate >= "2026-08-24") {
      validateSweepBaselineAgainstState(run, {
        entities: baseEntities,
        assessmentLog: baseAssessments,
      });
    }
  }
}

const gate = validateReleaseSweepGate({
  runs,
  datasetDate: release.asOfDate,
  releaseRevision: release.releaseRevision,
  releasedAt: release.releasedAt,
  registry,
  entities,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
if (!gate.pass) {
  throw new Error(`Fleet publication coverage gate failed: ${gate.reasons.join("; ")}`);
}
console.log(
  gate.required
    ? `Validated ${runs.length} sweep run(s); ${gate.runId} authorises ${release.asOfDate} r${release.releaseRevision}.`
    : `Validated ${runs.length} sweep run(s); coverage gate applies from 2026-08-24.`,
);

function validateAppendOnlyHistory(baseRef, currentFiles) {
  if (!baseRef) return [];
  execFileSync("git", ["cat-file", "-e", `${baseRef}^{commit}`], {
    cwd: root,
    stdio: "ignore",
  });
  const prefix = "data/internal/provenance/sweep-runs/";
  const listing = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", baseRef, "--", "data/internal/provenance/sweep-runs"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((name) => name.endsWith(".json"));
  const current = new Set(currentFiles.map((name) => `${prefix}${name}`));
  const previous = new Set(listing);
  for (const name of listing) {
    if (!current.has(name)) throw new Error(`Sweep history is append-only; ${name} was removed.`);
    const before = execFileSync("git", ["show", `${baseRef}:${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    const after = fs.readFileSync(path.join(root, name), "utf8");
    if (before !== after) throw new Error(`Sweep history is append-only; ${name} was modified.`);
  }
  return currentFiles.filter((name) => !previous.has(`${prefix}${name}`));
}

function readJsonAtRef(ref, name) {
  return JSON.parse(
    execFileSync("git", ["show", `${ref}:${name}`], {
      cwd: root,
      encoding: "utf8",
    }),
  );
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertUnique(values) {
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error("Sweep history contains duplicate runIds.");
}
