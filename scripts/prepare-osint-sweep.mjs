import { validateSourceRegistry } from "./lib/provenance.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { createSweepQueue } from "./lib/sweep.mjs";

const asOfArgument = process.argv.find((argument) => argument.startsWith("--as-of="));
const asOf = asOfArgument ? asOfArgument.slice("--as-of=".length) : new Date().toISOString();
const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");

const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...vesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateSourceRegistry(registry, knownVesselIds, vesselIds);
console.log(JSON.stringify(createSweepQueue(registry, asOf), null, 2));
