export const PUBLIC_STATE_VERSION = 1;
export const PUBLIC_STATE_STORAGE_KEY = "rn-fleet-public-state";
export const PORT_SHORE_FILTER = "ports-and-dockyards";

const MAX_QUERY_LENGTH = 80;
const MAP_LIMITS = Object.freeze({
  latitude: [-85, 85],
  longitude: [-180, 180],
  zoom: [0, 19],
});

const FILTER_KEYS = Object.freeze([
  "query",
  "vesselClass",
  "service",
  "status",
  "type",
  "location",
  "presence",
  "shoreQuery",
  "shoreType",
]);

const URL_FILTER_KEYS = Object.freeze({
  query: "q",
  vesselClass: "class",
  service: "service",
  status: "status",
  type: "type",
  location: "location",
  presence: "presence",
  shoreQuery: "shoreQ",
  shoreType: "shoreType",
});

export const PUBLIC_PRESETS = Object.freeze({
  overview: Object.freeze({
    label: "Fleet overview",
    filters: Object.freeze({}),
    layers: Object.freeze({ fleet: true, shore: false, clusters: true }),
  }),
  deployed: Object.freeze({
    label: "Deployed vessels",
    filters: Object.freeze({ status: "Deployed" }),
    layers: Object.freeze({ fleet: true, shore: false, clusters: true }),
  }),
  ukPorts: Object.freeze({
    label: "United Kingdom ports",
    filters: Object.freeze({ shoreType: PORT_SHORE_FILTER }),
    layers: Object.freeze({ fleet: false, shore: true, clusters: true }),
  }),
  maintenance: Object.freeze({
    label: "Maintenance and refit",
    filters: Object.freeze({ status: "In re-fit" }),
    layers: Object.freeze({ fleet: true, shore: false, clusters: true }),
  }),
  overseas: Object.freeze({
    label: "Overseas presence",
    filters: Object.freeze({ presence: "overseas" }),
    layers: Object.freeze({ fleet: true, shore: false, clusters: true }),
  }),
});

export function createDefaultPublicState() {
  return {
    version: PUBLIC_STATE_VERSION,
    filters: {
      query: "",
      vesselClass: "",
      service: "",
      status: "",
      type: "",
      location: "",
      presence: "",
      shoreQuery: "",
      shoreType: "",
    },
    layers: {
      fleet: true,
      shore: false,
      clusters: true,
    },
    selectedVessel: null,
    map: null,
  };
}

export function createPublicStateCatalog({ vessels = [], shoreEstablishments = [] } = {}) {
  return {
    vesselIds: new Set(vessels.map((vessel) => vessel.id)),
    vesselClasses: new Set(vessels.map((vessel) => vessel.vesselClass)),
    services: new Set(vessels.map((vessel) => vessel.service)),
    statuses: new Set(vessels.map((vessel) => vessel.status)),
    types: new Set(vessels.map((vessel) => vessel.vesselType)),
    locations: new Set(vessels.map((vessel) => vessel.locationClassification)),
    presences: new Set(["uk", "overseas"]),
    shoreTypes: new Set([
      ...shoreEstablishments.map((establishment) => establishment.type),
      PORT_SHORE_FILTER,
    ]),
  };
}

export function parsePersistedPublicState(rawValue, catalog) {
  const defaults = createDefaultPublicState();
  if (!rawValue) return defaults;

  try {
    const value = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (!isRecord(value) || value.version !== PUBLIC_STATE_VERSION) return defaults;
    return validatePublicState(value, catalog, { includeMap: false, includeSelection: false });
  } catch {
    return defaults;
  }
}

export function readPersistedPublicState(storage, catalog) {
  try {
    return parsePersistedPublicState(storage?.getItem(PUBLIC_STATE_STORAGE_KEY), catalog);
  } catch {
    return createDefaultPublicState();
  }
}

export function persistPublicState(storage, state) {
  const persisted = {
    version: PUBLIC_STATE_VERSION,
    filters: pickFilters(state.filters),
    layers: {
      fleet: Boolean(state.layers?.fleet),
      shore: Boolean(state.layers?.shore),
      clusters: Boolean(state.layers?.clusters),
    },
  };
  try {
    storage?.setItem(PUBLIC_STATE_STORAGE_KEY, JSON.stringify(persisted));
    return true;
  } catch {
    return false;
  }
}

export function parsePublicUrlState(value, catalog) {
  const url = value instanceof URL ? value : new URL(value, "https://fleet.invalid/");
  if (!url.searchParams.has("view")) return null;

  const defaults = createDefaultPublicState();
  if (url.searchParams.get("view") !== String(PUBLIC_STATE_VERSION)) return defaults;

  const hasMap = ["lat", "lon", "zoom"].every((parameter) => url.searchParams.has(parameter));
  const candidate = {
    version: PUBLIC_STATE_VERSION,
    filters: Object.fromEntries(
      Object.entries(URL_FILTER_KEYS).map(([key, parameter]) => [key, url.searchParams.get(parameter) ?? ""]),
    ),
    layers: parseUrlLayers(url.searchParams.get("layers"), defaults.layers),
    selectedVessel: url.searchParams.get("vessel"),
    map: hasMap
      ? {
          centre: [url.searchParams.get("lat"), url.searchParams.get("lon")],
          zoom: url.searchParams.get("zoom"),
        }
      : null,
  };
  return validatePublicState(candidate, catalog, { includeMap: true, includeSelection: true });
}

