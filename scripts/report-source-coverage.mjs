import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import {
  createDiscoveryFamilyQueue,
  createOfficialAccountCoverageReport,
  validateOperationalSourceRegistry,
} from "./lib/source-registry.mjs";

const generatedAt = readEqualsArgument("--as-of=") || new Date().toISOString();
const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
validateOperationalSourceRegistry(registry, entities);
const report = createOfficialAccountCoverageReport(registry, entities, generatedAt);
process.stdout.write(`${JSON.stringify({ ...report, discovery: createDiscoveryFamilyQueue(generatedAt) }, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;

function readEqualsArgument(prefix) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}
