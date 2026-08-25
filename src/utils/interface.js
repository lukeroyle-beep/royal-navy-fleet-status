export const COMPACT_SURFACE_QUERY =
  "(max-width: 1100px) and (orientation: portrait), (max-width: 700px), (pointer: coarse) and (max-width: 1400px)";

export function countActiveFilters({
  query = "",
  vesselClass = "",
  service = "",
  status = "",
  type = "",
  location = "",
  presence = "",
} = {}) {
  return [query.trim(), vesselClass, service, status, type, location, presence].filter(Boolean).length;
}

export function formatVesselResultSummary(filteredCount, totalCount, activeFilterCount) {
  if (activeFilterCount === 0 && filteredCount === totalCount) {
    return `Showing ${totalCount} vessels`;
  }
  const noun = activeFilterCount === 1 ? "filter" : "filters";
  return `Showing ${filteredCount} of ${totalCount} vessels · ${activeFilterCount} ${noun}`;
}

export function nextOpenSurfaces(openSurfaces, requestedSurface, compact) {
  const next = new Set(openSurfaces);
  const shouldOpen = !next.has(requestedSurface);
  if (compact) {
    next.clear();
  } else if (!shouldOpen) {
    next.delete(requestedSurface);
  }
  if (shouldOpen) next.add(requestedSurface);
  return next;
}
