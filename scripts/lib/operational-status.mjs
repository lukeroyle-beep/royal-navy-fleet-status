import { createHash } from 'node:crypto';
import { readReleaseMetadata, isIsoInstant } from '../../src/utils/release.js';
import { assertCompleteMapRepresentation, plottedVessels, isRepresentativeRegionMarker } from '../../src/utils/map.js';
import { hasRepresentativePatrolMarker } from '../../src/utils/representativePatrol.js';
import { validateSweepCertificate } from './sweep-certificate.mjs';

export const VERSION = '1.0.0';
export const FIELDS = Object.freeze({
  fleet: ['repository-fleet', 'production-fleet'],
  coverage: ['repository-fleet', 'production-fleet'],
  sweep: ['sweep-run', 'operator-status'], recovery: ['preflight', 'operator-status'], certificate: ['sweep-run', 'operator-status'],
  lastCollection: ['sweep-run'], lastCertification: ['certified-history', 'sweep-run'],
  publication: ['production-fleet'], deployment: ['deployment'], rendered: ['rendered'],
  brokerB1: ['engineering'], brokerB2: ['engineering'], brokerB3: ['broker-static'], brokerB4: ['broker-static'],
  scheduler: ['preflight', 'scheduled-prerequisite'], permissions: ['preflight'], backup: ['preflight'],
  holds: ['scheduled-prerequisite'], engineering: ['engineering'], ownerAction: ['broker-static'],
});
const SOURCES = Object.freeze({
  'repository-fleet': ['urn:rnfs:source:repository-public-fleet', 20, 14 * 86400],
  'production-fleet': ['urn:rnfs:source:production-public-fleet', 30, 14 * 86400],
  'certified-history': ['urn:rnfs:source:existing-certified-history', 30, 7 * 86400],
  'sweep-run': ['urn:rnfs:source:existing-sweep-run', 30, 7 * 86400],
  'operator-status': ['urn:rnfs:source:existing-recovery-status', 40, 7 * 86400],
  preflight: ['urn:rnfs:source:existing-preflight-receipt', 30, 86400],
  'scheduled-prerequisite': ['urn:rnfs:source:existing-scheduled-prerequisites', 30, 86400],
  'broker-static': ['urn:rnfs:source:existing-broker-static-installation', 30, 86400],
  engineering: ['urn:rnfs:source:github-engineering-snapshot', 30, 86400],
  deployment: ['urn:rnfs:source:existing-deployment-verification', 30, 86400],
  rendered: ['urn:rnfs:source:existing-rendered-verification', 30, 86400],
});
export const SOURCE_KINDS = Object.freeze(Object.keys(SOURCES));
function instant(x) { if (!isIsoInstant(x) || Number(x.slice(11, 13)) > 23) throw Error('invalid-input'); return new Date(x).toISOString(); }
function count(x) { if (!Number.isSafeInteger(x) || x < 0 || x > 1000000) throw Error('invalid-input'); return x; }
function choice(x, values) { if (!values.includes(x)) throw Error('invalid-input'); return x; }
function runId(x) { if (typeof x !== 'string' || !/^SWEEP_\d{8}T\d{6,9}Z_R\d+_[a-f0-9]{8}$/.test(x)) throw Error('invalid-input'); return x; }
function hash(x, length = 64) { if (typeof x !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(x)) throw Error('invalid-input'); return x; }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = x => createHash('sha256').update(canonical(x)).digest('hex');

