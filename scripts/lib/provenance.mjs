import crypto from "node:crypto";

const CONFIDENCE_LEVELS = new Set(["high", "moderate", "low", "unknown"]);
const FRESHNESS_STATES = new Set(["current", "aging", "historical"]);
const RELIABILITY_TIERS = new Set(["A", "B", "C", "D"]);
const COLLECTION_MODES = new Set(["manual", "api", "feed"]);
const SOURCE_STATUSES = new Set([
  "enabled",
  "manual-only",
  "disabled",
  "legacy",
  "registry-only",
  "provisional",
]);
const SOURCE_CATEGORIES = new Set([
  "official-royal-navy",
  "official-rfa",
  "official-uk-government",
  "official-vessel-social",
  "official-organisation-social",
  "official-allied-or-nato",
  "port-harbour-dockyard",
  "defence-contractor",
  "licensed-ais",
  "verified-visual",
  "specialist-media",
  "local-or-national-media",
  "recognised-osint",
  "aggregator-discovery",
]);
const CLAIM_CONTEXT_DAYS = Object.freeze({
  transient: { current: 2, aging: 7 },
  "port-visit": { current: 2, aging: 7 },
  underway: { current: 1, aging: 3 },
  maintenance: { current: 90, aging: 365 },
  "static-location": { current: 365, aging: 1825 },
  status: { current: 30, aging: 120 },
  unknown: { current: 0, aging: 0 },
});
const RELIABILITY_RANK = Object.freeze({ A: 4, B: 3, C: 2, D: 1 });

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function validateSourceRegistry(registry, vesselIds = [], currentVesselIds = vesselIds) {
  if (!registry || registry.schemaVersion !== "1.0.0" || !Array.isArray(registry.sources)) {
    throw new Error("Source registry must use schemaVersion 1.0.0 and contain sources.");
  }

  const ids = new Set();
  for (const source of registry.sources) {
    requireNonEmpty(source.sourceId, "sourceId");
    if (ids.has(source.sourceId)) throw new Error(`Duplicate sourceId: ${source.sourceId}.`);
    ids.add(source.sourceId);
    if (!SOURCE_CATEGORIES.has(source.category)) {
      throw new Error(`${source.sourceId} has an invalid source category.`);
    }
    if (!RELIABILITY_TIERS.has(source.reliabilityTier)) {
      throw new Error(`${source.sourceId} has an invalid reliability tier.`);
    }
    if (!COLLECTION_MODES.has(source.collectionMode)) {
      throw new Error(`${source.sourceId} has an invalid collection mode.`);
    }
    if (!SOURCE_STATUSES.has(source.status) || typeof source.enabled !== "boolean") {
      throw new Error(`${source.sourceId} has an invalid source status.`);
    }
    requireHttps(source.canonicalUrl, `${source.sourceId} canonicalUrl`);
    if (source.vesselId && vesselIds.length && !vesselIds.includes(source.vesselId)) {
      throw new Error(`${source.sourceId} references unknown vessel ${source.vesselId}.`);
    }
    if (source.category === "official-vessel-social") {
      requireNonEmpty(source.accountHandle, `${source.sourceId} accountHandle`);
      requireHttps(source.officiality?.verifiedByUrl, `${source.sourceId} officiality URL`);
      requireTimestamp(source.officiality?.verifiedAt, `${source.sourceId} verifiedAt`);
      if (source.enabled && source.status !== "enabled") {
        throw new Error(`${source.sourceId} is enabled without enabled status.`);
      }
    }
  }

  if (!Array.isArray(registry.officialSocialCoverage)) {
    throw new Error("Source registry must contain officialSocialCoverage.");
  }
  const coverageIds = new Set();
  for (const entry of registry.officialSocialCoverage) {
    requireNonEmpty(entry.vesselId, "official social coverage vesselId");
    if (coverageIds.has(entry.vesselId)) {
      throw new Error(`Duplicate official social coverage for ${entry.vesselId}.`);
    }
    coverageIds.add(entry.vesselId);
    if (currentVesselIds.length && !currentVesselIds.includes(entry.vesselId)) {
      throw new Error(`Official social coverage references non-current vessel ${entry.vesselId}.`);
    }
    if (entry.enabled) {
      requireNonEmpty(entry.accountHandle, `${entry.vesselId} accountHandle`);
      requireHttps(entry.verifiedByUrl, `${entry.vesselId} verification URL`);
      const source = registry.sources.find(
        (candidate) => candidate.vesselId === entry.vesselId && candidate.accountHandle === entry.accountHandle,
      );
      if (!source?.enabled) {
        throw new Error(`${entry.vesselId} enabled coverage has no enabled registry source.`);
      }
    }
  }
  if (currentVesselIds.length && coverageIds.size !== currentVesselIds.length) {
    throw new Error(
      `Expected ${currentVesselIds.length} official social coverage rows, found ${coverageIds.size}.`,
    );
  }
  return registry;
}

