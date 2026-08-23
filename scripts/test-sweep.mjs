import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

import { collectPublicIndexes } from "./lib/public-index-collector.mjs";
import {
  PUBLIC_INDEX_TARGETS,
  createBlocker,
  createSweepRun,
  evaluateSweepCoverage,
  finaliseSweepRun,
  isRequiredRecurringSource,
  sweepWindowStartFromMetadata,
  validateReleaseSweepGate,
  validateSweepRunShape,
} from "./lib/sweep.mjs";

const entities = read("../data/internal/provenance/vessels.json");
const registry = read("../data/internal/provenance/sources.json");
const evidence = read("../data/internal/provenance/evidence.json");
const startedAt = "2026-08-24T00:00:00Z";
const checkedAt = "2026-08-24T00:01:00Z";
assert.equal(
  sweepWindowStartFromMetadata({ asOfDate: "2026-08-17" }),
  "2026-08-17T00:00:00Z",
  "Scheduled collection must derive its lower bound from the published dataset date.",
);
assert.throws(
  () => createSweepRun({ registry, entities, startedAt }),
  /requires an explicit window start/i,
);
assert.throws(
  () => createSweepRun({ registry, entities, startedAt, windowStart: startedAt }),
  /must start before its cut-off/i,
);
const run = createSweepRun({
  registry,
  entities,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
});

assert.equal(run.vesselOutcomes.length, 71, "Every canonical vessel requires an explicit outcome.");
assert.deepEqual(run.releaseTarget, { asOfDate: "2026-08-24", releaseRevision: 1 });
assert.deepEqual(
  run.sourceChecks.map((entry) => entry.sourceId),
  registry.sources.filter(isRequiredRecurringSource).map((entry) => entry.sourceId).sort(),
  "Only recurring manual sources belong in the hard coverage gate.",
);
assert.ok(
  run.sourceChecks.every((entry) => entry.collectionMode === "manual"),
  "Public-index feeds must be represented by discovery checks, not manual source checks.",
);
assert.ok(
  run.sourceChecks.length < registry.sources.filter((entry) => entry.enabled).length,
  "Historical one-off evidence URLs must not be treated as recurring sweep sources.",
);
assert.equal(
  run.sourceChecks.some((entry) => entry.sourceId === "AGAMEMNON_DELIVERY_2026"),
  false,
  "A historical evidence page is not a recurring discovery target.",
);
assert.ok(
  registry.sources
    .filter((entry) => entry.enabled && entry.category === "official-vessel-social")
    .every((entry) => run.sourceChecks.some((check) => check.sourceId === entry.sourceId)),
  "Every enabled official vessel account must receive a recurring external check.",
);
assert.equal(run.discoveryChecks.length, PUBLIC_INDEX_TARGETS.length);
assert.ok(
  PUBLIC_INDEX_TARGETS.filter((target) => target.sourceId).every((target) =>
    registry.sources.some((source) => source.enabled && source.sourceId === target.sourceId),
  ),
  "Every publisher target with a sourceId must resolve to an enabled registry source.",
);
assert.equal(run.complete, false);
assert.equal(validateSweepRunShape(run), run);

const calls = [];
await collectPublicIndexes(run, {
  registry,
  entities,
  checkedAt,
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const target = PUBLIC_INDEX_TARGETS.find((entry) => entry.url === url);
    const candidate = candidateFor(target.targetId);
    return response(url, target.contentKind === "feed" ? "application/rss+xml" : "text/html", candidate);
  },
});
assert.equal(calls.length, PUBLIC_INDEX_TARGETS.length);
assert.ok(calls.every((call) => call.options.method === "GET"));
assert.ok(calls.every((call) => call.options.redirect === "manual"));
assert.ok(calls.every((call) => !/x\.com|twitter\.com/i.test(call.url)));
assert.ok(
  calls.every((call) => PUBLIC_INDEX_TARGETS.some((target) => target.url === call.url)),
  "Collector must not fetch registry manual/API URLs.",
);
assert.ok(run.discoveryChecks.every((entry) => entry.state === "complete"));
assert.equal(run.coverage.completedDiscoveryChecks, PUBLIC_INDEX_TARGETS.length);
assert.equal(run.coverage.completedVesselOutcomes, 0);
assert.equal(run.complete, false, "Discovery alone must never authorise publication.");

