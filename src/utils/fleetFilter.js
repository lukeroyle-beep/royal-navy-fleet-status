import { hasPlottablePosition, isRepresentativeRegionMarker } from "./map.js";
import { publicPresenceForVessel } from "./publicState.js";

export function filterFleetVessels(
  vessels,
  {
    query = "",
    vesselClass = "",
    service = "",
    status = "",
    type = "",
    locationState = "",
    presence = "",
    changedVesselIds = null,
  } = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-GB");
  const changedIds = changedVesselIds ? new Set(changedVesselIds) : null;

  return vessels.filter((vessel) => {
    const matchesQuery =
      !normalizedQuery ||
      vessel.name.toLocaleLowerCase("en-GB").includes(normalizedQuery) ||
      (vessel.pennantNumber || "").toLocaleLowerCase("en-GB").includes(normalizedQuery);
    return (
      matchesQuery &&
      (!vesselClass || vessel.vesselClass === vesselClass) &&
      (!service || vessel.service === service) &&
      (!status || vessel.status === status) &&
      (!type || vessel.vesselType === type) &&
      (!locationState || vessel.locationState === locationState) &&
      (!presence || publicPresenceForVessel(vessel) === presence) &&
      (!changedIds || changedIds.has(vessel.id))
    );
  });
}

export function summarizePlotEligibility(vessels) {
  const pointMapped = vessels.filter(hasPlottablePosition).length;
  const regional = vessels.filter(
    (vessel) => !hasPlottablePosition(vessel) && vessel.locationPrecision === "region",
  ).length;
  return {
    total: vessels.length,
    pointMapped,
    regional,
    listOnly: vessels.length - pointMapped - regional,
  };
}

export function formatPlotEligibilitySummary(vessels) {
  const summary = summarizePlotEligibility(vessels);
  const nonPoint = summary.regional + summary.listOnly;
  const representatives = vessels.filter(isRepresentativeRegionMarker).length;
  if (representatives) {
    return `${summary.pointMapped - representatives} point-mapped · ${representatives} representative regional ${representatives === 1 ? "marker" : "markers"} · ${nonPoint} regional or list-only`;
  }
  return `${summary.pointMapped} point-mapped · ${nonPoint} regional or list-only`;
}
