import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  clusterEvidenceCandidates,
  extractEvidenceCandidate,
  findEvidenceContradictions,
  matchVesselCandidate,
} from "./evidence-processing.mjs";
import { collectableXAccounts, handleWithoutAt } from "./social-source-registry.mjs";
import { createBlocker, evaluateSweepCoverage, validateSweepRunShape } from "./sweep.mjs";

export const X_BROWSER_SESSION_SCHEMA_VERSION = "1.0.0";
export const X_BROWSER_ARTIFACT_SCHEMA_VERSION = "1.0.0";

const SESSION_KIND = "rnfs-x-browser-session";
const TERMINAL_STATES = new Set([
  "checked",
  "unavailable",
  "blocked",
  "rate-limited",
  "failed",
]);
const ALL_STATES = new Set([...TERMINAL_STATES, "not-searched"]);
const BLOCKER_TYPES = new Set([
  "authentication-required",
  "challenge",
  "chrome-disconnected",
  "incomplete-render",
  "missing-profile",
  "navigation-failed",
  "rate-limited",
  "schema-failed",
  "unavailable",
  "other",
]);
const METHOD_KINDS = new Set(["x-search-latest", "x-profile-latest"]);
const POST_TYPES = new Set(["original", "quote", "repost"]);
const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
const COVERAGE_LIMIT =
  "Rendered public X search/profile results were inspected in signed-in Chrome with bounded navigation; this is not an exhaustive timeline API.";

export function createXBrowserSession({
  registry,
  run,
  sourceIds = null,
  scope = sourceIds === null ? "full" : "canary",
  createdAt = new Date().toISOString(),
}) {
  validateSweepRunShape(run);
  requireTimestamp(createdAt, "X browser session creation time");
  if (!["canary", "full"].includes(scope)) throw new Error("X browser scope must be canary or full.");
  if (scope === "full" && sourceIds !== null) {
    throw new Error("A full X browser session must derive every enabled account from the registry.");
  }
  const configuredAccounts = collectableXAccounts(registry);
  const accounts = selectAccounts(configuredAccounts, sourceIds);
  const accountRegistryHash = hashAccounts(configuredAccounts);
  const selectionHash = hashAccounts(accounts);
  const sessionId = `X_BROWSER_${run.runId}_${scope.toUpperCase()}_${selectionHash.slice(0, 12)}`;
  return {
    schemaVersion: X_BROWSER_SESSION_SCHEMA_VERSION,
    kind: SESSION_KIND,
    sessionId,
    runId: run.runId,
    scope,
    window: structuredClone(run.window),
    accountRegistryHash,
    selectionHash,
    createdAt,
    updatedAt: createdAt,
    policy: {
      browser: "chrome",
      renderedPublicPagesOnly: true,
      readOnly: true,
      exhaustiveTimelineClaimAllowed: false,
      automaticPublicationAllowed: false,
      privateBrowserStateCollectionAllowed: false,
      coverageLimitation: COVERAGE_LIMIT,
    },
    accounts: accounts.map((account) => ({
      ...structuredClone(account),
      state: "not-searched",
      checkedAt: null,
      outcome: null,
      method: null,
      observedPostCount: 0,
      inWindowPostCount: 0,
      outsideWindowPostCount: 0,
      invalidPostCount: 0,
      blocker: null,
    })),
    posts: [],
  };
}

