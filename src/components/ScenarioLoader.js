const CLASSIFICATIONS = new Set(["mapped", "approximate", "unknown", "withheld"]);
const EVIDENCE_CLASSIFICATIONS = new Set(["direct-report", "direct-tracker", "insufficient", "withheld-policy"]);
const MAPPABLE_EVIDENCE = new Set(["direct-report", "direct-tracker"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  const ids = new Set();
  for (const [index, vessel] of raw.vessels.entries()) {
    const label = `Vessel ${index + 1}`;
    for (const field of ["id", "name", "service", "vesselClass", "vesselType", "status", "locationClassification", "lastReportedLocation", "evidenceCheckedDate", "evidenceClassification"]) {
      if (typeof vessel[field] !== "string" || !vessel[field].trim()) {
        throw new Error(`${label} has an invalid ${field}.`);
      }
    }
    if (ids.has(vessel.id)) throw new Error(`Duplicate vessel id: ${vessel.id}.`);
    ids.add(vessel.id);
    if (!CLASSIFICATIONS.has(vessel.locationClassification)) {
      throw new Error(`${vessel.name} has an invalid location classification.`);
    }
    if (!EVIDENCE_CLASSIFICATIONS.has(vessel.evidenceClassification)) {
      throw new Error(`${vessel.name} has an invalid evidence classification.`);
    }
    if (!isIsoDate(vessel.evidenceCheckedDate)) {
      throw new Error(`${vessel.name} has an invalid evidence checked date.`);
    }
    if (vessel.locationEvidenceDate !== null && !isIsoDate(vessel.locationEvidenceDate)) {
      throw new Error(`${vessel.name} has an invalid location evidence date.`);
    }

    const mapped = vessel.locationClassification === "mapped" || vessel.locationClassification === "approximate";
    if (mapped) {
      if (!vessel.position || !Number.isFinite(vessel.position.lat) || !Number.isFinite(vessel.position.lon)) {
        throw new Error(`${vessel.name} is mapped without valid coordinates.`);
      }
      if (Math.abs(vessel.position.lat) > 90 || Math.abs(vessel.position.lon) > 180) {
        throw new Error(`${vessel.name} has coordinates outside valid ranges.`);
      }
      if (!MAPPABLE_EVIDENCE.has(vessel.evidenceClassification) || !isIsoDate(vessel.locationEvidenceDate)) {
        throw new Error(`${vessel.name} is mapped without sufficient dated location evidence.`);
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

    if (
      !vessel.source ||
      typeof vessel.source.label !== "string" ||
      !vessel.source.label.trim() ||
      typeof vessel.source.url !== "string" ||
      !vessel.source.url.startsWith("https://")
    ) {
      throw new Error(`${vessel.name} has no valid supporting source.`);
    }
    if ((vessel.locationClassification === "unknown" || vessel.locationClassification === "withheld") && !vessel.unmappedReason) {
      throw new Error(`${vessel.name} requires an unmapped reason.`);
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
      throw new Error(`${vessel.name} cannot expose a submarine patrol position.`);
    }
  }

  return raw;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
