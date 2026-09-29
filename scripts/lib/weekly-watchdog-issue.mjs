export function createWeeklyWatchdogIssue(result, runUrl) {
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
      "The watchdog never fabricates or publishes fleet data. Resume the existing Codex recovery run for this cutoff, preserving its evidence and cutoff. Respect any active owner lock; do not start a competing sweep or reactivate the legacy OpenClaw automation. If an incomplete predecessor must be handed off, complete and record that handoff before starting another run.",
      "",
      "Before collection resumes, verify in the actual scheduled Codex execution context that GitHub DNS/connectivity and required repository plus private-store write access work; confirm the authenticated 69-record private projection matches both the current main and live production baselines; and confirm the encrypted backup is ready and restore-verified. If a prerequisite fails, defer and record the specific failure. Do not bypass access controls, advance the evidence cutoff, or claim completion. Keep any release owner-reviewed.",
    ].join("\n"),
  };
}
