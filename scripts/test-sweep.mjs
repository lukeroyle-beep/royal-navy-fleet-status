import assert from "node:assert/strict";
import crypto from "node:crypto";

import { collectPublicIndexes } from "./lib/public-index-collector.mjs";
import {
  PUBLIC_INDEX_TARGETS,
  classifySweepResult,
  completeSweepIntegrityCheck,
  computeReleaseContentHash,
  createBlocker,
  createSweepRun,
  evaluateSweepCoverage,
  evaluateStoredSweepCoverage,
  finaliseSweepRun,
  findLateDiscoveredCandidates,
  findSourceFamilyVolumeAnomalies,
  isRequiredRecurringSource,
  sweepWindowStartFromMetadata,
  validateReleaseSweepGate,
  validateSweepBaselineAgainstState,
  validateSweepRunShape,
} from "./lib/sweep.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidence = privateInputs.readJson("evidence");
const assessments = privateInputs.readJson("assessments");
const releaseEntities = structuredClone(entities);
Object.assign(releaseEntities.metadata, {
  asOfDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: "2026-08-24T00:03:00Z",
});
const correctionEntities = structuredClone(releaseEntities);
Object.assign(correctionEntities.metadata, {
  releaseRevision: 2,
  releasedAt: "2026-08-24T00:06:00Z",
});
const currentReleaseContentHash = computeReleaseContentHash({
  entities: releaseEntities,
  registry,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
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
assert.throws(
  () => createSweepRun({
    registry,
    entities,
    assessmentLog: assessments,
    startedAt,
    windowStart: "2026-08-23T00:00:01Z",
  }),
  /does not cover the authenticated prior release date/i,
  "A caller cannot shorten the sweep below the prior release-date boundary.",
);
const run = createSweepRun({
  registry,
  entities,
  assessmentLog: assessments,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
});

assert.equal(run.vesselOutcomes.length, 68, "Every current vessel requires an explicit outcome.");
assert.deepEqual(run.releaseTarget, { asOfDate: "2026-08-24", releaseRevision: 1 });
assert.deepEqual(
  run.coverageInputs.rosterIds,
  entities.vessels.map((vessel) => vessel.vesselId).sort(),
  "Gate-effective runs must capture their immutable roster input.",
);
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
assert.equal(
  PUBLIC_INDEX_TARGETS.find((target) => target.targetId === "WESTWARD_SHIPPING_NEWS_FEED")
    ?.termsReviewedAt,
  "2026-08-24",
  "A new automatic target must carry its own approval date.",
);
assert.equal(
  PUBLIC_INDEX_TARGETS.some((target) => target.targetId === "ROYAL_NAVY_NEWS_INDEX"),
  false,
  "The Royal Navy index must not remain in the automatic collector after repeated HTTP 403s.",
);
assert.ok(
  run.sourceChecks.some((check) => check.sourceId === "ROYAL_NAVY_NEWS_INDEX"),
  "Royal Navy News must remain a mandatory recurring manual review.",
);
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
  assessmentLog: assessments,
  startedAt,
  windowStart: "2026-08-17T00:00:00Z",
  discoveryTargets: [PUBLIC_INDEX_TARGETS[0]],
});
await collectPublicIndexes(overlappingRun, {
  registry: overlappingRegistry,
  entities,
  checkedAt,
  targets: [PUBLIC_INDEX_TARGETS[0]],
  fetchImpl: async (url) =>
    response(url, "application/rss+xml", candidateFor(PUBLIC_INDEX_TARGETS[0].targetId)),
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
  const baseline = run.coverageInputs.baselineProjectionVessels.find(
    (entry) => entry.id === vessel.vesselId,
  );
  Object.assign(vessel, {
    state: "complete",
    reviewedAt: checkedAt,
    outcome:
      baseline.locationClassification === "unknown"
        ? "unknown-retained"
        : baseline.locationClassification === "withheld"
          ? "withheld-policy"
          : "unchanged",
    notes: "No newer supportable public location identified.",
    blocker: null,
  });
}
finaliseSweepRun(run, {
  registry,
  entities: releaseEntities,
  assessmentLog: assessments,
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
assert.equal(
  evaluateStoredSweepCoverage(run, { evidenceItems: evidence.evidence }).pass,
  true,
  "A stored sweep must remain valid against its captured inputs after the live registry changes.",
);
const tamperedCapturedInputs = structuredClone(run);
tamperedCapturedInputs.coverageInputs.recurringSources[0].canonicalUrl =
  "https://example.invalid/tampered-captured-source";
assert.throws(
  () => validateSweepRunShape(tamperedCapturedInputs),
  /captured inputs.*registry hash/i,
  "Captured coverage inputs must remain bound to their stored hash.",
);
assert.deepEqual(
  validateReleaseSweepGate({
    runs: [run],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T00:03:00Z",
    registry,
    entities: releaseEntities,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
  }),
  { required: true, pass: true, runId: run.runId, reasons: [] },
);
assert.equal(
  validateSweepBaselineAgainstState(run, { entities, assessmentLog: assessments }),
  run,
  "The captured baseline must match the authenticated pre-change state.",
);
const forgedBaseline = structuredClone(run);
forgedBaseline.coverageInputs.baselineProjectionVessels[0].lastReportedLocation += " (forged)";
forgedBaseline.baselineStateHash = crypto
  .createHash("sha256")
  .update(stableJsonForTest({
    baselineAssessmentIds: forgedBaseline.coverageInputs.baselineAssessmentIds,
    baselineAssessments: forgedBaseline.coverageInputs.baselineAssessments,
    baselineProjectionVessels: forgedBaseline.coverageInputs.baselineProjectionVessels,
    baselineReleaseMetadata: forgedBaseline.coverageInputs.baselineReleaseMetadata,
  }))
  .digest("hex");
assert.equal(validateSweepRunShape(forgedBaseline), forgedBaseline);
assert.throws(
  () => validateSweepBaselineAgainstState(forgedBaseline, { entities, assessmentLog: assessments }),
  /authenticated pre-change state/i,
  "A self-consistent but forged baseline must fail comparison with the PR base state.",
);
const forgedReleaseBaseline = structuredClone(run);
forgedReleaseBaseline.window.from = "2026-08-23T23:59:00Z";
forgedReleaseBaseline.coverageInputs.baselineReleaseMetadata = {
  asOfDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: null,
};
forgedReleaseBaseline.baselineStateHash = crypto
  .createHash("sha256")
  .update(stableJsonForTest({
    baselineAssessmentIds: forgedReleaseBaseline.coverageInputs.baselineAssessmentIds,
    baselineAssessments: forgedReleaseBaseline.coverageInputs.baselineAssessments,
    baselineProjectionVessels: forgedReleaseBaseline.coverageInputs.baselineProjectionVessels,
    baselineReleaseMetadata: forgedReleaseBaseline.coverageInputs.baselineReleaseMetadata,
  }))
  .digest("hex");
assert.equal(validateSweepRunShape(forgedReleaseBaseline), forgedReleaseBaseline);
assert.throws(
  () => validateSweepBaselineAgainstState(forgedReleaseBaseline, {
    entities,
    assessmentLog: assessments,
  }),
  /authenticated pre-change state/i,
  "A forged prior-release date cannot legitimise a shortened sweep window.",
);

const unrelatedEvidence = structuredClone(evidence.evidence[0]);
unrelatedEvidence.evidenceId = "EVID_UNRELATED_AFTER_FINALISATION";
assert.equal(
  computeReleaseContentHash({
    entities: releaseEntities,
    registry: registryWithOneOff,
    assessmentLog: assessments,
    evidenceItems: [...evidence.evidence, unrelatedEvidence],
  }),
  currentReleaseContentHash,
  "Unreferenced historical evidence and sources must not perturb the current release seal.",
);

const firstVesselId = run.vesselOutcomes[0].vesselId;
const firstAssessmentId = assessments.currentAssessmentIds[firstVesselId];
const changedAssessments = structuredClone(assessments);
changedAssessments.assessments.find(
  (assessment) => assessment.assessmentId === firstAssessmentId,
).analystNotes = "Changed after sweep finalisation.";
assert.notEqual(
  computeReleaseContentHash({
    entities: releaseEntities,
    registry,
    assessmentLog: changedAssessments,
    evidenceItems: evidence.evidence,
  }),
  currentReleaseContentHash,
  "A current assessment-body change must alter the release seal.",
);
const changedContentGate = validateReleaseSweepGate({
  runs: [run],
  datasetDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: "2026-08-24T00:03:00Z",
  registry,
  entities: releaseEntities,
  assessmentLog: changedAssessments,
  evidenceItems: evidence.evidence,
});
assert.equal(changedContentGate.pass, false);
assert.ok(
  changedContentGate.reasons.some(
    (reason) => /current release content|modified in place/i.test(reason),
  ),
  "Post-finalisation provenance or projection input changes must invalidate the release gate.",
);

assert.throws(
  () => finaliseSweepRun(run, {
    registry,
    entities: releaseEntities,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /already finalised/i,
  "A completed run must be immutable and cannot be re-finalised.",
);

const tamperedStoredBinding = structuredClone(run);
tamperedStoredBinding.vesselOutcomes[0].assessmentId = "ASSESS_FORGED_BINDING";
const tamperedBindingGate = validateReleaseSweepGate({
  runs: [tamperedStoredBinding],
  datasetDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: "2026-08-24T00:03:00Z",
  registry,
  entities: releaseEntities,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
assert.equal(tamperedBindingGate.pass, false);
assert.ok(
  tamperedBindingGate.reasons.some((reason) => /stored assessment binding/i.test(reason)),
  "CI must re-derive stored outcome bindings rather than trust the finalised JSON.",
);

const sameIdMutationRun = reopenClone(run);
assert.throws(
  () => finaliseSweepRun(sameIdMutationRun, {
    registry,
    entities: releaseEntities,
    assessmentLog: changedAssessments,
    evidenceItems: evidence.evidence,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /modified in place/i,
  "A current assessment body cannot be changed under its baseline ID.",
);

const revisedAssessments = structuredClone(assessments);
const previousAssessment = revisedAssessments.assessments.find(
  (assessment) => assessment.assessmentId === firstAssessmentId,
);
const revisedAssessment = structuredClone(previousAssessment);
revisedAssessment.assessmentId = `${firstAssessmentId}_SWEEP_TEST`;
revisedAssessment.assessedAt = "2026-08-24T00:00:30Z";
revisedAssessment.previousAssessmentId = firstAssessmentId;
revisedAssessment.assessedState.lastReportedLocation += "; revised during sweep";
revisedAssessments.assessments.push(revisedAssessment);
revisedAssessments.currentAssessmentIds[firstVesselId] = revisedAssessment.assessmentId;

const staleOutcomeRun = reopenClone(run);
assert.throws(
  () => finaliseSweepRun(staleOutcomeRun, {
    registry,
    entities: releaseEntities,
    assessmentLog: revisedAssessments,
    evidenceItems: evidence.evidence,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /does not match derived updated/i,
  "A changed public state cannot retain an unchanged vessel outcome.",
);

const validChangedRun = reopenClone(run);
Object.assign(validChangedRun.vesselOutcomes.find((outcome) => outcome.vesselId === firstVesselId), {
  outcome: "updated",
  evidenceIds: [...revisedAssessment.selectedEvidenceIds],
});
finaliseSweepRun(validChangedRun, {
  registry,
  entities: releaseEntities,
  assessmentLog: revisedAssessments,
  evidenceItems: evidence.evidence,
  completedAt: "2026-08-24T00:02:00Z",
});
assert.equal(
  validateReleaseSweepGate({
    runs: [validChangedRun],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T00:03:00Z",
    registry,
    entities: releaseEntities,
    assessmentLog: revisedAssessments,
    evidenceItems: evidence.evidence,
  }).pass,
  true,
  "A newly assessed, reviewed and evidence-bound state change must pass the gate.",
);

const lateAssessmentLog = structuredClone(revisedAssessments);
lateAssessmentLog.assessments.find(
  (assessment) => assessment.assessmentId === revisedAssessment.assessmentId,
).assessedAt = "2026-08-24T00:01:30Z";
const lateAssessmentRun = reopenClone(run);
Object.assign(lateAssessmentRun.vesselOutcomes.find((outcome) => outcome.vesselId === firstVesselId), {
  outcome: "updated",
  evidenceIds: [...revisedAssessment.selectedEvidenceIds],
});
assert.throws(
  () => finaliseSweepRun(lateAssessmentRun, {
    registry,
    entities: releaseEntities,
    assessmentLog: lateAssessmentLog,
    evidenceItems: evidence.evidence,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /outside the reviewed sweep interval/i,
  "An assessment created after its vessel review cannot be retrospectively bound.",
);

const futureEvidenceItems = structuredClone(evidence.evidence);
futureEvidenceItems.find(
  (item) => item.evidenceId === revisedAssessment.selectedEvidenceIds[0],
).retrievedAt = "2026-08-24T00:00:45Z";
const futureEvidenceRun = reopenClone(run);
Object.assign(futureEvidenceRun.vesselOutcomes.find((outcome) => outcome.vesselId === firstVesselId), {
  outcome: "updated",
  evidenceIds: [...revisedAssessment.selectedEvidenceIds],
});
assert.throws(
  () => finaliseSweepRun(futureEvidenceRun, {
    registry,
    entities: releaseEntities,
    assessmentLog: revisedAssessments,
    evidenceItems: futureEvidenceItems,
    completedAt: "2026-08-24T00:02:00Z",
  }),
  /postdates its assessment or review/i,
  "Selected evidence cannot be retrieved after the assessment it supposedly supports.",
);

const laterIncomplete = createSweepRun({
  registry,
  entities,
  assessmentLog: assessments,
  startedAt: "2026-08-24T12:00:00Z",
  windowStart: "2026-08-23T00:00:00Z",
});
const releaseEntitiesAtThirteen = structuredClone(releaseEntities);
releaseEntitiesAtThirteen.metadata.releasedAt = "2026-08-24T13:00:00Z";
const incompleteGate = validateReleaseSweepGate({
  runs: [run, laterIncomplete],
  datasetDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: "2026-08-24T13:00:00Z",
  registry,
  entities: releaseEntitiesAtThirteen,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
assert.equal(
  incompleteGate.runId,
  run.runId,
  "A later incomplete attempt must not mask an earlier qualifying finalised sweep.",
);

const postReleaseRerun = reopenClone(run);
postReleaseRerun.runId = `SWEEP_20260824T120000Z_R1_${run.sourceRegistryHash.slice(0, 8)}`;
postReleaseRerun.startedAt = "2026-08-24T12:00:00Z";
postReleaseRerun.window.to = postReleaseRerun.startedAt;
for (const check of [...postReleaseRerun.discoveryChecks, ...postReleaseRerun.sourceChecks]) {
  check.checkedAt = "2026-08-24T12:01:00Z";
}
for (const outcome of postReleaseRerun.vesselOutcomes) {
  outcome.reviewedAt = "2026-08-24T12:01:00Z";
}
finaliseSweepRun(postReleaseRerun, {
  registry,
  entities: releaseEntities,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
  completedAt: "2026-08-24T12:02:00Z",
});
const releaseEntitiesAtRerunCutoff = structuredClone(releaseEntities);
releaseEntitiesAtRerunCutoff.metadata.releasedAt = "2026-08-24T12:01:30Z";
assert.equal(
  validateReleaseSweepGate({
    runs: [run, postReleaseRerun],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T12:01:30Z",
    registry,
    entities: releaseEntitiesAtRerunCutoff,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
  }).runId,
  run.runId,
  "A post-release rerun must not mask an earlier pre-release authorising sweep.",
);

const invalidCompletedRerun = structuredClone(postReleaseRerun);
invalidCompletedRerun.releaseContentHash = "0".repeat(64);
const invalidCompletedGate = validateReleaseSweepGate({
  runs: [run, invalidCompletedRerun],
  datasetDate: "2026-08-24",
  releaseRevision: 1,
  releasedAt: "2026-08-24T13:00:00Z",
  registry,
  entities: releaseEntitiesAtThirteen,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
assert.equal(invalidCompletedGate.pass, false);
assert.ok(
  invalidCompletedGate.reasons.some((reason) => /current release content/i.test(reason)),
  "A newer completed pre-release run must remain authoritative when its seal is invalid.",
);

assert.equal(
  validateReleaseSweepGate({
    runs: [run],
    datasetDate: "2026-08-24",
    releaseRevision: 2,
    releasedAt: "2026-08-24T00:06:00Z",
    registry,
    entities: correctionEntities,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
  }).pass,
  false,
  "A correction release cannot reuse the revision 1 sweep.",
);
const correctionRun = reopenClone(run);
correctionRun.runId = `SWEEP_20260824T000300Z_R2_${run.sourceRegistryHash.slice(0, 8)}`;
correctionRun.releaseTarget.releaseRevision = 2;
correctionRun.startedAt = "2026-08-24T00:03:00Z";
correctionRun.window.to = correctionRun.startedAt;
for (const check of [...correctionRun.discoveryChecks, ...correctionRun.sourceChecks]) {
  check.checkedAt = "2026-08-24T00:04:00Z";
}
for (const outcome of correctionRun.vesselOutcomes) {
  outcome.reviewedAt = "2026-08-24T00:04:00Z";
}
finaliseSweepRun(correctionRun, {
  registry,
  entities: correctionEntities,
  assessmentLog: assessments,
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
    entities: correctionEntities,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
  }).pass,
  true,
);
const prematureCorrectionEntities = structuredClone(correctionEntities);
prematureCorrectionEntities.metadata.releasedAt = "2026-08-24T00:04:30Z";
const prematureCorrection = validateReleaseSweepGate({
  runs: [run, correctionRun],
  datasetDate: "2026-08-24",
  releaseRevision: 2,
  releasedAt: "2026-08-24T00:04:30Z",
  registry,
  entities: prematureCorrectionEntities,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
});
assert.equal(prematureCorrection.pass, false);
assert.ok(prematureCorrection.reasons.some((reason) => /finalised.*eligible at release/i.test(reason)));
assert.throws(
  () => validateReleaseSweepGate({
    runs: [run],
    datasetDate: "2026-08-24",
    releaseRevision: 1,
    releasedAt: "2026-08-24T00:04:30Z",
    registry,
    entities: releaseEntities,
    assessmentLog: assessments,
    evidenceItems: evidence.evidence,
  }),
  /identity does not match/i,
  "The gate must bind the exact canonical date, revision and release instant.",
);

const missingVessel = structuredClone(run);
missingVessel.vesselOutcomes.pop();
missingVessel.complete = false;
missingVessel.completedAt = null;
const missingCoverage = evaluateSweepCoverage(missingVessel, { registry, entities });
assert.equal(missingCoverage.pass, false);
assert.ok(missingCoverage.reasons.some((reason) => /vessel outcomes do not match/i.test(reason)));

const blockedRun = reopenClone(run);
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

const missingCapturedInputs = structuredClone(run);
delete missingCapturedInputs.coverageInputs;
assert.throws(
  () => validateSweepRunShape(missingCapturedInputs),
  /must capture the registry.*roster inputs/i,
  "Gate-effective sweep records must be self-contained.",
);

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
    entities: releaseEntities,
    assessmentLog: assessments,
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
  assessmentLog: assessments,
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
  assessmentLog: assessments,
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
  assessmentLog: assessments,
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

const completenessRun = createSweepRun({
  registry,
  entities,
  assessmentLog: assessments,
  startedAt: "2026-08-26T00:00:00Z",
  windowStart: "2026-08-23T00:00:00Z",
});
assert.equal(completenessRun.integrityChecks.length, 6);
assert.equal(classifySweepResult(completenessRun).classification, "partial");
await collectPublicIndexes(completenessRun, {
  registry,
  entities,
  checkedAt: "2026-08-26T00:01:00Z",
  fetchImpl: async (url) => {
    const target = PUBLIC_INDEX_TARGETS.find((entry) => entry.url === url);
    return response(
      url,
      target.contentKind === "feed" ? "application/rss+xml" : "text/html",
      candidateFor(target.targetId),
    );
  },
});
for (const sourceCheck of completenessRun.sourceChecks) {
  Object.assign(sourceCheck, {
    state: "complete",
    checkedAt: "2026-08-26T00:01:00Z",
    outcome: "manual-review-complete",
    notes: "Mandatory source reviewed; access and result recorded.",
    blocker: null,
  });
}
for (const vessel of completenessRun.vesselOutcomes) {
  const baseline = completenessRun.coverageInputs.baselineProjectionVessels.find(
    (entry) => entry.id === vessel.vesselId,
  );
  Object.assign(vessel, {
    state: "complete",
    reviewedAt: "2026-08-26T00:01:00Z",
    outcome:
      baseline.locationClassification === "unknown"
        ? "unknown-retained"
        : baseline.locationClassification === "withheld"
          ? "withheld-policy"
          : "unchanged",
    notes: "No newer supportable change identified.",
    blocker: null,
  });
}
for (const check of completenessRun.integrityChecks) {
  completeSweepIntegrityCheck(completenessRun, check.checkId, {
    checkedAt: "2026-08-26T00:01:30Z",
    outcome: check.checkId.includes("reconciliation") ? "reconciled" : "reviewed-no-anomaly",
    notes: "Fixture review completed with no unresolved publication blocker.",
  });
}
const releaseEntities26 = structuredClone(entities);
Object.assign(releaseEntities26.metadata, {
  asOfDate: "2026-08-26",
  releaseRevision: 1,
  releasedAt: "2026-08-26T00:03:00Z",
});
finaliseSweepRun(completenessRun, {
  registry,
  entities: releaseEntities26,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
  completedAt: "2026-08-26T00:02:00Z",
});
assert.equal(completenessRun.result.classification, "complete-no-supported-changes");
assert.equal(completenessRun.result.publicationEligible, true);
const changedClassificationRun = structuredClone(completenessRun);
changedClassificationRun.vesselOutcomes[0].outcome = "updated";
assert.equal(
  classifySweepResult(changedClassificationRun, { pass: true, reasons: [] }).classification,
  "complete-with-changes",
);
const degradedRun = reopenClone(completenessRun);
Object.assign(degradedRun.sourceChecks[0], {
  state: "blocked",
  checkedAt: null,
  outcome: null,
  blocker: createBlocker("manual-unavailable", "Mandatory source unavailable.", "2026-08-26T00:01:00Z"),
});
degradedRun.coverage = evaluateSweepCoverage(degradedRun, {
  registry,
  entities,
});
assert.equal(classifySweepResult(degradedRun).classification, "degraded");
assert.equal(classifySweepResult(degradedRun).publicationEligible, false);
const failedRun = reopenClone(completenessRun);
for (const entry of [
  ...failedRun.discoveryChecks.filter((item) => item.required),
  ...failedRun.sourceChecks.filter((item) => item.required),
  ...failedRun.integrityChecks.filter((item) => item.required),
]) {
  Object.assign(entry, {
    state: "blocked",
    checkedAt: null,
    outcome: null,
    blocker: createBlocker("manual-unavailable", "Required check unavailable.", "2026-08-26T00:01:00Z"),
  });
}
const failedCoverage = evaluateSweepCoverage(failedRun, { registry, entities });
assert.equal(classifySweepResult(failedRun, failedCoverage).classification, "failed");
assert.equal(classifySweepResult(failedRun, failedCoverage).publicationEligible, false);

assert.deepEqual(
  findSourceFamilyVolumeAnomalies(
    { official: 1, media: 8 },
    { official: 10, media: 8 },
  ).map((entry) => entry.family),
  ["official"],
);
assert.deepEqual(
  findLateDiscoveredCandidates([
    {
      candidateId: "late-before-cutoff",
      publishedAt: "2026-08-25T22:00:00Z",
      receivedAt: "2026-08-26T01:00:00Z",
    },
    {
      candidateId: "new-after-cutoff",
      publishedAt: "2026-08-26T00:30:00Z",
      receivedAt: "2026-08-26T01:00:00Z",
    },
  ], "2026-08-26T00:00:00Z"),
  ["late-before-cutoff"],
);

console.log("OSINT sweep coverage and collector tests passed.");

function candidateFor(targetId) {
  return {
    WESTWARD_SHIPPING_NEWS_FEED:
      "<rss><item><link>https://westwardshippingnews.com/test-item/</link></item></rss>",
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

function reopenClone(completedRun) {
  const clone = structuredClone(completedRun);
  clone.complete = false;
  clone.completedAt = null;
  clone.releaseContentHash = null;
  for (const outcome of clone.vesselOutcomes) outcome.assessmentId = null;
  return clone;
}

function stableJsonForTest(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonForTest).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonForTest(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
