import assert from "node:assert/strict";
import fs from "node:fs";

import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import {
  MANUAL_DISCOVERY_QUEUES,
  buildOperationalSourceRegistry,
  createDiscoveryFamilyQueue,
  createOfficialAccountCoverageReport,
  updateOperationalSourceState,
  validateOperationalSourceRegistry,
} from "./lib/source-registry.mjs";

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
assert.equal(validateOperationalSourceRegistry(registry, entities), registry);
assert.equal(registry.operations.length, registry.sources.length);
const sourceReviewDates = registry.sources.flatMap((source) => [
  source.terms?.reviewedAt,
  source.officiality?.verifiedAt,
  source.xCollection?.reviewedAt,
  source.osintSelection?.reviewedAt,
]).filter(Boolean);
assert.ok(
  sourceReviewDates.every((reviewedAt) => reviewedAt <= registry.reviewedAt),
  "The registry-level review date must not predate any source review metadata.",
);
const enabledXAccounts = registry.sources.filter((source) => source.xCollection?.enabled);
const exploitRequired = enabledXAccounts.find((source) => source.sourceId === "X_HMS_EXPLOIT")
  ?.xCollection.required;
assert.equal(enabledXAccounts.length, 95);
assert.equal(enabledXAccounts.filter((source) => source.xCollection.required).length, exploitRequired ? 72 : 71);
assert.equal(enabledXAccounts.filter((source) => !source.xCollection.required).length, exploitRequired ? 23 : 24);
if (exploitRequired === false) {
  assert.match(
    enabledXAccounts.find((source) => source.sourceId === "X_HMS_EXPLOIT")?.notes || "",
    /suspended/i,
    "A temporarily optional HMS Exploit account must retain the source-health reason.",
  );
}
assert.ok(
  enabledXAccounts.find((source) => source.sourceId === "X_ARMED_FORCES_DAY")
    ?.xCollection.required,
  "The MOD-register Armed Forces Day account must be a required official check.",
);
const attachedDiscoveryIds = [
  "X_DISCOVERY_3_COMMANDO_BRIGADE",
  "X_DISCOVERY_BF_GIBRALTAR",
  "X_DISCOVERY_BFSAI",
  "X_DISCOVERY_BRNC",
  "X_DISCOVERY_COMMANDO_OPS",
  "X_DISCOVERY_FLY_NAVY",
  "X_DISCOVERY_HMNB_CLYDE",
  "X_DISCOVERY_HMNB_DEVONPORT",
  "X_DISCOVERY_HMNB_PORTSMOUTH",
  "X_DISCOVERY_HMS_DAUNTLESS",
  "X_DISCOVERY_HMS_RALEIGH",
  "X_DISCOVERY_HMS_TRACKER",
  "X_DISCOVERY_MOD_GIBRALTAR",
  "X_DISCOVERY_NAVYFIT",
  "X_DISCOVERY_RFA_HEADQUARTERS",
  "X_DISCOVERY_RNAS_CULDROSE",
  "X_DISCOVERY_RNR_OFFICIAL",
  "X_DISCOVERY_RN_DTXG",
  "X_DISCOVERY_RN_GIBRALTAR_SQUADRON",
  "X_DISCOVERY_RN_SCOTLAND",
  "X_DISCOVERY_SECOND_SEA_LORD",
  "X_DISCOVERY_UKMCC_MIDDLE_EAST",
];
for (const sourceId of attachedDiscoveryIds) {
  const source = enabledXAccounts.find((entry) => entry.sourceId === sourceId);
  assert.equal(source?.reliabilityTier, "D", `${sourceId} must remain Tier D discovery.`);
  assert.equal(source?.xCollection.classification, "osint", `${sourceId} must not assert officiality.`);
  assert.equal(source?.xCollection.required, false, `${sourceId} must remain optional.`);
}
assert.equal(
  enabledXAccounts.some((source) => source.xCollection.handle.toLowerCase() === "hmsdodragon"),
  false,
  "The attached HMSDoDragon typo must not duplicate the governed HMS Dragon account.",
);
assert.equal(
  enabledXAccounts.filter((source) => source.vesselId === "hms-kent").length,
  1,
  "The attached HMSKent alias must not duplicate the governed HMS Kent account.",
);
for (const operation of registry.operations) {
  for (const field of [
    "sourceId", "name", "type", "urlOrQueryTemplate", "coverage", "authorityTier",
    "expectedFrequency", "lastAttemptAt", "lastSuccessAt", "lastMeaningfulResultAt",
    "consecutiveFailures", "retrievalMethod", "licenceAndTermsNotes", "mandatory",
  ]) {
    assert.ok(Object.hasOwn(operation, field), `${operation.sourceId} lacks ${field}.`);
  }
}
assert.deepEqual(
  buildOperationalSourceRegistry(registry, entities, registry.operations),
  registry.operations,
  "Operational registry generation must be deterministic.",
);

