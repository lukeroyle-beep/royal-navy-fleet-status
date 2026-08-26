const AIS_FLAG = "RNFS_ENABLE_AIS";
const COPERNICUS_FLAG = "RNFS_ENABLE_COPERNICUS";
const SUBMARINE_TYPES = new Set(["SSN", "SSBN"]);

export function externalCorroborationFlags(environment = process.env) {
  return Object.freeze({
    ais: environment[AIS_FLAG] === "1",
    copernicus: environment[COPERNICUS_FLAG] === "1",
  });
}

export function createAisAdapterConfiguration({
  environment = process.env,
  mmsiRegistry,
  boundingBoxes,
}) {
  const enabled = externalCorroborationFlags(environment).ais;
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      state: "disabled",
      reason: `${AIS_FLAG}=1 was not supplied.`,
      publicationEligible: false,
    });
  }
  const apiKey = String(environment.AISSTREAM_API_KEY || "");
  if (apiKey.length < 16) throw new Error("Enabled AIS adapter requires AISSTREAM_API_KEY.");
  const registry = validatePrivateMmsiRegistry(mmsiRegistry);
  const boxes = validateBoundingBoxes(boundingBoxes);
  const eligible = registry.filter((entry) => !SUBMARINE_TYPES.has(entry.vesselType));
  if (!eligible.length) throw new Error("Enabled AIS adapter has no eligible surface-vessel MMSIs.");
  return Object.freeze({
    enabled: true,
    state: "configured-internal-only",
    vesselCount: eligible.length,
    boundingBoxCount: boxes.length,
    publicationEligible: false,
    createWireSubscription() {
      return {
        APIKey: apiKey,
        BoundingBoxes: structuredClone(boxes),
        FiltersShipMMSI: eligible.map((entry) => entry.mmsi),
        FilterMessageTypes: ["PositionReport"],
      };
    },
  });
}

export function validatePrivateMmsiRegistry(registry) {
  if (!Array.isArray(registry) || !registry.length) {
    throw new Error("AIS requires a non-empty private MMSI registry.");
  }
  const mmsis = new Set();
  const vesselIds = new Set();
  for (const entry of registry) {
    if (typeof entry?.vesselId !== "string" || !entry.vesselId.trim()) {
      throw new Error("AIS MMSI registry has an invalid vesselId.");
    }
    if (!/^\d{9}$/.test(String(entry.mmsi || ""))) {
      throw new Error(`${entry.vesselId} has an invalid MMSI.`);
    }
    if (typeof entry.vesselType !== "string" || !entry.vesselType.trim()) {
      throw new Error(`${entry.vesselId} has no vessel type.`);
    }
    if (mmsis.has(String(entry.mmsi)) || vesselIds.has(entry.vesselId)) {
      throw new Error("AIS MMSI registry contains a duplicate identity.");
    }
    mmsis.add(String(entry.mmsi));
    vesselIds.add(entry.vesselId);
  }
  return registry.map((entry) => ({ ...structuredClone(entry), mmsi: String(entry.mmsi) }));
}

export function validateAisPositionReport(report, {
  receivedAt,
  asOf = receivedAt,
  previousReport = null,
  boundingBoxes,
  maxAgeMinutes = 30,
  maximumPlausibleSpeedKnots = 55,
} = {}) {
  requireTimestamp(receivedAt, "AIS receipt time");
  requireTimestamp(asOf, "AIS evaluation time");
  const reportTime = report?.reportedAt;
  requireTimestamp(reportTime, "AIS report time");
  const latitude = Number(report.latitude);
  const longitude = Number(report.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return rejected("invalid-coordinates", "unavailable", reportTime, receivedAt);
  }
  const reportMs = Date.parse(reportTime);
  const receivedMs = Date.parse(receivedAt);
  const asOfMs = Date.parse(asOf);
  if (reportMs > receivedMs + 5 * 60_000 || reportMs > asOfMs + 5 * 60_000) {
    return rejected("future-report", "unavailable", reportTime, receivedAt);
  }
  const ageMinutes = Math.max(0, (asOfMs - reportMs) / 60_000);
  const freshness = ageMinutes <= 5 ? "live" : ageMinutes <= maxAgeMinutes ? "recent" : "stale";
  if (freshness === "stale") return rejected("stale-report", freshness, reportTime, receivedAt);
  if (previousReport && reportMs <= Date.parse(previousReport.reportedAt)) {
    return rejected("out-of-order", freshness, reportTime, receivedAt);
  }
  const boxes = validateBoundingBoxes(boundingBoxes);
  if (!boxes.some((box) => insideBox(latitude, longitude, box))) {
    return rejected("outside-bounding-box", freshness, reportTime, receivedAt);
  }
  if (previousReport) {
    const elapsedHours = (reportMs - Date.parse(previousReport.reportedAt)) / 3_600_000;
    const distanceNm = haversineKilometres(
      Number(previousReport.latitude),
      Number(previousReport.longitude),
      latitude,
      longitude,
    ) / 1.852;
    if (elapsedHours <= 0 || distanceNm / elapsedHours > maximumPlausibleSpeedKnots) {
      return rejected("implausible-jump", freshness, reportTime, receivedAt);
    }
  }
  return {
    accepted: true,
    reason: null,
    freshness,
    reportTime,
    receivedAt,
    position: { latitude, longitude },
    publicationEligible: false,
    requiresHumanReview: true,
  };
}

