import fs from "node:fs";

import { validateSourceRegistry } from "./lib/provenance.mjs";
import { createSweepQueue } from "./lib/sweep.mjs";

const asOfArgument = process.argv.find((argument) => argument.startsWith("--as-of="));
const asOf = asOfArgument ? asOfArgument.slice("--as-of=".length) : new Date().toISOString();
const entities = read("../data/internal/provenance/vessels.json");
const registry = read("../data/internal/provenance/sources.json");

validateSourceRegistry(registry, entities.vessels.map((vessel) => vessel.vesselId));
console.log(JSON.stringify(createSweepQueue(registry, asOf), null, 2));

function read(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
