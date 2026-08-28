export const PUBLIC_STATE_VERSION = 2;
export const PUBLIC_STATE_STORAGE_KEY = "rn-fleet-public-state";
export const PORT_SHORE_FILTER = "ports-and-dockyards";

const LEGACY_PUBLIC_STATE_VERSION = 1;
const MAX_QUERY_LENGTH = 80;
const MAP_LIMITS = Object.freeze({
  latitude: [-85, 85],
  longitude: [-180, 180],
  zoom: [0, 19],
});
const LAYER_KEYS = Object.freeze(["fleet", "shore", "clusters"]);
const URL_LAYER_TOKENS = Object.freeze([...LAYER_KEYS, "uncertainty"]);
const FILTER_KEYS = Object.freeze([
  "query",
  "vesselClass",
  "service",
  "status",
  "type",
  "locationState",
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
  locationState: "locationState",
  presence: "presence",
  shoreQuery: "shoreQ",
  shoreType: "shoreType",
});
const SINGLETON_QUERY_KEYS = Object.freeze([
  "view",
  ...Object.values(URL_FILTER_KEYS),
  "location",
  "layers",
  "vessel",
  "shore",
  "snapshot",
  "lat",
  "lon",
  "zoom",
]);

export const PUBLIC_PRESETS = Object.freeze({
  overview: preset("Fleet overview", {}, { fleet: true, shore: false, clusters: true }),
  deployed: preset(
    "Deployed vessels",
    { status: "Deployed" },
    { fleet: true, shore: false, clusters: true },
  ),
  ukPorts: preset(
    "United Kingdom ports",
    { shoreType: PORT_SHORE_FILTER },
    { fleet: false, shore: true, clusters: true },
  ),
  maintenance: preset(
    "Maintenance and refit",
    { status: "In re-fit" },
    { fleet: true, shore: false, clusters: true },
  ),
  overseas: preset(
    "Overseas presence",
    { presence: "overseas" },
    { fleet: true, shore: false, clusters: true },
  ),
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
      locationState: "",
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
    selectedShoreEstablishment: null,
    snapshotDate: null,
    map: null,
  };
}

export function createPublicStateCatalog({
  vessels = [],
  selectionVessels = vessels,
  shoreEstablishments = [],
  snapshotDates = [],
  currentSnapshotDate = null,
} = {}) {
  const publicVesselsById = new Map(selectionVessels.map((vessel) => [vessel.id, vessel]));
  const publicShoreEstablishmentsById = new Map(
    shoreEstablishments.map((establishment) => [establishment.id, establishment]),
  );
  return {
    publicVesselsById,
    publicShoreEstablishmentsById,
    vesselIds: new Set(publicVesselsById.keys()),
    shoreEstablishmentIds: new Set(publicShoreEstablishmentsById.keys()),
    vesselClasses: new Set(vessels.map((vessel) => vessel.vesselClass)),
    services: new Set(vessels.map((vessel) => vessel.service)),
    statuses: new Set(vessels.map((vessel) => vessel.status)),
    types: new Set(vessels.map((vessel) => vessel.vesselType)),
    locationStates: new Set(vessels.map((vessel) => vessel.locationState)),
    presences: new Set(["uk", "overseas"]),
    snapshotDates: new Set(snapshotDates),
    currentSnapshotDate,
    shoreTypes: new Set([
      ...shoreEstablishments.map((establishment) => establishment.type),
      PORT_SHORE_FILTER,
    ]),
  };
}

export function resolvePublicSelection(catalog, state) {
  const vessel = catalog?.vesselIds?.has(state?.selectedVessel)
    ? (catalog.publicVesselsById?.get(state.selectedVessel) ?? null)
    : null;
  const shoreEstablishment = catalog?.shoreEstablishmentIds?.has(
    state?.selectedShoreEstablishment,
  )
    ? (catalog.publicShoreEstablishmentsById?.get(state.selectedShoreEstablishment) ?? null)
    : null;
  if (vessel && shoreEstablishment) {
    return { vessel: null, shoreEstablishment: null };
  }
  return { vessel, shoreEstablishment };
}

