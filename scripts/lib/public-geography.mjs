const PRECISIONS = new Set(["port", "city", "region", "none"]);

export function validateReviewedPublicLocation(value, label = "publicLocation") {
  if (!hasExactKeys(value, ["precision", "label", "geometry"])) {
    throw new Error(`${label} must contain only precision, label and geometry.`);
  }
  if (!PRECISIONS.has(value.precision)) {
    throw new Error(`${label} has an invalid precision.`);
  }
  if (typeof value.label !== "string" || !value.label.trim()) {
    throw new Error(`${label} requires a non-empty label.`);
  }

  if (value.precision === "none") {
    if (value.geometry !== null) throw new Error(`${label} list-only precision cannot contain geometry.`);
    return value;
  }
  if (value.precision === "port" || value.precision === "city") {
    validatePoint(value.geometry, label);
    return value;
  }
  validateArea(value.geometry, label);
  return value;
}

export function readReviewedPublicLocation(value) {
  try {
    validateReviewedPublicLocation(value);
    return structuredClone(value);
  } catch {
    return null;
  }
}

function validatePoint(geometry, label) {
  if (!hasExactKeys(geometry, ["type", "lat", "lon"]) || geometry.type !== "point") {
    throw new Error(`${label} port/city precision requires explicit point geometry.`);
  }
  validateCoordinate(geometry.lat, geometry.lon, label);
}

function validateArea(geometry, label) {
  if (
    !hasExactKeys(geometry, ["type", "centre", "radiusKm"]) ||
    geometry.type !== "circle" ||
    !hasExactKeys(geometry.centre, ["lat", "lon"])
  ) {
    throw new Error(`${label} regional precision requires an explicit bounded circle.`);
  }
  validateCoordinate(geometry.centre.lat, geometry.centre.lon, label);
  if (
    !Number.isInteger(geometry.radiusKm) ||
    geometry.radiusKm < 5 ||
    geometry.radiusKm > 2500
  ) {
    throw new Error(`${label} has an invalid reviewed regional radius.`);
  }
}

function validateCoordinate(latitude, longitude, label) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    !hasAtMostDecimalPlaces(latitude, 2) ||
    !hasAtMostDecimalPlaces(longitude, 2)
  ) {
    throw new Error(`${label} has invalid rounded public coordinates.`);
  }
}

function hasAtMostDecimalPlaces(value, maximum) {
  return Math.abs(value - Number(value.toFixed(maximum))) < 1e-9;
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
