import { hasPlottablePosition } from '../../src/utils/map.js';
import { validateLocationContext } from '../../src/utils/location-context.js';
import { retainedLocationAssessment } from './retained-location.mjs';
import { readReviewedPublicLocation } from "./public-geography.mjs";
import { sanitisePublicLocationDescription } from "./public-location-safety.mjs";

import { REPRESENTATIVE_PATROL, REPRESENTATIVE_PATROL_ANCHOR, hasRepresentativePatrolMarker, validateRepresentativePatrolFleet } from "../../src/utils/representativePatrol.js";


export const PUBLIC_PROJECTION_METHOD_VERSION = "1.4.0";

const SUBMARINE_TYPES = new Set(["SSBN", "SSN"]);
const SUBMARINE_AT_SEA_PATTERN =
  /\b(?:patrol|at sea|underway|approaches?|atlantic|bay|channel|firth|gulf|islands?|ocean|off|region|route|sea|sound|strait|territorial waters|waters)\b/i;
const LIST_ONLY_STATES = new Set(["unconfirmed", "no_recent_information", "withheld"]);

export function createPublicProjection(entities, assessmentLog, evidenceItems = null) {
  if (!entities?.metadata || !Array.isArray(entities.vessels)) {
    throw new Error("Canonical vessel data is malformed.");
  }
  const assessments = new Map(
    assessmentLog.assessments.map((assessment) => [assessment.assessmentId, assessment]),
  );

  const projection = {
    metadata: structuredClone(entities.metadata),
    vessels: entities.vessels.map((entity) => {
      const assessmentId = assessmentLog.currentAssessmentIds[entity.vesselId];
      const assessment = assessments.get(assessmentId);
      if (!assessment || assessment.vesselId !== entity.vesselId) {
        throw new Error(`No current assessment for ${entity.vesselId}.`);
      }
      // Protected policy is evaluated before any ordinary or historical geometry.
      if (assessment.assessedState.mapRepresentation || SUBMARINE_TYPES.has(entity.vesselType)) {
        if (assessment.retainedLocation) throw new Error('Protected submarine locations cannot use automatic last-known retention.');
        return projectPublicVessel(entity, assessment);
      }
      const current = projectPublicVessel(entity, assessment);
      const retained = retainedLocationAssessment(assessment, assessmentLog.assessments, evidenceItems);
      // The active reviewed point/region wins. A linked old point never promotes recency.
      if (hasPlottablePosition(current) || !retained) {
        if (evidenceItems) current.locationContext = { retained: false, ...publicDates(assessment.selectedEvidenceIds, evidenceItems) };
        validateLocationContext(current);
        return current;
      }
      const label = `${retained.location.label} (last reported ${retained.retained.observedAt.slice(0, 10)}; current location unconfirmed)`;
      const vessel = projectPublicVessel(entity, { ...assessment, assessedState: {
        ...assessment.assessedState, locationClassification: 'approximate', locationState: 'last_reported',
        publicLocation: { ...retained.location, label }, lastReportedLocation: label,
      } });
      vessel.locationContext = {
        retained: true,
        ...publicDates(retained.retained.evidenceIds, evidenceItems || []),
        observedAt: retained.retained.observedAt.slice(0, 10),
        latestReport: { label: current.publicLocationLabel, precision: current.locationPrecision, state: current.locationState,
          ...publicDates(assessment.selectedEvidenceIds.filter(id => !retained.retained.evidenceIds.includes(id)), evidenceItems || []) },
      };
      validateLocationContext(vessel);
      return vessel;
    }),
  };
  validateRepresentativePatrolFleet(projection.vessels);
  return projection;
}

