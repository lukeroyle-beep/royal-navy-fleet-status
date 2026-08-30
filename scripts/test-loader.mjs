import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";
import { publicAssetUrl } from "../src/utils/assetUrl.js";
import {
  formatMapDisplay,
  formatLocationPrecision,
  formatLocationState,
} from "../src/components/EventDetailsPanel.js";
import {
  getActiveFleetSummary,
  getAvailabilityBand,
  getAvailabilitySummary,
  getFleetStatusSummary,
} from "../src/utils/fleet.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const precisionFixtures = JSON.parse(
  fs.readFileSync(new URL("./fixtures/location-precision.json", import.meta.url), "utf8"),
);
const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const detailsPanel = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.equal(publicAssetUrl("data/royal-navy/vessels.json", "/"), "/data/royal-navy/vessels.json");
assert.equal(
  publicAssetUrl("/data/royal-navy/vessels.json", "/royal-navy-fleet-status/"),
  "/royal-navy-fleet-status/data/royal-navy/vessels.json",
);

assert.match(page, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.doesNotMatch(page, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);
assert.equal(validateFleet(dataset).vessels.length, 68);
assert.equal(
  dataset.vessels.filter(
    (vessel) => ["mapped", "approximate", "withheld"].includes(vessel.locationClassification),
  ).length,
  68,
);
assert.equal(dataset.vessels.filter((vessel) => vessel.locationClassification === "unknown").length, 0);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);
assert.equal(formatLocationState("confirmed"), "Confirmed public location");
assert.equal(formatLocationState("last_reported"), "Last publicly reported location");
assert.equal(formatLocationState("unconfirmed"), "Location unconfirmed");
assert.equal(formatLocationState("no_recent_information"), "No recent public information");
assert.equal(formatLocationState("withheld"), "Location not published");
assert.equal(formatLocationPrecision("region"), "Approximate region");

const pointMappedVessel = dataset.vessels.find((vessel) => vessel.position);
const regionalVessel = dataset.vessels.find((vessel) => vessel.locationPrecision === "region");
const listOnlyVessel = dataset.vessels.find((vessel) => vessel.locationPrecision === "none");
assert.equal(
  formatMapDisplay(pointMappedVessel),
  "Point-mapped record — marker shown when fleet layer is enabled",
);
assert.equal(formatMapDisplay(regionalVessel), "Regional record — no point marker shown");
assert.equal(formatMapDisplay(listOnlyVessel), "List-only record — no point marker shown");

const allPrecisionStates = createFixtureDataset(precisionFixtures.stateCases);
assert.equal(validateFleet(allPrecisionStates).vessels.length, precisionFixtures.stateCases.length);

const activeFleet = getActiveFleetSummary(dataset.vessels);
assert.equal(activeFleet.total, 50);
assert.equal(activeFleet.percentage.toFixed(1), "73.5");
const fleetAvailability = getAvailabilitySummary(dataset.vessels);
assert.equal(fleetAvailability.active, 50);
assert.equal(fleetAvailability.total, 68);
assert.equal(fleetAvailability.percentage.toFixed(1), "73.5");
assert.equal(getAvailabilityBand(0), "low");
assert.equal(getAvailabilityBand(33), "low");
assert.equal(getAvailabilityBand(34), "medium");
assert.equal(getAvailabilityBand(66), "medium");
assert.equal(getAvailabilityBand(67), "high");
assert.equal(getAvailabilityBand(100), "high");
assert.deepEqual(getFleetStatusSummary(dataset.vessels), {
  total: 68,
  deployed: 17,
  inRefit: 13,
  unknown: 4,
});

const type23Availability = getAvailabilitySummary(
  dataset.vessels.filter((vessel) => vessel.vesselClass === "Type 23 / Duke class"),
);
assert.deepEqual(type23Availability, {
  active: 2,
  total: 5,
  percentage: (2 / 5) * 100,
  byStatus: {
    Available: 2,
    "In re-fit": 3,
  },
});

const huntAvailability = getAvailabilitySummary(
  dataset.vessels.filter((vessel) => vessel.vesselClass === "Hunt class"),
);
assert.deepEqual(huntAvailability, {
  active: 4,
  total: 5,
  percentage: (4 / 5) * 100,
  byStatus: {
    Available: 3,
    "In re-fit": 1,
    Deployed: 1,
  },
});

