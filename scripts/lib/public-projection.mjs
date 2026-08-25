export const PUBLIC_PROJECTION_METHOD_VERSION = "1.1.0";

const CITY_LEVEL_LOCATION_PATTERN =
  /\b(?:Barrow-in-Furness|Copenhagen(?:,\s*Denmark)?|Singapore)\b/i;
const REGIONAL_LOCATION_PATTERN =
  /\b(?:approaches?|atlantic|bay|channel|firth|islands?|ocean|off|region|sea|sound|territorial waters|waters)\b|\broute\b/i;
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
  const locationPrecision = deriveLocationPrecision(assessedState, entity.vesselType);
  const publicLocationLabel = createPublicLocationLabel(
    assessedState,
    locationState,
    locationPrecision,
  );
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

function deriveLocationPrecision(assessedState, vesselType) {
  if (!["mapped", "approximate"].includes(assessedState.locationClassification)) return "none";
  const reportedPlace = String(assessedState.lastReportedLocation || "").split(";")[0];
  const locationDescription = `${assessedState.position?.label || ""} ${reportedPlace}`;
  const requestedPrecision = assessedState.locationPrecision;
  if (
    SUBMARINE_TYPES.has(vesselType) &&
    (requestedPrecision === "region" ||
      /\bpatrol\b/i.test(locationDescription) ||
      REGIONAL_LOCATION_PATTERN.test(locationDescription))
  ) {
    return "none";
  }
  if (requestedPrecision) return requestedPrecision;
  if (CITY_LEVEL_LOCATION_PATTERN.test(locationDescription)) return "city";
  if (REGIONAL_LOCATION_PATTERN.test(locationDescription)) return "region";
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

function createPublicLocationLabel(assessedState, locationState, locationPrecision) {
  if (locationState === "withheld") return "Location not published";
  if (locationState === "unconfirmed") return "Location unconfirmed";
  if (locationState === "no_recent_information") return "No recent public information";
  if (typeof assessedState.publicLocationLabel === "string" && assessedState.publicLocationLabel.trim()) {
    return assessedState.publicLocationLabel.trim();
  }
  if (locationPrecision === "city") return createCityLocationLabel(assessedState);
  const label = assessedState.position?.label || assessedState.lastReportedLocation;
  return cleanPublicLocationLabel(label);
}

function createCityLocationLabel(assessedState) {
  const markerLabel = cleanPublicLocationLabel(assessedState.position?.label);
  const reportPlace = String(assessedState.lastReportedLocation || "").split(";")[0].trim();
  const genericMarker = /\b(?:harbour|port area)\b/i.test(markerLabel);
  const cityName = markerLabel.replace(/\s+(?:harbour|port area)\b.*$/i, "").trim();
  if (
    genericMarker &&
    cityName &&
    reportPlace
      .toLocaleLowerCase("en-GB")
      .startsWith(cityName.toLocaleLowerCase("en-GB"))
  ) {
    return reportPlace;
  }
  return cityName || reportPlace || "Public location unavailable";
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
