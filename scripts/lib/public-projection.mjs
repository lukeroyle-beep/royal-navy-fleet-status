import { readReviewedPublicLocation } from "./public-geography.mjs";

export const PUBLIC_PROJECTION_METHOD_VERSION = "1.2.0";

const SUBMARINE_TYPES = new Set(["SSBN", "SSN"]);
const SUBMARINE_AT_SEA_PATTERN =
  /\b(?:patrol|at sea|underway|approaches?|atlantic|bay|channel|firth|gulf|islands?|ocean|off|region|route|sea|sound|strait|territorial waters|waters)\b/i;
const LIST_ONLY_STATES = new Set(["unconfirmed", "no_recent_information", "withheld"]);

export function createPublicProjection(entities, assessmentLog) {
  if (!entities?.metadata || !Array.isArray(entities.vessels)) {
    throw new Error("Canonical vessel data is malformed.");
  }
  const assessments = new Map(
    assessmentLog.assessments.map((assessment) => [assessment.assessmentId, assessment]),
  );

  return {
    metadata: structuredClone(entities.metadata),
    vessels: entities.vessels.map((entity) => {
      const assessmentId = assessmentLog.currentAssessmentIds[entity.vesselId];
      const assessment = assessments.get(assessmentId);
      if (!assessment || assessment.vesselId !== entity.vesselId) {
        throw new Error(`No current assessment for ${entity.vesselId}.`);
      }
      return projectPublicVessel(entity, assessment);
    }),
  };
}

export function projectPublicVessel(entity, assessment) {
  const assessedState = assessment.assessedState;
  const locationState = deriveLocationState(assessedState, assessment.freshness?.state);
  const reviewedLocation = safeReviewedLocation(entity, assessedState);
  const listOnly = LIST_ONLY_STATES.has(locationState) || !reviewedLocation;
  const locationPrecision = listOnly ? "none" : reviewedLocation.precision;
  const publicLocationLabel = createPublicLocationLabel(
    assessedState,
    locationState,
    reviewedLocation?.label,
  );
  const geometry = createPublicGeometry(reviewedLocation, locationPrecision, publicLocationLabel);

  return {
    id: entity.vesselId,
    name: entity.name,
    service: entity.service,
    vesselClass: entity.vesselClass,
    vesselType: entity.vesselType,
    pennantNumber: entity.pennantNumber,
    commissionedDate: entity.commissionedDate,
    homePort: entity.homePort,
    status: assessedState.status,
    locationClassification: assessedState.locationClassification,
    locationState,
    locationPrecision,
    publicLocationLabel,
    lastReportedLocation: sanitiseLocationText(
      assessedState.lastReportedLocation,
      SUBMARINE_TYPES.has(entity.vesselType),
    ),
    position: geometry.position,
    uncertaintyArea: geometry.uncertaintyArea,
  };
}

function deriveLocationState(assessedState, freshnessState) {
  if (assessedState.locationState) return assessedState.locationState;
  if (assessedState.locationClassification === "mapped") return "confirmed";
  if (assessedState.locationClassification === "approximate") {
    return freshnessState === "current" ? "confirmed" : "last_reported";
  }
  if (assessedState.locationClassification === "withheld") return "withheld";
  return freshnessState === "current" ? "unconfirmed" : "no_recent_information";
}

function safeReviewedLocation(entity, assessedState) {
  const reviewed = readReviewedPublicLocation(assessedState.publicLocation);
  if (!reviewed) return null;
  if (!SUBMARINE_TYPES.has(entity.vesselType)) return reviewed;
  const reportedPlace = String(assessedState.lastReportedLocation || "").split(";")[0];
  if (
    reviewed.precision === "region" ||
    SUBMARINE_AT_SEA_PATTERN.test(`${reportedPlace} ${reviewed.label}`)
  ) {
    return {
      precision: "none",
      label: reviewed.label,
      geometry: null,
    };
  }
  return reviewed;
}

function createPublicGeometry(reviewedLocation, locationPrecision, publicLocationLabel) {
  if (!reviewedLocation || locationPrecision === "none") {
    return { position: null, uncertaintyArea: null };
  }
  if (locationPrecision === "region") {
    return {
      position: null,
      uncertaintyArea: {
        centre: structuredClone(reviewedLocation.geometry.centre),
        radiusKm: reviewedLocation.geometry.radiusKm,
        label: publicLocationLabel,
        representation: "regional",
      },
    };
  }
  return {
    position: {
      lat: reviewedLocation.geometry.lat,
      lon: reviewedLocation.geometry.lon,
      label: publicLocationLabel,
    },
    uncertaintyArea: null,
  };
}

function createPublicLocationLabel(assessedState, locationState, reviewedLabel) {
  if (locationState === "withheld") return "Location not published";
  if (locationState === "unconfirmed") return "Location unconfirmed";
  if (locationState === "no_recent_information") return "No recent public information";
  if (typeof reviewedLabel === "string" && reviewedLabel.trim()) return reviewedLabel.trim();
  return cleanPublicLocationLabel(String(assessedState.lastReportedLocation || "").split(";")[0]);
}

function cleanPublicLocationLabel(value) {
  return String(value || "Public location unavailable")
    .replace(/\s*\((?:representative|representative [^)]+)\)\s*$/i, "")
    .trim();
}

function sanitiseLocationText(value, isSubmarine) {
  if (!isSubmarine) return value;
  return String(value)
    .replace(/,?\s*\b\d+\s+(?:dock|berth)\b/gi, "")
    .replace(/\b(?:dock|berth)\s+\d+\b/gi, "the naval base")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+;/g, ";")
    .trim();
}
