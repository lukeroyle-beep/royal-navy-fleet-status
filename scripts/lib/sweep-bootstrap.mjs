import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { assertPrivateArtifact } from './private-artifacts.mjs';
import { readSweepUsage, evaluateSweepHeadroom } from './sweep-work-budget.mjs';
import { validateEvent } from './command-centre.mjs';

const fail = code => { throw new Error(code); };
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

// Read only adjacent date directories and only this invocation's native journal.
export function locateSweepSession(threadId, root = path.join(os.homedir(), '.codex', 'sessions'), now = Date.now()) {
  if (!/^[a-f0-9-]{36}$/i.test(threadId || '')) fail('INVALID_INVOCATION');
  root = fs.realpathSync(root);
  const found = [];
  for (const offset of [-1, 0, 1]) {
    const dir = path.join(root, new Date(now + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', path.sep));
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) if (name.endsWith(`-${threadId}.jsonl`)) {
      const file = fs.realpathSync(path.join(dir, name));
      if (!inside(root, file) || !file.endsWith(`-${threadId}.jsonl`)) fail('INVALID_SESSION_PATH');
      found.push(file);
    }
  }
  if (found.length !== 1) fail('SESSION_NOT_UNIQUE');
  return found[0];
}

function inspectConfiguration(config, repository) {
  if (config?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(config.expectedHead || '') ||
      !['manual', 'scheduled'].includes(config.trigger) || typeof config.lastGoodRelease !== 'string' ||
      !(config.nextScheduledAt === null || (typeof config.nextScheduledAt === 'string' && Number.isFinite(Date.parse(config.nextScheduledAt)))) ||
      !Array.isArray(config.references)) fail('BOOTSTRAP_CONFIG_INVALID');
  const git = args => execFileSync('git', ['--no-optional-locks', ...args], {cwd:repository, encoding:'utf8', timeout:8000}).trim();
  if (git(['rev-parse', 'HEAD']) !== config.expectedHead || git(['status', '--porcelain'])) fail('CLEAN_EXPECTED_HEAD_REQUIRED');
  const directory = assertPrivateArtifact(config.directory);
  if (path.resolve(config.directory) !== directory || fs.existsSync(directory) ||
      !fs.statSync(path.dirname(directory)).isDirectory()) fail('NEW_PRIVATE_DIRECTORY_REQUIRED');
  const privateRoot = assertPrivateArtifact(config.privateRoot), backupDirectory = assertPrivateArtifact(config.backupDirectory);
  for (const dir of [privateRoot, backupDirectory]) if (!fs.statSync(dir).isDirectory()) fail('INPUT_DIRECTORY_REQUIRED');
  if (inside(directory, privateRoot) || inside(directory, backupDirectory)) fail('OUTPUT_CONTAINS_PROTECTED_INPUT');
  return { directory, privateRoot, backupDirectory };
}

function reportingContext(config, threadId, now) {
  if (!/^[a-f0-9-]{36}$/i.test(threadId || '')) fail('INVALID_INVOCATION');
  const context = {runId:`WAKE_${threadId}`, runStartedAt:new Date(now).toISOString(),
    trigger:config.trigger, lastGoodRelease:config.lastGoodRelease, nextScheduledAt:config.nextScheduledAt, references:config.references};
  validateEvent({...context,schemaVersion:1,eventId:context.runId+'_CONTEXT_CHECK',revision:now,
    recordedAt:context.runStartedAt,evidenceAt:context.runStartedAt,completedAt:null,outcome:'IN_PROGRESS',
    coverage:{sources:[null,null],discovery:[null,null],vessels:[null,null],integrity:[null,null]},
    publication:'Unverified',blocker:'Unverified',nextAction:'Unverified',backup:'Unverified',facts:'Context validation only'});
  return context;
}

// First model round only: no journal read, usage admission, probes or writes.
// Returning this receipt does not prove that the provider has emitted usage yet.
export function inspectSweepBootstrap(config, { repository, environment = process.env, now = Date.now() } = {}) {
  inspectConfiguration(config, repository);
  reportingContext(config, environment.CODEX_THREAD_ID, now);
  return {outcome:'BOOTSTRAP_INSPECTED', expectedHead:config.expectedHead,
    instructions:['docs/compact-sweep-execution.md','docs/command-centre-reporting.md'],
    nextStep:'Complete this read-only model round; invoke guarded bootstrap once in the following round.',
    usageChecked:false, filesCreated:false, collectionStarted:false, preflightPassed:false};
}

// No probes, owner, backup, run, source work or schedule changes. All validation
// precedes exclusive directory creation. Production callers supply no test hooks.
export function bootstrapSweep(config, { repository, environment = process.env,
  locate = locateSweepSession, usage = readSweepUsage, now = Date.now() } = {}) {
  const { directory, privateRoot, backupDirectory } = inspectConfiguration(config, repository);
  const sessionPath = locate(environment.CODEX_THREAD_ID);
  if (inside(directory, sessionPath) || inside(directory, privateRoot) || inside(directory, backupDirectory)) fail('OUTPUT_CONTAINS_PROTECTED_INPUT');
  const measured = usage({sessionPath}, environment);
  if (!measured.allowed) return {outcome:'WORK_BUDGET_STOP', usage:measured, filesCreated:false, collectionStarted:false};
  const headroom = config.headroom === undefined ? undefined : evaluateSweepHeadroom(measured, config.headroom);
  if (headroom && !headroom.allowed) return {outcome:headroom.outcome, usage:measured, headroom, filesCreated:false, collectionStarted:false};
  // Validate the future reporting fields with the same public-text/reference
  // contract, without recording an event or claiming any operational outcome.
  const context = reportingContext(config, environment.CODEX_THREAD_ID, now);
  const startup = {schemaVersion:1, privateRoot, backupDirectory, sessionPath, attemptDirectory:path.join(directory, 'attempt'),
    ...(config.headroom === undefined ? {} : {headroom:config.headroom})};
  fs.mkdirSync(directory, {mode:0o700});
  for (const [name, value] of [['reporting-context.json',context], ['startup-config.json',startup]]) {
    const fd = fs.openSync(path.join(directory,name), 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value,null,2)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  return {outcome:'BOOTSTRAP_PREPARED', directory, sessionPath, usage:measured, ...(headroom ? {headroom} : {}),
    startupConfig:path.join(directory,'startup-config.json'), reportingContext:path.join(directory,'reporting-context.json'),
    instructions:['docs/compact-sweep-execution.md','docs/command-centre-reporting.md'],
    collectionStarted:false, preflightPassed:false};
}
