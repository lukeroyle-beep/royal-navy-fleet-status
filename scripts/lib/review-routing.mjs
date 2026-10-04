import { digest } from './acquisition.mjs';
import { findEvidenceContradictions } from './evidence-processing.mjs';

const deepReasons = new Set(['protected-activity-review', 'conflicting-evidence',
  'state-transition', 'location-change', 'historical-content-revised', 'retrospective-or-outside-window']);
const routineReasons = new Set(['entity-unresolved-or-ambiguous', 'class-reference-requires-entity-review',
  'event-time-unknown', 'claim-requires-review', 'incomplete-source-coverage', 'explicit-candidate-verification-required',
  'exact-retained-reviewed-evidence', 'complete-text-only-greeting-v1']);

// Effort is a review recommendation, never a disposition, source-completion or
// publication decision. Unknown reason codes conservatively retain deep review.
export function evidenceReasoning(candidate, conflicting = false) {
  const reasons = candidate.reasons;
  const deep = conflicting || !Array.isArray(reasons) || reasons.some(r => deepReasons.has(r) || !routineReasons.has(r)) ||
    Boolean(candidate.status || candidate.location) ||
    (candidate.candidateVesselIds?.length > 0 && reasons?.includes('entity-unresolved-or-ambiguous')) ||
    /\b(submarine|ssbn|ssn|deterrent|CASD)\b/i.test(candidate.claim || '') || candidate.classification === 'state-transition' ||
    candidate.classification === 'location-change';
  if (deep) return { model: 'gpt-6-astra', effort: 'xhigh' };
  if (candidate.triageAudit?.ruleId === 'complete-text-only-greeting-v1' &&
      candidate.triageAudit.contentComplete === true && candidate.triageAudit.hasUnexaminedMedia === false) return { effort: 'none', method: 'deterministic-triage' };
  return { model: 'gpt-6-astra', effort: 'medium', method: 'bounded-verification' };
}

export function buildReviewPlan({ acquisition, adjudication = { decisions: [] }, batchSize = 12, maxChars = 18000 }) {
  if (!Array.isArray(acquisition?.records) || !Array.isArray(adjudication?.decisions) ||
      !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 24 ||
      !Number.isInteger(maxChars) || maxChars < 1000 || maxChars > 48000) throw Error('REVIEW_PLAN_INPUT_INVALID');
  const candidates = acquisition.records.flatMap(r => {
    if (!Array.isArray(r.candidates)) throw Error('REVIEW_CANDIDATES_INVALID');
    return r.candidates;
  });
  const ids = new Set();
  for (const c of candidates) {
    if (!c || typeof c.evidenceId !== 'string' || !c.evidenceId || ids.has(c.evidenceId) || !Array.isArray(c.reasons)) throw Error('REVIEW_CANDIDATE_ID_INVALID');
    ids.add(c.evidenceId);
  }
  const decisions = new Map();
  for (const d of adjudication.decisions) {
    if (!d?.evidenceId || decisions.has(d.evidenceId)) throw Error('REVIEW_DECISION_ID_INVALID');
    decisions.set(d.evidenceId, d);
  }
  const conflicts = findEvidenceContradictions(candidates);
  const conflictIds = new Set(conflicts.flatMap(c => c.candidateIds));
  const unresolvedIds = new Set(adjudication.pendingCandidateIds || []);
  for (const conflict of conflicts) {
    const reviewed = (adjudication.conflicts || []).find(c => digest(c.candidateIds?.slice().sort()) === digest(conflict.candidateIds.slice().sort()));
    if (!reviewed || !['resolved', 'resolved-temporal-progression', 'resolved-source-precedence', 'dismissed-not-material'].includes(reviewed.resolution) ||
        !reviewed.reason?.trim() || !Array.isArray(reviewed.evidenceIds) || !reviewed.evidenceIds.length || reviewed.evidenceIds.some(id => typeof id !== 'string' || !id.trim())) {
      for (const id of conflict.candidateIds) unresolvedIds.add(id);
    }
  }
  const items = candidates.map(c => {
    const candidateHash = digest(c), d = decisions.get(c.evidenceId);
    const retained = !unresolvedIds.has(c.evidenceId) && d?.candidateHash === candidateHash && ['accepted', 'rejected', 'corroboration', 'irrelevant'].includes(d.outcome) &&
      typeof d.reason === 'string' && Boolean(d.reason.trim()) && typeof d.reviewer === 'string' && Boolean(d.reviewer.trim()) && Number.isFinite(Date.parse(d.reviewedAt));
    return { evidenceId: c.evidenceId, candidateHash, reasoning: evidenceReasoning(c, conflictIds.has(c.evidenceId)),
      decisionState: retained ? 'retained-exact-decision' : 'review-required',
      ...(retained ? { retainedOutcome: d.outcome } : {}), contentChars: JSON.stringify(c).length };
  });
  const batches = [];
  const rank = { xhigh: 0, medium: 1, none: 2 };
  const pending = items.filter(i => i.decisionState === 'review-required')
    .sort((a,b) => rank[a.reasoning.effort]-rank[b.reasoning.effort] || a.evidenceId.localeCompare(b.evidenceId));
  for (const item of pending) {
    if (item.contentChars > maxChars) throw Error('REVIEW_CANDIDATE_EXCEEDS_BATCH_LIMIT');
    let batch = batches.at(-1);
    if (!batch || batch.effort !== item.reasoning.effort || batch.items.length >= batchSize || batch.contentChars + item.contentChars > maxChars) {
      batch = { index: batches.length, effort: item.reasoning.effort, contentChars: 0, items: [] }; batches.push(batch);
    }
    batch.items.push({ evidenceId: item.evidenceId, candidateHash: item.candidateHash }); batch.contentChars += item.contentChars;
  }
  return { schemaVersion: 1, kind: 'review-routing-only', acquisitionHash: digest(acquisition), adjudicationHash: digest(adjudication),
    candidateCount: items.length, retainedDecisions: items.filter(i => i.decisionState === 'retained-exact-decision').length,
    effortCounts: items.reduce((a, i) => ({ ...a, [i.reasoning.effort]: (a[i.reasoning.effort] || 0) + 1 }), {}),
    items, batches, conflicts, publicationEligible: false,
    instructions: 'Inspect every candidate and its media/date/identity limitations. Keep an individual hash-bound decision. Escalate unresolved or potentially material claims before acceptance; a lower effort is never permission to discard uncertainty. Existing certificate and source-coverage gates remain mandatory.' };
}
