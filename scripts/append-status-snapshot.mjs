import fs from "node:fs";

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
const snapshots = existing
  ? existing.split("\n").map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Existing status history line ${index + 1} is not valid JSON.`);
      }
    })
  : [];
const snapshotDate = fleet.metadata.asOfDate;

if (!isIsoDate(snapshotDate)) {
  throw new Error("metadata.asOfDate must be a valid ISO date before a snapshot can be appended.");
}
for (const vessel of fleet.vessels) {
  if (!allowedStatuses.has(vessel.status)) {
    throw new Error(`${vessel.name} has an invalid operational status.`);
  }
}
for (let index = 1; index < snapshots.length; index += 1) {
  if (snapshots[index - 1].snapshotDate >= snapshots[index].snapshotDate) {
    throw new Error("Existing status snapshots must have unique ascending dates.");
  }
}
if (snapshots.some((snapshot) => snapshot.snapshotDate === snapshotDate)) {
  throw new Error(`Status snapshot ${snapshotDate} already exists.`);
}
if (snapshots.at(-1)?.snapshotDate > snapshotDate) {
  throw new Error("Status snapshots cannot be appended out of date order.");
}

const snapshot = {
  schemaVersion: 1,
  snapshotDate,
  statuses: Object.fromEntries(fleet.vessels.map((vessel) => [vessel.id, vessel.status])),
};
const prefix = existing ? `${existing}\n` : "";
fs.writeFileSync(historyPath, `${prefix}${JSON.stringify(snapshot)}\n`);
console.log(`Appended ${snapshotDate} status snapshot for ${fleet.vessels.length} vessels.`);

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
