import { getAvailabilitySummary, getFleetStatusSummary } from "./utils/fleet.js";
import {
  PUBLIC_PRESETS,
  createDefaultPublicState,
  publicPresenceForVessel,
  stateForPublicPreset,
} from "./utils/publicState.js";

const REGISTRATION_CONTROLLER = Symbol.for("royal-navy-fleet-status.webmcp-controller");
const LOCATION_STATES = [
  "confirmed",
  "last_reported",
  "unconfirmed",
  "no_recent_information",
  "withheld",
];
const MAX_RESULTS = 50;
const PUBLIC_DATA_NOTICE =
  "Public-source snapshot only. Locations are last publicly reported or approximate, not live tracking.";

export function createFleetWebMcpTools(api) {
  const context = api.getContext();
  const schemaValues = createSchemaValues(context);

  return [
    {
      name: "fleet.get_overview",
      title: "Get fleet overview",
      description:
        "Return the published Royal Navy and Royal Fleet Auxiliary snapshot summary, active filters, layers, selection and shareable map URL. This does not change the page.",
      inputSchema: emptyObjectSchema(),
      annotations: readOnlyAnnotations(),
      execute: async () => createOverview(api.getContext()),
    },
    {
      name: "fleet.search_vessels",
      title: "Search fleet vessels",
      description:
        "Search vessels in the currently selected public snapshot by name, pennant, service, class, type, status, public location state or geographic presence. This does not change the page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            maxLength: 80,
            description: "Case-insensitive vessel name, identifier or pennant search.",
          },
          service: optionalEnum(schemaValues.services, "Published service name."),
          vesselClass: optionalEnum(schemaValues.vesselClasses, "Published vessel class."),
          vesselType: optionalEnum(schemaValues.vesselTypes, "Published vessel type."),
          status: optionalEnum(schemaValues.statuses, "Published vessel status."),
          locationState: optionalEnum(
            schemaValues.locationStates,
            "Published public-location state.",
          ),
          presence: {
            type: "string",
            enum: ["uk", "overseas"],
            description: "Geographic scope derived from the published location.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: MAX_RESULTS,
            default: 20,
            description: "Maximum number of matching vessels to return.",
          },
        },
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations(),
      execute: async (input) => searchCurrentFleet(api.getContext(), input),
    },
    {
      name: "fleet.get_vessel",
      title: "Get vessel details",
      description:
        "Return the public record for one vessel in the selected snapshot using its exact or unambiguous name, identifier or pennant number. This does not change the page.",
      inputSchema: vesselSelectorSchema(),
      annotations: readOnlyAnnotations(),
      execute: async ({ vessel }) => {
        const contextNow = api.getContext();
        return {
          snapshotDate: contextNow.dataset.metadata.asOfDate,
          vessel: projectVessel(resolveVessel(contextNow.dataset.vessels, vessel)),
          notice: PUBLIC_DATA_NOTICE,
        };
      },
    },
    {
      name: "fleet.show_vessel",
      title: "Show vessel on map",
      description:
        "Select one vessel in the shared page UI and open its public detail record. Existing fleet filters are cleared; the map focuses only when the record has a rounded point marker.",
      inputSchema: vesselSelectorSchema(),
      annotations: actionAnnotations(),
      execute: async ({ vessel }) => {
        const selected = resolveVessel(api.getContext().dataset.vessels, vessel);
        api.showVessel(selected);
        return {
          message: `${selected.name} is selected in the fleet tracker.`,
          vessel: projectVessel(selected),
          view: projectView(api.getContext()),
          notice: PUBLIC_DATA_NOTICE,
        };
      },
    },
    {
      name: "fleet.configure_view",
      title: "Configure fleet view",
      description:
        "Change the shared fleet-tracker view using a preset or explicit public snapshot, filters, layers and map position. Omitted properties retain their current values unless a preset is supplied.",
      inputSchema: configureViewSchema(schemaValues),
      annotations: actionAnnotations(),
      execute: async (input) => {
        const contextBefore = api.getContext();
        const nextState = configuredState(contextBefore, input);
        api.applyState(nextState);
        return {
          message: "The fleet-tracker view was updated.",
          overview: createOverview(api.getContext()),
        };
      },
    },
    {
      name: "fleet.reset_view",
      title: "Reset fleet view",
      description:
        "Reset the shared fleet tracker to the current public snapshot, default fleet layers, no filters and the default map extent.",
      inputSchema: emptyObjectSchema(),
      annotations: actionAnnotations(),
      execute: async () => {
        api.applyState(createDefaultPublicState());
        return {
          message: "The fleet-tracker view was reset.",
          overview: createOverview(api.getContext()),
        };
      },
    },
  ];
}

