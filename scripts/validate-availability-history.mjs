import fs from "node:fs";
import { execFileSync } from "node:child_process";

import {
  parseAvailabilityHistory,
  parsePhysicalAvailabilityHistory,
} from "../src/utils/availability-history.js";
import { parsePhysicalStatusHistory } from "../src/utils/insights.js";
import { readReleaseMetadata, releaseRevision } from "../src/utils/release.js";

const availabilityPath = new URL("../data/royal-navy/availability-history.jsonl", import.meta.url);
const statusPath = new URL("../data/royal-navy/status-history.jsonl", import.meta.url);
const fleetPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const currentText = fs.readFileSync(availabilityPath, "utf8");
const physicalRecords = parsePhysicalAvailabilityHistory(currentText);
const logicalRecords = parseAvailabilityHistory(currentText);
const statusSnapshots = parsePhysicalStatusHistory(fs.readFileSync(statusPath, "utf8"));
const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
const fleetRelease = readReleaseMetadata(fleet.metadata);

for (const record of physicalRecords) {
  const source = statusSnapshots.find((snapshot) =>
    snapshot.snapshotDate === record.sourceRelease.snapshotDate &&
    releaseRevision(snapshot) === record.sourceRelease.releaseRevision &&
    snapshot.releasedAt === record.sourceRelease.releasedAt,
  );
  if (!source) {
    throw new Error(
      `Availability week ${record.weekEnding} references a missing public status release.`,
    );
  }
  const sourceIds = Object.keys(source.statuses).sort();
  const observationIds = Object.keys(record.observations).sort();
  if (JSON.stringify(sourceIds) !== JSON.stringify(observationIds)) {
    throw new Error(`Availability week ${record.weekEnding} has a mismatched public roster.`);
  }
  for (const vesselId of sourceIds) {
    if (record.observations[vesselId].status !== source.statuses[vesselId]) {
      throw new Error(`Availability week ${record.weekEnding} changes ${vesselId}'s public status.`);
    }
  }
}

const latest = logicalRecords.at(-1);
if (
  latest &&
  latest.sourceRelease.snapshotDate === fleetRelease.asOfDate &&
  latest.sourceRelease.releaseRevision === fleetRelease.releaseRevision &&
  latest.sourceRelease.releasedAt === fleetRelease.releasedAt
) {
  const fleetIds = fleet.vessels.map((vessel) => vessel.id).sort();
  const observationIds = Object.keys(latest.observations).sort();
  if (JSON.stringify(fleetIds) !== JSON.stringify(observationIds)) {
    throw new Error("The latest availability observation does not match the current fleet roster.");
  }
  for (const vessel of fleet.vessels) {
    const observation = latest.observations[vessel.id];
    if (observation.status !== vessel.status || observation.vesselClass !== vessel.vesselClass) {
      throw new Error(`The latest availability observation does not match ${vessel.name}.`);
    }
  }
}

const baseRef = readArgument("--base-ref");
if (baseRef) {
  execFileSync("git", ["cat-file", "-e", `${baseRef}^{commit}`], { stdio: "ignore" });
  let baseText = "";
  try {
    baseText = execFileSync(
      "git",
      ["show", `${baseRef}:data/royal-navy/availability-history.jsonl`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    baseText = "";
  }
  const lines = parseLines(currentText);
  const baseLines = parseLines(baseText);
  if (lines.length < baseLines.length || baseLines.some((line, index) => lines[index] !== line)) {
    throw new Error("Availability history is append-only; existing observations changed or vanished.");
  }
}

console.log(
  `Validated ${physicalRecords.length} append-only weekly availability record(s) across ` +
    `${logicalRecords.length} week(s).`,
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseLines(text) {
  const trimmed = text.trimEnd();
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
  if (lines.some((line) => !line.trim())) throw new Error("Availability history has a blank line.");
  return lines;
}