export function validateEvidenceLog(log, sourceIds = [], vesselIds = []) {
  if (!log || log.schemaVersion !== "1.0.0" || !Array.isArray(log.evidence)) {
    throw new Error("Evidence log must use schemaVersion 1.0.0 and contain evidence.");
  }
  const ids = new Set();
  for (const item of log.evidence) {
    requireNonEmpty(item.evidenceId, "evidenceId");
    if (ids.has(item.evidenceId)) throw new Error(`Duplicate evidenceId: ${item.evidenceId}.`);
    ids.add(item.evidenceId);
    if (vesselIds.length && !vesselIds.includes(item.vesselId)) {
      throw new Error(`${item.evidenceId} references unknown vessel ${item.vesselId}.`);
    }
    if (sourceIds.length && !sourceIds.includes(item.sourceId)) {
      throw new Error(`${item.evidenceId} references unknown source ${item.sourceId}.`);
    }
    requireHttps(item.canonicalUrl, `${item.evidenceId} canonicalUrl`);
    requireTimestamp(item.retrievedAt, `${item.evidenceId} retrievedAt`);
    if (item.publishedAt !== null) requireTimestamp(item.publishedAt, `${item.evidenceId} publishedAt`);
    requireNonEmpty(item.originId, `${item.evidenceId} originId`);
    requireNonEmpty(item.collectionMethod, `${item.evidenceId} collectionMethod`);
    if (!/^[a-f0-9]{64}$/.test(item.contentHash || "")) {
      throw new Error(`${item.evidenceId} has an invalid content hash.`);
    }
    if (!item.claim || (!item.claim.location && !item.claim.status)) {
      throw new Error(`${item.evidenceId} contains no claim.`);
    }
    if (!item.observation || !["explicit", "inferred", "unknown", "legacy-conflated"].includes(item.observation.basis)) {
      throw new Error(`${item.evidenceId} has invalid observation semantics.`);
    }
    const { from, to } = item.observation;
    if ((from === null) !== (to === null)) {
      throw new Error(`${item.evidenceId} must provide both observation bounds or neither.`);
    }
    if (from !== null) {
      requireTimestamp(from, `${item.evidenceId} observation.from`);
      requireTimestamp(to, `${item.evidenceId} observation.to`);
      if (Date.parse(from) > Date.parse(to)) {
        throw new Error(`${item.evidenceId} observation range is reversed.`);
      }
    }
    if (!CLAIM_CONTEXT_DAYS[item.claimContext]) {
      throw new Error(`${item.evidenceId} has an invalid claim context.`);
    }
    if (item.archiveUrl !== null) requireHttps(item.archiveUrl, `${item.evidenceId} archiveUrl`);
    if (!item.publishedAt && item.observation.basis === "explicit") {
      throw new Error(`${item.evidenceId} marks time explicit without a publication record.`);
    }
  }
  for (const item of log.evidence) {
    for (const field of ["correctionOf", "supersededBy"]) {
      if (item[field] !== null && (!ids.has(item[field]) || item[field] === item.evidenceId)) {
        throw new Error(`${item.evidenceId} has an invalid ${field} reference.`);
      }
    }
  }
  return log;
}

