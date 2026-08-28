import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { createSweepRun } from "./lib/sweep.mjs";
import {
  buildScrapeCreatorsArgs,
  collectXSocialStage,
  createScrapeCreatorsRunner,
  findVesselMentions,
} from "./lib/x-social-collection.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const sourceFixture = privateInputs.readJson("sources");
const assessments = privateInputs.readJson("assessments");
const publicProjection = JSON.parse(fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"));
const officialResponse = JSON.parse(
  fs.readFileSync(new URL("./fixtures/x-social/official-user-tweets.json", import.meta.url), "utf8"),
);
const osintResponse = JSON.parse(
  fs.readFileSync(new URL("./fixtures/x-social/osint-user-tweets.json", import.meta.url), "utf8"),
);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rnfs-x-social-test-"));

try {
  const registry = testRegistry();
  const run = sweepRun(registry);
  const calls = [];
  const runner = async ({ account }) => {
    calls.push(account.sourceId);
    return structuredClone(account.classification === "official" ? officialResponse : osintResponse);
  };
  const fixedClock = () => "2026-08-24T00:01:00Z";
  const artifact = await collectXSocialStage({
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    runner,
    cacheDir: path.join(temporaryRoot, "cache"),
    collectedAt: "2026-08-24T00:00:30Z",
    clock: fixedClock,
  });

  assert.deepEqual(calls, ["NAVY_LOOKOUT_SOCIAL", "X_HMS_DUNCAN"]);
  assert.equal(artifact.summary.attemptedAccountCount, 2);
  assert.equal(artifact.summary.completedAccountCount, 2);
  assert.equal(artifact.summary.blockedAccountCount, 0);
  assert.equal(artifact.summary.creditsCharged, 2);
  assert.equal(artifact.summary.liveRequestCount, 2);
  assert.equal(artifact.summary.inWindowPostCount, 6);
  assert.equal(artifact.summary.uniquePostCount, 5);
  assert.equal(artifact.summary.duplicatePostCount, 1);
  assert.equal(artifact.summary.evidenceEligiblePostCount, 3);
  assert.equal(artifact.summary.independentOriginCount, 4);
  assert.equal(artifact.summary.duplicateOriginPostCount, 1);
  assert.equal(artifact.summary.publicationEligible, false);
  assert.equal(fs.statSync(path.join(temporaryRoot, "cache")).mode & 0o777, 0o700);
  assert.equal(artifact.providerCoverage.completeTimeline, false);
  assert.equal(artifact.providerCoverage.paginationAvailable, false);
  assert.ok(artifact.posts.every((post) => post.interpretation.requiresHumanReview));
  assert.ok(artifact.posts.every((post) => !post.sourceClaim.excerpt.includes("before the weekly window")));
  assert.ok(artifact.posts.some((post) => post.postId === "1000000000000000002"), "Lower bound must be inclusive.");
  assert.ok(artifact.posts.some((post) =>
    post.interpretation.vesselMatches.some(
      (match) => match.vesselId === "hms-duncan" && match.basis === "pennant-number",
    ),
  ));
  assert.ok(artifact.posts.some((post) => post.interpretation.location?.basis === "explicit"));
  assert.ok(artifact.posts.some((post) =>
    post.sourceClaim.postType === "repost" && post.interpretation.evidenceEligible === false,
  ));
  assert.ok(artifact.originClusters.some((cluster) => cluster.candidateIds.length > 1));
  assert.ok(artifact.contradictions.some((entry) =>
    entry.vesselId === "hms-duncan" &&
    entry.fields.location.includes("plymouth sound") &&
    entry.fields.location.includes("portsmouth"),
  ));
  assert.equal(
    run.sourceChecks.find((check) => check.sourceId === "X_HMS_DUNCAN").state,
    "complete",
  );
  assert.equal(
    run.sourceChecks.some((check) => check.sourceId === "NAVY_LOOKOUT_SOCIAL"),
    false,
    "Optional OSINT collection must not become a hard release gate.",
  );

  const cachedArtifact = await collectXSocialStage({
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    runner,
    cacheDir: path.join(temporaryRoot, "cache"),
    collectedAt: "2026-08-24T00:02:00Z",
    clock: () => "2026-08-24T00:02:00Z",
  });
  assert.equal(calls.length, 2, "Same-window cache must avoid repeat credit usage.");
  assert.equal(cachedArtifact.summary.creditsCharged, 0);
  assert.equal(cachedArtifact.summary.liveRequestCount, 0);
  assert.ok(cachedArtifact.accounts.every((entry) => entry.cached));

  const differentWindowRun = createSweepRun({
    registry,
    entities,
    assessmentLog: assessments,
    startedAt: "2026-08-24T01:00:00Z",
    windowStart: "2026-08-17T00:00:00Z",
  });
  await collectXSocialStage({
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: differentWindowRun,
    runner,
    cacheDir: path.join(temporaryRoot, "cache"),
    collectedAt: "2026-08-24T01:00:30Z",
    clock: () => "2026-08-24T01:01:00Z",
  });
  assert.equal(calls.length, 4, "A different cutoff must not reuse the previous cache.");

  const failureRegistry = testRegistry({ includeFailingOfficial: true });
  const failureRun = sweepRun(failureRegistry);
  const failureCalls = [];
  const failureArtifact = await collectXSocialStage({
    registry: failureRegistry,
    entities,
    publicVessels: publicProjection.vessels,
    run: failureRun,
    runner: async ({ account }) => {
      failureCalls.push(account.sourceId);
      if (account.sourceId === "A_OFFICIAL_FAILURE") throw providerFailure("resource-blocked");
      return structuredClone(account.classification === "official" ? officialResponse : osintResponse);
    },
    cacheDir: path.join(temporaryRoot, "partial-cache"),
    collectedAt: "2026-08-24T00:00:30Z",
    clock: fixedClock,
  });
  assert.equal(failureCalls.length, 3, "One failed account must not abort remaining account checks.");
  assert.equal(failureArtifact.summary.classification, "degraded");
  assert.equal(failureArtifact.accounts.find((entry) => entry.sourceId === "A_OFFICIAL_FAILURE").state, "blocked");
  assert.equal(failureRun.sourceChecks.find((entry) => entry.sourceId === "X_HMS_DUNCAN").state, "complete");

  const authRun = sweepRun(failureRegistry);
  let authCalls = 0;
  const authArtifact = await collectXSocialStage({
    registry: failureRegistry,
    entities,
    publicVessels: publicProjection.vessels,
    run: authRun,
    runner: async () => {
      authCalls += 1;
      throw providerFailure("authentication");
    },
    cacheDir: path.join(temporaryRoot, "auth-cache"),
    collectedAt: "2026-08-24T00:00:30Z",
    clock: fixedClock,
  });
  assert.equal(authCalls, 1, "Authentication failure must not be retried across the account fan-out.");
  assert.equal(authArtifact.summary.liveRequestCount, 1);
  assert.ok(authArtifact.accounts.every((entry) => entry.state === "blocked"));
  assert.match(authArtifact.accounts[0].failureMessage, /credential needs replacement/i);

  const mentions = findVesselMentions(
    "HMS Duncan (D37) sailed with HMS Dragon.",
    entities.vessels,
    sourceFixture.officialSocialCoverage,
  );
  assert.deepEqual(mentions.map((entry) => entry.vesselId), ["hms-dragon", "hms-duncan"]);
  assert.deepEqual(
    findVesselMentions("No named vessel here.", entities.vessels, sourceFixture.officialSocialCoverage, {
      vesselId: "hms-duncan",
      handle: "HMSDuncan",
    }),
    [{
      vesselId: "hms-duncan",
      vesselName: "HMS Duncan",
      identifier: "@HMSDuncan",
      basis: "account-context",
      explicit: false,
    }],
  );

  const args = buildScrapeCreatorsArgs({
    handle: "@HMSDuncan",
    outputPath: path.join(temporaryRoot, "provider-output.json"),
  });
  assert.deepEqual(args.slice(-5), ["twitter", "user-tweets", "--handle", "HMSDuncan", "--trim"]);
  assert.equal(args.includes("--api-key"), false);
  assert.equal(args.some((value) => /cursor|cache-max-age/i.test(value)), false);
  await assert.rejects(
    () => collectXSocialStage({
      registry,
      entities,
      run: sweepRun(registry),
      runner,
      cacheDir: path.join(temporaryRoot, "duplicate-source-cache"),
      sourceIds: ["X_HMS_DUNCAN", "X_HMS_DUNCAN"],
    }),
    /must not contain duplicates/i,
  );

  const executed = [];
  const wrapperRunner = createScrapeCreatorsRunner({
    wrapperPath: "/tmp/synthetic-scrapecreators-wrapper",
    execute: async (wrapper, wrapperArgs, options) => {
      executed.push({ wrapper, wrapperArgs, options });
      const outputIndex = wrapperArgs.indexOf("--output");
      fs.writeFileSync(wrapperArgs[outputIndex + 1], JSON.stringify(officialResponse));
    },
  });
  const wrapperOutput = path.join(temporaryRoot, "wrapper-output.json");
  const wrapperResponse = await wrapperRunner({
    account: { handle: "HMSDuncan" },
    outputPath: wrapperOutput,
  });
  assert.equal(wrapperResponse.success, true);
  assert.equal(executed[0].wrapper, "/tmp/synthetic-scrapecreators-wrapper");
  assert.equal(executed[0].wrapperArgs.includes("--api-key"), false);
  assert.equal(Object.hasOwn(executed[0].options.env, "SCRAPECREATORS_API_KEY"), false);

  console.log("Fixture-driven public X collection, filtering, deduplication and failure tests passed.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function sweepRun(registry) {
  return createSweepRun({
    registry,
    entities,
    assessmentLog: assessments,
    startedAt: "2026-08-24T00:00:00Z",
    windowStart: "2026-08-17T00:00:00Z",
  });
}

function testRegistry({ includeFailingOfficial = false } = {}) {
  const sources = [
    officialSource("X_HMS_DUNCAN", "HMSDuncan", "vessel", "hms-duncan"),
    osintSource("NAVY_LOOKOUT_SOCIAL", "NavyLookout"),
  ];
  if (includeFailingOfficial) {
    sources.push(officialSource("A_OFFICIAL_FAILURE", "RoyalNavy", "organisation"));
  }
  return {
    schemaVersion: "1.1.0",
    sources,
    officialSocialCoverage: structuredClone(sourceFixture.officialSocialCoverage),
  };
}

function officialSource(sourceId, handle, scope, vesselId = null) {
  return {
    sourceId,
    category: scope === "vessel" ? "official-vessel-social" : "official-organisation-social",
    publisher: `@${handle}`,
    canonicalUrl: `https://x.com/${handle}`,
    accountHandle: `@${handle}`,
    vesselId,
    reliabilityTier: "A",
    collectionMode: "api",
    status: "enabled",
    enabled: true,
    officiality: {
      basis: "direct-official-page",
      verifiedByUrl: "https://www.royalnavy.mod.uk/organisation",
      verifiedAt: "2026-08-27T00:00:00Z",
      method: "Royal Navy page direct link",
    },
    xCollection: {
      handle,
      classification: "official",
      scope,
      enabled: true,
      required: true,
      reviewedAt: "2026-08-27T00:00:00Z",
      cacheHours: 24,
      disabledReason: null,
    },
  };
}

function osintSource(sourceId, handle) {
  return {
    sourceId,
    category: "recognised-osint",
    publisher: `@${handle}`,
    canonicalUrl: `https://x.com/${handle}`,
    accountHandle: `@${handle}`,
    reliabilityTier: "C",
    collectionMode: "api",
    status: "enabled",
    enabled: true,
    osintSelection: {
      reviewedAt: "2026-08-27T00:00:00Z",
      publicOnly: true,
      correctionsRequired: true,
      rationale: "Synthetic reputable maritime reporting source for collection tests.",
      evidenceUrls: ["https://example.invalid/about"],
    },
    xCollection: {
      handle,
      classification: "osint",
      scope: "organisation",
      enabled: true,
      required: false,
      reviewedAt: "2026-08-27T00:00:00Z",
      cacheHours: 24,
      disabledReason: null,
    },
  };
}

function providerFailure(kind) {
  const error = new Error("Synthetic provider failure.");
  error.providerKind = kind;
  return error;
}
