import fs from "node:fs";

import { validatePublicationChanges } from "../src/utils/insights.js";
import { readReleaseMetadata } from "../src/utils/release.js";
import { hasExactBerthDisclosure } from "./lib/public-location-safety.mjs";

const changesPath = new URL("../data/royal-navy/publication-changes.json", import.meta.url);
const fleetPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const changes = JSON.parse(fs.readFileSync(changesPath, "utf8"));
const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
const normalizedChanges = validatePublicationChanges(changes);
const fleetRelease = readReleaseMetadata(fleet.metadata);
const fleetIds = new Set(fleet.vessels.map((vessel) => vessel.id));
const categories = ["status", "location", "mapping", "marker", "evidence"];

if (
  changes.currentAsOfDate !== fleetRelease.asOfDate ||
  (normalizedChanges.currentReleaseRevision ?? 1) !== fleetRelease.releaseRevision ||
  (!fleetRelease.legacy &&
    (changes.schemaVersion !== 2 || changes.currentReleasedAt !== fleetRelease.releasedAt)) ||
  (fleetRelease.legacy && changes.schemaVersion !== 1)
) {
  throw new Error("Publication changes metadata is invalid.");
}
const vesselIds = new Set();
const calculated = Object.fromEntries(categories.map((category) => [category, 0]));
for (const change of changes.changes) {
  const isRemovedRecord = change.items?.some(
    (item) => item.kind === "mapping" && item.label === "Fleet record" && item.after === "Removed",
  );
  if (
    (!fleetIds.has(change.vesselId) && !isRemovedRecord) ||
    vesselIds.has(change.vesselId) ||
    !change.vesselName?.trim() ||
    !Array.isArray(change.categories) ||
    !Array.isArray(change.items) ||
    !change.items.length
  ) {
    throw new Error(`Invalid publication change for ${change.vesselId || "unknown vessel"}.`);
  }
  vesselIds.add(change.vesselId);
  for (const category of change.categories) {
    if (!categories.includes(category)) throw new Error(`Invalid change category: ${category}.`);
    calculated[category] += 1;
  }
  for (const item of change.items) {
    if (
      !change.categories.includes(item.kind) ||
      !item.label?.trim() ||
      typeof item.before !== "string" ||
      typeof item.after !== "string" ||
      item.before === item.after
    ) {
      throw new Error(`Invalid change item for ${change.vesselName}.`);
    }
    if (hasExactBerthDisclosure(item.before) || hasExactBerthDisclosure(item.after)) {
      throw new Error(`Publication change for ${change.vesselName} exposes exact berth detail.`);
    }
  }
}
for (const category of categories) {
  if (changes.counts?.[category] !== calculated[category]) {
    throw new Error(`Publication change count is wrong for ${category}.`);
  }
}
if (!Number.isInteger(changes.previousMappedCount) || !Number.isInteger(changes.currentMappedCount)) {
  throw new Error("Publication mapped counts are invalid.");
}
if (changes.currentMappedCount !== fleet.vessels.filter(hasMapPosition).length) {
  throw new Error("Publication current mapped count does not match the fleet dataset.");
}

console.log(`Validated ${changes.changes.length} publication changes.`);

function hasMapPosition(vessel) {
  return Boolean(vessel.position || vessel.uncertaintyArea);
}
