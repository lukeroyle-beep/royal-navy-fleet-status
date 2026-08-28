import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

import {
  clusterEvidenceCandidates,
  extractEvidenceCandidate,
  findEvidenceContradictions,
  matchVesselCandidate,
} from "./evidence-processing.mjs";
import { collectableXAccounts, handleWithoutAt } from "./social-source-registry.mjs";
import { createBlocker, evaluateSweepCoverage, validateSweepRunShape } from "./sweep.mjs";

const execFile = promisify(execFileCallback);
const GLOBAL_FAILURES = new Set(["authentication", "credits-exhausted"]);
const PROVIDER_LIMIT =
  "The public endpoint returns a bounded popular-post sample, not a chronological or complete timeline.";

export async function collectXSocialStage({
  registry,
  entities,
  publicVessels = [],
  run,
  runner,
  cacheDir,
  collectedAt = new Date().toISOString(),
  maxAccounts = null,
  sourceIds = null,
  clock = () => new Date().toISOString(),
}) {
  validateSweepRunShape(run);
  requireTimestamp(collectedAt, "X collection start");
  if (typeof runner !== "function") throw new Error("X collection requires a provider runner.");
  if (typeof cacheDir !== "string" || !cacheDir.trim()) {
    throw new Error("X collection requires a private or ignored cache directory.");
  }
  if (maxAccounts !== null && (!Number.isInteger(maxAccounts) || maxAccounts < 1)) {
    throw new Error("X collection maxAccounts must be a positive integer when supplied.");
  }
  if (
    sourceIds !== null &&
    (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some((value) => typeof value !== "string" || !value.trim()))
  ) {
    throw new Error("X collection sourceIds must be a non-empty array when supplied.");
  }
  if (sourceIds !== null && new Set(sourceIds).size !== sourceIds.length) {
    throw new Error("X collection sourceIds must not contain duplicates.");
  }

  const configuredAccounts = collectableXAccounts(registry);
  const selectedAccounts = sourceIds === null
    ? configuredAccounts
    : configuredAccounts.filter((account) => sourceIds.includes(account.sourceId));
  if (sourceIds !== null) {
    const selectedIds = new Set(selectedAccounts.map((account) => account.sourceId));
    const unknown = sourceIds.filter((sourceId) => !selectedIds.has(sourceId));
    if (unknown.length) throw new Error(`Unknown or disabled X sourceIds: ${unknown.join(", ")}.`);
  }
  const accounts = maxAccounts === null ? selectedAccounts : selectedAccounts.slice(0, maxAccounts);
  const knownLocations = buildKnownLocationGazetteer(entities, publicVessels);
  const results = [];
  const posts = [];
  let terminalFailure = null;

  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(cacheDir, 0o700);
  for (const account of accounts) {
    if (terminalFailure) {
      const blockedAt = clock();
      results.push(blockedAccountResult(account, terminalFailure, blockedAt, true));
      applyAccountResultToSweep(run, results.at(-1));
      continue;
    }

    try {
      const response = await loadOrFetchAccount({
        account,
        run,
        runner,
        cacheDir,
        clock,
      });
      const normalized = normalizeAccountResponse({
        account,
        response: response.value,
        retrievedAt: response.retrievedAt,
        window: run.window,
        entities,
        officialSocialCoverage: registry.officialSocialCoverage,
        knownLocations,
      });
      const result = {
        sourceId: account.sourceId,
        handle: account.handle,
        classification: account.classification,
        scope: account.scope,
        required: account.required,
        state: "complete",
        checkedAt: response.retrievedAt,
        cached: response.cached,
        liveRequestAttempted: !response.cached,
        creditsCharged: response.cached ? 0 : creditsCharged(response.value),
        outcome: normalized.posts.length
          ? "candidates-found"
          : "no-in-range-candidates-in-provider-sample",
        returnedPostCount: normalized.returnedPostCount,
        inWindowPostCount: normalized.posts.length,
        invalidPostCount: normalized.invalidPostCount,
        blocker: null,
        coverageLimitation: PROVIDER_LIMIT,
      };
      results.push(result);
      posts.push(...normalized.posts);
      applyAccountResultToSweep(run, result);
    } catch (error) {
      const failure = classifyProviderError(error);
      const blockedAt = clock();
      const result = blockedAccountResult(account, failure, blockedAt, false);
      results.push(result);
      applyAccountResultToSweep(run, result);
      if (GLOBAL_FAILURES.has(failure.kind)) terminalFailure = failure;
    }
  }

  const deduplicated = deduplicateStablePosts(posts);
  const originClusters = clusterEvidenceCandidates(
    deduplicated.posts.map((post) => ({
      candidateId: post.candidateId,
      canonicalUrl: post.canonicalUrl,
      contentHash: post.contentHash,
      originId: post.originId,
    })),
  );
  const contradictions = findPostContradictions(deduplicated.posts);
  run.coverage = evaluateSweepCoverage(run, { registry, entities });

  const completedAt = clock();
  const blockedCount = results.filter((entry) => entry.state === "blocked").length;
  const completedCount = results.length - blockedCount;
  return {
    schemaVersion: "1.0.0",
    provider: "scrape-creators",
    platform: "x",
    endpoint: "twitter user-tweets",
    runId: run.runId,
    window: structuredClone(run.window),
    startedAt: collectedAt,
    completedAt,
    providerCoverage: {
      classification: "partial-popular-sample",
      completeTimeline: false,
      paginationAvailable: false,
      dateParameterAvailable: false,
      statement: PROVIDER_LIMIT,
    },
    accounts: results,
    posts: deduplicated.posts,
    originClusters,
    contradictions,
    summary: {
      configuredAccountCount: configuredAccounts.length,
      attemptedAccountCount: accounts.length,
      completedAccountCount: completedCount,
      blockedAccountCount: blockedCount,
      returnedPostCount: results.reduce((sum, entry) => sum + (entry.returnedPostCount || 0), 0),
      inWindowPostCount: results.reduce((sum, entry) => sum + (entry.inWindowPostCount || 0), 0),
      uniquePostCount: deduplicated.posts.length,
      duplicatePostCount: deduplicated.duplicateCount,
      evidenceEligiblePostCount: deduplicated.posts.filter((post) => post.interpretation.evidenceEligible).length,
      independentOriginCount: originClusters.length,
      duplicateOriginPostCount: originClusters.reduce((sum, cluster) => sum + cluster.duplicateCount, 0),
      liveRequestCount: results.filter((entry) => entry.liveRequestAttempted).length,
      creditsCharged: results.reduce((sum, entry) => sum + entry.creditsCharged, 0),
      classification: blockedCount === 0 ? "complete-partial-provider-sample" : completedCount ? "degraded" : "failed",
      publicationEligible: false,
      requiresHumanReview: true,
    },
  };
}

