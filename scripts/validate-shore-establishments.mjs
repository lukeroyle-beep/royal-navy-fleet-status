import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

import { validateShoreEstablishments } from "../src/components/ShoreEstablishmentLoader.js";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const publicPath = new URL("../data/royal-navy/shore-establishments.json", import.meta.url);
const dataset = validateShoreEstablishments(JSON.parse(fs.readFileSync(publicPath, "utf8")));
const provenance = resolvePrivateInputs().readJson("shoreEstablishments");

const expectedIds = [
  "brnc-dartmouth",
  "ctcrm-lympstone",
  "devonport-royal-dockyard",
  "hmnb-clyde",
  "hmnb-devonport",
  "hmnb-portsmouth",
  "hms-caledonia",
  "hms-calliope",
  "hms-cambria",
  "hms-collingwood",
  "hms-dalriada",
  "hms-drake",
  "hms-eaglet",
  "hms-excellent",
  "hms-ferret",
  "hms-flying-fox",
  "hms-forward",
  "hms-hibernia",
  "hms-king-alfred",
  "hms-nelson",
  "hms-neptune",
  "hms-pegasus",
  "hms-president",
  "hms-raleigh",
  "hms-scotia",
  "hms-sherwood",
  "hms-sultan",
  "hms-temeraire",
  "hms-vivid",
  "hms-wildfire",
  "institute-naval-medicine",
  "rm-bickleigh",
  "rm-chivenor",
  "rm-condor",
  "rm-norton-manor",
  "rm-stonehouse",
  "rm-tamar",
  "rnas-culdrose",
  "rnas-yeovilton",
  "rosyth-royal-dockyard",
].sort();

assert.deepEqual(
  dataset.establishments.map((establishment) => establishment.id).sort(),
  expectedIds,
  "The governed shore-establishment roster changed without an explicit completeness review.",
);
assert.equal(provenance.schemaVersion, "1.0.0");
assert.ok(provenance.scopePolicy.included.some((entry) => /dockyard/i.test(entry)));
assert.ok(provenance.scopePolicy.excluded.some((entry) => /Sea Cadet/i.test(entry)));
assert.ok(provenance.scopePolicy.caveats.some((entry) => /HMS Gannet/i.test(entry)));

const excellentCoordinate = provenance.coordinateDecisions?.find(
  (decision) => decision.establishmentId === "hms-excellent",
);
assert.deepEqual(excellentCoordinate?.position, {
  lat: 50.8167,
  lon: -1.0969,
  label: "Whale Island locality (representative)",
});
assert.equal(
  excellentCoordinate?.sourceUrl,
  "https://www.royalnavy.mod.uk/locations-and-operations/bases-and-stations/hms-excellent",
);
assert.match(excellentCoordinate?.publicMapReference ?? "", /^https:\/\/www\.openstreetmap\.org\//);
assert.match(excellentCoordinate?.basis ?? "", /broad island-centre locality/i);
assert.match(excellentCoordinate?.basis ?? "", /avoids an entrance/i);

const approvedHosts = new Set([
  "www.royalnavy.mod.uk",
  "cd.royalnavy.mod.uk",
  "www.gov.uk",
]);
assert.equal(provenance.imageAssets.length, 40, "Every shore record needs one governed photo.");
const imageAssets = new Map(
  provenance.imageAssets.map((asset) => [asset.establishmentId, asset]),
);
assert.equal(imageAssets.size, 40, "Shore photo provenance contains duplicate records.");
const imagePaths = new Set();
const imageHashes = new Set();
for (const establishment of dataset.establishments) {
  assert.ok(approvedHosts.has(new URL(establishment.source.url).hostname));
  assert.match(establishment.position.label, /representative/i);
  assert.doesNotMatch(establishment.location, /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);
  const repositoryPath = `public/${establishment.image.replace(/^\.\//, "")}`;
  const asset = imageAssets.get(establishment.id);
  assert.equal(asset?.assetPath, repositoryPath, `${establishment.name} image lacks internal provenance.`);
  for (const field of [
    "sourcePageUrl",
    "creator",
    "credit",
    "license",
    "licenseUrl",
    "retrievedAt",
    "matchRationale",
    "alt",
    "focalPoint",
    "sha256",
  ]) {
    assert.equal(typeof asset[field], "string", `${establishment.name} photo is missing ${field}.`);
    assert.ok(asset[field].trim(), `${establishment.name} photo has an empty ${field}.`);
  }
  assert.ok(asset.sourcePageUrl.startsWith("https://"));
  assert.ok(asset.licenseUrl.startsWith("https://"));
  assert.equal(asset.alt, establishment.imageAlt);
  assert.equal(asset.focalPoint, establishment.imageFocalPoint);
  assert.equal(asset.creator, establishment.imageCredit.label);
  assert.equal(asset.license, establishment.imageCredit.license);
  assert.equal(asset.sourcePageUrl, establishment.imageCredit.sourceUrl);
  assert.equal(asset.licenseUrl, establishment.imageCredit.licenseUrl);
  assert.ok(Number.isInteger(asset.outputWidth) && asset.outputWidth >= 320);
  assert.ok(Number.isInteger(asset.outputHeight) && asset.outputHeight >= 250);
  assert.ok(Math.max(asset.outputWidth, asset.outputHeight) >= 480);
  assert.ok(Number.isInteger(asset.outputBytes) && asset.outputBytes >= 10_000 && asset.outputBytes <= 550_000);
  assert.ok(!imagePaths.has(repositoryPath), `${establishment.name} reuses another photo path.`);
  assert.ok(!imageHashes.has(asset.sha256), `${establishment.name} reuses another photo payload.`);
  imagePaths.add(repositoryPath);
  imageHashes.add(asset.sha256);

  const imagePath = new URL(`../${repositoryPath}`, import.meta.url);
  assert.ok(fs.existsSync(imagePath), `${repositoryPath} is missing.`);
  const payload = fs.readFileSync(imagePath);
  assert.equal(payload.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(payload.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(payload.length, asset.outputBytes);
  assert.equal(crypto.createHash("sha256").update(payload).digest("hex"), asset.sha256);
}

assert.equal(imagePaths.size, 40);
assert.equal(imageHashes.size, 40);

console.log(`Validated ${dataset.establishments.length} current UK shore establishments and dockyards.`);