const coverage = createOfficialAccountCoverageReport(
  registry,
  entities,
  "2026-08-26T00:00:00Z",
);
assert.equal(coverage.pass, true);
assert.deepEqual(coverage.missingVesselIds, []);
assert.deepEqual(coverage.enabledWithoutSource, []);
assert.equal(coverage.requiredHandleChecks["hms-spey"].verified, true);
assert.equal(coverage.requiredHandleChecks["hms-trent"].verified, true);
const missingCoverage = structuredClone(registry);
missingCoverage.officialSocialCoverage = missingCoverage.officialSocialCoverage.filter(
  (entry) => entry.vesselId !== "hms-spey",
);
assert.equal(
  createOfficialAccountCoverageReport(missingCoverage, entities, "2026-08-26T00:00:00Z").pass,
  false,
);

const discovery = createDiscoveryFamilyQueue("2026-08-26T00:00:00Z");
for (const family of [
  "official-rn-rfa", "govuk-mod", "youtube", "nato-allied", "embassy-exercise",
  "port-harbour", "google-news-rss", "gdelt", "general-local-news", "maritime-publishers",
]) {
  assert.ok(discovery.queues.some((entry) => entry.queueId === family), `Missing ${family} queue.`);
}
assert.ok(MANUAL_DISCOVERY_QUEUES.every((entry) => entry.termsPolicy));

const firstOperation = registry.operations[0];
const failed = updateOperationalSourceState(registry.operations, [{
  sourceId: firstOperation.sourceId,
  state: "blocked",
  outcome: null,
  checkedAt: null,
  blocker: { at: "2026-08-26T01:00:00Z" },
}]);
assert.equal(failed[0].lastAttemptAt, "2026-08-26T01:00:00Z");
assert.equal(failed[0].consecutiveFailures, firstOperation.consecutiveFailures + 1);
const recovered = updateOperationalSourceState(failed, [{
  sourceId: firstOperation.sourceId,
  state: "complete",
  outcome: "candidates-found",
  checkedAt: "2026-08-26T02:00:00Z",
  blocker: null,
}]);
assert.equal(recovered[0].lastSuccessAt, "2026-08-26T02:00:00Z");
assert.equal(recovered[0].lastMeaningfulResultAt, "2026-08-26T02:00:00Z");
assert.equal(recovered[0].consecutiveFailures, 0);

const regressions = JSON.parse(
  fs.readFileSync(new URL("./fixtures/missed-evidence-regressions.json", import.meta.url), "utf8"),
);
for (const fixture of regressions.cases) {
  const vessel = entities.vessels.find((entry) => entry.vesselId === fixture.expectedVesselId);
  const coverageEntry = registry.officialSocialCoverage.find(
    (entry) => entry.vesselId === fixture.expectedVesselId,
  );
  assert.ok(vessel, `${fixture.caseId}: vessel exists`);
  assert.ok(
    fixture.query.name === vessel.name ||
      fixture.query.pennantNumber === vessel.pennantNumber ||
      fixture.query.accountAlias === coverageEntry?.accountHandle,
    `${fixture.caseId}: query remains reconciled to the expected vessel`,
  );
  for (const family of fixture.requiredFamilies) {
    assert.ok(discovery.queues.some((entry) => entry.queueId === family), `${fixture.caseId}: ${family}`);
  }
}

console.log("Operational source registry, account reconciliation and discovery-queue tests passed.");
