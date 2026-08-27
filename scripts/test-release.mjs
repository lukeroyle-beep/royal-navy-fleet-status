import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
const publicStateSource = fs.readFileSync(new URL("../src/utils/publicState.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const checklist = fs.readFileSync(
  new URL("../docs/private-release-test.md", import.meta.url),
  "utf8",
);
const report = fs.readFileSync(
  new URL("../docs/release-test-report.md", import.meta.url),
  "utf8",
);
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
const completion = fs.readFileSync(
  new URL("../docs/fleet-tracker-programme-completion.md", import.meta.url),
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
assert.match(checklist, /\| iPhone \| Safari \|/);
assert.match(checklist, /Portrait/);
assert.match(checklist, /Landscape/);
assert.match(checklist, /VoiceOver or screen-reader observations are not a release requirement/);
assert.match(report, /Observed defect/);
assert.match(report, /Screenshot or notes/);
assert.match(report, /Decision: Pass/);
assert.match(report, /physical iPhone and iPad/);
assert.match(report, /physical Mac mini/);
assert.match(report, /screen-reader testing is not a release requirement/);
assert.doesNotMatch(report, /\| AT-1 \|/);
assert.match(report, /Issue #69 and PR #70[\s\S]*lag, freezing/);
assert.match(report, /PR #70 was closed without merge/);
assert.match(report, /PR #60's physically verified \*\*Release to zoom\*\* behavior/);
assert.match(
  readme,
  /\[.*fleet-tracker-programme-completion\.md.*\]\(docs\/fleet-tracker-programme-completion\.md\)/,
);
for (const child of [34, 37, 38, 39, 40, 41, 42, 43, 44, 48, 69]) {
  assert.match(completion, new RegExp(`\\[#${child}\\]`));
}
for (const pullRequest of [35, 45, 46, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 70]) {
  assert.match(completion, new RegExp(`(?:PR #|\\[#)${pullRequest}`));
}
for (const mergeCommit of [
  "d24e61e379fda6458b0308bed4b294dcca270d3b",
  "5a9db9c402b8d94f56280bf17a438c38bee1e58d",
  "e8021136242b7bffc2456ae38ab0238cd48afd36",
  "1f385013d83e047c07ee9e954db88ee261d6ae76",
  "e6386b53e6214fd98d1401e8f16627b17a8ca015",
  "074bc38de8ac205741b87730281d8473f9546a61",
  "7072d694a4a448d9d91a858a01244fabc4198591",
  "e40c3a1c6e37ed1a542646520785036ed958ee1b",
  "eecc487b8ce1b4bc1a819553659a6845fdd1417c",
  "a9f7b746863ea66428b6f2ff7ad78d4120d7b976",
  "8786c8e2123093c8bf758eede629d08e9845d27a",
  "18ed5da5a7124802545fdf11156d7e4731c5195d",
  "bdb7b98e7740d4d999337705b4c9bc27402ed7d9",
  "b658ad24da556d5a473f6f4d6f07dc7e704d639e",
  "d208b7bb4b6d2ec353c771f21e05fb85741e6c7d",
  "ee0b09551b50f994e99cc9e8532d63dde984e380",
  "10e4c64560786bf679d3834f37088b3e0619754c",
  "3ffe61fa3cc5729aa4036c7c35a3b2854646302a",
  "7249e8231a0c37d81172eff78daa2ecd84798be9",
  "c252df39abc3b2c74167338afc22a54f414c586f",
  "bd5cd752701591c80e707cb390303c9664d64591",
  "999560c4a33e8dc319c8764f3f1536881206af97",
]) {
  assert.match(completion, new RegExp(mergeCommit));
}
assert.match(completion, /## Public\/private boundary/);
assert.match(completion, /allow-list-only/);
assert.match(completion, /Raw evidence[\s\S]*credentials[\s\S]*excluded from the client build/);
assert.match(completion, /## Deferred work/);
for (const deferredItem of [
  /paid, unlicensed/,
  /unattended publication/,
  /satellite collection or identification automation/,
  /route, course, destination, patrol-area or position inference/,
  /provider integration requiring credentials/,
]) {
  assert.match(completion, deferredItem);
}
assert.match(completion, /PR #70[\s\S]*closed without merge/);
assert.match(completion, /PR #60 behavior/);

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const trackedTailscaleReferences = execFileSync(
  "git",
  ["grep", "-nI", "-E", "[[:alnum:]-]+\\.[[:alnum:]-]+\\.ts\\.net", "--"],
  { cwd: repositoryRoot, encoding: "utf8" },
)
  .match(/[A-Za-z0-9-]+\.[A-Za-z0-9-]+\.ts\.net/g) || [];
const allowedSyntheticTailscaleReferences = new Set([
  "preview-device.example-tailnet.ts.net",
  "device.example.ts.net",
]);
assert.deepEqual(
  [...new Set(trackedTailscaleReferences)].sort(),
  [...allowedSyntheticTailscaleReferences].sort(),
  "Tracked text must not contain a concrete Tailscale machine or tailnet identifier.",
);
assert.match(indexHtml, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.match(indexHtml, /<title>Royal Navy Fleet Status<\/title>/);
assert.match(indexHtml, /class="command-header"/);
assert.match(indexHtml, /class="command-workspace"/);
assert.match(indexHtml, /id="totalCount"/);
assert.match(indexHtml, /Overall fleet availability/);
assert.match(indexHtml, /<details class="fleet-summary-disclosure" open>/);
assert.match(indexHtml, /id="fleetAvailabilityPercentage"/);
assert.match(indexHtml, /id="fleetAvailabilityScore"[^>]*aria-label="0% published fleet availability"/);
assert.match(indexHtml, /id="classAvailabilityScore"[^>]*aria-label="0% selected class availability"/);
assert.doesNotMatch(indexHtml, />\s*(?:Low|Middle|High) band\b/);
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
assert.match(appSource, /history\.replaceState/);
assert.match(publicStateSource, /PUBLIC_STATE_VERSION = 2/);
assert.match(publicStateSource, /LEGACY_PUBLIC_STATE_VERSION = 1/);
assert.match(publicStateSource, /createShareablePublicUrl/);
assert.doesNotMatch(publicStateSource, /evidenceGrade|confidenceScore|analystNotes|sourceUrl/);
assert.match(appSource, /insightsMatchDataset/);
assert.match(appSource, /formatDatasetReleaseLabel\(dataset\.metadata\)/);
assert.match(appSource, /formatPublicationChangeLabels\(\{/);
assert.match(indexHtml, /id="snapshotSelect"/);
assert.match(indexHtml, /id="changedOnlyToggle"/);
assert.match(indexHtml, /id="vesselTimeline"/);
assert.match(appSource, /selectedClass = ""/);
assert.match(appSource, /getFleetStatusSummary/);
assert.match(appSource, /getAvailabilitySummary/);
assert.match(appSource, /getAvailabilityBand/);
assert.match(appSource, /setAttribute\("aria-label", `\$\{formattedPercentage\} \$\{accessibleDescription\}`\)/);
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
assert.match(styles, /\.availability-score\[data-availability-band="low"\]/);
assert.match(styles, /\.availability-score\[data-availability-band="medium"\]/);
assert.match(styles, /\.availability-score\[data-availability-band="high"\]/);
assert.match(styles, /\.availability-score\s*\{[^}]*place-content:\s*center;[^}]*place-items:\s*center;[^}]*text-align:\s*center;/s);
assert.match(styles, /@media \(min-width: 701px\) and \(max-width: 1100px\) and \(orientation: portrait\)/);
assert.match(styles, /\(pointer: coarse\) and \(min-width: 701px\) and \(max-width: 1400px\)/);
assert.match(styles, /@media \(max-width: 700px\)/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.doesNotMatch(styles, /\.topbar\s*\{/);

for (const file of [workflow, viteConfig, checklist, report]) {
  assert.doesNotMatch(file, /tail[0-9a-f]{6,}/i, "A user-specific tailnet identifier was committed.");
}

console.log("Private release safeguards passed.");
