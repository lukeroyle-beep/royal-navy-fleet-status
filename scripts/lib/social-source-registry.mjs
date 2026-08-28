const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
const OFFICIAL_CATEGORIES = new Set([
  "official-vessel-social",
  "official-organisation-social",
]);
const OFFICIAL_SCOPES = new Set([
  "organisation",
  "command",
  "formation",
  "unit",
  "establishment",
  "squadron",
  "vessel",
]);
const OFFICIALITY_BASES = new Set([
  "official-register",
  "direct-official-page",
  "confirmed-account-relationship",
]);
const CLASSIFICATIONS = new Set(["official", "osint"]);

export function validateSocialSourceRegistry(registry) {
  if (!registry || !Array.isArray(registry.sources)) {
    throw new Error("Social source validation requires the central source registry.");
  }

  const sourceById = new Map(registry.sources.map((source) => [source.sourceId, source]));
  const handles = new Map();
  for (const source of registry.sources) {
    const xSource = isXSource(source);
    if (registry.schemaVersion === "1.1.0" && xSource && !source.xCollection) {
      throw new Error(`${source.sourceId} is an X source without xCollection configuration.`);
    }
    if (!source.xCollection) continue;
    validateAccount(source, sourceById);

    const handleKey = source.xCollection.handle.toLocaleLowerCase("en-GB");
    if (handles.has(handleKey)) {
      throw new Error(
        `Duplicate X handle ${source.xCollection.handle}: ${handles.get(handleKey)} and ${source.sourceId}.`,
      );
    }
    handles.set(handleKey, source.sourceId);
  }
  return registry;
}

