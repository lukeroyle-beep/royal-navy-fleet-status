import assert from "node:assert/strict";

import {
  clusterEvidenceCandidates,
  createEvidenceReviewQueues,
  extractEvidenceCandidate,
  findEvidenceContradictions,
  gradeEvidenceCandidate,
  matchVesselCandidate,
  validateModelSuggestion,
} from "./lib/evidence-processing.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");

for (const [query, expectedId, expectedField] of [
  [{ name: "Duncan" }, "hms-duncan", "name-or-alias"],
  [{ pennantNumber: "D37" }, "hms-duncan", "pennantNumber"],
  [{ accountAlias: "@HMS_Spey" }, "hms-spey", "name-or-alias"],
  [{ name: "HMS Trent" }, "hms-trent", "name-or-alias"],
]) {
  const match = matchVesselCandidate(query, entities.vessels, registry.officialSocialCoverage);
  assert.equal(match.state, "matched");
  assert.equal(match.vesselId, expectedId);
  assert.ok(match.candidates[0].matchedBy.some((entry) => entry.field === expectedField));
}
assert.equal(
  matchVesselCandidate({ name: "Unknown ship" }, entities.vessels).state,
  "unresolved",
);
const ambiguousRoster = [
  { vesselId: "one", name: "Example", aliases: ["Shared"] },
  { vesselId: "two", name: "Another", aliases: ["Shared"] },
];
assert.equal(matchVesselCandidate({ name: "Shared" }, ambiguousRoster).state, "ambiguous");

const text = "HMS Duncan arrived in Copenhagen on 24 August 2026 and is alongside.";
const extracted = extractEvidenceCandidate({
  text,
  publishedAt: "2026-08-25T10:00:00Z",
  receivedAt: "2026-08-25T10:05:00Z",
  locations: ["Portsmouth", "Copenhagen"],
});
assert.equal(extracted.publicationTime, "2026-08-25T10:00:00Z");
assert.equal(extracted.eventTime, "2026-08-24T00:00:00.000Z");
assert.equal(extracted.locationCandidate.value, "Copenhagen");
assert.equal(extracted.activityCandidate.value, "arrived");
assert.equal(extracted.statusCandidate.value, "Alongside");
const incomplete = extractEvidenceCandidate({
  text: "HMS Duncan was photographed in Copenhagen.",
  publishedAt: "2026-08-25T10:00:00Z",
  receivedAt: "2026-08-25T10:05:00Z",
  locations: ["Copenhagen"],
});
assert.equal(incomplete.eventTime, null, "Publication time must not be substituted for event time.");
assert.equal(incomplete.statusCandidate, null);

const candidates = [
  candidate("a", { contentHash: "same", originId: "wire-one" }),
  candidate("b", { contentHash: "same", originId: "wire-one" }),
  candidate("c", { contentHash: "different", originId: "origin-two" }),
];
const clusters = clusterEvidenceCandidates(candidates);
assert.equal(clusters.length, 2);
assert.equal(clusters.find((cluster) => cluster.candidateIds.includes("a")).duplicateCount, 1);
assert.deepEqual(
  clusterEvidenceCandidates(candidates),
  clusters,
  "Clustering must be deterministic.",
);

const conflicting = [
  candidate("location-one", { location: "Portsmouth", status: "Alongside" }),
  candidate("location-two", { location: "Plymouth", status: "At sea" }),
];
const contradictions = findEvidenceContradictions(conflicting);
assert.equal(contradictions.length, 1);
assert.equal(contradictions[0].state, "requires-human-review");
assert.deepEqual(contradictions[0].fields.location, ["plymouth", "portsmouth"]);

const source = { reliabilityTier: "A", category: "official-royal-navy" };
const approvedGrade = gradeEvidenceCandidate(candidate("approved", {
  reviewState: "approved",
  locationPrecision: "port",
}), source);
assert.equal(approvedGrade.publicationEligible, true);
assert.equal(approvedGrade.maximumPublicPrecision, "port");
assert.equal(
  gradeEvidenceCandidate(candidate("new"), source).publicationEligible,
  false,
  "Unreviewed deterministic candidates must not publish.",
);
assert.equal(
  gradeEvidenceCandidate(candidate("no-location", { location: null }), source).maximumPublicPrecision,
  "none",
  "Missing location support must force list-only precision.",
);

const suggestionText = "HMS Duncan arrived in Copenhagen.";
const suggestion = validateModelSuggestion({
  vesselId: "hms-duncan",
  eventTime: null,
  location: "Copenhagen",
  activity: "arrived",
  status: null,
  citations: [
    { field: "vesselId", start: 0, end: 10, quote: "HMS Duncan" },
    { field: "activity", start: 11, end: 18, quote: "arrived" },
    { field: "location", start: 22, end: 32, quote: "Copenhagen" },
  ],
}, suggestionText);
assert.equal(suggestion.suggestion.eventTime, null);
assert.equal(suggestion.suggestion.status, null);
assert.equal(suggestion.publicationEligible, false);
assert.equal(suggestion.requiresHumanReview, true);
assert.throws(
  () => validateModelSuggestion({ location: "Plymouth", citations: [] }, suggestionText),
  /lacks a valid cited input span/i,
);

const reviewCandidates = [
  candidate("new-low", {
    vesselId: null,
    match: { state: "unresolved" },
    directness: "indirect",
    eventTime: null,
    publishedAt: null,
    receivedAt: "2026-06-01T00:00:00Z",
  }),
  ...conflicting,
];
const queues = createEvidenceReviewQueues({
  candidates: reviewCandidates,
  sources: [{ sourceId: "official", ...source }],
  asOf: "2026-08-26T00:00:00Z",
});
assert.ok(queues.queues.new.includes("new-low"));
assert.ok(queues.queues.unmatched.includes("new-low"));
assert.ok(queues.queues.stale.includes("new-low"));
assert.ok(queues.queues.lowSupport.includes("new-low"));
assert.deepEqual(queues.queues.contradictory, ["location-one", "location-two"]);

const publicJson = JSON.stringify({
  id: "hms-duncan",
  name: "HMS Duncan",
  status: "Available",
});
for (const privateField of ["reviewState", "authorityTier", "contradictions", "citedSpans"]) {
  assert.equal(publicJson.includes(privateField), false);
}

console.log("Deterministic evidence processing and review-routing tests passed.");

function candidate(candidateId, overrides = {}) {
  return {
    candidateId,
    vesselId: "hms-duncan",
    match: { state: "matched" },
    sourceId: "official",
    canonicalUrl: `https://example.invalid/${candidateId}`,
    contentHash: `hash-${candidateId}`,
    originId: `origin-${candidateId}`,
    directness: "direct",
    eventTime: "2026-08-24T00:00:00Z",
    publishedAt: "2026-08-25T00:00:00Z",
    receivedAt: "2026-08-25T01:00:00Z",
    location: "Portsmouth",
    status: "Alongside",
    reviewState: "new",
    ...overrides,
  };
}
