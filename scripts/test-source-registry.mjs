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
