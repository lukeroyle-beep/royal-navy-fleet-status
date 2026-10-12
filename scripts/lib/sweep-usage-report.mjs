const keys = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens'];
const zero = () => Object.fromEntries(keys.map(k => [k, 0]));
const fail = code => { throw Error(code); };
function valid(usage) {
  if (!usage || keys.some(k => !Number.isSafeInteger(usage[k]) || usage[k] < 0) ||
    usage.cached_input_tokens > usage.input_tokens || usage.total_tokens !== usage.input_tokens + usage.output_tokens) fail('USAGE_COUNTER_INVALID');
}

// Only provider token_count metadata is emitted. Phase attribution uses the
// response-completion timestamp, not a guess about time spent inside tools.
export function summarizeSessionUsage(records, { threadId, phases = [] }) {
  const meta = records.filter(r => r.type === 'session_meta');
  if (!threadId || meta.length !== 1 || meta[0].payload?.id !== threadId) fail('USAGE_SESSION_ID_MISMATCH');
  const spans = phases.map(p => ({ ...p, start: Date.parse(p.from), end: Date.parse(p.to) })).sort((a,b) => a.start-b.start);
  if (spans.some((p,i) => !p.name || p.name === 'unassigned' || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.start >= p.end ||
    (i && p.start < spans[i-1].end)) || new Set(spans.map(p => p.name)).size !== spans.length) fail('USAGE_PHASES_INVALID');
  const byPhase = Object.fromEntries(['unassigned', ...spans.map(p => p.name)].map(name => [name, { ...zero(), responses: 0 }]));
  let previous = zero(), timestamp = -Infinity, responses = 0, firstInput = null, peakInput = 0, capacity = null, lastAt = null;
  let unchangedCounterReports = 0;
  const counterAnomalies = [];
  for (const r of records) {
    if (r.type !== 'event_msg' || r.payload?.type !== 'token_count' || !r.payload.info) continue;
    const { total_token_usage: total, last_token_usage: last, model_context_window: window } = r.payload.info;
    valid(total);
    const at = Date.parse(r.timestamp);
    if (!Number.isFinite(at) || at < timestamp) fail('USAGE_TIMESTAMP_INVALID');
    const delta = Object.fromEntries(keys.map(k => [k, total[k] - previous[k]]));
    if (keys.some(k => delta[k] < 0)) fail('USAGE_COUNTER_RESET');
    if (delta.total_tokens === 0) {
      if (keys.some(k => delta[k] !== 0)) fail('USAGE_COUNTER_INVALID');
      // Repeated cumulative snapshots are not additional responses. Some native
      // records carry an inconsistent last-response block here; disclose it, but
      // never invent an extra charge or change the provider's cumulative total.
      try { valid(last); } catch (error) {
        if (!responses) throw error;
        counterAnomalies.push({ at: r.timestamp, code: 'UNCHANGED_TOTAL_INVALID_LAST',
          reportedLast: Object.fromEntries(keys.map(k => [k, Number.isSafeInteger(last?.[k]) ? last[k] : null])) });
      }
      unchangedCounterReports++;
      timestamp = at;
      continue;
    }
    valid(last);
    if (keys.some(k => delta[k] !== last[k])) fail('USAGE_PREFIX_OR_EVENTS_MISSING');
    const phase = spans.find(p => at >= p.start && at < p.end)?.name || 'unassigned';
    for (const k of keys) byPhase[phase][k] += delta[k];
    byPhase[phase].responses++; responses++;
    firstInput ??= last.input_tokens; peakInput = Math.max(peakInput, last.input_tokens);
    capacity = window ?? capacity; previous = { ...total }; timestamp = at; lastAt = r.timestamp;
  }
  if (!responses) fail('USAGE_MEASUREMENT_UNAVAILABLE');
  return { threadId, ...Object.fromEntries(keys.map(k => [k, previous[k]])),
    uncached_input_tokens: previous.input_tokens - previous.cached_input_tokens,
    responses, firstInputTokens: firstInput, peakInputTokens: peakInput, contextCapacityTokens: capacity, measuredThrough: lastAt,
    unchangedCounterReports, counterAnomalies,
    phases: byPhase, phaseAttribution: 'response-completion-time', finalResponseIncluded: 'only-if-present-in-input-journal' };
}

export function aggregateSessionUsage(sessions) {
  if (!Array.isArray(sessions) || !sessions.length || sessions.length > 8 || new Set(sessions.map(s => s.threadId)).size !== sessions.length) fail('USAGE_DUPLICATE_OR_INVALID_SESSIONS');
  const total = zero();
  for (const s of sessions) { valid(s); for (const k of keys) total[k] += s[k]; }
  valid(total);
  return { schemaVersion: 1, kind: 'provider-token-metadata', sessions, ...total,
    uncached_input_tokens: total.input_tokens-total.cached_input_tokens,
    responses: sessions.reduce((n,s) => n+s.responses,0), accountAllowanceCost: null,
    counterAnomalyCount: sessions.reduce((n,s) => n+(s.counterAnomalies?.length || 0),0),
    limitations: ['Includes cached input; not a currency charge or weekly allowance percentage.',
      'Totals follow validated cumulative counters. Inconsistent last-response blocks on unchanged snapshots are disclosed, not added as independent usage; their additional cost cannot be established.',
      'Only explicitly supplied unique sessions are counted. Supply coordinator, worker and reporting sessions.',
      'Read completed journals from the parent to include final-response lag. Missing or reset counters fail closed.'] };
}
