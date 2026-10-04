import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { summarizeSessionUsage, aggregateSessionUsage } from './lib/sweep-usage-report.mjs';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length+3);
function read(file, limit) {
  const p = assertPrivateArtifact(file), s = fs.statSync(p);
  if (!s.isFile() || s.size > limit) throw Error('USAGE_INPUT_TOO_LARGE');
  return fs.readFileSync(p, 'utf8');
}
const spec = JSON.parse(read(arg('input'), 65536));
if (!Array.isArray(spec.sessions) || !spec.sessions.length || spec.sessions.length > 8) throw Error('USAGE_SESSIONS_INVALID');
const sessions = spec.sessions.map(s => {
  const root = fs.realpathSync(path.join(os.homedir(), '.codex', 'sessions'));
  const file = fs.realpathSync(s.path);
  if (!/^[a-f0-9-]{36}$/i.test(s.threadId || '') || !file.startsWith(root + path.sep) || !file.endsWith(`-${s.threadId}.jsonl`)) throw Error('USAGE_PROVENANCE_UNAVAILABLE');
  const lines = read(file, 64*1024*1024).split('\n');
  if (lines.at(-1)) throw Error('USAGE_JOURNAL_INCOMPLETE');
  return summarizeSessionUsage(lines.filter(Boolean).map(l => JSON.parse(l)), s);
});
const result = aggregateSessionUsage(sessions), file = assertPrivateArtifact(arg('output'));
fs.writeFileSync(file, JSON.stringify(result, null, 2)+'\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ file, sessions: sessions.length, totalTokens: result.total_tokens,
  cachedInputTokens: result.cached_input_tokens, uncachedInputTokens: result.uncached_input_tokens,
  outputTokens: result.output_tokens, responses: result.responses, accountAllowanceCost: null }));
