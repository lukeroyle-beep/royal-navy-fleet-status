import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  "source", "sourceId", "sourceUrl", "canonicalUrl", "evidenceCheckedDate", "locationEvidenceDate",
  "evidenceClassification", "selectedEvidenceIds", "excludedEvidenceIds", "exclusionReasons",
  "conflictingEvidenceIds", "rationale", "analystNotes", "internalNotes", "rawPost",
  "rawContent", "contentHash", "originId", "accountHandle", "assessor", "confidenceLevel",
  "confidenceReasons", "freshness", "diagnostics", "symbolicPosition", "unmappedReason",
  "publicLocation", "reviewState", "authorityTier", "citedSpans", "publicationEligible",
  "requiresHumanReview", "maximumPublicPrecision",
]);

const allowedFleetFields = new Set([
  "id", "name", "service", "vesselClass", "vesselType", "pennantNumber",
  "commissionedDate", "homePort", "status", "locationClassification", "locationState",
  "locationPrecision", "publicLocationLabel", "lastReportedLocation", "position",
  "uncertaintyArea",
]);
const allowedHistoryFields = new Set([
  "id", "name", "service", "vesselClass", "vesselType", "pennantNumber",
  "commissionedDate", "homePort",
]);

const secretLikePatterns = Object.freeze([
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "API secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "assigned credential", pattern: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["']?[A-Za-z0-9_+\/=.-]{16,}/i },
]);

export function scanPublicExposure({
  rootDirectory, registry, fleetPath, historyPath, shorePath = null,
  expectedFleetCount = null, expectedShoreCount = null, retiredAssets = [], forbiddenTokens = [],
}) {
  const files = walk(rootDirectory);
  const text = files.filter((file) => /\.(?:html|js|css|json|map|txt|xml|svg|webmanifest|pem|key|ya?ml|toml)$/i.test(file))
    .map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const publicFleet = readJson(path.join(rootDirectory, fleetPath));
  const publicHistoryCatalog = readJson(path.join(rootDirectory, historyPath));

  for (const vessel of publicFleet.vessels) {
    assertNoForbiddenKeys(vessel, `Public fleet record ${vessel.id}`);
    assertAllowedKeys(vessel, allowedFleetFields, `Public fleet record ${vessel.id}`);
  }
  for (const vessel of publicHistoryCatalog.vessels) {
    assertNoForbiddenKeys(vessel, `Public history identity ${vessel.id}`);
    assertAllowedKeys(vessel, allowedHistoryFields, `Public history identity ${vessel.id}`);
    assert.ok(!JSON.stringify(vessel).includes("https://"), `Public history identity ${vessel.id} exposes a URL.`);
  }
  if (expectedFleetCount !== null) {
    assert.equal(publicFleet.vessels.length, expectedFleetCount, "Production fleet roster has the wrong denominator.");
  }

  if (shorePath) {
    const publicShore = readJson(path.join(rootDirectory, shorePath));
    if (expectedShoreCount !== null) {
      assert.equal(publicShore.establishments.length, expectedShoreCount, "Production shore roster is incomplete.");
    }
    for (const establishment of publicShore.establishments) {
      for (const field of ["address", "postcode", "telephone", "email", "analystNotes", "internalNotes"]) {
        assert.ok(!Object.hasOwn(establishment, field), `Public shore record exposes ${field}.`);
      }
      assert.ok(establishment.image.startsWith("./shore/"));
      assert.ok(establishment.source.url.startsWith("https://"));
    }
  }

  for (const [vesselId, photoName] of retiredAssets) {
    assert.ok(!publicFleet.vessels.some((vessel) => vessel.id === vesselId), `Retired ${vesselId} remains in the production fleet dataset.`);
    assert.ok(!files.some((file) => file.endsWith(`${path.sep}photos${path.sep}${photoName}`)), `Retired ${vesselId} photo remains in the production client.`);
  }
  for (const forbidden of forbiddenTokens) {
    assert.ok(!text.includes(forbidden), `Production client exposes internal provenance token: ${forbidden}`);
  }
  for (const { label, pattern } of secretLikePatterns) {
    assert.ok(!pattern.test(text), `Production client contains a secret-like ${label}.`);
  }
  for (const source of registry.sources) {
    assert.ok(!includesExactUrl(text, source.canonicalUrl), `Production client exposes registry URL for ${source.sourceId}.`);
    if (source.accountHandle) {
      assert.ok(!text.includes(source.accountHandle), `Production client exposes account handle for ${source.sourceId}.`);
    }
  }
  assert.ok(
    !files.some((file) => /(?:^|[\\/])(?:\.env(?:\..*)?|\.npmrc|\.pypirc)$|\.(?:pem|key|credentials\.json|secrets\.json)$/i.test(file)),
    "Production client contains a prohibited credential file.",
  );
  assert.ok(!files.some((file) => file.includes(`${path.sep}internal${path.sep}`)), "Production client contains an internal data directory.");
  return files.length;
}

function assertNoForbiddenKeys(value, label) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item, label);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!FORBIDDEN_PUBLIC_FIELDS.includes(key), `${label} exposes ${key}.`);
    assertNoForbiddenKeys(child, label);
  }
}

function assertAllowedKeys(value, allowed, label) {
  assert.ok(
    Object.keys(value).every((key) => allowed.has(key)),
    `${label} exposes a non-allow-listed field.`,
  );
}

function includesExactUrl(value, url) {
  let offset = value.indexOf(url);
  while (offset !== -1) {
    const nextCharacter = value[offset + url.length];
    if (!nextCharacter || !/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/.test(nextCharacter)) return true;
    offset = value.indexOf(url, offset + url.length);
  }
  return false;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
