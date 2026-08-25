export const PUBLIC_PROJECTION_METHOD_VERSION = "1.1.0";

const CITY_LEVEL_LABELS = new Map([
  ["hms-agamemnon", "Barrow-in-Furness"],
  ["hms-duncan", "Copenhagen, Denmark"],
  ["hms-spey", "Singapore"],
]);
const REGIONAL_LOCATION_PATTERN =
  /\b(?:approaches?|bay|channel|firth|ocean|off|region|sea|sound|territorial waters|waters)\b|\broute\b/i;
const SUBMARINE_TYPES = new Set(["SSBN", "SSN"]);

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
  const locationPrecision = deriveLocationPrecision(entity, assessedState);
  const publicLocationLabel = createPublicLocationLabel(entity, assessedState, locationState);
  const geometry = createPublicGeometry(assessedState, locationPrecision, publicLocationLabel);

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

function deriveLocationPrecision(entity, assessedState) {
  if (assessedState.locationPrecision) return assessedState.locationPrecision;
  if (!["mapped", "approximate"].includes(assessedState.locationClassification)) return "none";
  if (CITY_LEVEL_LABELS.has(entity.vesselId)) return "city";
  const description = `${assessedState.position?.label || ""} ${assessedState.lastReportedLocation || ""}`;
  if (REGIONAL_LOCATION_PATTERN.test(description)) return "region";
  return "port";
}

function createPublicGeometry(assessedState, locationPrecision, publicLocationLabel) {
  if (locationPrecision === "none" || !assessedState.position) {
    return { position: null, uncertaintyArea: null };
  }
  if (locationPrecision === "region") {
    const description = `${assessedState.position.label || ""} ${assessedState.lastReportedLocation || ""}`;
    const radiusKm = regionalRadiusKm(description);
    const decimalPlaces = radiusKm <= 30 ? 2 : 1;
    return {
      position: null,
      uncertaintyArea: {
        centre: {
          lat: roundCoordinate(assessedState.position.lat, decimalPlaces),
          lon: roundCoordinate(assessedState.position.lon, decimalPlaces),
        },
        radiusKm,
        label: publicLocationLabel,
        representation: "regional",
      },
    };
  }
  return {
    position: {
      lat: roundCoordinate(assessedState.position.lat, 2),
      lon: roundCoordinate(assessedState.position.lon, 2),
      label: publicLocationLabel,
    },
    uncertaintyArea: null,
  };
}

function createPublicLocationLabel(entity, assessedState, locationState) {
  if (locationState === "withheld") return "Location not published";
  if (locationState === "unconfirmed") return "Location unconfirmed";
  if (locationState === "no_recent_information") return "No recent public information";
  if (CITY_LEVEL_LABELS.has(entity.vesselId)) return CITY_LEVEL_LABELS.get(entity.vesselId);
  const label = assessedState.position?.label || assessedState.lastReportedLocation;
  return String(label || "Public location unavailable")
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

function regionalRadiusKm(description) {
  if (/Caribbean/i.test(description)) return 1000;
  if (/South Atlantic|North Atlantic|Baltic Sea|South China Sea/i.test(description)) return 450;
  if (/North Sea|Irish Sea|English Channel|Falkland Islands/i.test(description)) return 180;
  if (/territorial waters|waters|route/i.test(description)) return 90;
  if (/approaches?|\boff\b/i.test(description)) return 45;
  if (/sound|bay|firth/i.test(description)) return 20;
  return 120;
}

function roundCoordinate(value, decimalPlaces) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(decimalPlaces));
}