export function parsePersistedPublicState(rawValue, catalog) {
  const defaults = createDefaultPublicState();
  if (!rawValue) return defaults;

  try {
    const value = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (!isRecord(value)) return defaults;
    if (value.version === PUBLIC_STATE_VERSION) {
      return validatePublicState(value, catalog, { includeMap: false, includeSelection: false });
    }
    if (value.version === LEGACY_PUBLIC_STATE_VERSION) {
      return validatePublicState(migrateLegacyState(value), catalog, {
        includeMap: false,
        includeSelection: false,
      });
    }
    return defaults;
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

export function persistPublicState(storage, state, catalog) {
  const validated = validatePublicState(state, catalog, {
    includeMap: false,
    includeSelection: false,
  });
  const persisted = {
    version: PUBLIC_STATE_VERSION,
    filters: validated.filters,
    layers: validated.layers,
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
  if (hasDuplicateSingletonParameters(url.searchParams)) {
    return createDefaultPublicState();
  }

  const version = url.searchParams.get("view");
  if (version === String(PUBLIC_STATE_VERSION)) {
    return validatePublicState(stateFromUrl(url), catalog, {
      includeMap: true,
      includeSelection: true,
    });
  }
  if (version === String(LEGACY_PUBLIC_STATE_VERSION)) {
    return validatePublicState(legacyStateFromUrl(url), catalog, {
      includeMap: true,
      includeSelection: true,
    });
  }
  return createDefaultPublicState();
}

function hasDuplicateSingletonParameters(searchParams) {
  return SINGLETON_QUERY_KEYS.some((key) => searchParams.getAll(key).length > 1);
}

export function createShareablePublicUrl(baseUrl, state, catalog) {
  const validated = validatePublicState(state, catalog, {
    includeMap: true,
    includeSelection: true,
  });
  const url = baseUrl instanceof URL ? new URL(baseUrl.href) : new URL(baseUrl);
  url.search = "";
  url.searchParams.set("view", String(PUBLIC_STATE_VERSION));

  for (const [key, parameter] of Object.entries(URL_FILTER_KEYS)) {
    if (validated.filters[key]) url.searchParams.set(parameter, validated.filters[key]);
  }

  const layers = LAYER_KEYS.filter((key) => validated.layers[key]);
  url.searchParams.set("layers", layers.join(","));

  if (validated.selectedVessel) url.searchParams.set("vessel", validated.selectedVessel);
  if (validated.selectedShoreEstablishment) {
    url.searchParams.set("shore", validated.selectedShoreEstablishment);
  }
  if (validated.snapshotDate) url.searchParams.set("snapshot", validated.snapshotDate);
  if (validated.map) {
    url.searchParams.set("lat", formatCoordinate(validated.map.centre[0]));
    url.searchParams.set("lon", formatCoordinate(validated.map.centre[1]));
    url.searchParams.set("zoom", formatZoom(validated.map.zoom));
  }
  return url;
}

export function stateForPublicPreset(name) {
  const selectedPreset = PUBLIC_PRESETS[name];
  if (!selectedPreset) return null;
  const state = createDefaultPublicState();
  Object.assign(state.filters, selectedPreset.filters);
  Object.assign(state.layers, selectedPreset.layers);
  return state;
}

export function publicStateMatchesPreset(state, name) {
  const presetState = stateForPublicPreset(name);
  if (!presetState) return false;
  return (
    FILTER_KEYS.every((key) => (state.filters?.[key] || "") === presetState.filters[key]) &&
    LAYER_KEYS.every((key) => Boolean(state.layers?.[key]) === presetState.layers[key])
  );
}

export function publicPresenceForVessel(vessel) {
  let coordinates = null;
  if (["port", "city"].includes(vessel?.locationPrecision)) {
    coordinates = vessel.position;
  } else if (vessel?.locationPrecision === "region") {
    coordinates = vessel.uncertaintyArea?.centre;
  }
  if (!coordinates) return "";
  const latitude = coordinates.lat;
  const longitude = coordinates.lon;
  if (typeof latitude !== "number" || typeof longitude !== "number") return "";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const isUnitedKingdomOrNearby =
    latitude >= 49 && latitude <= 61.5 && longitude >= -12.5 && longitude <= 4;
  return isUnitedKingdomOrNearby ? "uk" : "overseas";
}

export function boundMapView(value) {
  if (!isRecord(value) || !Array.isArray(value.centre) || value.centre.length !== 2) return null;
  const [latitude, longitude] = value.centre;
  const zoom = value.zoom;
  if (![latitude, longitude, zoom].every(isFiniteNumber)) return null;
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
  const filters = isRecord(value?.filters) ? value.filters : {};
  const layers = isRecord(value?.layers) ? value.layers : {};
  defaults.filters.query = validQuery(filters.query);
  defaults.filters.vesselClass = validCatalogValue(filters.vesselClass, catalog?.vesselClasses);
  defaults.filters.service = validCatalogValue(filters.service, catalog?.services);
  defaults.filters.status = validCatalogValue(filters.status, catalog?.statuses);
  defaults.filters.type = validCatalogValue(filters.type, catalog?.types);
  defaults.filters.locationState = validCatalogValue(
    filters.locationState,
    catalog?.locationStates,
  );
  defaults.filters.presence = validCatalogValue(filters.presence, catalog?.presences);
  defaults.filters.shoreQuery = validQuery(filters.shoreQuery);
  defaults.filters.shoreType = validCatalogValue(filters.shoreType, catalog?.shoreTypes);
  for (const key of LAYER_KEYS) {
    if (typeof layers[key] === "boolean") defaults.layers[key] = layers[key];
  }
  if (includeSelection) {
    const selection = resolvePublicSelection(catalog, value);
    defaults.selectedVessel = selection.vessel?.id ?? null;
    defaults.selectedShoreEstablishment = selection.shoreEstablishment?.id ?? null;
  }
  defaults.snapshotDate = validSnapshotDate(value?.snapshotDate, catalog);
  if (includeMap) defaults.map = boundMapView(value?.map);
  return defaults;
}

function stateFromUrl(url) {
  const defaults = createDefaultPublicState();
  return {
    version: PUBLIC_STATE_VERSION,
    filters: Object.fromEntries(
      Object.entries(URL_FILTER_KEYS).map(([key, parameter]) => [
        key,
        url.searchParams.get(parameter) ?? "",
      ]),
    ),
    layers: parseUrlLayers(url.searchParams.get("layers"), defaults.layers),
    selectedVessel: url.searchParams.get("vessel"),
    selectedShoreEstablishment: url.searchParams.get("shore"),
    snapshotDate: url.searchParams.get("snapshot"),
    map: parseUrlMap(url.searchParams),
  };
}

function legacyStateFromUrl(url) {
  const defaults = createDefaultPublicState();
  const filters = Object.fromEntries(
    Object.entries(URL_FILTER_KEYS)
      .filter(([key]) => key !== "locationState")
      .map(([key, parameter]) => [key, url.searchParams.get(parameter) ?? ""]),
  );
  return {
    version: PUBLIC_STATE_VERSION,
    filters: { ...filters, locationState: "" },
    layers: parseUrlLayers(url.searchParams.get("layers"), defaults.layers),
    selectedVessel: url.searchParams.get("vessel"),
    selectedShoreEstablishment: null,
    snapshotDate: null,
    map: parseUrlMap(url.searchParams),
  };
}

function migrateLegacyState(value) {
  const filters = isRecord(value.filters) ? value.filters : {};
  const layers = isRecord(value.layers) ? value.layers : {};
  return {
    version: PUBLIC_STATE_VERSION,
    filters: {
      query: filters.query,
      vesselClass: filters.vesselClass,
      service: filters.service,
      status: filters.status,
      type: filters.type,
      locationState: "",
      presence: filters.presence,
      shoreQuery: filters.shoreQuery,
      shoreType: filters.shoreType,
    },
    layers,
    selectedVessel: value.selectedVessel,
    selectedShoreEstablishment: null,
    snapshotDate: null,
    map: value.map,
  };
}

function parseUrlLayers(value, defaults) {
  if (typeof value !== "string") return defaults;
  const tokens = new Set(value.split(",").filter(Boolean));
  if (value !== "" && ![...tokens].some((token) => URL_LAYER_TOKENS.includes(token))) {
    return defaults;
  }
  return {
    fleet: tokens.has("fleet"),
    shore: tokens.has("shore"),
    clusters: tokens.has("clusters"),
  };
}

function parseUrlMap(searchParams) {
  const parameters = ["lat", "lon", "zoom"];
  if (!parameters.every((parameter) => searchParams.has(parameter))) return null;
  const values = parameters.map((parameter) => parseFiniteNumberToken(searchParams.get(parameter)));
  if (values.some((value) => value === null)) return null;
  return boundMapView({ centre: values.slice(0, 2), zoom: values[2] });
}

function parseFiniteNumberToken(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return null;
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validQuery(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= MAX_QUERY_LENGTH ? trimmed : "";
}

function validCatalogValue(value, allowedValues) {
  return typeof value === "string" && allowedValues?.has(value) ? value : "";
}

function validSnapshotDate(value, catalog) {
  if (typeof value !== "string" || !catalog?.snapshotDates?.has(value)) return null;
  return value;
}

function formatCoordinate(value) {
  return Number(value.toFixed(5)).toString();
}

function formatZoom(value) {
  return Number(value.toFixed(1)).toString();
}

function preset(label, filters, layers) {
  return Object.freeze({
    label,
    filters: Object.freeze(filters),
    layers: Object.freeze(layers),
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
