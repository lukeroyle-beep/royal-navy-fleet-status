import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  availabilityClasses,
  calculateAvailabilityForRange,
  calculateTwelveMonthAvailability,
  parseAvailabilityHistory,
  parsePhysicalAvailabilityHistory,
} from "../src/utils/availability-history.js";
import {
  buildWeeklyAvailabilityObservation,
  latestSunday,
} from "./lib/availability-observation.mjs";
import {
  decideWeeklyAvailabilityCandidate,
  inspectPushedWeeklyCandidate,
  selectOpenWeeklyCandidate,
} from "./lib/weekly-availability-candidate.mjs";

const storedText = fs.readFileSync(
  new URL("../data/royal-navy/availability-history.jsonl", import.meta.url),
  "utf8",
);
const workflow = fs.readFileSync(
  new URL("../.github/workflows/weekly-availability-history.yml", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../docs/weekly-availability-history.md", import.meta.url),
  "utf8",
);
const publicDataCopy = fs.readFileSync(
  new URL("./copy-fleet-data.mjs", import.meta.url),
  "utf8",
);
const publicApp = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const storedHistory = parseAvailabilityHistory(storedText);
assert.equal(storedHistory.length, 1);
assert.equal(storedHistory[0].weekEnding, "2026-08-23");
assert.equal(Object.keys(storedHistory[0].observations).length, 68);
assert.equal(
  calculateTwelveMonthAvailability(storedHistory, { asOfDate: "2026-08-23" }).state,
  "insufficient_history",
);
assert.equal(
  calculateTwelveMonthAvailability(storedHistory, { asOfDate: "2026-08-23" })
    .availabilityPercentage,
  null,
);
assert.match(workflow, /cron: "30 6 \* \* 1"/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /permissions:\s+contents: read/s);
assert.match(workflow, /contents: write/);
assert.match(workflow, /pull-requests: write/);
const pinnedActions = [...workflow.matchAll(/uses: actions\/[a-z-]+@([0-9a-f]{40}) # v\d+/g)];
assert.equal(pinnedActions.length, 5);
assert.doesNotMatch(workflow, /uses: actions\/[a-z-]+@v\d+/);
assert.match(workflow, /gh pr create/);
assert.match(workflow, /changed_files.*availability-history\.jsonl/s);
assert.match(workflow, /canonical_branch="automation\/weekly-availability-\$\{week_ending\}"/);
assert.match(workflow, /select-weekly-availability-candidate\.mjs/);
assert.match(workflow, /decide-weekly-availability-candidate\.mjs/);
assert.match(workflow, /inspect-pushed-weekly-availability-pr\.mjs/);
assert.match(
  workflow,
  /gh pr list --state open --head "\$canonical_branch" --limit 100/,
  "Every post-push race query must authoritatively inspect all open PRs for the canonical head branch.",
);
assert.match(workflow, /--force-with-lease="refs\/heads\/\$\{branch\}:\$\{remote_sha_before\}"/);
assert.doesNotMatch(workflow, /--force-with-lease="refs\/heads\/\$\{branch\}:\$\{pushed_sha\}"/);
assert.doesNotMatch(workflow, /origin ":refs\/heads\/\$\{branch\}"/);
assert.doesNotMatch(workflow, /\$\{remote_sha_before\}:refs\/heads\/\$\{branch\}/);
assert.match(workflow, /Allow GitHub Actions to create and approve pull requests/);
assert.doesNotMatch(workflow, /git push[^\n]*\bmain\b/);
assert.match(design, /fails and writes nothing/);
assert.match(design, /no historic availability percentage is displayed yet/);
assert.doesNotMatch(publicDataCopy, /availability-history\.jsonl/);
assert.doesNotMatch(publicApp, /availability-history|calculateTwelveMonthAvailability/);
assert.deepEqual(availabilityClasses(storedHistory).slice(0, 3), [
  "Archer class",
  "Astute class",
  "Bay class",
]);

const syntheticHistory = Array.from({ length: 52 }, (_, index) => {
  const weekEnding = new Date("2025-08-31T00:00:00Z");
  weekEnding.setUTCDate(weekEnding.getUTCDate() + index * 7);
  const snapshotDate = weekEnding.toISOString().slice(0, 10);
  const releasedAt = `${snapshotDate}T12:00:00Z`;
  const recordedAtDate = new Date(releasedAt);
  recordedAtDate.setUTCDate(recordedAtDate.getUTCDate() + 1);
  return {
    schemaVersion: 1,
    weekEnding: snapshotDate,
    revision: 1,
    recordedAt: recordedAtDate.toISOString(),
    observationMethod: "reviewed-public-status-v1",
    sourceRelease: { snapshotDate, releaseRevision: 1, releasedAt },
    observations: {
      a: { vesselClass: "Alpha class", status: index < 26 ? "Available" : "In re-fit" },
      b: { vesselClass: "Alpha class", status: "Unknown" },
      c: { vesselClass: "Beta class", status: "Deployed" },
      museum: { vesselClass: "Heritage", status: "Museum ship" },
    },
  };
});
const syntheticText = syntheticHistory.map(JSON.stringify).join("\n");
const parsedSynthetic = parseAvailabilityHistory(syntheticText);
const fleetYear = calculateTwelveMonthAvailability(parsedSynthetic, { asOfDate: "2026-08-23" });
assert.equal(fleetYear.state, "ready");
assert.equal(fleetYear.observationCount, 52);
assert.equal(fleetYear.spanDays, 357);
assert.equal(fleetYear.eligibleVesselWeeks, 156);
assert.equal(fleetYear.knownVesselWeeks, 104);
assert.equal(fleetYear.activeVesselWeeks, 78);
assert.equal(fleetYear.unknownVesselWeeks, 52);
assert.equal(fleetYear.availabilityPercentage, 75);
assert.equal(fleetYear.coveragePercentage.toFixed(1), "66.7");

const alphaYear = calculateTwelveMonthAvailability(parsedSynthetic, {
  asOfDate: "2026-08-23",
  vesselClass: "Alpha class",
});
assert.equal(alphaYear.state, "ready");
assert.equal(alphaYear.availabilityPercentage, 50);
assert.equal(alphaYear.coveragePercentage, 50);
assert.equal(
  calculateTwelveMonthAvailability(parsedSynthetic.slice(1), { asOfDate: "2026-08-23" }).state,
  "insufficient_history",
);
assert.equal(
  calculateTwelveMonthAvailability(parsedSynthetic.slice(1), { asOfDate: "2026-08-23" })
    .availabilityPercentage,
  null,
);
assert.equal(
  calculateAvailabilityForRange(parsedSynthetic, {
    from: "2026-08-02",
    to: "2026-08-23",
    vesselClass: "Beta class",
  }).availabilityPercentage,
  100,
);

const correctedRecords = [
  syntheticHistory[0],
  {
    ...syntheticHistory[0],
    revision: 2,
    recordedAt: "2025-09-02T12:00:00Z",
    correctionReason: "Late reviewed public status correction.",
    sourceRelease: {
      snapshotDate: "2025-08-31",
      releaseRevision: 2,
      releasedAt: "2025-09-01T15:00:00Z",
    },
    observations: {
      ...syntheticHistory[0].observations,
      a: { vesselClass: "Alpha class", status: "Deployed" },
    },
  },
];
assert.equal(parsePhysicalAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n")).length, 2);
assert.equal(parseAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n")).length, 1);
assert.equal(
  parseAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n"))[0].observations.a.status,
  "Deployed",
);

const firstCandidateText = `${JSON.stringify(syntheticHistory[0])}\n`;
const correctedCandidateText = `${correctedRecords.map(JSON.stringify).join("\n")}\n`;
assert.equal(
  decideWeeklyAvailabilityCandidate({
    candidateText: firstCandidateText,
    weekEnding: syntheticHistory[0].weekEnding,
  }).action,
  "create",
);
assert.equal(
  decideWeeklyAvailabilityCandidate({
    candidateText: firstCandidateText,
    existingText: firstCandidateText,
    weekEnding: syntheticHistory[0].weekEnding,
  }).action,
  "noop",
);
const retriedCandidate = {
  ...syntheticHistory[0],
  recordedAt: "2025-09-02T13:00:00Z",
};
assert.equal(
  decideWeeklyAvailabilityCandidate({
    candidateText: `${JSON.stringify(retriedCandidate)}\n`,
    existingText: firstCandidateText,
    weekEnding: syntheticHistory[0].weekEnding,
  }).action,
  "noop",
);
assert.equal(
  decideWeeklyAvailabilityCandidate({
    candidateText: correctedCandidateText,
    existingText: firstCandidateText,
    weekEnding: syntheticHistory[0].weekEnding,
  }).action,
  "replace",
);
assert.throws(
  () =>
    decideWeeklyAvailabilityCandidate({
      candidateText: firstCandidateText,
      existingText: correctedCandidateText,
      weekEnding: syntheticHistory[0].weekEnding,
    }),
  /stale relative to the open weekly candidate/i,
);
assert.throws(
  () =>
    decideWeeklyAvailabilityCandidate({
      candidateText: `${JSON.stringify({
        ...retriedCandidate,
        observations: {
          ...retriedCandidate.observations,
          a: { vesselClass: "Alpha class", status: "Deployed" },
        },
      })}\n`,
      existingText: firstCandidateText,
      weekEnding: syntheticHistory[0].weekEnding,
    }),
  /same reviewed release produced conflicting weekly candidates/i,
);
const candidateTitle = "Record weekly availability 2025-08-31";
const canonicalCandidateBranch = "automation/weekly-availability-2025-08-31";
assert.deepEqual(
  selectOpenWeeklyCandidate({
    openPullRequests: [],
    title: candidateTitle,
    canonicalBranch: canonicalCandidateBranch,
    weekEnding: "2025-08-31",
  }),
  { branch: canonicalCandidateBranch, url: null },
);
assert.deepEqual(
  selectOpenWeeklyCandidate({
    openPullRequests: [
      {
        title: candidateTitle,
        headRefName: `${canonicalCandidateBranch}-12345`,
        url: "https://example.test/pull/1",
        isCrossRepository: false,
      },
    ],
    title: candidateTitle,
    canonicalBranch: canonicalCandidateBranch,
    weekEnding: "2025-08-31",
  }),
  { branch: `${canonicalCandidateBranch}-12345`, url: "https://example.test/pull/1" },
);
assert.throws(
  () =>
    selectOpenWeeklyCandidate({
      openPullRequests: [
        { title: candidateTitle },
        { title: candidateTitle },
      ],
      title: candidateTitle,
      canonicalBranch: canonicalCandidateBranch,
      weekEnding: "2025-08-31",
    }),
  /multiple open candidates/i,
);
assert.throws(
  () =>
    selectOpenWeeklyCandidate({
      openPullRequests: [
        {
          title: candidateTitle,
          headRefName: "untrusted-branch",
          url: "https://example.test/pull/2",
          isCrossRepository: false,
        },
      ],
      title: candidateTitle,
      canonicalBranch: canonicalCandidateBranch,
      weekEnding: "2025-08-31",
    }),
  /trusted same-repository automation branch/i,
);

const pushedSha = "a".repeat(40);
const exactPushedPullRequest = {
  number: 12,
  title: candidateTitle,
  url: "https://example.test/pull/12",
  headRefName: canonicalCandidateBranch,
  baseRefName: "main",
  headRefOid: pushedSha,
  isCrossRepository: false,
};
assert.deepEqual(
  inspectPushedWeeklyCandidate({
    openPullRequests: [],
    title: candidateTitle,
    canonicalBranch: canonicalCandidateBranch,
    baseBranch: "main",
    pushedSha,
  }),
  { state: "none", url: null },
  "No pull request before the push must proceed to creation.",
);
assert.deepEqual(
  inspectPushedWeeklyCandidate({
    openPullRequests: [exactPushedPullRequest],
    title: candidateTitle,
    canonicalBranch: canonicalCandidateBranch,
    baseBranch: "main",
    pushedSha,
  }),
  { state: "matching", url: exactPushedPullRequest.url },
  "An exact interleaved pull request must be treated as success.",
);
for (const mismatchedPullRequest of [
  { ...exactPushedPullRequest, title: `${candidateTitle} unexpected` },
  { ...exactPushedPullRequest, headRefName: `${canonicalCandidateBranch}-elsewhere` },
  { ...exactPushedPullRequest, baseRefName: "release" },
  { ...exactPushedPullRequest, headRefOid: "b".repeat(40) },
  { ...exactPushedPullRequest, isCrossRepository: true },
]) {
  assert.throws(
    () =>
      inspectPushedWeeklyCandidate({
        openPullRequests: [mismatchedPullRequest],
        title: candidateTitle,
        canonicalBranch: canonicalCandidateBranch,
        baseBranch: "main",
        pushedSha,
      }),
    /mismatched or points elsewhere/i,
  );
}
assert.throws(
  () =>
    inspectPushedWeeklyCandidate({
      openPullRequests: [
        exactPushedPullRequest,
        { ...exactPushedPullRequest, number: 13, url: "https://example.test/pull/13" },
      ],
      title: candidateTitle,
      canonicalBranch: canonicalCandidateBranch,
      baseBranch: "main",
      pushedSha,
    }),
  /ambiguous open pull requests/i,
);

function simulatePostCreateInterleaving({ queryResults, createStatus }) {
  let created = false;
  for (let index = 0; index < queryResults.length; index += 1) {
    if (index === 1) created = true;
    const inspection = inspectPushedWeeklyCandidate({
      openPullRequests: queryResults[index],
      title: candidateTitle,
      canonicalBranch: canonicalCandidateBranch,
      baseBranch: "main",
      pushedSha,
    });
    if (inspection.state === "matching") {
      return { outcome: "matching", created, branchMutationAfterCreate: false };
    }
  }
  return {
    outcome: createStatus === 0 ? "unconfirmed" : "orphan",
    created,
    branchMutationAfterCreate: false,
  };
}

assert.deepEqual(
  simulatePostCreateInterleaving({
    queryResults: [[exactPushedPullRequest]],
    createStatus: 1,
  }),
  { outcome: "matching", created: false, branchMutationAfterCreate: false },
  "A matching PR appearing before create must end the run without another mutation.",
);
assert.deepEqual(
  simulatePostCreateInterleaving({
    queryResults: [[], [], [exactPushedPullRequest]],
    createStatus: 1,
  }),
  { outcome: "matching", created: true, branchMutationAfterCreate: false },
  "A competing actor PR appearing only at the final post-create query must suppress cleanup.",
);
assert.deepEqual(
  simulatePostCreateInterleaving({ queryResults: [[], [], []], createStatus: 1 }),
  { outcome: "orphan", created: true, branchMutationAfterCreate: false },
  "Creation failure with no PR must leave an actionable, non-destructive orphan.",
);
assert.throws(
  () =>
    simulatePostCreateInterleaving({
      queryResults: [[], [{ ...exactPushedPullRequest, headRefOid: "b".repeat(40) }]],
      createStatus: 1,
    }),
  /mismatched or points elsewhere/i,
  "A mismatched competing PR must fail closed without reaching branch cleanup.",
);

const preCreateQueryIndex = workflow.indexOf('post_push_state="$(query_pushed_candidate)"');
const createIndex = workflow.indexOf('pr_url="$(gh pr create');
const postCreateQueryIndex = workflow.indexOf('post_create_state="$(query_pushed_candidate)"');
const finalQueryIndex = workflow.indexOf('final_candidate_state="$(query_pushed_candidate)"');
const failureIndex = workflow.indexOf('if (( create_status == 0 ));');
assert.ok(
  preCreateQueryIndex > 0 && preCreateQueryIndex < createIndex,
  "The matching-PR race must be checked before attempting creation.",
);
assert.ok(
  postCreateQueryIndex > createIndex && postCreateQueryIndex < finalQueryIndex,
  "The first post-create query must follow the creation attempt.",
);
assert.match(
  workflow.slice(postCreateQueryIndex, failureIndex),
  /state' <<<"\$post_create_state"[\s\S]*final_candidate_state="\$\(query_pushed_candidate\)"[\s\S]*state' <<<"\$final_candidate_state"/,
  "A competing actor PR appearing after the first post-create query must be accepted by a final query.",
);
assert.ok(finalQueryIndex > postCreateQueryIndex && finalQueryIndex < failureIndex);
assert.match(workflow.slice(finalQueryIndex), /validated candidate remains on \$\{branch\} at \$\{pushed_sha\}/);
assert.doesNotMatch(
  workflow.slice(createIndex),
  /git push/,
  "No post-create failure path may delete, rewind, or otherwise mutate the validated branch.",
);
assert.match(
  workflow,
  /remote_sha_after_push[\s\S]*!= "\$pushed_sha"/,
  "A concurrent branch change before creation must fail closed.",
);

const unsafeRecord = structuredClone(syntheticHistory[0]);
unsafeRecord.observations.a.position = { lat: 50, lon: -1 };
assert.throws(
  () => parseAvailabilityHistory(JSON.stringify(unsafeRecord)),
  /line 1 is invalid/,
);
assert.throws(
  () => parseAvailabilityHistory(JSON.stringify({ ...syntheticHistory[0], evidence: [] })),
  /line 1 is invalid/,
);

const sampleFleet = {
  metadata: {
    asOfDate: "2026-08-23",
    releaseRevision: 2,
    releasedAt: "2026-08-23T18:00:00Z",
  },
  vessels: [
    { id: "a", name: "A", vesselClass: "Alpha class", status: "Available" },
    { id: "b", name: "B", vesselClass: "Beta class", status: "Unknown" },
  ],
};
const sampleStatus = {
  schemaVersion: 2,
  snapshotDate: "2026-08-23",
  releaseRevision: 2,
  releasedAt: "2026-08-23T18:00:00Z",
  correctionReason: "Reviewed correction.",
  statuses: { a: "Available", b: "Unknown" },
};
const built = buildWeeklyAvailabilityObservation({
  fleet: sampleFleet,
  statusSnapshots: [sampleStatus],
  availabilityRecords: [],
  weekEnding: "2026-08-23",
  recordedAt: "2026-08-24T06:30:00Z",
});
assert.equal(built.revision, 1);
assert.deepEqual(built.observations.a, { vesselClass: "Alpha class", status: "Available" });
assert.throws(
  () =>
    buildWeeklyAvailabilityObservation({
      fleet: sampleFleet,
      statusSnapshots: [sampleStatus],
      availabilityRecords: [],
      weekEnding: "2026-08-23",
      recordedAt: "2026-08-23T17:59:59Z",
    }),
  /recordedAt must not be earlier than the reviewed source release/i,
);
assert.equal(
  buildWeeklyAvailabilityObservation({
    fleet: sampleFleet,
    statusSnapshots: [sampleStatus],
    availabilityRecords: [built],
    weekEnding: "2026-08-23",
    recordedAt: "2026-08-24T07:30:00Z",
  }),
  null,
);
assert.equal(
  buildWeeklyAvailabilityObservation({
    fleet: sampleFleet,
    statusSnapshots: [sampleStatus],
    availabilityRecords: [],
    weekEnding: "2026-08-30",
    recordedAt: "2026-08-31T06:30:00Z",
  }),
  null,
);
assert.equal(latestSunday(new Date("2026-08-25T12:00:00Z")), "2026-08-23");

const availabilityPath = new URL("../data/royal-navy/availability-history.jsonl", import.meta.url);
const beforeInvalidAppend = fs.readFileSync(availabilityPath);
const beforeInvalidAppendHash = sha256(beforeInvalidAppend);
const invalidAppend = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("./append-weekly-availability.mjs", import.meta.url)),
    "--week-ending",
    "2026-08-23",
    "--recorded-at",
    "2026-08-24T19:00:00Z",
    "--require-observation",
  ],
  { encoding: "utf8" },
);
assert.notEqual(invalidAppend.status, 0, "An invalid historical availability append unexpectedly succeeded.");
assert.match(
  invalidAppend.stderr,
  /recordedAt must not be earlier than the reviewed source release|weekly observation source must match the current reviewed public release|no reviewed public fleet release is available/i,
);
const afterInvalidAppend = fs.readFileSync(availabilityPath);
assert.equal(
  sha256(afterInvalidAppend),
  beforeInvalidAppendHash,
  "A rejected recordedAt append changed the ledger hash.",
);
assert.deepEqual(afterInvalidAppend, beforeInvalidAppend, "A rejected append changed ledger bytes.");

console.log("Weekly availability history, correction, safety and derivation tests passed.");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
