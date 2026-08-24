import fs from "node:fs";

import { parsePhysicalStatusHistory } from "../src/utils/insights.js";
import { buildStatusSnapshot } from "./lib/status-snapshot.mjs";

const fleetPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const historyPath = new URL("../data/royal-navy/status-history.jsonl", import.meta.url);
const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
const allowedStatuses = new Set([
  "Available",
  "Deployed",
  "In re-fit",
  "Unknown",
  "Museum ship",
  "Decommissioned",
]);
const existing = fs.existsSync(historyPath) ? fs.readFileSync(historyPath, "utf8").trimEnd() : "";
const snapshots = parsePhysicalStatusHistory(existing);
for (const vessel of fleet.vessels) {
  if (!allowedStatuses.has(vessel.status)) {
    throw new Error(`${vessel.name} has an invalid operational status.`);
  }
}

const correction = process.argv.includes("--correction");
const reason = readArgument("--reason");
const snapshot = buildStatusSnapshot({ fleet, snapshots, correction, reason });
const prefix = existing ? `${existing}\n` : "";
fs.writeFileSync(historyPath, `${prefix}${JSON.stringify(snapshot)}\n`);
console.log(
  `Appended ${snapshot.snapshotDate} r${snapshot.releaseRevision ?? 1} status snapshot for ` +
    `${fleet.vessels.length} vessels.`,
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
