import assert from "node:assert/strict";

import {
  evaluateWeeklyProductionHealth,
  getLondonClock,
  isSundayProductionHour,
  isSundayWatchdogWindow,
  resolveExpectedSnapshotDate,
} from "./lib/weekly-scheduler.mjs";

const metadata = (asOfDate, releaseRevision = 1) => ({
  asOfDate,
  releaseRevision,
  releasedAt: `${asOfDate}T17:00:00Z`,
});

assert.equal(isSundayProductionHour("2026-08-30T11:00:00Z"), true, "BST Sunday noon is 11:00 UTC.");
assert.equal(isSundayProductionHour("2026-01-11T12:00:00Z"), true, "GMT Sunday noon is 12:00 UTC.");
assert.equal(isSundayProductionHour("2026-03-29T11:00:00Z"), true, "The BST transition Sunday uses the new offset.");
assert.equal(isSundayProductionHour("2026-03-29T12:00:00Z"), false, "A fixed 12:00 UTC cron is late after the BST transition.");
assert.equal(isSundayProductionHour("2026-10-25T12:00:00Z"), true, "The GMT transition Sunday uses the new offset.");
assert.equal(isSundayProductionHour("2026-10-25T11:00:00Z"), false, "The pre-transition UTC slot is early after clocks change.");

assert.deepEqual(getLondonClock("2026-08-30T11:00:00Z"), {
  date: "2026-08-30",
  weekday: "Sun",
  hour: 12,
  minute: 0,
  second: 0,
  timeZone: "Europe/London",
  abbreviation: "BST",
});
assert.equal(isSundayWatchdogWindow("2026-08-30T17:15:00Z"), true);
assert.equal(isSundayWatchdogWindow("2026-08-30T16:59:59Z"), false);
assert.equal(isSundayWatchdogWindow("2026-08-30T23:15:00Z"), false, "BST midnight is Monday, not a Sunday watchdog run.");
assert.equal(isSundayWatchdogWindow("2026-10-25T18:15:00Z"), true, "GMT watchdog runs at the same local hour.");

assert.equal(
  resolveExpectedSnapshotDate({ instant: "2026-08-30T19:00:00Z" }),
  "2026-08-30",
);
assert.equal(
  resolveExpectedSnapshotDate({ instant: "2026-08-31T10:00:00Z", explicitDate: "2026-08-30", manual: true }),
  "2026-08-30",
);
assert.throws(
  () => resolveExpectedSnapshotDate({ instant: "2026-08-31T10:00:00Z" }),
  /only on Sunday/i,
);
assert.throws(
  () => resolveExpectedSnapshotDate({ instant: "2026-08-31T10:00:00Z", manual: true }),
  /requires an explicit expected snapshot date/i,
);
assert.throws(
  () => resolveExpectedSnapshotDate({ instant: "2026-08-31T10:00:00Z", explicitDate: "2026-02-30", manual: true }),
  /invalid snapshot date/i,
);

const healthyInput = {
  instant: "2026-08-30T18:15:00Z",
  mode: "scheduled-watchdog",
  repositoryMetadata: metadata("2026-08-30"),
  liveMetadata: metadata("2026-08-30"),
};
const healthy = evaluateWeeklyProductionHealth(healthyInput);
assert.equal(healthy.outcome, "healthy");
assert.equal(healthy.action, "resolve");

const repeated = evaluateWeeklyProductionHealth(healthyInput);
assert.deepEqual(repeated, healthy, "An equivalent duplicate invocation is deterministic and idempotent.");

const missing = evaluateWeeklyProductionHealth({
  ...healthyInput,
  repositoryMetadata: metadata("2026-08-23", 4),
  liveMetadata: metadata("2026-08-23", 4),
});
assert.equal(missing.outcome, "snapshot_missing");
assert.equal(missing.action, "alert");
assert.deepEqual(missing.reasons, ["repository_snapshot_missing", "live_snapshot_missing"]);

const deploymentMissing = evaluateWeeklyProductionHealth({
  ...healthyInput,
  liveMetadata: metadata("2026-08-23", 4),
});
assert.equal(deploymentMissing.outcome, "deployment_missing");
assert.deepEqual(deploymentMissing.reasons, ["live_snapshot_missing"]);

const manual = evaluateWeeklyProductionHealth({
  instant: "2026-08-31T09:00:00Z",
  mode: "manual",
  explicitDate: "2026-08-30",
  repositoryMetadata: metadata("2026-08-30"),
  liveMetadata: metadata("2026-08-30"),
});
assert.equal(manual.outcome, "healthy");
assert.equal(manual.expectedSnapshotDate, "2026-08-30");

const standby = evaluateWeeklyProductionHealth({
  instant: "2026-08-30T16:15:00Z",
  mode: "scheduled-watchdog",
  repositoryMetadata: metadata("2026-08-23", 4),
  liveMetadata: metadata("2026-08-23", 4),
});
assert.equal(standby.outcome, "standby");
assert.equal(standby.action, "none");

const delayedIntoMonday = evaluateWeeklyProductionHealth({
  instant: "2026-08-30T23:15:00Z",
  mode: "scheduled-watchdog",
  repositoryMetadata: metadata("2026-08-23", 4),
  liveMetadata: metadata("2026-08-23", 4),
});
assert.equal(delayedIntoMonday.outcome, "standby");
assert.equal(delayedIntoMonday.action, "none");
assert.equal(delayedIntoMonday.expectedSnapshotDate, "2026-08-30");

console.log("Weekly scheduler and production-watchdog tests passed.");
