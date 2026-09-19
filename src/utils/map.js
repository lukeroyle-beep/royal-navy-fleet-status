import { hasRepresentativePatrolMarker, REPRESENTATIVE_PATROL_ANCHOR, validateRepresentativePatrolFleet } from "./representativePatrol.js";

export function hasPlottablePosition(vessel) {
  return Boolean(getMapPosition(vessel));
}

export function getMapPosition(vessel) {
  if (hasRepresentativePatrolMarker(vessel)) return REPRESENTATIVE_PATROL_ANCHOR;
  if (vessel?.mapRepresentation != null || vessel?.locationClassification === "withheld") return null;
  if (isRepresentativeRegionMarker(vessel)) {
    return { ...vessel.uncertaintyArea.centre, label: vessel.publicLocationLabel };
  }

  const position = vessel?.position;
  return Boolean(
    ["port", "city"].includes(vessel?.locationPrecision) &&
      ["confirmed", "last_reported"].includes(vessel.locationState) &&
      !vessel.uncertaintyArea &&
      isRoundedCoordinate(position?.lat, 90) &&
      isRoundedCoordinate(position?.lon, 180),
  )
    ? position
    : null;
}

export function isRepresentativeRegionMarker(vessel) {
  const area = vessel?.uncertaintyArea;
  return Boolean(
    vessel?.locationPrecision === "region" &&
    ["confirmed", "last_reported"].includes(vessel.locationState) &&
    !["SSBN", "SSN"].includes(vessel.vesselType) &&
    vessel.locationClassification !== "withheld" &&
    vessel.position === null &&
    area?.representation === "representative-marker" &&
    isRoundedCoordinate(area.centre?.lat, 90) &&
    isRoundedCoordinate(area.centre?.lon, 180) &&
    Number.isInteger(area.radiusKm) && area.radiusKm >= 5 && area.radiusKm <= 2500
  );
}

function isRoundedCoordinate(value, limit) {
  return Number.isFinite(value) && Math.abs(value) <= limit && Number(value.toFixed(2)) === value;
}

export function getMapFocusPosition(vessel) {
  return getMapPosition(vessel);
}

export function plottedVessels(vessels) {
  return vessels.filter(hasPlottablePosition);
}

// Explicit candidate/release gate: archives and partial fixtures are not complete fleets.
export function assertCompleteMapRepresentation(vessels) {
  if (!Array.isArray(vessels)) throw new Error("Complete map representation requires a fleet array.");
  const ids = vessels.map((vessel) => vessel?.id);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("Complete map representation requires unique nonempty fleet IDs.");
  }
  validateRepresentativePatrolFleet(vessels, { requireOne: true });
  const represented = plottedVessels(vessels);
  const representedIds = new Set(represented.map((vessel) => vessel.id));
  if (representedIds.size !== ids.length || ids.some((id) => !representedIds.has(id))) {
    throw new Error("Complete map representation requires the represented ID set to equal the fleet ID set.");
  }
  const protectedCount = represented.filter(hasRepresentativePatrolMarker).length;
  const regionCount = represented.filter(isRepresentativeRegionMarker).length;
  return {
    fleetCount: ids.length,
    representedCount: representedIds.size,
    pointCount: represented.length - protectedCount - regionCount,
    regionCount,
    protectedCount,
  };
}

export function coLocatedVessels(vessels, selectedId) {
  const selected = vessels.find((vessel) => vessel.id === selectedId);
  const selectedPosition = getMapPosition(selected);
  if (!selectedPosition) return [];

  return vessels.filter((vessel) => {
    const position = getMapPosition(vessel);
    return Boolean(
      position &&
        position.lat === selectedPosition.lat &&
        position.lon === selectedPosition.lon,
    );
  });
}

export function coLocatedMarkerOffsets(count, spacing = 54) {
  if (!Number.isInteger(count) || count <= 0) return [];

  const offsets = [];
  for (let ring = 1; offsets.length < count; ring += 1) {
    const capacity = ring * 6;
    const radius = ring * spacing;
    for (let index = 0; index < capacity && offsets.length < count; index += 1) {
      const angle = (index / capacity) * Math.PI * 2;
      offsets.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }
  return offsets;
}

export function markerClassName(vessel, selectedId = null) {
  const classes = [
    "fleet-marker",
    `fleet-marker--${markerAssetCategory(vessel)}`,
    `fleet-marker--status-${markerStatusSlug(vessel?.status)}`,
    `fleet-marker--${vessel.locationPrecision}`,
    `fleet-marker--${vessel.locationState}`,
  ];
  if (vessel.locationContext?.retained === true) classes.push("fleet-marker--retained");
  if (vessel.id === selectedId) classes.push("is-selected");
  return classes.join(" ");
}

export function markerAssetCategory(vessel) {
  if (vessel?.service === "Royal Fleet Auxiliary") return "auxiliary";
  if (["SSBN", "SSN"].includes(vessel?.vesselType)) return "submarine";
  if (["Patrol vessel", "Offshore patrol vessel"].includes(vessel?.vesselType)) {
    return "patrol";
  }
  return "warship";
}

export function markerStatusSlug(value) {
  return String(value || "unknown")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function clusterSizeClass(count) {
  if (count >= 20) return "fleet-cluster--large";
  if (count >= 10) return "fleet-cluster--medium";
  return "fleet-cluster--small";
}

export function mapFitPadding(width) {
  return width <= 620 ? [24, 24] : [34, 34];
}

export function shouldStackLayout(width, height) {
  return width <= 700 || (width <= 1100 && height > width);
}
