import crypto from "node:crypto";

import {
  PUBLIC_PROJECTION_METHOD_VERSION,
  createPublicProjection,
} from "./public-projection.mjs";

export const SWEEP_RUN_SCHEMA_VERSION = "2.0.0";
export const COVERAGE_GATE_EFFECTIVE_DATE = "2026-08-24";
export const COMPLETENESS_V2_EFFECTIVE_DATE = "2026-08-26";

const INTEGRITY_CHECK_DEFINITIONS = Object.freeze([
  ["prior-snapshot", "Authenticate the prior public snapshot and comparison baseline."],
  ["source-family-volume", "Review source-family result volumes for material anomalies."],
  ["cutoff", "Confirm every finding is evaluated against the recorded sweep cutoff."],
  ["late-discovery", "Reconcile pre-cutoff evidence discovered after the initial pass."],
  ["duplicate-origin", "Cluster duplicate, syndicated and common-origin discoveries."],
  ["contradiction", "Resolve or explicitly retain every contradictory candidate for review."],
]);

const RECURRING_MANUAL_SOURCE_IDS = new Set([
  "MARINEVESSELTRAFFIC_NATO_DISCOVERY",
  "PORTSMOUTH_HARBOUR_AUTHORITY",
  "RN_OFFICIAL_SHIPS",
]);

export const PUBLIC_INDEX_TARGETS = Object.freeze([
  target({
    targetId: "WESTWARD_SHIPPING_NEWS_FEED",
    sourceId: "WESTWARD_SHIPPING_NEWS_FEED",
    url: "https://westwardshippingnews.com/feed/",
    contentKind: "feed",
    allowedHost: "westwardshippingnews.com",
    pathPattern: "^/[^/]+/?$",
    termsReviewedAt: "2026-08-24",
  }),
  target({
    targetId: "GOVUK_MOD_ATOM",
    sourceId: "MOD_GOV_UK",
    url: "https://www.gov.uk/government/organisations/ministry-of-defence.atom",
    contentKind: "feed",
    allowedHost: "www.gov.uk",
    pathPattern: "^/(government|guidance|news|search|world)/",
  }),
  target({
    targetId: "NATO_NEWS_INDEX",
    sourceId: "NATO_NEWS",
    url: "https://www.nato.int/cps/en/natohq/news.htm",
    contentKind: "html",
    allowedHost: "www.nato.int",
    pathPattern: "^/(cps|en)/",
  }),
  target({
    targetId: "BABCOCK_NEWS_INDEX",
    sourceId: "BABCOCK_MARINE_NEWS",
    url: "https://www.babcockinternational.com/news/",
    contentKind: "html",
    allowedHost: "www.babcockinternational.com",
    pathPattern: "^/news/",
  }),
  target({
    targetId: "NAVY_LOOKOUT_FEED",
    sourceId: "NAVY_LOOKOUT_INDEX",
    url: "https://www.navylookout.com/feed/",
    contentKind: "feed",
    allowedHost: "www.navylookout.com",
    pathPattern: "^/[^/]+/?$",
  }),
  target({
    targetId: "FORCES_NEWS_NAVY_INDEX",
    sourceId: "FORCES_NEWS_NAVY_INDEX",
    url: "https://www.forcesnews.com/services/navy",
    contentKind: "html",
    allowedHost: "www.forcesnews.com",
    pathPattern: "^/services/navy/",
  }),
  target({
    targetId: "UK_DEFENCE_JOURNAL_FEED",
    sourceId: null,
    url: "https://ukdefencejournal.org.uk/feed/",
    contentKind: "feed",
    allowedHost: "ukdefencejournal.org.uk",
    pathPattern: "^/[^/]+/?$",
  }),
]);

const CHECK_STATES = new Set(["pending", "complete", "blocked"]);
const SOURCE_OUTCOMES = new Set([
  "checked-no-findings",
  "candidates-found",
  "no-in-range-candidates-in-provider-sample",
  "not-modified",
  "manual-review-complete",
]);
const DISCOVERY_OUTCOMES = new Set([
  "candidates-found",
  "not-modified",
  "manual-review-complete",
]);
const VESSEL_OUTCOMES = new Set([
  "unchanged",
  "updated",
  "unknown-retained",
  "withheld-policy",
]);
const BLOCKER_TYPES = new Set([
  "authentication-required",
  "credits-exhausted",
  "http-error",
  "invalid-response",
  "invalid-content-type",
  "manual-unavailable",
  "network-error",
  "not-found",
  "parse-empty",
  "provider-error",
  "rate-limited",
  "resource-blocked",
  "terms-restriction",
  "timeout",
  "other",
]);