export function normalizeAccountResponse({
  account,
  response,
  retrievedAt,
  window,
  entities,
  officialSocialCoverage = [],
  knownLocations = [],
}) {
  requireTimestamp(retrievedAt, `${account.sourceId} retrieval time`);
  validateWindow(window);
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw providerError("invalid-response", "Provider response was not a JSON object.");
  }
  if (response.success === false) {
    throw providerError("provider-error", "Provider reported an unsuccessful response.");
  }
  const tweets = Array.isArray(response.tweets)
    ? response.tweets
    : Array.isArray(response.data?.tweets)
      ? response.data.tweets
      : null;
  if (!tweets) throw providerError("invalid-response", "Provider response contains no tweets array.");

  const posts = [];
  let invalidPostCount = 0;
  for (const tweet of tweets) {
    const normalized = normalizeTweet(tweet, account);
    if (!normalized) {
      invalidPostCount += 1;
      continue;
    }
    if (!withinWindow(normalized.publishedAt, window)) continue;

    const extracted = extractEvidenceCandidate({
      text: normalized.text,
      publishedAt: normalized.publishedAt,
      receivedAt: retrievedAt,
      locations: [],
    });
    const location = findExplicitLocation(normalized.text, knownLocations);
    const vesselMatches = findVesselMentions(
      normalized.text,
      entities.vessels,
      officialSocialCoverage,
      account,
    );
    const excerpt = compactExcerpt(normalized.text);
    posts.push({
      candidateId: `X_POST_${normalized.postId}`,
      postId: normalized.postId,
      canonicalUrl: normalized.canonicalUrl,
      originId: `X_POST_${normalized.repostOfPostId || normalized.postId}`,
      contentHash: sha256(normalizeForHash(normalized.text)),
      sourceClaim: {
        sourceId: account.sourceId,
        sourceClassification: account.classification,
        accountHandle: `@${account.handle}`,
        publishedAt: normalized.publishedAt,
        retrievedAt,
        excerpt,
        postType: normalized.postType,
        repostOfPostId: normalized.repostOfPostId,
        quotedPostId: normalized.quotedPostId,
      },
      interpretation: {
        vesselMatches,
        location: location
          ? {
              name: location.value,
              basis: "explicit",
              supportingText: location.text,
              maximumPublicPrecision: "region",
            }
          : null,
        eventTime: extracted.eventTime,
        activity: extracted.activityCandidate?.value || null,
        status: extracted.statusCandidate?.value || null,
        observationBasis: extracted.eventTime ? "explicit" : "unknown",
        confidence: "unknown",
        authorityTier: account.reliabilityTier,
        evidenceEligible: normalized.postType !== "repost",
        requiresHumanReview: true,
        interpretationStatement:
          "Machine-extracted candidate only; the source claim has not been accepted as a Royal Navy-confirmed location.",
      },
    });
  }
  return { returnedPostCount: tweets.length, invalidPostCount, posts };
}

