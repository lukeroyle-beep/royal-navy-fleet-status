import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { createSweepRun } from "./lib/sweep.mjs";
import {
  assertSessionBinding,
  createXBrowserSession,
  finalizeXBrowserSession,
  mergeXBrowserSessionProgress,
  recordXBrowserObservation,
  summarizeXBrowserSession,
  writeJsonAtomic,
} from "./lib/x-browser-collection.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const assessments = privateInputs.readJson("assessments");
const publicProjection = JSON.parse(
  fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"),
);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rnfs-x-browser-test-"));

try {
  const registry = testRegistry();
  const run = sweepRun(registry);
  const session = createXBrowserSession({
    registry,
    run,
    createdAt: "2026-08-31T00:00:10Z",
  });
  assert.equal(session.scope, "full");
  assert.equal(session.accounts.length, 2);
  assert.deepEqual(session.accounts.map((entry) => entry.sourceId), ["NAVY_LOOKOUT_SOCIAL", "X_HMS_DUNCAN"]);

  const officialObservation = checkedObservation({
    sourceId: "X_HMS_DUNCAN",
    handle: "HMSDuncan",
    posts: [
      post("1000000000000000001", "2026-08-23T00:00:00Z", "HMS Duncan (D37) entered Portsmouth."),
      post("1000000000000000001", "2026-08-23T00:00:00Z", "HMS Duncan (D37) entered Portsmouth."),
      post("1000000000000000002", "2026-08-30T23:59:59Z", "HMS Duncan departed Portsmouth."),
      post("1000000000000000003", "2026-08-31T00:00:00Z", "HMS Duncan crossed the cutoff."),
      {
        ...post("1000000000000000004", "2026-08-29T10:00:00Z", "RT HMS Duncan is in Portsmouth."),
        postType: "repost",
        repostOfPostId: "9000000000000000000",
      },
    ],
  });
  recordXBrowserObservation({
    session,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    observation: officialObservation,
  });
  const firstSnapshot = structuredClone(session);
  recordXBrowserObservation({
    session,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    observation: officialObservation,
  });
  assert.deepEqual(session, firstSnapshot, "Recording the same observation must be idempotent.");
  const official = session.accounts.find((entry) => entry.sourceId === "X_HMS_DUNCAN");
  assert.equal(official.state, "checked");
  assert.equal(official.observedPostCount, 5);
  assert.equal(official.inWindowPostCount, 3);
  assert.equal(official.outsideWindowPostCount, 1, "The exact upper cutoff must be excluded.");
  assert.equal(session.posts.length, 3, "Stable IDs must be deduplicated before persistence.");
  assert.ok(session.posts.every((entry) => entry.interpretation.requiresHumanReview));
  assert.ok(session.posts.every((entry) => entry.interpretation.reviewStatus === "pending-human-review"));
  assert.ok(session.posts.some((entry) =>
    entry.interpretation.vesselMatches.some((match) => match.vesselId === "hms-duncan")),
  );
  assert.ok(session.posts.some((entry) => entry.interpretation.location?.name === "Portsmouth"));
  assert.ok(session.posts.some((entry) => entry.sourceClaim.postType === "repost" && !entry.interpretation.evidenceEligible));

  recordXBrowserObservation({
    session,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run,
    observation: blockedObservation("NAVY_LOOKOUT_SOCIAL", "rate-limited", "rate-limited"),
  });
  const artifact = finalizeXBrowserSession({
    session,
    registry,
    entities,
    run,
    completedAt: "2026-08-31T00:05:00Z",
  });
  assert.equal(artifact.summary.fullRequiredCoverage, true);
  assert.equal(artifact.summary.requiredBlockerCount, 0);
  assert.equal(artifact.summary.optionalBlockerCount, 1);
  assert.equal(artifact.summary.classification, "complete-with-optional-blockers");
  assert.equal(artifact.summary.publicationEligible, false);
  assert.equal(run.sourceChecks.find((entry) => entry.sourceId === "X_HMS_DUNCAN").state, "complete");
  assert.equal(run.sourceChecks.some((entry) => entry.sourceId === "NAVY_LOOKOUT_SOCIAL"), false);
  assert.equal(artifact.originClusters.length, 3);

  const canaryRun = sweepRun(registry);
  const canary = createXBrowserSession({
    registry,
    run: canaryRun,
    sourceIds: ["X_HMS_DUNCAN"],
    scope: "canary",
    createdAt: "2026-08-31T00:00:10Z",
  });
  recordXBrowserObservation({
    session: canary,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: canaryRun,
    observation: officialObservation,
  });
  const resumed = createXBrowserSession({
    registry,
    run: canaryRun,
    createdAt: "2026-08-31T00:10:00Z",
  });
  mergeXBrowserSessionProgress(resumed, canary, { registry, run: canaryRun });
  assert.equal(resumed.accounts.find((entry) => entry.sourceId === "X_HMS_DUNCAN").state, "checked");
  assert.equal(resumed.accounts.find((entry) => entry.sourceId === "NAVY_LOOKOUT_SOCIAL").state, "not-searched");
  assert.equal(resumed.posts.length, canary.posts.length);
  assertSessionBinding(resumed, { registry, run: canaryRun });
  assert.throws(
    () => finalizeXBrowserSession({
      session: resumed,
      registry,
      entities,
      run: canaryRun,
      completedAt: "2026-08-31T00:11:00Z",
    }),
    /every selected profile has a terminal result: NAVY_LOOKOUT_SOCIAL/i,
    "A full session must not finalise while a selected optional profile is still pending.",
  );

  const blockedRun = sweepRun(registry);
  const blockedSession = createXBrowserSession({
    registry,
    run: blockedRun,
    createdAt: "2026-08-31T00:00:10Z",
  });
  recordXBrowserObservation({
    session: blockedSession,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: blockedRun,
    observation: blockedObservation("X_HMS_DUNCAN", "blocked", "challenge"),
  });
  recordXBrowserObservation({
    session: blockedSession,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: blockedRun,
    observation: checkedObservation({ sourceId: "NAVY_LOOKOUT_SOCIAL", handle: "NavyLookout", posts: [] }),
  });
  const blockedArtifact = finalizeXBrowserSession({
    session: blockedSession,
    registry,
    entities,
    run: blockedRun,
    completedAt: "2026-08-31T00:05:00Z",
  });
  assert.equal(blockedArtifact.summary.fullRequiredCoverage, false);
  assert.equal(blockedArtifact.summary.requiredBlockerCount, 1);
  assert.equal(blockedRun.sourceChecks.find((entry) => entry.sourceId === "X_HMS_DUNCAN").state, "blocked");
  assert.ok(blockedRun.coverage.completedSourceChecks < blockedRun.coverage.requiredSourceChecks);

  const status = summarizeXBrowserSession(blockedSession);
  assert.equal(status.counts.blocked, 1);
  assert.equal(status.counts.checked, 1);
  assert.equal(Object.hasOwn(status, "posts"), false, "Status output must not echo private excerpts.");

  const privateArtifact = path.join(temporaryRoot, "nested", "artifact.json");
  writeJsonAtomic(privateArtifact, artifact);
  assert.equal(fs.statSync(privateArtifact).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(privateArtifact)).mode & 0o077, 0);
  const publicJson = JSON.stringify(publicProjection);
  assert.equal(publicJson.includes("X_HMS_DUNCAN"), false);
  assert.equal(publicJson.includes("HMS Duncan (D37) entered Portsmouth"), false);

  const changedRegistry = structuredClone(registry);
  changedRegistry.sources.find((entry) => entry.sourceId === "X_HMS_DUNCAN").xCollection.required = false;
  assert.throws(
    () => assertSessionBinding(session, { registry: changedRegistry, run }),
    /current enabled account registry/i,
  );
  assert.throws(
    () => recordXBrowserObservation({
      session,
      registry,
      entities,
      publicVessels: publicProjection.vessels,
      run,
      observation: {
        ...officialObservation,
        method: { ...officialObservation.method, pageUrl: "https://x.com/messages" },
      },
    }),
    /public-page boundary/i,
  );
  assert.throws(
    () => recordXBrowserObservation({
      session,
      registry,
      entities,
      publicVessels: publicProjection.vessels,
      run,
      observation: {
        ...officialObservation,
        method: { ...officialObservation.method, pageUrl: "https://x.com/home" },
      },
    }),
    /rendered public search page/i,
  );

  const mismatchedQueryRun = sweepRun(registry);
  const mismatchedQuerySession = createXBrowserSession({
    registry,
    run: mismatchedQueryRun,
    sourceIds: ["X_HMS_DUNCAN"],
    scope: "canary",
    createdAt: "2026-08-31T00:20:00Z",
  });
  assert.throws(
    () => recordXBrowserObservation({
      session: mismatchedQuerySession,
      registry,
      entities,
      publicVessels: publicProjection.vessels,
      run: mismatchedQueryRun,
      observation: {
        ...officialObservation,
        method: {
          ...officialObservation.method,
          pageUrl: "https://x.com/search?q=from%3AUnrelatedAccount&f=live",
        },
      },
    }),
    /search page query does not match the declared browser method query/i,
  );

  const authorRun = sweepRun(registry);
  const authorSession = createXBrowserSession({
    registry,
    run: authorRun,
    sourceIds: ["X_HMS_DUNCAN"],
    scope: "canary",
    createdAt: "2026-08-31T00:20:00Z",
  });
  recordXBrowserObservation({
    session: authorSession,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: authorRun,
    observation: checkedObservation({
      sourceId: "X_HMS_DUNCAN",
      handle: "HMSDuncan",
      posts: [{
        ...post("1000000000000000005", "2026-08-29T12:00:00Z", "Unrelated account claim."),
        canonicalUrl: "https://x.com/OtherAccount/status/1000000000000000005",
      }],
    }),
  });
  assert.equal(authorSession.posts.length, 0, "A different author's original post must be rejected.");
  assert.equal(authorSession.accounts[0].invalidPostCount, 1);

  recordXBrowserObservation({
    session: authorSession,
    registry,
    entities,
    publicVessels: publicProjection.vessels,
    run: authorRun,
    observation: checkedObservation({
      sourceId: "X_HMS_DUNCAN",
      handle: "HMSDuncan",
      posts: [{
        ...post("1000000000000000006", "2026-08-29T12:05:00Z", "Reposted external account claim."),
        canonicalUrl: "https://x.com/OtherAccount/status/1000000000000000006",
        postType: "repost",
        repostOfPostId: "1000000000000000006",
      }],
    }),
  });
  assert.equal(authorSession.posts.length, 1, "A typed repost may retain its external canonical author.");
  assert.equal(authorSession.posts[0].sourceClaim.accountHandle, "@HMSDuncan");
  assert.equal(authorSession.posts[0].sourceClaim.canonicalAuthorHandle, "@OtherAccount");
  assert.equal(authorSession.posts[0].interpretation.evidenceEligible, false);

  console.log("Rendered-public-X normalization, resume, blocker, cutoff, dedupe, gate and exposure tests passed.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function sweepRun(registry) {
  return createSweepRun({
    registry,
    entities,
    assessmentLog: assessments,
    startedAt: "2026-08-31T00:00:00Z",
    windowStart: "2026-08-23T00:00:00Z",
  });
}

