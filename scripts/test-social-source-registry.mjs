import assert from "node:assert/strict";

import {
  collectableXAccounts,
  handleWithoutAt,
  validateSocialSourceRegistry,
} from "./lib/social-source-registry.mjs";

const registry = {
  schemaVersion: "1.1.0",
  sources: [
    officialSource("X_ROYAL_NAVY", "RoyalNavy", "organisation"),
    officialSource("X_HMS_DUNCAN", "HMSDuncan", "vessel", {
      vesselId: "hms-duncan",
    }),
    osintSource("NAVY_LOOKOUT_SOCIAL", "NavyLookout"),
    osintSource("DISABLED_OSINT", "DisabledOsint", { enabled: false }),
  ],
};

assert.equal(validateSocialSourceRegistry(registry), registry);
assert.deepEqual(
  collectableXAccounts(registry).map((entry) => entry.sourceId),
  ["NAVY_LOOKOUT_SOCIAL", "X_HMS_DUNCAN", "X_ROYAL_NAVY"],
);
assert.equal(collectableXAccounts(registry).find((entry) => entry.sourceId === "NAVY_LOOKOUT_SOCIAL").required, false);
assert.equal(handleWithoutAt("@HMSDuncan"), "HMSDuncan");
assert.throws(() => handleWithoutAt("bad-handle"), /letters, digits or underscores/i);

const badgeOnly = structuredClone(registry);
badgeOnly.sources[0].officiality = {
  basis: "direct-official-page",
  verifiedByUrl: "https://x.com/RoyalNavy",
  verifiedAt: "2026-08-27T00:00:00Z",
  method: "X verification badge",
};
assert.throws(() => validateSocialSourceRegistry(badgeOnly), /verification badge/i);

const selfAsserted = structuredClone(registry);
selfAsserted.sources[0].officiality.verifiedByUrl = "https://example.invalid/claims-to-be-official";
assert.throws(() => validateSocialSourceRegistry(selfAsserted), /not hosted by Royal Navy or GOV\.UK/i);

const relationship = structuredClone(registry);
relationship.sources.push(officialSource("X_RN_SQUADRON", "RNSquadron", "squadron", {
  officiality: {
    basis: "confirmed-account-relationship",
    verifiedByUrl: "https://x.com/RoyalNavy/status/1234567890123456789",
    verifiedAt: "2026-08-27T00:00:00Z",
    method: "Explicit relationship stated by the confirmed Royal Navy account",
    relatedSourceId: "X_ROYAL_NAVY",
  },
}));
assert.equal(validateSocialSourceRegistry(relationship), relationship);

const brokenRelationship = structuredClone(relationship);
brokenRelationship.sources.at(-1).officiality.relatedSourceId = "UNKNOWN_SOURCE";
assert.throws(() => validateSocialSourceRegistry(brokenRelationship), /confirmed official account/i);

const duplicate = structuredClone(registry);
duplicate.sources.at(-1).xCollection.handle = "RoyalNavy";
duplicate.sources.at(-1).canonicalUrl = "https://x.com/RoyalNavy";
duplicate.sources.at(-1).accountHandle = "@RoyalNavy";
assert.throws(() => validateSocialSourceRegistry(duplicate), /Duplicate X handle/i);

const disabledWithoutReason = structuredClone(registry);
disabledWithoutReason.sources.at(-1).xCollection.disabledReason = null;
assert.throws(() => validateSocialSourceRegistry(disabledWithoutReason), /disabled without a reason/i);

const promotedOsint = structuredClone(registry);
promotedOsint.sources.find((source) => source.sourceId === "NAVY_LOOKOUT_SOCIAL").reliabilityTier = "B";
assert.throws(() => validateSocialSourceRegistry(promotedOsint), /Tier C or D/i);

console.log("Governed official and OSINT X source-registry tests passed.");

function officialSource(sourceId, handle, scope, overrides = {}) {
  return {
    sourceId,
    category: scope === "vessel" ? "official-vessel-social" : "official-organisation-social",
    publisher: `@${handle}`,
    canonicalUrl: `https://x.com/${handle}`,
    accountHandle: `@${handle}`,
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
    ...overrides,
  };
}

function osintSource(sourceId, handle, { enabled = true } = {}) {
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
      rationale: "Synthetic reputable maritime reporting source for registry tests.",
      evidenceUrls: ["https://example.invalid/about"],
    },
    xCollection: {
      handle,
      classification: "osint",
      scope: "organisation",
      enabled,
      required: false,
      reviewedAt: "2026-08-27T00:00:00Z",
      cacheHours: 24,
      disabledReason: enabled ? null : "Disabled fixture for collection-toggle coverage.",
    },
  };
}
