import {
  compareReleaseIdentity,
  isIsoDate,
  isIsoInstant,
  isPositiveInteger,
  releaseRevision,
} from "./release.js";

const ACTIVE_STATUSES = new Set(["Available", "Deployed"]);
const EXCLUDED_AVAILABILITY_STATUSES = new Set(["Museum ship", "Decommissioned"]);
const ALLOWED_STATUSES = new Set([
  "Available",
  "Deployed",
  "In re-fit",
  "Unknown",
  "Museum ship",
  "Decommissioned",
]);
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const EXPECTED_WEEKLY_OBSERVATIONS = 52;
const MIN_MATURITY_SPAN_MS = 350 * 24 * 60 * 60 * 1000;

export function parseStatusHistory(text) {
  return collapseStatusHistory(parsePhysicalStatusHistory(text));
}

export function parsePhysicalStatusHistory(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const snapshots = text
    .trim()
    .split("\n")
    .map((line, index) => {
      let snapshot;
      try {
        snapshot = JSON.parse(line);
      } catch {
        throw new Error(`Status history line ${index + 1} is not valid JSON.`);
      }
      if (!isValidSnapshotShape(snapshot)) {
        throw new Error(`Status history line ${index + 1} is invalid.`);
      }
      for (const [vesselId, status] of Object.entries(snapshot.statuses)) {
        if (!vesselId.trim() || !ALLOWED_STATUSES.has(status)) {
          throw new Error(`Status history line ${index + 1} has an invalid status.`);
        }
      }
      return snapshot;
    });

  if (releaseRevision(snapshots[0]) !== 1 || snapshots[0].correctionReason !== undefined) {
    throw new Error("Status history must begin with release revision 1.");
  }
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (previous.schemaVersion === 2 && current.schemaVersion === 1) {
      throw new Error("Status history cannot return to the legacy schema after revisioning is adopted.");
    }
    if (compareReleaseIdentity(previous, current) >= 0) {
      throw new Error("Status history snapshots must be ordered by date and release revision.");
    }
    if (previous.snapshotDate === current.snapshotDate) {
      if (current.schemaVersion !== 2 || !current.correctionReason?.trim()) {
        throw new Error("A same-day status snapshot must be a v2 correction with a reason.");
      }
    } else if (releaseRevision(current) !== 1 || current.correctionReason !== undefined) {
      throw new Error("A new status snapshot date must start at release revision 1.");
    }
    if (
      previous.releasedAt &&
      current.releasedAt &&
      new Date(previous.releasedAt).valueOf() >= new Date(current.releasedAt).valueOf()
    ) {
      throw new Error("Status snapshot releasedAt instants must be ascending.");
    }
  }
  return snapshots;
}

export function collapseStatusHistory(snapshots) {
  const collapsed = [];
  for (const snapshot of snapshots) {
    if (collapsed.at(-1)?.snapshotDate === snapshot.snapshotDate) {
      collapsed[collapsed.length - 1] = snapshot;
    } else {
      collapsed.push(snapshot);
    }
  }
  return collapsed;
}

export function validatePublicationChanges(raw) {
  if (
    !raw ||
    ![1, 2].includes(raw.schemaVersion) ||
    !isIsoDate(raw.previousAsOfDate) ||
    !isIsoDate(raw.currentAsOfDate) ||
    !raw.counts ||
    !Array.isArray(raw.changes)
  ) {
    throw new Error("Publication changes are invalid.");
  }
  if (raw.schemaVersion === 1) {
    if (raw.previousAsOfDate >= raw.currentAsOfDate) {
      throw new Error("Legacy publication changes must use ascending dataset dates.");
    }
    return raw;
  }
  if (
    !isPositiveInteger(raw.previousReleaseRevision) ||
    !isPositiveInteger(raw.currentReleaseRevision) ||
    (raw.previousReleasedAt !== null && !isIsoInstant(raw.previousReleasedAt)) ||
    (raw.previousReleasedAt === null && raw.previousReleaseRevision !== 1) ||
    !isIsoInstant(raw.currentReleasedAt) ||
    (raw.previousAsOfDate !== raw.currentAsOfDate && raw.currentReleaseRevision !== 1) ||
    (raw.previousReleasedAt !== null &&
      new Date(raw.previousReleasedAt).valueOf() >= new Date(raw.currentReleasedAt).valueOf()) ||
    compareReleaseIdentity(
      { asOfDate: raw.previousAsOfDate, releaseRevision: raw.previousReleaseRevision },
      { asOfDate: raw.currentAsOfDate, releaseRevision: raw.currentReleaseRevision },
    ) >= 0
  ) {
    throw new Error("Publication change release identities are invalid.");
  }
  return raw;
}

export function getClassSnapshotSummary(vessels, vesselClass, history, asOfDate) {
  const classVessels = vessels.filter((vessel) => vessel.vesselClass === vesselClass);
  const eligible = classVessels.filter((vessel) => isAvailabilityEligible(vessel.status));
  const active = eligible.filter((vessel) => ACTIVE_STATUSES.has(vessel.status)).length;
  const unknown = eligible.filter((vessel) => vessel.status === "Unknown").length;
  const activePercentage = percentage(active, eligible.length);
  const previousSnapshot = latestSnapshotBefore(history, asOfDate);
  const previousActive = previousSnapshot
    ? eligible.filter((vessel) => ACTIVE_STATUSES.has(previousSnapshot.statuses[vessel.id])).length
    : null;
  const previousPercentage = previousActive === null ? null : percentage(previousActive, eligible.length);
  const rolling = getRollingAvailability(history, eligible.map((vessel) => vessel.id), asOfDate);

  return {
    vesselCount: classVessels.length,
    eligibleCount: eligible.length,
    active,
    unknown,
    activePercentage,
    activeDelta: previousActive === null ? null : active - previousActive,
    percentageDelta:
      previousPercentage === null || activePercentage === null
        ? null
        : activePercentage - previousPercentage,
    rolling,
  };
}

