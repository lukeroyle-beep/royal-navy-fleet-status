const LONDON_TIME_ZONE = "Europe/London";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

export function getLondonClock(instant) {
  const date = asValidDate(instant);
  const parts = Object.fromEntries(
    londonFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    timeZone: LONDON_TIME_ZONE,
    abbreviation: parts.timeZoneName,
  };
}

export function isSundayProductionHour(instant) {
  const clock = getLondonClock(instant);
  return clock.weekday === "Sun" && clock.hour === 12;
}

export function isSundayWatchdogWindow(instant) {
  const clock = getLondonClock(instant);
  return clock.weekday === "Sun" && clock.hour >= 18 && clock.hour <= 23;
}

export function resolveExpectedSnapshotDate({ instant, explicitDate = null, manual = false }) {
  if (explicitDate !== null && explicitDate !== undefined && explicitDate !== "") {
    assertIsoDate(explicitDate);
    return explicitDate;
  }

  if (manual) {
    throw new Error("A manual production-health check requires an explicit expected snapshot date.");
  }

  const clock = getLondonClock(instant);
  if (clock.weekday !== "Sun") {
    throw new Error("A scheduled weekly snapshot date can be derived only on Sunday in Europe/London.");
  }
  return clock.date;
}

export function evaluateWeeklyProductionHealth({
  instant,
  mode,
  explicitDate = null,
  repositoryMetadata,
  liveMetadata,
  liveError = null,
}) {
  const manual = mode === "manual";
  if (!manual && mode !== "scheduled-watchdog") {
    throw new Error(`Unsupported weekly production health mode: ${mode}`);
  }

  const clock = getLondonClock(instant);
  const expectedSnapshotDate = resolveExpectedSnapshotDate({
    instant,
    explicitDate,
    manual,
  });

  if (!manual && !isSundayWatchdogWindow(instant)) {
    return createResult({
      action: "none",
      clock,
      expectedSnapshotDate,
      liveError,
      liveMetadata,
      mode,
      outcome: "standby",
      repositoryMetadata,
      reasons: ["outside_sunday_watchdog_window"],
    });
  }

  const repositoryMatches = repositoryMetadata?.asOfDate === expectedSnapshotDate;
  const liveMatches = liveMetadata?.asOfDate === expectedSnapshotDate;
  const reasons = [];

  if (!repositoryMatches) reasons.push("repository_snapshot_missing");
  if (liveError) reasons.push("live_snapshot_unavailable");
  else if (!liveMatches) reasons.push("live_snapshot_missing");

  if (repositoryMatches && liveMatches) {
    return createResult({
      action: "resolve",
      clock,
      expectedSnapshotDate,
      liveError,
      liveMetadata,
      mode,
      outcome: "healthy",
      repositoryMetadata,
      reasons: [],
    });
  }

  return createResult({
    action: "alert",
    clock,
    expectedSnapshotDate,
    liveError,
    liveMetadata,
    mode,
    outcome: repositoryMatches ? "deployment_missing" : "snapshot_missing",
    repositoryMetadata,
    reasons,
  });
}

function createResult({
  action,
  clock,
  expectedSnapshotDate,
  liveError,
  liveMetadata,
  mode,
  outcome,
  repositoryMetadata,
  reasons,
}) {
  return {
    schemaVersion: "1.0.0",
    idempotencyKey: `royal-navy-weekly-snapshot:${expectedSnapshotDate}`,
    mode,
    expectedSnapshotDate,
    londonClock: clock,
    outcome,
    action,
    reasons,
    repositorySnapshot: snapshotIdentity(repositoryMetadata),
    liveSnapshot: snapshotIdentity(liveMetadata),
    liveError,
  };
}

function snapshotIdentity(metadata) {
  if (!metadata) return null;
  return {
    asOfDate: metadata.asOfDate ?? null,
    releaseRevision: metadata.releaseRevision ?? null,
    releasedAt: metadata.releasedAt ?? null,
  };
}

function asValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid instant: ${value}`);
  return date;
}

function assertIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) throw new Error(`Invalid snapshot date: ${value}`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid snapshot date: ${value}`);
  }
}

export { LONDON_TIME_ZONE };
