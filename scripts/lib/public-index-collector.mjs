import crypto from "node:crypto";
import { boundedMap, digest } from "./acquisition.mjs";

import {
  PUBLIC_INDEX_TARGETS,
  createBlocker,
  evaluateSweepCoverage,
} from "./sweep.mjs";

const MAX_BODY_BYTES = 2_000_000;
const ALLOWED_CONTENT_TYPES = [
  "application/atom+xml",
  "application/rss+xml",
  "application/xml",
  "text/html",
  "text/xml",
];

export const INDEX_PARSER_VERSION = '2';
const activeRuns = new Set();
export async function collectPublicIndexes(
  run,
  {
    registry,
    entities,
    fetchImpl = globalThis.fetch,
    checkedAt = new Date().toISOString(),
    targets = PUBLIC_INDEX_TARGETS,
    concurrency = 4,
    parserVersion = INDEX_PARSER_VERSION,
    perDomain = 1,
    minIntervalMs = 250,
    timeoutMs = 20000,
    attempts = 3,
    cache = {},
    onCheckpoint = () => {},
    sleep = ms => new Promise(r => setTimeout(r, ms)),
  },
) {
  if (typeof fetchImpl !== "function") throw new Error("Public-index collection requires fetch.");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5 || !Number.isInteger(perDomain) || perDomain < 1 || perDomain > 16 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isFinite(minIntervalMs) || minIntervalMs < 0 || minIntervalMs > 60000) throw new Error('Invalid network bounds');
  if (new Set(run.discoveryChecks.map(c => c.targetId)).size !== run.discoveryChecks.length) throw new Error('Duplicate discovery request');
  const nextDomain = new Map();
  const telemetry = { startedAt: new Date().toISOString(), attempted: 0, reused: 0, retries: 0, timeouts: 0, bytes: 0, httpRequests: 0, modelCalls: 0, modelUsage: 'deterministic-no-model' };
  if (new Set(targets.map(t => t.url)).size !== targets.length) throw new Error('Duplicate source URL');
  const targetById = new Map(targets.map((entry) => [entry.targetId, entry]));

  if (activeRuns.has(run.runId)) throw new Error('Discovery already active for this run');
  activeRuns.add(run.runId);
  try {
  const started = performance.now();
  const batch = await boundedMap(run.discoveryChecks, async (check) => {
    const target = targetById.get(check.targetId);
    if (!target) throw new Error(`Missing discovery target ${check.targetId}`);
    const binding = crypto.createHash('sha256').update(JSON.stringify({ runId: run.runId, cutoff: run.window.to, registryHash: run.sourceRegistryHash, window: run.window, parserVersion, target })).digest('hex');
    if (check.state === 'complete' && check.requestBinding === binding && check.contentHash && check.receiptHash === receiptHash(check)) { telemetry.reused++; return; }
    const sourceStarted = performance.now();
    telemetry.attempted++;
    let result;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const domain = target.allowedHost;
      const now = Date.now(), start = Math.max(now, nextDomain.get(domain) || 0);
      nextDomain.set(domain, start + minIntervalMs);
      if (start > now) await sleep(start - now);
      result = await collectOne(target, { fetchImpl, checkedAt, timeoutMs, cached: cache[target.targetId], onRequest: () => telemetry.httpRequests++ });
      if (result.blocker?.type === 'timeout') telemetry.timeouts++;
      if (result.bytes) telemetry.bytes += result.bytes;
      result.attempts = attempt;
      const transient = ['network-error', 'timeout'].includes(result.blocker?.type) || result.httpStatus === 429 || result.httpStatus >= 500;
      if (!transient || attempt === attempts) break;
      const delay = Math.max(1000 * 2 ** (attempt - 1), result.retryAfterMs || 0);
      if (delay > 30000) break;
      telemetry.retries++;
      await sleep(delay);
    }
    result.requestBinding = binding;
    if (result.cacheEntry) { cache[target.targetId] = result.cacheEntry; delete result.cacheEntry; }
    for (const key of ['receiptHash', 'cachedCandidates', 'originalRetrievedAt', 'sourceTimestamp', 'contentHash', 'conditionalBodyReused']) delete check[key];
    Object.assign(check, result);
    check.durationMs = performance.now() - sourceStarted;
    if (target.sourceId) {
      const sourceCheck = run.sourceChecks.find((entry) => entry.sourceId === target.sourceId);
      if (sourceCheck) {
        sourceCheck.state = result.state;
        sourceCheck.checkedAt = result.checkedAt;
        sourceCheck.outcome = result.outcome;
        sourceCheck.notes = result.notes;
        sourceCheck.blocker = result.blocker;
      }
    }
    if (check.state === 'complete') check.receiptHash = receiptHash(check);
    await onCheckpoint(run, cache);
  }, { concurrency, group: check => new URL(check.url).hostname, limits: Object.fromEntries(targets.map(t => [t.allowedHost, perDomain])) });
  for (const result of batch.results) if (result?.error) throw result.error;
  run.collectionTelemetry = { ...telemetry, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - started, successful: run.discoveryChecks.filter(c => c.state === 'complete').length - telemetry.reused, failed: run.discoveryChecks.filter(c => c.state !== 'complete').length };
  run.acquisitionTiming = { durationMs: performance.now() - started, peakConcurrency: batch.peak };

  run.coverage = evaluateSweepCoverage(run, { registry, entities, discoveryTargets: targets });
  run.complete = false;
  run.completedAt = null;
  return run;
  } finally { activeRuns.delete(run.runId); }
}