const duncan = dataset.vessels.find((vessel) => vessel.id === "hms-duncan");
assert.equal(duncan.status, "Deployed");
assert.match(duncan.lastReportedLocation, /Copenhagen, Denmark/);
for (const retiredId of ["hms-richmond", "hms-iron-duke", "hms-chiddingfold"]) {
  assert.equal(dataset.vessels.some((vessel) => vessel.id === retiredId), false);
}
const hurworth = dataset.vessels.find((vessel) => vessel.id === "hms-hurworth");
assert.equal(hurworth.status, "Deployed");
assert.match(hurworth.lastReportedLocation, /departing observed 12 August 2026/);

const victory = dataset.vessels.find((vessel) => vessel.id === "hms-victory");
assert.equal(victory.locationClassification, "mapped");
assert.deepEqual(victory.position, {
  lat: 50.8,
  lon: -1.11,
  label: "HMS Victory, Portsmouth Historic Dockyard",
});
assert.equal(victory.locationState, "confirmed");
assert.equal(victory.locationPrecision, "port");
for (const field of ["source", "evidenceCheckedDate", "locationEvidenceDate", "evidenceClassification"]) {
  assert.equal(Object.hasOwn(victory, field), false, `Public record must not expose ${field}.`);
}
assert.doesNotMatch(detailsPanel, /Supporting source|vessel\.source|Location evidence date|Evidence freshness/i);
assert.doesNotMatch(styles, /\.source-link/);

const unknownWithCoordinates = structuredClone(dataset);
const unknown = unknownWithCoordinates.vessels.find((vessel) => vessel.position);
unknown.locationClassification = "unknown";
unknown.locationState = "unconfirmed";
unknown.locationPrecision = "none";
unknown.publicLocationLabel = "Location unconfirmed";
unknown.position = { lat: 0, lon: 0, label: "Invalid inferred point" };
unknown.uncertaintyArea = null;
assert.throws(() => validateFleet(unknownWithCoordinates), /must not contain point coordinates/i);

const excessiveCityCoordinates = createFixtureDataset([
  {
    ...precisionFixtures.stateCases.find((fixture) => fixture.caseId === "confirmed-city"),
    position: { lat: 55.704, lon: 12.596, label: "Copenhagen, Denmark" },
  },
]);
assert.throws(() => validateFleet(excessiveCityCoordinates), /excessive coordinate precision/i);

const atSeaPoint = createFixtureDataset([
  {
    ...precisionFixtures.stateCases.find((fixture) => fixture.caseId === "location-unconfirmed"),
    lastReportedLocation: "At sea; location unconfirmed",
    position: { lat: 51, lon: -2, label: "Invented at-sea point" },
  },
]);
assert.throws(() => validateFleet(atSeaPoint), /must not contain point coordinates/i);

const accidentallyExposedSource = structuredClone(dataset);
accidentallyExposedSource.vessels[0].source = { label: "Must stay internal", url: "https://example.invalid" };
assert.throws(() => validateFleet(accidentallyExposedSource), /exposes internal provenance field source/i);

const invalidDatasetDate = structuredClone(dataset);
invalidDatasetDate.metadata.asOfDate = "2026-02-30";
assert.throws(() => validateFleet(invalidDatasetDate), /invalid dataset date/i);

const revisionedDataset = structuredClone(dataset);
revisionedDataset.metadata.releaseRevision = 2;
revisionedDataset.metadata.releasedAt = "2026-08-23T20:15:00+01:00";
assert.equal(validateFleet(revisionedDataset).metadata.releaseRevision, 2);

const invalidReleaseRevision = structuredClone(revisionedDataset);
invalidReleaseRevision.metadata.releaseRevision = 0;
assert.throws(() => validateFleet(invalidReleaseRevision), /positive releaseRevision/i);

const invalidReleasedAt = structuredClone(revisionedDataset);
invalidReleasedAt.metadata.releasedAt = "2026-08-23";
assert.throws(() => validateFleet(invalidReleasedAt), /ISO releasedAt instant/i);

