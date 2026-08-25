import fs from "node:fs";

import { inspectPushedWeeklyCandidate } from "./lib/weekly-availability-candidate.mjs";

const result = inspectPushedWeeklyCandidate({
  openPullRequests: JSON.parse(fs.readFileSync(readArgument("--open-prs"), "utf8")),
  title: readArgument("--title"),
  canonicalBranch: readArgument("--canonical-branch"),
  baseBranch: readArgument("--base-branch"),
  pushedSha: readArgument("--pushed-sha"),
});
process.stdout.write(JSON.stringify(result));

function readArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