async function collectOne(target, { fetchImpl, checkedAt, timeoutMs, cached, onRequest }) {
  assertAutomaticTarget(target);
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let requestUrl = target.url;
    let response;
    let conditional = false;
    for (let hop = 0; hop <= 3; hop += 1) {
      conditional = Boolean(cached?.url === target.url && cached.responseUrl === requestUrl &&
        cached.contentHash === crypto.createHash('sha256').update(cached.body || '').digest('hex') &&
        (cached.etag || cached.lastModified) && Number.isFinite(Date.parse(cached.retrievedAt)) && Date.parse(cached.retrievedAt) <= Date.parse(checkedAt));
      onRequest();
      response = await fetchImpl(requestUrl, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          ...(conditional ? { ...(cached.etag ? { 'If-None-Match': cached.etag } : {}), ...(cached.lastModified ? { 'If-Modified-Since': cached.lastModified } : {}) } : {}),
          Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.9",
          "User-Agent": "royal-navy-fleet-status/0.2 public-index-discovery (+https://github.com/lukeroyle-beep/royal-navy-fleet-status)",
        },
      });
      const hopStatus = Number(response.status);
      if (hopStatus === 304) break;
      if (hopStatus < 300 || hopStatus >= 400) break;
      const location = response.headers?.get?.("location");
      if (!location) {
        return blocked("http-error", `${target.targetId} returned a redirect without Location.`, checkedAt, hopStatus);
      }
      const redirectUrl = new URL(location, requestUrl);
      if (redirectUrl.protocol !== "https:" || redirectUrl.hostname !== target.allowedHost) {
        return blocked(
          "terms-restriction",
          `${target.targetId} attempted a redirect outside its allowlisted publisher host.`,
          checkedAt,
          hopStatus,
        );
      }
      if (hop === 3) {
        return blocked("http-error", `${target.targetId} exceeded the redirect limit.`, checkedAt, hopStatus);
      }
      requestUrl = redirectUrl.toString();
    }
    const status = Number(response.status);
    if (status === 304) {
      if (!conditional || (response.url && response.url !== cached.responseUrl)) return blocked('http-error', '304 without verified cached body', checkedAt, status);
      assertResponseUrl(response.url || requestUrl, target);
      const candidates = extractCandidateUrls(cached.body, target);
      if (!candidates.length) return blocked('parse-empty', 'Cached index has no candidates', checkedAt, status);
      return { state: 'complete', checkedAt, outcome: 'not-modified', httpStatus: status, candidates, conditionalBodyReused: true, collectionMethod: 'automatic-index-get', notes: 'Conditional GET revalidated hashed cached index; article review still required.', blocker: null, contentHash: cached.contentHash, sourceTimestamp: cached.lastModified || null, originalRetrievedAt: cached.retrievedAt, bytes: 0 };
    }
    if (!response.ok) {
      const blockerType = status === 429 ? "rate-limited" : "http-error";
      const retryAfter = response.headers?.get?.('retry-after');
      const retryAfterMs = /^\d+$/.test(retryAfter || '') ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.parse(checkedAt)) || 0;
      return { ...blocked(blockerType, `${target.targetId} returned HTTP ${status}.`, checkedAt, status), retryAfterMs };
    }
    assertResponseUrl(response.url || requestUrl, target);
    const contentType = String(response.headers?.get?.("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return blocked(
        "invalid-content-type",
        `${target.targetId} returned ${contentType || "no content type"}.`,
        checkedAt,
        status,
      );
    }
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return blocked("http-error", `${target.targetId} exceeded the response-size limit.`, checkedAt, status);
    }
    let body;
    try {
      body = await readBoundedText(response);
    } catch (error) {
      if (error?.name === "ResponseSizeError") {
        return blocked("http-error", `${target.targetId} exceeded the response-size limit.`, checkedAt, status);
      }
      throw error;
    }
    const candidates = extractCandidateUrls(body, target);
    if (!candidates.length) {
      return blocked(
        "parse-empty",
        `${target.targetId} returned no allowlisted article links; its layout or feed may have changed.`,
        checkedAt,
        status,
      );
    }
    return {
      contentHash: crypto.createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body), sourceTimestamp: response.headers?.get?.('last-modified') || null,
      cacheEntry: { url: target.url, responseUrl: response.url || requestUrl, body, contentHash: crypto.createHash('sha256').update(body).digest('hex'), etag: response.headers?.get?.('etag') || null, lastModified: response.headers?.get?.('last-modified') || null, retrievedAt: checkedAt },
      state: "complete",
      checkedAt,
      outcome: "candidates-found",
      httpStatus: status,
      candidates,
      collectionMethod: "automatic-index-get",
      notes: "Completed one read-only GET of the configured allowlisted publisher index.",
      blocker: null,
    };
  } catch (error) {
    const type = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "network-error";
    const code = error?.cause?.code || error?.code;
    return { ...blocked(type, `${target.targetId}: request failed`, checkedAt, null), diagnostic: ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'dns' : type };
  }
}