const overlappingRegistry = structuredClone(registry);
overlappingRegistry.sources.find(
  (source) => source.sourceId === PUBLIC_INDEX_TARGETS[0].sourceId,
).monitoring = { recurring: true };
const overlappingRun = createSweepRun({
  registry: overlappingRegistry,
  entities,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
  discoveryTargets: [PUBLIC_INDEX_TARGETS[0]],
});
await collectPublicIndexes(overlappingRun, {
  registry: overlappingRegistry,
  entities,
  checkedAt,
  targets: [PUBLIC_INDEX_TARGETS[0]],
  fetchImpl: async (url) => response(url, "text/html", candidateFor(PUBLIC_INDEX_TARGETS[0].targetId)),
});
const overlappingSourceCheck = overlappingRun.sourceChecks.find(
  (check) => check.sourceId === PUBLIC_INDEX_TARGETS[0].sourceId,
);
assert.equal(overlappingSourceCheck.state, "complete");
assert.match(
  overlappingSourceCheck.notes,
  /read-only GET/i,
  "An automatic index that also becomes recurring must retain auditable source-check notes.",
);

for (const sourceCheck of run.sourceChecks) {
  Object.assign(sourceCheck, {
    state: "complete",
    checkedAt,
    outcome: "manual-review-complete",
    notes: "Reviewed the configured recurring source through the approved external path.",
    blocker: null,
  });
}
for (const vessel of run.vesselOutcomes) {
  Object.assign(vessel, {
    state: "complete",
    reviewedAt: checkedAt,
    outcome: "unchanged",
    notes: "No newer supportable public location identified.",
    blocker: null,
  });
}
finaliseSweepRun(run, {
  registry,
  entities,
  evidenceItems: evidence.evidence,
  completedAt: "2026-08-24T00:02:00Z",
});
assert.equal(run.complete, true);
assert.equal(run.coverage.pass, true);
const registryWithOneOff = structuredClone(registry);
registryWithOneOff.sources.push({
  ...registryWithOneOff.sources.find((source) => source.sourceId === "AGAMEMNON_DELIVERY_2026"),
  sourceId: "UNRELATED_ONE_OFF_AFTER_SWEEP",
  canonicalUrl: "https://example.invalid/unrelated-one-off",
});
assert.equal(
  evaluateSweepCoverage(run, { registry: registryWithOneOff, entities }).pass,
  true,
  "Adding a non-recurring evidence source must not invalidate completed coverage.",
);
const changedRecurringRegistry = structuredClone(registry);
changedRecurringRegistry.sources.find(
  (source) => source.sourceId === run.sourceChecks[0].sourceId,
).canonicalUrl = "https://example.invalid/changed-recurring-source";
assert.equal(
  evaluateSweepCoverage(run, { registry: changedRecurringRegistry, entities }).pass,
  false,
  "A recurring source definition change must invalidate the sweep.",
);
assert.deepEqual(
  validateReleaseSweepGate({
    runs: [run],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T00:03:00Z",
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }),
  { required: true, pass: true, runId: run.runId, reasons: [] },
);

const laterIncomplete = createSweepRun({
  registry,
  entities,
  startedAt: "2026-08-24T12:00:00Z",
  windowStart: startedAt,
});
assert.equal(
  validateReleaseSweepGate({
    runs: [run, laterIncomplete],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T13:00:00Z",
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }).pass,
  false,
  "A later incomplete attempt must not fall back to an earlier complete sweep.",
);