export function createSweepQueue(registry, asOf) {
  requireTimestamp(asOf, "Sweep queue timestamp");
  return {
    schemaVersion: "1.0.0",
    generatedAt: asOf,
    collectionBoundary:
      "Collection is outside page requests. The GitHub collector reads only approved public indexes; governed public X accounts are checked separately on the trusted host through the Keychain-backed Scrape Creators wrapper.",
    discoveryTargets: PUBLIC_INDEX_TARGETS.map((entry) => ({
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      canonicalUrl: entry.url,
      contentKind: entry.contentKind,
      promotionPolicy: "discovery-only",
    })),
    sources: registry.sources
      .filter(isRequiredRecurringSource)
      .map((source) => ({
        sourceId: source.sourceId,
        vesselId: source.vesselId || null,
        category: source.category,
        canonicalUrl: source.canonicalUrl,
        accountHandle: source.accountHandle || null,
        collectionMode: source.collectionMode,
        manualReviewRequired: source.collectionMode !== "feed",
        promotionPolicy:
          source.category === "aggregator-discovery"
            ? "discovery-only"
            : "evidence-requires-temporal-and-origin-review",
      }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
}

export function isRequiredRecurringSource(source) {
  if (!source || source.enabled === false) return false;
  if (source.xCollection) {
    return source.xCollection.enabled === true && source.xCollection.required === true;
  }
  if (source.monitoring?.recurring === true) return true;
  if (["official-vessel-social", "official-organisation-social"].includes(source.category)) {
    return true;
  }
  return RECURRING_MANUAL_SOURCE_IDS.has(source.sourceId);
}

export function sweepWindowStartFromMetadata(metadata) {
  requireIsoDate(metadata?.asOfDate, "Published fleet dataset date");
  return `${metadata.asOfDate}T00:00:00Z`;
}

export function createSweepRun({
  registry,
  entities,
  assessmentLog = null,
  startedAt,
  windowStart,
  releaseRevision = 1,
  discoveryTargets = PUBLIC_INDEX_TARGETS,
}) {
  requireTimestamp(startedAt, "Sweep start");
  if (!Number.isInteger(releaseRevision) || releaseRevision < 1) {
    throw new Error("Sweep release revision must be a positive integer.");
  }
  if (windowStart === null || windowStart === undefined) {
    throw new Error("Sweep run requires an explicit window start.");
  }
  requireTimestamp(windowStart, "Sweep window start");
  if (Date.parse(windowStart) >= Date.parse(startedAt)) {
    throw new Error("Sweep window must start before its cut-off.");
  }
  if (!Array.isArray(entities?.vessels) || !entities.vessels.length) {
    throw new Error("Sweep run requires a canonical vessel roster.");
  }

  const requiredSources = registry.sources
    .filter(isRequiredRecurringSource)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const rosterIds = entities.vessels.map((vessel) => vessel.vesselId).sort();
  const registryHash = coverageSourceHash(registry, discoveryTargets);
  const rosterHash = sha256(stableJson(rosterIds));
  const coverageDate = startedAt.slice(0, 10);
  if (coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE && !assessmentLog) {
    throw new Error("Gate-effective sweep creation requires the current assessment baseline.");
  }
  const baselineProjectionVessels = assessmentLog
    ? createPublicProjection(entities, assessmentLog).vessels
    : null;
  const baselineAssessments = assessmentLog
    ? currentAssessmentsForRoster(assessmentLog, rosterIds)
    : null;
  const baselineAssessmentIds = baselineAssessments
    ? Object.fromEntries(
        baselineAssessments.map((assessment) => [assessment.vesselId, assessment.assessmentId]),
      )
    : null;
  const baselineReleaseMetadata = assessmentLog
    ? releaseIdentityFromMetadata(entities.metadata)
    : null;
  if (
    baselineReleaseMetadata &&
    Date.parse(windowStart) > Date.parse(`${baselineReleaseMetadata.asOfDate}T00:00:00Z`)
  ) {
    throw new Error("Sweep window does not cover the authenticated prior release date.");
  }
  const baselineStateHash =
    baselineProjectionVessels &&
    baselineAssessmentIds &&
    baselineAssessments &&
    baselineReleaseMetadata
    ? sha256(stableJson({
        baselineAssessmentIds,
        baselineAssessments,
        baselineProjectionVessels,
        baselineReleaseMetadata,
      }))
    : null;
  const runId = `SWEEP_${startedAt.replace(/[-:.]/g, "")}_R${releaseRevision}_${registryHash.slice(0, 8)}`;

  const run = {
    schemaVersion: SWEEP_RUN_SCHEMA_VERSION,
    runId,
    coverageDate,
    releaseTarget: {
      asOfDate: coverageDate,
      releaseRevision,
    },
    startedAt,
    completedAt: null,
    window: { from: windowStart, to: startedAt },
    sourceRegistryHash: registryHash,
    rosterHash,
    baselineStateHash,
    releaseContentHash: null,
    coverageInputs: {
      recurringSources: structuredClone(requiredSources),
      officialSocialCoverage: structuredClone(registry.officialSocialCoverage),
      discoveryTargets: structuredClone(discoveryTargets),
      rosterIds: structuredClone(rosterIds),
      baselineAssessmentIds,
      baselineAssessments,
      baselineProjectionVessels: structuredClone(baselineProjectionVessels),
      baselineReleaseMetadata,
    },
    collectionPolicy: {
      readOnly: true,
      automaticBoundary:
        "Configured public publisher indexes plus the separate governed public-X adapter on the trusted host",
      prohibitedAutomaticTargets: [
        "direct X page scraping",
        "private or logged-in social content",
        "manual sources",
        "unapproved commercial APIs",
      ],
      promotion: "Discovery only; no evidence ingestion, assessment or publication",
    },
    discoveryChecks: discoveryTargets.map((entry) => ({
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      url: entry.url,
      contentKind: entry.contentKind,
      required: true,
      state: "pending",
      checkedAt: null,
      outcome: null,
      httpStatus: null,
      candidates: [],
      collectionMethod: null,
      notes: null,
      blocker: null,
    })),
    sourceChecks: requiredSources.map((source) => ({
      sourceId: source.sourceId,
      vesselId: source.vesselId || null,
      category: source.category,
      collectionMode: source.collectionMode,
      canonicalUrl: source.canonicalUrl,
      accountHandle: source.accountHandle || null,
      required: true,
      state: "pending",
      checkedAt: null,
      outcome: null,
      notes: null,
      blocker: null,
    })),
    vesselOutcomes: rosterIds.map((vesselId) => ({
      vesselId,
      state: "pending",
      reviewedAt: null,
      outcome: null,
      evidenceIds: [],
      assessmentId: null,
      notes: null,
      blocker: null,
    })),
    integrityChecks: coverageDate >= COMPLETENESS_V2_EFFECTIVE_DATE
      ? createCompletenessIntegrityChecks()
      : null,
    coverage: null,
    complete: false,
    result: {
      classification: "partial",
      publicationEligible: false,
      evaluatedAt: null,
      reasons: ["Sweep collection and review are incomplete."],
    },
  };
  run.coverage = evaluateSweepCoverage(run, { registry, entities, discoveryTargets });
  return run;
}

export function createBlocker(type, message, at) {
  if (!BLOCKER_TYPES.has(type)) throw new Error(`Invalid sweep blocker type: ${type}.`);
  if (typeof message !== "string" || !message.trim()) throw new Error("Sweep blocker message is required.");
  requireTimestamp(at, "Sweep blocker timestamp");
  return { type, message: message.trim(), at };
}

export function validateSweepRunShape(run) {
  if (!run || run.schemaVersion !== SWEEP_RUN_SCHEMA_VERSION) {
    throw new Error(`Sweep run must use schemaVersion ${SWEEP_RUN_SCHEMA_VERSION}.`);
  }
  requireNonEmpty(run.runId, "Sweep runId");
  requireIsoDate(run.coverageDate, "Sweep coverageDate");
  if (
    !run.releaseTarget ||
    run.releaseTarget.asOfDate !== run.coverageDate ||
    !Number.isInteger(run.releaseTarget.releaseRevision) ||
    run.releaseTarget.releaseRevision < 1
  ) {
    throw new Error("Sweep run has an invalid release target.");
  }
  requireTimestamp(run.startedAt, "Sweep startedAt");
  if (run.coverageDate !== run.startedAt.slice(0, 10)) {
    throw new Error("Sweep coverageDate must match its start date.");
  }
  if (!run.window || run.window.to !== run.startedAt) {
    throw new Error("Sweep window must end at the exact sweep start instant.");
  }
  if (run.window.from === null || run.window.from === undefined) {
    throw new Error("Sweep run requires an explicit window start.");
  }
  requireTimestamp(run.window.from, "Sweep window start");
  if (Date.parse(run.window.from) >= Date.parse(run.startedAt)) {
    throw new Error("Sweep window must start before its cut-off.");
  }
  if (run.completedAt !== null) requireTimestamp(run.completedAt, "Sweep completedAt");
  if (run.completedAt && Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
    throw new Error("Sweep completedAt precedes startedAt.");
  }
  if (
    !run.collectionPolicy?.readOnly ||
    run.collectionPolicy?.promotion !== "Discovery only; no evidence ingestion, assessment or publication"
  ) {
    throw new Error("Sweep collection policy is not fail-closed and read-only.");
  }
  if (
    !/^[a-f0-9]{64}$/.test(run.sourceRegistryHash || "") ||
    !/^[a-f0-9]{64}$/.test(run.rosterHash || "")
  ) {
    throw new Error("Sweep run has invalid registry or roster hashes.");
  }
  if (
    run.baselineStateHash !== null &&
    run.baselineStateHash !== undefined &&
    !/^[a-f0-9]{64}$/.test(run.baselineStateHash || "")
  ) {
    throw new Error("Sweep run has an invalid baseline state hash.");
  }
  if (
    run.releaseContentHash !== null &&
    run.releaseContentHash !== undefined &&
    !/^[a-f0-9]{64}$/.test(run.releaseContentHash || "")
  ) {
    throw new Error("Sweep run has an invalid release content hash.");
  }
  if (
    run.coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE &&
    run.complete &&
    !/^[a-f0-9]{64}$/.test(run.releaseContentHash || "")
  ) {
    throw new Error("Completed sweep run is not bound to its release content.");
  }
  validateCapturedCoverageInputs(run);
  const expectedRunId =
    `SWEEP_${run.startedAt.replace(/[-:.]/g, "")}_R${run.releaseTarget.releaseRevision}_` +
    run.sourceRegistryHash.slice(0, 8);
  if (run.runId !== expectedRunId) throw new Error("Sweep runId does not match its immutable inputs.");
  validateCheckArray(run.discoveryChecks, "targetId");
  validateCheckArray(run.sourceChecks, "sourceId");
  validateIntegrityChecks(run.integrityChecks, run.coverageDate);
  if (!Array.isArray(run.vesselOutcomes) || !run.vesselOutcomes.length) {
    throw new Error("Sweep run has no vessel outcomes.");
  }
  assertUnique(run.vesselOutcomes.map((entry) => entry.vesselId), "vessel outcome");
  for (const entry of run.vesselOutcomes) {
    requireNonEmpty(entry.vesselId, "Vessel outcome vesselId");
    validateState(entry, VESSEL_OUTCOMES, `Vessel ${entry.vesselId}`);
    if (
      !Array.isArray(entry.evidenceIds) ||
      entry.evidenceIds.some((evidenceId) => typeof evidenceId !== "string" || !evidenceId.trim()) ||
      new Set(entry.evidenceIds).size !== entry.evidenceIds.length
    ) {
      throw new Error(`${entry.vesselId} has invalid evidenceIds.`);
    }
    if (entry.outcome === "updated" && !entry.evidenceIds.length) {
      throw new Error(`${entry.vesselId} is updated without evidenceIds.`);
    }
    if (entry.assessmentId !== null && entry.assessmentId !== undefined) {
      requireNonEmpty(entry.assessmentId, `${entry.vesselId} outcome assessmentId`);
    }
    if (
      run.complete &&
      run.coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE &&
      (typeof entry.assessmentId !== "string" || !entry.assessmentId.trim())
    ) {
      throw new Error(`${entry.vesselId} outcome is not bound to an assessment.`);
    }
    if (entry.state === "complete" && (typeof entry.notes !== "string" || !entry.notes.trim())) {
      throw new Error(`${entry.vesselId} has no review notes.`);
    }
  }
  validateRunEventTimestamps(run, run.completedAt);
  if (typeof run.complete !== "boolean") throw new Error("Sweep run complete must be boolean.");
  if (run.complete && !run.completedAt) throw new Error("Completed sweep has no completedAt timestamp.");
  return run;
}

export function evaluateSweepCoverage(
  run,
  { registry, entities, discoveryTargets = PUBLIC_INDEX_TARGETS, evidenceItems = null },
) {
  return evaluateSweepCoverageAgainstInputs(run, {
    registry,
    entities,
    discoveryTargets,
    evidenceItems,
    enforceInputHashes: true,
  });
}

export function evaluateStoredSweepCoverage(run, { evidenceItems = null } = {}) {
  validateSweepRunShape(run);
  if (run.coverageInputs) {
    return evaluateSweepCoverageAgainstInputs(run, {
      registry: {
        sources: run.coverageInputs.recurringSources,
        officialSocialCoverage: run.coverageInputs.officialSocialCoverage,
      },
      entities: {
        vessels: run.coverageInputs.rosterIds.map((vesselId) => ({ vesselId })),
      },
      discoveryTargets: run.coverageInputs.discoveryTargets,
      evidenceItems,
      enforceInputHashes: true,
    });
  }

  const legacySources = run.sourceChecks.map((check) => ({
    sourceId: check.sourceId,
    vesselId: check.vesselId,
    category: check.category,
    collectionMode: check.collectionMode,
    canonicalUrl: check.canonicalUrl,
    accountHandle: check.accountHandle,
    enabled: true,
    monitoring: { recurring: true },
  }));
  const legacyTargets = run.discoveryChecks.map((check) => ({
    targetId: check.targetId,
    sourceId: check.sourceId,
    url: check.url,
    contentKind: check.contentKind,
    allowedHost: new URL(check.url).hostname,
    pathPattern: "^/",
    required: true,
  }));
  return evaluateSweepCoverageAgainstInputs(run, {
    registry: { sources: legacySources, officialSocialCoverage: null },
    entities: { vessels: run.vesselOutcomes.map(({ vesselId }) => ({ vesselId })) },
    discoveryTargets: legacyTargets,
    evidenceItems,
    enforceInputHashes: false,
  });
}

function evaluateSweepCoverageAgainstInputs(
  run,
  {
    registry,
    entities,
    discoveryTargets,
    evidenceItems,
    enforceInputHashes,
  },
) {
  validateSweepRunShape(run);
  const reasons = [];
  const expectedVessels = entities.vessels.map((vessel) => vessel.vesselId).sort();
  const expectedSources = registry.sources
    .filter(isRequiredRecurringSource)
    .map((source) => source.sourceId)
    .sort();
  const expectedTargets = discoveryTargets.map((entry) => entry.targetId).sort();
  compareIds(
    run.vesselOutcomes.map((entry) => entry.vesselId),
    expectedVessels,
    "vessel outcomes",
    reasons,
  );
  const targetById = new Map(discoveryTargets.map((entry) => [entry.targetId, entry]));
  for (const check of run.discoveryChecks) {
    const expected = targetById.get(check.targetId);
    if (
      expected &&
      (check.sourceId !== expected.sourceId ||
        check.url !== expected.url ||
        check.contentKind !== expected.contentKind ||
        check.required !== true)
    ) {
      reasons.push(`${check.targetId} metadata does not match the approved discovery target`);
    }
    if (expected) {
      const pattern = new RegExp(expected.pathPattern);
      for (const candidate of check.candidates) {
        const candidateUrl = new URL(candidate.url);
        if (
          candidateUrl.protocol !== "https:" ||
          candidateUrl.hostname !== expected.allowedHost ||
          !pattern.test(candidateUrl.pathname)
        ) {
          reasons.push(`${check.targetId} has a candidate outside its approved publisher boundary`);
        }
      }
    }
  }
  const recurringById = new Map(
    registry.sources.filter(isRequiredRecurringSource).map((source) => [source.sourceId, source]),
  );
  for (const check of run.sourceChecks) {
    const expected = recurringById.get(check.sourceId);
    if (
      expected &&
      (check.vesselId !== (expected.vesselId || null) ||
        check.category !== expected.category ||
        check.collectionMode !== expected.collectionMode ||
        check.canonicalUrl !== expected.canonicalUrl ||
        check.accountHandle !== (expected.accountHandle || null) ||
        check.required !== true)
    ) {
      reasons.push(`${check.sourceId} metadata does not match the current source registry`);
    }
  }
  compareIds(
    run.sourceChecks.map((entry) => entry.sourceId),
    expectedSources,
    "source checks",
    reasons,
  );
  compareIds(
    run.discoveryChecks.map((entry) => entry.targetId),
    expectedTargets,
    "discovery checks",
    reasons,
  );
  if (enforceInputHashes) {
    if (run.sourceRegistryHash !== coverageSourceHash(registry, discoveryTargets)) {
      reasons.push("recurring source or discovery-target coverage changed after the run started");
    }
    if (run.rosterHash !== sha256(stableJson(expectedVessels))) {
      reasons.push("vessel roster changed after the run started");
    }
  } else if (run.rosterHash !== sha256(stableJson(expectedVessels))) {
    reasons.push("captured vessel outcomes do not match the stored roster hash");
  }

  const allChecks = [...run.discoveryChecks, ...run.sourceChecks];
  for (const entry of allChecks) {
    if (entry.required && entry.state !== "complete") {
      reasons.push(`${entry.targetId || entry.sourceId} is ${entry.state}`);
    }
  }
  if (run.coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE) {
    for (const entry of run.discoveryChecks.filter((check) => check.required)) {
      if (entry.collectionMethod !== "automatic-index-get") {
        reasons.push(`${entry.targetId} lacks a successful allowlisted index GET`);
      }
    }
  }
  for (const entry of run.vesselOutcomes) {
    if (entry.state !== "complete") reasons.push(`${entry.vesselId} outcome is ${entry.state}`);
  }
  for (const entry of run.integrityChecks || []) {
    if (entry.state !== "complete") reasons.push(`integrity check ${entry.checkId} is ${entry.state}`);
  }
  if (Array.isArray(evidenceItems)) {
    const evidenceById = new Map(evidenceItems.map((item) => [item.evidenceId, item]));
    for (const entry of run.vesselOutcomes) {
      for (const evidenceId of entry.evidenceIds) {
        if (evidenceById.get(evidenceId)?.vesselId !== entry.vesselId) {
          reasons.push(`${entry.vesselId} references invalid sweep evidence ${evidenceId}`);
        }
      }
    }
  }
  const coverage = {
    pass: reasons.length === 0,
    reasons,
    requiredDiscoveryChecks: run.discoveryChecks.filter((entry) => entry.required).length,
    completedDiscoveryChecks: run.discoveryChecks.filter(
      (entry) => entry.required && entry.state === "complete",
    ).length,
    requiredSourceChecks: run.sourceChecks.filter((entry) => entry.required).length,
    completedSourceChecks: run.sourceChecks.filter(
      (entry) => entry.required && entry.state === "complete",
    ).length,
    requiredVesselOutcomes: expectedVessels.length,
    completedVesselOutcomes: run.vesselOutcomes.filter((entry) => entry.state === "complete").length,
    blockerCount: [...allChecks, ...run.vesselOutcomes].filter((entry) => entry.state === "blocked").length,
  };
  if (Array.isArray(run.integrityChecks)) {
    coverage.completedIntegrityChecks = run.integrityChecks.filter(
      (entry) => entry.state === "complete",
    ).length;
    coverage.requiredIntegrityChecks = run.integrityChecks.length;
  }
  return coverage;
}

export function createCompletenessIntegrityChecks() {
  return INTEGRITY_CHECK_DEFINITIONS.map(([checkId, description]) => ({
    checkId,
    description,
    required: true,
    state: "pending",
    checkedAt: null,
    outcome: null,
    notes: null,
    blocker: null,
  }));
}

export function completeSweepIntegrityCheck(
  run,
  checkId,
  { checkedAt, outcome = "passed", notes },
) {
  requireTimestamp(checkedAt, `Integrity check ${checkId} completion`);
  if (!new Set(["passed", "reviewed-no-anomaly", "reconciled"]).has(outcome)) {
    throw new Error(`Integrity check ${checkId} has an invalid outcome.`);
  }
  if (typeof notes !== "string" || !notes.trim()) {
    throw new Error(`Integrity check ${checkId} requires review notes.`);
  }
  const check = run.integrityChecks?.find((entry) => entry.checkId === checkId);
  if (!check) throw new Error(`Unknown integrity check ${checkId}.`);
  Object.assign(check, {
    state: "complete",
    checkedAt,
    outcome,
    notes: notes.trim(),
    blocker: null,
  });
  return run;
}

export function classifySweepResult(run, coverage = run.coverage) {
  if (!coverage || typeof coverage.pass !== "boolean") {
    throw new Error("Sweep classification requires a coverage decision.");
  }
  if (coverage.pass) {
    const changed = run.vesselOutcomes.some((entry) => entry.outcome === "updated");
    return {
      classification: changed ? "complete-with-changes" : "complete-no-supported-changes",
      publicationEligible: true,
      reasons: [],
    };
  }

  const required = [
    ...run.discoveryChecks.filter((entry) => entry.required),
    ...run.sourceChecks.filter((entry) => entry.required),
    ...(run.integrityChecks || []).filter((entry) => entry.required),
  ];
  const blocked = required.filter((entry) => entry.state === "blocked");
  const complete = required.filter((entry) => entry.state === "complete");
  let classification = "partial";
  if (blocked.length && complete.length === 0) classification = "failed";
  else if (blocked.length) classification = "degraded";
  return {
    classification,
    publicationEligible: false,
    reasons: [...new Set(coverage.reasons)],
  };
}

export function findSourceFamilyVolumeAnomalies(currentCounts, baselineCounts, {
  minimumRatio = 0.25,
  maximumRatio = 4,
} = {}) {
  const families = [...new Set([
    ...Object.keys(currentCounts || {}),
    ...Object.keys(baselineCounts || {}),
  ])].sort();
  return families.flatMap((family) => {
    const current = Number(currentCounts?.[family] || 0);
    const baseline = Number(baselineCounts?.[family] || 0);
    if (baseline === 0) return [];
    const ratio = current / baseline;
    if (ratio >= minimumRatio && ratio <= maximumRatio) return [];
    return [{ family, current, baseline, ratio, state: "requires-review" }];
  });
}

export function findLateDiscoveredCandidates(candidates, cutoff) {
  requireTimestamp(cutoff, "Sweep cutoff");
  return (candidates || [])
    .filter((candidate) => {
      const publishedAt = Date.parse(candidate.publishedAt);
      const receivedAt = Date.parse(candidate.receivedAt || candidate.retrievedAt);
      return Number.isFinite(publishedAt) &&
        Number.isFinite(receivedAt) &&
        publishedAt <= Date.parse(cutoff) &&
        receivedAt > Date.parse(cutoff);
    })
    .map((candidate) => candidate.candidateId || candidate.evidenceId)
    .filter(Boolean)
    .sort();
}

export function validateReleaseSweepGate({
  runs,
  datasetDate,
  releaseRevision = 1,
  releasedAt = null,
  registry,
  entities,
  assessmentLog = null,
  evidenceItems = null,
}) {
  requireIsoDate(datasetDate, "Fleet dataset date");
  if (!Number.isInteger(releaseRevision) || releaseRevision < 1) {
    throw new Error("Fleet release revision must be a positive integer.");
  }
  if (releasedAt !== null) requireTimestamp(releasedAt, "Fleet release instant");
  if (datasetDate < COVERAGE_GATE_EFFECTIVE_DATE) {
    return { required: false, pass: true, runId: null, reasons: [] };
  }
  if (!assessmentLog) {
    throw new Error("Fleet release coverage requires the current assessment log.");
  }
  const entityReleaseRevision = Number.isInteger(entities?.metadata?.releaseRevision)
    ? entities.metadata.releaseRevision
    : 1;
  if (
    entities?.metadata?.asOfDate !== datasetDate ||
    entityReleaseRevision !== releaseRevision ||
    (releasedAt !== null && entities.metadata?.releasedAt !== releasedAt)
  ) {
    throw new Error("Fleet release identity does not match the canonical dataset metadata.");
  }
  const releaseContentHash = computeReleaseContentHash({
    entities,
    registry,
    assessmentLog,
    evidenceItems,
  });
  const candidates = runs
    .filter(
      (run) =>
        run.releaseTarget?.asOfDate === datasetDate &&
        run.releaseTarget?.releaseRevision === releaseRevision,
    )
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  if (!candidates.length) {
    return {
      required: true,
      pass: false,
      runId: null,
      reasons: [`no sweep run covers ${datasetDate} r${releaseRevision}`],
    };
  }
  const releaseInstant = releasedAt ? Date.parse(releasedAt) : null;
  const eligible = candidates.filter(
    (run) =>
      run.complete &&
      run.completedAt &&
      (releaseInstant === null || Date.parse(run.completedAt) <= releaseInstant),
  );
  if (!eligible.length) {
    return {
      required: true,
      pass: false,
      runId: null,
      reasons: [
        `no finalised sweep run for ${datasetDate} r${releaseRevision} was eligible at release`,
      ],
    };
  }

  const run = eligible[0];
  const coverage = evaluateSweepCoverage(run, { registry, entities, evidenceItems });
  const failures = [...coverage.reasons];
  if (!run.complete || !run.completedAt) failures.push(`${run.runId} is not finalised`);
  if (run.releaseContentHash !== releaseContentHash) {
    failures.push(`${run.runId} does not match the current release content`);
  }
  try {
    validateVesselOutcomeBindings(run, {
      entities,
      assessmentLog,
      evidenceItems,
      completedAt: run.completedAt,
      requireStoredBindings: true,
    });
  } catch (error) {
    failures.push(`${run.runId} has invalid outcome bindings: ${error.message}`);
  }
  if (!failures.length) {
    return { required: true, pass: true, runId: run.runId, reasons: [] };
  }
  return {
    required: true,
    pass: false,
    runId: null,
    reasons: [...new Set(failures)],
  };
}

export function finaliseSweepRun(
  run,
  { registry, entities, assessmentLog = null, evidenceItems = null, completedAt },
) {
  requireTimestamp(completedAt, "Sweep completion");
  validateSweepRunShape(run);
  if (run.complete || run.completedAt || run.releaseContentHash) {
    throw new Error(`${run.runId} is already finalised and cannot be rebound.`);
  }
  if (Date.parse(completedAt) < Date.parse(run.startedAt)) {
    throw new Error("Sweep completion precedes its start.");
  }
  validateRunEventTimestamps(run, completedAt);
  const coverage = evaluateSweepCoverage(run, { registry, entities, evidenceItems });
  let releaseContentHash = null;
  let outcomeBindings = null;
  if (coverage.pass && run.coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE) {
    if (!assessmentLog) {
      throw new Error("Gate-effective sweep finalisation requires the current assessment log.");
    }
    const entityReleaseRevision = Number.isInteger(entities.metadata?.releaseRevision)
      ? entities.metadata.releaseRevision
      : 1;
    if (
      entities.metadata?.asOfDate !== run.releaseTarget.asOfDate ||
      entityReleaseRevision !== run.releaseTarget.releaseRevision
    ) {
      throw new Error("Canonical release identity does not match the sweep release target.");
    }
    outcomeBindings = validateVesselOutcomeBindings(run, {
      entities,
      assessmentLog,
      evidenceItems,
      completedAt,
    });
    releaseContentHash = computeReleaseContentHash({
      entities,
      registry,
      assessmentLog,
      evidenceItems,
    });
  }
  run.coverage = coverage;
  run.complete = coverage.pass;
  run.completedAt = coverage.pass ? completedAt : null;
  run.releaseContentHash = coverage.pass ? releaseContentHash : null;
  run.result = {
    ...classifySweepResult(run, coverage),
    evaluatedAt: completedAt,
  };
  if (outcomeBindings) {
    for (const outcome of run.vesselOutcomes) {
      outcome.assessmentId = outcomeBindings.get(outcome.vesselId);
    }
  }
  return run;
}

export function computeReleaseContentHash({ entities, registry, assessmentLog, evidenceItems }) {
  if (
    !entities?.metadata ||
    !Array.isArray(entities.vessels) ||
    !Array.isArray(registry?.sources) ||
    !Array.isArray(registry?.officialSocialCoverage) ||
    !Array.isArray(assessmentLog?.assessments) ||
    !assessmentLog?.currentAssessmentIds ||
    !Array.isArray(evidenceItems)
  ) {
    throw new Error("Release content hash requires canonical entities, sources, evidence and assessments.");
  }
  const projection = createPublicProjection(entities, assessmentLog);
  const currentAssessments = currentAssessmentsForRoster(
    assessmentLog,
    entities.vessels.map((vessel) => vessel.vesselId),
  );
  const evidenceIds = [...new Set(currentAssessments.flatMap(assessmentEvidenceIds))].sort();
  const evidenceById = new Map(evidenceItems.map((item) => [item.evidenceId, item]));
  const currentEvidence = evidenceIds.map((evidenceId) => {
    const item = evidenceById.get(evidenceId);
    if (!item) throw new Error(`Release content is missing evidence ${evidenceId}.`);
    return item;
  });
  const sourceIds = [...new Set(currentEvidence.map((item) => item.sourceId))].sort();
  const sourceById = new Map(registry.sources.map((source) => [source.sourceId, source]));
  const currentSources = sourceIds.map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`Release content is missing source ${sourceId}.`);
    return source;
  });
  return sha256(stableJson({
    schemaVersion: "1.0.0",
    projectionMethodVersion: PUBLIC_PROJECTION_METHOD_VERSION,
    publicVessels: projection.vessels,
    currentAssessments,
    currentEvidence,
    currentSources,
  }));
}