export function aisConnectionState({ connected, lastReceivedAt = null, asOf }) {
  requireTimestamp(asOf, "AIS connection evaluation time");
  if (lastReceivedAt !== null) requireTimestamp(lastReceivedAt, "AIS last receipt time");
  return {
    state: connected ? (lastReceivedAt ? "available" : "connected-awaiting-data") : "unavailable",
    lastReceivedAt,
    absenceEvidence: false,
    publicationEligible: false,
    guidance: connected
      ? "A received report is corroboration only."
      : "A disconnect or missing transmission is not evidence that a vessel is absent.",
  };
}

export function evaluateAisCandidate({ vessel, validation, strongerOfficialEvidence = null }) {
  if (SUBMARINE_TYPES.has(vessel?.vesselType)) {
    return internalCandidate("rejected", "submarine-data-prohibited");
  }
  if (!validation?.accepted) return internalCandidate("rejected", validation?.reason || "unavailable");
  if (strongerOfficialEvidence) {
    return {
      ...internalCandidate("corroborating-only", "stronger-official-evidence-retained"),
      officialEvidenceId: strongerOfficialEvidence.evidenceId,
    };
  }
  return internalCandidate("requires-human-review", "ais-cannot-establish-public-state-alone");
}

export function evaluateCopernicusCandidate({
  enabled = externalCorroborationFlags().copernicus,
  vessel,
  observation,
  knownPorts,
  independentEvidenceIds = [],
}) {
  if (!enabled) return internalCandidate("disabled", `${COPERNICUS_FLAG}=1 was not supplied.`);
  if (!vessel || SUBMARINE_TYPES.has(vessel.vesselType) || vessel.kind === "submarine") {
    return internalCandidate("rejected", "surface-vessels-only");
  }
  if (!observation || typeof observation.portId !== "string") {
    return internalCandidate("rejected", "invalid-observation");
  }
  if (!(knownPorts || []).some((port) => port.portId === observation.portId)) {
    return internalCandidate("rejected", "port-not-already-known");
  }
  requireTimestamp(observation.capturedAt, "Satellite capture time");
  const cloudCoverPercent = Number(observation.cloudCoverPercent);
  const resolutionMetres = Number(observation.resolutionMetres);
  if (!Number.isFinite(cloudCoverPercent) || cloudCoverPercent < 0 || cloudCoverPercent > 100 ||
      !Number.isFinite(resolutionMetres) || resolutionMetres <= 0) {
    return internalCandidate("rejected", "invalid-imagery-metadata");
  }
  const limitations = ["revisit-gap", "misidentification-risk"];
  if (cloudCoverPercent > 20) limitations.push("cloud-obscuration");
  if (resolutionMetres > 20) limitations.push("insufficient-resolution");
  return {
    ...internalCandidate(
      independentEvidenceIds.length ? "requires-human-review" : "insufficient-support",
      independentEvidenceIds.length
        ? "independent-corroboration-required-before-any-assessment"
        : "satellite-alone-cannot-support-an-assessment",
    ),
    capturedAt: observation.capturedAt,
    portId: observation.portId,
    limitations,
    independentEvidenceIds: [...new Set(independentEvidenceIds)].sort(),
  };
}

export function assertPublicTransitionHasIndependentEvidence(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) {
    throw new Error("Public transition requires reviewed evidence.");
  }
  if (evidence.every((item) => ["ais", "satellite"].includes(item.sourceType))) {
    throw new Error("AIS or satellite evidence alone cannot trigger a public transition.");
  }
  if (evidence.some((item) => item.humanReviewed !== true)) {
    throw new Error("Public transition evidence requires explicit human review.");
  }
  return true;
}

function rejected(reason, freshness, reportTime, receivedAt) {
  return {
    accepted: false,
    reason,
    freshness,
    reportTime,
    receivedAt,
    position: null,
    publicationEligible: false,
    requiresHumanReview: true,
  };
}

function internalCandidate(state, reason) {
  return {
    state,
    reason,
    internalOnly: true,
    publicationEligible: false,
    requiresHumanReview: state !== "disabled",
  };
}

function validateBoundingBoxes(boxes) {
  if (!Array.isArray(boxes) || !boxes.length) throw new Error("AIS requires configured bounding boxes.");
  return boxes.map((box) => {
    if (!Array.isArray(box) || box.length !== 2 || box.some((corner) => !Array.isArray(corner) || corner.length !== 2)) {
      throw new Error("AIS bounding box has an invalid shape.");
    }
    const [[latOne, lonOne], [latTwo, lonTwo]] = box.map((corner) => corner.map(Number));
    if (![latOne, latTwo].every((value) => Number.isFinite(value) && value >= -90 && value <= 90) ||
        ![lonOne, lonTwo].every((value) => Number.isFinite(value) && value >= -180 && value <= 180)) {
      throw new Error("AIS bounding box has invalid coordinates.");
    }
    return [[latOne, lonOne], [latTwo, lonTwo]];
  });
}

function insideBox(latitude, longitude, box) {
  const latitudes = [box[0][0], box[1][0]];
  const longitudes = [box[0][1], box[1][1]];
  return latitude >= Math.min(...latitudes) && latitude <= Math.max(...latitudes) &&
    longitude >= Math.min(...longitudes) && longitude <= Math.max(...longitudes);
}

function haversineKilometres(latOne, lonOne, latTwo, lonTwo) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(latTwo - latOne);
  const deltaLon = radians(lonTwo - lonOne);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(latOne)) * Math.cos(radians(latTwo)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
