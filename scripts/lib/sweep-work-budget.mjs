import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fail = code => { throw Object.assign(new Error(code), { diagnostic: code }); };
export function evaluateSweepUsage(records, threadId, { limit = 250000, reserve = 50000, now = Date.now() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250000 ||
      !Number.isSafeInteger(reserve) || reserve < 50000 || reserve >= limit) fail('USAGE_BUDGET_INVALID');
  const meta = records.filter(r => r.type === 'session_meta');
  if (!threadId || meta.length !== 1 || meta[0].payload?.id !== threadId) fail('USAGE_PROVENANCE_UNAVAILABLE');
  const record = records.findLast(r => r.type === 'event_msg' && r.payload?.type === 'token_count' && r.payload.info?.total_token_usage);
  const usage = record?.payload.info.total_token_usage;
  const at = Date.parse(record?.timestamp);
  if (!usage || !Number.isFinite(at) || at > now || now - at > 120000) fail('USAGE_MEASUREMENT_UNAVAILABLE');
  for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens']) {
    if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) fail('USAGE_MEASUREMENT_INVALID');
  }
  if (usage.cached_input_tokens > usage.input_tokens || usage.total_tokens !== usage.input_tokens + usage.output_tokens) fail('USAGE_MEASUREMENT_INVALID');
  const earlier = records.filter(r => r.type === 'event_msg' && r.payload?.type === 'token_count')
    .map(r => r.payload.info?.total_token_usage?.total_tokens).filter(v => v !== undefined);
  if (earlier.some(v => !Number.isSafeInteger(v) || v < 0 || v > usage.total_tokens)) fail('USAGE_COUNTER_RESET');
  const allowed = usage.total_tokens < limit - reserve;
  return { outcome: allowed ? 'WORK_BUDGET_AVAILABLE' : 'WORK_BUDGET_STOP',
    allowed, measuredAt: record.timestamp, totalTokens: usage.total_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    uncachedInputTokens: usage.input_tokens - usage.cached_input_tokens,
    outputTokens: usage.output_tokens, limit, reserve,
    hardConversationCeilingEnforced: false };
}

export function readSweepUsage(config, environment = process.env) {
  const threadId = environment.CODEX_THREAD_ID;
  if (!/^[a-f0-9-]{36}$/i.test(threadId || '') || !config?.sessionPath) fail('USAGE_PROVENANCE_UNAVAILABLE');
  const root = fs.realpathSync(path.join(os.homedir(), '.codex', 'sessions'));
  const file = fs.realpathSync(config.sessionPath);
  if (!file.startsWith(root + path.sep) || !file.endsWith(`-${threadId}.jsonl`)) fail('USAGE_PROVENANCE_UNAVAILABLE');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) fail('USAGE_PROVENANCE_UNAVAILABLE');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines.at(-1)) lines.pop();
  return evaluateSweepUsage(lines.filter(Boolean).map(line => JSON.parse(line)), threadId, { limit: config.limit, reserve: config.reserve });
}

// This stops the guarded command, not model turns or platform billing.
export function requireSweepWorkBudget(config, environment = process.env) {
  const receipt = readSweepUsage(config, environment);
  if (!receipt.allowed) fail('WORK_BUDGET_STOP');
  return receipt;
}