// Output is constructed field by field. Native receipts may contain private fields;
// no spread, error message, free text, path, source URL or log crosses this boundary.
function adapt(kind, d) {
  const out = [];
  const add = (field, observedAt, outcome, value, assurance = 'receipt-assertion') => out.push({ field, observedAt: instant(observedAt), outcome, value, assurance });
  if (kind.endsWith('-fleet')) {
    const r = readReleaseMetadata(d.metadata, { allowLegacy: false });
    const release = { asOfDate: r.asOfDate, releaseRevision: count(r.releaseRevision), releasedAt: instant(r.releasedAt) };
    if (!Array.isArray(d.vessels) || d.vessels.length > 1000 || !d.vessels.length) throw Error('invalid-input');
    const ids = d.vessels.map(v => v?.id);
    if (ids.some(v => typeof v !== 'string' || !v) || new Set(ids).size !== ids.length) throw Error('invalid-input');
    const plotted = plottedVessels(d.vessels);
    const protectedCount = plotted.filter(hasRepresentativePatrolMarker).length;
    const regionCount = plotted.filter(isRepresentativeRegionMarker).length;
    const counts = { fleetCount: ids.length, representedCount: plotted.length, pointCount: plotted.length - protectedCount - regionCount, regionCount, protectedCount };
    let complete = false;
    try { assertCompleteMapRepresentation(d.vessels); complete = true; } catch { /* partial fleets remain visible */ }
    add('fleet', r.releasedAt, complete ? 'passed' : 'partial', { ...release, ...counts }, 'public-projection');
    const c = d.metadata.sweepCoverage;
    if (c) {
      const value = { classification: choice(c.classification, ['partial', 'complete']), runId: runId(c.runId), reviewedVessels: count(c.reviewedVessels), pendingVessels: count(c.pendingVessels), sourceChecksSuccessful: count(c.sourceChecksSuccessful), sourceChecksRequired: count(c.sourceChecksRequired) };
      if (value.reviewedVessels + value.pendingVessels !== ids.length || value.sourceChecksSuccessful > value.sourceChecksRequired) throw Error('invalid-input');
      if (value.classification === 'complete' && (value.pendingVessels !== 0 || value.sourceChecksSuccessful !== value.sourceChecksRequired)) throw Error('invalid-input');
      add('coverage', r.releasedAt, value.classification === 'partial' ? 'partial' : 'passed', value, 'public-projection');
    }
    // Presence in a caller-supplied production payload is publication evidence only;
    // neither repository metadata nor this observation proves a deployment/render check.
    if (kind === 'production-fleet') add('publication', r.releasedAt, 'passed', release, 'public-projection');
  } else if (kind === 'sweep-run' || kind === 'certified-history') {
    const id = runId(d.runId);
    const at = d.updatedAt || d.completedAt || d.startedAt;
    if (typeof d.complete !== 'boolean' || !Array.isArray(d.sourceChecks) || !Array.isArray(d.vesselOutcomes)) throw Error('invalid-input');
    if (kind === 'sweep-run') add('sweep', at, d.complete ? 'passed' : 'partial', { runId: id, complete: d.complete, requiredSources: count(d.sourceChecks.length), fleetRecords: count(d.vesselOutcomes.length), cutoff: instant(d.window.to) });
    if (d.sweepCertificate && d.certificateInputs) {
      const cert = d.sweepCertificate;
      // A valid native certificate is required, even for legacy grandfathered runs.
      let valid = false;
      try { validateSweepCertificate(d); valid = cert.status === 'PASS'; } catch { /* fail closed */ }
      if (kind === 'sweep-run') add('certificate', cert.generatedAt, valid ? 'passed' : 'blocked', { runId: id, valid }, 'native-validator');
      if (valid) {
        add('lastCertification', cert.generatedAt, 'passed', { runId: id, completedAt: instant(cert.generatedAt) }, 'native-validator');
        // Native completedAt seals the sweep, not the collection stage. No exact
        // collection completion timestamp is inferred from it or certification.
      }
    }
  } else if (kind === 'operator-status') {
    const id = runId(d.runId);
    choice(d.state, ['INCOMPLETE_RECOVERABLE']);
    if (d.complete !== false || d.publicationEligible !== false) throw Error('invalid-input');
    const checked = count(d.mandatorySourcesSuccessfullyChecked), required = count(d.mandatorySourcesExpected);
    if (checked > required) throw Error('invalid-input');
    add('sweep', d.updatedAt, 'partial', { runId: id, complete: false, cutoff: instant(d.cutoff), requiredSources: required, successfullyChecked: checked, fleetRecords: count(d.examinedFleetRecords), reconciled: count(d.finalReconciledFleetRecords) });
    add('recovery', d.updatedAt, 'blocked', { runId: id, recoverable: true, liveOwnerVerified: false, action: 'preserve-same-run' });
    if (d.nativeCertificateDryRun === 'FAIL') add('certificate', d.updatedAt, 'blocked', { runId: id, valid: false, scope: 'dry-run' });
  } else if (kind === 'preflight') {
    if (d.schemaVersion !== 1 || d.collectionStarted !== false || d.publicationEligible !== false || !Array.isArray(d.checks)) throw Error('invalid-input');
    const outcome = choice(d.outcome, ['READY_FOR_COLLECTION', 'DEFERRED_WITH_JUSTIFICATION']);
    const checks = new Map();
    for (const c of d.checks) {
      if (checks.has(c.check)) throw Error('invalid-input');
      checks.set(c.check, choice(c.status, ['pass', 'fail']));
    }
    // Preflight is deliberately not invoked: its production probes write and archive.
    add('scheduler', d.checkedAt, outcome === 'READY_FOR_COLLECTION' ? 'partial' : 'blocked', { scope: 'check-only-preflight', readyForCollectionClaim: outcome === 'READY_FOR_COLLECTION', productionReady: false });
    for (const [field, names] of Object.entries({ permissions: ['REPOSITORY_WRITE', 'PRIVATE_WRITE'], backup: ['BACKUP'], recovery: ['OWNERSHIP', 'OWNERSHIP_RECHECK'] })) {
      if (names.every(n => checks.has(n))) add(field, d.checkedAt, names.every(n => checks.get(n) === 'pass') ? 'passed' : 'blocked', { scope: 'check-only-preflight' });
    }
  } else if (kind === 'scheduled-prerequisite') {
    if (d.collectionStarted !== false || d.checkOnlyHold !== true) throw Error('invalid-input');
    choice(d.outcome, ['GITHUB_CONNECTIVITY_UNAVAILABLE', 'GITHUB_DNS_UNAVAILABLE', 'BACKUP_ENCRYPTION_UNAVAILABLE']);
    add('scheduler', d.checkedAt, 'blocked', { scope: 'scheduled-prerequisites', reason: d.outcome, productionReady: false });
    add('holds', d.checkedAt, 'blocked', { collection: true, publication: true });
  } else if (kind === 'broker-static') {
    choice(d.B3, ['INCOMPLETE_STATIC_IDENTITY_DISCREPANCY']);
    choice(d.B4, ['NOT_RUN']);
    add('brokerB3', d.capturedAt, 'blocked', { reason: 'static-identity-prerequisite', runtimeVerified: false });
    add('brokerB4', d.capturedAt, 'unknown', { reason: 'not-run', runtimeVerified: false });
    add('ownerAction', d.capturedAt, 'blocked', { action: 'review-account-authority-resolution', owner: 'Luke', activate: false });
  } else if (kind === 'engineering') {
    // Snapshot of explicit gh --json fields; titles/bodies are intentionally omitted.
    if (!Array.isArray(d.items) || d.items.length > 50) throw Error('invalid-input');
    const items = d.items.map(i => ({ number: count(i.number), state: choice(i.state, ['OPEN', 'CLOSED', 'MERGED']), kind: choice(i.kind, ['issue', 'pull-request']) })).sort((a,b) => a.number - b.number || a.kind.localeCompare(b.kind));
    add('engineering', d.observedAt, 'passed', { commit: hash(d.commit, 40), items }, 'github-snapshot');
    // Merged code is reported as implementation evidence, never runtime acceptance.
    if (items.some(i => i.kind === 'pull-request' && i.number === 116 && i.state === 'MERGED')) {
      for (const field of ['brokerB1', 'brokerB2']) add(field, d.observedAt, 'partial', { codeMerged: true, acceptanceReceiptPresent: false }, 'github-snapshot');
    }
  } else {
    // No accepted native receipt adapter yet: do not invent acceptance from generic
    // pass flags, deployment build results or a caller-provided rendered screenshot.
    throw Error('unsupported-receipt');
  }
  return out;
}

