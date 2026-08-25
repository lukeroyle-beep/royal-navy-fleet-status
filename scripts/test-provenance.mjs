import assert from "node:assert/strict";
import fs from "node:fs";

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

const entities = read("../data/internal/provenance/vessels.json");
const registry = read("../data/internal/provenance/sources.json");
const evidenceLog = read("../data/internal/provenance/evidence.json");
const assessmentLog = read("../data/internal/provenance/assessments.json");
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
  if (requestedPrecision) {
    patrolAssessment.assessedState.locationPrecision = requestedPrecision;
  } else {
    delete patrolAssessment.assessedState.locationPrecision;
  }
  patrolAssessment.assessedState.lastReportedLocation = report;
  patrolAssessment.assessedState.publicLocationLabel = report;
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

assert.equal(validateSourceRegistry(registry, knownVesselIds, vesselIds), registry);
assert.equal(
  validateEvidenceLog(evidenceLog, registry.sources.map((source) => source.sourceId), knownVesselIds),
  evidenceLog,
);
assert.equal(
  validateAssessmentLog(assessmentLog, evidenceLog.evidence, knownVesselIds, vesselIds),
  assessmentLog,
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
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "registry-only").length, 1);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "provisional").length, 1);
assert.equal(
  registry.sources.some((source) => source.sourceId === "MARINEVESSELTRAFFIC_NATO_DISCOVERY"),
  true,
);
const sweep = createSweepQueue(registry, "2026-08-15T12:00:00Z");
assert.equal(
  sweep.sources.filter((source) => source.category === "official-vessel-social").length,
  enabledOfficialAccounts.length,
  "Every enabled official vessel account must enter the sweep queue.",
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
assert.equal(middleton.enabled, false);
assert.equal(middleton.registryStatus, "registry-only");
const dasher = registry.officialSocialCoverage.find((entry) => entry.vesselId === "hms-dasher");
assert.equal(dasher.enabled, false);
assert.equal(dasher.registryStatus, "provisional");

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

function read(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