export function findVesselMentions(text, vessels, officialSocialCoverage = [], account = {}) {
  const matches = new Map();
  for (const vessel of vessels) {
    const identifiers = [
      ["canonical-name", vessel.name],
      ...(vessel.aliases || []).map((alias) => ["alias", alias]),
      ["pennant-number", vessel.pennantNumber],
    ].filter(([, value]) => typeof value === "string" && value.trim().length >= 3);
    for (const [basis, identifier] of identifiers.sort((left, right) => right[1].length - left[1].length)) {
      if (!containsIdentifier(text, identifier)) continue;
      const query = basis === "pennant-number" ? { pennantNumber: identifier } : { name: identifier };
      const resolved = matchVesselCandidate(query, vessels, officialSocialCoverage);
      if (resolved.state !== "matched" || resolved.vesselId !== vessel.vesselId) continue;
      if (!matches.has(vessel.vesselId)) {
        matches.set(vessel.vesselId, {
          vesselId: vessel.vesselId,
          vesselName: vessel.name,
          identifier,
          basis,
          explicit: true,
        });
      }
      break;
    }
  }

  if (!matches.size && account.vesselId) {
    const resolved = matchVesselCandidate({ vesselId: account.vesselId }, vessels, officialSocialCoverage);
    if (resolved.state === "matched") {
      matches.set(resolved.vesselId, {
        vesselId: resolved.vesselId,
        vesselName: resolved.candidates[0].name,
        identifier: `@${account.handle}`,
        basis: "account-context",
        explicit: false,
      });
    }
  }
  return [...matches.values()].sort((left, right) => left.vesselId.localeCompare(right.vesselId));
}

export function buildScrapeCreatorsArgs({ handle, outputPath }) {
  const normalizedHandle = handleWithoutAt(handle);
  if (typeof outputPath !== "string" || !outputPath.trim()) {
    throw new Error("Scrape Creators output path is required.");
  }
  return [
    "--json",
    "--clean",
    "--output",
    outputPath,
    "twitter",
    "user-tweets",
    "--handle",
    normalizedHandle,
    "--trim",
  ];
}

export function defaultScrapeCreatorsWrapperPath() {
  return path.join(os.homedir(), ".codex", "skills", "scrape-creators", "scripts", "scrapecreators");
}

