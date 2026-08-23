import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { parsePhysicalStatusHistory } from "../src/utils/insights.js";
import { readReleaseMetadata, releaseRevision } from "../src/utils/release.js";

const historyPath = new URL("../data/royal-navy/status-history.jsonl", import.meta.url);
const fleetPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
const allowedStatuses = new Set([
  "Available",
  "Deployed",
  "In re-fit",
  "Unknown",
  "Museum ship",
  "Decommissioned",
]);
const currentText = fs.readFileSync(historyPath, "utf8");
const lines = parseLines(currentText);
const snapshots = parsePhysicalStatusHistory(currentText);
const fleetIds = new Set(fleet.vessels.map((vessel) => vessel.id));
const fleetRelease = readReleaseMetadata(fleet.metadata);

for (const snapshot of snapshots) {
  const ids = Object.keys(snapshot.statuses);
  if (!ids.length || ids.some((id) => !id.trim())) {
    throw new Error(`Status snapshot ${snapshot.snapshotDate} has an invalid fleet roster.`);
  }
  for (const [vesselId, status] of Object.entries(snapshot.statuses)) {
    if (!allowedStatuses.has(status)) {
      throw new Error(`Status snapshot ${snapshot.snapshotDate} has an invalid status for ${vesselId}.`);
    }
  }
}

const latest = snapshots.at(-1);
if (
  !latest ||
  latest.snapshotDate !== fleetRelease.asOfDate ||
  releaseRevision(latest) !== fleetRelease.releaseRevision ||
  (latest.releasedAt ?? null) !== fleetRelease.releasedAt
) {
  throw new Error("The latest status snapshot must match the fleet release identity.");
}
const latestIds = Object.keys(latest.statuses);
if (latestIds.length !== fleetIds.size || latestIds.some((id) => !fleetIds.has(id))) {
  throw new Error("The latest status snapshot must match the current fleet roster.");
}
for (const vessel of fleet.vessels) {
  if (latest.statuses[vessel.id] !== vessel.status) {
    throw new Error(`Latest status snapshot does not match ${vessel.name}.`);
  }
}

const baseRefIndex = process.argv.indexOf("--base-ref");
if (baseRefIndex !== -1) {
  const baseRef = process.argv[baseRefIndex + 1];
  if (!baseRef) throw new Error("--base-ref requires a Git commit reference.");
  execFileSync("git", ["cat-file", "-e", `${baseRef}^{commit}`], { stdio: "ignore" });
  let baseText = "";
  try {
    baseText = execFileSync("git", ["show", `${baseRef}:data/royal-navy/status-history.jsonl`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    baseText = "";
  }
  const baseLines = parseLines(baseText);
  if (lines.length < baseLines.length || baseLines.some((line, index) => lines[index] !== line)) {
    throw new Error("Status history is append-only; existing snapshots were changed or removed.");
  }
}

console.log(`Validated ${snapshots.length} append-only status snapshots.`);

function parseLines(text) {
  const trimmed = text.trimEnd();
  if (!trimmed) return [];
  const parsed = trimmed.split("\n");
  if (parsed.some((line) => !line.trim())) throw new Error("Status history contains a blank line.");
  return parsed;
}
