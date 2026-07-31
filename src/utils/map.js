export function hasPlottablePosition(vessel) {
  return Boolean(getMapPosition(vessel));
}

export function getMapPosition(vessel) {
  const position = vessel?.position || vessel?.symbolicPosition;
  return Boolean(
    position &&
      Number.isFinite(position.lat) &&
      Number.isFinite(position.lon),
  )
    ? position
    : null;
}

export function plottedVessels(vessels) {
  return vessels.filter(hasPlottablePosition);
}

export function markerClassName(vessel, selectedId = null) {
  const classes = ["fleet-marker", `fleet-marker--${vessel.locationClassification}`];
  if (vessel.id === selectedId) classes.push("is-selected");
  return classes.join(" ");
}

export function clusterSizeClass(count) {
  if (count >= 20) return "fleet-cluster--large";
  if (count >= 10) return "fleet-cluster--medium";
  return "fleet-cluster--small";
}

export function shouldStackLayout(width, height) {
  return width <= 700 || (width <= 1100 && height > width);
}