export function createScrapeCreatorsRunner({
  wrapperPath = defaultScrapeCreatorsWrapperPath(),
  execute = execFile,
  timeoutMs = 60_000,
} = {}) {
  if (typeof wrapperPath !== "string" || !path.isAbsolute(wrapperPath)) {
    throw new Error("Scrape Creators wrapper path must be absolute.");
  }
  return async ({ account, outputPath }) => {
    const args = buildScrapeCreatorsArgs({ handle: account.handle, outputPath });
    const wrapperEnvironment = { ...process.env };
    delete wrapperEnvironment.SCRAPECREATORS_API_KEY;
    try {
      await execute(wrapperPath, args, {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: timeoutMs,
        env: wrapperEnvironment,
      });
    } catch (error) {
      throw classifyCommandFailure(error);
    }
    let response;
    try {
      response = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch {
      throw providerError("invalid-response", "Provider output was missing or invalid JSON.");
    }
    return response;
  };
}

export function writeJsonAtomic(targetPath, value) {
  const resolved = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, resolved);
}

function normalizeTweet(tweet, account) {
  if (!tweet || typeof tweet !== "object" || Array.isArray(tweet)) return null;
  const legacy = tweet.legacy || tweet.tweet?.legacy || {};
  const postId = stringValue(tweet.rest_id, tweet.id_str, legacy.id_str, tweet.id);
  const text = stringValue(legacy.full_text, tweet.full_text, tweet.text, tweet.note_tweet?.text);
  const publishedValue = stringValue(legacy.created_at, tweet.created_at, tweet.createdAt);
  const publishedTime = Date.parse(publishedValue);
  if (!postId || !/^\d+$/.test(postId) || !text || !Number.isFinite(publishedTime)) return null;

  const authorHandle = stringValue(
    tweet.core?.user_results?.result?.legacy?.screen_name,
    tweet.user?.screen_name,
    tweet.user?.username,
    account.handle,
  );
  const repost = nestedTweet(
    legacy.retweeted_status_result?.result,
    tweet.retweeted_status_result?.result,
    tweet.retweeted_tweet,
  );
  const quote = nestedTweet(
    tweet.quoted_status_result?.result,
    legacy.quoted_status_result?.result,
    tweet.quoted_tweet,
  );
  const repostOfPostId = repost ? stringValue(repost.rest_id, repost.id_str, repost.legacy?.id_str, repost.id) : null;
  const quotedPostId = quote ? stringValue(quote.rest_id, quote.id_str, quote.legacy?.id_str, quote.id) : null;
  const postType = repostOfPostId || /^RT\s+@/i.test(text) ? "repost" : quotedPostId ? "quote" : "original";
  return {
    postId,
    text,
    publishedAt: new Date(publishedTime).toISOString(),
    canonicalUrl: canonicalPostUrl(tweet.url, authorHandle, postId),
    postType,
    repostOfPostId,
    quotedPostId,
  };
}

function nestedTweet(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
}

function canonicalPostUrl(returnedUrl, handle, postId) {
  if (typeof returnedUrl === "string") {
    try {
      const url = new URL(returnedUrl);
      const match = /\/status\/(\d+)/.exec(url.pathname);
      if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) && match?.[1] === postId) {
        const pathParts = url.pathname.split("/").filter(Boolean);
        return `https://x.com/${pathParts[0]}/status/${postId}`;
      }
    } catch {
      // Fall through to the governed account handle.
    }
  }
  return `https://x.com/${handleWithoutAt(handle)}/status/${postId}`;
}

async function loadOrFetchAccount({ account, run, runner, cacheDir, clock }) {
  const cachePath = accountCachePath(cacheDir, account, run.window);
  const cached = readValidCache(cachePath, account, run.window, account.cacheHours, clock());
  if (cached) return { value: cached.response, retrievedAt: cached.retrievedAt, cached: true };

  const outputPath = `${cachePath}.${process.pid}.provider.tmp`;
  try {
    const value = await runner({ account, outputPath });
    const retrievedAt = clock();
    requireTimestamp(retrievedAt, `${account.sourceId} retrieval time`);
    writeJsonAtomic(cachePath, {
      schemaVersion: "1.0.0",
      sourceId: account.sourceId,
      handle: account.handle,
      window: structuredClone(run.window),
      retrievedAt,
      response: value,
    });
    return { value, retrievedAt, cached: false };
  } finally {
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
  }
}

