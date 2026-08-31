import assert from "node:assert/strict";

import {
  assessEvidenceSet,
  freshnessState,
  reconstructAssessmentHistory,
  resolveVesselId,
  sha256,
  validateAssessmentLog,
  validateEvidenceLog,
  validateSourceRegistry,
} from "./lib/provenance.mjs";
import { createSweepQueue } from "./lib/sweep.mjs";
import { createPublicProjection, projectPublicVessel } from "./lib/public-projection.mjs";
import {
  hasExactBerthDisclosure,
  sanitisePublicLocationDescription,
} from "./lib/public-location-safety.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidenceLog = privateInputs.readJson("evidence");
const assessmentLog = privateInputs.readJson("assessments");
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...vesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
const publicProjection = createPublicProjection(entities, assessmentLog);
const expectedPublicFields = [
  "commissionedDate",
  "homePort",
  "id",
  "lastReportedLocation",
  "locationClassification",
  "locationPrecision",
  "locationState",
  "name",
  "pennantNumber",
  "position",
  "publicLocationLabel",
  "service",
  "status",
  "uncertaintyArea",
  "vesselClass",
  "vesselType",
].sort();
for (const vessel of publicProjection.vessels) {
  assert.deepEqual(Object.keys(vessel).sort(), expectedPublicFields, `${vessel.id} bypasses the public allow-list.`);
}
const projectedVengeance = publicProjection.vessels.find((vessel) => vessel.id === "hms-vengeance");
assert.equal(projectedVengeance.locationPrecision, "none");
assert.equal(projectedVengeance.position, null);
assert.equal(projectedVengeance.uncertaintyArea, null);
const vengeanceEntity = entities.vessels.find((vessel) => vessel.vesselId === "hms-vengeance");
const vengeanceAssessment = assessmentLog.assessments.find(
  (assessment) =>
    assessment.assessmentId === assessmentLog.currentAssessmentIds[vengeanceEntity.vesselId],
);
for (const { report, requestedPrecision } of [
  { report: "North Atlantic", requestedPrecision: undefined },
  { report: "Norwegian Sea", requestedPrecision: "region" },
  { report: "Caribbean region", requestedPrecision: "port" },
]) {
  const patrolAssessment = structuredClone(vengeanceAssessment);
  patrolAssessment.assessedState.locationClassification = "approximate";
  patrolAssessment.assessedState.locationState = "last_reported";
  if (requestedPrecision === "region") {
    patrolAssessment.assessedState.publicLocation = {
      precision: "region",
      label: report,
      geometry: { type: "circle", centre: { lat: 45, lon: -30 }, radiusKm: 450 },
    };
  } else if (requestedPrecision === "port") {
    patrolAssessment.assessedState.publicLocation = {
      precision: "port",
      label: report,
      geometry: { type: "point", lat: 45, lon: -30 },
    };
  } else {
    delete patrolAssessment.assessedState.publicLocation;
  }
  patrolAssessment.assessedState.lastReportedLocation = report;
  patrolAssessment.assessedState.position = { lat: 45, lon: -30, label: report };
  const projectedPatrol = projectPublicVessel(vengeanceEntity, patrolAssessment);
  assert.equal(projectedPatrol.locationPrecision, "none", `${report} exposed patrol precision.`);
  assert.equal(projectedPatrol.position, null, `${report} exposed a patrol point.`);
  assert.equal(projectedPatrol.uncertaintyArea, null, `${report} exposed a patrol region.`);
}
const projectedVictorious = publicProjection.vessels.find((vessel) => vessel.id === "hms-victorious");
assert.doesNotMatch(projectedVictorious.lastReportedLocation, /\b\d+\s*(?:dock|berth)\b/i);
const projectedMedway = publicProjection.vessels.find((vessel) => vessel.id === "hms-medway");
assert.equal(projectedMedway.locationPrecision, "region");
assert.equal(projectedMedway.position, null);
assert.equal(projectedMedway.uncertaintyArea.radiusKm, 450);
assert.equal(projectedMedway.publicLocationLabel, "Falkland Islands / South Atlantic");
const medwayAssessment = assessmentLog.assessments.find(
  (assessment) => assessment.assessmentId === assessmentLog.currentAssessmentIds["hms-medway"],
);
assert.deepEqual(medwayAssessment.assessedState.publicLocation, {
  precision: "region",
  label: "Falkland Islands / South Atlantic",
  geometry: {
    type: "circle",
    centre: { lat: -51.7, lon: -57.5 },
    radiusKm: 450,
  },
});

