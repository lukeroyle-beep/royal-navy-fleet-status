import assert from "node:assert/strict";
import fs from "node:fs";

import {
  privatePreviewOptions,
  validatePrivatePreviewHost,
} from "./private-preview.mjs";

assert.equal(
  validatePrivatePreviewHost("preview-device.example-tailnet.ts.net"),
  "preview-device.example-tailnet.ts.net",
);
assert.throws(() => validatePrivatePreviewHost(), /hostname is required/);
assert.throws(() => validatePrivatePreviewHost("https://device.example.ts.net"), /must end in \.ts\.net/);
assert.throws(() => validatePrivatePreviewHost("device.example.ts.net:4173"), /must end in \.ts\.net/);
assert.throws(() => validatePrivatePreviewHost("device.example.com"), /must end in \.ts\.net/);

const options = privatePreviewOptions("preview-device.example-tailnet.ts.net");
assert.equal(options.env.PRIVATE_PREVIEW_HOST, "preview-device.example-tailnet.ts.net");
assert.deepEqual(options.viteArguments, [
  "preview",
  "--host",
  "127.0.0.1",
  "--port",
  "4173",
  "--strictPort",
]);

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const workflow = fs.readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const discoveryWorkflow = fs.readFileSync(
  new URL("../.github/workflows/osint-public-discovery.yml", import.meta.url),
  "utf8",
);
const discoveryCollector = fs.readFileSync(
  new URL("./collect-public-indexes.mjs", import.meta.url),
  "utf8",
);
const viteConfig = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const checklist = fs.readFileSync(
  new URL("../docs/private-release-test.md", import.meta.url),
  "utf8",
);
const report = fs.readFileSync(
  new URL("../docs/release-test-report.md", import.meta.url),
  "utf8",
);

assert.match(packageJson.scripts["build:pages"], /--base=\/royal-navy-fleet-status\//);
assert.match(packageJson.scripts.build, /validate:history/);
assert.match(packageJson.scripts.build, /validate:changes/);
assert.match(packageJson.scripts["preview:private"], /private-preview\.mjs/);
assert.match(viteConfig, /allowedHosts:\s*privatePreviewHost \? \[privatePreviewHost\] : \[\]/);
assert.match(workflow, /npm run build:pages/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /retention-days:\s*7/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.doesNotMatch(workflow, /pages:\s*write|id-token:\s*write|actions\/deploy-pages/);
assert.match(discoveryCollector, /process\.exitCode\s*=\s*1/);
assert.match(discoveryWorkflow, /Upload discovery ledger\s*\n\s*if:\s*always\(\)/);
assert.match(checklist, /\| iPad \| Safari \|/);
assert.match(checklist, /Portrait/);
assert.match(checklist, /Landscape/);
assert.match(report, /Observed defect/);
assert.match(report, /Screenshot or notes/);
assert.match(indexHtml, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.match(indexHtml, /<title>Royal Navy Fleet Status<\/title>/);
assert.match(indexHtml, /class="command-header"/);
assert.match(indexHtml, /class="command-workspace"/);
assert.match(indexHtml, /id="totalCount"/);
assert.match(indexHtml, /Overall fleet availability/);
assert.match(indexHtml, /id="fleetAvailabilityPercentage"/);
assert.match(indexHtml, /id="fleetAvailabilityFormula"/);
assert.match(indexHtml, /id="deployedCount"/);
assert.match(indexHtml, /id="refitCount"/);
assert.match(indexHtml, /id="unknownCount"/);
assert.match(indexHtml, /id="filterResultStatus"/);
assert.match(indexHtml, /id="filterBadge"/);
assert.match(indexHtml, /id="filterPanel"/);
assert.match(indexHtml, /Public location status/);
assert.doesNotMatch(indexHtml, /Location confidence/);
assert.match(indexHtml, /id="changesToggle"/);
assert.match(indexHtml, /aria-controls="changesPanel"/);
assert.match(indexHtml, /id="classRibbon"/);
assert.match(indexHtml, /id="classAvailabilityPanel"[^>]*aria-live="polite"[^>]*hidden/);
assert.match(indexHtml, /id="changesPanel"[^>]*hidden/);
assert.match(indexHtml, /id="detailCard"[^>]*aria-live="polite"[^>]*hidden/);
assert.match(indexHtml, /Public fleet snapshot/);
assert.match(indexHtml, /not operational readiness/);
assert.doesNotMatch(indexHtml, /id="activeCount"|id="activePercentage"|id="mappedCount"/);
assert.doesNotMatch(indexHtml, /Royal Navy and RFA OSINT Fleet Map/);
assert.doesNotMatch(indexHtml, /id="mapSubtitle"/);
assert.doesNotMatch(indexHtml, /Curated open-source intelligence/i);
assert.doesNotMatch(indexHtml, /Last publicly reported vessel locations/i);
assert.doesNotMatch(
  appSource,
  /mapSubtitle|elements\.subtitle|elements\.title/,
  "Application initialisation must not overwrite the static fleet title.",
);
assert.doesNotMatch(appSource, /URLSearchParams|pushState|replaceState/);
assert.match(appSource, /insightsMatchDataset/);
assert.match(appSource, /formatDatasetReleaseLabel\(dataset\.metadata\)/);
assert.match(appSource, /formatPublicationChangeLabels\(publication\)/);
assert.match(appSource, /selectedClass = ""/);
assert.match(appSource, /getFleetStatusSummary/);
assert.match(appSource, /getAvailabilitySummary/);
assert.match(appSource, /active means deployed or available/);
assert.match(appSource, /aria-controls", "classAvailabilityPanel"/);
assert.match(appSource, /formatLocationState\(vessel\.locationState\)/);
assert.match(
  fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8"),
  /\["Location", vessel\.publicLocationLabel\]/,
);
assert.doesNotMatch(
  fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8"),
  /Supporting source|vessel\.source|Location evidence date|Evidence freshness/,
);
assert.match(styles, /button,[\s\S]*min-height:\s*44px;/s);
assert.match(styles, /\.map-reset\s*\{[\s\S]*min-height:\s*44px;/s);
assert.doesNotMatch(appSource, /hasPlottablePosition|label: "Mapped records"/);
assert.match(styles, /\.command-header\s*\{[^}]*display:\s*grid;/s);
assert.match(styles, /\.command-workspace\s*\{[^}]*position:\s*relative;/s);
assert.match(styles, /\.command-workspace\s*\{[^}]*overflow:\s*hidden;/s);
assert.match(styles, /\.status-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
assert.match(styles, /@media \(max-width: 1100px\) and \(orientation: portrait\)/);
assert.match(styles, /\(pointer: coarse\) and \(max-width: 1400px\)/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.doesNotMatch(styles, /\.topbar\s*\{/);

for (const file of [workflow, viteConfig, checklist, report]) {
  assert.doesNotMatch(file, /tail[0-9a-f]{6,}/i, "A user-specific tailnet identifier was committed.");
}

console.log("Private release safeguards passed.");