export function validateAssessmentLog(
  log,
  evidenceItems = [],
  vesselIds = [],
  currentVesselIds = vesselIds,
) {
  if (!log || log.schemaVersion !== "1.0.0" || !Array.isArray(log.assessments)) {
    throw new Error("Assessment log must use schemaVersion 1.0.0 and contain assessments.");
  }
  const evidenceById = new Map(evidenceItems.map((item) => [item.evidenceId, item]));
  const assessmentById = new Map();
  for (const assessment of log.assessments) {
    requireNonEmpty(assessment.assessmentId, "assessmentId");
    if (assessmentById.has(assessment.assessmentId)) {
      throw new Error(`Duplicate assessmentId: ${assessment.assessmentId}.`);
    }
    assessmentById.set(assessment.assessmentId, assessment);
    if (vesselIds.length && !vesselIds.includes(assessment.vesselId)) {
      throw new Error(`${assessment.assessmentId} references unknown vessel ${assessment.vesselId}.`);
    }
    requireTimestamp(assessment.assessedAt, `${assessment.assessmentId} assessedAt`);
    if (!CONFIDENCE_LEVELS.has(assessment.confidenceLevel)) {
      throw new Error(`${assessment.assessmentId} has invalid confidence.`);
    }
    if (!FRESHNESS_STATES.has(assessment.freshness?.state)) {
      throw new Error(`${assessment.assessmentId} has invalid freshness.`);
    }
    requireNonEmpty(assessment.rationale, `${assessment.assessmentId} rationale`);
    requireNonEmpty(assessment.assessor, `${assessment.assessmentId} assessor`);
    requireNonEmpty(assessment.methodVersion, `${assessment.assessmentId} methodVersion`);
    if (!assessment.assessedState || typeof assessment.assessedState.status !== "string") {
      throw new Error(`${assessment.assessmentId} has no assessed state.`);
    }
    for (const field of ["selectedEvidenceIds", "excludedEvidenceIds", "conflictingEvidenceIds"]) {
      if (!Array.isArray(assessment[field])) throw new Error(`${assessment.assessmentId} has invalid ${field}.`);
      for (const evidenceId of assessment[field]) {
        const evidence = evidenceById.get(evidenceId);
        if (!evidence || evidence.vesselId !== assessment.vesselId) {
          throw new Error(`${assessment.assessmentId} references invalid evidence ${evidenceId}.`);
        }
      }
    }
    if (assessment.previousAssessmentId && !assessmentById.has(assessment.previousAssessmentId)) {
      throw new Error(`${assessment.assessmentId} has a missing previous assessment.`);
    }
  }

  const current = log.currentAssessmentIds;
  if (!current || typeof current !== "object") throw new Error("Assessment log has no current index.");
  for (const vesselId of currentVesselIds) {
    const assessment = assessmentById.get(current[vesselId]);
    if (!assessment || assessment.vesselId !== vesselId) {
      throw new Error(`No current assessment for ${vesselId}.`);
    }
  }
  for (const vesselId of Object.keys(current)) {
    if (currentVesselIds.length && !currentVesselIds.includes(vesselId)) {
      throw new Error(`Current assessment index references non-current vessel ${vesselId}.`);
    }
  }
  return log;
}

export function freshnessState(evidence, asOf) {
  if (evidence.historicalOnly || !evidence.observation?.to) return "historical";
  const asOfMs = Date.parse(asOf);
  const observedFromMs = Date.parse(evidence.observation.from);
  const observedToMs = Date.parse(evidence.observation.to);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(observedFromMs) || !Number.isFinite(observedToMs)) {
    throw new Error("Freshness requires valid timestamps.");
  }
  if (observedFromMs > asOfMs) return "historical";
  const days = Math.max(0, (asOfMs - observedToMs) / 86_400_000);
  const thresholds = CLAIM_CONTEXT_DAYS[evidence.claimContext] || CLAIM_CONTEXT_DAYS.unknown;
  if (days <= thresholds.current) return "current";
  if (days <= thresholds.aging) return "aging";
  return "historical";
}