export function collectableXAccounts(registry) {
  validateSocialSourceRegistry(registry);
  return registry.sources
    .filter((source) => source.xCollection?.enabled === true)
    .map((source) => ({
      sourceId: source.sourceId,
      vesselId: source.vesselId || null,
      publisher: source.publisher,
      canonicalUrl: source.canonicalUrl,
      accountHandle: source.accountHandle || `@${source.xCollection.handle}`,
      handle: source.xCollection.handle,
      classification: source.xCollection.classification,
      scope: source.xCollection.scope,
      required: source.xCollection.required,
      cacheHours: source.xCollection.cacheHours,
      reliabilityTier: source.reliabilityTier,
      category: source.category,
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

export function isConfiguredXSource(source) {
  return Boolean(source?.xCollection);
}

export function isXSource(source) {
  try {
    return X_HOSTS.has(new URL(source?.canonicalUrl).hostname.toLocaleLowerCase("en-GB"));
  } catch {
    return false;
  }
}

export function handleWithoutAt(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("X handle must contain 1-15 letters, digits or underscores without @.");
  }
  return handle;
}

function validateAccount(source, sourceById) {
  const collection = source.xCollection;
  const allowedKeys = [
    "cacheHours",
    "classification",
    "disabledReason",
    "enabled",
    "handle",
    "required",
    "reviewedAt",
    "scope",
  ].sort();
  if (JSON.stringify(Object.keys(collection).sort()) !== JSON.stringify(allowedKeys)) {
    throw new Error(`${source.sourceId} xCollection must use the exact governed field set.`);
  }
  if (!isXSource(source)) throw new Error(`${source.sourceId} xCollection URL is not an X profile.`);

  const handle = handleWithoutAt(collection.handle);
  const profileHandle = new URL(source.canonicalUrl).pathname.split("/").filter(Boolean)[0];
  if (!profileHandle || profileHandle.toLocaleLowerCase("en-GB") !== handle.toLocaleLowerCase("en-GB")) {
    throw new Error(`${source.sourceId} X handle does not match its canonical profile URL.`);
  }
  if (
    source.accountHandle &&
    handleWithoutAt(source.accountHandle).toLocaleLowerCase("en-GB") !==
      handle.toLocaleLowerCase("en-GB")
  ) {
    throw new Error(`${source.sourceId} accountHandle does not match xCollection.handle.`);
  }
  if (!CLASSIFICATIONS.has(collection.classification)) {
    throw new Error(`${source.sourceId} has an invalid X source classification.`);
  }
  if (!OFFICIAL_SCOPES.has(collection.scope)) {
    throw new Error(`${source.sourceId} has an invalid X account scope.`);
  }
  if (typeof collection.enabled !== "boolean" || typeof collection.required !== "boolean") {
    throw new Error(`${source.sourceId} X collection flags must be boolean.`);
  }
  if (collection.required && !collection.enabled) {
    throw new Error(`${source.sourceId} cannot be required while collection is disabled.`);
  }
  if (!Number.isInteger(collection.cacheHours) || collection.cacheHours < 1 || collection.cacheHours > 24) {
    throw new Error(`${source.sourceId} X cacheHours must be an integer from 1 to 24.`);
  }
  requireTimestamp(collection.reviewedAt, `${source.sourceId} X review time`);
  if (collection.enabled && collection.disabledReason !== null) {
    throw new Error(`${source.sourceId} is enabled with a disabled reason.`);
  }
  if (!collection.enabled && (typeof collection.disabledReason !== "string" || !collection.disabledReason.trim())) {
    throw new Error(`${source.sourceId} is disabled without a reason.`);
  }

  if (collection.classification === "official") {
    validateOfficialAccount(source, sourceById);
  } else {
    validateOsintAccount(source);
  }
}

function validateOfficialAccount(source, sourceById) {
  if (!OFFICIAL_CATEGORIES.has(source.category)) {
    throw new Error(`${source.sourceId} is classified official but has a non-official social category.`);
  }
  if (!source.officiality || !OFFICIALITY_BASES.has(source.officiality.basis)) {
    throw new Error(`${source.sourceId} lacks a credible officiality basis.`);
  }
  requireHttps(source.officiality.verifiedByUrl, `${source.sourceId} officiality evidence URL`);
  requireTimestamp(source.officiality.verifiedAt, `${source.sourceId} officiality review time`);
  if (/badge/i.test(String(source.officiality.method || ""))) {
    throw new Error(`${source.sourceId} cannot rely on a verification badge for officiality.`);
  }

  if (source.officiality.basis === "confirmed-account-relationship") {
    const related = sourceById.get(source.officiality.relatedSourceId);
    if (!related?.xCollection || related.xCollection.classification !== "official") {
      throw new Error(`${source.sourceId} relationship evidence does not reference a confirmed official account.`);
    }
    if (!isXStatusUrl(source.officiality.verifiedByUrl)) {
      throw new Error(`${source.sourceId} relationship evidence must retain the confirming X post URL.`);
    }
    return;
  }

  const host = new URL(source.officiality.verifiedByUrl).hostname.toLocaleLowerCase("en-GB");
  if (!isOfficialGovernmentHost(host)) {
    throw new Error(`${source.sourceId} officiality evidence is not hosted by Royal Navy or GOV.UK.`);
  }
}

function validateOsintAccount(source) {
  if (source.category !== "recognised-osint") {
    throw new Error(`${source.sourceId} is classified OSINT without recognised-osint category.`);
  }
  const selection = source.osintSelection;
  if (
    !selection ||
    typeof selection.rationale !== "string" ||
    !selection.rationale.trim() ||
    selection.publicOnly !== true ||
    selection.correctionsRequired !== true ||
    !Array.isArray(selection.evidenceUrls) ||
    !selection.evidenceUrls.length
  ) {
    throw new Error(`${source.sourceId} lacks the curated OSINT selection record.`);
  }
  requireTimestamp(selection.reviewedAt, `${source.sourceId} OSINT selection review time`);
  for (const value of selection.evidenceUrls) {
    requireHttps(value, `${source.sourceId} OSINT selection evidence URL`);
  }
  if (!["C", "D"].includes(source.reliabilityTier)) {
    throw new Error(`${source.sourceId} OSINT sources must begin at reliability Tier C or D.`);
  }
}

function isOfficialGovernmentHost(host) {
  return host === "gov.uk" ||
    host.endsWith(".gov.uk") ||
    host === "royalnavy.mod.uk" ||
    host.endsWith(".royalnavy.mod.uk");
}

function isXStatusUrl(value) {
  const url = new URL(value);
  return X_HOSTS.has(url.hostname.toLocaleLowerCase("en-GB")) && /\/status\/\d+/.test(url.pathname);
}

function requireHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must be an HTTPS URL.`);
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}
