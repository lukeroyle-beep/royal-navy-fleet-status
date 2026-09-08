// Owner corrections are separate from collection: a completed sweep retains its original coverage.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { computeReleaseContentHash } from './sweep.mjs';
import { createPublicProjection, PUBLIC_PROJECTION_METHOD_VERSION } from './public-projection.mjs';

const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const correctionHash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
const equal = (a, b, message) => assert.equal(stable(a), stable(b), message);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const indexed = (rows, key) => {
  const map = new Map(rows.map(row => [row[key], row]));
  assert.equal(map.size, rows.length, `Duplicate ${key}`);
  return map;
};

export function validateReleaseCorrection({ record, baseline, candidate, parentGate, published, histories }) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.kind, 'owner-approved-correction');
  assert.ok(record.authority?.reference?.trim() && record.authority?.instruction?.trim(), 'Owner authority is required');
  assert.equal(record.authority?.actor, 'Luke');
  assert.ok(record.reviewedBy?.trim() && record.reason?.trim(), 'Correction review and reason are required');
  assert.equal(record.newCollectionPerformed, false, 'A correction must not claim a new sweep');
  assert.equal(parentGate.pass, true, 'Parent sweep must pass its original validator');
  assert.equal(parentGate.runId, record.parentRunId, 'Wrong parent sweep');
  assert.equal(record.parentInputsHash, correctionHash(baseline), 'Parent canonical inputs changed');
  equal(published, parentGate.projection, 'Parent inputs do not match the published base');
  equal(record.baselineRelease, baseline.entities.metadata, 'Parent identity changed');
  equal(record.release, candidate.entities.metadata, 'Candidate identity changed');
  const before = baseline.entities.metadata, after = candidate.entities.metadata;
  assert.equal(after.asOfDate, before.asOfDate, 'Correction must retain the baseline evidence date');
  assert.equal(after.releaseRevision, before.releaseRevision + 1, 'Correction must be the next revision');
  equal(omit(after, ['releaseRevision', 'releasedAt']), omit(before, ['releaseRevision', 'releasedAt']), 'Unreviewed metadata change');
  const reviewed = Date.parse(record.reviewedAt), released = Date.parse(after.releasedAt);
  assert.ok(Number.isFinite(reviewed) && Number.isFinite(released) && reviewed >= Date.parse(before.releasedAt) && released >= reviewed && released > Date.parse(before.releasedAt), 'Invalid correction chronology');
  assert.equal(record.projectionMethodVersion, PUBLIC_PROJECTION_METHOD_VERSION, 'Projection semantics changed after review');
  assert.equal(record.candidateInputsHash, correctionHash(candidate), 'Candidate canonical inputs changed after review');
  assert.equal(record.releaseContentHash, computeReleaseContentHash(candidate), 'Candidate content changed after review');
  equal(omit(candidate.entities, ['metadata','vessels']), omit(baseline.entities, ['metadata','vessels']), 'Retired roster or entity schema changed');
  equal(candidate.evidenceItems, baseline.evidenceItems, 'Correction cannot rewrite or invent collected evidence');
  equal(omit(candidate.registry, ['officialSocialCoverage']), omit(baseline.registry, ['officialSocialCoverage']), 'Source registry changed');
  equal(omit(candidate.assessmentLog, ['assessments','currentAssessmentIds']), omit(baseline.assessmentLog, ['assessments','currentAssessmentIds']), 'Assessment schema changed');
  equal(candidate.assessmentLog.assessments.slice(0, baseline.assessmentLog.assessments.length), baseline.assessmentLog.assessments, 'Assessment history must be append-only');

  const changes = indexed(record.changes, 'vesselId');
  assert.ok(changes.size > 0, 'Empty correction');
  const oldEntities = indexed(baseline.entities.vessels, 'vesselId'), newEntities = indexed(candidate.entities.vessels, 'vesselId');
  const oldPublic = indexed(published.vessels, 'id'), newPublic = indexed(createPublicProjection(candidate.entities, candidate.assessmentLog).vessels, 'id');
  const oldAssessments = indexed(baseline.assessmentLog.assessments, 'assessmentId'), newAssessments = indexed(candidate.assessmentLog.assessments, 'assessmentId');
  const oldSocial = indexed(baseline.registry.officialSocialCoverage, 'vesselId'), newSocial = indexed(candidate.registry.officialSocialCoverage, 'vesselId');
  for (const id of oldEntities.keys()) assert.ok(newEntities.has(id), 'Inventory removals require a separate review');
  equal([...newSocial.keys()].sort(), [...newEntities.keys()].sort(), 'Social coverage roster mismatch');
  equal(Object.keys(candidate.assessmentLog.currentAssessmentIds).sort(), [...newEntities.keys()].sort(), 'Assessment roster mismatch');
  for (const [id, entity] of newEntities) {
    const oldId = baseline.assessmentLog.currentAssessmentIds[id], newId = candidate.assessmentLog.currentAssessmentIds[id];
    const change = changes.get(id), assessment = newAssessments.get(newId);
    assert.ok(assessment && assessment.vesselId === id, 'Missing current assessment');
    if (!change) {
      equal(entity, oldEntities.get(id), `${id}: undeclared entity change`);
      equal(newId, oldId, `${id}: undeclared assessment change`);
      equal(newPublic.get(id), oldPublic.get(id), `${id}: undeclared public change`);
      equal(newSocial.get(id), oldSocial.get(id), `${id}: undeclared coverage change`);
      continue;
    }
    assert.equal(change.action, oldEntities.has(id) ? 'update' : 'add');
    assert.equal(change.basis, 'owner-instruction');
    assert.ok(change.rationale?.trim() && change.limitations?.trim(), 'Explicit correction basis and limitations required');
    assert.equal(change.beforeHash, oldPublic.has(id) ? correctionHash(oldPublic.get(id)) : null);
    assert.equal(change.afterHash, correctionHash(newPublic.get(id)));
    assert.equal(change.assessmentId, newId);
    assert.ok(!oldAssessments.has(newId), 'Correction requires a new assessment ID');
    assert.equal(assessment.previousAssessmentId, oldId || null);
    assert.ok(Number.isFinite(Date.parse(assessment.assessedAt)) && Date.parse(assessment.assessedAt) <= reviewed, 'Assessment postdates review');
    assert.equal(assessment.assessor, 'owner-directed-correction');
    assert.equal(assessment.conflictState, 'none', 'Unresolved correction conflict');
    assert.equal(assessment.freshness.state, 'historical', 'Owner instruction cannot manufacture observation freshness');
    if (oldSocial.has(id)) equal(newSocial.get(id), oldSocial.get(id), 'Existing coverage cannot be rewritten');
    else {
      assert.equal(newSocial.get(id)?.searchResult, 'not-reviewed', 'Added vessel must not acquire fabricated social review');
      assert.equal(newSocial.get(id)?.enabled, false);
      assert.equal(newSocial.get(id)?.searchedAt, null);
    }
  }
  for (const id of changes.keys()) assert.ok(newEntities.has(id), 'Unknown correction vessel');
  equal(candidate.assessmentLog.assessments.slice(baseline.assessmentLog.assessments.length).map(a => a.assessmentId).sort(), [...changes.values()].map(c => c.assessmentId).sort(), 'Undeclared assessment append');
  for (const [name, history] of Object.entries(histories)) {
    assert.ok(history.current.startsWith(history.baseline), `${name}: published history changed`);
    const extra = history.current.slice(history.baseline.length).trim().split('\n').filter(Boolean);
    assert.equal(extra.length, 1, `${name}: exactly one correction append required`);
    const row = JSON.parse(extra[0]);
    assert.equal(row.snapshotDate, after.asOfDate);
    assert.equal(row.releaseRevision, after.releaseRevision);
    assert.equal(row.releasedAt, after.releasedAt);
  }
  return { required: true, pass: true, kind: record.kind, correctionId: record.correctionId, parentRunId: parentGate.runId,
    baselineVessels: oldEntities.size, candidateVessels: newEntities.size, reviewedCorrections: changes.size, newCollectionPerformed: false, reasons: [] };
}
