const ACTIVE_STATUSES = new Set(["Available", "Deployed"]);

export const AVAILABILITY_STATUS_ORDER = ["Deployed", "Available", "In re-fit", "Unknown"];

export function getAvailabilityBand(percentage) {
  const boundedPercentage = Math.min(100, Math.max(0, Number.isFinite(percentage) ? percentage : 0));
  if (boundedPercentage < 34) return "low";
  if (boundedPercentage < 67) return "medium";
  return "high";
}

export function getActiveFleetSummary(vessels) {
  const total = vessels.filter((vessel) => ACTIVE_STATUSES.has(vessel.status)).length;
  const percentage = vessels.length === 0 ? 0 : (total / vessels.length) * 100;

  return { total, percentage };
}

export function getFleetStatusSummary(vessels) {
  const count = (status) => vessels.filter((vessel) => vessel.status === status).length;
  return {
    total: vessels.length,
    deployed: count("Deployed"),
    inRefit: count("In re-fit"),
    unknown: count("Unknown"),
  };
}

export function getAvailabilitySummary(vessels) {
  const byStatus = vessels.reduce((counts, vessel) => {
    counts[vessel.status] = (counts[vessel.status] ?? 0) + 1;
    return counts;
  }, {});
  const active = vessels.filter((vessel) => ACTIVE_STATUSES.has(vessel.status)).length;
  const total = vessels.length;

  return {
    active,
    total,
    percentage: total === 0 ? 0 : (active / total) * 100,
    byStatus,
  };
}