export async function registerFleetWebMcp(api, { documentRef = document } = {}) {
  const modelContext = documentRef?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    setRegistrationStatus(documentRef, "unsupported");
    return { supported: false, registeredTools: [] };
  }

  documentRef[REGISTRATION_CONTROLLER]?.abort();
  const controller = new AbortController();
  documentRef[REGISTRATION_CONTROLLER] = controller;
  const tools = createFleetWebMcpTools(api);

  try {
    await Promise.all(
      tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })),
    );
    setRegistrationStatus(documentRef, "enabled");
    return { supported: true, registeredTools: tools.map((tool) => tool.name) };
  } catch (error) {
    controller.abort();
    setRegistrationStatus(documentRef, "error");
    throw error;
  }
}

function createOverview(context) {
  const status = getFleetStatusSummary(context.dataset.vessels);
  const availability = getAvailabilitySummary(context.dataset.vessels);
  const visibleVessels = filterVessels(context.dataset.vessels, {
    query: context.state.filters.query,
    service: context.state.filters.service,
    vesselClass: context.state.filters.vesselClass,
    vesselType: context.state.filters.type,
    status: context.state.filters.status,
    locationState: context.state.filters.locationState,
    presence: context.state.filters.presence,
  });

  return {
    snapshot: {
      date: context.dataset.metadata.asOfDate,
      releaseRevision: context.dataset.metadata.releaseRevision ?? null,
      releasedAt: context.dataset.metadata.releasedAt ?? null,
      availableDates: context.availableSnapshotDates,
    },
    fleet: {
      total: status.total,
      deployed: status.deployed,
      inRefit: status.inRefit,
      unknown: status.unknown,
      active: availability.active,
      availabilityPercentage: roundPercentage(availability.percentage),
      byStatus: availability.byStatus,
    },
    visibleVesselCount: visibleVessels.length,
    view: projectView(context),
    notice: PUBLIC_DATA_NOTICE,
  };
}

function searchCurrentFleet(context, input = {}) {
  const limit = integerInRange(input.limit, 1, MAX_RESULTS, 20);
  const matches = filterVessels(context.dataset.vessels, input);
  return {
    snapshotDate: context.dataset.metadata.asOfDate,
    totalMatches: matches.length,
    returned: Math.min(matches.length, limit),
    vessels: matches.slice(0, limit).map(projectVesselSummary),
    notice: PUBLIC_DATA_NOTICE,
  };
}

function filterVessels(vessels, filters = {}) {
  const query = normalize(filters.query);
  return vessels
    .filter((vessel) => {
      const searchable = [vessel.name, vessel.id, vessel.pennantNumber].map(normalize);
      return (
        (!query || searchable.some((value) => value.includes(query))) &&
        matches(filters.service, vessel.service) &&
        matches(filters.vesselClass, vessel.vesselClass) &&
        matches(filters.vesselType, vessel.vesselType) &&
        matches(filters.status, vessel.status) &&
        matches(filters.locationState, vessel.locationState) &&
        matches(filters.presence, publicPresenceForVessel(vessel))
      );
    })
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
}

