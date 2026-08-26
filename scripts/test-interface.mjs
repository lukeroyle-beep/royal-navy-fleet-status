import assert from "node:assert/strict";
import fs from "node:fs";

import { SurfaceController } from "../src/components/SurfaceController.js";
import {
  COMPACT_SURFACE_QUERY,
  countActiveFilters,
  formatVesselResultSummary,
  nextOpenSurfaces,
  resolveSnapshotTransitionSelection,
} from "../src/utils/interface.js";
import {
  createPublicSnapshotDataset,
  parseStatusHistory,
} from "../src/utils/insights.js";
import {
  PORT_SHORE_FILTER,
  PUBLIC_STATE_VERSION,
  PUBLIC_STATE_STORAGE_KEY,
  createDefaultPublicState,
  createPublicStateCatalog,
  createShareablePublicUrl,
  parsePersistedPublicState,
  parsePublicUrlState,
  persistPublicState,
  publicPresenceForVessel,
  publicStateMatchesPreset,
  readPersistedPublicState,
  resolvePublicSelection,
  stateForPublicPreset,
} from "../src/utils/publicState.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const surfaces = fs.readFileSync(new URL("../src/components/SurfaceController.js", import.meta.url), "utf8");
const details = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");
const fleet = JSON.parse(fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"));
const shore = JSON.parse(
  fs.readFileSync(new URL("../data/royal-navy/shore-establishments.json", import.meta.url), "utf8"),
);
const historyCatalog = JSON.parse(
  fs.readFileSync(
    new URL("../data/royal-navy/status-history-catalog.json", import.meta.url),
    "utf8",
  ),
);
const statusHistory = parseStatusHistory(
  fs.readFileSync(new URL("../data/royal-navy/status-history.jsonl", import.meta.url), "utf8"),
);
const snapshotDates = ["2026-07-31", "2026-08-09", "2026-08-12", "2026-08-23"];
const stateCatalog = createPublicStateCatalog({
  vessels: fleet.vessels,
  shoreEstablishments: shore.establishments,
});
const historyStateCatalog = createPublicStateCatalog({
  vessels: fleet.vessels,
  selectionVessels: historyCatalog.vessels,
  shoreEstablishments: shore.establishments,
  snapshotDates,
  currentSnapshotDate: fleet.metadata.asOfDate,
});

assert.equal(countActiveFilters(), 0);
assert.equal(countActiveFilters({ query: "Duncan", status: "Deployed", service: "Royal Navy" }), 3);
assert.equal(countActiveFilters({ presence: "overseas" }), 1);
assert.equal(formatVesselResultSummary(68, 68, 0), "Showing 68 vessels");
assert.equal(formatVesselResultSummary(18, 68, 3), "Showing 18 of 68 vessels · 3 filters");
assert.equal(formatVesselResultSummary(1, 68, 1), "Showing 1 of 68 vessels · 1 filter");

assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "filters", true)], ["filters"]);
assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "detail", false)], ["fleet", "detail"]);
assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "fleet", false)], []);
assert.match(COMPACT_SURFACE_QUERY, /pointer: coarse/);

