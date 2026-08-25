import fs from "node:fs";

import { parsePhysicalAvailabilityHistory } from "../src/utils/availability-history.js";
import { parsePhysicalStatusHistory } from "../src/utils/insights.js";
import {
  buildWeeklyAvailabilityObservation,
  latestSunday,
} from "./lib/availability-observation.mjs";

const fleetPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const statusHistoryPath = new URL("../data/royal-navy/status-history.jsonl", import.meta.url);
const availabilityHistoryPath = new URL(
  "../data/royal-navy/availability-history.jsonl",
  import.meta.url,
);
const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
const statusSnapshots = parsePhysicalStatusHistory(fs.readFileSync(statusHistoryPath, "utf8"));
const existing = fs.existsSync(availabilityHistoryPath)
  ? fs.readFileSync(availabilityHistoryPath, "utf8").trimEnd()
  : "";
const availabilityRecords = parsePhysicalAvailabilityHistory(existing);
const weekEnding = readArgument("--week-ending") || latestSunday();
const recordedAt = readArgument("--recorded-at") || new Date().toISOString();
const correctionReason = readArgument("--correction-reason");
const requireObservation = process.argv.includes("--require-observation");

const record = buildWeeklyAvailabilityObservation({
  fleet,
  statusSnapshots,
  availabilityRecords,
  weekEnding,
  recordedAt,
  correctionReason,
});
if (!record) {
  const existingWeek = availabilityRecords.some((item) => item.weekEnding === weekEnding);
  const message = existingWeek
    ? `Weekly availability ${weekEnding} already reflects the latest reviewed public release.`
    : `No reviewed public fleet release is available for week ending ${weekEnding}.`;
  if (requireObservation && !existingWeek) throw new Error(message);
  console.log(message);
  process.exit(0);
}

const prefix = existing ? `${existing}\n` : "";
fs.writeFileSync(availabilityHistoryPath, `${prefix}${JSON.stringify(record)}\n`);
console.log(
  `Appended weekly availability ${record.weekEnding} r${record.revision} from ` +
    `${record.sourceRelease.snapshotDate} release r${record.sourceRelease.releaseRevision}.`,
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
