const UK_BOUNDS = {
  minLat: 49.5,
  maxLat: 61,
  minLon: -8.7,
  maxLon: 2.2,
};

const ALLOWED_TYPES = new Set([
  "Naval base",
  "Dockyard",
  "Training establishment",
  "Medical establishment",
  "Air station",
  "Royal Marines base",
  "Support establishment",
  "Royal Naval Reserve unit",
]);

export class ShoreEstablishmentLoader {
  constructor(url) {
    this.url = url;
  }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Could not load shore establishment data from ${this.url}.`);
    }
    return validateShoreEstablishments(await response.json());
  }
}

export function validateShoreEstablishments(raw) {
  if (!raw?.metadata || !Array.isArray(raw.establishments) || !raw.establishments.length) {
    throw new Error("Shore establishment data must contain metadata and establishments.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.metadata.asOfDate || "")) {
    throw new Error("Shore establishment data has an invalid as-of date.");
  }

  const ids = new Set();
  const names = new Set();
  for (const [index, establishment] of raw.establishments.entries()) {
    const label = `Shore establishment ${index + 1}`;
    for (const field of [
      "id",
      "name",
      "type",
      "role",
      "location",
      "description",
      "image",
      "imageAlt",
      "imageFocalPoint",
    ]) {
      if (typeof establishment[field] !== "string" || !establishment[field].trim()) {
        throw new Error(`${label} has an invalid ${field}.`);
      }
    }
    if (ids.has(establishment.id)) throw new Error(`Duplicate shore establishment id: ${establishment.id}.`);
    if (names.has(establishment.name)) throw new Error(`Duplicate shore establishment name: ${establishment.name}.`);
    ids.add(establishment.id);
    names.add(establishment.name);
    if (!ALLOWED_TYPES.has(establishment.type)) {
      throw new Error(`${establishment.name} has an unsupported type.`);
    }
    const { lat, lon, label: positionLabel } = establishment.position || {};
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      typeof positionLabel !== "string" ||
      !positionLabel.trim() ||
      lat < UK_BOUNDS.minLat ||
      lat > UK_BOUNDS.maxLat ||
      lon < UK_BOUNDS.minLon ||
      lon > UK_BOUNDS.maxLon
    ) {
      throw new Error(`${establishment.name} has an invalid representative UK position.`);
    }
    if (!establishment.source?.label?.trim() || !establishment.source?.url?.startsWith("https://")) {
      throw new Error(`${establishment.name} has an invalid public source.`);
    }
    if (!establishment.image.startsWith("./shore/photos/") || !establishment.image.endsWith(".webp")) {
      throw new Error(`${establishment.name} has an invalid local image asset.`);
    }
    if (!/^\d{1,3}% \d{1,3}%$/.test(establishment.imageFocalPoint)) {
      throw new Error(`${establishment.name} has an invalid image focal point.`);
    }
    if (
      !establishment.imageCredit?.label?.trim() ||
      !establishment.imageCredit?.sourceUrl?.startsWith("https://") ||
      !establishment.imageCredit?.license?.trim() ||
      !establishment.imageCredit?.licenseUrl?.startsWith("https://")
    ) {
      throw new Error(`${establishment.name} has incomplete image credit data.`);
    }
  }
  return raw;
}