export function createShareablePublicUrl(baseUrl, state) {
  const url = baseUrl instanceof URL ? new URL(baseUrl.href) : new URL(baseUrl);
  url.search = "";
  url.searchParams.set("view", String(PUBLIC_STATE_VERSION));

  const filters = pickFilters(state.filters);
  for (const [key, parameter] of Object.entries(URL_FILTER_KEYS)) {
    if (filters[key]) url.searchParams.set(parameter, filters[key]);
  }

  const layers = [];
  if (state.layers?.fleet) layers.push("fleet");
  if (state.layers?.shore) layers.push("shore");
  if (state.layers?.clusters) layers.push("clusters");
  url.searchParams.set("layers", layers.join(","));

  if (state.selectedVessel) url.searchParams.set("vessel", state.selectedVessel);
  const map = boundMapView(state.map);
  if (map) {
    url.searchParams.set("lat", formatCoordinate(map.centre[0]));
    url.searchParams.set("lon", formatCoordinate(map.centre[1]));
    url.searchParams.set("zoom", formatZoom(map.zoom));
  }
  return url;
}

export function stateForPublicPreset(name) {
  const preset = PUBLIC_PRESETS[name];
  if (!preset) return null;
  const state = createDefaultPublicState();
  Object.assign(state.filters, preset.filters);
  Object.assign(state.layers, preset.layers);
  return state;
}

export function publicStateMatchesPreset(state, name) {
  const preset = stateForPublicPreset(name);
  if (!preset) return false;
  return (
    FILTER_KEYS.every((key) => (state.filters?.[key] || "") === preset.filters[key]) &&
    ["fleet", "shore", "clusters"].every(
      (key) => Boolean(state.layers?.[key]) === preset.layers[key],
    )
  );
}

export function publicPresenceForVessel(vessel) {
  if (!vessel?.position || !["mapped", "approximate"].includes(vessel.locationClassification)) {
    return "";
  }
  const latitude = Number(vessel.position.lat);
  const longitude = Number(vessel.position.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const isUnitedKingdomOrNearby =
    latitude >= 49 && latitude <= 61.5 && longitude >= -12.5 && longitude <= 4;
  return isUnitedKingdomOrNearby ? "uk" : "overseas";
}

export function boundMapView(value) {
  if (!isRecord(value) || !Array.isArray(value.centre) || value.centre.length !== 2) return null;
  const latitude = Number(value.centre[0]);
  const longitude = Number(value.centre[1]);
  const zoom = Number(value.zoom);
  if (![latitude, longitude, zoom].every(Number.isFinite)) return null;
  return {
    centre: [
      clamp(latitude, ...MAP_LIMITS.latitude),
      clamp(longitude, ...MAP_LIMITS.longitude),
    ],
    zoom: clamp(zoom, ...MAP_LIMITS.zoom),
  };
}

function validatePublicState(value, catalog, { includeMap, includeSelection }) {
  const defaults = createDefaultPublicState();
  const filters = isRecord(value.filters) ? value.filters : {};
  const layers = isRecord(value.layers) ? value.layers : {};
  defaults.filters.query = validQuery(filters.query);
  defaults.filters.vesselClass = validCatalogValue(filters.vesselClass, catalog?.vesselClasses);
  defaults.filters.service = validCatalogValue(filters.service, catalog?.services);
  defaults.filters.status = validCatalogValue(filters.status, catalog?.statuses);
  defaults.filters.type = validCatalogValue(filters.type, catalog?.types);
  defaults.filters.location = validCatalogValue(filters.location, catalog?.locations);
  defaults.filters.presence = validCatalogValue(filters.presence, catalog?.presences);
  defaults.filters.shoreQuery = validQuery(filters.shoreQuery);
  defaults.filters.shoreType = validCatalogValue(filters.shoreType, catalog?.shoreTypes);
  for (const key of ["fleet", "shore", "clusters"]) {
    if (typeof layers[key] === "boolean") defaults.layers[key] = layers[key];
  }
  if (includeSelection && catalog?.vesselIds?.has(value.selectedVessel)) {
    defaults.selectedVessel = value.selectedVessel;
  }
  if (includeMap) defaults.map = boundMapView(value.map);
  return defaults;
}

function parseUrlLayers(value, defaults) {
  if (typeof value !== "string") return defaults;
  const tokens = new Set(value.split(",").filter(Boolean));
  if (value === "") return { fleet: false, shore: false, clusters: false };
  if (![...tokens].some((token) => ["fleet", "shore", "clusters"].includes(token))) {
    return defaults;
  }
  return {
    fleet: tokens.has("fleet"),
    shore: tokens.has("shore"),
    clusters: tokens.has("clusters"),
  };
}

function pickFilters(filters = {}) {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, String(filters[key] || "")]));
}

function validQuery(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= MAX_QUERY_LENGTH ? trimmed : "";
}

function validCatalogValue(value, allowedValues) {
  return typeof value === "string" && allowedValues?.has(value) ? value : "";
}

function formatCoordinate(value) {
  return Number(value.toFixed(5)).toString();
}

function formatZoom(value) {
  return Number(value.toFixed(1)).toString();
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