export function assessEvidenceSet({ vesselId, evidence, sources, assessedAt, previousAssessmentId = null }) {
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const relevant = evidence.filter((item) => item.vesselId === vesselId && !item.supersededBy);
  const rejected = [];
  const eligible = [];

  for (const item of relevant) {
    const source = sourceById.get(item.sourceId);
    const freshness = freshnessState(item, assessedAt);
    if (
      !source?.enabled ||
      reliability(source) < RELIABILITY_RANK.C ||
      source.category === "aggregator-discovery" ||
      !item.observation?.to ||
      Date.parse(item.observation.from) > Date.parse(assessedAt) ||
      item.directness !== "direct"
    ) {
      rejected.push({ evidenceId: item.evidenceId, reason: rejectionReason(item, source, freshness, assessedAt) });
      continue;
    }
    eligible.push({ item, source, freshness, time: Date.parse(item.observation.to) });
  }

  eligible.sort((left, right) => right.time - left.time || reliability(right.source) - reliability(left.source));
  if (!eligible.length) {
    return {
      selectedEvidenceIds: [],
      excludedEvidenceIds: rejected.map((entry) => entry.evidenceId),
      exclusionReasons: rejected,
      conflictingEvidenceIds: [],
      conflictState: "none",
      confidenceLevel: "unknown",
      freshness: { state: "historical", rationale: "No eligible direct evidence with a known, non-future observation time." },
      statusPromotionEligible: false,
      previousAssessmentId,
    };
  }

  let chosen = eligible[0];
  for (const candidate of eligible.slice(1)) {
    if (candidate.time === chosen.time && reliability(candidate.source) > reliability(chosen.source)) {
      chosen = candidate;
    }
  }

  const selected = eligible.filter(({ item }) => sameLocation(item.claim.location, chosen.item.claim.location));
  const conflicting = eligible.filter(({ item, time }) =>
    !sameLocation(item.claim.location, chosen.item.claim.location) && rangesOverlap(item.observation, chosen.item.observation) && time >= chosen.time,
  );
  const olderTransitions = eligible.filter(({ item }) =>
    !sameLocation(item.claim.location, chosen.item.claim.location) && !conflicting.some((entry) => entry.item.evidenceId === item.evidenceId),
  );
  for (const entry of olderTransitions) {
    rejected.push({ evidenceId: entry.item.evidenceId, reason: "older-or-less-credible-transition" });
  }

  const independent = new Set(selected.map(({ item }) => item.originId));
  const bestTier = Math.max(...selected.map(({ source }) => reliability(source)));
  const worstTier = Math.min(...selected.map(({ source }) => reliability(source)));
  const selectedFreshness = selected.some(({ freshness }) => freshness === "current")
    ? "current"
    : selected.some(({ freshness }) => freshness === "aging")
      ? "aging"
      : "historical";
  let confidenceLevel = "low";
  if (conflicting.length) confidenceLevel = "unknown";
  else if (
    selectedFreshness === "current" &&
    independent.size >= 2 &&
    worstTier >= RELIABILITY_RANK.B
  ) confidenceLevel = "high";
  else if (selectedFreshness === "current" && bestTier >= RELIABILITY_RANK.B) confidenceLevel = "moderate";

  return {
    selectedEvidenceIds: selected.map(({ item }) => item.evidenceId),
    excludedEvidenceIds: rejected.map((entry) => entry.evidenceId),
    exclusionReasons: rejected,
    conflictingEvidenceIds: conflicting.map(({ item }) => item.evidenceId),
    conflictState: conflicting.length ? "unresolved" : "none",
    confidenceLevel,
    freshness: {
      state: conflicting.length ? "historical" : selectedFreshness,
      rationale: conflicting.length
        ? "Materially incompatible observations overlap and require analyst resolution."
        : `${independent.size} independent origin cluster(s); ${selectedFreshness} direct evidence.`,
    },
    chosenClaim: chosen.item.claim,
    independentOriginCount: independent.size,
    statusPromotionEligible: !conflicting.length && selectedFreshness !== "historical",
    previousAssessmentId,
  };
}

export function resolveVesselId(query, entities) {
  if (!query || typeof query !== "object") throw new Error("Entity query must be an object.");
  const normalised = Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, typeof value === "string" ? normalise(value) : value]),
  );
  const matches = entities.filter((entity) => {
    if (normalised.vesselId) return normalise(entity.vesselId) === normalised.vesselId;
    for (const field of ["pennantNumber", "imo", "mmsi", "callsign"]) {
      if (normalised[field] && normalise(entity[field]) === normalised[field]) return true;
    }
    if (normalised.name) {
      return [entity.name, ...(entity.aliases || [])].some((value) => normalise(value) === normalised.name);
    }
    return false;
  });
  if (matches.length !== 1) {
    throw new Error(matches.length ? "Entity query is ambiguous." : "No canonical vessel identity matched.");
  }
  return matches[0].vesselId;
}

export function reconstructAssessmentHistory(currentAssessmentId, assessments) {
  const byId = new Map(assessments.map((assessment) => [assessment.assessmentId, assessment]));
  const history = [];
  const seen = new Set();
  let cursor = currentAssessmentId;
  while (cursor) {
    if (seen.has(cursor)) throw new Error("Assessment history contains a cycle.");
    const assessment = byId.get(cursor);
    if (!assessment) throw new Error(`Missing assessment history record ${cursor}.`);
    history.push(assessment);
    seen.add(cursor);
    cursor = assessment.previousAssessmentId;
  }
  return history;
}

function rejectionReason(item, source, freshness, assessedAt) {
  if (!source) return "unknown-source";
  if (!source.enabled) return "disabled-source";
  if (reliability(source) < RELIABILITY_RANK.C || source.category === "aggregator-discovery") {
    return "discovery-or-low-reliability-source";
  }
  if (item.directness !== "direct") return "indirect-evidence";
  if (!item.observation?.to) return "unknown-observation-time";
  if (freshness === "historical" && Date.parse(item.observation.from) > Date.parse(assessedAt)) {
    return "future-observation";
  }
  return "not-current";
}

function rangesOverlap(left, right) {
  return Date.parse(left.from) <= Date.parse(right.to) && Date.parse(right.from) <= Date.parse(left.to);
}

function sameLocation(left, right) {
  return normalise(left?.name || left || "") === normalise(right?.name || right || "");
}

function reliability(source) {
  return RELIABILITY_RANK[source?.reliabilityTier] || 0;
}

function normalise(value) {
  return String(value || "").trim().toLocaleLowerCase("en-GB");
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function requireHttps(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