const duncanEntity = entities.vessels.find((vessel) => vessel.vesselId === "hms-duncan");
const duncanAssessment = assessmentLog.assessments.find(
  (assessment) => assessment.assessmentId === assessmentLog.currentAssessmentIds[duncanEntity.vesselId],
);
const explicitOsloAssessment = structuredClone(duncanAssessment);
explicitOsloAssessment.assessedState.lastReportedLocation = "Oslo, Norway";
explicitOsloAssessment.assessedState.publicLocation = {
  precision: "city",
  label: "Oslo",
  geometry: { type: "point", lat: 59.91, lon: 10.75 },
};
const projectedOslo = projectPublicVessel(duncanEntity, explicitOsloAssessment);
assert.equal(projectedOslo.locationPrecision, "city");
assert.deepEqual(projectedOslo.position, { lat: 59.91, lon: 10.75, label: "Oslo" });

const namedAlongsideAssessment = structuredClone(explicitOsloAssessment);
namedAlongsideAssessment.assessedState.lastReportedLocation =
  "London; alongside HMS Belfast reported 28 August 2026";
namedAlongsideAssessment.assessedState.publicLocation = {
  precision: "port",
  label: "London / HMS Belfast",
  geometry: { type: "point", lat: 51.51, lon: -0.08 },
};
const projectedNamedAlongside = projectPublicVessel(duncanEntity, namedAlongsideAssessment);
assert.equal(projectedNamedAlongside.lastReportedLocation, "London; presence reported 28 August 2026");
assert.equal(projectedNamedAlongside.publicLocationLabel, "London");
assert.deepEqual(projectedNamedAlongside.position, { lat: 51.51, lon: -0.08, label: "London" });

const namedJettyAssessment = structuredClone(explicitOsloAssessment);
namedJettyAssessment.assessedState.lastReportedLocation =
  "Dartmouth Town Jetty; alongside reported 28 August 2026";
namedJettyAssessment.assessedState.publicLocation = {
  precision: "port",
  label: "Dartmouth harbour",
  geometry: { type: "point", lat: 50.35, lon: -3.58 },
};
const projectedNamedJetty = projectPublicVessel(duncanEntity, namedJettyAssessment);
assert.equal(
  projectedNamedJetty.lastReportedLocation,
  "Dartmouth harbour; presence reported 28 August 2026",
);
assert.equal(projectedNamedJetty.publicLocationLabel, "Dartmouth harbour");
assert.equal(
  sanitisePublicLocationDescription(
    "Glen Mallan Ammunition Jetty, Loch Long; alongside reported 18 August 2026",
    "Glen Mallan jetty area, Loch Long",
  ),
  "Loch Long; presence reported 18 August 2026",
);
for (const value of [
  projectedNamedAlongside.lastReportedLocation,
  projectedNamedJetty.lastReportedLocation,
  "Loch Long; presence reported 18 August 2026",
]) {
  assert.equal(hasExactBerthDisclosure(value), false, `${value} retained exact berth detail.`);
}

const ambiguousOsloAssessment = structuredClone(explicitOsloAssessment);
delete ambiguousOsloAssessment.assessedState.publicLocation;
const projectedAmbiguousOslo = projectPublicVessel(duncanEntity, ambiguousOsloAssessment);
assert.equal(projectedAmbiguousOslo.locationPrecision, "none");
assert.equal(projectedAmbiguousOslo.position, null);
assert.equal(projectedAmbiguousOslo.uncertaintyArea, null);

