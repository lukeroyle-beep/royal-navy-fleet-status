import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateFleet } from '../src/components/ScenarioLoader.js';
import { getMapPosition, plottedVessels } from '../src/utils/map.js';
import { filterFleetVessels, summarizePlotEligibility } from '../src/utils/fleetFilter.js';
import { getFleetStatusSummary, formatOperationalStatus } from '../src/utils/fleet.js';
import { publicPresenceForVessel, createPublicStateCatalog, createDefaultPublicState, createShareablePublicUrl, parsePublicUrlState } from '../src/utils/publicState.js';
import { parsePhysicalStatusHistory, createPublicSnapshotDataset } from '../src/utils/insights.js';
import { parseLocationHistory } from '../src/utils/location-history.js';
import { projectPublicVessel } from './lib/public-projection.mjs';
import { VesselPhotoService } from '../src/components/VesselPhotoService.js';

const read = name => fs.readFileSync(new URL(`../data/royal-navy/${name}`, import.meta.url), 'utf8');
const fleet = validateFleet(JSON.parse(read('vessels.json')));
const history = parsePhysicalStatusHistory(read('status-history.jsonl'));
const catalog = JSON.parse(read('status-history-catalog.json'));
const locations = parseLocationHistory(read('status-location-history.jsonl'), history, catalog);
const vengeance = fleet.vessels.find(v => v.id === 'hms-vengeance');
const fort = fleet.vessels.find(v => v.id === 'rfa-fort-victoria');
assert.equal(fleet.vessels.length, 69);
assert.equal(new Set(fleet.vessels.map(v=>v.id)).size, 69);
assert.equal(fleet.vessels.filter(v=>v.service==='Royal Fleet Auxiliary').length, 9);
assert.equal(getFleetStatusSummary(fleet.vessels).inRefit, 15);
assert.equal(vengeance.publicLocationLabel, 'On patrol');
assert.equal(vengeance.lastReportedLocation, 'On patrol');
assert.equal(vengeance.position, null);
assert.equal(vengeance.uncertaintyArea, null);
assert.equal(vengeance.locationPrecision, 'none');
assert.equal(vengeance.locationClassification, 'withheld');
assert.deepEqual(getMapPosition(vengeance), {lat:45,lon:-35,label:'On patrol'});
assert.equal(publicPresenceForVessel(vengeance), '', 'A symbolic display anchor cannot establish overseas presence.');
assert.equal(plottedVessels(fleet.vessels).filter(v=>v.id==='hms-vengeance').length, 1);
assert.deepEqual(summarizePlotEligibility(fleet.vessels), {total:69,pointMapped:41,regional:24,listOnly:2,representative:2});
assert.equal(fort.status, 'In re-fit');
assert.equal(formatOperationalStatus(fort.status), 'In Re-fit');
assert.equal(fort.publicLocationLabel, 'Seaforth Docks, Liverpool');
assert.equal(fort.locationPrecision, 'port');
assert.deepEqual(getMapPosition(fort), {lat:53.46,lon:-3.02,label:'Seaforth Docks, Liverpool'});
assert.match(fort.lastReportedLocation, /long-term lay-up/);
assert.equal(publicPresenceForVessel(fort), 'uk');
for (const [vessel, filters] of [
  [vengeance,{service:'Royal Navy',vesselClass:'Vanguard class',type:'SSBN',status:'Deployed'}],
  [fort,{service:'Royal Fleet Auxiliary',vesselClass:'Fort class',status:'In re-fit'}],
]) {
  assert.ok(filterFleetVessels(fleet.vessels,filters).some(v=>v.id===vessel.id));
  const state=createDefaultPublicState(); Object.assign(state.filters,filters); state.selectedVessel=vessel.id;
  for(const clusters of [true,false]) {
    state.layers.clusters=clusters;
    const c=createPublicStateCatalog({vessels:fleet.vessels});
    assert.equal(parsePublicUrlState(createShareablePublicUrl('https://fleet.invalid/',state,c),c).selectedVessel,vessel.id);
  }
}
// Keep the ordinary withheld/submarine protections. A display opt-in cannot carry a position.
for(const delta of [
  {mapRepresentation:'observed'}, {mapRepresentation:{lat:45,lon:-35}},
  {id:'hms-vanguard'}, {vesselType:'SSN'}, {status:'Available'},
  {publicLocationLabel:'North Atlantic'}, {lastReportedLocation:'Patrol area'},
  {position:{lat:45,lon:-35,label:'On patrol'}},
  {locationPrecision:'region',uncertaintyArea:{centre:{lat:45,lon:-35},radiusKm:100}},
]) assert.throws(()=>validateFleet({...fleet,vessels:[{...vengeance,...delta}]}));
const withoutDisplay={...vengeance};delete withoutDisplay.mapRepresentation;
assert.equal(getMapPosition(withoutDisplay),null);
const entity={...vengeance,vesselId:vengeance.id};
const state={status:'Deployed',locationClassification:'withheld',locationState:'withheld',lastReportedLocation:'On patrol',position:null,publicLocation:{precision:'none',label:'On patrol',geometry:null},mapRepresentation:'representative-patrol',symbolicPosition:{lat:45,lon:-35}};
assert.deepEqual(projectPublicVessel(entity,{assessedState:state}),vengeance);
assert.throws(()=>projectPublicVessel(entity,{assessedState:{...state,symbolicPosition:{lat:46,lon:-35}}}));
const legacyState={...state};delete legacyState.mapRepresentation;
assert.equal(getMapPosition(projectPublicVessel(entity,{assessedState:legacyState})),null,'Legacy symbolism alone must not opt historical records in.');
for(const date of new Set(history.filter(h=>h.snapshotDate<'2026-09-06').map(h=>h.snapshotDate))) {
 const old=createPublicSnapshotDataset({currentFleet:fleet,history,catalog,locationHistory:locations,snapshotDate:date});
 assert.equal(old.vessels.some(v=>v.id===fort.id),false);
 assert.equal(getMapPosition(old.vessels.find(v=>v.id===vengeance.id)),null);
}
const future={...fleet,metadata:{...fleet.metadata,asOfDate:'2026-09-07'}};
const archived=createPublicSnapshotDataset({currentFleet:future,history,catalog,locationHistory:locations,snapshotDate:'2026-09-06'});
assert.deepEqual(getMapPosition(archived.vessels.find(v=>v.id===vengeance.id)),getMapPosition(vengeance));
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/fleet-correction-baseline.json',import.meta.url),'utf8'));
for (const [id, record] of Object.entries(baseline.reviewedReleaseCorrections)) {
 assert.deepEqual(fleet.vessels.find(v=>v.id===id), record, `${id}: preserve the separately reviewed published correction`);
}
const publishedR1 = history.find(h=>h.snapshotDate==='2026-09-06' && h.releaseRevision===1);
assert.equal(Object.hasOwn(publishedR1.statuses, fort.id), false, 'Published r1 must not acquire Fort Victoria retrospectively.');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [name,record] of Object.entries(baseline.history)) {
 const text=read(name);assert.equal(hash(text.slice(0,record.bytes)),record.sha256,`${name}: historical prefix is immutable`);
}
const currentMarkers=new Map(plottedVessels(fleet.vessels).map(v=>[v.id,getMapPosition(v)]));
for(const [id,position] of Object.entries(baseline.markers)) assert.deepEqual(currentMarkers.get(id),position,`${id}: existing marker must not disappear or move`);
assert.equal(currentMarkers.size,Object.keys(baseline.markers).length+2);
assert.equal(await new VesselPhotoService(async()=>({ok:false})).find(fort),null,'Missing dedicated photo must use the existing accessible fallback.');
console.log('Fleet correction regressions passed: counts, representative semantics, filters, URL state, images and immutable history.');
