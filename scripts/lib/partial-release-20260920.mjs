import { digest } from './acquisition.mjs';

// Luke approved a partial September 20 release in the Codex recovery thread.
// This validator is deliberately NOT a bypass for the existing release pipeline.
// Integration must additionally validate accepted updates and public disclosure.
export const PARTIAL_RELEASE_POLICY = Object.freeze({
  policyId: 'owner-partial-release-2026-09-20',
  runId: 'SWEEP_20260920T110200208Z_R1_1add15ac',
  cutoff: '2026-09-20T11:02:00.208Z',
  retainedSnapshotDate: '2026-09-12',
  approvalReference: 'codex-owner-partial-release-20260920',
  sourceIds: Object.freeze(['MARINEVESSELTRAFFIC_NATO_DISCOVERY', 'PORTSMOUTH_HARBOUR_AUTHORITY', 'VESSELFINDER_PUBLIC_WEEKLY']),
});

/** Validate a frozen candidate against independently supplied release inputs.
 * baselineRows must already incorporate authenticated subsequent corrections.
 * approvalBinding is an independently stored, reviewed exact-candidate receipt;
 * it must never be constructed from untrusted manifest fields by the caller.
 */
export function validatePartialRelease({manifest, run, baselineRows, candidateRows, acceptedRows, acquisition, approvalBinding}) {
  const fail = message => { throw new Error(`Partial release rejected: ${message}`); };
  const p = PARTIAL_RELEASE_POLICY;
  if (!manifest || !approvalBinding || manifest.policyId !== p.policyId ||
      manifest.approvalReference !== p.approvalReference || run.runId !== p.runId ||
      run.window?.to !== p.cutoff || manifest.retainedSnapshotDate !== p.retainedSnapshotDate) fail('policy binding');
  if (manifest.coverage !== 'partial' || manifest.noChangeClaimAllowed !== false || manifest.newObservationForRetained !== false) fail('misleading coverage');
  for (const [key, value] of Object.entries({runHash:digest(run), baselineHash:digest(baselineRows), candidateHash:digest(candidateRows), acquisitionHash:digest(acquisition), acceptedRowsHash:digest(acceptedRows)})) {
    if (manifest[key] !== value || approvalBinding[key] !== value) fail(key);
  }
  if (approvalBinding.policyId !== p.policyId || approvalBinding.approvalReference !== p.approvalReference ||
      approvalBinding.manifestHash !== digest(manifest)) fail('independent approval receipt');
  const index = (rows, label) => {
    if (!Array.isArray(rows)) fail(label);
    const result = new Map();
    for (const row of rows) {
      if (!row?.vesselId || result.has(row.vesselId)) fail(`${label} duplicate or missing vessel`);
      result.set(row.vesselId, row);
    }
    return result;
  };
  const baseline = index(baselineRows, 'baseline'), candidate = index(candidateRows, 'candidate');
  const accepted = index(acceptedRows, 'accepted');
  if (baseline.size !== 69 || candidate.size !== 69 || [...baseline.keys()].some(id=>!candidate.has(id))) fail('roster mismatch');
  if (!Array.isArray(manifest.retainedVesselIds)) fail('retained partition');
  const retained = new Set(manifest.retainedVesselIds);
  if (!Array.isArray(manifest.retainedVesselIds) || retained.size !== manifest.retainedVesselIds.length) fail('retained partition');
  if (accepted.size + retained.size !== 69) fail('incomplete partition');
  for (const [id, row] of candidate) {
    if (retained.has(id)) {
      if (accepted.has(id) || digest(row) !== digest(baseline.get(id))) fail(`changed carry-forward ${id}`);
    } else {
      const reviewed = accepted.get(id);
      if (!reviewed || reviewed.pass !== true || reviewed.issues?.length !== 0 ||
          reviewed.candidateRowHash !== digest(row) || !Array.isArray(reviewed.evidenceIds) || !reviewed.evidenceIds.length) fail(`unaccepted update ${id}`);
    }
  }
  if ([...accepted.keys()].some(id=>!candidate.has(id)) || [...retained].some(id=>!candidate.has(id))) fail('unknown partition vessel');
  const blocked = manifest.quarantinedSources;
  if (!Array.isArray(blocked) || digest(blocked.map(x=>x.sourceId).sort()) !== digest([...p.sourceIds].sort())) fail('source quarantine scope');
  for (const item of blocked) {
    const record = acquisition.records.find(x=>x.sourceId===item.sourceId);
    if (!record || !['RETRIEVAL_FAILURE','PARSING_FAILURE','DEFERRED_WITH_JUSTIFICATION'].includes(record.outcome) ||
        item.recordHash !== digest(record) || item.outcome !== record.outcome) fail('quarantine binding');
  }
  const quarantinedEvidence = new Set(acquisition.records.filter(x=>p.sourceIds.includes(x.sourceId)).flatMap(x=>x.candidates || []).map(x=>x.evidenceId));
  if ([...accepted.values()].some(row=>row.evidenceIds.some(id=>quarantinedEvidence.has(id)))) fail('quarantined evidence used by accepted update');
  return {pass:true, policyId:p.policyId, coverage:'partial', retained:retained.size, updated:accepted.size, candidateHash:digest(candidateRows), publicationAllowed:false,
    remainingGate:'Native pipeline integration, evidence acceptance, release validation and public disclosure are still required.'};
}