export function assertSessionBinding(session, { registry, run }) {
  validateXBrowserSession(session);
  validateSweepRunShape(run);
  if (session.runId !== run.runId || !sameValue(session.window, run.window)) {
    throw new Error("X browser session does not match the sweep run and exact window.");
  }
  const configuredAccounts = collectableXAccounts(registry);
  if (session.accountRegistryHash !== hashAccounts(configuredAccounts)) {
    throw new Error("X browser session does not match the current enabled account registry.");
  }
  const selected = configuredAccounts.filter((account) =>
    session.accounts.some((entry) => entry.sourceId === account.sourceId),
  );
  if (session.selectionHash !== hashAccounts(selected)) {
    throw new Error("X browser session account selection is not registry-derived.");
  }
  for (const entry of session.accounts) {
    const current = selected.find((account) => account.sourceId === entry.sourceId);
    const progressKeys = [
      "state", "checkedAt", "outcome", "method", "observedPostCount", "inWindowPostCount",
      "outsideWindowPostCount", "invalidPostCount", "blocker",
    ];
    const accountOnly = Object.fromEntries(Object.entries(entry).filter(([key]) => !progressKeys.includes(key)));
    if (!current || !sameValue(accountOnly, current)) {
      throw new Error(`${entry.sourceId} session metadata no longer matches the registry.`);
    }
  }
  if (session.scope === "full" && session.accounts.length !== configuredAccounts.length) {
    throw new Error("A full X browser session does not contain every enabled registry profile.");
  }
  return session;
}

export function recordXBrowserObservation({
  session,
  registry,
  entities,
  publicVessels = [],
  run,
  observation,
}) {
  assertSessionBinding(session, { registry, run });
  const account = session.accounts.find((entry) => entry.sourceId === observation?.sourceId);
  if (!account) throw new Error("Browser observation sourceId is not selected in this session.");
  const normalized = normalizeBrowserObservation({
    observation,
    account,
    window: session.window,
    entities,
    officialSocialCoverage: registry.officialSocialCoverage,
    knownLocations: buildKnownLocationGazetteer(entities, publicVessels),
  });
  session.posts = session.posts.filter((post) => post.sourceClaim.sourceId !== account.sourceId);
  session.posts.push(...normalized.posts);
  Object.assign(account, normalized.accountResult);
  session.updatedAt = normalized.accountResult.checkedAt || normalized.accountResult.blocker.at;
  validateXBrowserSession(session);
  return session;
}

export function mergeXBrowserSessionProgress(target, source, { registry, run }) {
  assertSessionBinding(target, { registry, run });
  assertSessionBinding(source, { registry, run });
  if (target.accountRegistryHash !== source.accountRegistryHash || !sameValue(target.window, source.window)) {
    throw new Error("X browser sessions cannot be resumed across different registries or windows.");
  }
  for (const sourceAccount of source.accounts) {
    if (!TERMINAL_STATES.has(sourceAccount.state)) continue;
    const targetAccount = target.accounts.find((entry) => entry.sourceId === sourceAccount.sourceId);
    if (!targetAccount) continue;
    Object.assign(targetAccount, structuredClone(sourceAccount));
    target.posts = target.posts.filter((post) => post.sourceClaim.sourceId !== sourceAccount.sourceId);
    target.posts.push(...source.posts
      .filter((post) => post.sourceClaim.sourceId === sourceAccount.sourceId)
      .map((post) => structuredClone(post)));
  }
  target.updatedAt = [target.updatedAt, source.updatedAt].sort().at(-1);
  validateXBrowserSession(target);
  return target;
}

