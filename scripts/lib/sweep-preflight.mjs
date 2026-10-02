import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { digest } from './acquisition.mjs';
import { assertPrivateArtifact } from './private-artifacts.mjs';
import { resolvePrivateInputs } from './private-inputs.mjs';
import { createPublicProjection } from './public-projection.mjs';
import { validateAssessmentLog } from './provenance.mjs';
import { createSweepRun, validateSweepRunShape, validateSweepBaselineAgainstState } from './sweep.mjs';

const REPOSITORY = 'lukeroyle-beep/royal-navy-fleet-status';
const LIVE = 'https://british-armed-forces-tracker.open-defence-data.workers.dev/data/royal-navy/vessels.json';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function fail(code) { throw Object.assign(new Error(code), { diagnostic: code }); }

export function probeWrite(directory) {
  const probe = path.join(directory, `.rnfs-preflight-${crypto.randomUUID()}`);
  const bytes = crypto.randomBytes(32);
  let created = false;
  try {
    const fd = fs.openSync(probe, 'wx', 0o600); created = true;
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!fs.readFileSync(probe).equals(bytes)) fail('WRITE_READBACK_FAILED');
  } finally { if (created) fs.unlinkSync(probe); }
}

// diskutil accepts a volume mount point, not an arbitrary directory on it.
// Resolve symlinks before walking device boundaries so the inspected volume
// is the one actually holding the backup manifest.
export function filesystemRoot(directory, filesystem = fs) {
  let current = filesystem.realpathSync(directory);
  const device = filesystem.statSync(current).dev;
  while (path.dirname(current) !== current) {
    const parent = path.dirname(current);
    if (filesystem.statSync(parent).dev !== device) break;
    current = parent;
  }
  return current;
}

