import assert from 'node:assert/strict';
import { digest } from './lib/acquisition.mjs';
import { adjudicationQueue, preprocessingBaseline, preprocessEvidence } from './lib/sweep-analysis.mjs';
import { evidenceReasoning, buildReviewPlan } from './lib/review-routing.mjs';
import { summarizeSessionUsage, aggregateSessionUsage } from './lib/sweep-usage-report.mjs';

const candidate = { evidenceId: 'fixture-one', vesselId: null, candidateVesselIds: [], priority: 1,
  reasons: ['event-time-unknown', 'entity-unresolved-or-ambiguous', 'claim-requires-review'],
  status: null, location: null, claim: 'An unresolved public activity update.', canonicalUrl: 'https://example.invalid/one',
  publicationEligible: false, contentHash: 'a'.repeat(64) };
assert.equal(evidenceReasoning(candidate).effort, 'medium');
for (const reason of ['protected-activity-review', 'conflicting-evidence', 'historical-content-revised',
  'retrospective-or-outside-window', 'state-transition', 'location-change', 'future-new-reason']) {
  assert.equal(evidenceReasoning({ ...candidate, reasons: [reason] }).effort, 'xhigh');
}
assert.equal(evidenceReasoning({ ...candidate, status: 'Deployed' }).effort, 'xhigh');
assert.equal(evidenceReasoning({ ...candidate, location: 'Fixture Port' }).effort, 'xhigh');
assert.equal(evidenceReasoning(candidate, true).effort, 'xhigh');
assert.equal(evidenceReasoning({ ...candidate, triageAudit: {} }).effort, 'medium');
const conflicting = ['Fixture Port A', 'Fixture Port B'].map((location, i) => ({ ...candidate, evidenceId: `conflict-${i}`, vesselId: 'fixture', location }));
assert.ok(adjudicationQueue(conflicting).items.every(i => i.reasoning.effort === 'xhigh'));
const vessels=[{vesselId:'fixture',name:'HMS Fixture'}];
const assessmentLog={assessments:[{assessmentId:'old',vesselId:'fixture',assessedState:{status:'Available',publicLocation:{label:'Fixture Port'}},selectedEvidenceIds:['e'],excludedEvidenceIds:[],conflictingEvidenceIds:[]},
  {assessmentId:'new',vesselId:'fixture',assessedState:{status:'In re-fit',publicLocation:{label:'Later Port'}},selectedEvidenceIds:[]}],currentAssessmentIds:{fixture:'new'}};
const baselineInput={vessels,assessmentLog,evidenceItems:[{evidenceId:'e',vesselId:'fixture',contentHash:'a'.repeat(64)}],run:{coverageInputs:{baselineAssessmentIds:{fixture:'old'}}}};
const baseline=preprocessingBaseline(baselineInput);
assert.equal(baseline.current[0].status,'Available');assert.deepEqual(baseline.locations,['Fixture Port']);assert.equal(baseline.retainedEvidence.length,1);
assert.throws(()=>preprocessingBaseline({...baselineInput,run:{coverageInputs:{baselineAssessmentIds:{fixture:'missing'}}}}),/BASELINE_INVALID/);
assert.equal(preprocessingBaseline({...baselineInput,evidenceItems:[{...baselineInput.evidenceItems[0],supersededBy:'new'}]}).retainedEvidence.length,0);
const extracted=preprocessEvidence([{id:'post',url:'https://example.invalid/post',text:'HMS Fixture deployed from Fixture Port on 1 October 2026.',publishedAt:'2026-10-02T00:00:00Z',contentHash:'b'.repeat(64)}],{sourceId:'fixture'},
  {...baseline,vessels,windowStart:'2026-10-01T00:00:00Z',cutoff:'2026-10-03T00:00:00Z'});
assert.equal(extracted[0].location,'Fixture Port');assert.ok(extracted[0].reasons.includes('state-transition'));

const acquisition = { records: [{ candidates: Array.from({ length: 25 }, (_, i) => ({ ...candidate, evidenceId: `fixture-${i}` })) }] };
const before = JSON.stringify(acquisition), original = acquisition.records[0].candidates;
const adjudication = { decisions: [{ evidenceId: original[0].evidenceId, candidateHash: digest(original[0]), outcome: 'accepted',
  reason: 'Previously reviewed exact fixture', reviewer: 'fixture', reviewedAt: '2026-10-01T12:00:00Z' }] };
