import { BOOTSTRAP_OUTCOME, validateBootstrapException } from './bootstrap-exception.mjs';
import { findEvidenceContradictions } from './evidence-processing.mjs';
import { digest, SUCCESS, FAILURE } from './acquisition.mjs';

// Existing sealed history is grandfathered. All future sweep releases require a certificate.
export const CERTIFICATE_EFFECTIVE_DATE = '2026-09-09';
export function buildSweepCertificate({ run, acquisition, reconciliation, adjudication, validation, registeredSources, at }) {
  const records = acquisition.records;
  const expected = run.sourceChecks.map(s => s.sourceId);
  const bySource = new Map(records.map(r => [r.sourceId, r]));
  const issues = [];
  if (bySource.size !== records.length) issues.push('duplicate-source-dispositions');
  for (const id of expected) {
    const record = bySource.get(id);
    if (!record) issues.push(`missing-source:${id}`);
    else if (!SUCCESS.has(record.outcome)) issues.push(`mandatory-source-failed:${id}:${record.outcome}`);
  }
  for (const record of records) {
    if (record.outcome === BOOTSTRAP_OUTCOME) {
      try { validateBootstrapException(record.historicalException, { sourceId: record.sourceId, window: record.window });
        if (digest(record.cursor?.historicalGap) !== digest(record.historicalException)) throw new Error('Unbound baseline');
      } catch { issues.push(`invalid-bootstrap-exception:${record.sourceId}`); }
    } else if (record.historicalException) issues.push(`unexpected-bootstrap-exception:${record.sourceId}`);
    if (record.runId !== run.runId || record.registryHash !== run.sourceRegistryHash || record.cutoff !== run.window.to) issues.push(`source-binding:${record.sourceId}`);
    if (!SUCCESS.has(record.outcome) && !FAILURE.has(record.outcome)) issues.push(`invalid-disposition:${record.sourceId}`);
    if (SUCCESS.has(record.outcome) && (!record.cursor || !Array.isArray(record.candidates))) issues.push(`invalid-source-success:${record.sourceId}`);
  }
  const decisions = adjudication.decisions || [];
  const decisionMap = new Map(decisions.map(d => [d.evidenceId, d]));
  if (decisionMap.size !== decisions.length) issues.push('duplicate-adjudication');
  const candidates = records.flatMap(r => r.candidates || []);
  for (const c of candidates) {
    const decision = decisionMap.get(c.evidenceId);
    if (!decision || !['accepted', 'rejected', 'corroboration', 'irrelevant'].includes(decision.outcome) || !decision.reason || !decision.reviewedAt || !decision.reviewer || decision.candidateHash !== digest(c)) issues.push(`adjudication-incomplete:${c.evidenceId}`);
  }
  const detectedConflicts = findEvidenceContradictions(candidates);
  const allConflicts = [...(adjudication.conflicts || [])];
  for (const conflict of detectedConflicts) {
    if (!allConflicts.some(c => digest(c.candidateIds?.slice().sort()) === digest(conflict.candidateIds.slice().sort()))) {
      issues.push('undispositioned-detected-conflict');
      allConflicts.push({ ...conflict, resolution: 'unresolved' });
    }
  }
  const resolvedStates = new Set(['resolved', 'resolved-temporal-progression', 'resolved-source-precedence', 'dismissed-not-material']);
  const unresolved = allConflicts.filter(c => !resolvedStates.has(c.resolution) || !c.reason?.trim() || !Array.isArray(c.evidenceIds) || !c.evidenceIds.length || c.evidenceIds.some(id => typeof id !== 'string' || !id.trim()));
  if (unresolved.length) issues.push('unresolved-conflicts');
  if (reconciliation.records.some(r => r.pass !== true || !Array.isArray(r.issues) || r.issues.length)) issues.push('failed-fleet-reconciliation-record');
  if (!reconciliation.pass || reconciliation.total !== run.vesselOutcomes.length || reconciliation.reconciled !== reconciliation.total || digest(reconciliation.records.map(r=>r.vesselId).sort()) !== digest(run.vesselOutcomes.map(r=>r.vesselId).sort())) issues.push('incomplete-fleet-reconciliation');
  for (const key of ['tests', 'snapshot', 'ledger', 'schema']) {
    if (validation?.[key]?.pass !== true || !validation[key].artifactHash || !validation[key].command || !validation[key].completedAt) issues.push(`validation-missing:${key}`);
  }
  if (!run.complete || !run.releaseContentHash) issues.push('native-sweep-not-sealed');
  const durationMs = Date.parse(at)-Date.parse(run.startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) issues.push('invalid-runtime');
  const count = outcome => records.filter(r => r.outcome === outcome).length;
  const body = {
    schemaVersion: '1.0.0', runId: run.runId, snapshotDate: run.releaseTarget.asOfDate, generatedAt: at,
    sourceRegistryHash: run.sourceRegistryHash, releaseContentHash: run.releaseContentHash,
    registeredSources, mandatorySources: expected.length,
    attemptedMandatorySources: expected.filter(id => bySource.get(id)?.attempts > 0 && bySource.get(id)?.outcome !== 'DEFERRED_WITH_JUSTIFICATION').length,
    successfullyExamined: records.filter(r => SUCCESS.has(r.outcome) && r.outcome !== BOOTSTRAP_OUTCOME).length,
    currentBaselinesWithHistoricalException: records.filter(r => r.outcome === BOOTSTRAP_OUTCOME).length,
    historicalExceptions: records.filter(r => r.historicalException).map(r => ({ sourceId:r.sourceId, ...r.historicalException })),
    unavailable: count('SOURCE_UNAVAILABLE'), rateLimited: count('RATE_LIMITED'), authenticationFailures: count('AUTHENTICATION_FAILURE'),
    retrievalFailures: count('RETRIEVAL_FAILURE'), parsingFailures: count('PARSING_FAILURE'), deferred: count('DEFERRED_WITH_JUSTIFICATION'),
    newItemsExamined: records.reduce((n,r) => n + (r.items?.length || 0),0), candidateEvidenceItems: candidates.length,
    adjudicationItems: candidates.filter(c => c.priority !== 3).length,
    fleetChangesProposed: decisions.filter(d => d.proposedChange).length,
    fleetChangesAccepted: decisions.filter(d => d.proposedChange && d.outcome === 'accepted').length,
    fleetChangesRejected: decisions.filter(d => d.proposedChange && d.outcome === 'rejected').length,
    evidenceConflicts: allConflicts.length, unresolvedConflicts: unresolved.length,
    fleetRecordsReconciled: reconciliation.reconciled, totalFleetRecords: reconciliation.total,
    staleRecordWarnings: reconciliation.staleWarnings, unresolvedIntegrityIssues: [...new Set(issues)],
    runtimeMs: durationMs, timings: acquisition.timings,
    inputHash: digest({ records, reconciliation, adjudication, validation }),
    status: issues.length ? 'FAIL' : 'PASS',
  };
  return { ...body, certificateHash: digest(body) };
}

export function validateSweepCertificate(run) {
  if (run.coverageDate < CERTIFICATE_EFFECTIVE_DATE && !run.sweepCertificate) return;
  const bundle = run.certificateInputs;
  const certificate = run.sweepCertificate;
  if (!certificate || !bundle) throw new Error('Missing sweep certificate or bound inputs');
  const derived = buildSweepCertificate({ run, ...bundle, at: certificate.generatedAt });
  if (derived.status !== 'PASS' || digest(derived) !== digest(certificate)) throw new Error('Invalid or failed sweep certificate');
}
