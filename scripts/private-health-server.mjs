import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPrivateEvidenceHealth } from "./lib/private-health.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";

const scriptPath = fileURLToPath(import.meta.url);

export function validatePrivateHealthConfiguration({ token, host }) {
  if (typeof token !== "string" || token.length < 32) {
    throw new Error("RNFS_HEALTH_TOKEN must contain at least 32 characters.");
  }
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error(
      "Private health must bind to loopback and be reached only through an approved authenticated proxy or local session.",
    );
  }
  return { token, host };
}

export function createPrivateHealthRequestHandler({ token, loadHealth }) {
  validatePrivateHealthConfiguration({ token, host: "127.0.0.1" });
  if (typeof loadHealth !== "function") throw new Error("Private health requires a data loader.");
  return async (request, response) => {
    setSecurityHeaders(response);
    if (!authorised(request.headers.authorization, token)) {
      response.statusCode = 401;
      response.setHeader("WWW-Authenticate", 'Basic realm="RNFS private evidence health", charset="UTF-8"');
      response.end("Authorisation required.");
      return;
    }
    try {
      const requestUrl = new URL(request.url, "http://localhost");
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end("Method not allowed.");
        return;
      }
      if (requestUrl.pathname === "/health.json") {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(`${JSON.stringify(await loadHealth())}\n`);
        return;
      }
      if (requestUrl.pathname === "/") {
        const nonce = crypto.randomBytes(18).toString("base64");
        response.setHeader(
          "Content-Security-Policy",
          `default-src 'none'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        );
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(renderPrivateHealthShell(nonce));
        return;
      }
      response.statusCode = 404;
      response.end("Not found.");
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(`${JSON.stringify({ state: "failed", message: safeMessage(error) })}\n`);
    }
  };
}

export function loadPrivateHealth(privateInputs = resolvePrivateInputs(), asOf = new Date().toISOString()) {
  const sweepDirectory = privateInputs.pathFor("sweepRuns");
  const sweepRuns = fs.readdirSync(sweepDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(sweepDirectory, name), "utf8")));
  return createPrivateEvidenceHealth({
    registry: privateInputs.readJson("sources"),
    entities: privateInputs.readJson("vessels"),
    evidenceLog: privateInputs.readJson("evidence"),
    assessmentLog: privateInputs.readJson("assessments"),
    sweepRuns,
    asOf,
  });
}

export function renderPrivateHealthShell(nonce) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private evidence health</title>
<style nonce="${nonce}">
:root{color-scheme:dark;--bg:#071827;--panel:#102d42;--text:#f6fbff;--muted:#c0d7e7;--accent:#55d6be;--warn:#ffcf70;--danger:#ff8a8a}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;color:#000;padding:.75rem;z-index:2}header,main{max-width:76rem;margin:auto;padding:1.25rem}h1{margin:.25rem 0}.lede{color:var(--muted)}#status{border-left:.35rem solid var(--accent);padding:.8rem 1rem;background:var(--panel)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1rem;margin-top:1rem}.card{background:var(--panel);padding:1rem;border-radius:.5rem}.card h2{font-size:1rem;margin-top:0}.value{font-size:1.8rem;font-weight:700}.warning{color:var(--warn)}.danger{color:var(--danger)}ul{padding-left:1.25rem}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><a class="skip" href="#main">Skip to evidence health</a><header><h1>Private evidence health</h1><p class="lede">Server-authorised collection and review diagnostics. No public tracker data is served here.</p></header><main id="main"><p id="status" role="status" aria-live="polite">Loading private health data…</p><div class="grid" id="cards" aria-label="Evidence-health summary"></div><section class="card"><h2>Degraded or failed reasons</h2><ul id="reasons"><li>Loading…</li></ul></section></main>
<script nonce="${nonce}">
const status=document.querySelector('#status'),cards=document.querySelector('#cards'),reasons=document.querySelector('#reasons');
const card=(title,value,detail='')=>{const el=document.createElement('section');el.className='card';const h=document.createElement('h2');h.textContent=title;const v=document.createElement('p');v.className='value';v.textContent=String(value);const d=document.createElement('p');d.textContent=detail;el.append(h,v,d);cards.append(el)};
fetch('./health.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Health request failed');return r.json()}).then(data=>{status.textContent='Current state: '+data.state+'. Generated '+data.generatedAt;cards.replaceChildren();card('Source checks',data.sourceHealth.total,data.sourceHealth.failures.length+' failures; '+data.sourceHealth.mandatoryNotChecked.length+' mandatory not checked');card('Stale vessels',data.staleVessels.length);card('Conflicts',data.conflicts.length);card('New review items',data.newReviewItems.length);card('Last known good',data.lastKnownGood?data.lastKnownGood.completedAt:'None');reasons.replaceChildren();const items=data.degradedReasons.length?data.degradedReasons:['No degraded reason recorded.'];for(const item of items){const li=document.createElement('li');li.textContent=item;reasons.append(li)}}).catch(()=>{status.textContent='Failed to load private health data.';status.className='danger';reasons.replaceChildren();const li=document.createElement('li');li.textContent='The server returned no authorised health payload.';reasons.append(li)});
</script></body></html>`;
}

function authorised(header, token) {
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0 || decoded.slice(0, separator) !== "analyst") return false;
  const supplied = Buffer.from(decoded.slice(separator + 1));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ").slice(0, 200);
}

async function main() {
  const token = process.env.RNFS_HEALTH_TOKEN;
  const host = process.env.RNFS_HEALTH_HOST || "127.0.0.1";
  const port = Number(process.env.RNFS_HEALTH_PORT || 4317);
  validatePrivateHealthConfiguration({ token, host });
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RNFS_HEALTH_PORT is invalid.");
  const handler = createPrivateHealthRequestHandler({ token, loadHealth: () => loadPrivateHealth() });
  const server = http.createServer(handler);
  server.listen(port, host, () => {
    console.log(`Private evidence health listening on http://${host}:${port}; sign in as analyst.`);
  });
}

if (process.argv[1] === scriptPath) {
  main().catch((error) => {
    console.error(safeMessage(error));
    process.exitCode = 1;
  });
}
