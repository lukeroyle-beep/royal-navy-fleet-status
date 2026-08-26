import { createOfficialAccountCoverageReport } from "./source-registry.mjs";

export function createPrivateEvidenceHealth({
  registry,
  entities,
  evidenceLog,
  assessmentLog,
  sweepRuns,
  asOf,
}) {
  requireTimestamp(asOf, "Private health time");
  const sources = registry?.sources || [];
  const operations = registry?.operations || [];
  const vessels = entities?.vessels || [];
  const evidence = evidenceLog?.evidence || [];
  const assessments = assessmentLog?.assessments || [];
  const runs = [...(sweepRuns || [])].sort(
    (left, right) => Date.parse(right.startedAt || 0) - Date.parse(left.startedAt || 0),
  );

  if (!sources.length && !vessels.length && !evidence.length && !runs.length) {
    return emptyHealth(asOf);
  }

  const latestRun = runs[0] || null;
  const lastCompleteRun = runs.find((run) => run.complete && run.completedAt) || null;
  const sourceFailures = sourceFailureRows(latestRun);
  const mandatoryIds = new Set(operations.filter((entry) => entry.mandatory).map((entry) => entry.sourceId));
  const checkBySourceId = new Map((latestRun?.sourceChecks || []).map((check) => [check.sourceId, check]));
  const mandatoryNotChecked = [...mandatoryIds]
    .filter((sourceId) => !checkBySourceId.has(sourceId) || checkBySourceId.get(sourceId).state === "pending")
    .sort();
  const accountCoverage = createOfficialAccountCoverageReport(registry, entities, asOf);
  const currentAssessments = currentAssessmentRows(assessmentLog, vessels);
  const staleVessels = currentAssessments
    .filter((assessment) => ["aging", "historical"].includes(assessment.freshness?.state))
    .map((assessment) => ({
      vesselId: assessment.vesselId,
      freshnessState: assessment.freshness.state,
      assessmentId: assessment.assessmentId,
    }))
    .sort((left, right) => left.vesselId.localeCompare(right.vesselId));
  const conflicts = currentAssessments
    .filter((assessment) => (assessment.conflictingEvidenceIds || []).length)
    .map((assessment) => ({
      vesselId: assessment.vesselId,
      assessmentId: assessment.assessmentId,
      conflictingEvidenceCount: assessment.conflictingEvidenceIds.length,
    }))
    .sort((left, right) => left.vesselId.localeCompare(right.vesselId));
  const referencedEvidence = new Set(assessments.flatMap(assessmentEvidenceIds));
  const newReviewItems = evidence
    .filter((item) => !referencedEvidence.has(item.evidenceId))
    .map((item) => ({
      evidenceId: item.evidenceId,
      vesselId: item.vesselId,
      receivedAt: item.retrievedAt,
    }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const coverage = calculatePrivateCoverage({ sources, vessels, evidence });

  const degradedReasons = [
    ...sourceFailures.map((entry) => `${entry.sourceId}: ${entry.blockerType}`),
    ...mandatoryNotChecked.map((sourceId) => `${sourceId}: mandatory source not checked`),
    ...accountCoverage.missingVesselIds.map((vesselId) => `${vesselId}: missing account coverage row`),
    ...accountCoverage.enabledWithoutSource.map((vesselId) => `${vesselId}: enabled account lacks registry source`),
    ...conflicts.map((entry) => `${entry.vesselId}: unresolved contradictory evidence`),
  ];
  const state = healthState({ latestRun, lastCompleteRun, degradedReasons });
  return {
    schemaVersion: "1.0.0",
    generatedAt: asOf,
    state,
    sourceHealth: {
      total: sources.length,
      mandatory: mandatoryIds.size,
      failures: sourceFailures,
      mandatoryNotChecked,
    },
    accountCoverage: {
      missingVesselIds: accountCoverage.missingVesselIds,
      enabledWithoutSource: accountCoverage.enabledWithoutSource,
      unresolvedVesselIds: accountCoverage.unresolved,
    },
    staleVessels,
    conflicts,
    newReviewItems,
    coverage,
    currentRefresh: latestRun
      ? {
          runId: latestRun.runId,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt || null,
          classification: latestRun.result?.classification || (latestRun.complete ? "complete" : "partial"),
          publicationEligible: Boolean(latestRun.complete && latestRun.result?.publicationEligible !== false),
          completedSourceChecks: latestRun.coverage?.completedSourceChecks || 0,
          requiredSourceChecks: latestRun.coverage?.requiredSourceChecks || latestRun.sourceChecks?.length || 0,
        }
      : null,
    lastKnownGood: lastCompleteRun
      ? {
          runId: lastCompleteRun.runId,
          completedAt: lastCompleteRun.completedAt,
          classification: lastCompleteRun.result?.classification || "complete",
        }
      : null,
    degradedReasons: [...new Set(degradedReasons)].sort(),
  };
}

export function calculatePrivateCoverage({ sources, vessels, evidence }) {
  const evidenceByVessel = new Map();
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const familyCounts = new Map();
  for (const item of evidence) {
    evidenceByVessel.set(item.vesselId, (evidenceByVessel.get(item.vesselId) || 0) + 1);
    const family = sourceById.get(item.sourceId)?.category || "unknown";
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }
  return {
    byVessel: vessels
      .map((vessel) => ({
        vesselId: vessel.vesselId,
        evidenceCount: evidenceByVessel.get(vessel.vesselId) || 0,
      }))
      .sort((left, right) => left.vesselId.localeCompare(right.vesselId)),
    bySourceFamily: [...familyCounts]
      .map(([family, evidenceCount]) => ({ family, evidenceCount }))
      .sort((left, right) => left.family.localeCompare(right.family)),
  };
}

function currentAssessmentRows(log, vessels) {
  const byId = new Map((log?.assessments || []).map((assessment) => [assessment.assessmentId, assessment]));
  return vessels.flatMap((vessel) => {
    const assessment = byId.get(log?.currentAssessmentIds?.[vessel.vesselId]);
    return assessment ? [assessment] : [];
  });
}

function sourceFailureRows(run) {
  return [...(run?.sourceChecks || []), ...(run?.discoveryChecks || [])]
    .filter((check) => check.state === "blocked")
    .map((check) => ({
      sourceId: check.sourceId || check.targetId,
      blockerType: check.blocker?.type || "unknown",
      at: check.blocker?.at || null,
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function healthState({ latestRun, lastCompleteRun, degradedReasons }) {
  if (latestRun?.result?.classification === "failed") return "failed";
  if (degradedReasons.length || latestRun?.result?.classification === "degraded") return "degraded";
  if (!latestRun || !latestRun.complete) return "partial";
  if (!lastCompleteRun) return "partial";
  return "healthy";
}

function assessmentEvidenceIds(assessment) {
  return [
    ...(assessment.selectedEvidenceIds || []),
    ...(assessment.excludedEvidenceIds || []),
    ...(assessment.conflictingEvidenceIds || []),
  ];
}

function emptyHealth(asOf) {
  return {
    schemaVersion: "1.0.0",
    generatedAt: asOf,
    state: "empty",
    sourceHealth: { total: 0, mandatory: 0, failures: [], mandatoryNotChecked: [] },
    accountCoverage: { missingVesselIds: [], enabledWithoutSource: [], unresolvedVesselIds: [] },
    staleVessels: [],
    conflicts: [],
    newReviewItems: [],
    coverage: { byVessel: [], bySourceFamily: [] },
    currentRefresh: null,
    lastKnownGood: null,
    degradedReasons: [],
  };
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