function checkedObservation({ sourceId, handle, posts }) {
  const query = `from:${handle} since:2026-08-23 until:2026-09-01`;
  return {
    schemaVersion: "1.0.0",
    sourceId,
    state: "checked",
    checkedAt: "2026-08-31T00:02:00Z",
    method: {
      kind: "x-search-latest",
      browser: "chrome",
      renderedPublicPage: true,
      readOnly: true,
      pageUrl: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`,
      query,
      window: { from: "2026-08-23T00:00:00Z", to: "2026-08-31T00:00:00Z" },
      scrollCount: 2,
      visibleResultCount: posts.length,
      limitations: ["Rendered search results are bounded and may omit public posts."],
    },
    blocker: null,
    posts,
  };
}

function blockedObservation(sourceId, state, type) {
  return {
    schemaVersion: "1.0.0",
    sourceId,
    state,
    checkedAt: null,
    method: null,
    posts: [],
    blocker: {
      type,
      message: `Synthetic ${type} blocker.`,
      at: "2026-08-31T00:03:00Z",
    },
  };
}

function post(postId, publishedAt, text) {
  return {
    postId,
    canonicalUrl: `https://x.com/HMSDuncan/status/${postId}`,
    publishedAt,
    text,
    postType: "original",
    repostOfPostId: null,
    quotedPostId: null,
  };
}

function testRegistry() {
  const sourceFixture = privateInputs.readJson("sources");
  return {
    schemaVersion: "1.1.0",
    sources: [
      officialSource("X_HMS_DUNCAN", "HMSDuncan", "vessel", "hms-duncan"),
      osintSource("NAVY_LOOKOUT_SOCIAL", "NavyLookout"),
    ],
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
    collectionMode: "browser",
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
    collectionMode: "browser",
    status: "enabled",
    enabled: true,
    osintSelection: {
      reviewedAt: "2026-08-27T00:00:00Z",
      publicOnly: true,
      correctionsRequired: true,
      rationale: "Synthetic reputable maritime reporting source for browser collection tests.",
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
