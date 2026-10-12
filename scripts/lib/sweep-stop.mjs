import fs from 'node:fs';
import path from 'node:path';
import { assertPrivateArtifact } from './private-artifacts.mjs';

const diagnostics = new Set(['WORK_BUDGET_STOP', 'USAGE_BUDGET_INVALID',
  'USAGE_PROVENANCE_UNAVAILABLE', 'USAGE_MEASUREMENT_UNAVAILABLE',
  'USAGE_MEASUREMENT_INVALID', 'USAGE_COUNTER_RESET', 'WORK_HEADROOM_STOP',
  'WORK_HEADROOM_UNKNOWN', 'WORK_HEADROOM_PLAN_INVALID',
  'BOOTSTRAP_CONFIG_INVALID', 'CLEAN_EXPECTED_HEAD_REQUIRED', 'NEW_PRIVATE_DIRECTORY_REQUIRED',
  'INPUT_DIRECTORY_REQUIRED', 'INVALID_INVOCATION', 'INVALID_SESSION_PATH', 'SESSION_NOT_UNIQUE',
  'OUTPUT_CONTAINS_PROTECTED_INPUT', 'ATTEMPT_ALREADY_EXISTS', 'EXISTING_STARTUP_RECEIPT',
  'CAPABILITY_CONFIG_INVALID']);
const fail = code => { throw new Error(code); };

export function sweepStop({ error, diagnostic, phase = 'preparation', collectionStarted = false,
  usage, headroom, at = new Date().toISOString() } = {}) {
  if (!['preparation', 'preflight', 'plan', 'indexes'].includes(phase) ||
      ![false, true, null].includes(collectionStarted) || !Number.isFinite(Date.parse(at))) fail('STOP_CONTEXT_INVALID');
  const candidate = diagnostic || error?.diagnostic || error?.message;
  const code = diagnostics.has(candidate) ? candidate : 'PREFLIGHT_OR_REQUESTED_STAGE_FAILED';
  return { schemaVersion: 1, kind: 'rnfs-terminal-stop', outcome: code === 'WORK_BUDGET_STOP' ||
      code === 'WORK_HEADROOM_STOP' || code === 'WORK_HEADROOM_UNKNOWN' ? code : 'FAILED',
    diagnostic: code, allowed: false, phase, finishedAt: at, collectionStarted,
    publicationEligible: false, noChangeClaimAllowed: false,
    ...(usage || error?.usage ? { usage: usage || error.usage } : {}),
    ...(headroom || error?.headroom ? { headroom: headroom || error.headroom } : {}) };
}

// Explicit private destination; never mkdir an attempt or collector directory.
// Preserve interrupted/colliding files, and reuse only byte-identical receipts.
export function persistSweepStop(file, receipt) {
  const target = assertPrivateArtifact(file);
  if (path.resolve(file) !== target || !fs.statSync(path.dirname(target)).isDirectory()) fail('STOP_RECEIPT_PATH_INVALID');
  const bytes = JSON.stringify(receipt, null, 2) + '\n';
  let fd;
  try { fd = fs.openSync(target, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat=fs.lstatSync(target);
    if (!stat.isFile() || (stat.mode & 0o077) || fs.readFileSync(target, 'utf8') !== bytes) fail('STOP_RECEIPT_CONFLICT');
    return { path: target, reused: true };
  }
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { path: target, reused: false };
}

// A persistence failure is separate from the original terminal outcome.
export function saveSweepStop(file, receipt) {
  if (!file) return { requested: false };
  try { return { requested: true, saved: true, ...persistSweepStop(file, receipt) }; }
  catch { return { requested: true, saved: false, diagnostic: 'STOP_RECEIPT_NOT_SAVED' }; }
}