export function finalizeXBrowserSession({ session, registry, entities, run, completedAt = new Date().toISOString() }) {
  assertSessionBinding(session, { registry, run });
  requireTimestamp(completedAt, "X browser completion time");
  const pendingAccounts = session.accounts.filter((entry) => !TERMINAL_STATES.has(entry.state));
  if (pendingAccounts.length) {
    throw new Error(
      "X browser session cannot finalise until every selected profile has a terminal result: " +
      `${pendingAccounts.map((entry) => entry.sourceId).join(", ")}.`,
    );
  }
  const deduplicated = deduplicateStablePosts(session.posts);
  const originClusters = clusterEvidenceCandidates(
    deduplicated.posts.map((post) => ({
      candidateId: post.candidateId,
      canonicalUrl: post.canonicalUrl,
      contentHash: post.contentHash,
      originId: post.originId,
    })),
  );
  const contradictions = findPostContradictions(deduplicated.posts);
  for (const account of session.accounts) applyAccountResultToSweep(run, account, completedAt);
  run.coverage = evaluateSweepCoverage(run, { registry, entities });

  const configuredAccounts = collectableXAccounts(registry);
  const configuredRequired = configuredAccounts.filter((entry) => entry.required);
  const selectedRequired = session.accounts.filter((entry) => entry.required);
  const checkedRequired = selectedRequired.filter((entry) => entry.state === "checked");
  const requiredBlockers = selectedRequired.filter((entry) => entry.state !== "checked");
  const optionalBlockers = session.accounts.filter((entry) => !entry.required && entry.state !== "checked");
  const fullRequiredCoverage = session.scope === "full" &&
    selectedRequired.length === configuredRequired.length &&
    requiredBlockers.length === 0;
  const selectedRequiredCoverage = requiredBlockers.length === 0;
  const classification = session.scope === "canary" && selectedRequiredCoverage
    ? optionalBlockers.length ? "canary-passed-with-optional-blockers" : "canary-passed"
    : fullRequiredCoverage
      ? optionalBlockers.length ? "complete-with-optional-blockers" : "complete"
      : checkedRequired.length ? "partial" : "failed";
  const artifact = {
    schemaVersion: X_BROWSER_ARTIFACT_SCHEMA_VERSION,
    collector: "signed-in-chrome-rendered-public-pages",
    platform: "x",
    sessionId: session.sessionId,
    runId: run.runId,
    scope: session.scope,
    window: structuredClone(session.window),
    startedAt: session.createdAt,
    completedAt,
    policy: structuredClone(session.policy),
    accounts: structuredClone(session.accounts),
    posts: deduplicated.posts,
    originClusters,
    contradictions,
    summary: {
      configuredAccountCount: configuredAccounts.length,
      configuredRequiredAccountCount: configuredRequired.length,
      configuredOptionalAccountCount: configuredAccounts.length - configuredRequired.length,
      selectedAccountCount: session.accounts.length,
      selectedRequiredAccountCount: selectedRequired.length,
      checkedAccountCount: session.accounts.filter((entry) => entry.state === "checked").length,
      checkedRequiredAccountCount: checkedRequired.length,
      requiredBlockerCount: requiredBlockers.length,
      optionalBlockerCount: optionalBlockers.length,
      uniquePostCount: deduplicated.posts.length,
      duplicatePostCount: deduplicated.duplicateCount,
      evidenceEligiblePostCount: deduplicated.posts.filter((post) => post.interpretation.evidenceEligible).length,
      independentOriginCount: originClusters.length,
      duplicateOriginPostCount: originClusters.reduce((sum, cluster) => sum + cluster.duplicateCount, 0),
      classification,
      selectedRequiredCoverage,
      fullRequiredCoverage,
      publicationEligible: false,
      requiresHumanReview: true,
    },
  };
  validateXBrowserArtifact(artifact);
  return artifact;
}

export function summarizeXBrowserSession(session) {
  validateXBrowserSession(session);
  const counts = Object.fromEntries([...ALL_STATES].sort().map((state) => [
    state,
    session.accounts.filter((entry) => entry.state === state).length,
  ]));
  return {
    schemaVersion: session.schemaVersion,
    sessionId: session.sessionId,
    runId: session.runId,
    scope: session.scope,
    window: structuredClone(session.window),
    counts,
    next: session.accounts.find((entry) => entry.state === "not-searched") || null,
    accounts: session.accounts.map((entry) => ({
      sourceId: entry.sourceId,
      handle: entry.handle,
      required: entry.required,
      state: entry.state,
      outcome: entry.outcome,
      blocker: entry.blocker,
    })),
  };
}