export function validateSweepBaselineAgainstState(run, { entities, assessmentLog }) {
  validateSweepRunShape(run);
  if (!run.coverageInputs) return run;
  const rosterIds = entities.vessels.map((vessel) => vessel.vesselId).sort();
  const assessments = currentAssessmentsForRoster(assessmentLog, rosterIds);
  const assessmentIds = Object.fromEntries(
    assessments.map((assessment) => [assessment.vesselId, assessment.assessmentId]),
  );
  const projectionVessels = createPublicProjection(entities, assessmentLog).vessels;
  const releaseMetadata = releaseIdentityFromMetadata(entities.metadata);
  if (
    stableJson(run.coverageInputs.baselineAssessmentIds) !== stableJson(assessmentIds) ||
    stableJson(run.coverageInputs.baselineAssessments) !== stableJson(assessments) ||
    stableJson(run.coverageInputs.baselineProjectionVessels) !== stableJson(projectionVessels) ||
    stableJson(run.coverageInputs.baselineReleaseMetadata) !== stableJson(releaseMetadata)
  ) {
    throw new Error(`${run.runId} baseline does not match the authenticated pre-change state.`);
  }
  return run;
}

function validateVesselOutcomeBindings(
  run,
  { entities, assessmentLog, evidenceItems, completedAt, requireStoredBindings = false },
) {
  if (!completedAt) throw new Error("Outcome binding requires a sweep completion timestamp.");
  if (!Array.isArray(evidenceItems)) {
    throw new Error("Outcome binding requires the governed evidence ledger.");
  }
  const currentProjection = createPublicProjection(entities, assessmentLog);
  const baselineById = new Map(
    run.coverageInputs.baselineProjectionVessels.map((vessel) => [vessel.id, vessel]),
  );
  const currentById = new Map(currentProjection.vessels.map((vessel) => [vessel.id, vessel]));
  const assessmentById = new Map(
    assessmentLog.assessments.map((assessment) => [assessment.assessmentId, assessment]),
  );
  const baselineAssessmentByVessel = new Map(
    run.coverageInputs.baselineAssessments.map((assessment) => [assessment.vesselId, assessment]),
  );
  const evidenceById = new Map(evidenceItems.map((item) => [item.evidenceId, item]));
  const bindings = new Map();

  for (const outcome of run.vesselOutcomes) {
    const baseline = baselineById.get(outcome.vesselId);
    const current = currentById.get(outcome.vesselId);
    const currentAssessmentId = assessmentLog.currentAssessmentIds[outcome.vesselId];
    const currentAssessment = assessmentById.get(currentAssessmentId);
    const baselineAssessment = baselineAssessmentByVessel.get(outcome.vesselId);
    if (
      !baseline ||
      !current ||
      !baselineAssessment ||
      !currentAssessment ||
      currentAssessment.vesselId !== outcome.vesselId
    ) {
      throw new Error(`${outcome.vesselId} cannot be bound to the reviewed release state.`);
    }
    const changed = stableJson(baseline) !== stableJson(current);
    const expectedOutcome = changed
      ? "updated"
      : current.locationClassification === "unknown"
        ? "unknown-retained"
        : current.locationClassification === "withheld"
          ? "withheld-policy"
          : "unchanged";
    if (outcome.outcome !== expectedOutcome) {
      throw new Error(
        `${outcome.vesselId} outcome ${outcome.outcome} does not match derived ${expectedOutcome}.`,
      );
    }

    const baselineAssessmentId = run.coverageInputs.baselineAssessmentIds[outcome.vesselId];
    const assessmentChanged = currentAssessmentId !== baselineAssessmentId;
    if (!assessmentChanged && stableJson(currentAssessment) !== stableJson(baselineAssessment)) {
      throw new Error(`${outcome.vesselId} assessment was modified in place without a new ID.`);
    }
    if (changed && !assessmentChanged) {
      throw new Error(`${outcome.vesselId} changed state is not supported by a new assessment ID.`);
    }
    if (assessmentChanged) {
      const assessedAt = Date.parse(currentAssessment.assessedAt);
      if (
        !Number.isFinite(assessedAt) ||
        assessedAt < Date.parse(run.startedAt) ||
        assessedAt > Date.parse(completedAt) ||
        assessedAt > Date.parse(outcome.reviewedAt)
      ) {
        throw new Error(
          `${outcome.vesselId} current assessment is outside the reviewed sweep interval.`,
        );
      }
    }

    const referencedEvidence = new Set(assessmentEvidenceIds(currentAssessment));
    if (outcome.evidenceIds.some((evidenceId) => !referencedEvidence.has(evidenceId))) {
      throw new Error(`${outcome.vesselId} outcome evidence is not referenced by its assessment.`);
    }
    const expectedEvidenceIds = assessmentChanged
      ? [...new Set(currentAssessment.selectedEvidenceIds || [])].sort()
      : [];
    if (stableJson([...outcome.evidenceIds].sort()) !== stableJson(expectedEvidenceIds)) {
      throw new Error(`${outcome.vesselId} outcome evidence does not match its assessment revision.`);
    }
    if (assessmentChanged) {
      const assessedAt = Date.parse(currentAssessment.assessedAt);
      const reviewedAt = Date.parse(outcome.reviewedAt);
      const finalisedAt = Date.parse(completedAt);
      for (const evidenceId of expectedEvidenceIds) {
        const item = evidenceById.get(evidenceId);
        const retrievedAt = Date.parse(item?.retrievedAt);
        if (!item || item.vesselId !== outcome.vesselId || !Number.isFinite(retrievedAt)) {
          throw new Error(`${outcome.vesselId} selected evidence ${evidenceId} is invalid.`);
        }
        if (retrievedAt > assessedAt || retrievedAt > reviewedAt || retrievedAt > finalisedAt) {
          throw new Error(
            `${outcome.vesselId} selected evidence ${evidenceId} postdates its assessment or review.`,
          );
        }
      }
    }
    if (requireStoredBindings && outcome.assessmentId !== currentAssessmentId) {
      throw new Error(`${outcome.vesselId} stored assessment binding is stale or forged.`);
    }
    bindings.set(outcome.vesselId, currentAssessmentId);
  }
  return bindings;
}

