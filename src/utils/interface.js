export const COMPACT_SURFACE_QUERY =
  "(max-width: 1100px) and (orientation: portrait), (max-width: 700px), (pointer: coarse) and (max-width: 1400px)";
export const SHEET_SURFACE_QUERY =
  "(max-width: 1100px) and (orientation: portrait), (max-width: 700px)";
export const RIGHT_SIDE_SURFACES = Object.freeze(["detail", "layers", "filters", "changes"]);

export function countActiveFilters({
  query = "",
  vesselClass = "",
  service = "",
  status = "",
  type = "",
  location = "",
  presence = "",
  shoreQuery = "",
  shoreType = "",
} = {}) {
  return [
    query.trim(),
    vesselClass,
    service,
    status,
    type,
    location,
    presence,
    shoreQuery.trim(),
    shoreType,
  ].filter(Boolean).length;
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
  if (!shouldOpen) {
    next.delete(requestedSurface);
    return next;
  }
  return openSurface(openSurfaces, requestedSurface, compact);
}

export function openSurface(openSurfaces, requestedSurface, compact) {
  const next = new Set(openSurfaces);
  if (compact) {
    next.clear();
  } else if (RIGHT_SIDE_SURFACES.includes(requestedSurface)) {
    for (const surface of RIGHT_SIDE_SURFACES) next.delete(surface);
  }
  if (requestedSurface === "detail") next.delete("fleet");
  if (requestedSurface === "fleet") next.delete("detail");
  next.add(requestedSurface);
  return next;
}

export function resolveSnapshotTransitionSelection({
  visibleVessels = [],
  shoreEstablishments = [],
  selectedVesselId = null,
  selectedShoreId = null,
} = {}) {
  if (selectedVesselId) {
    return {
      vessel: visibleVessels.find((vessel) => vessel.id === selectedVesselId) ?? null,
      shoreEstablishment: null,
    };
  }
  return {
    vessel: null,
    shoreEstablishment:
      shoreEstablishments.find((establishment) => establishment.id === selectedShoreId) ?? null,
  };
}
