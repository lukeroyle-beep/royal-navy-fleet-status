import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";

import { createPrivateEvidenceHealth } from "./lib/private-health.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import {
  createPrivateHealthRequestHandler,
  renderPrivateHealthShell,
  validatePrivateHealthConfiguration,
} from "./private-health-server.mjs";

const privateInputs = resolvePrivateInputs();
const registry = privateInputs.readJson("sources");
const entities = privateInputs.readJson("vessels");
const evidenceLog = privateInputs.readJson("evidence");
const assessmentLog = privateInputs.readJson("assessments");
const asOf = "2026-08-26T12:00:00Z";

const empty = createPrivateEvidenceHealth({
  registry: { sources: [], operations: [], officialSocialCoverage: [] },
  entities: { vessels: [] },
  evidenceLog: { evidence: [] },
  assessmentLog: { assessments: [], currentAssessmentIds: {} },
  sweepRuns: [],
  asOf,
});
assert.equal(empty.state, "empty");

const partial = createPrivateEvidenceHealth({
  registry,
  entities,
  evidenceLog,
  assessmentLog,
  sweepRuns: [run("partial", false)],
  asOf,
});
assert.ok(["partial", "degraded"].includes(partial.state));

const complete = run("complete-no-supported-changes", true);
const healthyInputs = sanitiseHealthSignals({ registry, assessmentLog });
const healthy = createPrivateEvidenceHealth({
  registry: healthyInputs.registry,
  entities,
  evidenceLog,
  assessmentLog: healthyInputs.assessmentLog,
  sweepRuns: [complete],
  asOf,
});
assert.equal(healthy.state, "healthy");
assert.equal(healthy.lastKnownGood.runId, complete.runId);

const degradedRun = run("degraded", false, true);
const degraded = createPrivateEvidenceHealth({
  registry: healthyInputs.registry,
  entities,
  evidenceLog,
  assessmentLog: healthyInputs.assessmentLog,
  sweepRuns: [degradedRun, complete],
  asOf,
});
assert.equal(degraded.state, "degraded");
assert.equal(degraded.lastKnownGood.runId, complete.runId, "Degraded state must retain last-known-good.");
const failed = createPrivateEvidenceHealth({
  registry: healthyInputs.registry,
  entities,
  evidenceLog,
  assessmentLog: healthyInputs.assessmentLog,
  sweepRuns: [run("failed", false, true), complete],
  asOf,
});
assert.equal(failed.state, "failed");
assert.ok(healthy.coverage.byVessel.length === entities.vessels.length);
assert.ok(healthy.coverage.bySourceFamily.length > 0);

const shell = renderPrivateHealthShell("test-nonce");
for (const state of ["Loading private health data", "Failed to load private health data", "Last known good"]) {
  assert.match(shell, new RegExp(state, "i"));
}
assert.match(shell, /prefers-reduced-motion/);
assert.match(shell, /aria-live="polite"/);
assert.match(shell, /Skip to evidence health/);

assert.throws(
  () => validatePrivateHealthConfiguration({ token: "short", host: "127.0.0.1" }),
  /32 characters/i,
);
assert.throws(
  () => validatePrivateHealthConfiguration({ token: "x".repeat(32), host: "0.0.0.0" }),
  /loopback/i,
);

const token = "test-private-health-token-32-characters";
let loads = 0;
const server = http.createServer(createPrivateHealthRequestHandler({
  token,
  loadHealth: async () => {
    loads += 1;
    return healthy;
  },
}));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
let response = await fetch(`${base}/health.json`);
assert.equal(response.status, 401);
assert.equal(loads, 0, "Unauthorised requests must not load private data.");
response = await fetch(`${base}/health.json`, {
  headers: { Authorization: `Basic ${Buffer.from(`analyst:${token}`).toString("base64")}` },
});
assert.equal(response.status, 200);
assert.equal((await response.json()).state, "healthy");
assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
assert.equal(loads, 1);
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

const publicEntryText = [
  fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  ...walk(new URL("../src/", import.meta.url)).map((file) => fs.readFileSync(file, "utf8")),
].join("\n");
for (const privateToken of ["private-health", "createPrivateEvidenceHealth", "RNFS_HEALTH_TOKEN"]) {
  assert.equal(publicEntryText.includes(privateToken), false, `${privateToken} entered the public Vite graph.`);
}

console.log("Private evidence-health state, access-control and public-absence tests passed.");

function run(classification, complete, blocked = false) {
  const mandatoryOperations = registry.operations.filter((entry) => entry.mandatory);
  return {
    runId: `RUN_${classification}`,
    startedAt: complete ? "2026-08-25T10:00:00Z" : "2026-08-26T10:00:00Z",
    completedAt: complete ? "2026-08-25T11:00:00Z" : null,
    complete,
    result: { classification, publicationEligible: complete },
    coverage: {
      completedSourceChecks: blocked ? 0 : mandatoryOperations.length,
      requiredSourceChecks: mandatoryOperations.length,
    },
    sourceChecks: mandatoryOperations.map((operation, index) => ({
      sourceId: operation.sourceId,
      state: blocked && index === 0 ? "blocked" : complete ? "complete" : "pending",
      blocker: blocked && index === 0
        ? { type: "network-error", at: "2026-08-26T10:30:00Z" }
        : null,
    })),
    discoveryChecks: [],
  };
}

function sanitiseHealthSignals({ registry, assessmentLog }) {
  const cleanRegistry = structuredClone(registry);
  const cleanAssessmentLog = structuredClone(assessmentLog);
  for (const assessment of cleanAssessmentLog.assessments) {
    assessment.conflictingEvidenceIds = [];
    assessment.freshness = { state: "current", rationale: "Test fixture." };
  }
  return { registry: cleanRegistry, assessmentLog: cleanAssessmentLog };
}

function walk(url) {
  return fs.readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
    return entry.isDirectory() ? walk(child) : [child];
  });
}
