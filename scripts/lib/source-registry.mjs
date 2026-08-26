const REQUIRED_RECURRING_IDS = new Set([
  "MARINEVESSELTRAFFIC_NATO_DISCOVERY",
  "PORTSMOUTH_HARBOUR_AUTHORITY",
  "RN_OFFICIAL_SHIPS",
]);

const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly", "event-driven", "manual-only"]);
const VALID_RETRIEVAL_METHODS = new Set(["api", "feed", "manual"]);

export const MANUAL_DISCOVERY_QUEUES = Object.freeze([
  queue("official-rn-rfa", "Royal Navy and RFA unit/news pages", "https://www.royalnavy.mod.uk/search?q={vessel-or-pennant}", "A", true),
  queue("govuk-mod", "GOV.UK and Ministry of Defence", "https://www.gov.uk/search/all?keywords={vessel-or-pennant}", "A", true),
  queue("youtube", "Official organisation and vessel YouTube channels", "https://www.youtube.com/results?search_query={vessel-or-pennant}", "B", false),
  queue("nato-allied", "NATO and allied-government publishers", "https://www.nato.int/cps/en/natohq/search.htm?query={vessel-or-pennant}", "A", true),
  queue("embassy-exercise", "Embassy and named exercise publishers", "manual://search/{vessel-or-pennant}/embassy-exercise", "B", false),
  queue("port-harbour", "Permitted port, harbour and dockyard notices", "manual://search/{vessel-or-pennant}/port", "B", true),
  queue("google-news-rss", "Google News RSS discovery", "https://news.google.com/rss/search?q={vessel-or-pennant}", "D", false),
  queue("gdelt", "GDELT public document discovery", "https://api.gdeltproject.org/api/v2/doc/doc?query={vessel-or-pennant}&mode=artlist&format=json", "D", false),
  queue("general-local-news", "General and local news discovery", "manual://search/{vessel-or-pennant}/news", "C", false),
  queue("maritime-publishers", "Named credible maritime publishers", "manual://search/{vessel-or-pennant}/maritime", "C", false),
]);