export function getVesselAvailability(history, vessel, asOfDate) {
  if (!isAvailabilityEligible(vessel.status)) {
    return {
      availabilityLabel: "Not applicable",
      coverageLabel: "Excluded from fleet availability",
      mature: false,
    };
  }

  const rolling = getRollingAvailability(history, [vessel.id], asOfDate);
  if (!rolling.mature) {
    return {
      availabilityLabel: `History building · ${rolling.observationCount}/${EXPECTED_WEEKLY_OBSERVATIONS} observations`,
      coverageLabel: `Known status · ${rolling.knownVesselWeeks}/${rolling.totalVesselWeeks} observations`,
      mature: false,
    };
  }

  return {
    availabilityLabel:
      rolling.availabilityPercentage === null
        ? "Insufficient known status"
        : `${rolling.availabilityPercentage.toFixed(0)}%`,
    coverageLabel: `Status coverage · ${rolling.coveragePercentage.toFixed(0)}%`,
    mature: true,
  };
}

export function getEvidenceFreshness(evidenceDate, asOfDate) {
  if (!isIsoDate(evidenceDate) || !isIsoDate(asOfDate)) return "No dated public location";
  const age = Math.round((dateValue(asOfDate) - dateValue(evidenceDate)) / 86_400_000);
  if (age < 0) return "Evidence date is after dataset date";
  if (age === 0) return "Updated on dataset date";
  if (age === 1) return "1 day old";
  return `${age} days old`;
}

export function getVesselChange(changes, vesselId) {
  return changes?.changes?.find((change) => change.vesselId === vesselId) || null;
}

export function formatSignedDelta(value, suffix = "") {
  if (value === null || value === undefined || value === 0) return "";
  const arrow = value > 0 ? "↑" : "↓";
  const magnitude = Math.abs(value);
  return `${arrow}${Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(1)}${suffix}`;
}

export function shortClassName(value) {
  return value
    .replace("Type 45 / Daring class", "Type 45")
    .replace("Type 23 / Duke class", "Type 23")
    .replace("Queen Elizabeth class", "Carriers")
    .replace("Multi-Role Ocean Surveillance Ship", "MROSS")
    .replace("Specialist mine hunting mothership", "Mine mothership")
    .replace("Sea class 18 m variant", "Sea class")
    .replace("Ice patrol ship", "Ice patrol")
    .replace("Ocean survey ship", "Ocean survey")
    .replace(/ class$/, "");
}

function getRollingAvailability(history, vesselIds, asOfDate) {
  const cutoff = dateValue(asOfDate) - YEAR_MS;
  const snapshots = history.filter((snapshot) => {
    const value = dateValue(snapshot.snapshotDate);
    return value > cutoff && value <= dateValue(asOfDate);
  });
  let knownVesselWeeks = 0;
  let activeVesselWeeks = 0;

  for (const snapshot of snapshots) {
    for (const vesselId of vesselIds) {
      const status = snapshot.statuses[vesselId];
      if (!status || status === "Unknown") continue;
      knownVesselWeeks += 1;
      if (ACTIVE_STATUSES.has(status)) activeVesselWeeks += 1;
    }
  }

  const totalVesselWeeks = snapshots.length * vesselIds.length;
  const observationSpan = snapshots.length > 1
    ? dateValue(snapshots.at(-1).snapshotDate) - dateValue(snapshots[0].snapshotDate)
    : 0;
  return {
    observationCount: snapshots.length,
    knownVesselWeeks,
    activeVesselWeeks,
    totalVesselWeeks,
    availabilityPercentage: percentage(activeVesselWeeks, knownVesselWeeks),
    coveragePercentage: percentage(knownVesselWeeks, totalVesselWeeks) || 0,
    mature:
      snapshots.length >= EXPECTED_WEEKLY_OBSERVATIONS &&
      observationSpan >= MIN_MATURITY_SPAN_MS,
  };
}

function latestSnapshotBefore(history, asOfDate) {
  return [...history].reverse().find((snapshot) => snapshot.snapshotDate < asOfDate) || null;
}

function isAvailabilityEligible(status) {
  return !EXCLUDED_AVAILABILITY_STATUSES.has(status);
}

function percentage(numerator, denominator) {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function dateValue(value) {
  return new Date(`${value}T00:00:00Z`).valueOf();
}

function isValidSnapshotShape(snapshot) {
  if (
    !snapshot ||
    ![1, 2].includes(snapshot.schemaVersion) ||
    !isIsoDate(snapshot.snapshotDate) ||
    !snapshot.statuses ||
    typeof snapshot.statuses !== "object" ||
    Array.isArray(snapshot.statuses)
  ) {
    return false;
  }
  if (snapshot.schemaVersion === 1) {
    return (
      snapshot.releaseRevision === undefined &&
      snapshot.releasedAt === undefined &&
      snapshot.correctionReason === undefined
    );
  }
  return (
    isPositiveInteger(snapshot.releaseRevision) &&
    isIsoInstant(snapshot.releasedAt) &&
    (snapshot.correctionReason === undefined ||
      (typeof snapshot.correctionReason === "string" && Boolean(snapshot.correctionReason.trim())))
  );
}
