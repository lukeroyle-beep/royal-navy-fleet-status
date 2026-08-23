import { compareReleaseIdentity, readReleaseMetadata, releaseRevision } from "../../src/utils/release.js";

export function buildStatusSnapshot({ fleet, snapshots, correction = false, reason = null }) {
  const current = readReleaseMetadata(fleet?.metadata);
  const previous = snapshots.at(-1) || null;
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";

  if (reason !== null && !correction) {
    throw new Error("--reason can only be used with --correction.");
  }
  if (!previous) {
    if (correction) throw new Error("--correction requires an existing snapshot for the dataset date.");
    if (current.releaseRevision !== 1) {
      throw new Error("The first status snapshot must use release revision 1.");
    }
    return createRecord(current, fleet.vessels);
  }

  const previousIdentity = {
    asOfDate: previous.snapshotDate,
    releaseRevision: releaseRevision(previous),
    releasedAt: previous.releasedAt ?? null,
  };
  if (previous.schemaVersion === 2 && current.legacy) {
    throw new Error("Release metadata cannot return to the legacy format after revisioning is adopted.");
  }
  if (current.asOfDate < previousIdentity.asOfDate) {
    throw new Error("Status snapshots cannot be appended out of date order.");
  }
  if (
    previousIdentity.releasedAt &&
    current.releasedAt &&
    new Date(current.releasedAt).valueOf() <= new Date(previousIdentity.releasedAt).valueOf()
  ) {
    throw new Error("metadata.releasedAt must be later than the prior status release.");
  }

  if (current.asOfDate === previousIdentity.asOfDate) {
    if (!correction) {
      throw new Error(
        `Status snapshot ${current.asOfDate} already exists; pass --correction and --reason to append a correction.`,
      );
    }
    if (!trimmedReason) throw new Error("A same-day correction requires a non-empty --reason.");
    if (current.legacy || current.releaseRevision !== previousIdentity.releaseRevision + 1) {
      throw new Error("A same-day correction must increment metadata.releaseRevision by exactly one.");
    }
    return createRecord(current, fleet.vessels, trimmedReason);
  }

  if (correction) throw new Error("--correction is only valid for the latest snapshot date.");
  if (current.releaseRevision !== 1) {
    throw new Error("A new dataset date must start at metadata.releaseRevision 1.");
  }
  if (compareReleaseIdentity(previousIdentity, current) >= 0) {
    throw new Error("The status snapshot release identity must advance.");
  }
  return createRecord(current, fleet.vessels);
}

function createRecord(release, vessels, correctionReason = null) {
  const statuses = Object.fromEntries(vessels.map((vessel) => [vessel.id, vessel.status]));
  if (release.legacy) {
    return { schemaVersion: 1, snapshotDate: release.asOfDate, statuses };
  }
  return {
    schemaVersion: 2,
    snapshotDate: release.asOfDate,
    releaseRevision: release.releaseRevision,
    releasedAt: release.releasedAt,
    ...(correctionReason ? { correctionReason } : {}),
    statuses,
  };
}