assert.equal(
  validateReleaseSweepGate({
    runs: [run],
    datasetDate: "2026-08-24",
    releaseRevision: 2,
    releasedAt: "2026-08-24T00:06:00Z",
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }).pass,
  false,
  "A correction release cannot reuse the revision 1 sweep.",
);
const correctionRun = structuredClone(run);
correctionRun.runId = `SWEEP_20260824T000300Z_R2_${run.sourceRegistryHash.slice(0, 8)}`;
correctionRun.releaseTarget.releaseRevision = 2;
correctionRun.startedAt = "2026-08-24T00:03:00Z";
correctionRun.window.to = correctionRun.startedAt;
correctionRun.completedAt = null;
correctionRun.complete = false;
for (const check of [...correctionRun.discoveryChecks, ...correctionRun.sourceChecks]) {
  check.checkedAt = "2026-08-24T00:04:00Z";
}
for (const outcome of correctionRun.vesselOutcomes) {
  outcome.reviewedAt = "2026-08-24T00:04:00Z";
}
finaliseSweepRun(correctionRun, {
  registry,
  entities,
  evidenceItems: evidence.evidence,
  completedAt: "2026-08-24T00:05:00Z",
});
assert.equal(
  validateReleaseSweepGate({
    runs: [run, correctionRun],
    datasetDate: "2026-08-24",
    releaseRevision: 2,
    releasedAt: "2026-08-24T00:06:00Z",
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }).pass,
  true,
);
const prematureCorrection = validateReleaseSweepGate({
  runs: [run, correctionRun],
  datasetDate: "2026-08-24",
  releaseRevision: 2,
  releasedAt: "2026-08-24T00:04:30Z",
  registry,
  entities,
  evidenceItems: evidence.evidence,
});
assert.equal(prematureCorrection.pass, false);
assert.ok(prematureCorrection.reasons.some((reason) => /completed after.*release instant/i.test(reason)));

const missingVessel = structuredClone(run);
missingVessel.vesselOutcomes.pop();
missingVessel.complete = false;
missingVessel.completedAt = null;
const missingCoverage = evaluateSweepCoverage(missingVessel, { registry, entities });
assert.equal(missingCoverage.pass, false);
assert.ok(missingCoverage.reasons.some((reason) => /vessel outcomes do not match/i.test(reason)));

const blockedRun = structuredClone(run);
blockedRun.complete = false;
blockedRun.completedAt = null;
Object.assign(blockedRun.sourceChecks[0], {
  state: "blocked",
  checkedAt: null,
  outcome: null,
  blocker: createBlocker("manual-unavailable", "Account could not be reviewed.", checkedAt),
});
const blockedCoverage = evaluateSweepCoverage(blockedRun, { registry, entities });
assert.equal(blockedCoverage.pass, false);
assert.equal(blockedCoverage.blockerCount, 1);
assert.equal(validateSweepRunShape(blockedRun), blockedRun, "Typed blockers are valid but incomplete.");

const relabelledRun = structuredClone(run);
relabelledRun.coverageDate = "2026-08-25";
relabelledRun.releaseTarget.asOfDate = "2026-08-25";
assert.throws(() => validateSweepRunShape(relabelledRun), /must match its start date/i);

const missingInterval = structuredClone(run);
missingInterval.window.from = null;
assert.throws(() => validateSweepRunShape(missingInterval), /requires an explicit window start/i);
const reversedInterval = structuredClone(run);
reversedInterval.window.from = reversedInterval.startedAt;
assert.throws(() => validateSweepRunShape(reversedInterval), /must start before its cut-off/i);

const copiedOldReview = structuredClone(run);
copiedOldReview.vesselOutcomes[0].reviewedAt = "2026-08-23T23:59:59Z";
assert.throws(() => validateSweepRunShape(copiedOldReview), /predates the sweep start/i);
const copiedOldDiscovery = structuredClone(run);
copiedOldDiscovery.discoveryChecks[0].checkedAt = "2026-08-23T23:59:59Z";
assert.throws(() => validateSweepRunShape(copiedOldDiscovery), /predates the sweep start/i);
const lateSourceCheck = structuredClone(run);
lateSourceCheck.sourceChecks[0].checkedAt = "2026-08-24T00:02:01Z";
assert.throws(() => validateSweepRunShape(lateSourceCheck), /after the sweep completion/i);