function publicDates(ids, evidenceItems) {
  const selected = evidenceItems.filter(item => ids.includes(item.evidenceId) && item.claim?.location && !item.supersededBy &&
    !evidenceItems.some(correction => correction.correctionOf === item.evidenceId));
  const dates = selected.map(item => {
    const observation = item.observation;
    const from = observation?.from?.slice(0, 10), to = observation?.to?.slice(0, 10);
    return { observedAt: ['explicit', 'inferred'].includes(observation?.basis) && from === to && from ? from : null,
      publishedAt: item.publishedAt?.slice(0, 10) || null };
  });
  // Ambiguous or unknown timing stays unknown; publication never fills that gap.
  return {
    observedAt: dates.length && dates.every(d => d.observedAt && d.observedAt === dates[0].observedAt) ? dates[0].observedAt : null,
    publishedAt: dates.map(d => d.publishedAt).filter(Boolean).sort().at(-1) || null,
  };
}

export function createPublicStatusHistoryCatalog(entities, history) {
  if (!entities || !Array.isArray(entities.vessels) || !Array.isArray(entities.retiredVessels)) {
    throw new Error("Canonical vessel identity data is malformed.");
  }
  const identities = new Map(
    [...entities.vessels, ...entities.retiredVessels].map((entity) => [entity.vesselId, entity]),
  );
  const historyIds = new Set(history.flatMap((snapshot) => Object.keys(snapshot.statuses)));
  const vessels = [];
  for (const vesselId of historyIds) {
    const entity = identities.get(vesselId);
    if (!entity) throw new Error(`No public identity is available for historical vessel ${vesselId}.`);
    vessels.push({
      id: entity.vesselId,
      name: entity.name,
      service: entity.service,
      vesselClass: entity.vesselClass,
      vesselType: entity.vesselType,
      pennantNumber: entity.pennantNumber,
      commissionedDate: entity.commissionedDate,
      homePort: entity.homePort,
    });
  }
  return { schemaVersion: 1, vessels };
}

export function projectPublicVessel(entity, assessment) {
  const assessedState = assessment.assessedState;
  const locationState = deriveLocationState(assessedState, assessment.freshness?.state);
  const reviewedLocation = safeReviewedLocation(entity, assessedState);
  const listOnly = LIST_ONLY_STATES.has(locationState) || !reviewedLocation;
  const locationPrecision = listOnly ? "none" : reviewedLocation.precision;
  const representative = assessedState.mapRepresentation === REPRESENTATIVE_PATROL;
  const publicLocationLabel = representative ? "On patrol" : sanitisePublicLocationLabel(
    createPublicLocationLabel(
      assessedState,
      locationState,
      reviewedLocation?.label,
    ),
  );
  const geometry = createPublicGeometry(reviewedLocation, locationPrecision, publicLocationLabel);

  const vessel = {
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
      publicLocationLabel,
    ),
    position: geometry.position,
    uncertaintyArea: geometry.uncertaintyArea,
    ...(representative ? { mapRepresentation: REPRESENTATIVE_PATROL } : {}),
  };
  if (Object.hasOwn(assessedState, "mapRepresentation")) {
    const anchor = assessedState.symbolicPosition;
    if (!hasRepresentativePatrolMarker(vessel) ||
        anchor?.lat !== REPRESENTATIVE_PATROL_ANCHOR.lat ||
        anchor?.lon !== REPRESENTATIVE_PATROL_ANCHOR.lon) {
      throw new Error("Invalid representative patrol display decision.");
    }
  }
  return vessel;
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
        representation: reviewedLocation.representation || "regional",
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

function sanitisePublicLocationLabel(value) {
  return String(value)
    .replace(/\s*\/\s*(?:HMS|RFA)\b.*$/i, "")
    .trim();
}

function sanitiseLocationText(value, isSubmarine, publicLocationLabel) {
  const sanitised = sanitisePublicLocationDescription(value, publicLocationLabel);
  if (!isSubmarine) return sanitised;
  return sanitised
    .replace(/,?\s*\b\d+\s+(?:dock|berth)\b/gi, "")
    .replace(/\b(?:dock|berth)\s+\d+\b/gi, "the naval base")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+;/g, ";")
    .trim();
}