export function buildOperationalStatus(sources = [], { now = new Date().toISOString() } = {}) {
  now = instant(now);
  if (!Array.isArray(sources) || sources.length > 32) throw Error('invalid-input');
  const observations = Object.fromEntries(Object.keys(FIELDS).map(k => [k, []]));
  const inputs = [];
  for (const source of sources) {
    const kind = source?.kind;
    if (!SOURCE_KINDS.includes(kind)) throw Error('invalid-source-kind');
    const [sourceRef, priority, maxAgeSeconds] = SOURCES[kind];
    let rows;
    let error = source.error ? choice(source.error, ['missing', 'unreadable', 'invalid-input', 'oversized', 'not-regular-file']) : null;
    if (!error) {
      try { rows = adapt(kind, source.data); } catch { error = 'invalid-input'; }
    }
    const sourceDigest = error ? null : digest(rows);
    inputs.push({ sourceRef, sourceDigest, status: error || 'read', verifiedAt: now });
    if (error) continue;
    for (const row of rows) {
      const delta = Date.parse(now) - Date.parse(row.observedAt);
      const freshness = delta < 0 ? 'unknown' : delta > maxAgeSeconds * 1000 ? 'stale' : 'fresh';
      observations[row.field].push({ sourceRef, sourceDigest, observedAt: row.observedAt, verifiedAt: now, freshness, maxAgeSeconds, priority, outcome: row.outcome, value: row.value, assurance: row.assurance });
    }
  }
  const fields = {};
  for (const [field, rows] of Object.entries(observations)) {
    rows.sort((a,b) => b.priority - a.priority || b.observedAt.localeCompare(a.observedAt) || canonical(a).localeCompare(canonical(b)));
    const unique = rows.filter((r,i) => !i || canonical(r) !== canonical(rows[i-1]));
    const selected = unique[0];
    const conflicting = new Set(unique.map(r => canonical({ outcome: r.outcome, value: r.value }))).size > 1;
    const status = !selected ? 'unknown' : conflicting ? 'conflicting' : selected.freshness === 'unknown' ? 'unknown' : selected.freshness === 'stale' ? 'stale' : selected.outcome;
    fields[field] = { status, verifiedAt: now, selected: selected || null, observations: unique, missingInputs: selected ? [] : FIELDS[field].map(k => SOURCES[k][0]) };
  }
  inputs.sort((a,b) => canonical(a).localeCompare(canonical(b)));
  const report = { schemaVersion: VERSION, nonAuthoritative: true, generatedAt: now, fields, inputs };
  report.contentId = digest(semanticContent(report));
  return report;
}
export function semanticContent(report) {
  // Time crossing a freshness threshold is a material status change. Merely reading
  // the same evidence again is not. Omit verification/generation clocks only.
  if (Array.isArray(report)) return report.map(semanticContent);
  if (report && typeof report === 'object') return Object.fromEntries(Object.entries(report).filter(([k]) => !['generatedAt', 'verifiedAt', 'contentId'].includes(k)).map(([k,v]) => [k, semanticContent(v)]));
  return report;
}
export function changesSince(current, previous = null) {
  if (!previous || previous.schemaVersion !== VERSION) return { resetRequired: true, contentId: current.contentId, changedFields: Object.keys(FIELDS) };
  return { resetRequired: false, contentId: current.contentId, changedFields: Object.keys(FIELDS).filter(k => canonical(semanticContent(current.fields[k])) !== canonical(semanticContent(previous.fields[k]))) };
}
export function renderOperationalStatus(report) {
  const lines = [`RNFS operational status — ${report.generatedAt}`, `Derived, non-authoritative · ${report.contentId}`, ''];
  for (const [name, field] of Object.entries(report.fields)) {
    const s = field.selected;
    lines.push(`${name}: ${field.status}${s ? ` — ${JSON.stringify(s.value)} [${s.sourceRef}; observed ${s.observedAt}; verified ${s.verifiedAt}; ${s.freshness}]` : ` — missing ${field.missingInputs.join(', ')}`}`);
    if (field.status === 'conflicting') lines.push(`  Retained ${field.observations.length} disagreeing observations; selection uses source priority then observation time.`);
  }
  return lines.join('\n') + '\n';
}