export function validateXBrowserSession(session) {
  if (!session || session.schemaVersion !== X_BROWSER_SESSION_SCHEMA_VERSION || session.kind !== SESSION_KIND) {
    throw new Error(`X browser session must use ${SESSION_KIND} schema ${X_BROWSER_SESSION_SCHEMA_VERSION}.`);
  }
  for (const field of ["sessionId", "runId", "accountRegistryHash", "selectionHash"]) requireNonEmpty(session[field], field);
  if (!/^[a-f0-9]{64}$/.test(session.accountRegistryHash) || !/^[a-f0-9]{64}$/.test(session.selectionHash)) {
    throw new Error("X browser session contains an invalid registry hash.");
  }
  validateWindow(session.window);
  requireTimestamp(session.createdAt, "X browser createdAt");
  requireTimestamp(session.updatedAt, "X browser updatedAt");
  if (!["canary", "full"].includes(session.scope)) throw new Error("X browser session scope is invalid.");
  if (!session.policy?.renderedPublicPagesOnly || !session.policy?.readOnly || session.policy?.browser !== "chrome") {
    throw new Error("X browser session policy is not Chrome-only, rendered-public, and read-only.");
  }
  if (!Array.isArray(session.accounts) || !session.accounts.length) throw new Error("X browser session has no accounts.");
  assertUnique(session.accounts.map((entry) => entry.sourceId), "session sourceId");
  for (const entry of session.accounts) {
    if (!ALL_STATES.has(entry.state)) throw new Error(`${entry.sourceId} has an invalid browser state.`);
    if (entry.state === "checked") {
      requireTimestamp(entry.checkedAt, `${entry.sourceId} checkedAt`);
      if (!entry.method || entry.blocker !== null) throw new Error(`${entry.sourceId} checked state is incomplete.`);
    } else if (entry.state === "not-searched") {
      if (entry.checkedAt !== null || entry.method !== null || entry.blocker !== null) {
        throw new Error(`${entry.sourceId} not-searched state contains terminal data.`);
      }
    } else {
      if (entry.checkedAt !== null || entry.method !== null || !entry.blocker) {
        throw new Error(`${entry.sourceId} blocker state is incomplete.`);
      }
      validateBlocker(entry.blocker, entry.sourceId);
    }
  }
  if (!Array.isArray(session.posts)) throw new Error("X browser session posts must be an array.");
  return session;
}

export function validateXBrowserArtifact(artifact) {
  if (!artifact || artifact.schemaVersion !== X_BROWSER_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`X browser artifact must use schema ${X_BROWSER_ARTIFACT_SCHEMA_VERSION}.`);
  }
  if (artifact.collector !== "signed-in-chrome-rendered-public-pages" || artifact.platform !== "x") {
    throw new Error("X browser artifact collector identity is invalid.");
  }
  if (artifact.summary.publicationEligible !== false || artifact.summary.requiresHumanReview !== true) {
    throw new Error("X browser artifact must remain review-only and publication-ineligible.");
  }
  if (artifact.summary.fullRequiredCoverage && artifact.summary.requiredBlockerCount !== 0) {
    throw new Error("X browser artifact contradicts its required coverage state.");
  }
  return artifact;
}

export function writeJsonAtomic(targetPath, value) {
  const resolved = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, resolved);
  fs.chmodSync(resolved, 0o600);
}

function normalizeBrowserObservation({
  observation,
  account,
  window,
  entities,
  officialSocialCoverage,
  knownLocations,
}) {
  if (!observation || observation.schemaVersion !== "1.0.0") {
    throw new Error("Browser observation must use schemaVersion 1.0.0.");
  }
  if (observation.sourceId !== account.sourceId) throw new Error("Browser observation sourceId mismatch.");
  if (!ALL_STATES.has(observation.state) || observation.state === "not-searched") {
    throw new Error("A recorded browser observation must have a terminal state.");
  }
  if (observation.state !== "checked") return normalizeBlockedObservation(observation, account);
  requireTimestamp(observation.checkedAt, `${account.sourceId} observation checkedAt`);
  const method = validateMethod(observation.method, account, window);
  if (observation.blocker !== null && observation.blocker !== undefined) {
    throw new Error("A checked browser observation cannot contain a blocker.");
  }
  if (!Array.isArray(observation.posts)) throw new Error("Checked browser observation posts must be an array.");
  const posts = [];
  let invalidPostCount = 0;
  let outsideWindowPostCount = 0;
  for (const raw of observation.posts) {
    let post;
    try {
      post = normalizeRenderedPost({
        raw,
        account,
        retrievedAt: observation.checkedAt,
        entities,
        officialSocialCoverage,
        knownLocations,
      });
    } catch {
      invalidPostCount += 1;
      continue;
    }
    if (!withinWindow(post.sourceClaim.publishedAt, window)) {
      outsideWindowPostCount += 1;
      continue;
    }
    posts.push(post);
  }
  const uniquePosts = deduplicateStablePosts(posts).posts;
  return {
    accountResult: {
      state: "checked",
      checkedAt: new Date(Date.parse(observation.checkedAt)).toISOString(),
      outcome: uniquePosts.length ? "candidates-found" : "checked-no-findings",
      method,
      observedPostCount: observation.posts.length,
      inWindowPostCount: uniquePosts.length,
      outsideWindowPostCount,
      invalidPostCount,
      blocker: null,
    },
    posts: uniquePosts,
  };
}

