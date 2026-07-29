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
const viteConfig = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const checklist = fs.readFileSync(
  new URL("../docs/private-release-test.md", import.meta.url),
  "utf8",
);
const report = fs.readFileSync(
  new URL("../docs/release-test-report.md", import.meta.url),
  "utf8",
);

assert.match(packageJson.scripts["build:pages"], /--base=\/royal-navy-fleet-status\//);
assert.match(packageJson.scripts["preview:private"], /private-preview\.mjs/);
assert.match(viteConfig, /allowedHosts:\s*privatePreviewHost \? \[privatePreviewHost\] : \[\]/);
assert.match(workflow, /npm run build:pages/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /retention-days:\s*7/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.doesNotMatch(workflow, /pages:\s*write|id-token:\s*write|actions\/deploy-pages/);
assert.match(checklist, /\| iPad \| Safari \|/);
assert.match(checklist, /Portrait/);
assert.match(checklist, /Landscape/);
assert.match(report, /Observed defect/);
assert.match(report, /Screenshot or notes/);
assert.match(indexHtml, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);
assert.doesNotMatch(indexHtml, /id="mapSubtitle"/);
assert.doesNotMatch(indexHtml, /Curated open-source intelligence/i);
assert.doesNotMatch(indexHtml, /Last publicly reported vessel locations/i);
assert.doesNotMatch(
  appSource,
  /mapSubtitle|elements\.subtitle/,
  "Application initialisation must not require the removed subtitle element.",
);

for (const file of [workflow, viteConfig, checklist, report]) {
  assert.doesNotMatch(file, /tail[0-9a-f]{6,}/i, "A user-specific tailnet identifier was committed.");
}

console.log("Private release safeguards passed.");