function assessmentEvidenceIds(assessment) {
  return [
    ...(assessment.selectedEvidenceIds || []),
    ...(assessment.excludedEvidenceIds || []),
    ...(assessment.conflictingEvidenceIds || []),
  ];
}

function target(values) {
  return Object.freeze({
    ...values,
    required: true,
    termsReviewedAt: values.termsReviewedAt || "2026-08-23",
    lawfulUse: "One read-only weekly GET of a public publisher index; retain links and hashes only.",
  });
}

function validateCheckArray(entries, idField) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error(`Sweep run has no ${idField} checks.`);
  }
  assertUnique(entries.map((entry) => entry[idField]), idField);
  for (const entry of entries) {
    requireNonEmpty(entry[idField], `Sweep ${idField}`);
    validateState(entry, idField === "targetId" ? DISCOVERY_OUTCOMES : SOURCE_OUTCOMES, entry[idField]);
    if (idField === "targetId") {
      if (
        typeof entry.url !== "string" ||
        !entry.url.startsWith("https://") ||
        /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(new URL(entry.url).hostname)
      ) {
        throw new Error(`${entry.targetId} has an invalid public index URL.`);
      }
      if (!Array.isArray(entry.candidates)) {
        throw new Error(`${entry.targetId} has invalid candidates.`);
      }
      for (const candidate of entry.candidates) {
        let candidateUrl;
        try {
          candidateUrl = new URL(candidate.url);
        } catch {
          candidateUrl = null;
        }
        if (
          !candidateUrl ||
          candidateUrl.protocol !== "https:" ||
          /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(candidateUrl.hostname) ||
          !/^[a-f0-9]{64}$/.test(candidate.contentHash || "") ||
          candidate.contentHash !== sha256(candidate.url)
        ) {
          throw new Error(`${entry.targetId} has an invalid discovery candidate.`);
        }
      }
      assertUnique(entry.candidates.map((candidate) => candidate.url), `${entry.targetId} candidate URL`);
      if (entry.state === "complete") {
        if (!["automatic-index-get", "manual-search-index-review"].includes(entry.collectionMethod)) {
          throw new Error(`${entry.targetId} has an invalid collection method.`);
        }
        if (typeof entry.notes !== "string" || !entry.notes.trim()) {
          throw new Error(`${entry.targetId} has no collection notes.`);
        }
        if (entry.collectionMethod === "automatic-index-get") {
          const candidatesFound =
            Number.isInteger(entry.httpStatus) &&
            entry.httpStatus >= 200 &&
            entry.httpStatus < 300 &&
            entry.outcome === "candidates-found" &&
            entry.candidates.length > 0;
          const notModified =
            entry.httpStatus === 304 &&
            entry.outcome === "not-modified" &&
            entry.candidates.length === 0;
          if (!candidatesFound && !notModified) {
            throw new Error(`${entry.targetId} has an inconsistent automatic discovery result.`);
          }
        } else if (entry.outcome !== "manual-review-complete" || entry.httpStatus !== null) {
          throw new Error(`${entry.targetId} has an inconsistent manual discovery result.`);
        }
      }
    } else {
      if (typeof entry.canonicalUrl !== "string" || !entry.canonicalUrl.startsWith("https://")) {
        throw new Error(`${entry.sourceId} has an invalid review URL.`);
      }
      if (entry.state === "complete" && (typeof entry.notes !== "string" || !entry.notes.trim())) {
        throw new Error(`${entry.sourceId} has no review notes.`);
      }
    }
  }
}