function normalizeBlockedObservation(observation, account) {
  if (observation.checkedAt !== null && observation.checkedAt !== undefined) {
    throw new Error("A blocked browser observation cannot claim a valid check time.");
  }
  if (observation.method !== null && observation.method !== undefined) {
    throw new Error("A blocked browser observation cannot claim a completed method.");
  }
  if (Array.isArray(observation.posts) && observation.posts.length) {
    throw new Error("A blocked browser observation cannot retain posts.");
  }
  validateBlocker(observation.blocker, account.sourceId);
  return {
    accountResult: {
      state: observation.state,
      checkedAt: null,
      outcome: null,
      method: null,
      observedPostCount: 0,
      inWindowPostCount: 0,
      outsideWindowPostCount: 0,
      invalidPostCount: 0,
      blocker: structuredClone(observation.blocker),
    },
    posts: [],
  };
}

function validateMethod(method, account, window) {
  if (!method || !METHOD_KINDS.has(method.kind)) throw new Error("Browser method kind is invalid.");
  if (method.browser !== "chrome" || method.renderedPublicPage !== true || method.readOnly !== true) {
    throw new Error("Browser method must be rendered, public, Chrome-only, and read-only.");
  }
  const pageUrl = validatePublicXUrl(method.pageUrl, { allowSearch: true });
  if (!sameValue(method.window, window)) throw new Error("Browser method window does not match the sweep cutoff.");
  if (!Number.isInteger(method.scrollCount) || method.scrollCount < 0 || method.scrollCount > 12) {
    throw new Error("Browser method scrollCount must be an integer from 0 to 12.");
  }
  if (!Number.isInteger(method.visibleResultCount) || method.visibleResultCount < 0 || method.visibleResultCount > 200) {
    throw new Error("Browser method visibleResultCount must be an integer from 0 to 200.");
  }
  if (!Array.isArray(method.limitations) || !method.limitations.length ||
      method.limitations.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("Browser method must retain at least one coverage limitation.");
  }
  if (method.kind === "x-search-latest") {
    if (pageUrl.pathname.replace(/\/+$/, "") !== "/search") {
      throw new Error("X search method must use the rendered public search page.");
    }
    const query = String(method.query || "");
    if (!query.toLocaleLowerCase("en-GB").includes(`from:${account.handle}`.toLocaleLowerCase("en-GB"))) {
      throw new Error("X search method query does not bind the registry handle.");
    }
  } else {
    const segments = pageUrl.pathname.split("/").filter(Boolean);
    if (segments.length !== 1 || handleWithoutAt(segments[0]).toLocaleLowerCase("en-GB") !==
        account.handle.toLocaleLowerCase("en-GB")) {
      throw new Error("X profile method must use the selected account's rendered public profile page.");
    }
  }
  return structuredClone(method);
}