const plan = buildReviewPlan({ acquisition, adjudication });
assert.equal(plan.candidateCount, 25); assert.equal(plan.retainedDecisions, 1); assert.equal(plan.batches.length, 2);
assert.equal(new Set(plan.batches.flatMap(b => b.items.map(i => i.evidenceId))).size, 24);
assert.ok(plan.items.every(i => i.candidateHash === digest(original.find(c => c.evidenceId === i.evidenceId))));
assert.equal(JSON.stringify(acquisition), before); assert.equal(plan.publicationEligible, false);
const drift = structuredClone(adjudication); drift.decisions[0].candidateHash = 'b'.repeat(64);
assert.equal(buildReviewPlan({ acquisition, adjudication: drift }).retainedDecisions, 0);
assert.equal(buildReviewPlan({ acquisition, adjudication:{...adjudication,pendingCandidateIds:[original[0].evidenceId]} }).retainedDecisions,0);
const conflictAcquisition={records:[{candidates:conflicting}]};
const conflictDecisions={decisions:conflicting.map(c=>({...adjudication.decisions[0],evidenceId:c.evidenceId,candidateHash:digest(c)}))};
assert.equal(buildReviewPlan({acquisition:conflictAcquisition,adjudication:conflictDecisions}).retainedDecisions,0);
assert.throws(() => buildReviewPlan({ acquisition: { records: [{ candidates: [candidate, candidate] }] } }), /ID_INVALID/);
assert.throws(() => buildReviewPlan({ acquisition, adjudication: { decisions: [...adjudication.decisions, ...adjudication.decisions] } }), /DECISION_ID/);
assert.throws(() => buildReviewPlan({ acquisition, maxChars: 0 }), /INPUT_INVALID/);
const oversized = { records: [{ candidates: [{ ...candidate, claim: 'x'.repeat(20000) }] }] };
assert.throws(() => buildReviewPlan({ acquisition: oversized }), /EXCEEDS_BATCH/);

const usage = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output });
const event = (at, total, last) => ({ type: 'event_msg', timestamp: at, payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last, model_context_window: 258400 } } });
const first = event('2026-10-03T12:00:01Z', usage(38000, 20000, 100), usage(38000, 20000, 100));
const second = event('2026-10-03T12:00:03Z', usage(80000, 60000, 200), usage(42000, 40000, 100));
const records = [{ type: 'session_meta', payload: { id: 'fixture-thread' } }, first, first, second];
const report = summarizeSessionUsage(records, { threadId: 'fixture-thread', phases: [{ name: 'startup', from: '2026-10-03T12:00:00Z', to: '2026-10-03T12:00:02Z' }] });
assert.equal(report.responses, 2); assert.equal(report.total_tokens, 80200); assert.equal(report.uncached_input_tokens, 20000);
assert.equal(report.firstInputTokens, 38000); assert.equal(report.peakInputTokens, 42000); assert.equal(report.contextCapacityTokens, 258400);
assert.equal(report.phases.startup.total_tokens, 38100); assert.equal(report.phases.unassigned.total_tokens, 42100);
assert.throws(() => summarizeSessionUsage(records, { threadId: 'other' }), /ID_MISMATCH/);
assert.throws(() => summarizeSessionUsage([records[0], second], { threadId: 'fixture-thread' }), /EVENTS_MISSING/);
assert.throws(() => summarizeSessionUsage([...records, event('2026-10-03T12:00:05Z', usage(1,0,0), usage(1,0,0))], { threadId: 'fixture-thread' }), /RESET/);
assert.throws(() => summarizeSessionUsage(records, { threadId: 'fixture-thread', phases: [{ name:'a', from:'2026-10-03', to:'2026-10-04' }, { name:'b', from:'2026-10-03', to:'2026-10-05' }] }), /PHASES/);
assert.throws(() => aggregateSessionUsage([report, report]), /DUPLICATE/);
const combined = aggregateSessionUsage([report, { ...report, threadId: 'worker' }]);
assert.equal(combined.total_tokens, 160400); assert.equal(combined.responses, 4); assert.equal(combined.accountAllowanceCost, null);
console.log('Sweep efficiency fixtures passed: conservative routing, exact decision reuse, bounded complete batches, unchanged evidence hashes, phase attribution, cache/capacity separation, duplicate/reset/prefix rejection.');
