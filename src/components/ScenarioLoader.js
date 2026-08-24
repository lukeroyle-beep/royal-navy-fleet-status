import { readReleaseMetadata } from "../utils/release.js";

const CLASSIFICATIONS = new Set(["mapped", "approximate", "unknown", "withheld"]);
const OPERATIONAL_STATUSES = new Set(["Available", "Deployed", "In re-fit", "Unknown", "Museum ship", "Decommissioned"]);
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  "source",
  "sourceId",
  "sourceUrl",
  "evidenceCheckedDate",
  "locationEvidenceDate",
  "evidenceClassification",
  "selectedEvidenceIds",
  "conflictingEvidenceIds",
  "rationale",
  "analystNotes",
]);

export class ScenarioLoader {
  constructor(url) {
    this.url = url;
  }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Could not load fleet data from ${this.url}.`);
    }
    return validateFleet(await response.json());
  }
}

export function validateFleet(raw) {
  if (!raw || typeof raw !== "object" || !raw.metadata || !Array.isArray(raw.vessels)) {
    throw new Error("Fleet data must contain metadata and a vessels array.");
  }
  if (!raw.vessels.length) {
    throw new Error("Fleet data contains no vessel records.");
  }
  try {
    readReleaseMetadata(raw.metadata);
  } catch (error) {
    throw new Error(`Fleet data has invalid release metadata: ${error.message}`);
  }

  const ids = new Set();
  for (const [index, vessel] of raw.vessels.entries()) {
    const label = `Vessel ${index + 1}`;
    for (const field of ["id", "name", "service", "vesselClass", "vesselType", "status", "locationClassification", "lastReportedLocation"]) {
      if (typeof vessel[field] !== "string" || !vessel[field].trim()) {
        throw new Error(`${label} has an invalid ${field}.`);
      }
    }
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      if (Object.hasOwn(vessel, field)) {
        throw new Error(`${vessel.name} exposes internal provenance field ${field}.`);
      }
    }
    if (ids.has(vessel.id)) throw new Error(`Duplicate vessel id: ${vessel.id}.`);
    ids.add(vessel.id);
    if (!CLASSIFICATIONS.has(vessel.locationClassification)) {
      throw new Error(`${vessel.name} has an invalid location classification.`);
    }
    if (!OPERATIONAL_STATUSES.has(vessel.status)) {
      throw new Error(`${vessel.name} has an invalid operational status.`);
    }
    const mapped = vessel.locationClassification === "mapped" || vessel.locationClassification === "approximate";
    if (mapped) {
      if (!vessel.position || !Number.isFinite(vessel.position.lat) || !Number.isFinite(vessel.position.lon)) {
        throw new Error(`${vessel.name} is mapped without valid coordinates.`);
      }
      if (Math.abs(vessel.position.lat) > 90 || Math.abs(vessel.position.lon) > 180) {
        throw new Error(`${vessel.name} has coordinates outside valid ranges.`);
      }
    } else if (vessel.position !== null) {
      throw new Error(`${vessel.name} must not contain coordinates when ${vessel.locationClassification}.`);
    }

    if (vessel.symbolicPosition !== undefined) {
      const symbolic = vessel.symbolicPosition;
      if (
        vessel.vesselType !== "SSBN" ||
        vessel.locationClassification !== "withheld" ||
        vessel.status !== "Deployed" ||
        vessel.position !== null ||
        vessel.lastReportedLocation !== "On patrol - classified" ||
        !symbolic ||
        !Number.isFinite(symbolic.lat) ||
        !Number.isFinite(symbolic.lon) ||
        Math.abs(symbolic.lat) > 90 ||
        Math.abs(symbolic.lon) > 180 ||
        symbolic.label !== "On patrol - classified"
      ) {
        throw new Error(`${vessel.name} has an invalid classified symbolic marker.`);
      }
    }

    if ((vessel.locationClassification === "unknown" || vessel.locationClassification === "withheld") && !vessel.unmappedReason) {
      throw new Error(`${vessel.name} requires an unmapped reason.`);
    }
    if (vessel.status === "Deployed" && vessel.locationClassification === "withheld" && !vessel.symbolicPosition) {
      throw new Error(`${vessel.name} requires a classified symbolic marker when deployed.`);
    }
    if ((vessel.vesselType === "SSBN" || vessel.vesselType === "SSN") && /patrol/i.test(vessel.lastReportedLocation) && vessel.position) {
      throw new Error(`${vessel.name} cannot expose a submarine patrol position.`);
    }
  }

  return raw;
}