function normalizeRenderedPost({ raw, account, retrievedAt, entities, officialSocialCoverage, knownLocations }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Rendered post must be an object.");
  const postId = String(raw.postId || "").trim();
  if (!/^\d+$/.test(postId)) throw new Error("Rendered post has an invalid stable ID.");
  const canonicalUrl = validateCanonicalPostUrl(raw.canonicalUrl, postId);
  const text = normalizeForHash(raw.text);
  if (!text) throw new Error("Rendered post has no bounded text.");
  requireTimestamp(raw.publishedAt, "Rendered post publication time");
  const postType = raw.postType || "original";
  if (!POST_TYPES.has(postType)) throw new Error("Rendered post type is invalid.");
  const repostOfPostId = nullablePostId(raw.repostOfPostId, "repostOfPostId");
  const quotedPostId = nullablePostId(raw.quotedPostId, "quotedPostId");
  if (postType === "repost" && !repostOfPostId) throw new Error("Rendered repost lacks its original post ID.");
  const extracted = extractEvidenceCandidate({
    text,
    publishedAt: raw.publishedAt,
    receivedAt: retrievedAt,
    locations: [],
  });
  const location = findExplicitLocation(text, knownLocations);
  const vesselMatches = findVesselMentions(text, entities.vessels, officialSocialCoverage, account);
  return {
    candidateId: `X_POST_${postId}`,
    postId,
    canonicalUrl,
    originId: `X_POST_${repostOfPostId || postId}`,
    contentHash: sha256(text),
    sourceClaim: {
      sourceId: account.sourceId,
      sourceClassification: account.classification,
      accountHandle: `@${account.handle}`,
      publishedAt: new Date(Date.parse(raw.publishedAt)).toISOString(),
      retrievedAt: new Date(Date.parse(retrievedAt)).toISOString(),
      excerpt: compactExcerpt(text),
      postType,
      repostOfPostId,
      quotedPostId,
    },
    interpretation: {
      vesselMatches,
      location: location ? {
        name: location.value,
        basis: "explicit",
        supportingText: location.text,
        maximumPublicPrecision: "region",
      } : null,
      eventTime: extracted.eventTime,
      activity: extracted.activityCandidate?.value || null,
      status: extracted.statusCandidate?.value || null,
      observationBasis: extracted.eventTime ? "explicit" : "unknown",
      confidence: "unknown",
      authorityTier: account.reliabilityTier,
      evidenceEligible: postType !== "repost",
      reviewStatus: "pending-human-review",
      conflictStatus: "not-evaluated",
      requiresHumanReview: true,
      interpretationStatement:
        "Browser-rendered candidate only; the source claim has not been accepted as a Royal Navy-confirmed location or status.",
    },
  };
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

function selectAccounts(configuredAccounts, sourceIds) {
  if (sourceIds === null) return configuredAccounts;
  if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("X browser sourceIds must be a non-empty array when supplied.");
  }
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("X browser sourceIds must not contain duplicates.");
  const accounts = configuredAccounts.filter((account) => sourceIds.includes(account.sourceId));
  const found = new Set(accounts.map((account) => account.sourceId));
  const unknown = sourceIds.filter((sourceId) => !found.has(sourceId));
  if (unknown.length) throw new Error(`Unknown or disabled X sourceIds: ${unknown.join(", ")}.`);
  return accounts;
}

function hashAccounts(accounts) {
  return sha256(JSON.stringify(accounts.map((account) => ({
    sourceId: account.sourceId,
    vesselId: account.vesselId,
    canonicalUrl: account.canonicalUrl,
    handle: account.handle,
    classification: account.classification,
    scope: account.scope,
    required: account.required,
    reliabilityTier: account.reliabilityTier,
  }))));
}

function applyAccountResultToSweep(run, account, completedAt) {
  const check = run.sourceChecks.find((entry) => entry.sourceId === account.sourceId);
  if (!check) return;
  if (account.state === "checked") {
    Object.assign(check, {
      state: "complete",
      checkedAt: account.checkedAt,
      outcome: account.outcome,
      notes:
        `Inspected rendered public X results in signed-in Chrome; ${account.inWindowPostCount} in-window candidate(s). ${COVERAGE_LIMIT}`,
      blocker: null,
    });
    return;
  }
  const blocker = account.blocker || {
    type: "not-searched",
    message: "The required X profile was not searched in this browser session.",
    at: completedAt,
  };
  Object.assign(check, {
    state: "blocked",
    checkedAt: null,
    outcome: null,
    notes: "The required rendered-public-X check did not complete; no no-change or complete-coverage conclusion is permitted.",
    blocker: createBlocker(mapSweepBlocker(blocker.type), blocker.message, blocker.at),
  });
}