function readValidCache(cachePath, account, window, cacheHours, now) {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const age = Date.parse(now) - Date.parse(cached.retrievedAt);
    if (
      cached.schemaVersion !== "1.0.0" ||
      cached.sourceId !== account.sourceId ||
      cached.handle.toLocaleLowerCase("en-GB") !== account.handle.toLocaleLowerCase("en-GB") ||
      JSON.stringify(cached.window) !== JSON.stringify(window) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > cacheHours * 3_600_000 ||
      !cached.response ||
      typeof cached.response !== "object"
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function accountCachePath(cacheDir, account, window) {
  const key = sha256(`${account.sourceId}\n${account.handle.toLocaleLowerCase("en-GB")}\n${window.from}\n${window.to}`)
    .slice(0, 16);
  return path.join(cacheDir, `${account.handle.toLocaleLowerCase("en-GB")}-${key}.json`);
}

function applyAccountResultToSweep(run, result) {
  const sourceCheck = run.sourceChecks.find((entry) => entry.sourceId === result.sourceId);
  if (!sourceCheck) return;
  if (result.state === "complete") {
    Object.assign(sourceCheck, {
      state: "complete",
      checkedAt: result.checkedAt,
      outcome: result.outcome,
      notes:
        `${result.cached ? "Reused the same-window local cache" : "Queried the public Scrape Creators X endpoint"}; ` +
        `${result.inWindowPostCount} in-window candidate(s). ${PROVIDER_LIMIT}`,
      blocker: null,
    });
    return;
  }
  Object.assign(sourceCheck, {
    state: "blocked",
    checkedAt: null,
    outcome: null,
    notes: "The X account check failed; other accounts continued and this source requires review or manual fallback.",
    blocker: createBlocker(blockerType(result.failureKind), result.failureMessage, result.blocker.at),
  });
}

function blockedAccountResult(account, failure, blockedAt, skippedAfterGlobalFailure) {
  return {
    sourceId: account.sourceId,
    handle: account.handle,
    classification: account.classification,
    scope: account.scope,
    required: account.required,
    state: "blocked",
    checkedAt: null,
    cached: false,
    liveRequestAttempted: !skippedAfterGlobalFailure,
    creditsCharged: 0,
    outcome: null,
    returnedPostCount: 0,
    inWindowPostCount: 0,
    invalidPostCount: 0,
    failureKind: failure.kind,
    failureMessage: safeFailureMessage(failure.kind, skippedAfterGlobalFailure),
    blocker: {
      type: blockerType(failure.kind),
      at: blockedAt,
    },
    coverageLimitation: PROVIDER_LIMIT,
  };
}

function classifyProviderError(error) {
  if (error?.providerKind) return { kind: error.providerKind };
  return { kind: "provider-error" };
}

function classifyCommandFailure(error) {
  const text = `${error?.message || ""} ${error?.stderr || ""}`.toLocaleLowerCase("en-GB");
  if (error?.code === 78 || /\b401\b|unauthori[sz]ed|api key is unavailable|authentication/.test(text)) {
    return providerError("authentication", "Authentication failed.");
  }
  if (/\b402\b|credits? (?:are )?exhausted|payment required/.test(text)) {
    return providerError("credits-exhausted", "Credits are exhausted.");
  }
  if (/\b403\b|forbidden|blocked resource/.test(text)) return providerError("resource-blocked", "Resource is blocked.");
  if (/\b404\b|not found|does not exist/.test(text)) return providerError("not-found", "Resource was not found.");
  if (/\b429\b|rate limit/.test(text)) return providerError("rate-limited", "Provider rate limited the request.");
  if (error?.killed || /timed? ?out/.test(text)) return providerError("timeout", "Provider request timed out.");
  if (/network|econn|enotfound|socket/.test(text)) return providerError("network", "Provider network request failed.");
  return providerError("provider-error", "Provider request failed.");
}

function providerError(kind, message) {
  const error = new Error(message);
  error.providerKind = kind;
  return error;
}

function blockerType(kind) {
  return {
    authentication: "authentication-required",
    "credits-exhausted": "credits-exhausted",
    "resource-blocked": "resource-blocked",
    "not-found": "not-found",
    "rate-limited": "rate-limited",
    timeout: "timeout",
    network: "network-error",
    "invalid-response": "invalid-response",
    "provider-error": "provider-error",
  }[kind] || "other";
}

function safeFailureMessage(kind, skippedAfterGlobalFailure) {
  const prefix = skippedAfterGlobalFailure ? "Not attempted after global provider failure: " : "";
  return `${prefix}${{
    authentication: "the locally stored Scrape Creators credential needs replacement",
    "credits-exhausted": "Scrape Creators credits are exhausted",
    "resource-blocked": "the public source blocked this resource",
    "not-found": "the account no longer exists or is not public",
    "rate-limited": "the provider rate limited the request",
    timeout: "the request timed out",
    network: "the provider could not be reached",
    "invalid-response": "the provider returned an invalid response",
    "provider-error": "the provider request failed",
  }[kind] || "the account could not be checked"}.`;
}

function deduplicateStablePosts(posts) {
  const byId = new Map();
  let duplicateCount = 0;
  for (const post of posts) {
    const existing = byId.get(post.postId);
    if (!existing) {
      byId.set(post.postId, { ...structuredClone(post), seenBySourceIds: [post.sourceClaim.sourceId] });
      continue;
    }
    duplicateCount += 1;
    existing.seenBySourceIds = [...new Set([
      ...existing.seenBySourceIds,
      post.sourceClaim.sourceId,
    ])].sort();
  }
  return {
    posts: [...byId.values()].sort((left, right) =>
      left.sourceClaim.publishedAt.localeCompare(right.sourceClaim.publishedAt) ||
      left.postId.localeCompare(right.postId),
    ),
    duplicateCount,
  };
}

function findPostContradictions(posts) {
  const candidates = posts.flatMap((post) =>
    post.interpretation.vesselMatches.map((match) => ({
      candidateId: `${post.candidateId}:${match.vesselId}`,
      vesselId: match.vesselId,
      eventTime: post.interpretation.eventTime,
      location: post.interpretation.location?.name || null,
      status: post.interpretation.status,
    })),
  );
  return findEvidenceContradictions(candidates);
}

function buildKnownLocationGazetteer(entities, publicVessels) {
  return [...new Set([
    ...(entities.vessels || []).map((vessel) => vessel.homePort),
    ...(publicVessels || []).flatMap((vessel) => [
      vessel.publicLocationLabel,
      vessel.lastReportedLocation,
      vessel.homePort,
    ]),
  ].filter((value) => typeof value === "string" && value.trim().length >= 3))]
    .filter((value) => !/^(?:unknown|withheld|no recent information)$/i.test(value.trim()))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function findExplicitLocation(text, knownLocations) {
  for (const value of knownLocations) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${textPattern(value)})(?=$|[^A-Za-z0-9])`, "i");
    const match = pattern.exec(text);
    if (match) return { value, text: match[2] };
  }
  return null;
}

function containsIdentifier(text, identifier) {
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9])${textPattern(identifier)}(?=$|[^A-Za-z0-9])`,
    "i",
  );
  return pattern.test(text);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textPattern(value) {
  return String(value).trim().split(/\s+/).map(escapeRegex).join("\\s+");
}

function compactExcerpt(text, maximumLength = 500) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maximumLength) return compact;
  return `${compact.slice(0, maximumLength - 1).trimEnd()}…`;
}

function normalizeForHash(text) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function withinWindow(value, window) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(window.from) && time < Date.parse(window.to);
}

function validateWindow(window) {
  requireTimestamp(window?.from, "X collection window start");
  requireTimestamp(window?.to, "X collection window end");
  if (Date.parse(window.from) >= Date.parse(window.to)) throw new Error("X collection window is reversed.");
}

function creditsCharged(response) {
  const value = Number(response?.credits_charged || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringValue(...values) {
  const value = values.find((entry) => typeof entry === "string" && entry.trim());
  return value ? value.trim() : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
