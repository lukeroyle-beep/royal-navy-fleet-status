export function hasPlottablePosition(vessel) {
  return Boolean(getMapPosition(vessel));
}

export function getMapPosition(vessel) {
  const position = vessel?.position;
  return Boolean(
    position &&
      Number.isFinite(position.lat) &&
      Number.isFinite(position.lon),
  )
    ? position
    : null;
}

export function getMapFocusPosition(vessel) {
  return getMapPosition(vessel);
}

export function plottedVessels(vessels) {
  return vessels.filter(hasPlottablePosition);
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