function validateState(entry, completedOutcomes, label) {
  if (!CHECK_STATES.has(entry.state)) throw new Error(`${label} has invalid state.`);
  if (entry.state === "complete") {
    requireTimestamp(entry.checkedAt || entry.reviewedAt, `${label} completion timestamp`);
    if (!completedOutcomes.has(entry.outcome)) {
      throw new Error(`${label} has invalid completed outcome.`);
    }
    if (entry.blocker !== null) throw new Error(`${label} is complete but has a blocker.`);
  } else if (entry.state === "blocked") {
    validateBlocker(entry.blocker, label);
  } else if (entry.outcome !== null || entry.blocker !== null) {
    throw new Error(`${label} is pending with a result.`);
  }
}

function validateBlocker(blocker, label) {
  if (
    !blocker ||
    !BLOCKER_TYPES.has(blocker.type) ||
    typeof blocker.message !== "string" ||
    !blocker.message.trim()
  ) {
    throw new Error(`${label} has an invalid typed blocker.`);
  }
  requireTimestamp(blocker.at, `${label} blocker timestamp`);
}

function validateRunEventTimestamps(run, upperBound) {
  const startedAt = Date.parse(run.startedAt);
  const completedAt = upperBound === null ? null : Date.parse(upperBound);
  const groups = [
    [run.discoveryChecks, "checkedAt", "Discovery check"],
    [run.sourceChecks, "checkedAt", "Source check"],
    [run.vesselOutcomes, "reviewedAt", "Vessel outcome"],
    [run.integrityChecks || [], "checkedAt", "Integrity check"],
  ];

  for (const [entries, timestampField, groupLabel] of groups) {
    for (const entry of entries) {
      const label = entry.targetId || entry.sourceId || entry.vesselId;
      if (entry.state === "complete") {
        requireRunEventTimestamp(
          entry[timestampField],
          `${groupLabel} ${label}`,
          startedAt,
          completedAt,
        );
      }
      if (entry.blocker) {
        requireRunEventTimestamp(
          entry.blocker.at,
          `${groupLabel} ${label} blocker`,
          startedAt,
          completedAt,
        );
      }
    }
  }
}

