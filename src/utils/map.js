export function hasPlottablePosition(vessel) {
  return Boolean(getMapPosition(vessel) || getUncertaintyArea(vessel));
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

export function getUncertaintyArea(vessel) {
  const area = vessel?.uncertaintyArea;
  return Boolean(
    vessel?.locationPrecision === "region" &&
      area?.representation === "regional" &&
      area.centre &&
      Number.isFinite(area.centre.lat) &&
      Number.isFinite(area.centre.lon) &&
      Number.isFinite(area.radiusKm) &&
      area.radiusKm > 0,
  )
    ? area
    : null;
}

export function getMapFocusPosition(vessel) {
  const point = getMapPosition(vessel);
  if (point) return point;
  const area = getUncertaintyArea(vessel);
  return area ? { ...area.centre, label: area.label } : null;
}

export function plottedVessels(vessels) {
  return vessels.filter(hasPlottablePosition);
}

export function markerClassName(vessel, selectedId = null) {
  const classes = [
    "fleet-marker",
    `fleet-marker--${vessel.locationPrecision}`,
    `fleet-marker--${vessel.locationState}`,
  ];
  if (vessel.id === selectedId) classes.push("is-selected");
  return classes.join(" ");
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
