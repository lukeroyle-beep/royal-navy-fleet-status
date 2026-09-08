import { BOOTSTRAP_OUTCOME, validateBootstrapException } from './bootstrap-exception.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Version the shared evidence normaliser independently of source adapter parsers.
export const NORMALISATION_VERSION = '4';
export const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const SUCCESS = new Set(['CHECKED_NEW_EVIDENCE', 'CHECKED_NO_RELEVANT_CHANGE', 'CHECKED_CORROBORATION_ONLY', BOOTSTRAP_OUTCOME]);
export const FAILURE = new Set(['SOURCE_UNAVAILABLE', 'AUTHENTICATION_FAILURE', 'RETRIEVAL_FAILURE', 'PARSING_FAILURE', 'RATE_LIMITED', 'DEFERRED_WITH_JUSTIFICATION']);
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

// An exclusive process lock protects the journal, including recovery. Never steal a lock.
// Each immutable transaction contains BOTH extracted evidence and its cursor. A crash
// before rename commits neither; a crash afterwards recovers both by replay.
export function openAcquisitionJournal(directory, { readOnly = false } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'writer.lock');
  const fd = readOnly ? null : fs.openSync(lock, 'wx', 0o600);
  if (!readOnly) fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  let closed = false;
  const transactions = [];
  let previousHash = null;
  try {
    for (const name of fs.readdirSync(directory).filter(n => /^\d{9}\.json$/.test(n)).sort()) {
      const transaction = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      const { hash, ...body } = transaction;
      if (body.sequence !== transactions.length || body.previousHash !== previousHash || digest(body) !== hash) throw new Error('Evidence acquisition ledger corruption');
      transactions.push(transaction); previousHash = hash;
    }
  } catch (error) { if (!readOnly) { fs.closeSync(fd); fs.unlinkSync(lock); } throw error; }
  return {
    transactions,
    latest(sourceId) { return transactions.findLast(t => t.sourceId === sourceId && SUCCESS.has(t.outcome)) || null; },
    commit(body) {
      if (closed || readOnly) throw new Error('Journal closed or read-only');
      if (!SUCCESS.has(body.outcome) && !FAILURE.has(body.outcome)) throw new Error('Invalid source disposition');
      if (!SUCCESS.has(body.outcome) && body.cursor !== null) throw new Error('Failure cannot advance cursor');
      const prior = SUCCESS.has(body.outcome) && transactions.findLast(t =>
        t.runId === body.runId && t.sourceId === body.sourceId && SUCCESS.has(t.outcome) &&
        t.registryHash === body.registryHash && t.cutoff === body.cutoff &&
        t.sourceIdentityHash === body.sourceIdentityHash &&
        t.cursor?.parserVersion === body.cursor?.parserVersion &&
        t.cursor?.normalisationVersion === body.cursor?.normalisationVersion);
      if (prior) return prior;
      const record = { ...body, sequence: transactions.length, previousHash };
      const transaction = { ...record, hash: digest(record) };
      atomicJson(path.join(directory, `${String(record.sequence).padStart(9, '0')}.json`), transaction);
      transactions.push(transaction); previousHash = transaction.hash;
      return transaction;
    },
    close() { if (!closed) { closed = true; if (!readOnly) { fs.closeSync(fd); fs.unlinkSync(lock); } } },
  };
}

