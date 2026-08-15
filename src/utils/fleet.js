const ACTIVE_STATUSES = new Set(["Available", "Deployed"]);

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