export function extractCandidateUrls(body, target) {
  assertAutomaticTarget(target);
  const decoded = String(body)
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
  const raw = [];
  for (const match of decoded.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) raw.push(match[1]);
  for (const match of decoded.matchAll(/<link(?:\s[^>]*)?>([^<]+)<\/link>/gi)) raw.push(match[1].trim());
  for (const match of decoded.matchAll(/https:\/\/[^\s"'<>]+/gi)) raw.push(match[0]);

  const pattern = new RegExp(target.pathPattern);
  const urls = new Map();
  for (const value of raw) {
    let url;
    try {
      url = new URL(value, target.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== target.allowedHost || !pattern.test(url.pathname)) {
      continue;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    const canonical = url.toString();
    if (canonical === target.url) continue;
    urls.set(canonical, {
      url: canonical,
      contentHash: crypto.createHash("sha256").update(canonical).digest("hex"),
    });
    if (urls.size >= 250) break;
  }
  return [...urls.values()].sort((left, right) => left.url.localeCompare(right.url));
}

function assertAutomaticTarget(target) {
  if (
    !target ||
    target.required !== true ||
    !target.termsReviewedAt ||
    !target.lawfulUse ||
    !["feed", "html"].includes(target.contentKind)
  ) {
    throw new Error("Collector target lacks an approved public-index policy.");
  }
  const url = new URL(target.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== target.allowedHost ||
    /(^|\.)x\.com$/i.test(url.hostname) ||
    /(^|\.)twitter\.com$/i.test(url.hostname)
  ) {
    throw new Error(`Collector refuses non-public-index target ${target.targetId || target.url}.`);
  }
}

async function readBoundedText(response) {
  if (!response.body?.getReader) {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) throw responseSizeError();
    return body;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw responseSizeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function responseSizeError() {
  const error = new Error("Response exceeded the configured byte limit.");
  error.name = "ResponseSizeError";
  return error;
}

function assertResponseUrl(value, target) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== target.allowedHost) {
    throw new Error(`${target.targetId} redirected outside its allowlisted publisher host.`);
  }
}

function blocked(type, message, checkedAt, httpStatus) {
  return {
    state: "blocked",
    checkedAt: null,
    outcome: null,
    httpStatus,
    candidates: [],
    collectionMethod: null,
    notes: null,
    blocker: createBlocker(type, message, checkedAt),
  };
}

function safeMessage(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n]+/g, " ").slice(0, 300) || "network request failed";
}

function receiptHash(check) {
  return digest({ requestBinding: check.requestBinding, contentHash: check.contentHash, checkedAt: check.checkedAt, candidates: check.candidates, conditionalBodyReused: check.conditionalBodyReused === true, collectionMethod: check.collectionMethod, sourceTimestamp: check.sourceTimestamp || null, originalRetrievedAt: check.originalRetrievedAt || null });
}
