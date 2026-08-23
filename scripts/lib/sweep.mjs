import crypto from "node:crypto";

export const SWEEP_RUN_SCHEMA_VERSION = "2.0.0";
export const COVERAGE_GATE_EFFECTIVE_DATE = "2026-08-24";

const RECURRING_MANUAL_SOURCE_IDS = new Set([
  "MARINEVESSELTRAFFIC_NATO_DISCOVERY",
  "PORTSMOUTH_HARBOUR_AUTHORITY",
  "RN_OFFICIAL_SHIPS",
]);

export const PUBLIC_INDEX_TARGETS = Object.freeze([
  target({
    targetId: "ROYAL_NAVY_NEWS_INDEX",
    sourceId: "ROYAL_NAVY_NEWS_INDEX",
    url: "https://www.royalnavy.mod.uk/news",
    contentKind: "html",
    allowedHost: "www.royalnavy.mod.uk",
    pathPattern: "^/news/",
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
  "http-error",
  "invalid-content-type",
  "manual-unavailable",
  "network-error",
  "parse-empty",
  "rate-limited",
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
      "Collection is outside page requests. Public indexes may be read once for discovery; manual, X and API sources require external review and are never fetched by the collector.",
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
  const runId = `SWEEP_${startedAt.replace(/[-:.]/g, "")}_R${releaseRevision}_${registryHash.slice(0, 8)}`;

  const run = {
    schemaVersion: SWEEP_RUN_SCHEMA_VERSION,
    runId,
    coverageDate: startedAt.slice(0, 10),
    releaseTarget: {
      asOfDate: startedAt.slice(0, 10),
      releaseRevision,
    },
    startedAt,
    completedAt: null,
    window: { from: windowStart, to: startedAt },
    sourceRegistryHash: registryHash,
    rosterHash,
    collectionPolicy: {
      readOnly: true,
      automaticBoundary: "Configured public publisher indexes only",
      prohibitedAutomaticTargets: ["X account pages", "manual sources", "commercial APIs"],
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
      notes: null,
      blocker: null,
    })),
    coverage: null,
    complete: false,
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
  const expectedRunId =
    `SWEEP_${run.startedAt.replace(/[-:.]/g, "")}_R${run.releaseTarget.releaseRevision}_` +
    run.sourceRegistryHash.slice(0, 8);
  if (run.runId !== expectedRunId) throw new Error("Sweep runId does not match its immutable inputs.");
  validateCheckArray(run.discoveryChecks, "targetId");
  validateCheckArray(run.sourceChecks, "sourceId");
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
  if (run.sourceRegistryHash !== coverageSourceHash(registry, discoveryTargets)) {
    reasons.push("recurring source or discovery-target coverage changed after the run started");
  }
  if (run.rosterHash !== sha256(stableJson(expectedVessels))) {
    reasons.push("vessel roster changed after the run started");
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
  return {
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
}

export function validateReleaseSweepGate({
  runs,
  datasetDate,
  releaseRevision = 1,
  releasedAt = null,
  registry,
  entities,
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
  const candidates = runs
    .filter(
      (run) =>
        run.releaseTarget?.asOfDate === datasetDate &&
        run.releaseTarget?.releaseRevision === releaseRevision,
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  if (!candidates.length) {
    return {
      required: true,
      pass: false,
      runId: null,
      reasons: [`no sweep run covers ${datasetDate} r${releaseRevision}`],
    };
  }
  const run = candidates[0];
  const coverage = evaluateSweepCoverage(run, { registry, entities, evidenceItems });
  const completedBeforeRelease =
    !releasedAt || (run.completedAt && Date.parse(run.completedAt) <= Date.parse(releasedAt));
  if (coverage.pass && run.complete && run.completedAt && completedBeforeRelease) {
    return { required: true, pass: true, runId: run.runId, reasons: [] };
  }
  const failures = [...coverage.reasons];
  if (!run.complete) failures.push(`${run.runId} is not finalised`);
  if (run.completedAt && !completedBeforeRelease) {
    failures.push(`${run.runId} completed after the fleet release instant`);
  }
  return {
    required: true,
    pass: false,
    runId: null,
    reasons: [...new Set(failures)],
  };
}

export function finaliseSweepRun(run, { registry, entities, evidenceItems = null, completedAt }) {
  requireTimestamp(completedAt, "Sweep completion");
  validateSweepRunShape(run);
  if (Date.parse(completedAt) < Date.parse(run.startedAt)) {
    throw new Error("Sweep completion precedes its start.");
  }
  validateRunEventTimestamps(run, completedAt);
  const coverage = evaluateSweepCoverage(run, { registry, entities, evidenceItems });
  run.coverage = coverage;
  run.complete = coverage.pass;
  run.completedAt = coverage.pass ? completedAt : null;
  return run;
}

function target(values) {
  return Object.freeze({
    ...values,
    required: true,
    termsReviewedAt: "2026-08-23",
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
