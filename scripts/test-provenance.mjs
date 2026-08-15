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

const entities = read("../data/internal/provenance/vessels.json");
const registry = read("../data/internal/provenance/sources.json");
const evidenceLog = read("../data/internal/provenance/evidence.json");
const assessmentLog = read("../data/internal/provenance/assessments.json");
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);

assert.equal(validateSourceRegistry(registry, vesselIds), registry);
assert.equal(
  validateEvidenceLog(evidenceLog, registry.sources.map((source) => source.sourceId), vesselIds),
  evidenceLog,
);
assert.equal(validateAssessmentLog(assessmentLog, evidenceLog.evidence, vesselIds), assessmentLog);
assert.equal(registry.officialSocialCoverage.length, 71);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.enabled).length, 23);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "legacy").length, 3);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "registry-only").length, 1);
assert.equal(registry.officialSocialCoverage.filter((entry) => entry.registryStatus === "provisional").length, 1);
assert.equal(
  registry.sources.some((source) => source.sourceId === "MARINEVESSELTRAFFIC_NATO_DISCOVERY"),
  true,
);
const sweep = createSweepQueue(registry, "2026-08-15T12:00:00Z");
assert.equal(
  sweep.sources.filter((source) => source.category === "official-vessel-social").length,
  23,
  "Every enabled official vessel account must enter the sweep queue.",
);
assert.equal(
  sweep.sources.find((source) => source.sourceId === "MARINEVESSELTRAFFIC_NATO_DISCOVERY").promotionPolicy,
  "discovery-only",
);

const middleton = registry.officialSocialCoverage.find((entry) => entry.vesselId === "hms-middleton");
assert.equal(middleton.accountHandle, "@HMSMiddleton");
assert.equal(middleton.enabled, false);
assert.equal(middleton.registryStatus, "registry-only");
const dasher = registry.officialSocialCoverage.find((entry) => entry.vesselId === "hms-dasher");
assert.equal(dasher.enabled, false);
assert.equal(dasher.registryStatus, "provisional");

const malformedRegistry = structuredClone(registry);
malformedRegistry.sources.find((source) => source.enabled).canonicalUrl = "javascript:alert(1)";
assert.throws(() => validateSourceRegistry(malformedRegistry, vesselIds), /HTTPS URL/i);
const malformedEvidence = structuredClone(evidenceLog);
malformedEvidence.evidence[0].sourceId = "UNKNOWN_SOURCE";
assert.throws(
  () => validateEvidenceLog(malformedEvidence, registry.sources.map((source) => source.sourceId), vesselIds),
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

const discoveryOnly = item("discovery", "media-c", "Portsmouth", "origin-discovery", "2026-08-15T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [discoveryOnly],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.confidenceLevel, "unknown");
assert.ok(result.excludedEvidenceIds.includes("discovery"));

const expired = item("expired", "official-a", "Portsmouth", "origin-expired", "2026-07-01T08:00:00Z");
result = assessEvidenceSet({
  vesselId: "test-vessel",
  evidence: [expired],
  sources,
  assessedAt: "2026-08-15T12:00:00Z",
});
assert.equal(result.confidenceLevel, "unknown");
assert.ok(result.excludedEvidenceIds.includes("expired"));

const history = [
  { assessmentId: "a1", previousAssessmentId: null },
  { assessmentId: "a2", previousAssessmentId: "a1" },
];
assert.deepEqual(reconstructAssessmentHistory("a2", history).map((entry) => entry.assessmentId), ["a2", "a1"]);

console.log("Provenance model tests passed.");

function source(sourceId, reliabilityTier) {
  return { sourceId, reliabilityTier, enabled: true };
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
