import { readReleaseMetadata } from "../utils/release.js";
import { PUBLIC_LOCATION_STATES } from "../utils/publicEnums.js";

const CLASSIFICATIONS = new Set(["mapped", "approximate", "unknown", "withheld"]);
const LOCATION_STATES = new Set(PUBLIC_LOCATION_STATES);
const LOCATION_PRECISIONS = new Set(["port", "city", "region", "none"]);
const SUBMARINE_PATROL_REGION_PATTERN =
  /\b(?:patrol|approaches?|atlantic|bay|channel|firth|islands?|ocean|off|region|sea|sound|territorial waters|waters|route)\b/i;
const EXACT_BERTH_DISCLOSURE_PATTERN = /\b(?:berth|jetty)\b|alongside\s+(?:HMS|RFA)\b/i;
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
  "symbolicPosition",
  "unmappedReason",
  "publicLocation",
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
  const normalizedClasses = new Map();
  for (const [index, vessel] of raw.vessels.entries()) {
    const label = `Vessel ${index + 1}`;
    for (const field of [
      "id",
      "name",
      "service",
      "vesselClass",
      "vesselType",
      "status",
      "locationClassification",
      "locationState",
      "locationPrecision",
      "publicLocationLabel",
      "lastReportedLocation",
    ]) {
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
    validateVesselClass(vessel.vesselClass, vessel.name, normalizedClasses);
    if (!CLASSIFICATIONS.has(vessel.locationClassification)) {
      throw new Error(`${vessel.name} has an invalid location classification.`);
    }
    if (!LOCATION_STATES.has(vessel.locationState)) {
      throw new Error(`${vessel.name} has an invalid public location state.`);
    }
    if (!LOCATION_PRECISIONS.has(vessel.locationPrecision)) {
      throw new Error(`${vessel.name} has an invalid public location precision.`);
    }
    if (!OPERATIONAL_STATUSES.has(vessel.status)) {
      throw new Error(`${vessel.name} has an invalid operational status.`);
    }
    if (
      EXACT_BERTH_DISCLOSURE_PATTERN.test(
        `${vessel.lastReportedLocation} ${vessel.publicLocationLabel}`,
      )
    ) {
      throw new Error(`${vessel.name} exposes exact berth-level public location detail.`);
    }
    const pointPrecision = vessel.locationPrecision === "port" || vessel.locationPrecision === "city";
    if (pointPrecision) {
      if (!vessel.position || !Number.isFinite(vessel.position.lat) || !Number.isFinite(vessel.position.lon)) {
        throw new Error(`${vessel.name} has point-level precision without valid coordinates.`);
      }
      if (Math.abs(vessel.position.lat) > 90 || Math.abs(vessel.position.lon) > 180) {
        throw new Error(`${vessel.name} has coordinates outside valid ranges.`);
      }
      if (!hasAtMostDecimalPlaces(vessel.position.lat, 2) || !hasAtMostDecimalPlaces(vessel.position.lon, 2)) {
        throw new Error(`${vessel.name} exposes excessive coordinate precision for a ${vessel.locationPrecision}-level location.`);
      }
      if (vessel.position.label !== vessel.publicLocationLabel) {
        throw new Error(`${vessel.name} has inconsistent public point labels.`);
      }
    } else if (vessel.position !== null) {
      throw new Error(`${vessel.name} must not contain point coordinates at ${vessel.locationPrecision} precision.`);
    }

    if (vessel.locationPrecision === "region") {
      validateUncertaintyArea(vessel);
    } else if (vessel.uncertaintyArea !== null) {
      throw new Error(`${vessel.name} must not contain uncertainty geometry at ${vessel.locationPrecision} precision.`);
    }

    if (["unconfirmed", "no_recent_information", "withheld"].includes(vessel.locationState)) {
      if (vessel.locationPrecision !== "none" || vessel.position !== null || vessel.uncertaintyArea !== null) {
        throw new Error(`${vessel.name} must remain list-only when its public location is ${vessel.locationState}.`);
      }
    }
    if (vessel.locationClassification === "withheld" && vessel.locationState !== "withheld") {
      throw new Error(`${vessel.name} has inconsistent withheld location state.`);
    }
    if (vessel.locationClassification === "unknown" && !["unconfirmed", "no_recent_information"].includes(vessel.locationState)) {
      throw new Error(`${vessel.name} has inconsistent unknown location state.`);
    }
    if (vessel.locationPrecision === "region" && vessel.locationClassification !== "approximate") {
      throw new Error(`${vessel.name} must classify regional geometry as approximate.`);
    }
    if (
      (vessel.vesselType === "SSBN" || vessel.vesselType === "SSN") &&
      SUBMARINE_PATROL_REGION_PATTERN.test(
        `${vessel.lastReportedLocation.split(";")[0]} ${vessel.publicLocationLabel}`,
      ) &&
      vessel.locationPrecision !== "none"
    ) {
      throw new Error(`${vessel.name} cannot expose submarine patrol or regional geometry.`);
    }
    if (
      (vessel.vesselType === "SSBN" || vessel.vesselType === "SSN") &&
      /\b(?:dock|berth)\s*\d+|\b\d+\s*(?:dock|berth)\b/i.test(
        `${vessel.lastReportedLocation} ${vessel.publicLocationLabel}`,
      )
    ) {
      throw new Error(`${vessel.name} exposes excessive submarine location precision.`);
    }
  }

  return raw;
}

function validateVesselClass(value, vesselName, normalizedClasses) {
  if (
    value !== value.trim() ||
    value !== value.normalize("NFC") ||
    /\s{2,}|[\p{Cc}\p{Cf}]/u.test(value)
  ) {
    throw new Error(`${vesselName} has a non-canonical vessel class.`);
  }
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-GB");
  const existing = normalizedClasses.get(normalized);
  if (existing && existing !== value) {
    throw new Error(`Inconsistent vessel class names: ${existing} and ${value}.`);
  }
  normalizedClasses.set(normalized, value);
}

function validateUncertaintyArea(vessel) {
  const area = vessel.uncertaintyArea;
  if (
    !area ||
    area.representation !== "regional" ||
    !area.centre ||
    !Number.isFinite(area.centre.lat) ||
    !Number.isFinite(area.centre.lon) ||
    Math.abs(area.centre.lat) > 90 ||
    Math.abs(area.centre.lon) > 180 ||
    !hasAtMostDecimalPlaces(area.centre.lat, 2) ||
    !hasAtMostDecimalPlaces(area.centre.lon, 2) ||
    !Number.isFinite(area.radiusKm) ||
    area.radiusKm < 5 ||
    area.radiusKm > 2500 ||
    area.label !== vessel.publicLocationLabel
  ) {
    throw new Error(`${vessel.name} has invalid bounded regional uncertainty geometry.`);
  }
}

function hasAtMostDecimalPlaces(value, maximum) {
  return Math.abs(value - Number(value.toFixed(maximum))) < 1e-9;
}