const movingVesselAssessment = structuredClone(duncanAssessment);
movingVesselAssessment.assessedState.lastReportedLocation = "Departing Oslo for sea trials";
movingVesselAssessment.assessedState.position = { lat: 59.91, lon: 10.75, label: "Departing Oslo" };
delete movingVesselAssessment.assessedState.publicLocation;
const projectedMovingVessel = projectPublicVessel(duncanEntity, movingVesselAssessment);
assert.equal(projectedMovingVessel.locationPrecision, "none");
assert.equal(projectedMovingVessel.position, null);
assert.equal(projectedMovingVessel.uncertaintyArea, null);

const explicitAreaAssessment = structuredClone(duncanAssessment);
explicitAreaAssessment.assessedState.locationClassification = "approximate";
explicitAreaAssessment.assessedState.lastReportedLocation = "Reviewed operational area";
explicitAreaAssessment.assessedState.publicLocation = {
  precision: "region",
  label: "Reviewed operational area",
  geometry: { type: "circle", centre: { lat: 60, lon: 5 }, radiusKm: 275 },
};
const projectedExplicitArea = projectPublicVessel(duncanEntity, explicitAreaAssessment);
assert.equal(projectedExplicitArea.locationPrecision, "region");
assert.equal(projectedExplicitArea.position, null);
assert.deepEqual(projectedExplicitArea.uncertaintyArea, {
  centre: { lat: 60, lon: 5 },
  radiusKm: 275,
  label: "Reviewed operational area",
  representation: "regional",
});

const ambiguousPlaceAssessment = structuredClone(duncanAssessment);
ambiguousPlaceAssessment.assessedState.lastReportedLocation = "Springfield";
ambiguousPlaceAssessment.assessedState.position = { lat: 51.5, lon: -1.2, label: "Springfield" };
delete ambiguousPlaceAssessment.assessedState.publicLocation;
const projectedAmbiguousPlace = projectPublicVessel(duncanEntity, ambiguousPlaceAssessment);
assert.equal(projectedAmbiguousPlace.locationPrecision, "none");
assert.equal(projectedAmbiguousPlace.position, null);
assert.equal(projectedAmbiguousPlace.uncertaintyArea, null);

