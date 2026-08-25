import { compareReleaseIdentity, isIsoDate, isIsoInstant, isPositiveInteger } from "./release.js";

const ACTIVE_STATUSES = new Set(["Available", "Deployed"]);
const EXCLUDED_STATUSES = new Set(["Museum ship", "Decommissioned"]);
const ALLOWED_STATUSES = new Set([
  "Available",
  "Deployed",
  "In re-fit",
  "Unknown",
  "Museum ship",
  "Decommissioned",
]);
const OBSERVATION_METHOD = "reviewed-public-status-v1";
const EXPECTED_WEEKLY_OBSERVATIONS = 52;
const MINIMUM_YEAR_SPAN_DAYS = 350;

export function parseAvailabilityHistory(text) {
  return collapseAvailabilityHistory(parsePhysicalAvailabilityHistory(text));
}

export function parsePhysicalAvailabilityHistory(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const records = text
    .trim()
    .split("\n")
    .map((line, index) => parseLine(line, index));

  if (records[0].revision !== 1 || records[0].correctionReason !== undefined) {
    throw new Error("Availability history must begin with revision 1.");
  }
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    if (
      current.weekEnding < previous.weekEnding ||
      (current.weekEnding === previous.weekEnding && current.revision <= previous.revision)
    ) {
      throw new Error("Availability history must be ordered by week and revision.");
    }
    if (current.weekEnding === previous.weekEnding) {
      if (current.revision !== previous.revision + 1 || !current.correctionReason?.trim()) {
        throw new Error("An availability correction must increment the revision and explain why.");
      }
      if (compareSourceRelease(previous.sourceRelease, current.sourceRelease) >= 0) {
        throw new Error("An availability correction must reference a later public release.");
      }
    } else if (current.revision !== 1 || current.correctionReason !== undefined) {
      throw new Error("A new availability week must begin at revision 1.");
    }
    if (new Date(current.recordedAt).valueOf() <= new Date(previous.recordedAt).valueOf()) {
      throw new Error("Availability history recordedAt instants must be ascending.");
    }
  }
  return records;
}

export function collapseAvailabilityHistory(records) {
  const collapsed = [];
  for (const record of records) {
    if (collapsed.at(-1)?.weekEnding === record.weekEnding) {
      collapsed[collapsed.length - 1] = record;
    } else {
      collapsed.push(record);
    }
  }
  return collapsed;
}

export function calculateAvailabilityForRange(
  history,
  { from, to, vesselClass = null, minimumObservations = 1, minimumSpanDays = 0 } = {},
) {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new Error("Availability range must use ascending ISO dates.");
  }
  if (!Number.isInteger(minimumObservations) || minimumObservations < 1) {
    throw new Error("minimumObservations must be a positive integer.");
  }
  if (!Number.isInteger(minimumSpanDays) || minimumSpanDays < 0) {
    throw new Error("minimumSpanDays must be a non-negative integer.");
  }

  const records = collapseAvailabilityHistory(history)
    .filter((record) => record.weekEnding >= from && record.weekEnding <= to);
  let eligibleVesselWeeks = 0;
  let knownVesselWeeks = 0;
  let activeVesselWeeks = 0;
  let unknownVesselWeeks = 0;

  for (const record of records) {
    for (const observation of Object.values(record.observations)) {
      if (vesselClass && observation.vesselClass !== vesselClass) continue;
      if (EXCLUDED_STATUSES.has(observation.status)) continue;
      eligibleVesselWeeks += 1;
      if (observation.status === "Unknown") {
        unknownVesselWeeks += 1;
        continue;
      }
      knownVesselWeeks += 1;
      if (ACTIVE_STATUSES.has(observation.status)) activeVesselWeeks += 1;
    }
  }

  const spanDays = records.length > 1
    ? Math.round((dateValue(records.at(-1).weekEnding) - dateValue(records[0].weekEnding)) / 86_400_000)
    : 0;
  const historyMature =
    records.length >= minimumObservations && spanDays >= minimumSpanDays;
  const state = !historyMature
    ? "insufficient_history"
    : knownVesselWeeks === 0
      ? "insufficient_known_status"
      : "ready";

  return {
    state,
    from,
    to,
    vesselClass,
    observationCount: records.length,
    requiredObservationCount: minimumObservations,
    spanDays,
    requiredSpanDays: minimumSpanDays,
    eligibleVesselWeeks,
    knownVesselWeeks,
    activeVesselWeeks,
    unknownVesselWeeks,
    coveragePercentage: percentage(knownVesselWeeks, eligibleVesselWeeks),
    availabilityPercentage:
      state === "ready" ? percentage(activeVesselWeeks, knownVesselWeeks) : null,
  };
}