for (const id of ["fleetToggle", "layersToggle", "filterToggle", "fleetDrawer", "detailDrawer", "layersPanel", "filterPanel", "presenceFilter"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.doesNotMatch(html, /id="shareButton"|id="shareStatus"/);
assert.doesNotMatch(app, /copyShareableView|copyTextFallback|navigator\.clipboard|execCommand\("copy"\)/);
assert.match(html, /id="reloadApp"[^>]*hidden/);
assert.match(html, /"rn-fleet-ready"/);
assert.match(html, /"rn-fleet-failed"/);
assert.match(html, /searchParams\.set\("_reload", Date\.now\(\)\.toString\(\)\)/);
assert.match(html, /window\.setTimeout\(showStartupFailure, 15000\)/);
assert.match(app, /dispatchEvent\(new Event\("rn-fleet-ready"\)\)/);
assert.match(app, /dispatchEvent\(new Event\("rn-fleet-failed"\)\)/);
for (const id of [
  "snapshotSelect",
  "snapshotDescription",
  "changedOnlyToggle",
  "changedOnlyStatus",
  "vesselTimeline",
  "vesselTimelineSummary",
  "vesselTimelineList",
]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, /id="snapshotSelect"[^>]*aria-describedby="snapshotDescription"/);
assert.match(html, /id="snapshotDescription"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html, /id="changedOnlyToggle"[^>]*type="checkbox"[^>]*aria-describedby=/);
assert.match(html, /id="vesselTimeline"[^>]*aria-labelledby="vesselTimelineTitle"[^>]*hidden/);
assert.match(html, /Discrete published snapshots only/);
assert.match(app, /createPublicSnapshotDataset/);
assert.match(app, /compareCurrentWithPreviousSnapshot/);
assert.match(app, /resolveSnapshotTransitionSelection/);
assert.match(app, /selectShoreEstablishment\(retainedSelection\.shoreEstablishment/);
assert.match(app, /!changedOnly \|\| snapshotComparison\.changedCurrentVesselIds\.includes/);
assert.match(styles, /\.snapshot-controls\s*\{[^}]*grid-template-columns/s);
assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.snapshot-controls\s*\{\s*grid-template-columns:\s*1fr;/);
assert.match(styles, /\(pointer: coarse\) and \(min-width: 701px\) and \(max-width: 1400px\)/);
assert.match(styles, /\.surface-backdrop\s*\{\s*display:\s*none;/);
assert.match(styles, /grid-auto-columns:\s*minmax\(0, 1fr\)/);
assert.match(details, /getVesselPublicTimeline/);
for (const id of ["fleetLayerToggle", "shoreLayerToggle", "clusterLayerToggle", "uncertaintyLayerToggle"]) {
  assert.match(html, new RegExp(`id="${id}"[^>]*type="checkbox"`));
}
assert.match(html, /id="uncertaintyLayerRow"[^>]*hidden/);
assert.match(html, /id="uncertaintyVesselPicker"[^>]*hidden/);
assert.match(html, /id="uncertaintyVesselSelect"/);
assert.match(app, /uncertaintyCount === 0/);
assert.match(app, /renderUncertaintyVesselPicker\(filtered\)/);
assert.match(app, /source: "region-picker"/);
assert.match(app, /setUncertaintyAreasVisible/);
assert.match(app, /locationState: elements\.location\.value/);
assert.match(app, /uncertainty: elements\.uncertaintyLayerToggle\.checked/);
assert.match(app, /persistPublicState\(publicStorage, state, publicStateCatalog\)/);
assert.match(app, /createShareablePublicUrl\([\s\S]*publicStateCatalog/);
assert.doesNotMatch(html, /Deployment regions|Evidence requiring review|Recent evidence events|Overseas support facilities/);
assert.match(html, /id="filterBadge"[^>]*hidden/);
assert.match(html, /id="resetFilters"[^>]*hidden/);
assert.match(app, /formatVesselResultSummary/);
assert.match(app, /surfaceController\.open\("detail"/);
assert.match(app, /fleetMap\.selectVessel\(vessel, \{ focus: focusMap \}\)/);
assert.match(app, /if \(initial\) \{\s*fleetMap\.completeStartupView\(state\.map\);/);
assert.match(app, /resolvePublicSelection\(publicStateCatalog, state\)/);
assert.doesNotMatch(app, /filteredVessels\.find\(\(vessel\) => vessel\.id === state\.selectedVessel\)/);
assert.match(app, /map: fleetMap\.getPublicView\(\)/);
assert.match(surfaces, /event\.key === "Escape"/);
assert.match(surfaces, /if \(this\.isCompact\(\)\) next\.clear\(\)/);
assert.match(surfaces, /this\.returnContexts = new Map\(\)/);
assert.match(surfaces, /recordedTarget[\s\S]*returnContext\.surface/);
assert.match(app, /returnFocus: trigger/);
assert.match(app, /returnSurface: "fleet"/);
assert.match(app, /returnSurface: "layers"/);
assert.match(html, /id="detailTitle"[^>]*tabindex="-1"[^>]*data-surface-focus/);
assert.match(styles, /prefers-reduced-motion:\s*reduce/);
assert.match(styles, /#fleetMap\s*\{[^}]*z-index:\s*0;/s);
assert.match(styles, /outline:\s*3px solid var\(--accent-strong\)/);
assert.match(details, /\["Snapshot", formatSnapshotDate\(asOfDate\)\]/);
assert.match(details, /this\.primaryMeta\.replaceChildren/);
assert.doesNotMatch(details, /Supporting source|Evidence grade|Confidence score|Analyst note|Retrieval status/i);

testCompactDetailFocusRestoration();

const storedState = parsePersistedPublicState(
  JSON.stringify({
    version: PUBLIC_STATE_VERSION,
    filters: {
      status: "Deployed",
      service: "Royal Navy",
      locationState: "last_reported",
      presence: "overseas",
      shoreType: PORT_SHORE_FILTER,
      ignored: "not-public-state",
    },
    layers: { fleet: true, shore: true, clusters: false, uncertainty: false, evidence: true },
    selectedVessel: fleet.vessels[0].id,
    map: { centre: [10, 20], zoom: 7 },
  }),
  stateCatalog,
);
assert.equal(storedState.filters.status, "Deployed");
assert.equal(storedState.filters.locationState, "last_reported");
assert.equal(storedState.filters.presence, "overseas");
assert.equal(storedState.filters.shoreType, PORT_SHORE_FILTER);
assert.deepEqual(storedState.layers, {
  fleet: true,
  shore: true,
  clusters: false,
  uncertainty: false,
});
assert.equal(storedState.selectedVessel, null, "Selection must not persist locally.");
assert.equal(storedState.selectedShoreEstablishment, null, "Shore selection must not persist locally.");
assert.equal(storedState.snapshotDate, null, "Snapshot selection must remain URL-scoped.");
assert.equal(storedState.map, null, "Map position must not persist locally.");
assert.deepEqual(parsePersistedPublicState("not-json", stateCatalog), createDefaultPublicState());
assert.deepEqual(
  parsePersistedPublicState(JSON.stringify({ version: 99, layers: { fleet: false } }), stateCatalog),
  createDefaultPublicState(),
);

const migratedStoredState = parsePersistedPublicState(
  JSON.stringify({
    version: 1,
    filters: { status: "Deployed", location: "approximate", presence: "overseas" },
    layers: { fleet: true, shore: false, clusters: false },
  }),
  stateCatalog,
);
assert.equal(migratedStoredState.version, PUBLIC_STATE_VERSION);
assert.equal(migratedStoredState.filters.status, "Deployed");
assert.equal(
  migratedStoredState.filters.locationState,
  "",
  "The superseded classification filter must not be reinterpreted as a location state.",
);
assert.deepEqual(migratedStoredState.layers, {
  fleet: true,
  shore: false,
  clusters: false,
  uncertainty: true,
});

const selectedVessel = fleet.vessels.find((vessel) => vessel.status === "Deployed");
const duncan = fleet.vessels.find((vessel) => vessel.id === "hms-duncan");
const august12Fleet = createPublicSnapshotDataset({
  currentFleet: fleet,
  history: statusHistory,
  catalog: historyCatalog,
  snapshotDate: "2026-08-12",
});
const august12Duncan = august12Fleet.vessels.find((vessel) => vessel.id === duncan.id);
assert.equal(duncan.status, "Deployed");
assert.equal(august12Duncan.status, "Available");
assert.deepEqual(
  resolveSnapshotTransitionSelection({
    visibleVessels: august12Fleet.vessels.filter((vessel) => vessel.status === "Deployed"),
    shoreEstablishments: shore.establishments,
    selectedVesselId: duncan.id,
  }),
  { vessel: null, shoreEstablishment: null },
  "A vessel that stops matching active filters after a snapshot change must be cleared.",
);
const pointVessel = fleet.vessels.find((vessel) => vessel.position);
const regionalVessel = fleet.vessels.find((vessel) => vessel.uncertaintyArea);
const listOnlyVessel = fleet.vessels.find(
  (vessel) => !vessel.position && !vessel.uncertaintyArea,
);
for (const publicVessel of [pointVessel, regionalVessel, listOnlyVessel]) {
  assert.ok(publicVessel, "Selection fixtures must cover every public geometry state.");
  const selectionUrl = createShareablePublicUrl(
    "https://example.test/tracker",
    { selectedVessel: publicVessel.id },
    stateCatalog,
  );
  assert.equal(selectionUrl.searchParams.get("vessel"), publicVessel.id);
  const restoredSelection = parsePublicUrlState(selectionUrl, stateCatalog).selectedVessel;
  assert.equal(restoredSelection, publicVessel.id);
  assert.equal(
    resolvePublicSelection(stateCatalog, { selectedVessel: restoredSelection }).vessel,
    publicVessel,
  );
}
assert.equal(listOnlyVessel.locationPrecision, "none");
assert.equal(
  resolvePublicSelection(stateCatalog, { selectedVessel: "hms-iron-duke" }).vessel,
  null,
);
assert.equal(
  parsePublicUrlState(
    "https://example.test/tracker?view=2&layers=fleet&vessel=hms-iron-duke",
    stateCatalog,
  ).selectedVessel,
  null,
  "Removed vessel IDs must not be restored.",
);
const shoreEstablishment = shore.establishments[0];
assert.deepEqual(
  resolveSnapshotTransitionSelection({
    visibleVessels: august12Fleet.vessels,
    shoreEstablishments: shore.establishments,
    selectedShoreId: shoreEstablishment.id,
  }),
  { vessel: null, shoreEstablishment },
  "A snapshot change must deliberately preserve a valid shore selection.",
);
const shoreSelectionUrl = createShareablePublicUrl(
  "https://example.test/tracker",
  { selectedShoreEstablishment: shoreEstablishment.id },
  stateCatalog,
);
assert.equal(shoreSelectionUrl.searchParams.get("shore"), shoreEstablishment.id);
const restoredShoreState = parsePublicUrlState(shoreSelectionUrl, stateCatalog);
assert.equal(restoredShoreState.selectedShoreEstablishment, shoreEstablishment.id);
assert.equal(
  resolvePublicSelection(stateCatalog, restoredShoreState).shoreEstablishment,
  shoreEstablishment,
);
const historicalShoreSelectionUrl = createShareablePublicUrl(
  "https://example.test/tracker",
  {
    selectedShoreEstablishment: shoreEstablishment.id,
    snapshotDate: "2026-08-12",
    layers: { fleet: true, shore: true, clusters: true, uncertainty: true },
  },
  historyStateCatalog,
);
assert.equal(historicalShoreSelectionUrl.searchParams.get("snapshot"), "2026-08-12");
assert.equal(historicalShoreSelectionUrl.searchParams.get("shore"), shoreEstablishment.id);
assert.equal(
  parsePublicUrlState(historicalShoreSelectionUrl, historyStateCatalog)
    .selectedShoreEstablishment,
  shoreEstablishment.id,
  "A preserved shore selection must remain restorable from the snapshot URL.",
);
assert.equal(
  parsePublicUrlState(
    "https://example.test/tracker?view=2&layers=shore&shore=removed-shore-record",
    stateCatalog,
  ).selectedShoreEstablishment,
  null,
  "Removed shore IDs must not be restored.",
);
const ambiguousSelectionState = parsePublicUrlState(
  `https://example.test/tracker?view=2&layers=fleet,shore&vessel=${pointVessel.id}&shore=${shoreEstablishment.id}`,
  stateCatalog,
);
assert.equal(ambiguousSelectionState.selectedVessel, null);
assert.equal(ambiguousSelectionState.selectedShoreEstablishment, null);
const urlState = parsePublicUrlState(
  `https://example.test/tracker?view=2&status=Deployed&locationState=last_reported&presence=overseas&layers=fleet,clusters,uncertainty&vessel=${selectedVessel.id}&lat=100&lon=-220&zoom=40&sourceUrl=https://invalid.test`,
  stateCatalog,
);
assert.equal(urlState.filters.status, "Deployed");
assert.equal(urlState.filters.locationState, "last_reported");
assert.equal(urlState.filters.presence, "overseas");
assert.deepEqual(urlState.layers, {
  fleet: true,
  shore: false,
  clusters: true,
  uncertainty: true,
});
assert.equal(urlState.selectedVessel, selectedVessel.id);
assert.deepEqual(urlState.map, { centre: [85, -180], zoom: 19 });
assert.equal(parsePublicUrlState("https://example.test/tracker", stateCatalog), null);
assert.deepEqual(
  parsePublicUrlState("https://example.test/tracker?view=99&status=Deployed", stateCatalog),
  createDefaultPublicState(),
);

const restoredSnapshotState = parsePublicUrlState(
  `https://example.test/tracker?view=2&layers=fleet&snapshot=2026-08-12&vessel=hms-iron-duke`,
  historyStateCatalog,
);
assert.equal(restoredSnapshotState.snapshotDate, "2026-08-12");
assert.equal(restoredSnapshotState.selectedVessel, "hms-iron-duke");
assert.equal(
  parsePublicUrlState(
    "https://example.test/tracker?view=2&layers=fleet&snapshot=2025-01-01",
    historyStateCatalog,
  ).snapshotDate,
  null,
  "An obsolete snapshot URL must fall back to the current snapshot.",
);
assert.equal(
  parsePublicUrlState(
    "https://example.test/tracker?view=2&layers=fleet&snapshot=not-a-date",
    historyStateCatalog,
  ).snapshotDate,
  null,
  "A malformed snapshot URL must fall back to the current snapshot.",
);

for (const malformedMap of [
  "lat=&lon=1&zoom=4",
  "lat=%20&lon=1&zoom=4",
  "lat=50north&lon=1&zoom=4",
  "lat=50&lon=Infinity&zoom=4",
  "lat=50&lon=1&zoom=",
  "lat=50&lon=1",
]) {
  const malformedState = parsePublicUrlState(
    `https://example.test/tracker?view=2&${malformedMap}`,
    stateCatalog,
  );
  assert.equal(malformedState.map, null, `Malformed map state was accepted: ${malformedMap}`);
}

for (const duplicateQuery of [
  "view=2&view=2&layers=fleet",
  "view=2&layers=fleet&layers=fleet",
  "view=2&layers=fleet&layers=shore",
  `view=2&layers=fleet&vessel=${pointVessel.id}&vessel=${pointVessel.id}`,
  `view=2&layers=fleet&vessel=${pointVessel.id}&vessel=${regionalVessel.id}`,
  `view=2&layers=shore&shore=${shoreEstablishment.id}&shore=${shoreEstablishment.id}`,
  `view=2&layers=shore&shore=${shoreEstablishment.id}&shore=removed-shore-record`,
  "view=2&q=Dragon&q=Dragon&layers=fleet",
  "view=2&snapshot=2026-08-12&snapshot=2026-08-12&layers=fleet",
  "view=2&lat=50&lat=50&lon=-4&zoom=5&layers=fleet",
]) {
  assert.deepEqual(
    parsePublicUrlState(`https://example.test/tracker?${duplicateQuery}`, stateCatalog),
    createDefaultPublicState(),
    `Duplicate singleton state was accepted: ${duplicateQuery}`,
  );
}

const legacyUrlState = parsePublicUrlState(
  `https://example.test/tracker?view=1&status=Deployed&location=approximate&layers=fleet,clusters&vessel=${selectedVessel.id}&lat=50&lon=-4&zoom=5`,
  stateCatalog,
);
assert.equal(legacyUrlState.filters.status, "Deployed");
assert.equal(legacyUrlState.filters.locationState, "");
assert.equal(legacyUrlState.layers.uncertainty, true);
assert.deepEqual(legacyUrlState.map, { centre: [50, -4], zoom: 5 });

const shareableUrl = createShareablePublicUrl(
  "https://example.test/tracker?sourceUrl=remove-me#map",
  {
    ...storedState,
    selectedVessel: selectedVessel.id,
    snapshotDate: "2026-08-12",
    map: { centre: [55.953251, -3.188267], zoom: 6.25 },
  },
  stateCatalog,
);
assert.equal(shareableUrl.searchParams.get("view"), String(PUBLIC_STATE_VERSION));
assert.equal(shareableUrl.searchParams.get("vessel"), selectedVessel.id);
assert.equal(shareableUrl.searchParams.get("snapshot"), null);
assert.equal(shareableUrl.searchParams.has("sourceUrl"), false);
assert.equal(shareableUrl.hash, "#map");
assert.deepEqual(parsePublicUrlState(shareableUrl, stateCatalog).layers, storedState.layers);

const historicalShareableUrl = createShareablePublicUrl(
  "https://example.test/tracker",
  {
    selectedVessel: "hms-iron-duke",
    snapshotDate: "2026-08-12",
    layers: { fleet: true, shore: false, clusters: true, uncertainty: true },
  },
  historyStateCatalog,
);
assert.equal(historicalShareableUrl.searchParams.get("snapshot"), "2026-08-12");
assert.equal(historicalShareableUrl.searchParams.get("vessel"), "hms-iron-duke");

const boundedShareableUrl = createShareablePublicUrl(
  "https://example.test/tracker",
  {
    filters: {
      query: "x".repeat(81),
      shoreQuery: "y".repeat(81),
      status: "Not a public status",
      locationState: "not-a-public-state",
    },
    layers: { fleet: true, shore: false, clusters: true, uncertainty: true },
    selectedVessel: "not-a-public-vessel",
    map: { centre: [100, -220], zoom: 40 },
  },
  stateCatalog,
);
assert.equal(boundedShareableUrl.searchParams.has("q"), false);
assert.equal(boundedShareableUrl.searchParams.has("shoreQ"), false);
assert.equal(boundedShareableUrl.searchParams.has("status"), false);
assert.equal(boundedShareableUrl.searchParams.has("locationState"), false);
assert.equal(boundedShareableUrl.searchParams.has("vessel"), false);
assert.equal(boundedShareableUrl.searchParams.get("lat"), "85");
assert.equal(boundedShareableUrl.searchParams.get("lon"), "-180");
assert.equal(boundedShareableUrl.searchParams.get("zoom"), "19");

const invalidNumericShareableUrl = createShareablePublicUrl(
  "https://example.test/tracker",
  {
    filters: { query: "x".repeat(80), shoreQuery: "y".repeat(80) },
    layers: { fleet: true, shore: false, clusters: true, uncertainty: false },
    map: { centre: ["", "1"], zoom: "4" },
  },
  stateCatalog,
);
assert.equal(invalidNumericShareableUrl.searchParams.get("q"), "x".repeat(80));
assert.equal(invalidNumericShareableUrl.searchParams.get("shoreQ"), "y".repeat(80));
assert.equal(invalidNumericShareableUrl.searchParams.has("lat"), false);
assert.equal(invalidNumericShareableUrl.searchParams.has("lon"), false);
assert.equal(invalidNumericShareableUrl.searchParams.has("zoom"), false);

for (const preset of ["overview", "deployed", "ukPorts", "maintenance", "overseas"]) {
  const presetState = stateForPublicPreset(preset);
  assert.ok(presetState, `${preset} preset is missing.`);
  assert.equal(publicStateMatchesPreset(presetState, preset), true);
}
assert.equal(stateForPublicPreset("ukPorts").filters.shoreType, PORT_SHORE_FILTER);
assert.equal(stateForPublicPreset("ukPorts").layers.shore, true);
assert.equal(stateForPublicPreset("ukPorts").layers.uncertainty, false);
assert.equal(stateForPublicPreset("overseas").filters.presence, "overseas");
assert.equal(stateForPublicPreset("overseas").layers.uncertainty, true);
assert.equal(
  publicPresenceForVessel({
    locationPrecision: "city",
    position: { lat: 55.95, lon: -3.19 },
  }),
  "uk",
);
assert.equal(
  publicPresenceForVessel({
    locationPrecision: "port",
    position: { lat: 1.29, lon: 103.85 },
  }),
  "overseas",
);
assert.equal(
  publicPresenceForVessel({
    locationPrecision: "region",
    uncertaintyArea: { centre: { lat: -20, lon: -20 }, radiusKm: 450 },
  }),
  "overseas",
);
assert.equal(
  publicPresenceForVessel({
    locationPrecision: "none",
    position: null,
    uncertaintyArea: null,
  }),
  "",
);

const memoryStorage = new Map();
const storage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, value),
};
assert.equal(persistPublicState(storage, storedState, stateCatalog), true);
assert.ok(memoryStorage.has(PUBLIC_STATE_STORAGE_KEY));
assert.equal(readPersistedPublicState(storage, stateCatalog).filters.status, "Deployed");
assert.deepEqual(
  readPersistedPublicState({ getItem: () => { throw new Error("blocked"); } }, stateCatalog),
  createDefaultPublicState(),
);
assert.equal(
  persistPublicState({ setItem: () => { throw new Error("blocked"); } }, storedState, stateCatalog),
  false,
);

for (const preset of ["overview", "deployed", "ukPorts", "maintenance", "overseas"]) {
  assert.match(html, new RegExp(`data-public-preset="${preset}"`));
}
for (const prohibited of ["Evidence requiring review", "sourceUrl", "evidenceGrade", "analystNotes"]) {
  assert.doesNotMatch(
    createShareablePublicUrl("https://example.test/", storedState, stateCatalog).href,
    new RegExp(prohibited, "i"),
  );
  assert.doesNotMatch(JSON.stringify(storedState), new RegExp(prohibited, "i"));
}

function testCompactDetailFocusRestoration() {
  let activeElement = null;
  let escapeHandler = null;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  const createElement = ({ hidden = false, focusTarget = null } = {}) => ({
    hidden,
    isConnected: true,
    disabled: false,
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {},
    querySelector: () => focusTarget,
    focus() {
      activeElement = this;
    },
  });

  const detailHeading = createElement();
  const fleetSurface = createElement();
  const layersSurface = createElement({ hidden: true });
  const detailSurface = createElement({ hidden: true, focusTarget: detailHeading });
  const fleetToggle = createElement();
  const layersToggle = createElement();

  try {
    globalThis.window = {
      matchMedia: () => ({ matches: true, addEventListener() {} }),
    };
    globalThis.document = {
      querySelectorAll: () => [],
      addEventListener(type, handler) {
        if (type === "keydown") escapeHandler = handler;
      },
    };

    const controller = new SurfaceController({
      surfaces: new Map([
        ["fleet", fleetSurface],
        ["layers", layersSurface],
        ["detail", detailSurface],
      ]),
      triggers: new Map([
        ["fleet", fleetToggle],
        ["layers", layersToggle],
      ]),
      focusFallbacks: new Map([["detail", fleetToggle]]),
      backdrop: null,
    });

    const vesselTrigger = createElement();
    controller.open("detail", {
      focus: true,
      returnFocus: vesselTrigger,
      returnSurface: "fleet",
      returnFocusFallback: fleetToggle,
    });
    assert.equal(activeElement, detailHeading, "A compact vessel selection must focus its detail heading.");
    escapeHandler({ key: "Escape" });
    assert.equal(activeElement, vesselTrigger, "Escape must restore the invoking vessel list control.");
    assert.equal(fleetSurface.hidden, false, "The compact fleet list must reopen around its restored trigger.");

    controller.open("layers");
    const shoreTrigger = createElement();
    controller.open("detail", {
      focus: true,
      returnFocus: shoreTrigger,
      returnSurface: "layers",
      returnFocusFallback: layersToggle,
    });
    assert.equal(activeElement, detailHeading, "A compact shore selection must focus its detail heading.");
    escapeHandler({ key: "Escape" });
    assert.equal(activeElement, shoreTrigger, "Escape must restore the invoking shore list control.");
    assert.equal(layersSurface.hidden, false, "The compact layers list must reopen around its shore trigger.");

    const regionalSelect = createElement();
    controller.open("detail", {
      focus: true,
      returnFocus: regionalSelect,
      returnSurface: "layers",
      returnFocusFallback: layersToggle,
    });
    controller.close("detail", { restoreFocus: true });
    assert.equal(activeElement, regionalSelect, "Closing regional detail must restore its chooser.");
    assert.equal(layersSurface.hidden, false, "The compact layers surface must reopen around its chooser.");

    const pageLoadFocus = createElement();
    activeElement = pageLoadFocus;
    controller.open("detail", { focus: false });
    assert.equal(activeElement, pageLoadFocus, "Restoring selection from the URL must not steal focus.");
    escapeHandler({ key: "Escape" });
    assert.equal(activeElement, fleetToggle, "A restored detail without a trigger needs a stable close fallback.");

    controller.open("fleet");
    const removedTrigger = createElement();
    controller.open("detail", {
      focus: true,
      returnFocus: removedTrigger,
      returnSurface: "fleet",
      returnFocusFallback: fleetToggle,
    });
    removedTrigger.isConnected = false;
    escapeHandler({ key: "Escape" });
    assert.equal(activeElement, fleetToggle, "A removed list trigger must fall back to the Fleet control.");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

console.log("Map-first interface and public state tests passed.");