const futureBlocker = structuredClone(blockedRun);
futureBlocker.sourceChecks[0].blocker = createBlocker(
  "manual-unavailable",
  "Account remained unavailable.",
  "2026-08-24T00:03:00Z",
);
assert.throws(
  () => finaliseSweepRun(futureBlocker, {
    registry,
    entities,
    evidenceItems: evidence.evidence,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /after the sweep completion/i,
);

const tamperedTarget = structuredClone(run);
tamperedTarget.discoveryChecks[0].url = `${PUBLIC_INDEX_TARGETS[0].url}/tampered`;
assert.equal(
  evaluateSweepCoverage(tamperedTarget, { registry, entities }).pass,
  false,
  "Discovery target metadata cannot be changed after approval.",
);
const prohibitedTarget = structuredClone(run);
prohibitedTarget.discoveryChecks[0].url = "https://x.com/NavyLookout";
assert.throws(() => validateSweepRunShape(prohibitedTarget), /invalid public index URL/i);

const forgedAutomaticResult = structuredClone(run);
Object.assign(forgedAutomaticResult.discoveryChecks[0], {
  outcome: "manual-review-complete",
  httpStatus: 200,
  candidates: [],
});
assert.throws(
  () => validateSweepRunShape(forgedAutomaticResult),
  /inconsistent automatic discovery result/i,
);

const forgedCandidateHash = structuredClone(run);
forgedCandidateHash.discoveryChecks[0].candidates[0].contentHash = "0".repeat(64);
assert.throws(() => validateSweepRunShape(forgedCandidateHash), /invalid discovery candidate/i);

const outsidePublisherCandidate = structuredClone(run);
const outsideUrl = "https://www.gov.uk/government/news/unrelated-host-for-this-target";
outsidePublisherCandidate.discoveryChecks[0].candidates = [{
  url: outsideUrl,
  contentHash: crypto.createHash("sha256").update(outsideUrl).digest("hex"),
}];
assert.equal(
  evaluateSweepCoverage(outsidePublisherCandidate, { registry, entities }).pass,
  false,
  "Discovery candidates must stay within the approved target host and path.",
);

const outsidePublisherPath = structuredClone(run);
const outsidePathUrl = "https://www.royalnavy.mod.uk/about-us";
outsidePublisherPath.discoveryChecks[0].candidates = [{
  url: outsidePathUrl,
  contentHash: crypto.createHash("sha256").update(outsidePathUrl).digest("hex"),
}];
assert.equal(
  evaluateSweepCoverage(outsidePublisherPath, { registry, entities }).pass,
  false,
  "Discovery candidates must match the approved target path pattern.",
);

const invalidEvidence = structuredClone(run);
Object.assign(invalidEvidence.vesselOutcomes[0], {
  outcome: "updated",
  evidenceIds: ["EVID_DOES_NOT_EXIST"],
});
assert.equal(
  evaluateSweepCoverage(invalidEvidence, {
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }).pass,
  false,
  "Updated outcomes must resolve to evidence for the same vessel.",
);

const invalidUnchangedEvidence = structuredClone(run);
invalidUnchangedEvidence.vesselOutcomes[0].evidenceIds = [
  evidence.evidence.find(
    (item) => item.vesselId !== invalidUnchangedEvidence.vesselOutcomes[0].vesselId,
  ).evidenceId,
];
assert.equal(
  evaluateSweepCoverage(invalidUnchangedEvidence, {
    registry,
    entities,
    evidenceItems: evidence.evidence,
  }).pass,
  false,
  "Any supplied outcome evidence must resolve to evidence for the same vessel.",
);

const emptyRun = createSweepRun({
  registry,
  entities,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
  discoveryTargets: [PUBLIC_INDEX_TARGETS[0]],
});
await collectPublicIndexes(emptyRun, {
  registry,
  entities,
  checkedAt,
  targets: [PUBLIC_INDEX_TARGETS[0]],
  fetchImpl: async (url) => response(url, "text/html", "<html><body>No articles</body></html>"),
});
assert.equal(emptyRun.discoveryChecks[0].state, "blocked");
assert.equal(emptyRun.discoveryChecks[0].blocker.type, "parse-empty");

const redirectRun = createSweepRun({
  registry,
  entities,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
  discoveryTargets: [PUBLIC_INDEX_TARGETS[0]],
});
let redirectCalls = 0;
await collectPublicIndexes(redirectRun, {
  registry,
  entities,
  checkedAt,
  targets: [PUBLIC_INDEX_TARGETS[0]],
  fetchImpl: async (url, options) => {
    redirectCalls += 1;
    assert.equal(options.redirect, "manual");
    return {
      ok: false,
      status: 302,
      url,
      headers: { get: (name) => name.toLowerCase() === "location" ? "https://x.com/NavyLookout" : null },
      async text() { return ""; },
    };
  },
});
assert.equal(redirectCalls, 1, "A cross-host redirect must never be followed.");
assert.equal(redirectRun.discoveryChecks[0].blocker.type, "terms-restriction");

const oversizedRun = createSweepRun({
  registry,
  entities,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
  discoveryTargets: [PUBLIC_INDEX_TARGETS[0]],
});
let chunkIndex = 0;
let cancelled = false;
const chunks = [new Uint8Array(1_500_000), new Uint8Array(600_000)];
await collectPublicIndexes(oversizedRun, {
  registry,
  entities,
  checkedAt,
  targets: [PUBLIC_INDEX_TARGETS[0]],
  fetchImpl: async (url) => ({
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") return "text/html";
        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            return chunkIndex < chunks.length
              ? { done: false, value: chunks[chunkIndex++] }
              : { done: true, value: undefined };
          },
          async cancel() { cancelled = true; },
        };
      },
    },
    async text() { throw new Error("Streaming response must not use response.text()."); },
  }),
});
assert.equal(oversizedRun.discoveryChecks[0].blocker.type, "http-error");
assert.equal(cancelled, true, "Oversized chunked responses must be cancelled before full buffering.");

