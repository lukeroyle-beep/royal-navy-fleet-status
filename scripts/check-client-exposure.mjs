import path from "node:path";

import { scanPublicExposure } from "./lib/client-exposure.mjs";
import { repositoryRootPath, resolvePrivateInputs } from "./lib/private-inputs.mjs";

const root = repositoryRootPath();
const registry = resolvePrivateInputs().readJson("sources");
const count = scanPublicExposure({
  rootDirectory: path.join(root, "dist"),
  registry,
  fleetPath: "data/royal-navy/vessels.json",
  historyPath: "data/royal-navy/status-history-catalog.json",
  shorePath: "data/royal-navy/shore-establishments.json",
  expectedFleetCount: 68,
  expectedShoreCount: 40,
  retiredAssets: [
    ["hms-richmond", "richmond.jpg"],
    ["hms-iron-duke", "iron_duke.jpg"],
    ["hms-chiddingfold", "chiddingfold.jpg"],
  ],
  forbiddenTokens: [
    "Supporting Source", "EVID_HMS_", "ASSESS_HMS_", "ORIGIN_",
    "RN_VICTORY_PORTSMOUTH_2026", "officialSocialCoverage", "twitter.com/",
    "x.com/HMS", "x.com/RFA",
    "requiresHumanReview",
  ],
});
console.log(`Client exposure scan passed across ${count} built files.`);
