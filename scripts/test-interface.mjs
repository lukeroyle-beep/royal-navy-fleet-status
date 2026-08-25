import assert from "node:assert/strict";
import fs from "node:fs";

import {
  COMPACT_SURFACE_QUERY,
  countActiveFilters,
  formatVesselResultSummary,
  nextOpenSurfaces,
} from "../src/utils/interface.js";
import {
  PORT_SHORE_FILTER,
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
const stateCatalog = createPublicStateCatalog({
  vessels: fleet.vessels,
  shoreEstablishments: shore.establishments,
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

for (const id of ["fleetToggle", "layersToggle", "filterToggle", "shareButton", "fleetDrawer", "detailDrawer", "layersPanel", "filterPanel", "presenceFilter"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
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
assert.doesNotMatch(html, /Deployment regions|Evidence requiring review|Recent evidence events|Overseas support facilities/);
assert.match(html, /id="filterBadge"[^>]*hidden/);
assert.match(html, /id="resetFilters"[^>]*hidden/);
assert.match(app, /formatVesselResultSummary/);
assert.match(app, /surfaceController\.open\("detail"/);
assert.match(app, /fleetMap\.selectVessel\(vessel, \{ focus: focusMap \}\)/);
assert.match(surfaces, /event\.key === "Escape"/);
assert.match(surfaces, /if \(this\.isCompact\(\)\) next\.clear\(\)/);
assert.match(styles, /prefers-reduced-motion:\s*reduce/);
assert.match(styles, /#fleetMap\s*\{[^}]*z-index:\s*0;/s);
assert.match(styles, /outline:\s*3px solid var\(--accent-strong\)/);
assert.match(details, /\["Snapshot", formatSnapshotDate\(asOfDate\)\]/);
assert.match(details, /this\.primaryMeta\.replaceChildren/);
assert.doesNotMatch(details, /Supporting source|Evidence grade|Confidence score|Analyst note|Retrieval status/i);

const storedState = parsePersistedPublicState(
  JSON.stringify({
    version: 1,
    filters: {
      status: "Deployed",
      service: "Royal Navy",
      presence: "overseas",
      shoreType: PORT_SHORE_FILTER,
      ignored: "not-public-state",
    },
    layers: { fleet: true, shore: true, clusters: false, evidence: true },
    selectedVessel: fleet.vessels[0].id,
    map: { centre: [10, 20], zoom: 7 },
  }),
  stateCatalog,
);
assert.equal(storedState.filters.status, "Deployed");
assert.equal(storedState.filters.presence, "overseas");
assert.equal(storedState.filters.shoreType, PORT_SHORE_FILTER);
assert.deepEqual(storedState.layers, { fleet: true, shore: true, clusters: false });
assert.equal(storedState.selectedVessel, null, "Selection must not persist locally.");
assert.equal(storedState.map, null, "Map position must not persist locally.");
assert.deepEqual(parsePersistedPublicState("not-json", stateCatalog), createDefaultPublicState());
assert.deepEqual(
  parsePersistedPublicState(JSON.stringify({ version: 99, layers: { fleet: false } }), stateCatalog),
  createDefaultPublicState(),
);

const selectedVessel = fleet.vessels.find((vessel) => vessel.status === "Deployed");
const urlState = parsePublicUrlState(
  `https://example.test/tracker?view=1&status=Deployed&presence=overseas&layers=fleet,clusters&vessel=${selectedVessel.id}&lat=100&lon=-220&zoom=40&sourceUrl=https://invalid.test`,
  stateCatalog,
);
assert.equal(urlState.filters.status, "Deployed");
assert.equal(urlState.filters.presence, "overseas");
assert.deepEqual(urlState.layers, { fleet: true, shore: false, clusters: true });
assert.equal(urlState.selectedVessel, selectedVessel.id);
assert.deepEqual(urlState.map, { centre: [85, -180], zoom: 19 });
assert.equal(parsePublicUrlState("https://example.test/tracker", stateCatalog), null);
assert.deepEqual(
  parsePublicUrlState("https://example.test/tracker?view=99&status=Deployed", stateCatalog),
  createDefaultPublicState(),
);

const shareableUrl = createShareablePublicUrl("https://example.test/tracker?sourceUrl=remove-me#map", {
  ...storedState,
  selectedVessel: selectedVessel.id,
  map: { centre: [55.953251, -3.188267], zoom: 6.25 },
});
assert.equal(shareableUrl.searchParams.get("view"), "1");
assert.equal(shareableUrl.searchParams.get("vessel"), selectedVessel.id);
assert.equal(shareableUrl.searchParams.has("sourceUrl"), false);
assert.equal(shareableUrl.hash, "#map");
assert.deepEqual(parsePublicUrlState(shareableUrl, stateCatalog).layers, storedState.layers);

for (const preset of ["overview", "deployed", "ukPorts", "maintenance", "overseas"]) {
  const presetState = stateForPublicPreset(preset);
  assert.ok(presetState, `${preset} preset is missing.`);
  assert.equal(publicStateMatchesPreset(presetState, preset), true);
}
assert.equal(stateForPublicPreset("ukPorts").filters.shoreType, PORT_SHORE_FILTER);
assert.equal(stateForPublicPreset("ukPorts").layers.shore, true);
assert.equal(stateForPublicPreset("overseas").filters.presence, "overseas");
assert.equal(
  publicPresenceForVessel({
    locationClassification: "mapped",
    position: { lat: 55.95, lon: -3.19 },
  }),
  "uk",
);
assert.equal(
  publicPresenceForVessel({
    locationClassification: "approximate",
    position: { lat: 1.29, lon: 103.85 },
  }),
  "overseas",
);
assert.equal(
  publicPresenceForVessel({
    locationClassification: "withheld",
    symbolicPosition: { lat: 55, lon: -4 },
  }),
  "",
);

const memoryStorage = new Map();
const storage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, value),
};
assert.equal(persistPublicState(storage, storedState), true);
assert.ok(memoryStorage.has(PUBLIC_STATE_STORAGE_KEY));
assert.equal(readPersistedPublicState(storage, stateCatalog).filters.status, "Deployed");
assert.deepEqual(
  readPersistedPublicState({ getItem: () => { throw new Error("blocked"); } }, stateCatalog),
  createDefaultPublicState(),
);
assert.equal(persistPublicState({ setItem: () => { throw new Error("blocked"); } }, storedState), false);

for (const preset of ["overview", "deployed", "ukPorts", "maintenance", "overseas"]) {
  assert.match(html, new RegExp(`data-public-preset="${preset}"`));
}
for (const prohibited of ["Evidence requiring review", "sourceUrl", "evidenceGrade", "analystNotes"]) {
  assert.doesNotMatch(createShareablePublicUrl("https://example.test/", storedState).href, new RegExp(prohibited, "i"));
  assert.doesNotMatch(JSON.stringify(storedState), new RegExp(prohibited, "i"));
}

console.log("Map-first interface and public state tests passed.");
