import assert from "node:assert/strict";
import fs from "node:fs";

import { validateShoreEstablishments } from "../src/components/ShoreEstablishmentLoader.js";
import { getAvailabilitySummary } from "../src/utils/fleet.js";
import { filterShoreEstablishments, shoreTypes } from "../src/utils/shore.js";

const fleet = JSON.parse(fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"));
const shore = validateShoreEstablishments(
  JSON.parse(fs.readFileSync(new URL("../data/royal-navy/shore-establishments.json", import.meta.url), "utf8")),
);
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const map = fs.readFileSync(new URL("../src/components/FleetMap.js", import.meta.url), "utf8");
const details = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");

assert.equal(shore.establishments.length, 40);
for (const id of [
  "hms-collingwood",
  "hms-sultan",
  "hms-excellent",
  "hmnb-clyde",
  "hmnb-devonport",
  "hmnb-portsmouth",
  "devonport-royal-dockyard",
  "rosyth-royal-dockyard",
]) {
  assert.ok(shore.establishments.some((establishment) => establishment.id === id), `${id} is missing.`);
}
assert.equal(filterShoreEstablishments(shore.establishments, { query: "Collingwood" }).length, 1);
assert.equal(filterShoreEstablishments(shore.establishments, { type: "Naval base" }).length, 3);
assert.equal(filterShoreEstablishments(shore.establishments, { type: "Dockyard" }).length, 2);
assert.ok(filterShoreEstablishments(shore.establishments, { query: "Portsmouth" }).length >= 4);
assert.ok(shoreTypes(shore.establishments).includes("Training establishment"));

const excellent = shore.establishments.find((establishment) => establishment.id === "hms-excellent");
assert.equal(excellent.location, "Whale Island, Portsmouth, England");
assert.deepEqual(excellent.position, {
  lat: 50.8167,
  lon: -1.0969,
  label: "Whale Island locality (representative)",
});
assert.ok(excellent.position.lat >= 50.814 && excellent.position.lat <= 50.82);
assert.ok(excellent.position.lon >= -1.101 && excellent.position.lon <= -1.092);

const availability = getAvailabilitySummary(fleet.vessels);
assert.equal(fleet.vessels.length, 68);
assert.equal(availability.active, 50);
assert.equal(availability.total, 68);
assert.equal(availability.percentage.toFixed(1), "73.5");

assert.match(html, /id="shoreLayerToggle"[^>]*type="checkbox"[^>]*aria-controls="shoreControls"/);
assert.match(html, /id="shoreControls"[^>]*hidden/);
assert.match(html, /id="shoreSearchInput"/);
assert.match(html, /id="shoreTypeFilter"/);
assert.match(app, /filterShoreEstablishments/);
assert.match(app, /fleetMap\.setShoreVisible/);
assert.match(app, /fleetMap\.setClusteringEnabled/);
assert.match(map, /shoreClusterGroup/);
assert.match(map, /selectShoreEstablishment/);
assert.match(details, /renderEstablishment/);
assert.match(details, /createEntry\("Location", establishment\.location\)/);
assert.doesNotMatch(details, /Official source|Broad location/);
assert.doesNotMatch(details, /Illustrated fallback/);
assert.match(details, /establishment\.imageAlt/);
assert.match(details, /establishment\.imageFocalPoint/);
assert.match(details, /Image credit:/);

for (const establishment of shore.establishments) {
  assert.doesNotMatch(
    JSON.stringify({
      role: establishment.role,
      location: establishment.location,
      description: establishment.description,
      position: establishment.position,
    }),
    /telephone|email|postcode|building number/i,
  );
  assert.match(establishment.image, /^\.\/shore\/photos\/.+\.webp$/);
}

console.log("Shore establishment layer, filter, card and denominator tests passed.");
