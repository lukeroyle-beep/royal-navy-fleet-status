import fs from "node:fs";

import { createPublicProjection } from "./lib/public-projection.mjs";

const entities = readJson("../data/internal/provenance/vessels.json");
const assessments = readJson("../data/internal/provenance/assessments.json");
const destination = new URL("../data/royal-navy/vessels.json", import.meta.url);
const projection = createPublicProjection(entities, assessments);

fs.writeFileSync(destination, `${JSON.stringify(projection, null, 2)}\n`);
console.log(`Generated public projection for ${projection.vessels.length} vessels.`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