const incompleteReleaseMetadata = structuredClone(dataset);
incompleteReleaseMetadata.metadata.releaseRevision = 2;
delete incompleteReleaseMetadata.metadata.releasedAt;
assert.throws(() => validateFleet(incompleteReleaseMetadata), /releaseRevision.*releasedAt/i);

const invalidOperationalStatus = structuredClone(dataset);
invalidOperationalStatus.vessels[0].status = "Ready-ish";
assert.throws(() => validateFleet(invalidOperationalStatus), /invalid operational status/i);

const whitespaceClass = structuredClone(dataset);
whitespaceClass.vessels[0].vesselClass = `${whitespaceClass.vessels[0].vesselClass} `;
assert.throws(() => validateFleet(whitespaceClass), /non-canonical vessel class/i);

const hiddenCharacterClass = structuredClone(dataset);
hiddenCharacterClass.vessels[0].vesselClass = `First\u200Brate`;
assert.throws(() => validateFleet(hiddenCharacterClass), /non-canonical vessel class/i);

const inconsistentClass = structuredClone(dataset);
const repeatedClass = inconsistentClass.vessels.find(
  (vessel, index) =>
    inconsistentClass.vessels.findIndex((candidate) => candidate.vesselClass === vessel.vesselClass) !==
    index,
);
repeatedClass.vesselClass = repeatedClass.vesselClass.toLocaleLowerCase("en-GB");
assert.throws(() => validateFleet(inconsistentClass), /inconsistent vessel class names/i);

const submarinePatrol = structuredClone(dataset);
const submarine = submarinePatrol.vessels.find((vessel) => vessel.vesselType === "SSBN");
submarine.locationClassification = "approximate";
submarine.locationState = "last_reported";
submarine.locationPrecision = "city";
submarine.publicLocationLabel = "North Atlantic";
submarine.lastReportedLocation = "North Atlantic";
submarine.position = { lat: 0, lon: 0, label: "North Atlantic" };
submarine.uncertaintyArea = null;
assert.throws(
  () => validateFleet(submarinePatrol),
  /cannot expose submarine patrol or regional geometry/i,
);

const vanguard = dataset.vessels.find((vessel) => vessel.id === "hms-vanguard");
assert.equal(vanguard.lastReportedLocation, "HMNB Clyde (Faslane); returned 12 June 2026");
assert.equal(vanguard.symbolicPosition, undefined);

const vengeance = dataset.vessels.find((vessel) => vessel.id === "hms-vengeance");
assert.equal(vengeance.status, "Deployed");
assert.equal(vengeance.lastReportedLocation, "On patrol - classified");
assert.equal(vengeance.locationState, "withheld");
assert.equal(vengeance.locationPrecision, "none");
assert.equal(vengeance.position, null);
assert.equal(vengeance.uncertaintyArea, null);
assert.equal(Object.hasOwn(vengeance, "symbolicPosition"), false);
assert.equal(Object.hasOwn(vengeance, "unmappedReason"), false);

const vigilant = dataset.vessels.find((vessel) => vessel.id === "hms-vigilant");
assert.equal(vigilant.status, "Unknown");
assert.equal(vigilant.symbolicPosition, undefined);
assert.equal(vigilant.lastReportedLocation, "HMNB Clyde (Faslane); last directly reported 10 October 2025");
assert.equal(vigilant.position.label, "HMNB Clyde (Faslane)");

assert.equal(dataset.vessels.some((vessel) => vessel.id === "hms-valiant"), false);

console.log("Fleet loader tests passed.");

function createFixtureDataset(cases) {
  return {
    metadata: structuredClone(dataset.metadata),
    vessels: cases.map((fixture, index) => {
      const { caseId: _caseId, ...location } = structuredClone(fixture);
      return {
        id: `precision-fixture-${index + 1}`,
        name: `Precision fixture ${index + 1}`,
        service: "Royal Navy",
        vesselClass: "Test class",
        vesselType: "Destroyer",
        pennantNumber: `T${index + 1}`,
        commissionedDate: "2026",
        homePort: "Not applicable",
        status: "Available",
        ...location,
      };
    }),
  };
}
