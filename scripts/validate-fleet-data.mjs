import fs from "node:fs";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const allowedClassifications = new Set(["mapped", "approximate", "unknown", "withheld"]);
const allowedEvidenceClassifications = new Set(["direct-report", "direct-tracker", "insufficient", "withheld-policy"]);
const allowedStatuses = new Set(["Available", "Deployed", "In re-fit", "Unknown", "Museum ship", "Decommissioned"]);
const mappableEvidence = new Set(["direct-report", "direct-tracker"]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const requiredFields = [
  "id",
  "name",
  "service",
  "vesselClass",
  "vesselType",
  "status",
  "locationClassification",
  "lastReportedLocation",
  "evidenceCheckedDate",
  "evidenceClassification",
];

if (!isIsoDate(dataset.metadata?.asOfDate) || !Array.isArray(dataset.vessels)) {
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
  if (!allowedStatuses.has(vessel.status)) {
    throw new Error(`${vessel.name} has invalid operational status.`);
  }
  if (!allowedEvidenceClassifications.has(vessel.evidenceClassification)) {
    throw new Error(`${vessel.name} has invalid evidence classification.`);
  }
  if (!isIsoDate(vessel.evidenceCheckedDate)) {
    throw new Error(`${vessel.name} has an invalid evidence checked date.`);
  }
  if (vessel.locationEvidenceDate !== null && !isIsoDate(vessel.locationEvidenceDate)) {
    throw new Error(`${vessel.name} has an invalid location evidence date.`);
  }
  if (vessel.evidenceCheckedDate > dataset.metadata.asOfDate) {
    throw new Error(`${vessel.name} has an evidence checked date after the dataset date.`);
  }
  if (vessel.locationEvidenceDate > dataset.metadata.asOfDate) {
    throw new Error(`${vessel.name} has a location evidence date after the dataset date.`);
  }

  const shouldMap = vessel.locationClassification === "mapped" || vessel.locationClassification === "approximate";
  if (shouldMap) {
    if (!Number.isFinite(vessel.position?.lat) || !Number.isFinite(vessel.position?.lon)) {
      throw new Error(`${vessel.name} is mapped without coordinates.`);
    }
    if (Math.abs(vessel.position.lat) > 90 || Math.abs(vessel.position.lon) > 180) {
      throw new Error(`${vessel.name} coordinates are outside valid ranges.`);
    }
    if (!mappableEvidence.has(vessel.evidenceClassification) || !isIsoDate(vessel.locationEvidenceDate)) {
      throw new Error(`${vessel.name} is mapped without sufficient dated location evidence.`);
    }
  } else {
    if (vessel.position !== null) throw new Error(`${vessel.name} must not have coordinates.`);
    if (!vessel.unmappedReason) throw new Error(`${vessel.name} requires an unmapped reason.`);
  }

  if (vessel.symbolicPosition !== undefined) {
    const symbolic = vessel.symbolicPosition;
    if (
      vessel.vesselType !== "SSBN" ||
      vessel.locationClassification !== "withheld" ||
      vessel.status !== "Deployed" ||
      vessel.position !== null ||
      vessel.lastReportedLocation !== "On patrol - classified" ||
      !Number.isFinite(symbolic?.lat) ||
      !Number.isFinite(symbolic?.lon) ||
      Math.abs(symbolic.lat) > 90 ||
      Math.abs(symbolic.lon) > 180 ||
      symbolic.label !== "On patrol - classified"
    ) {
      throw new Error(`${vessel.name} has an invalid classified symbolic marker.`);
    }
  }

  if (!vessel.source?.label?.trim() || !vessel.source?.url?.startsWith("https://")) {
    throw new Error(`${vessel.name} requires an HTTPS supporting source.`);
  }
  if (vessel.locationClassification === "unknown" && vessel.evidenceClassification !== "insufficient") {
    throw new Error(`${vessel.name} must classify unknown location evidence as insufficient.`);
  }
  if (vessel.locationClassification === "withheld" && vessel.evidenceClassification !== "withheld-policy") {
    throw new Error(`${vessel.name} must use the withheld evidence policy.`);
  }
  if (vessel.status === "Deployed" && vessel.locationClassification === "withheld" && !vessel.symbolicPosition) {
    throw new Error(`${vessel.name} requires a classified symbolic marker when deployed.`);
  }
  if ((vessel.vesselType === "SSBN" || vessel.vesselType === "SSN") && /patrol/i.test(vessel.lastReportedLocation) && vessel.position) {
    throw new Error(`${vessel.name} exposes a submarine patrol position.`);
  }
}

console.log(`Validated ${dataset.vessels.length} unique fleet records.`);

function isIsoDate(value) {
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