export function buildOperationalSourceRegistry(registry, entities, existingOperations = registry.operations || []) {
  if (!Array.isArray(registry?.sources)) throw new Error("Operational registry requires sources.");
  if (!Array.isArray(entities?.vessels)) throw new Error("Operational registry requires vessels.");
  const existingById = new Map(existingOperations.map((entry) => [entry.sourceId, entry]));
  const vesselById = new Map(
    [...entities.vessels, ...(entities.retiredVessels || [])].map((vessel) => [vessel.vesselId, vessel]),
  );
  return registry.sources
    .map((source) => {
      const prior = existingById.get(source.sourceId) || {};
      const vessel = vesselById.get(source.vesselId);
      const mandatory = isMandatory(source);
      return {
        sourceId: source.sourceId,
        name: source.publisher,
        type: source.category,
        urlOrQueryTemplate: source.canonicalUrl,
        coverage: {
          vesselIds: source.vesselId ? [source.vesselId] : [],
          families: [source.category],
          aliases: [source.accountHandle, vessel?.pennantNumber, vessel?.name, ...(vessel?.aliases || [])]
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index),
        },
        authorityTier: source.reliabilityTier,
        expectedFrequency: prior.expectedFrequency || (mandatory ? "weekly" : "event-driven"),
        lastAttemptAt: prior.lastAttemptAt ?? null,
        lastSuccessAt: prior.lastSuccessAt ?? null,
        lastMeaningfulResultAt: prior.lastMeaningfulResultAt ?? null,
        consecutiveFailures: prior.consecutiveFailures ?? 0,
        retrievalMethod: source.collectionMode,
        licenceAndTermsNotes: prior.licenceAndTermsNotes || termsSummary(source),
        mandatory,
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

export function validateOperationalSourceRegistry(registry, entities) {
  const expected = buildOperationalSourceRegistry(registry, entities, registry.operations || []);
  if (!Array.isArray(registry.operations)) throw new Error("Source registry has no operational records.");
  if (registry.operations.length !== registry.sources.length) {
    throw new Error("Operational source records must cover every source exactly once.");
  }
  const ids = new Set();
  for (const entry of registry.operations) {
    requireText(entry.sourceId, "Operational sourceId");
    if (ids.has(entry.sourceId)) throw new Error(`Duplicate operational sourceId: ${entry.sourceId}.`);
    ids.add(entry.sourceId);
    requireText(entry.name, `${entry.sourceId} name`);
    requireText(entry.type, `${entry.sourceId} type`);
    requireText(entry.urlOrQueryTemplate, `${entry.sourceId} URL or query template`);
    if (!VALID_FREQUENCIES.has(entry.expectedFrequency)) {
      throw new Error(`${entry.sourceId} has an invalid expected frequency.`);
    }
    if (!VALID_RETRIEVAL_METHODS.has(entry.retrievalMethod)) {
      throw new Error(`${entry.sourceId} has an invalid retrieval method.`);
    }
    for (const field of ["lastAttemptAt", "lastSuccessAt", "lastMeaningfulResultAt"]) {
      if (entry[field] !== null) requireTimestamp(entry[field], `${entry.sourceId} ${field}`);
    }
    if (!Number.isInteger(entry.consecutiveFailures) || entry.consecutiveFailures < 0) {
      throw new Error(`${entry.sourceId} has invalid consecutiveFailures.`);
    }
    if (typeof entry.mandatory !== "boolean") throw new Error(`${entry.sourceId} has invalid mandatory flag.`);
    if (
      !entry.coverage ||
      !Array.isArray(entry.coverage.vesselIds) ||
      !Array.isArray(entry.coverage.families) ||
      !Array.isArray(entry.coverage.aliases)
    ) {
      throw new Error(`${entry.sourceId} has invalid coverage metadata.`);
    }
    requireText(entry.licenceAndTermsNotes, `${entry.sourceId} licence and terms notes`);
  }
  if (expected.some((entry, index) => entry.sourceId !== registry.operations[index]?.sourceId)) {
    throw new Error("Operational source records must use deterministic sourceId ordering.");
  }
  return registry;
}

export function updateOperationalSourceState(operations, sourceChecks) {
  const checksById = new Map(sourceChecks.map((check) => [check.sourceId, check]));
  return operations.map((operation) => {
    const check = checksById.get(operation.sourceId);
    if (!check || (!check.checkedAt && !check.blocker?.at)) return structuredClone(operation);
    const attemptedAt = check.checkedAt || check.blocker.at;
    const success = check.state === "complete";
    const meaningful = check.outcome === "candidates-found";
    return {
      ...structuredClone(operation),
      lastAttemptAt: attemptedAt,
      lastSuccessAt: success ? attemptedAt : operation.lastSuccessAt,
      lastMeaningfulResultAt: meaningful ? attemptedAt : operation.lastMeaningfulResultAt,
      consecutiveFailures: success ? 0 : operation.consecutiveFailures + 1,
    };
  });
}

export function createOfficialAccountCoverageReport(registry, entities, generatedAt) {
  requireTimestamp(generatedAt, "Coverage report time");
  const currentIds = entities.vessels.map((vessel) => vessel.vesselId).sort();
  const coverageById = new Map(registry.officialSocialCoverage.map((entry) => [entry.vesselId, entry]));
  const sources = registry.sources.filter((source) => source.category === "official-vessel-social");
  const missingVesselIds = currentIds.filter((vesselId) => !coverageById.has(vesselId));
  const enabledWithoutSource = [];
  const unresolved = [];
  for (const vesselId of currentIds) {
    const coverage = coverageById.get(vesselId);
    if (!coverage) continue;
    if (!coverage.enabled) unresolved.push(vesselId);
    if (
      coverage.enabled &&
      !sources.some(
        (source) =>
          source.enabled &&
          source.vesselId === vesselId &&
          source.accountHandle === coverage.accountHandle,
      )
    ) {
      enabledWithoutSource.push(vesselId);
    }
  }
  return {
    schemaVersion: "1.0.0",
    generatedAt,
    currentVesselCount: currentIds.length,
    coverageRowCount: registry.officialSocialCoverage.length,
    missingVesselIds,
    enabledWithoutSource,
    unresolved,
    requiredHandleChecks: {
      "hms-spey": coverageSummary(coverageById.get("hms-spey"), "@HMS_Spey"),
      "hms-trent": coverageSummary(coverageById.get("hms-trent"), "@HMSTrent"),
    },
    pass: missingVesselIds.length === 0 && enabledWithoutSource.length === 0,
  };
}

export function createDiscoveryFamilyQueue(generatedAt) {
  requireTimestamp(generatedAt, "Discovery queue time");
  return {
    schemaVersion: "1.0.0",
    generatedAt,
    promotionPolicy: "Discovery only; every candidate requires evidence ingestion and human review.",
    queues: MANUAL_DISCOVERY_QUEUES.map((entry) => structuredClone(entry)),
  };
}

function isMandatory(source) {
  return source.enabled !== false && (
    source.monitoring?.recurring === true ||
    ["official-vessel-social", "official-organisation-social"].includes(source.category) ||
    REQUIRED_RECURRING_IDS.has(source.sourceId)
  );
}

function termsSummary(source) {
  const terms = source.terms || {};
  return [
    terms.reviewedAt ? `Reviewed ${String(terms.reviewedAt).slice(0, 10)}.` : "Terms review date not recorded.",
    terms.automation,
    terms.retention,
  ].filter(Boolean).join(" ");
}

function coverageSummary(entry, expectedHandle) {
  return {
    expectedHandle,
    recordedHandle: entry?.accountHandle || null,
    verified: Boolean(entry?.enabled && entry.accountHandle === expectedHandle && entry.verifiedByUrl),
  };
}

function queue(queueId, name, queryTemplate, authorityTier, mandatory) {
  return Object.freeze({
    queueId,
    name,
    queryTemplate,
    authorityTier,
    retrievalMethod: "manual",
    mandatory,
    termsPolicy: "Review the publisher's current terms, robots policy and licence before collection; record blocks as failures.",
  });
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
