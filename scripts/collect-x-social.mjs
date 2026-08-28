import fs from "node:fs";
import path from "node:path";

import { resolvePrivateInputs, repositoryRootPath } from "./lib/private-inputs.mjs";
import { validateSourceRegistry } from "./lib/provenance.mjs";
import {
  collectXSocialStage,
  createScrapeCreatorsRunner,
  defaultScrapeCreatorsWrapperPath,
  writeJsonAtomic,
} from "./lib/x-social-collection.mjs";

const runPath = requiredPathArgument("--run=");
const outputPath = requiredPathArgument("--output=");
const cachePath = path.resolve(
  readEqualsArgument("--cache-dir=") ||
    path.join(repositoryRootPath(), ".cache", "private-inputs", "x-social"),
);
const maxAccountsArgument = readEqualsArgument("--max-accounts=");
const maxAccounts = maxAccountsArgument === null ? null : Number(maxAccountsArgument);
const sourceIdsArgument = readEqualsArgument("--source-ids=");
const sourceIds = sourceIdsArgument === null
  ? null
  : sourceIdsArgument.split(",").map((value) => value.trim()).filter(Boolean);
const wrapperPath = path.resolve(
  process.env.RNFS_SCRAPECREATORS_WRAPPER || defaultScrapeCreatorsWrapperPath(),
);

if (!fs.existsSync(wrapperPath)) {
  throw new Error(
    "Scrape Creators wrapper is unavailable. Install the scrape-creators skill or set RNFS_SCRAPECREATORS_WRAPPER.",
  );
}
assertPrivateArtifactPath(outputPath, "X social artifact");
assertPrivateCachePath(cachePath);

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const knownVesselIds = [
  ...entities.vessels.map((vessel) => vessel.vesselId),
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateSourceRegistry(
  registry,
  knownVesselIds,
  entities.vessels.map((vessel) => vessel.vesselId),
);

const run = readJson(runPath, "sweep run");
const publicProjection = readJson(
  path.join(repositoryRootPath(), "data", "royal-navy", "vessels.json"),
  "public vessel projection",
);
const startedAt = new Date().toISOString();
const artifact = await collectXSocialStage({
  registry,
  entities,
  publicVessels: publicProjection.vessels,
  run,
  runner: createScrapeCreatorsRunner({ wrapperPath }),
  cacheDir: cachePath,
  collectedAt: startedAt,
  maxAccounts,
  sourceIds,
});

writeJsonAtomic(outputPath, artifact);
writeJsonAtomic(runPath, run);
console.log(
  `Recorded public X stage ${artifact.runId}: ${artifact.summary.completedAccountCount}/` +
    `${artifact.summary.attemptedAccountCount} account checks completed, ` +
    `${artifact.summary.uniquePostCount} unique in-window candidate(s), ` +
    `${artifact.summary.liveRequestCount} live request(s), and ` +
    `${artifact.summary.creditsCharged} provider-reported credit(s) charged. Coverage remains a partial provider sample ` +
    "and every candidate requires human review.",
);

function requiredPathArgument(prefix) {
  const value = readEqualsArgument(prefix);
  if (!value) {
    throw new Error(
      "Usage: node scripts/collect-x-social.mjs --run=<sweep-run.json> --output=<x-social-run.json> " +
        "[--cache-dir=<dir>] [--max-accounts=<count>] [--source-ids=<id,id>]",
    );
  }
  return path.resolve(value);
}

function readEqualsArgument(prefix) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function readJson(targetPath, label) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is unavailable or invalid JSON: ${safeMessage(error)}`);
  }
  return value;
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
}

function assertPrivateArtifactPath(targetPath, label) {
  const root = repositoryRootPath();
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  const normalized = relative.split(path.sep).join("/");
  if (
    normalized.startsWith(".cache/private-inputs/") ||
    (/^x-social-run(?:-[A-Za-z0-9_-]+)?\.json$/.test(normalized))
  ) {
    return;
  }
  throw new Error(
    `${label} must be outside the repository, under .cache/private-inputs, or use the ignored root x-social-run*.json name.`,
  );
}

function assertPrivateCachePath(targetPath) {
  const root = repositoryRootPath();
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  const normalized = relative.split(path.sep).join("/");
  if (normalized === ".cache/private-inputs" || normalized.startsWith(".cache/private-inputs/")) return;
  throw new Error("X social cache must be outside the repository or under .cache/private-inputs.");
}
