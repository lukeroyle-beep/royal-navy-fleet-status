import assert from "node:assert/strict";
import {
  createFleetWebMcpTools,
  registerFleetWebMcp,
} from "../src/webmcp.js";
import { createDefaultPublicState } from "../src/utils/publicState.js";

const vessels = [
  {
    id: "hms-forth",
    name: "HMS Forth",
    pennantNumber: "P222",
    service: "Royal Navy",
    vesselClass: "River class",
    vesselType: "Offshore patrol vessel",
    status: "Deployed",
    commissionedDate: "2018",
    homePort: "Portsmouth",
    locationClassification: "mapped",
    locationState: "last_reported",
    locationPrecision: "port",
    publicLocationLabel: "Port Stanley",
    lastReportedLocation: "Port Stanley",
    position: { lat: -51.69, lon: -57.86, label: "Port Stanley" },
    uncertaintyArea: null,
  },
  {
    id: "rfa-tidespring",
    name: "RFA Tidespring",
    pennantNumber: "A136",
    service: "Royal Fleet Auxiliary",
    vesselClass: "Tide class",
    vesselType: "Fleet tanker",
    status: "In re-fit",
    commissionedDate: "2017",
    homePort: "Portland",
    locationClassification: "mapped",
    locationState: "confirmed",
    locationPrecision: "port",
    publicLocationLabel: "Falmouth",
    lastReportedLocation: "Falmouth",
    position: { lat: 50.15, lon: -5.07, label: "Falmouth" },
    uncertaintyArea: null,
  },
];

const context = {
  dataset: {
    metadata: {
      asOfDate: "2026-08-23",
      releaseRevision: 4,
      releasedAt: "2026-08-24T19:27:15Z",
    },
    vessels,
  },
  state: {
    ...createDefaultPublicState(),
    snapshotDate: "2026-08-23",
  },
  availableSnapshotDates: ["2026-08-16", "2026-08-23"],
  catalogs: {
    services: ["Royal Fleet Auxiliary", "Royal Navy"],
    vesselClasses: ["River class", "Tide class"],
    vesselTypes: ["Fleet tanker", "Offshore patrol vessel"],
    statuses: ["Deployed", "In re-fit"],
    locationStates: ["confirmed", "last_reported"],
  },
  shareUrl: "https://fleet.example/?view=2&snapshot=2026-08-23",
};

let shownVessel = null;
let appliedState = null;
const api = {
  getContext: () => context,
  showVessel: (vessel) => {
    shownVessel = vessel;
  },
  applyState: (state) => {
    appliedState = state;
    context.state = state;
  },
};

const tools = createFleetWebMcpTools(api);
assert.deepEqual(
  tools.map((tool) => tool.name),
  [
    "fleet.get_overview",
    "fleet.search_vessels",
    "fleet.get_vessel",
    "fleet.show_vessel",
    "fleet.configure_view",
    "fleet.reset_view",
  ],
);
assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
assert.deepEqual(
  Object.keys(tool("fleet.configure_view").inputSchema.properties.layers.properties),
  ["fleet", "shore", "clusters"],
);

const overview = await tool("fleet.get_overview").execute({});
assert.equal(overview.snapshot.date, "2026-08-23");
assert.equal(overview.fleet.total, 2);
assert.equal(overview.fleet.active, 1);
assert.equal(overview.fleet.availabilityPercentage, 50);

const search = await tool("fleet.search_vessels").execute({
  service: "Royal Navy",
  status: "Deployed",
});
assert.equal(search.totalMatches, 1);
assert.equal(search.vessels[0].id, "hms-forth");

const details = await tool("fleet.get_vessel").execute({ vessel: "P222" });
assert.equal(details.vessel.name, "HMS Forth");
assert.equal(details.vessel.position.label, "Port Stanley");

await tool("fleet.show_vessel").execute({ vessel: "forth" });
assert.equal(shownVessel.id, "hms-forth");

await tool("fleet.configure_view").execute({
  preset: "deployed",
  layers: { shore: true },
  map: { latitude: 5.06173, longitude: 12.25838, zoom: 2.4 },
});
assert.equal(appliedState.filters.status, "Deployed");
assert.equal(appliedState.layers.shore, true);
assert.deepEqual(appliedState.map, { centre: [5.06173, 12.25838], zoom: 2.4 });

await tool("fleet.reset_view").execute({});
assert.equal(appliedState.snapshotDate, null);
assert.equal(appliedState.filters.status, "");
assert.equal(appliedState.layers.fleet, true);

const registered = [];
const documentRef = {
  documentElement: { dataset: {} },
  modelContext: {
    registerTool: async (definition, options) => {
      registered.push({ definition, options });
    },
  },
};
const registration = await registerFleetWebMcp(api, { documentRef });
assert.equal(registration.supported, true);
assert.equal(registered.length, 6);
assert.equal(documentRef.documentElement.dataset.webmcp, "enabled");
assert.ok(registered.every(({ options }) => options.signal instanceof AbortSignal));

const unsupportedDocument = { documentElement: { dataset: {} } };
const unsupported = await registerFleetWebMcp(api, { documentRef: unsupportedDocument });
assert.deepEqual(unsupported, { supported: false, registeredTools: [] });
assert.equal(unsupportedDocument.documentElement.dataset.webmcp, "unsupported");

console.log("WebMCP registration and fleet tool tests passed.");

function tool(name) {
  return tools.find((candidate) => candidate.name === name);
}
