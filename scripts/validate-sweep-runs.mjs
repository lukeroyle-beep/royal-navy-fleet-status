import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  evaluateSweepCoverage,
  validateReleaseSweepGate,
  validateSweepRunShape,
} from "./lib/sweep.mjs";
import { readReleaseMetadata } from "../src/utils/release.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const runDirectory = path.join(root, "data/internal/provenance/sweep-runs");
const entities = readJson(path.join(root, "data/internal/provenance/vessels.json"));
const registry = readJson(path.join(root, "data/internal/provenance/sources.json"));
const evidence = readJson(path.join(root, "data/internal/provenance/evidence.json"));
const release = readReleaseMetadata(entities.metadata);
const files = fs.existsSync(runDirectory)
  ? fs.readdirSync(runDirectory).filter((name) => name.endsWith(".json")).sort()
  : [];
const runs = files.map((name) => {
  const run = readJson(path.join(runDirectory, name));
  validateSweepRunShape(run);
  const coverage = evaluateSweepCoverage(run, {
    registry,
    entities,
    evidenceItems: evidence.evidence,
  });
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
validateAppendOnlyHistory(readArgument("--base-ref"), files);

const gate = validateReleaseSweepGate({
  runs,
  datasetDate: release.asOfDate,
  releaseRevision: release.releaseRevision,
  releasedAt: release.releasedAt,
  registry,
  entities,
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
  if (!baseRef) return;
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
  for (const name of listing) {
    if (!current.has(name)) throw new Error(`Sweep history is append-only; ${name} was removed.`);
    const before = execFileSync("git", ["show", `${baseRef}:${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    const after = fs.readFileSync(path.join(root, name), "utf8");
    if (before !== after) throw new Error(`Sweep history is append-only; ${name} was modified.`);
  }
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
