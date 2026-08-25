import assert from "node:assert/strict";
import fs from "node:fs";

import {
  COMPACT_SURFACE_QUERY,
  countActiveFilters,
  formatVesselResultSummary,
  nextOpenSurfaces,
} from "../src/utils/interface.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const surfaces = fs.readFileSync(new URL("../src/components/SurfaceController.js", import.meta.url), "utf8");
const details = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");

assert.equal(countActiveFilters(), 0);
assert.equal(countActiveFilters({ query: "Duncan", status: "Deployed", service: "Royal Navy" }), 3);
assert.equal(formatVesselResultSummary(68, 68, 0), "Showing 68 vessels");
assert.equal(formatVesselResultSummary(18, 68, 3), "Showing 18 of 68 vessels · 3 filters");
assert.equal(formatVesselResultSummary(1, 68, 1), "Showing 1 of 68 vessels · 1 filter");

assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "filters", true)], ["filters"]);
assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "detail", false)], ["fleet", "detail"]);
assert.deepEqual([...nextOpenSurfaces(new Set(["fleet"]), "fleet", false)], []);
assert.match(COMPACT_SURFACE_QUERY, /pointer: coarse/);

for (const id of ["fleetToggle", "layersToggle", "filterToggle", "fleetDrawer", "detailDrawer", "layersPanel", "filterPanel"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
for (const id of ["fleetLayerToggle", "shoreLayerToggle", "clusterLayerToggle", "uncertaintyLayerToggle"]) {
  assert.match(html, new RegExp(`id="${id}"[^>]*type="checkbox"`));
}
assert.match(html, /id="uncertaintyLayerRow"[^>]*hidden/);
assert.match(app, /uncertaintyCount === 0/);
assert.match(app, /setUncertaintyAreasVisible/);
assert.doesNotMatch(html, /Deployment regions|Evidence requiring review|Recent evidence events|Overseas support facilities/);
assert.match(html, /id="filterBadge"[^>]*hidden/);
assert.match(html, /id="resetFilters"[^>]*hidden/);
assert.match(app, /formatVesselResultSummary/);
assert.match(app, /surfaceController\.open\("detail"/);
assert.match(app, /fleetMap\.selectVessel\(vessel, \{ focus: true \}\)/);
assert.match(surfaces, /event\.key === "Escape"/);
assert.match(surfaces, /if \(this\.isCompact\(\)\) next\.clear\(\)/);
assert.match(styles, /prefers-reduced-motion:\s*reduce/);
assert.match(styles, /#fleetMap\s*\{[^}]*z-index:\s*0;/s);
assert.match(styles, /outline:\s*3px solid var\(--accent-strong\)/);
assert.match(details, /\["Snapshot", formatSnapshotDate\(asOfDate\)\]/);
assert.match(details, /this\.primaryMeta\.replaceChildren/);
assert.doesNotMatch(details, /Supporting source|Evidence grade|Confidence score|Analyst note|Retrieval status/i);

console.log("Map-first interface tests passed.");
