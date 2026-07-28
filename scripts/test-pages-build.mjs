import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = path.join(projectRoot, "dist");
const html = fs.readFileSync(path.join(distRoot, "index.html"), "utf8");
const projectPath = "/royal-navy-fleet-status/";

const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (match) => match[1],
);
const stylesheetPaths = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(
  (match) => match[0].match(/href="([^"]+)"/)?.[1],
);
const resourcePaths = [...scriptPaths, ...stylesheetPaths].filter(Boolean);

assert.ok(resourcePaths.length >= 2, "Pages build must include JavaScript and CSS resources.");
for (const resourcePath of resourcePaths) {
  assert.ok(
    resourcePath.startsWith(`${projectPath}assets/`),
    `Pages resource must use the project path: ${resourcePath}`,
  );
  const outputPath = path.join(distRoot, resourcePath.slice(projectPath.length));
  assert.ok(fs.existsSync(outputPath), `Built resource does not exist: ${outputPath}`);
}

assert.ok(
  fs.existsSync(path.join(distRoot, "data/royal-navy/vessels.json")),
  "Pages artifact must contain the fleet dataset.",
);
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "Pages resources must not use root asset paths.");

console.log("GitHub Pages build checks passed.");
