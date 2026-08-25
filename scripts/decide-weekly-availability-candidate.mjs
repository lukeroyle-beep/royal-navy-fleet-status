import fs from "node:fs";

import { decideWeeklyAvailabilityCandidate } from "./lib/weekly-availability-candidate.mjs";

const candidatePath = readArgument("--candidate", true);
const existingPath = readArgument("--existing", false);
const weekEnding = readArgument("--week-ending", true);
const result = decideWeeklyAvailabilityCandidate({
  candidateText: fs.readFileSync(candidatePath, "utf8"),
  existingText: existingPath ? fs.readFileSync(existingPath, "utf8") : "",
  weekEnding,
});
process.stdout.write(result.action);

function readArgument(name, required) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (required) throw new Error(`${name} is required.`);
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
