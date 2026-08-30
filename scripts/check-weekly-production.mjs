import fs from "node:fs";
import path from "node:path";

import { evaluateWeeklyProductionHealth } from "./lib/weekly-scheduler.mjs";

const mode = readArgument("--mode=") || "scheduled-watchdog";
const instant = readArgument("--at=") || new Date().toISOString();
const explicitDate = readArgument("--expected-date=");
const repositoryPath = path.resolve(
  readArgument("--repository-data=") || "data/royal-navy/vessels.json",
);
const liveUrl =
  readArgument("--live-url=") ||
  "https://british-armed-forces-tracker.open-defence-data.workers.dev/data/royal-navy/vessels.json";
const outputPath = readArgument("--output=");

const startedAt = new Date().toISOString();
const repositoryPayload = readJson(repositoryPath, "repository fleet data");
const live = await fetchLiveSnapshot(liveUrl);
const evaluated = evaluateWeeklyProductionHealth({
  instant,
  mode,
  explicitDate,
  repositoryMetadata: repositoryPayload.metadata,
  liveMetadata: live.payload?.metadata ?? null,
  liveError: live.error,
});
const completedAt = new Date().toISOString();
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const result = {
  ...evaluated,
  startedAt,
  completedAt,
  repositoryCommit: process.env.GITHUB_SHA || null,
  workflowRunUrl: runUrl,
  liveUrl,
  deploymentResult:
    evaluated.liveSnapshot?.asOfDate === evaluated.expectedSnapshotDate
      ? "expected_snapshot_observed"
      : live.error
        ? "live_check_failed"
        : "expected_snapshot_not_observed",
  issue: createIssue(evaluated, runUrl),
};

const serialised = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) writeJsonAtomic(path.resolve(outputPath), serialised);
process.stdout.write(serialised);

function readArgument(prefix) {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function readJson(targetPath, label) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is unavailable or invalid: ${safeMessage(error)}`);
  }
}

async function fetchLiveSnapshot(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { payload: null, error: `HTTP ${response.status}` };
    }
    return { payload: await response.json(), error: null };
  } catch (error) {
    return { payload: null, error: safeMessage(error) };
  }
}

function createIssue(result, runUrl) {
  const title = `[OSINT scheduler] Sunday fleet sweep blocked — ${result.expectedSnapshotDate}`;
  const observedRepository = result.repositorySnapshot?.asOfDate || "unavailable";
  const observedLive = result.liveSnapshot?.asOfDate || "unavailable";
  return {
    title,
    marker: `<!-- rn-fleet-weekly-watchdog:${result.expectedSnapshotDate} -->`,
    body: [
      `<!-- rn-fleet-weekly-watchdog:${result.expectedSnapshotDate} -->`,
      "## Weekly fleet snapshot watchdog",
      "",
      `The expected **${result.expectedSnapshotDate}** weekly production snapshot was not confirmed after the Sunday grace period.`,
      "",
      `- Repository snapshot observed: \`${observedRepository}\``,
      `- Live snapshot observed: \`${observedLive}\``,
      `- Outcome: \`${result.outcome}\``,
      `- Reasons: ${result.reasons.map((reason) => `\`${reason}\``).join(", ") || "none"}`,
      `- Workflow run: ${runUrl || "local/manual check"}`,
      "",
      "This watchdog never fabricates or publishes fleet data. Run the canonical OpenClaw Sunday automation manually, repair any evidence or private-input prerequisite, and keep the release owner-reviewed.",
    ].join("\n"),
  };
}

function writeJsonAtomic(targetPath, serialised) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, serialised, { mode: 0o600 });
  fs.renameSync(temporaryPath, targetPath);
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
}
