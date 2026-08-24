const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function readReleaseMetadata(metadata, { allowLegacy = true } = {}) {
  if (!metadata || typeof metadata !== "object" || !isIsoDate(metadata.asOfDate)) {
    throw new Error("Release metadata has an invalid dataset date.");
  }

  const hasRevision = Object.hasOwn(metadata, "releaseRevision");
  const hasReleasedAt = Object.hasOwn(metadata, "releasedAt");
  if (!hasRevision && !hasReleasedAt && allowLegacy) {
    return {
      asOfDate: metadata.asOfDate,
      releaseRevision: 1,
      releasedAt: null,
      legacy: true,
    };
  }
  if (
    !hasRevision ||
    !hasReleasedAt ||
    !isPositiveInteger(metadata.releaseRevision) ||
    !isIsoInstant(metadata.releasedAt)
  ) {
    throw new Error(
      "Release metadata must provide a positive releaseRevision and an ISO releasedAt instant together.",
    );
  }

  return {
    asOfDate: metadata.asOfDate,
    releaseRevision: metadata.releaseRevision,
    releasedAt: metadata.releasedAt,
    legacy: false,
  };
}

export function releaseRevision(value) {
  return isPositiveInteger(value?.releaseRevision) ? value.releaseRevision : 1;
}

export function compareReleaseIdentity(left, right) {
  const leftDate = left?.asOfDate ?? left?.snapshotDate;
  const rightDate = right?.asOfDate ?? right?.snapshotDate;
  if (leftDate < rightDate) return -1;
  if (leftDate > rightDate) return 1;
  return releaseRevision(left) - releaseRevision(right);
}

export function formatDatasetReleaseLabel(metadata) {
  const release = readReleaseMetadata(metadata);
  return formatDate(release.asOfDate);
}

export function formatPublicationChangeLabels(publication) {
  const changeCount = publication?.changes?.length ?? 0;
  const previousDate = publication?.previousAsOfDate;
  const currentDate = publication?.currentAsOfDate;
  const previousRevision = publication?.previousReleaseRevision ?? 1;
  const currentRevision = publication?.currentReleaseRevision ?? 1;
  const vesselLabel = changeCount === 1 ? "vessel" : "vessels";

  if (previousDate === currentDate && currentRevision > previousRevision) {
    return {
      count: `${formatDate(currentDate, { short: true })} · ${changeCount} ${vesselLabel}`,
      summary:
        `${changeCount} ${vesselLabel} changed in the ${formatDate(currentDate)} correction ` +
        `from r${previousRevision} to r${currentRevision}.`,
    };
  }

  return {
    count: `${formatDate(previousDate, { short: true })} · ${changeCount} ${vesselLabel}`,
    summary:
      `${changeCount} ${vesselLabel} changed between ${formatDate(previousDate)} and ` +
      `${formatDate(currentDate)}.`,
  };
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isIsoInstant(value) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || !isIsoDate(value.slice(0, 10))) {
    return false;
  }
  return !Number.isNaN(new Date(value).valueOf());
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function formatDate(value, { short = false } = {}) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