assert.deepEqual(
  validateReleaseSweepGate({ runs: [], datasetDate: "2026-08-23", registry, entities }),
  { required: false, pass: true, runId: null, reasons: [] },
  "The pre-gate baseline remains buildable.",
);

console.log("OSINT sweep coverage and collector tests passed.");

function candidateFor(targetId) {
  return {
    ROYAL_NAVY_NEWS_INDEX: '<a href="https://www.royalnavy.mod.uk/news/2026/august/23/test-item">Item</a>',
    GOVUK_MOD_ATOM: "<feed><entry><link>https://www.gov.uk/government/news/test-item</link></entry></feed>",
    NATO_NEWS_INDEX: '<a href="https://www.nato.int/cps/en/natohq/news_123.htm">Item</a>',
    BABCOCK_NEWS_INDEX: '<a href="https://www.babcockinternational.com/news/test-item/">Item</a>',
    NAVY_LOOKOUT_FEED: "<rss><item><link>https://www.navylookout.com/test-item/</link></item></rss>",
    FORCES_NEWS_NAVY_INDEX: '<a href="https://www.forcesnews.com/services/navy/test-item">Item</a>',
    UK_DEFENCE_JOURNAL_FEED: "<rss><item><link>https://ukdefencejournal.org.uk/test-item/</link></item></rss>",
  }[targetId];
}

function response(url, contentType, body) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") return contentType;
        if (name.toLowerCase() === "content-length") return String(Buffer.byteLength(body));
        return null;
      },
    },
    async text() {
      return body;
    },
  };
}

function read(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