function mapSweepBlocker(type) {
  return {
    "authentication-required": "authentication-required",
    challenge: "resource-blocked",
    "chrome-disconnected": "network-error",
    "incomplete-render": "parse-empty",
    "missing-profile": "not-found",
    "navigation-failed": "network-error",
    "rate-limited": "rate-limited",
    "schema-failed": "invalid-response",
    unavailable: "resource-blocked",
    "not-searched": "other",
  }[type] || "other";
}

function validateBlocker(blocker, sourceId) {
  if (!blocker || !BLOCKER_TYPES.has(blocker.type)) throw new Error(`${sourceId} browser blocker type is invalid.`);
  requireNonEmpty(blocker.message, `${sourceId} blocker message`);
  requireTimestamp(blocker.at, `${sourceId} blocker time`);
}

function validateCanonicalPostUrl(value, postId) {
  const url = validatePublicXUrl(value);
  const match = /\/status\/(\d+)/.exec(url.pathname);
  if (match?.[1] !== postId) throw new Error("Rendered post URL does not match its stable ID.");
  const author = url.pathname.split("/").filter(Boolean)[0];
  return `https://x.com/${handleWithoutAt(author)}/status/${postId}`;
}

function validatePublicXUrl(value, { allowSearch = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Browser observation URL is invalid.");
  }
  if (url.protocol !== "https:" || !X_HOSTS.has(url.hostname.toLocaleLowerCase("en-GB"))) {
    throw new Error("Browser observation URL is not a public X HTTPS page.");
  }
  if (/\/(?:messages|settings|i\/bookmarks|compose)(?:\/|$)/i.test(url.pathname)) {
    throw new Error("Browser observation URL crosses the rendered-public-page boundary.");
  }
  if (!allowSearch && !/\/status\/\d+/.test(url.pathname)) throw new Error("Browser post URL is not canonical.");
  return url;
}

function nullablePostId(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
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
    existing.seenBySourceIds = [...new Set([...existing.seenBySourceIds, post.sourceClaim.sourceId])].sort();
  }
  return {
    posts: [...byId.values()].sort((left, right) =>
      left.sourceClaim.publishedAt.localeCompare(right.sourceClaim.publishedAt) || left.postId.localeCompare(right.postId)),
    duplicateCount,
  };
}

function findPostContradictions(posts) {
  return findEvidenceContradictions(posts.flatMap((post) =>
    post.interpretation.vesselMatches.map((match) => ({
      candidateId: `${post.candidateId}:${match.vesselId}`,
      vesselId: match.vesselId,
      eventTime: post.interpretation.eventTime,
      location: post.interpretation.location?.name || null,
      status: post.interpretation.status,
    }))));
}

function buildKnownLocationGazetteer(entities, publicVessels) {
  return [...new Set([
    ...(entities.vessels || []).map((vessel) => vessel.homePort),
    ...(publicVessels || []).flatMap((vessel) => [vessel.publicLocationLabel, vessel.lastReportedLocation, vessel.homePort]),
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
  return new RegExp(`(^|[^A-Za-z0-9])${textPattern(identifier)}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

function textPattern(value) {
  return String(value).trim().split(/\s+/).map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
}

function compactExcerpt(text, maximumLength = 500) {
  const compact = normalizeForHash(text);
  return compact.length <= maximumLength ? compact : `${compact.slice(0, maximumLength - 1).trimEnd()}…`;
}

function normalizeForHash(text) {
  return String(text || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function withinWindow(value, window) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(window.from) && time < Date.parse(window.to);
}

function validateWindow(window) {
  requireTimestamp(window?.from, "X browser window start");
  requireTimestamp(window?.to, "X browser window end");
  if (Date.parse(window.from) >= Date.parse(window.to)) throw new Error("X browser window is reversed.");
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp.`);
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}.`);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