export function retrievalWindow(previous, cutoff, { overlapDays = 7, deepDays = 90, deepEveryDays = 30, parserVersion = '1', forceDeep = false } = {}) {
  const end = Date.parse(cutoff);
  if (!Number.isFinite(end) || [overlapDays, deepDays, deepEveryDays].some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Invalid retrieval window policy');
  const cursor = previous?.cursor;
  for (const key of ['lastDeepAt','lastStaleAuditAt']) {
    if (cursor?.[key] != null && (!Number.isFinite(Date.parse(cursor[key])) || Date.parse(cursor[key]) > end)) throw new Error(`Invalid or future cursor ${key}`);
  }
  const deep = forceDeep || !cursor || cursor.parserVersion !== parserVersion || !cursor.lastDeepAt || end - Date.parse(cursor.lastDeepAt) >= deepEveryDays * 86400000;
  const baseline = cursor ? Date.parse(cursor.examinedThrough) : end;
  if (!Number.isFinite(baseline) || baseline > end) throw new Error('Invalid or future cursor');
  const baselineFloor = cursor?.historicalGap ? Date.parse(cursor.historicalGap.windowTo) : -Infinity;
  if (cursor?.historicalGap && (!Number.isFinite(baselineFloor) || baselineFloor > end)) throw new Error('Invalid bootstrap baseline');
  return { from: new Date(Math.max(baselineFloor, deep ? Math.min(baseline, end - deepDays * 86400000) : baseline - overlapDays * 86400000)).toISOString(), to: cutoff, deep, parserVersion };
}

// Fair bounded work pool; independent group caps prevent one adapter monopolising connections.
export async function boundedMap(items, worker, { concurrency = 4, group = () => 'default', limits = {}, signal } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16 || Object.values(limits).some(n => !Number.isInteger(n) || n < 1 || n > 16)) throw new Error('Invalid bounded concurrency');
  const pending = items.map((value, index) => ({ value, index }));
  const results = new Array(items.length), active = new Map();
  let running = 0, peak = 0;
  return await new Promise((resolve, reject) => {
    const launch = () => {
      if (!pending.length && running === 0) return resolve({ results, peak });
      if (signal?.aborted && running === 0) return reject(signal.reason || new Error('Interrupted'));
      while (running < concurrency && !signal?.aborted) {
        const next = pending.findIndex(x => (active.get(group(x.value)) || 0) < (limits[group(x.value)] || concurrency));
        if (next < 0) break;
        const { value, index } = pending.splice(next, 1)[0], key = group(value);
        active.set(key, (active.get(key) || 0) + 1); running++; peak = Math.max(peak, running);
        Promise.resolve().then(() => worker(value, index)).then(v => { results[index] = v; }, e => { results[index] = { error: e }; }).finally(() => {
          running--; active.set(key, active.get(key) - 1); launch();
        });
      }
    };
    launch();
  });
}

