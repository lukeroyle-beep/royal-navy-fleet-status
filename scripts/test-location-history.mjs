import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePhysicalStatusHistory, createPublicSnapshotDataset } from "../src/utils/insights.js";
import { parseLocationHistory } from "../src/utils/location-history.js";
import { buildStatusLocationSnapshot, appendLocationSnapshot } from "./lib/status-location-snapshot.mjs";
import { FleetInsightsLoader } from "../src/components/FleetInsightsLoader.js";
import { hasPrivateFilesystemPath } from "../src/utils/public-location-text.js";
const data = new URL("../data/royal-navy/", import.meta.url);
const read = name => fs.readFileSync(new URL(name, data), "utf8");
const fleet = JSON.parse(read("vessels.json"));
const history = parsePhysicalStatusHistory(read("status-history.jsonl"));
const catalog = JSON.parse(read("status-history-catalog.json"));
const text = read("status-location-history.jsonl");
const locations = parseLocationHistory(text, history, catalog);
const expectedMarkers = JSON.parse(fs.readFileSync(new URL("./fixtures/historical-location-markers.json", import.meta.url), "utf8"));
const markerSet = vessels => vessels.filter(v => v.position).map(v => ({id:v.id,name:v.name,lat:v.position.lat,lon:v.position.lon})).sort((a,b)=>a.id.localeCompare(b.id));
const compose = (date, records = locations, snapshots = history) => createPublicSnapshotDataset({ currentFleet: fleet, history: snapshots, catalog, snapshotDate: date, locationHistory: records });
assert.deepEqual(compose(fleet.metadata.asOfDate), fleet);
assert.notEqual(compose(fleet.metadata.asOfDate).vessels, fleet.vessels);
assert.deepEqual(markerSet(compose(fleet.metadata.asOfDate).vessels), markerSet(fleet.vessels));
for (const [date, expected] of Object.entries(expectedMarkers)) {
  assert.deepEqual(markerSet(compose(date).vessels), expected.points, `${date}: complete marker IDs and coordinates`);
}
for (const [date, count] of [["2026-07-31", 20], ["2026-08-09", 30], ["2026-08-12", 31], ["2026-08-23", 37]]) {
 const result = compose(date);
 assert.equal(result.vessels.filter(v=>v.position).length, count);
 assert.equal(result.vessels.length, Object.keys(history.filter(h=>h.snapshotDate===date).at(-1).statuses).length);
 const unlocated = result.vessels.find(v=>!v.position);
 assert.ok(unlocated);
 assert.equal(unlocated.publicLocationLabel, "Not available for this snapshot");
}
const first = structuredClone(locations[0]);
const vesselId = Object.keys(first.locations)[0];
const second = structuredClone(locations[1]);
second.locations[vesselId] = structuredClone(first.locations[vesselId]);
second.locations[vesselId].position.lat = 12.34;
assert.notEqual(compose(first.snapshotDate,[first,second]).vessels.find(v=>v.id===vesselId).position.lat,
 compose(second.snapshotDate,[first,second]).vessels.find(v=>v.id===vesselId).position.lat);
// No silent location carry-forward when a corrected status revision has no matching locations.
const revision2 = history.find(s=>s.snapshotDate==="2026-08-23" && s.releaseRevision===2);
const old = {...first,snapshotDate:revision2.snapshotDate,releaseRevision:2,releasedAt:revision2.releasedAt};
assert.equal(compose("2026-08-23",[old]).vessels.filter(v=>v.position).length,0);
const reject = mutate => { const r=structuredClone(first); mutate(r); assert.throws(()=>parseLocationHistory(JSON.stringify(r),history,catalog)); };
reject(r=>r.locations[vesselId].sourceUrl="https://example.test");
reject(r=>r.locations[vesselId].position.sourceUrl="https://example.test");
reject(r=>r.locations[vesselId].publicLocationLabel="https://example.test");
for (const path of ["/Users/example/private/evidence.json", "/home/example/data.json", "C:\\Users\\example\\data.json", "\\\\server\\private\\data.json", "file:///private/tmp/data.json"]) {
  assert.ok(hasPrivateFilesystemPath(path));
  reject(r => { r.locations[vesselId].publicLocationLabel=path; r.locations[vesselId].lastReportedLocation=path; r.locations[vesselId].position.label=path; });
  assert.ok(hasPrivateFilesystemPath(JSON.stringify({ label: path })));
}
assert.equal(hasPrivateFilesystemPath("https://www.royalnavy.mod.uk/news/example"), false);
reject(r=>r.locations[vesselId].position.lat=50.123456);
reject(r=>r.locations[vesselId].locationPrecision="region");
reject(r=>r.locations[vesselId].locationState="unconfirmed");
reject(r=>r.locations[vesselId].uncertaintyArea={radiusKm:100});
reject(r=>r.locations["not-in-roster"]=r.locations[vesselId]);
reject(r=>r.releasedAt="2026-08-01T00:00:00Z");
reject(r=>r.releaseRevision=999);
assert.throws(()=>parseLocationHistory(`${JSON.stringify(first)}\n${JSON.stringify(first)}`,history,catalog));
assert.throws(()=>parseLocationHistory(`${JSON.stringify(second)}\n${JSON.stringify(first)}`,history,catalog));
assert.throws(()=>parseLocationHistory("{",history,catalog));
// Future capture is a strict allow-listed projection, including reviewed regional areas.
const current = buildStatusLocationSnapshot(fleet);
const captured = parseLocationHistory(JSON.stringify(current),history,catalog);
assert.deepEqual(captured[0].locations[fleet.vessels[0].id].position,fleet.vessels[0].position);
const currentText=JSON.stringify(current)+"\n";
assert.equal(appendLocationSnapshot("",current,history,catalog),currentText);
assert.equal(appendLocationSnapshot(currentText,current,history,catalog),currentText);
const changed=structuredClone(current); changed.locations[fleet.vessels[0].id].lastReportedLocation+=" changed";
assert.throws(()=>appendLocationSnapshot(currentText,changed,history,catalog),/different content/);
const nextFleet=structuredClone(fleet);nextFleet.metadata={asOfDate:"2026-09-06",releaseRevision:1,releasedAt:"2026-09-06T12:00:00Z"};
const nextStatus={schemaVersion:2,snapshotDate:"2026-09-06",releaseRevision:1,releasedAt:"2026-09-06T12:00:00Z",statuses:Object.fromEntries(fleet.vessels.map(v=>[v.id,v.status]))};
const next=buildStatusLocationSnapshot(nextFleet);
assert.equal(parseLocationHistory(appendLocationSnapshot(currentText,next,[...history,nextStatus],catalog),[...history,nextStatus],catalog).length,2);
// The loader fails the insights bundle closed if location data is absent or malformed.
const originalFetch=globalThis.fetch;
try {
 const responses={changes:read("publication-changes.json"),history:read("status-history.jsonl"),catalog:JSON.stringify(catalog),locations:text};
 globalThis.fetch=async url=>({ok:true,text:async()=>responses[url],json:async()=>JSON.parse(responses[url])});
 const loader=new FleetInsightsLoader({changesUrl:"changes",historyUrl:"history",historyCatalogUrl:"catalog",locationHistoryUrl:"locations"});
 assert.equal((await loader.load()).locationHistory.length,locations.length);
 responses.locations="{}";await assert.rejects(loader.load());
 globalThis.fetch=async()=>({ok:false});await assert.rejects(loader.load(),/could not be loaded/);
} finally {globalThis.fetch=originalFetch;}
console.log("Historical location schema, isolation, correction, future capture, privacy and loader tests passed.");
