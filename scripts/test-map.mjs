import assert from "node:assert/strict";
import fs from "node:fs";

import {
  clusterSizeClass,
  hasPlottablePosition,
  mapFitPadding,
  markerClassName,
  plottedVessels,
  shouldStackLayout,
} from "../src/utils/map.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mapComponent = fs.readFileSync(new URL("../src/components/FleetMap.js", import.meta.url), "utf8");

const expectedPlottedVessels = dataset.vessels.filter(
  (vessel) =>
    ["mapped", "approximate"].includes(vessel.locationClassification) ||
    Boolean(vessel.symbolicPosition),
);
assert.deepEqual(
  plottedVessels(dataset.vessels).map((vessel) => vessel.id),
  expectedPlottedVessels.map((vessel) => vessel.id),
);
assert.equal(
  plottedVessels(dataset.vessels).every((vessel) =>
    ["mapped", "approximate", "withheld"].includes(vessel.locationClassification),
  ),
  true,
);
assert.equal(
  dataset.vessels
    .filter((vessel) => vessel.locationClassification === "unknown")
    .every((vessel) => !hasPlottablePosition(vessel)),
  true,
);
assert.equal(
  dataset.vessels
    .filter((vessel) => vessel.locationClassification === "withheld")
    .filter(hasPlottablePosition).length,
  1,
);

const middleton = dataset.vessels.find((vessel) => vessel.id === "hms-middleton");
assert.equal(middleton.status, "In re-fit");
assert.equal(middleton.locationClassification, "approximate");
assert.deepEqual(middleton.position, {
  lat: 50.1537,
  lon: -5.0563,
  label: "Balaena Falmouth yard (representative)",
});
assert.notDeepEqual(middleton.position, {
  lat: 55,
  lon: 1,
  label: "North Sea leg of UK coastal patrol circuit (representative)",
});

const tideforce = dataset.vessels.find((vessel) => vessel.id === "rfa-tideforce");
if (/North Sea/i.test(tideforce.lastReportedLocation)) {
  assert.ok(
    tideforce.position.lat >= 53 &&
      tideforce.position.lat <= 59 &&
      tideforce.position.lon >= 0.5 &&
      tideforce.position.lon <= 5,
    "RFA Tideforce's representative monitoring marker must remain in the North Sea.",
  );
}

const chiddingfold = dataset.vessels.find((vessel) => vessel.id === "hms-chiddingfold");
assert.equal(
  chiddingfold.lastReportedLocation,
  "HMNB Portsmouth; historical arrival reported 5 April 2025",
);
assert.equal(dataset.vessels.every((vessel) => !Object.hasOwn(vessel, "source")), true);
assert.deepEqual(chiddingfold.position, {
  lat: 50.8,
  lon: -1.11,
  label: "HMNB Portsmouth (representative)",
});

const plotted = plottedVessels(dataset.vessels)[0];
assert.match(markerClassName(plotted, plotted.id), /is-selected/);
assert.doesNotMatch(markerClassName(plotted, "another-id"), /is-selected/);
assert.equal(clusterSizeClass(9), "fleet-cluster--small");
assert.equal(clusterSizeClass(10), "fleet-cluster--medium");
assert.equal(clusterSizeClass(20), "fleet-cluster--large");
assert.deepEqual(mapFitPadding(390), [24, 24]);
assert.deepEqual(mapFitPadding(620), [24, 24]);
assert.deepEqual(mapFitPadding(621), [34, 34]);

for (const width of [768, 820, 834, 1024]) {
  assert.equal(shouldStackLayout(width, 1366), true);
}
for (const width of [1024, 1080, 1180, 1366]) {
  assert.equal(shouldStackLayout(width, 768), false);
}
assert.equal(shouldStackLayout(700, 400), true);
assert.equal(shouldStackLayout(1280, 720), false);

const plottedLongitudes = plottedVessels(dataset.vessels).map(
  (vessel) => (vessel.position || vessel.symbolicPosition).lon,
);
const plottedLatitudes = plottedVessels(dataset.vessels).map(
  (vessel) => (vessel.position || vessel.symbolicPosition).lat,
);
const fleetWidthAtZoomZero =
  ((Math.max(...plottedLongitudes) - Math.min(...plottedLongitudes)) / 360) * 256;
const fleetHeightAtZoomZero =
  Math.abs(mercatorY(Math.max(...plottedLatitudes)) - mercatorY(Math.min(...plottedLatitudes))) *
  256;
const zoomZeroWidth = fleetWidthAtZoomZero + 68;
const zoomZeroHeight = fleetHeightAtZoomZero + 68;
assert.ok(zoomZeroWidth <= 320, "The full fleet must fit the minimum supported width.");
assert.ok(zoomZeroHeight <= 500, "The full fleet must fit the minimum map height.");

const mobileWidth = 390;
const mobileHeight = 844 * 0.58;
const [mobilePadding] = mapFitPadding(mobileWidth);
const mobileScale = Math.min(
  (mobileWidth - mobilePadding * 2) / fleetWidthAtZoomZero,
  (mobileHeight - mobilePadding * 2) / fleetHeightAtZoomZero,
);
const snappedMobileZoom = Math.floor(Math.log2(mobileScale) / 0.1) * 0.1;
const mobileWorldHeight = 256 * 2 ** snappedMobileZoom;
const unusedMobileMapRatio = Math.max(0, mobileHeight - mobileWorldHeight) / mobileHeight;
assert.ok(
  unusedMobileMapRatio < 0.1,
  "The 390×844 fleet overview must not leave large vertical basemap bands.",
);

assert.match(html, /id="fleetMap" role="region"/);
assert.match(html, /id="resetMap"/);
assert.match(html, /id="mapNotice"[\s\S]*role="status"/);
assert.match(styles, /min-height:\s*44px/);
assert.match(styles, /max-width:\s*1100px\)\s+and\s+\(orientation:\s*portrait/);
assert.match(styles, /max-width:\s*700px/);
assert.match(styles, /prefers-reduced-motion:\s*reduce/);
assert.match(mapComponent, /spiderfyOnMaxZoom:\s*true/);
assert.match(mapComponent, /zoomToBoundsOnClick:\s*true/);
assert.match(mapComponent, /minZoom:\s*0/);
assert.match(mapComponent, /zoomSnap:\s*0\.1/);
assert.match(mapComponent, /padding:\s*mapFitPadding\(this\.container\.clientWidth\)/);
assert.match(mapComponent, /iconSize:\s*\[44,\s*44\]/);
assert.match(mapComponent, /withheld:\s*"withheld symbolic"/);
assert.match(mapComponent, /this\.tiles\.on\("loading"/);
assert.match(mapComponent, /tileerror/);
assert.match(mapComponent, /this\.tiles\.on\("load"/);
assert.match(mapComponent, /#hideTileNotice/);
assert.match(mapComponent, /https:\/\/tile\.openstreetmap\.org/);
assert.match(mapComponent, /OpenStreetMap/);

console.log("Fleet map tests passed.");

function mercatorY(latitude) {
  const sine = Math.sin((latitude * Math.PI) / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}
