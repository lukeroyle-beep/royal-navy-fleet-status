import fs from "node:fs";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const allowedClassifications = new Set(["mapped", "approximate", "unknown", "withheld"]);
const requiredFields = [
  "id",
  "name",
  "service",
  "vesselClass",
  "vesselType",
  "status",
  "locationClassification",
  "lastReportedLocation",
  "recordDate",
];

if (!dataset.metadata?.asOfDate || !Array.isArray(dataset.vessels)) {
  throw new Error("Dataset must contain metadata.asOfDate and vessels.");
}
if (dataset.vessels.length !== 71) {
  throw new Error(`Expected 71 vessels, found ${dataset.vessels.length}.`);
}

const ids = new Set();
for (const vessel of dataset.vessels) {
  for (const field of requiredFields) {
    if (typeof vessel[field] !== "string" || !vessel[field].trim()) {
      throw new Error(`${vessel.name || vessel.id || "Unknown vessel"} has invalid ${field}.`);
    }
  }
  if (ids.has(vessel.id)) throw new Error(`Duplicate id: ${vessel.id}.`);
  ids.add(vessel.id);
  if (!allowedClassifications.has(vessel.locationClassification)) {
    throw new Error(`${vessel.name} has invalid location classification.`);
  }

  const shouldMap = vessel.locationClassification === "mapped" || vessel.locationClassification === "approximate";
  if (shouldMap) {
    if (!Number.isFinite(vessel.position?.lat) || !Number.isFinite(vessel.position?.lon)) {
      throw new Error(`${vessel.name} is mapped without coordinates.`);
    }
    if (Math.abs(vessel.position.lat) > 90 || Math.abs(vessel.position.lon) > 180) {
      throw new Error(`${vessel.name} coordinates are outside valid ranges.`);
    }
  } else {
    if (vessel.position !== null) throw new Error(`${vessel.name} must not have coordinates.`);
    if (!vessel.unmappedReason) throw new Error(`${vessel.name} requires an unmapped reason.`);
  }

  if (!vessel.source?.url?.startsWith("https://")) {
    throw new Error(`${vessel.name} requires an HTTPS supporting source.`);
  }
  if ((vessel.vesselType === "SSBN" || vessel.vesselType === "SSN") && /patrol/i.test(vessel.lastReportedLocation) && vessel.position) {
    throw new Error(`${vessel.name} exposes a submarine patrol position.`);
  }
}

console.log(`Validated ${dataset.vessels.length} unique fleet records.`);