export function calculateTwelveMonthAvailability(history, { asOfDate, vesselClass = null } = {}) {
  if (!isIsoDate(asOfDate)) throw new Error("Twelve-month availability requires an ISO asOfDate.");
  const fromDate = new Date(`${asOfDate}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 364);
  return calculateAvailabilityForRange(history, {
    from: fromDate.toISOString().slice(0, 10),
    to: asOfDate,
    vesselClass,
    minimumObservations: EXPECTED_WEEKLY_OBSERVATIONS,
    minimumSpanDays: MINIMUM_YEAR_SPAN_DAYS,
  });
}

export function availabilityClasses(history) {
  return [...new Set(history.flatMap((record) =>
    Object.values(record.observations).map((observation) => observation.vesselClass),
  ))].sort((left, right) => left.localeCompare(right));
}

export function isSunday(value) {
  return isIsoDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 0;
}

function parseLine(line, index) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    throw new Error(`Availability history line ${index + 1} is not valid JSON.`);
  }
  if (!isValidRecord(record)) {
    throw new Error(`Availability history line ${index + 1} is invalid.`);
  }
  return record;
}

function isValidRecord(record) {
  if (
    !record ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "weekEnding",
      "revision",
      "recordedAt",
      "observationMethod",
      "sourceRelease",
      "correctionReason",
      "observations",
    ]) ||
    record.schemaVersion !== 1 ||
    !isSunday(record.weekEnding) ||
    !isPositiveInteger(record.revision) ||
    !isIsoInstant(record.recordedAt) ||
    record.observationMethod !== OBSERVATION_METHOD ||
    !isValidSourceRelease(record.sourceRelease) ||
    !record.observations ||
    typeof record.observations !== "object" ||
    Array.isArray(record.observations) ||
    Object.keys(record.observations).length === 0 ||
    (record.correctionReason !== undefined &&
      (typeof record.correctionReason !== "string" || !record.correctionReason.trim()))
  ) {
    return false;
  }
  if (new Date(record.recordedAt).valueOf() < new Date(record.sourceRelease.releasedAt).valueOf()) {
    return false;
  }
  const weekStart = dateValue(record.weekEnding) - 6 * 86_400_000;
  const sourceDate = dateValue(record.sourceRelease.snapshotDate);
  if (sourceDate < weekStart || sourceDate > dateValue(record.weekEnding)) return false;
  return Object.entries(record.observations).every(([vesselId, observation]) =>
    Boolean(vesselId.trim()) &&
    observation &&
    hasOnlyKeys(observation, ["vesselClass", "status"]) &&
    typeof observation.vesselClass === "string" &&
    Boolean(observation.vesselClass.trim()) &&
    ALLOWED_STATUSES.has(observation.status),
  );
}

function isValidSourceRelease(sourceRelease) {
  return (
    sourceRelease &&
    hasOnlyKeys(sourceRelease, ["snapshotDate", "releaseRevision", "releasedAt"]) &&
    isIsoDate(sourceRelease.snapshotDate) &&
    isPositiveInteger(sourceRelease.releaseRevision) &&
    isIsoInstant(sourceRelease.releasedAt)
  );
}

function compareSourceRelease(left, right) {
  return compareReleaseIdentity(
    { asOfDate: left.snapshotDate, releaseRevision: left.releaseRevision },
    { asOfDate: right.snapshotDate, releaseRevision: right.releaseRevision },
  );
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function percentage(numerator, denominator) {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function dateValue(value) {
  return new Date(`${value}T00:00:00Z`).valueOf();
}