assert.equal(validateSourceRegistry(registry, knownVesselIds, vesselIds), registry);
assert.equal(
  validateEvidenceLog(evidenceLog, registry.sources.map((source) => source.sourceId), knownVesselIds),
  evidenceLog,
);
assert.equal(
  validateAssessmentLog(assessmentLog, evidenceLog.evidence, knownVesselIds, vesselIds),
  assessmentLog,
);
const missingReviewedGeometry = structuredClone(assessmentLog);
delete missingReviewedGeometry.assessments.find(
  (assessment) => assessment.assessmentId === missingReviewedGeometry.currentAssessmentIds["hms-duncan"],
).assessedState.publicLocation;
assert.throws(
  () =>
    validateAssessmentLog(
      missingReviewedGeometry,
      evidenceLog.evidence,
      knownVesselIds,
      vesselIds,
    ),
  /no reviewed publicLocation decision/i,
);
const unsafeReviewedGeometry = structuredClone(assessmentLog);
unsafeReviewedGeometry.assessments.find(
  (assessment) => assessment.assessmentId === unsafeReviewedGeometry.currentAssessmentIds["hms-duncan"],
).assessedState.publicLocation.geometry.sourceUrl = "https://invalid.test/private";
assert.throws(
  () =>
    validateAssessmentLog(
      unsafeReviewedGeometry,
      evidenceLog.evidence,
      knownVesselIds,
      vesselIds,
    ),
  /requires explicit point geometry/i,
);
assert.equal(registry.officialSocialCoverage.length, 68);
for (const retiredId of ["hms-richmond", "hms-iron-duke", "hms-chiddingfold"]) {
  const retired = entities.retiredVessels.find((vessel) => vessel.vesselId === retiredId);
  assert.equal(Boolean(retired), true);
  assert.equal(retired.retirementEvidenceDate, "2026-07-13");
  assert.match(retired.retirementSource.url, /royalnavy\.mod\.uk\/news\/2026\/july\/13/);
  assert.match(retired.retirementBasis, /no separate decommissioning-ceremony date/i);
}
const enabledOfficialAccounts = registry.sources.filter(
  (source) => source.enabled && source.category === "official-vessel-social",
);
assert.equal(
  registry.officialSocialCoverage.filter((entry) => entry.enabled).length,
  enabledOfficialAccounts.length,
  "Official social coverage and enabled account sources must remain in sync.",
);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "legacy").length, 0);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "registry-only").length, 0);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "provisional").length, 0);
assert.equal(
  registry.sources.some((source) => source.sourceId === "MARINEVESSELTRAFFIC_NATO_DISCOVERY"),
  true,
);
const sweep = createSweepQueue(registry, "2026-08-15T12:00:00Z");
assert.equal(
  sweep.sources.filter((source) => source.category === "official-vessel-social").length,
  enabledOfficialAccounts.filter((source) => source.xCollection?.required).length,
  "Every required enabled official vessel account must enter the mandatory sweep queue.",
);
assert.equal(
  sweep.sources.find((source) => source.sourceId === "MARINEVESSELTRAFFIC_NATO_DISCOVERY").promotionPolicy,
  "discovery-only",
);
assert.equal(
  sweep.sources.some((source) => source.sourceId === "AGAMEMNON_DELIVERY_2026"),
  false,
  "Historical one-off evidence pages must not re-enter the recurring source queue.",
);
assert.equal(sweep.discoveryTargets.length, 7);

const middleton = registry.officialSocialCoverage.find((entry) => entry.vesselId === "hms-middleton");
assert.equal(middleton.accountHandle, "@HMSMiddleton");
assert.equal(middleton.enabled, true);
assert.equal(middleton.registryStatus, "enabled");
const dasher = registry.officialSocialCoverage.find((entry) => entry.vesselId === "hms-dasher");
assert.equal(dasher.enabled, true);
assert.equal(dasher.registryStatus, "enabled");
assert.match(dasher.verifiedByUrl, /^https:\/\/www\.royalnavy\.mod\.uk\//);

const malformedRegistry = structuredClone(registry);
malformedRegistry.sources.find((source) => source.enabled).canonicalUrl = "javascript:alert(1)";
assert.throws(() => validateSourceRegistry(malformedRegistry, knownVesselIds, vesselIds), /HTTPS URL/i);
const malformedEvidence = structuredClone(evidenceLog);
malformedEvidence.evidence[0].sourceId = "UNKNOWN_SOURCE";
assert.throws(
  () =>
    validateEvidenceLog(
      malformedEvidence,
      registry.sources.map((source) => source.sourceId),
      knownVesselIds,
    ),
  /unknown source/i,
);

assert.equal(resolveVesselId({ vesselId: "hms-duncan" }, entities.vessels), "hms-duncan");
assert.equal(resolveVesselId({ pennantNumber: "D37" }, entities.vessels), "hms-duncan");
assert.equal(resolveVesselId({ name: "Duncan" }, entities.vessels), "hms-duncan");
assert.throws(() => resolveVesselId({ name: "Not a vessel" }, entities.vessels), /No canonical vessel identity/i);

const sources = [
  source("official-a", "A"),
  source("official-b", "B"),
  source("media-c", "C"),
  source("discovery-c", "C", "aggregator-discovery"),
];
const duplicateOrigin = [
  item("one", "official-a", "Portsmouth", "origin-one", "2026-08-15T08:00:00Z"),
  item("copy", "official-b", "Portsmouth", "origin-one", "2026-08-15T08:00:00Z"),
];
let result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: duplicateOrigin,
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.independentOriginCount, 1);
assert.equal(result.confidenceLevel, "moderate", "A copied report must not boost corroboration.");

