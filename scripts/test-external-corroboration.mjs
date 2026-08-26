import assert from "node:assert/strict";
import fs from "node:fs";

import {
  aisConnectionState,
  assertPublicTransitionHasIndependentEvidence,
  createAisAdapterConfiguration,
  evaluateAisCandidate,
  evaluateCopernicusCandidate,
  externalCorroborationFlags,
  validateAisPositionReport,
} from "./lib/external-corroboration.mjs";

const boxes = [[[49, -7], [61, 3]]];
const surfaceVessel = { vesselId: "hms-example", vesselType: "Destroyer" };
const submarine = { vesselId: "hms-secret", vesselType: "SSN" };
const registry = [
  { ...surfaceVessel, mmsi: "232000001" },
  { ...submarine, mmsi: "232000002" },
];

assert.deepEqual(externalCorroborationFlags({}), { ais: false, copernicus: false });
const disabled = createAisAdapterConfiguration({ environment: {}, mmsiRegistry: registry, boundingBoxes: boxes });
assert.equal(disabled.enabled, false);
assert.equal(disabled.publicationEligible, false);
assert.throws(
  () => createAisAdapterConfiguration({
    environment: { RNFS_ENABLE_AIS: "1" },
    mmsiRegistry: registry,
    boundingBoxes: boxes,
  }),
  /requires AISSTREAM_API_KEY/i,
);
const configured = createAisAdapterConfiguration({
  environment: { RNFS_ENABLE_AIS: "1", AISSTREAM_API_KEY: "secret-key-never-serialised" },
  mmsiRegistry: registry,
  boundingBoxes: boxes,
});
assert.equal(configured.enabled, true);
assert.equal(configured.vesselCount, 1, "Submarine MMSIs must not enter subscriptions.");
assert.equal(JSON.stringify(configured).includes("secret-key-never-serialised"), false);
const wire = configured.createWireSubscription();
assert.equal(wire.APIKey, "secret-key-never-serialised");
assert.deepEqual(wire.FiltersShipMMSI, ["232000001"]);

const accepted = validateAisPositionReport({
  mmsi: "232000001",
  latitude: 50.8,
  longitude: -1.1,
  reportedAt: "2026-08-26T11:59:00Z",
}, {
  receivedAt: "2026-08-26T12:00:00Z",
  asOf: "2026-08-26T12:00:00Z",
  boundingBoxes: boxes,
});
assert.equal(accepted.accepted, true);
assert.equal(accepted.freshness, "live");
assert.notEqual(accepted.reportTime, accepted.receivedAt);
for (const [overrides, expectedReason] of [
  [{ latitude: 91 }, "invalid-coordinates"],
  [{ reportedAt: "2026-08-26T10:00:00Z" }, "stale-report"],
  [{ latitude: 10, longitude: 10 }, "outside-bounding-box"],
]) {
  const result = validateAisPositionReport({
    latitude: 50.8,
    longitude: -1.1,
    reportedAt: "2026-08-26T11:59:00Z",
    ...overrides,
  }, {
    receivedAt: "2026-08-26T12:00:00Z",
    asOf: "2026-08-26T12:00:00Z",
    boundingBoxes: boxes,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, expectedReason);
}
const outOfOrder = validateAisPositionReport({
  latitude: 50.8,
  longitude: -1.1,
  reportedAt: "2026-08-26T11:58:00Z",
}, {
  receivedAt: "2026-08-26T12:00:00Z",
  asOf: "2026-08-26T12:00:00Z",
  previousReport: { latitude: 50.8, longitude: -1.1, reportedAt: "2026-08-26T11:59:00Z" },
  boundingBoxes: boxes,
});
assert.equal(outOfOrder.reason, "out-of-order");
const jump = validateAisPositionReport({
  latitude: 58,
  longitude: 2,
  reportedAt: "2026-08-26T11:59:00Z",
}, {
  receivedAt: "2026-08-26T12:00:00Z",
  asOf: "2026-08-26T12:00:00Z",
  previousReport: { latitude: 50.8, longitude: -1.1, reportedAt: "2026-08-26T11:58:00Z" },
  boundingBoxes: boxes,
});
assert.equal(jump.reason, "implausible-jump");

const disconnected = aisConnectionState({ connected: false, asOf: "2026-08-26T12:00:00Z" });
assert.equal(disconnected.state, "unavailable");
assert.equal(disconnected.absenceEvidence, false);
assert.equal(evaluateAisCandidate({ vessel: submarine, validation: accepted }).state, "rejected");
assert.equal(
  evaluateAisCandidate({
    vessel: surfaceVessel,
    validation: accepted,
    strongerOfficialEvidence: { evidenceId: "official-one" },
  }).reason,
  "stronger-official-evidence-retained",
);

const satelliteDisabled = evaluateCopernicusCandidate({
  enabled: false,
  vessel: surfaceVessel,
  observation: {},
  knownPorts: [],
});
assert.equal(satelliteDisabled.state, "disabled");
const satelliteOnly = evaluateCopernicusCandidate({
  enabled: true,
  vessel: surfaceVessel,
  observation: {
    portId: "portsmouth",
    capturedAt: "2026-08-25T10:00:00Z",
    cloudCoverPercent: 65,
    resolutionMetres: 60,
  },
  knownPorts: [{ portId: "portsmouth" }],
});
assert.equal(satelliteOnly.state, "insufficient-support");
assert.ok(satelliteOnly.limitations.includes("cloud-obscuration"));
assert.ok(satelliteOnly.limitations.includes("insufficient-resolution"));
assert.equal(satelliteOnly.publicationEligible, false);
const satelliteCorroborated = evaluateCopernicusCandidate({
  enabled: true,
  vessel: surfaceVessel,
  observation: {
    portId: "portsmouth",
    capturedAt: "2026-08-25T10:00:00Z",
    cloudCoverPercent: 5,
    resolutionMetres: 10,
  },
  knownPorts: [{ portId: "portsmouth" }],
  independentEvidenceIds: ["official-one"],
});
assert.equal(satelliteCorroborated.state, "requires-human-review");
assert.equal(satelliteCorroborated.publicationEligible, false);

assert.throws(
  () => assertPublicTransitionHasIndependentEvidence([
    { sourceType: "ais", humanReviewed: true },
    { sourceType: "satellite", humanReviewed: true },
  ]),
  /cannot trigger a public transition/i,
);
assert.throws(
  () => assertPublicTransitionHasIndependentEvidence([
    { sourceType: "official", humanReviewed: false },
  ]),
  /human review/i,
);
assert.equal(
  assertPublicTransitionHasIndependentEvidence([
    { sourceType: "official", humanReviewed: true },
    { sourceType: "ais", humanReviewed: true },
  ]),
  true,
);

const publicEntry = [
  fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  ...walk(new URL("../src/", import.meta.url)).map((file) => fs.readFileSync(file, "utf8")),
].join("\n");
for (const token of ["AISSTREAM_API_KEY", "RNFS_ENABLE_AIS", "RNFS_ENABLE_COPERNICUS"]) {
  assert.equal(publicEntry.includes(token), false, `${token} entered the public application graph.`);
}

console.log("Disabled AIS and Copernicus corroboration safety tests passed.");

function walk(url) {
  return fs.readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
    return entry.isDirectory() ? walk(child) : [child];
  });
}
