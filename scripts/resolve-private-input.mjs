import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const key = process.argv[2];
if (!key) throw new Error("Usage: node scripts/resolve-private-input.mjs <manifest-key>");
process.stdout.write(resolvePrivateInputs().pathFor(key));
