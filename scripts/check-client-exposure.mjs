import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const files = walk(dist);
const text = files
  .filter((file) => /\.(?:html|js|css|json|map)$/i.test(file))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const publicFleet = JSON.parse(fs.readFileSync(path.join(dist, "data/royal-navy/vessels.json"), "utf8"));
const publicShore = JSON.parse(
  fs.readFileSync(path.join(dist, "data/royal-navy/shore-establishments.json"), "utf8"),
);
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "data/internal/provenance/sources.json"), "utf8"),
);
const forbiddenPublicFields = [
  "source",
  "sourceId",
  "sourceUrl",
  "evidenceCheckedDate",
  "locationEvidenceDate",
  "evidenceClassification",
  "selectedEvidenceIds",
  "conflictingEvidenceIds",
  "rationale",
  "analystNotes",
];
for (const vessel of publicFleet.vessels) {
  for (const field of forbiddenPublicFields) {
    assert.ok(!Object.hasOwn(vessel, field), `Public fleet record exposes ${field}.`);
  }
}
assert.equal(publicFleet.vessels.length, 68, "Production fleet roster has the wrong denominator.");
for (const [vesselId, photoName] of [
  ["hms-richmond", "richmond.jpg"],
  ["hms-iron-duke", "iron_duke.jpg"],
  ["hms-chiddingfold", "chiddingfold.jpg"],
]) {
  assert.ok(
    !publicFleet.vessels.some((vessel) => vessel.id === vesselId),
    `Retired ${vesselId} remains in the production fleet dataset.`,
  );
  assert.ok(
    !files.some((file) => file.endsWith(`${path.sep}photos${path.sep}${photoName}`)),
    `Retired ${vesselId} photo remains in the production client.`,
  );
}
assert.equal(publicShore.establishments.length, 40, "Production shore roster is incomplete.");
for (const establishment of publicShore.establishments) {
  for (const field of ["address", "postcode", "telephone", "email", "analystNotes", "internalNotes"]) {
    assert.ok(!Object.hasOwn(establishment, field), `Public shore record exposes ${field}.`);
  }
  assert.ok(establishment.image.startsWith("./shore/"));
  assert.ok(establishment.source.url.startsWith("https://"));
}

for (const forbidden of [
  "Supporting Source",
  "EVID_HMS_",
  "ASSESS_HMS_",
  "ORIGIN_",
  "RN_VICTORY_PORTSMOUTH_2026",
  "officialSocialCoverage",
  "twitter.com/",
  "x.com/HMS",
  "x.com/RFA",
]) {
  assert.ok(!text.includes(forbidden), `Production client exposes internal provenance token: ${forbidden}`);
}
for (const source of registry.sources) {
  assert.ok(
    !includesExactUrl(text, source.canonicalUrl),
    `Production client exposes registry URL for ${source.sourceId}.`,
  );
  if (source.accountHandle) {
    assert.ok(
      !text.includes(source.accountHandle),
      `Production client exposes account handle for ${source.sourceId}.`,
    );
  }
}
assert.ok(!files.some((file) => file.includes(`${path.sep}internal${path.sep}`)), "Production client contains an internal data directory.");
console.log(`Client exposure scan passed across ${files.length} built files.`);

function includesExactUrl(value, url) {
  // Registry index URLs can legitimately prefix a public article or photo-credit URL.
  // Treat only a terminated URL token as exposure, not a longer URL on the same site.
  let offset = value.indexOf(url);
  while (offset !== -1) {
    const nextCharacter = value[offset + url.length];
    if (!nextCharacter || !/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/.test(nextCharacter)) {
      return true;
    }
    offset = value.indexOf(url, offset + url.length);
  }
  return false;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
