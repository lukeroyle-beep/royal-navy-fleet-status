import crypto from "node:crypto";

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

export async function collectPublicIndexes(
  run,
  {
    registry,
    entities,
    fetchImpl = globalThis.fetch,
    checkedAt = new Date().toISOString(),
    targets = PUBLIC_INDEX_TARGETS,
  },
) {
  if (typeof fetchImpl !== "function") throw new Error("Public-index collection requires fetch.");
  const targetById = new Map(targets.map((entry) => [entry.targetId, entry]));

  for (const check of run.discoveryChecks) {
    const target = targetById.get(check.targetId);
    if (!target) continue;
    const result = await collectOne(target, { fetchImpl, checkedAt });
    Object.assign(check, result);
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
  }

  run.coverage = evaluateSweepCoverage(run, { registry, entities, discoveryTargets: targets });
  run.complete = false;
  run.completedAt = null;
  return run;
}

async function collectOne(target, { fetchImpl, checkedAt }) {
  assertAutomaticTarget(target);
  try {
    const signal = AbortSignal.timeout(20_000);
    let requestUrl = target.url;
    let response;
    for (let hop = 0; hop <= 3; hop += 1) {
      response = await fetchImpl(requestUrl, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.9",
          "User-Agent": "royal-navy-fleet-status/0.2 public-index-discovery (+https://github.com/lukeroyle-beep/royal-navy-fleet-status)",
        },
      });
      const hopStatus = Number(response.status);
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
    if (!response.ok) {
      const blockerType = status === 429 ? "rate-limited" : "http-error";
      return blocked(blockerType, `${target.targetId} returned HTTP ${status}.`, checkedAt, status);
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
    return blocked(type, `${target.targetId}: ${safeMessage(error)}`, checkedAt, null);
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