function resolveVessel(vessels, selector) {
  if (typeof selector !== "string" || !selector.trim()) {
    throw new Error("A vessel name, identifier or pennant number is required.");
  }
  const normalizedSelector = normalize(selector);
  const exact = vessels.filter((vessel) =>
    [vessel.id, vessel.name, vessel.pennantNumber].some(
      (value) => normalize(value) === normalizedSelector,
    ),
  );
  if (exact.length === 1) return exact[0];

  const partial = vessels.filter((vessel) =>
    [vessel.id, vessel.name, vessel.pennantNumber].some((value) =>
      normalize(value).includes(normalizedSelector),
    ),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) {
    throw new Error(`No vessel matching "${selector.trim()}" exists in this public snapshot.`);
  }
  throw new Error(
    `Vessel selector "${selector.trim()}" is ambiguous. Matches: ${partial
      .slice(0, 10)
      .map((vessel) => vessel.name)
      .join(", ")}.`,
  );
}

function configuredState(context, input = {}) {
  const preset = input.preset;
  if (preset !== undefined && !Object.hasOwn(PUBLIC_PRESETS, preset)) {
    throw new Error(`Unknown fleet view preset: ${preset}.`);
  }
  const state = preset ? stateForPublicPreset(preset) : structuredClone(context.state);
  if (preset) state.snapshotDate = context.state.snapshotDate;

  if (input.snapshotDate !== undefined) {
    assertAllowed("snapshotDate", input.snapshotDate, context.availableSnapshotDates);
    state.snapshotDate = input.snapshotDate;
  }
  const filterInputs = {
    query: input.query,
    service: input.service,
    vesselClass: input.vesselClass,
    type: input.vesselType,
    status: input.status,
    locationState: input.locationState,
    presence: input.presence,
  };
  const allowedFilters = {
    service: context.catalogs.services,
    vesselClass: context.catalogs.vesselClasses,
    type: context.catalogs.vesselTypes,
    status: context.catalogs.statuses,
    locationState: context.catalogs.locationStates,
    presence: ["uk", "overseas"],
  };
  for (const [key, value] of Object.entries(filterInputs)) {
    if (value === undefined) continue;
    if (key === "query") {
      if (typeof value !== "string" || value.trim().length > 80) {
        throw new Error("query must be a string no longer than 80 characters.");
      }
      state.filters.query = value.trim();
    } else {
      assertAllowed(key, value, allowedFilters[key]);
      state.filters[key] = value;
    }
  }
  if (input.layers !== undefined) {
    for (const key of ["fleet", "shore", "clusters"]) {
      if (input.layers[key] !== undefined) {
        if (typeof input.layers[key] !== "boolean") {
          throw new Error(`layers.${key} must be a boolean.`);
        }
        state.layers[key] = input.layers[key];
      }
    }
  }
  if (input.map !== undefined) {
    const { latitude, longitude, zoom } = input.map;
    if (
      !Number.isFinite(latitude) ||
      latitude < -85 ||
      latitude > 85 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(zoom) ||
      zoom < 0 ||
      zoom > 19
    ) {
      throw new Error("map must contain valid latitude, longitude and zoom values.");
    }
    state.map = { centre: [latitude, longitude], zoom };
  }
  state.selectedVessel = null;
  state.selectedShoreEstablishment = null;
  return state;
}

function projectView(context) {
  return {
    filters: { ...context.state.filters },
    layers: { ...context.state.layers },
    selectedVessel: context.state.selectedVessel,
    selectedShoreEstablishment: context.state.selectedShoreEstablishment,
    map: context.state.map,
    shareUrl: context.shareUrl,
  };
}

function projectVesselSummary(vessel) {
  return {
    id: vessel.id,
    name: vessel.name,
    pennantNumber: vessel.pennantNumber,
    service: vessel.service,
    vesselClass: vessel.vesselClass,
    vesselType: vessel.vesselType,
    status: vessel.status,
    publicLocation: {
      state: vessel.locationState,
      precision: vessel.locationPrecision,
      label: vessel.publicLocationLabel,
      presence: publicPresenceForVessel(vessel) || null,
    },
  };
}

