import { compareReleaseIdentity, readReleaseMetadata } from "../../src/utils/release.js";

export function publicationReleaseFields(previousMetadata, currentMetadata) {
  const previous = readReleaseMetadata(previousMetadata);
  const current = readReleaseMetadata(currentMetadata);
  if (compareReleaseIdentity(previous, current) >= 0) {
    throw new Error("The current fleet release identity must follow the base release identity.");
  }
  if (previous.asOfDate !== current.asOfDate && current.releaseRevision !== 1) {
    throw new Error("A new dataset date must start at metadata.releaseRevision 1.");
  }
  if (!previous.legacy && current.legacy) {
    throw new Error("Release metadata cannot return to the legacy format after revisioning is adopted.");
  }
  if (
    previous.releasedAt &&
    current.releasedAt &&
    new Date(previous.releasedAt).valueOf() >= new Date(current.releasedAt).valueOf()
  ) {
    throw new Error("metadata.releasedAt must advance from the base release.");
  }

  return {
    schemaVersion: current.legacy ? 1 : 2,
    previousAsOfDate: previous.asOfDate,
    currentAsOfDate: current.asOfDate,
    ...(!current.legacy
      ? {
          previousReleaseRevision: previous.releaseRevision,
          currentReleaseRevision: current.releaseRevision,
          previousReleasedAt: previous.releasedAt,
          currentReleasedAt: current.releasedAt,
        }
      : {}),
  };
}
