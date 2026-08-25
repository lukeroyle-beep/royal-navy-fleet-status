import {
  collapseAvailabilityHistory,
  isSunday,
} from "../../src/utils/availability-history.js";
import { collapseStatusHistory } from "../../src/utils/insights.js";
import { compareReleaseIdentity, isIsoInstant, readReleaseMetadata, releaseRevision } from "../../src/utils/release.js";

const OBSERVATION_METHOD = "reviewed-public-status-v1";

export function buildWeeklyAvailabilityObservation({
  fleet,
  statusSnapshots,
  availabilityRecords,
  weekEnding,
  recordedAt,
  correctionReason = null,
}) {
  if (!isSunday(weekEnding)) throw new Error("--week-ending must be an ISO Sunday date.");
  if (!isIsoInstant(recordedAt)) throw new Error("recordedAt must be an ISO instant.");
  const fleetRelease = readReleaseMetadata(fleet?.metadata, { allowLegacy: false });
  const statusHistory = collapseStatusHistory(statusSnapshots);
  const weekStart = shiftDate(weekEnding, -6);
  const source = statusHistory
    .filter((snapshot) => snapshot.snapshotDate >= weekStart && snapshot.snapshotDate <= weekEnding)
    .at(-1);
  if (!source) return null;

  const sourceRelease = {
    snapshotDate: source.snapshotDate,
    releaseRevision: releaseRevision(source),
    releasedAt: source.releasedAt,
  };
  if (
    !sourceRelease.releasedAt ||
    compareReleaseIdentity(
      { asOfDate: sourceRelease.snapshotDate, releaseRevision: sourceRelease.releaseRevision },
      fleetRelease,
    ) !== 0 ||
    sourceRelease.releasedAt !== fleetRelease.releasedAt
  ) {
    throw new Error("The weekly observation source must match the current reviewed public release.");
  }

  const fleetIds = fleet.vessels.map((vessel) => vessel.id).sort();
  const statusIds = Object.keys(source.statuses).sort();
  if (JSON.stringify(fleetIds) !== JSON.stringify(statusIds)) {
    throw new Error("The weekly observation source roster does not match the public fleet release.");
  }
  const observations = Object.fromEntries(
    fleet.vessels
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((vessel) => {
        if (source.statuses[vessel.id] !== vessel.status) {
          throw new Error(`The weekly source status does not match ${vessel.name}.`);
        }
        return [vessel.id, { vesselClass: vessel.vesselClass, status: vessel.status }];
      }),
  );

  const logicalHistory = collapseAvailabilityHistory(availabilityRecords);
  const previous = logicalHistory.at(-1) || null;
  const previousPhysical = availabilityRecords.at(-1) || null;
  if (previous && weekEnding < previous.weekEnding) {
    throw new Error("Weekly availability observations cannot be appended out of order.");
  }
  if (
    previousPhysical &&
    new Date(recordedAt).valueOf() <= new Date(previousPhysical.recordedAt).valueOf()
  ) {
    throw new Error("recordedAt must be later than the existing availability history.");
  }

  if (previous?.weekEnding === weekEnding) {
    const sameSource =
      previous.sourceRelease.snapshotDate === sourceRelease.snapshotDate &&
      previous.sourceRelease.releaseRevision === sourceRelease.releaseRevision &&
      previous.sourceRelease.releasedAt === sourceRelease.releasedAt;
    if (sameSource && JSON.stringify(previous.observations) === JSON.stringify(observations)) {
      return null;
    }
    if (
      compareReleaseIdentity(
        {
          asOfDate: previous.sourceRelease.snapshotDate,
          releaseRevision: previous.sourceRelease.releaseRevision,
        },
        { asOfDate: sourceRelease.snapshotDate, releaseRevision: sourceRelease.releaseRevision },
      ) >= 0
    ) {
      throw new Error("An availability correction must use a later reviewed public release.");
    }
    const reason =
      typeof correctionReason === "string" && correctionReason.trim()
        ? correctionReason.trim()
        : source.correctionReason
          ? `Source release correction: ${source.correctionReason}`
          : `Later reviewed public release selected for week ending ${weekEnding}.`;
    return createRecord({
      weekEnding,
      revision: previous.revision + 1,
      recordedAt,
      sourceRelease,
      observations,
      correctionReason: reason,
    });
  }

  return createRecord({
    weekEnding,
    revision: 1,
    recordedAt,
    sourceRelease,
    observations,
  });
}

export function latestSunday(reference = new Date()) {
  const date = new Date(reference);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid collection reference date.");
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function createRecord({
  weekEnding,
  revision,
  recordedAt,
  sourceRelease,
  observations,
  correctionReason = null,
}) {
  return {
    schemaVersion: 1,
    weekEnding,
    revision,
    recordedAt,
    observationMethod: OBSERVATION_METHOD,
    sourceRelease,
    ...(correctionReason ? { correctionReason } : {}),
    observations,
  };
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