function projectVessel(vessel) {
  return {
    ...projectVesselSummary(vessel),
    commissionedDate: vessel.commissionedDate,
    homePort: vessel.homePort,
    locationClassification: vessel.locationClassification,
    lastReportedLocation: vessel.lastReportedLocation,
    position: vessel.position ?? null,
    uncertaintyArea: vessel.uncertaintyArea ?? null,
  };
}

function createSchemaValues(context) {
  return {
    services: context.catalogs.services,
    vesselClasses: context.catalogs.vesselClasses,
    vesselTypes: context.catalogs.vesselTypes,
    statuses: context.catalogs.statuses,
    locationStates: context.catalogs.locationStates.length
      ? context.catalogs.locationStates
      : LOCATION_STATES,
    snapshotDates: context.availableSnapshotDates,
  };
}

function configureViewSchema(values) {
  return {
    type: "object",
    properties: {
      preset: {
        type: "string",
        enum: Object.keys(PUBLIC_PRESETS),
        description: "Optional named view preset applied before explicit overrides.",
      },
      snapshotDate: optionalEnum(values.snapshotDates, "Validated public snapshot date."),
      query: {
        type: "string",
        maxLength: 80,
        description: "Vessel name or pennant search. Use an empty string to clear it.",
      },
      service: optionalEnum(values.services, "Service filter."),
      vesselClass: optionalEnum(values.vesselClasses, "Vessel-class filter."),
      vesselType: optionalEnum(values.vesselTypes, "Vessel-type filter."),
      status: optionalEnum(values.statuses, "Published status filter."),
      locationState: optionalEnum(values.locationStates, "Public-location-state filter."),
      presence: {
        type: "string",
        enum: ["uk", "overseas"],
        description: "Geographic presence filter.",
      },
      layers: {
        type: "object",
        properties: {
          fleet: { type: "boolean" },
          shore: { type: "boolean" },
          clusters: { type: "boolean" },
        },
        additionalProperties: false,
        description: "Map layer visibility. Omitted layer properties retain their current values.",
      },
      map: {
        type: "object",
        properties: {
          latitude: { type: "number", minimum: -85, maximum: 85 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          zoom: { type: "number", minimum: 0, maximum: 19 },
        },
        required: ["latitude", "longitude", "zoom"],
        additionalProperties: false,
        description: "Map centre and zoom.",
      },
    },
    minProperties: 1,
    additionalProperties: false,
  };
}

function vesselSelectorSchema() {
  return {
    type: "object",
    properties: {
      vessel: {
        type: "string",
        minLength: 1,
        description: "Exact or unambiguous vessel name, public identifier or pennant number.",
      },
    },
    required: ["vessel"],
    additionalProperties: false,
  };
}

function emptyObjectSchema() {
  return { type: "object", properties: {}, additionalProperties: false };
}

function optionalEnum(values, description) {
  return { type: "string", enum: [...values], description };
}

function readOnlyAnnotations() {
  return { readOnlyHint: true, untrustedContentHint: true };
}

function actionAnnotations() {
  return { readOnlyHint: false, untrustedContentHint: true };
}

function matches(requested, actual) {
  return requested === undefined || requested === "" || normalize(requested) === normalize(actual);
}

function normalize(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-GB") : "";
}

function integerInRange(value, minimum, maximum, fallback) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function assertAllowed(label, value, allowedValues) {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${label} must be one of: ${allowedValues.join(", ")}.`);
  }
}

function roundPercentage(value) {
  return Number(value.toFixed(1));
}

function setRegistrationStatus(documentRef, status) {
  if (documentRef?.documentElement?.dataset) {
    documentRef.documentElement.dataset.webmcp = status;
  }
}
