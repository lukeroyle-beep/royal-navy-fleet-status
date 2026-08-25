import assert from "node:assert/strict";
import fs from "node:fs";

import {
  clusterSizeClass,
  getMapFocusPosition,
  getMapPosition,
  getUncertaintyArea,
  hasPlottablePosition,
  mapFitPadding,
  markerClassName,
  plottedVessels,
  shouldStackLayout,
} from "../src/utils/map.js";
import { MapStartupViewGate } from "../src/utils/mapStartup.js";
import { projectPublicVessel } from "./lib/public-projection.mjs";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const precisionFixtures = JSON.parse(
  fs.readFileSync(new URL("./fixtures/location-precision.json", import.meta.url), "utf8"),
);
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mapComponent = fs.readFileSync(new URL("../src/components/FleetMap.js", import.meta.url), "utf8");

const expectedPlottedVessels = dataset.vessels.filter(
  (vessel) => Boolean(vessel.position || vessel.uncertaintyArea),
);
assert.deepEqual(
  plottedVessels(dataset.vessels).map((vessel) => vessel.id),
  expectedPlottedVessels.map((vessel) => vessel.id),
);
assert.equal(
  plottedVessels(dataset.vessels).every((vessel) =>
    ["port", "city", "region"].includes(vessel.locationPrecision),
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
  dataset.vessels.filter((vessel) => vessel.locationClassification === "withheld").filter(hasPlottablePosition).length,
  0,
);
assert.equal(
  dataset.vessels
    .filter((vessel) => vessel.locationPrecision === "region")
    .every((vessel) => !getMapPosition(vessel) && Boolean(getUncertaintyArea(vessel))),
  true,
);
assert.equal(
  dataset.vessels
    .filter((vessel) => ["port", "city"].includes(vessel.locationPrecision))
    .every((vessel) => Boolean(getMapPosition(vessel)) && !getUncertaintyArea(vessel)),
  true,
);

const middleton = dataset.vessels.find((vessel) => vessel.id === "hms-middleton");
assert.equal(middleton.status, "In re-fit");
assert.equal(middleton.locationClassification, "approximate");
assert.equal(middleton.locationPrecision, "port");
assert.deepEqual(middleton.position, {
  lat: 50.15,
  lon: -5.06,
  label: "Balaena Falmouth yard",
});
assert.notDeepEqual(middleton.position, {
  lat: 55,
  lon: 1,
  label: "North Sea leg of UK coastal patrol circuit (representative)",
});

const scott = dataset.vessels.find((vessel) => vessel.id === "hms-scott");
const tidespring = dataset.vessels.find((vessel) => vessel.id === "rfa-tidespring");
assert.deepEqual(getMapPosition(scott), {
  lat: 36.14,
  lon: -5.36,
  label: "Gibraltar harbour",
});
assert.deepEqual(getMapPosition(tidespring), {
  lat: 36.14,
  lon: -5.36,
  label: "Gibraltar harbour",
});
assert.deepEqual(getMapPosition(scott), getMapPosition(tidespring));

for (const regression of precisionFixtures.missedEvidenceRegressions) {
  const vessel = projectPrecisionFixture(regression);
  assert.equal(vessel.locationState, regression.expectedState);
  assert.equal(vessel.locationPrecision, regression.expectedPrecision);
  assert.equal(vessel.publicLocationLabel, regression.expectedLabel);
  assert.equal(hasPlottablePosition(vessel), true, `${regression.caseId} must remain visibly represented.`);
  if (regression.mustNotUsePoint) {
    assert.equal(getMapPosition(vessel), null, `${regression.caseId} must not use a fabricated point.`);
    assert.ok(getUncertaintyArea(vessel), `${regression.caseId} must use regional representation.`);
  }
  if (regression.mustUsePoint) {
    assert.ok(getMapPosition(vessel), `${regression.caseId} must retain its rounded point.`);
    assert.equal(getUncertaintyArea(vessel), null);
  }
  if (regression.mustNotClaimBerth) {
    assert.ok(getMapPosition(vessel), `${regression.caseId} must use its bounded city-level point.`);
    assert.doesNotMatch(vessel.publicLocationLabel, /berth|dock/i);
  }
  if (regression.mustNotClaimPreviousCity) {
    assert.doesNotMatch(vessel.publicLocationLabel, /Copenhagen/i);
  }
}

const regionalGeometryGroups = new Map();
for (const vessel of dataset.vessels.filter((candidate) => candidate.uncertaintyArea)) {
  const area = vessel.uncertaintyArea;
  const key = `${area.centre.lat}|${area.centre.lon}|${area.radiusKm}`;
  regionalGeometryGroups.set(key, [...(regionalGeometryGroups.get(key) || []), vessel.id]);
}
assert.ok(
  [...regionalGeometryGroups.values()].some((vesselIds) => vesselIds.length > 1),
  "The current regression dataset must exercise co-located regional areas.",
);

const withheldFixture = precisionFixtures.stateCases.find((fixture) => fixture.caseId === "withheld-submarine");
assert.equal(hasPlottablePosition(withheldFixture), false);
assert.equal(getMapFocusPosition(withheldFixture), null);
const regionFixture = precisionFixtures.stateCases.find((fixture) => fixture.caseId === "last-reported-region");
assert.deepEqual(getMapFocusPosition(regionFixture), {
  lat: 50.34,
  lon: -4.15,
  label: "Plymouth Sound",
});
for (const fixture of precisionFixtures.stateCases) {
  const shouldPlot = fixture.locationPrecision !== "none";
  assert.equal(hasPlottablePosition(fixture), shouldPlot, `${fixture.caseId} has the wrong selection target.`);
  if (fixture.locationPrecision === "region") {
    assert.equal(getMapPosition(fixture), null);
    assert.ok(getUncertaintyArea(fixture));
  } else if (["port", "city"].includes(fixture.locationPrecision)) {
    assert.deepEqual(getMapFocusPosition(fixture), fixture.position);
  } else {
    assert.equal(getMapFocusPosition(fixture), null);
  }
}

assert.equal(dataset.vessels.every((vessel) => !Object.hasOwn(vessel, "source")), true);
for (const retiredId of ["hms-richmond", "hms-iron-duke", "hms-chiddingfold"]) {
  assert.equal(dataset.vessels.some((vessel) => vessel.id === retiredId), false);
}

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
  (vessel) => getMapFocusPosition(vessel).lon,
);
const plottedLatitudes = plottedVessels(dataset.vessels).map(
  (vessel) => getMapFocusPosition(vessel).lat,
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
assert.match(mapComponent, /getView\(\)/);
assert.match(mapComponent, /setView\(\{ centre, zoom \}/);
assert.match(mapComponent, /completeStartupView\(view\)/);
assert.match(mapComponent, /this\.map\.stop\(\)/);
assert.match(mapComponent, /if \(this\.startupViewGate\.ready\) this\.onViewChange/);
assert.match(mapComponent, /this\.map\.on\("moveend"/);
assert.match(mapComponent, /iconSize:\s*\[44,\s*44\]/);
assert.match(mapComponent, /L\.circle/);
assert.match(mapComponent, /Approximate region, not a live position/);
assert.match(mapComponent, /fitBounds\(area\.getBounds\(\)/);
assert.match(mapComponent, /element\.setAttribute\("tabindex", "0"\)/);
assert.match(mapComponent, /event\.key !== "Enter" && event\.key !== " "/);
assert.match(mapComponent, /groupedUncertaintyAreas/);
assert.match(mapComponent, /fleet-region-picker-content/);
assert.match(mapComponent, /activate to choose a vessel/);
assert.doesNotMatch(mapComponent, /symbolicPosition|withheld symbolic/);
assert.match(mapComponent, /this\.tiles\.on\("loading"/);
assert.match(mapComponent, /tileerror/);
assert.match(mapComponent, /this\.tiles\.on\("load"/);
assert.match(mapComponent, /#hideTileNotice/);
assert.match(mapComponent, /https:\/\/tile\.openstreetmap\.org/);
assert.match(mapComponent, /OpenStreetMap/);

const startupGate = new MapStartupViewGate();
const startupEvents = [];
assert.equal(startupGate.ready, false);
assert.equal(
  startupGate.runAutomaticFit(() => startupEvents.push("premature-auto-fit")),
  false,
);
startupGate.complete(() => {
  assert.equal(startupGate.ready, false, "Startup move events must remain suppressed while applying.");
  startupEvents.push("restored-view:-51.7,-57.5,5");
});
assert.deepEqual(startupEvents, ["restored-view:-51.7,-57.5,5"]);
assert.equal(startupGate.ready, true);
assert.equal(
  startupGate.runAutomaticFit(() => startupEvents.push("later-user-auto-fit")),
  true,
);
assert.deepEqual(startupEvents, [
  "restored-view:-51.7,-57.5,5",
  "later-user-auto-fit",
]);
assert.throws(() => startupGate.complete(() => {}), /already been completed/i);

console.log("Fleet map tests passed.");

function mercatorY(latitude) {
  const sine = Math.sin((latitude * Math.PI) / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}

function projectPrecisionFixture(fixture) {
  return projectPublicVessel(
    {
      vesselId: fixture.vesselId,
      name: fixture.vesselName,
      service: fixture.vesselName.startsWith("RFA ") ? "Royal Fleet Auxiliary" : "Royal Navy",
      vesselClass: "Regression fixture",
      vesselType: fixture.vesselType,
      pennantNumber: null,
      commissionedDate: null,
      homePort: null,
    },
    {
      freshness: { state: fixture.freshnessState },
      assessedState: {
        status: fixture.status,
        locationClassification: fixture.locationClassification,
        lastReportedLocation: fixture.report,
        position: structuredClone(fixture.position),
        publicLocation: structuredClone(fixture.publicLocation),
      },
    },
  );
}