result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [...duplicateOrigin, item("independent", "official-b", "Portsmouth", "origin-two", "2026-08-15T09:00:00Z")],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.independentOriginCount, 2);
assert.equal(result.confidenceLevel, "high");

const oldPortsmouth = item("old", "official-a", "Portsmouth", "old-origin", "2026-08-14T08:00:00Z");
const newPlymouth = item("new", "official-b", "Plymouth", "new-origin", "2026-08-15T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [oldPortsmouth, newPlymouth],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.chosenClaim.location.name, "Plymouth", "Older evidence must not override a newer credible observation.");
assert.ok(result.excludedEvidenceIds.includes("old"));

const sameTimeConflict = item("conflict", "official-a", "Portsmouth", "conflict-origin", "2026-08-15T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [newPlymouth, sameTimeConflict],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.conflictState, "unresolved");
assert.equal(result.confidenceLevel, "unknown");
assert.equal(result.conflictingEvidenceIds.length, 1);

const recentPublicationWithoutObservation = item("published-only", "official-a", "Portsmouth", "origin-published", "2026-08-15T08:00:00Z");
recentPublicationWithoutObservation.observation = { from: null, to: null, precision: "unknown", basis: "unknown" };
recentPublicationWithoutObservation.publishedAt = "2026-08-15T08:00:00Z";
assert.equal(freshnessState(recentPublicationWithoutObservation, "2026-08-15T12:00:00Z"), "historical");

const scheduled = item("scheduled", "official-a", "Oslo", "origin-scheduled", "2026-08-20T08:00:00Z");
assert.equal(freshnessState(scheduled, "2026-08-15T12:00:00Z"), "historical");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [scheduled],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.confidenceLevel, "unknown");
assert.ok(result.excludedEvidenceIds.includes("scheduled"));
assert.equal(result.exclusionReasons[0].reason, "future-observation");

const discoveryOnly = item("discovery", "discovery-c", "Portsmouth", "origin-discovery", "2026-08-15T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [discoveryOnly],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.confidenceLevel, "unknown");
assert.ok(result.excludedEvidenceIds.includes("discovery"));

const directTierC = item("direct-tier-c", "media-c", "Portsmouth", "origin-media", "2026-08-15T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [directTierC],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.chosenClaim.location.name, "Portsmouth");
assert.equal(result.confidenceLevel, "low", "Tier C direct evidence may locate a vessel but cannot raise confidence.");

const expired = item("expired", "official-a", "Portsmouth", "origin-expired", "2026-07-01T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [expired],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.chosenClaim.location.name, "Portsmouth");
assert.equal(result.confidenceLevel, "low");
assert.equal(result.freshness.state, "historical");
assert.equal(result.statusPromotionEligible, false);

const history = [
  { assessmentId: "a1", previousAssessmentId: null },
  { assessmentId: "a2", previousAssessmentId: "a1" },
];
assert.deepEqual(reconstructAssessmentHistory("a2", history).map((entry) => entry.assessmentId), ["a2", "a1"]);

console.log("Provenance model tests passed.");

function source(sourceId, reliabilityTier, category = "official-royal-navy") {
  return { sourceId, reliabilityTier, category, enabled: true };
}

function item(evidenceId, sourceId, location, originId, observedAt) {
  return {
    evidenceId,
    vesselId: "test-vessel",
    sourceId,
    canonicalUrl: `https://example.invalid/${evidenceId}`,
    retrievedAt: "2026-08-15T12:00:00Z",
    publishedAt: observedAt,
    observation: { from: observedAt, to: observedAt, precision: "instant", basis: "explicit" },
    claim: { location: { name: location }, status: "Available" },
    claimContext: "port-visit",
    directness: "direct",
    originId,
    contentHash: sha256(evidenceId),
    historicalOnly: false,
    supersededBy: null,
  };
}