function validateIntegrityChecks(entries, coverageDate) {
  if (
    coverageDate < COMPLETENESS_V2_EFFECTIVE_DATE &&
    (entries === null || entries === undefined)
  ) return;
  if (!Array.isArray(entries)) {
    throw new Error("Gate-effective sweep has no completeness integrity checks.");
  }
  const expectedIds = INTEGRITY_CHECK_DEFINITIONS.map(([checkId]) => checkId);
  if (JSON.stringify(entries.map((entry) => entry.checkId)) !== JSON.stringify(expectedIds)) {
    throw new Error("Sweep completeness integrity checks do not match the required set.");
  }
  for (const entry of entries) {
    validateState(entry, new Set(["passed", "reviewed-no-anomaly", "reconciled"]), `Integrity ${entry.checkId}`);
    if (entry.state === "complete" && (typeof entry.notes !== "string" || !entry.notes.trim())) {
      throw new Error(`Integrity ${entry.checkId} has no review notes.`);
    }
  }
}

function validateCapturedCoverageInputs(run) {
  const inputs = run.coverageInputs;
  if (!inputs) {
    if (run.coverageDate >= COVERAGE_GATE_EFFECTIVE_DATE) {
      throw new Error("Sweep run must capture the registry, discovery targets and roster inputs.");
    }
    return;
  }
  if (
    !Array.isArray(inputs.recurringSources) ||
    !Array.isArray(inputs.officialSocialCoverage) ||
    !Array.isArray(inputs.discoveryTargets) ||
    !Array.isArray(inputs.rosterIds) ||
    !inputs.baselineAssessmentIds ||
    typeof inputs.baselineAssessmentIds !== "object" ||
    !Array.isArray(inputs.baselineAssessments) ||
    !Array.isArray(inputs.baselineProjectionVessels) ||
    !inputs.baselineReleaseMetadata ||
    typeof inputs.baselineReleaseMetadata !== "object" ||
    !inputs.recurringSources.length ||
    !inputs.discoveryTargets.length ||
    !inputs.rosterIds.length ||
    !inputs.baselineAssessments.length ||
    !inputs.baselineProjectionVessels.length
  ) {
    throw new Error("Sweep run has invalid captured coverage inputs.");
  }
  const baselineRelease = releaseIdentityFromMetadata(inputs.baselineReleaseMetadata);
  if (
    stableJson(baselineRelease) !== stableJson(inputs.baselineReleaseMetadata) ||
    baselineRelease.asOfDate > run.coverageDate ||
    Date.parse(run.window.from) > Date.parse(`${baselineRelease.asOfDate}T00:00:00Z`)
  ) {
    throw new Error("Sweep run does not cover its authenticated prior release date.");
  }
  if (
    inputs.recurringSources.some((source) => typeof source?.sourceId !== "string") ||
    inputs.discoveryTargets.some((target) => typeof target?.targetId !== "string") ||
    inputs.rosterIds.some((vesselId) => typeof vesselId !== "string" || !vesselId.trim()) ||
    inputs.baselineAssessments.some(
      (assessment) =>
        typeof assessment?.assessmentId !== "string" ||
        !assessment.assessmentId.trim() ||
        typeof assessment?.vesselId !== "string" ||
        !assessment.vesselId.trim(),
    ) ||
    inputs.baselineProjectionVessels.some(
      (vessel) => typeof vessel?.id !== "string" || !vessel.id.trim(),
    )
  ) {
    throw new Error("Sweep run has malformed captured coverage inputs.");
  }
  assertUnique(inputs.recurringSources.map((source) => source.sourceId), "captured source");
  assertUnique(inputs.discoveryTargets.map((target) => target.targetId), "captured target");
  assertUnique(inputs.rosterIds, "captured vessel");
  assertUnique(
    inputs.baselineAssessments.map((assessment) => assessment.assessmentId),
    "baseline assessment",
  );
  assertUnique(
    inputs.baselineAssessments.map((assessment) => assessment.vesselId),
    "baseline assessment vessel",
  );
  assertUnique(inputs.baselineProjectionVessels.map((vessel) => vessel.id), "baseline vessel");

  const capturedRegistry = {
    sources: inputs.recurringSources,
    officialSocialCoverage: inputs.officialSocialCoverage,
  };
  if (run.sourceRegistryHash !== coverageSourceHash(capturedRegistry, inputs.discoveryTargets)) {
    throw new Error("Sweep run captured inputs do not match its registry hash.");
  }
  if (run.rosterHash !== sha256(stableJson([...inputs.rosterIds].sort()))) {
    throw new Error("Sweep run captured roster does not match its roster hash.");
  }
  if (
    run.baselineStateHash !== sha256(stableJson({
      baselineAssessmentIds: inputs.baselineAssessmentIds,
      baselineAssessments: inputs.baselineAssessments,
      baselineProjectionVessels: inputs.baselineProjectionVessels,
      baselineReleaseMetadata: inputs.baselineReleaseMetadata,
    }))
  ) {
    throw new Error("Sweep run captured baseline does not match its state hash.");
  }
  const baselineIds = inputs.baselineProjectionVessels.map((vessel) => vessel.id).sort();
  if (JSON.stringify(baselineIds) !== JSON.stringify([...inputs.rosterIds].sort())) {
    throw new Error("Sweep run captured baseline does not match its roster.");
  }
  if (
    JSON.stringify(Object.keys(inputs.baselineAssessmentIds).sort()) !==
    JSON.stringify([...inputs.rosterIds].sort())
  ) {
    throw new Error("Sweep run captured assessment baseline does not match its roster.");
  }
  const baselineAssessmentVessels = inputs.baselineAssessments
    .map((assessment) => assessment.vesselId)
    .sort();
  if (JSON.stringify(baselineAssessmentVessels) !== JSON.stringify([...inputs.rosterIds].sort())) {
    throw new Error("Sweep run captured assessment bodies do not match its roster.");
  }
  for (const assessment of inputs.baselineAssessments) {
    if (inputs.baselineAssessmentIds[assessment.vesselId] !== assessment.assessmentId) {
      throw new Error("Sweep run captured assessment IDs do not match their bodies.");
    }
  }
}

