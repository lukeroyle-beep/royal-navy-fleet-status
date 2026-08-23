import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { publicationReleaseFields } from "./lib/publication-release.mjs";

const currentPath = new URL("../data/royal-navy/vessels.json", import.meta.url);
const outputPath = new URL("../data/royal-navy/publication-changes.json", import.meta.url);
const baseRef = readArgument("--base-ref");
if (!baseRef) throw new Error("--base-ref is required.");

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const previous = JSON.parse(
  execFileSync("git", ["show", `${baseRef}:data/royal-navy/vessels.json`], {
    encoding: "utf8",
  }),
);
const releaseFields = publicationReleaseFields(previous.metadata, current.metadata);
const previousById = new Map(previous.vessels.map((vessel) => [vessel.id, vessel]));
const counts = { status: 0, location: 0, mapping: 0, marker: 0, evidence: 0 };
const changes = [];

for (const vessel of current.vessels) {
  const before = previousById.get(vessel.id);
  if (!before) {
    changes.push({
      vesselId: vessel.id,
      vesselName: vessel.name,
      categories: ["mapping"],
      items: [{ kind: "mapping", label: "Fleet record", before: "Not listed", after: "Added" }],
    });
    counts.mapping += 1;
    continue;
  }

  const items = [];
  addChange(items, "status", "Status", before.status, vessel.status);
  addChange(
    items,
    "location",
    "Location",
    before.lastReportedLocation,
    vessel.lastReportedLocation,
  );
  addChange(
    items,
    "mapping",
    "Map precision",
    formatClassification(before.locationClassification),
    formatClassification(vessel.locationClassification),
  );
  addChange(
    items,
    "evidence",
    "Evidence quality",
    formatEvidenceClassification(before.evidenceClassification),
    formatEvidenceClassification(vessel.evidenceClassification),
  );

  if (
    before.lastReportedLocation === vessel.lastReportedLocation &&
    JSON.stringify(before.position) !== JSON.stringify(vessel.position)
  ) {
    items.push({
      kind: "marker",
      label: "Marker",
      before: before.position?.label || "Not plotted",
      after: vessel.position?.label || "Not plotted",
    });
  }

  addChange(
    items,
    "evidence",
    "Evidence date",
    before.locationEvidenceDate || "Undated",
    vessel.locationEvidenceDate || "Undated",
  );
  if (before.source?.url !== vessel.source?.url) {
    const beforeLabel = before.source?.label || "Unknown source";
    const afterLabel = vessel.source?.label || "Unknown source";
    items.push({
      kind: "evidence",
      label: "Source",
      before: beforeLabel === afterLabel ? before.source?.url || beforeLabel : beforeLabel,
      after: beforeLabel === afterLabel ? vessel.source?.url || afterLabel : afterLabel,
    });
  }

  if (!items.length) continue;
  const categories = [...new Set(items.map((item) => item.kind))];
  for (const category of categories) counts[category] += 1;
  changes.push({ vesselId: vessel.id, vesselName: vessel.name, categories, items });
}

for (const vessel of previous.vessels) {
  if (current.vessels.some((candidate) => candidate.id === vessel.id)) continue;
  changes.push({
    vesselId: vessel.id,
    vesselName: vessel.name,
    categories: ["mapping"],
    items: [{ kind: "mapping", label: "Fleet record", before: "Listed", after: "Removed" }],
  });
  counts.mapping += 1;
}

const result = {
  ...releaseFields,
  previousMappedCount: previous.vessels.filter(hasMapPosition).length,
  currentMappedCount: current.vessels.filter(hasMapPosition).length,
  counts,
  changes,
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Generated ${changes.length} vessel changes from ${baseRef}.`);

function addChange(items, kind, label, before, after) {
  if (before === after) return;
  items.push({ kind, label, before: before ?? "Unknown", after: after ?? "Unknown" });
}

function hasMapPosition(vessel) {
  return Boolean(vessel.position || vessel.symbolicPosition);
}

function formatClassification(value) {
  return {
    mapped: "Mapped",
    approximate: "Approximate",
    unknown: "Unknown",
    withheld: "Withheld",
  }[value] || value;
}

function formatEvidenceClassification(value) {
  return {
    "direct-report": "Direct public report",
    "direct-tracker": "Direct tracker report",
    insufficient: "Insufficient",
    "withheld-policy": "Withheld by policy",
  }[value] || value;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
