import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = path.join(projectRoot, "dist");
const html = fs.readFileSync(path.join(distRoot, "index.html"), "utf8");
const headers = fs.readFileSync(path.join(distRoot, "_headers"), "utf8");
const projectPath = "/royal-navy-fleet-status/";

const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (match) => match[1],
);
const stylesheetPaths = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(
  (match) => match[0].match(/href="([^"]+)"/)?.[1],
);
const resourcePaths = [...scriptPaths, ...stylesheetPaths].filter(Boolean);
const builtJavascript = scriptPaths
  .map((resourcePath) =>
    fs.readFileSync(path.join(distRoot, resourcePath.slice(projectPath.length)), "utf8"),
  )
  .join("\n");

assert.ok(resourcePaths.length >= 2, "Pages build must include JavaScript and CSS resources.");
assert.match(headers, /^\/\s+Cache-Control: no-store$/m, "Root HTML must not be cached.");
assert.match(headers, /^\/\*\.html\s+Cache-Control: no-store$/m, "HTML files must not be cached.");
assert.match(
  headers,
  /^\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable$/m,
  "Fingerprinted assets must remain usable from the browser cache across deployments.",
);
assert.match(
  headers,
  /^\/data\/\*\s+Cache-Control: public, max-age=0, must-revalidate$/m,
  "Public data must be revalidated.",
);
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
assert.ok(
  fs.existsSync(path.join(distRoot, "data/royal-navy/publication-changes.json")),
  "Pages artifact must contain the publication change summary.",
);
assert.ok(
  fs.existsSync(path.join(distRoot, "data/royal-navy/status-history.jsonl")),
  "Pages artifact must contain the append-only status history.",
);
assert.equal(
  fs.existsSync(path.join(distRoot, "data/royal-navy/availability-history.jsonl")),
  false,
  "Weekly availability history must remain outside the current public build.",
);
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "Pages resources must not use root asset paths.");
assert.ok(
  builtJavascript.includes(projectPath),
  "Pages JavaScript must embed the configured project base path for runtime data requests.",
);
for (const dataPath of [
  "vessels.json",
  "shore-establishments.json",
  "publication-changes.json",
  "status-history.jsonl",
  "status-history-catalog.json",
]) {
  assert.ok(
    builtJavascript.includes(`data/royal-navy/${dataPath}`),
    `Pages JavaScript must retain the runtime request for ${dataPath}.`,
  );
}

console.log("GitHub Pages build checks passed.");