function currentAssessmentsForRoster(assessmentLog, rosterIds) {
  if (
    !Array.isArray(assessmentLog?.assessments) ||
    !assessmentLog?.currentAssessmentIds ||
    typeof assessmentLog.currentAssessmentIds !== "object"
  ) {
    throw new Error("Current assessment log is malformed.");
  }
  assertUnique(
    assessmentLog.assessments.map((assessment) => assessment.assessmentId),
    "assessment",
  );
  const assessmentById = new Map(
    assessmentLog.assessments.map((assessment) => [assessment.assessmentId, assessment]),
  );
  return [...rosterIds]
    .sort()
    .map((vesselId) => {
      const assessmentId = assessmentLog.currentAssessmentIds[vesselId];
      const assessment = assessmentById.get(assessmentId);
      if (!assessment || assessment.vesselId !== vesselId) {
        throw new Error(`Release content has no current assessment for ${vesselId}.`);
      }
      return structuredClone(assessment);
    });
}

function releaseIdentityFromMetadata(metadata) {
  requireIsoDate(metadata?.asOfDate, "Baseline release date");
  const releaseRevision = Number.isInteger(metadata.releaseRevision)
    ? metadata.releaseRevision
    : 1;
  if (releaseRevision < 1) throw new Error("Baseline release revision must be positive.");
  const releasedAt = metadata.releasedAt || null;
  if (releasedAt !== null) requireTimestamp(releasedAt, "Baseline release instant");
  return {
    asOfDate: metadata.asOfDate,
    releaseRevision,
    releasedAt,
  };
}

function requireRunEventTimestamp(value, label, startedAt, completedAt) {
  const timestamp = Date.parse(value);
  if (timestamp < startedAt) throw new Error(`${label} predates the sweep start.`);
  if (completedAt !== null && timestamp > completedAt) {
    throw new Error(`${label} occurs after the sweep completion.`);
  }
}

function compareIds(actual, expected, label, reasons) {
  const actualSorted = [...actual].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expected)) {
    reasons.push(`${label} do not match the current required set`);
  }
}

function assertUnique(values, label) {
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value)) throw new Error(`Duplicate ${label}: ${value}.`);
    ids.add(value);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function coverageSourceHash(registry, discoveryTargets) {
  return sha256(stableJson({
    recurringSources: registry.sources
      .filter(isRequiredRecurringSource)
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    officialSocialCoverage: registry.officialSocialCoverage,
    discoveryTargets,
  }));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}

function requireIsoDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO date.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be an ISO date.`);
  }
}