// Injected probes are for fixture testing. The CLI always uses these actual
// probes, with bounded child processes/HTTP. No model, browser or remote writes.
export function productionProbes({ repository, environment = process.env, deadline }) {
  const timeout = () => {
    const left = deadline - Date.now();
    if (left <= 0) fail('PREFLIGHT_TIMEOUT');
    return Math.min(left, 8000);
  };
  const command = (bin, args) => execFileSync(bin, args, { cwd: repository, env: environment, encoding: 'utf8', timeout: timeout(), maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    write: probeWrite,
    ownerAlive: pid => {
      try { process.kill(pid, 0); return true; }
      catch (error) {
        if (error.code === 'EPERM' || error.code === 'EACCES') fail('OWNER_LIVENESS_PERMISSION_UNAVAILABLE');
        if (error.code === 'ESRCH') return false;
        fail('OWNER_LIVENESS_UNAVAILABLE');
      }
    },
    github: () => {
      const remote = command('git', ['remote', 'get-url', 'origin']).trim();
      if (![`https://github.com/${REPOSITORY}.git`, `https://github.com/${REPOSITORY}`, `git@github.com:${REPOSITORY}.git`].includes(remote)) fail('REPOSITORY_IDENTITY_MISMATCH');
      const info = JSON.parse(command('gh', ['api', `repos/${REPOSITORY}`]));
      if (info.full_name !== REPOSITORY || !info.permissions?.push) fail('GITHUB_AUTHORIZATION_UNAVAILABLE');
      const head = command('gh', ['api', `repos/${REPOSITORY}/git/ref/heads/main`, '--jq', '.object.sha']).trim();
      if (!/^[a-f0-9]{40}$/.test(head)) fail('GITHUB_HEAD_INVALID');
      const body = command('gh', ['api', `repos/${REPOSITORY}/contents/data/royal-navy/vessels.json?ref=${head}`, '-H', 'Accept: application/vnd.github.raw+json']);
      return { head, projection: JSON.parse(body) };
    },
    live: async () => {
      const response = await fetch(LIVE, { redirect: 'error', signal: AbortSignal.timeout(timeout()) });
      if (!response.ok) fail('LIVE_BASELINE_UNAVAILABLE');
      let bytes = 0; const parts = [];
      for await (const part of response.body) { bytes += part.length; if (bytes > 2_000_000) fail('LIVE_BASELINE_TOO_LARGE'); parts.push(part); }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    },
    encrypted: (directory, sourceRoot) => {
      if (process.platform !== 'darwin') fail('ENCRYPTION_PROBE_UNSUPPORTED');
      let plist;
      try { plist = command('/usr/sbin/diskutil', ['info', '-plist', filesystemRoot(directory)]); }
      catch { fail('BACKUP_ENCRYPTION_UNAVAILABLE'); }
      return /<key>FileVault<\/key>\s*<true\s*\/>/.test(plist) &&
        fs.statSync(directory).dev !== fs.statSync(sourceRoot).dev;
    },
  };
}

export function preflightBinding({ run, runHash, inputHash, checkpointHash }) {
  return digest({ runId: run.runId, window: run.window, registryHash: run.sourceRegistryHash,
    baselineStateHash: run.baselineStateHash, runHash, inputHash, checkpointHash });
}

export async function runSweepPreflight({ config, repository, environment = process.env, probes, now = () => Date.now() }) {
  const started = now();
  const checks = [];
  let context = {};
  let step = 'CONFIGURATION';
  const check = async (name, operation) => {
    step = name;
    const began = now();
    try {
      const result = await operation();
      checks.push({ check: name, status: 'pass', elapsedMs: Math.max(0, now() - began) });
      return result;
    } catch (error) {
      checks.push({ check: name, status: 'fail', elapsedMs: Math.max(0, now() - began), diagnostic: error.diagnostic || classifyPreflightError(error, name) });
      throw error;
    }
  };
  try {
    await check('CONFIGURATION', () => {
      if (config?.schemaVersion !== 1) fail('PREFLIGHT_CONFIG_INVALID');
      for (const key of ['run', 'stateDirectory', 'ownerLock', 'backupReceipt']) assertPrivateArtifact(config[key]);
      if (!config.ownerId || !fs.statSync(config.stateDirectory).isDirectory()) fail('PREFLIGHT_CONFIG_INVALID');
      if (config.executionPolicy?.networkAccess === false) fail('NETWORK_POLICY_DENIED');
    });
    const run = await check('RUN_BINDING', () => {
      const value = readJson(config.run); validateSweepRunShape(value);
      if (value.complete) fail('RUN_ALREADY_SEALED');
      return value;
    });
    context.runId = run.runId;
    const ownerHash = await check('OWNERSHIP', () => confirmOwner(config, run, probes, now));
    const inputs = await check('PRIVATE_INPUTS', () => {
      const value = resolvePrivateInputs({ environment });
      if (value.mode !== 'external') fail('EXTERNAL_PRIVATE_INPUTS_REQUIRED');
      assertPrivateArtifact(value.root);
      return value;
    });
    await check('REPOSITORY_WRITE', () => probes.write(repository));
    await check('PRIVATE_WRITE', () => {
      probes.write(inputs.root); probes.write(inputs.pathFor('sweepRuns')); probes.write(config.stateDirectory);
    });
    const github = await check('GITHUB', () => probes.github());
    context.main = github.head;
    const live = await check('LIVE_BASELINE', () => probes.live());
    const inputHash = await check('PROJECTION', () => {
      const entities = inputs.readJson('vessels'), assessments = inputs.readJson('assessments'), evidence = inputs.readJson('evidence');
      const current = entities.vessels.map(v => v.vesselId), known = [...current, ...(entities.retiredVessels || []).map(v => v.vesselId)];
      validateAssessmentLog(assessments, evidence.evidence, known, current);
      validateSweepBaselineAgainstState(run, { entities, assessmentLog: assessments, evidenceItems: evidence.evidence });
      const expected = createSweepRun({ entities, registry: inputs.readJson('sources'), assessmentLog: assessments, evidenceItems: evidence.evidence, startedAt: run.window.to, windowStart: run.window.from, releaseRevision: run.releaseTarget.releaseRevision });
      if (expected.sourceRegistryHash !== run.sourceRegistryHash || expected.rosterHash !== run.rosterHash) fail('RUN_INPUTS_CHANGED');
      const projection = createPublicProjection(entities, assessments, evidence.evidence);
      if (new Set(current).size !== current.length || current.length !== github.projection.vessels.length ||
          digest(projection) !== digest(github.projection) || digest(projection) !== digest(live)) fail('PUBLICATION_BASELINE_MISMATCH');
      // The full registry is also bound; metadata changes cannot slip through a receipt.
      return digest(Object.fromEntries(['vessels', 'sources', 'assessments', 'evidence', 'shoreEstablishments', 'shorePhotoSources'].map(k => [k, sha256(fs.readFileSync(inputs.pathFor(k)))])));
    });
    const checkpointHash = await check('CHECKPOINT', () => {
      return checkpointInventoryHash(config);
    });
    context.bindingHash = preflightBinding({ run, runHash: sha256(fs.readFileSync(config.run)), inputHash, checkpointHash });
    await check('BACKUP', async () => {
      const receipt = readJson(config.backupReceipt);
      if (receipt.schemaVersion !== 1 || receipt.kind !== 'rnfs-backup-readiness' || receipt.bindingHash !== context.bindingHash ||
          !Number.isFinite(Date.parse(receipt.verifiedAt)) || Date.parse(receipt.verifiedAt) > now()) fail('BACKUP_RECEIPT_INVALID');
      // This is an exact-state proof, not an invented time-to-live exception.
      const manifest = assertPrivateArtifact(receipt.manifestPath), proofPath = assertPrivateArtifact(receipt.restoreProofPath);
      if (sha256(fs.readFileSync(manifest)) !== receipt.manifestSha256 || sha256(fs.readFileSync(proofPath)) !== receipt.restoreProofSha256) fail('BACKUP_PROOF_MISMATCH');
      const inventory = readJson(manifest);
      if (inventory.kind !== 'rnfs-backup-manifest' || inventory.bindingHash !== context.bindingHash ||
          inventory.completePrivateInputs !== true || inventory.completeCheckpointState !== true ||
          !Number.isInteger(inventory.fileCount) || inventory.fileCount < 1) fail('BACKUP_MANIFEST_INVALID');
      const proof = readJson(proofPath);
      if (proof.bindingHash !== context.bindingHash || proof.manifestSha256 !== receipt.manifestSha256 || proof.pass !== true ||
          proof.filesVerified !== inventory.fileCount) fail('RESTORE_NOT_VERIFIED');
      if (!(await probes.encrypted(path.dirname(manifest), inputs.root))) fail('BACKUP_ENCRYPTION_UNAVAILABLE');
      probes.write(path.dirname(manifest));
    });
    await check('OWNERSHIP_RECHECK', () => {
      if (confirmOwner(config, run, probes, now) !== ownerHash) fail('OWNER_CHANGED');
    });
    return { schemaVersion: 1, ...context, checkedAt: new Date(started).toISOString(), elapsedMs: now() - started,
      outcome: 'READY_FOR_COLLECTION', checks, collectionStarted: false, publicationEligible: false, modelCalls: 0 };
  } catch (error) {
    const diagnostic = error.diagnostic || classifyPreflightError(error, step);
    if (checks.at(-1)?.status !== 'fail') checks.push({ check: step, status: 'fail', diagnostic });
    // Never serialize command stderr, filesystem paths, source contents or tokens.
    return { schemaVersion: 1, ...context, checkedAt: new Date(started).toISOString(), elapsedMs: now() - started,
      outcome: 'DEFERRED_WITH_JUSTIFICATION', checks, diagnostic, collectionStarted: false, publicationEligible: false, modelCalls: 0 };
  }
}

export function classifyPreflightError(error, step) {
  const message = `${error?.message || ''} ${error?.stderr || ''}`;
  if (/ENOTFOUND|EAI_AGAIN|resolve host|name resolution/i.test(message)) return 'GITHUB_DNS_UNAVAILABLE';
  if (/ETIMEDOUT|timed out|TimeoutError/.test(message)) return 'PREFLIGHT_TIMEOUT';
  if (/EACCES|EPERM|permission denied|Operation not permitted/i.test(message)) return `${step}_PERMISSION_DENIED`;
  if (step === 'GITHUB' && /401|403|authentication|gh auth login/i.test(message)) return 'GITHUB_AUTHENTICATION_UNAVAILABLE';
  return `${step}_UNAVAILABLE`;
}

export async function collectAfterPreflight(options, collect) {
  const receipt = await runSweepPreflight(options);
  if (receipt.outcome !== 'READY_FOR_COLLECTION') return { receipt, result: null };
  return { receipt, result: await collect(receipt) };
}

function confirmOwner(config, run, probes, now) {
  const lock = readJson(config.ownerLock);
  if (lock.runId !== run.runId || (lock.ownerId || lock.owner) !== config.ownerId || lock.active !== true ||
      !Number.isInteger(lock.pid) || lock.pid <= 0 || (lock.hostname && lock.hostname !== os.hostname()) ||
      (lock.expiresAt && (!Number.isFinite(Date.parse(lock.expiresAt)) || Date.parse(lock.expiresAt) <= now())) ||
      !probes.ownerAlive(lock.pid)) fail('OWNER_NOT_CONFIRMED');
  // Renewal timestamps may change; identity and fencing token may not.
  return digest({ runId: lock.runId, ownerId: lock.ownerId || lock.owner, pid: lock.pid, token: lock.token || null });
}

export function checkpointInventoryHash(config) {
  const roots = [config.stateDirectory, ...(config.evidenceDirectories || [])];
  const records = [];
  const walk = (root, directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      // Process mutex is not evidence and changes when a new owner resumes.
      if (directory === root && entry.name === 'writer.lock') continue;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('CHECKPOINT_SYMLINK_REJECTED');
      if (entry.isDirectory()) walk(root, file, prefix);
      else if (entry.isFile()) records.push({ name: `${prefix}/${path.relative(root, file)}`, hash: sha256(fs.readFileSync(file)) });
      else fail('CHECKPOINT_FILE_TYPE_INVALID');
    }
  };
  roots.forEach((root, index) => { assertPrivateArtifact(root); walk(root, root, index); });
  return digest(records);
}