export async function acquireSources({ sources, runId, registryHash, cutoff, journal, adapters, extract, concurrency = 4, limits = {}, policy = {}, signal, sleep = ms => new Promise(r => setTimeout(r, ms)), onProgress = () => {} }) {
  if (new Set(sources.map(s => s.sourceId)).size !== sources.length) throw new Error('Duplicate acquisition source');
  for (const transaction of journal.transactions.filter(t => t.runId === runId)) {
    if (transaction.registryHash !== registryHash || transaction.cutoff !== cutoff) throw new Error('Resume inputs changed');
  }
  const started = performance.now();
  const pool = await boundedMap(sources, async source => {
    const priorRun = journal.transactions.findLast(t => t.runId === runId && t.sourceId === source.sourceId);
    if (priorRun && (priorRun.registryHash !== registryHash || priorRun.cutoff !== cutoff)) throw new Error('Resume inputs changed');
    if (priorRun && SUCCESS.has(priorRun.outcome) && priorRun.cursor?.normalisationVersion === NORMALISATION_VERSION) return priorRun;
    const { sourceIdentityHash, previous, window } = acquisitionContext(source, journal, cutoff, policy);
    const adapterId = source.acquisition?.adapter || source.collectionMode;
    const adapter = adapters[adapterId];
    const begin = performance.now();
    let attempts = 0, outcome, reason = null, items = [], extracted = [], response;
    const retry = source.acquisition?.retry || { attempts: 2, baseMs: 1000, maxMs: 30000 };
    if (!Number.isInteger(retry.attempts) || retry.attempts < 1 || retry.attempts > 5 || !Number.isFinite(retry.baseMs) || retry.baseMs < 0 || !Number.isFinite(retry.maxMs) || retry.maxMs < retry.baseMs || retry.maxMs > 60000) throw new Error('Invalid retry policy');
    let extractionMs = 0;
    while (attempts < retry.attempts) {
      attempts++;
      try {
        if (!adapter) throw Object.assign(new Error('No approved acquisition adapter configured'), { outcome: 'DEFERRED_WITH_JUSTIFICATION' });
        response = await adapter({ source, window, cursor: previous?.cursor || null, signal });
        if (FAILURE.has(response?.outcome)) throw Object.assign(new Error(response.reason || 'Acquisition failed'), response);
        if (response?.examined !== true || response?.extractionComplete !== true || !Array.isArray(response.items) || !response.method) throw Object.assign(new Error('Incomplete acquisition response'), { outcome: 'PARSING_FAILURE' });
        if (response.historicalException) {
          try { validateBootstrapException(response.historicalException, { sourceId: source.sourceId, window, previous }); }
          catch (error) { throw Object.assign(error, { outcome: 'PARSING_FAILURE' }); }
        }
        items = response.items;
        const known = new Set(journal.transactions.filter(t => t.sourceId === source.sourceId && t.sourceIdentityHash === sourceIdentityHash && t.cursor?.parserVersion === window.parserVersion && t.cursor?.normalisationVersion === NORMALISATION_VERSION).flatMap(t => t.items || []).map(i => `${i.id}:${i.contentHash}`));
        const seen = new Set();
        const fresh = [];
        for (const item of items) {
          if (!item.id || !item.url || typeof item.text !== 'string' || (item.publishedAt !== null && !Number.isFinite(Date.parse(item.publishedAt)))) throw Object.assign(new Error('Malformed acquired item'), { outcome: 'PARSING_FAILURE' });
          const contentHash = digest({ text: item.text, sourceContentHash: item.sourceContentHash || null, publishedAt: item.publishedAt, url: item.url });
          const key = `${item.id}:${contentHash}`;
          if (!seen.has(key) && !known.has(key)) fresh.push({ ...item, contentHash, revised: journal.transactions.some(t => t.sourceId === source.sourceId && t.items?.some(i => i.id === item.id)) });
          seen.add(key);
        }
        const extractionStart = performance.now();
        // Complete the whole extraction before any successful transaction/cursor commit.
        try { extracted = await extract(fresh, source, window); }
        catch (error) { throw Object.assign(new Error(error.message), { outcome: 'PARSING_FAILURE' }); }
        if (!Array.isArray(extracted) || extracted.length !== fresh.length) throw Object.assign(new Error('Extraction must disposition every new item'), { outcome: 'PARSING_FAILURE' });
        extractionMs = performance.now() - extractionStart;
        items = fresh;
        outcome = response.historicalException ? BOOTSTRAP_OUTCOME : items.length ? 'CHECKED_NEW_EVIDENCE' : 'CHECKED_NO_RELEVANT_CHANGE';
        break;
      } catch (error) {
        outcome = FAILURE.has(error.outcome) ? error.outcome : 'RETRIEVAL_FAILURE';
        reason = error.message;
        if (!['RATE_LIMITED', 'RETRIEVAL_FAILURE', 'SOURCE_UNAVAILABLE'].includes(outcome) || attempts >= retry.attempts || signal?.aborted) break;
        const delay = Math.max(retry.baseMs * 2 ** (attempts - 1), Number(error.retryAfterMs) || 0);
        if (delay > retry.maxMs) break; // Do not shorten a server's Retry-After.
        await sleep(delay);
      }
    }
    const success = SUCCESS.has(outcome);
    // A source may have a valid bounded observation but incomplete wider coverage.
    // Retain and escalate those items without ever advancing its cursor.
    if (!success && response?.partialItems) {
      try {
        if (!Array.isArray(response.partialItems) || !response.method) throw new Error('Invalid partial observation');
        const seen = new Set();
        items = response.partialItems.map(item => {
          if (!item.id || !item.url || typeof item.text !== 'string' || (item.publishedAt !== null && !Number.isFinite(Date.parse(item.publishedAt)))) throw new Error('Malformed partial item');
          return { ...item, contentHash: digest({ text:item.text, sourceContentHash:item.sourceContentHash || null, publishedAt:item.publishedAt, url:item.url }) };
        }).filter(item => { const key=`${item.id}:${item.contentHash}`; if(seen.has(key)) return false; seen.add(key); return true; });
        const extractionStart = performance.now();
        extracted = await extract(items, source, window);
        if (!Array.isArray(extracted) || extracted.length !== items.length) throw new Error('Partial extraction must disposition every item');
        extracted = extracted.map(c => ({ ...c, priority:1, reasons:[...new Set([...(c.reasons || []),'incomplete-source-coverage'])], publicationEligible:false }));
        extractionMs += performance.now()-extractionStart;
      } catch (error) {
        outcome='PARSING_FAILURE'; reason=`${reason}; partial extraction: ${error.message}`;
        items=[]; extracted=[];
      }
    }
    const record = journal.commit({ runId, registryHash, cutoff, sourceIdentityHash, sourceId: source.sourceId, mandatory: source.mandatory === true,
      ...(success && response.historicalException ? { historicalException: response.historicalException } : {}),
      outcome, reason: success ? (response.historicalException?.reason || null) : reason, attempts, adapter: adapterId, method: response?.method || null,
      checkedAt: new Date().toISOString(), durationMs: performance.now() - begin, extractionMs,
      items: success || response?.partialItems ? items : [], candidates: success || response?.partialItems ? extracted : [], window,
      cursor: success ? { ...(response.historicalException || previous?.cursor?.historicalGap ? { historicalGap: response.historicalException || previous.cursor.historicalGap } : {}), examinedThrough: cutoff, lastDeepAt: window.deep ? cutoff : previous.cursor.lastDeepAt, parserVersion: window.parserVersion, normalisationVersion: NORMALISATION_VERSION,
        lastStaleAuditAt: source.staleEvidencePriority ? (window.deep ? cutoff : previous?.cursor?.lastStaleAuditAt || null) : null,
        ids: [...new Set([...(previous?.cursor?.ids || []), ...items.map(i => i.id)])], latestContentAt: items.reduce((v,i) => i.publishedAt > v ? i.publishedAt : v, previous?.cursor?.latestContentAt || ''), validator: response.validator || null } : null });
    onProgress(record);
    return record;
  }, { concurrency, group: s => s.acquisition?.group || s.collectionMode, limits, signal });
  const errors = pool.results.filter(r => r?.error);
  if (errors.length) throw errors[0].error;
  const adapterTimings = {};
  for (const record of pool.results) {
    const row = adapterTimings[record.adapter] ||= { sources: 0, totalSourceMs: 0, extractionMs: 0 };
    row.sources++; row.totalSourceMs += record.durationMs; row.extractionMs += record.extractionMs;
  }
  return { records: pool.results, timings: { acquisitionMs: performance.now() - started, peakConcurrency: pool.peak, adapters: adapterTimings } };
}

export function acquisitionContext(source, journal, cutoff, policy = {}) {
  const sourceIdentityHash = digest({ sourceId: source.sourceId, url: source.canonicalUrl || null, adapter: source.acquisition?.adapter || source.collectionMode });
  const retained = journal.latest(source.sourceId);
  const previous = retained?.sourceIdentityHash === sourceIdentityHash ? retained : null;
  const staleAuditDue = source.staleEvidencePriority === true && !previous?.cursor?.lastStaleAuditAt;
  const window = retrievalWindow(previous, cutoff, { ...policy, parserVersion: source.acquisition?.parserVersion || policy.parserVersion || '1', forceDeep: source.acquisition?.forceDeep === true || policy.forceDeep === true || staleAuditDue || previous?.cursor?.normalisationVersion !== NORMALISATION_VERSION });
  return { sourceIdentityHash, previous, window };
}
