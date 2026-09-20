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
// Public predecessor sha256: 9921a008bceb48d68c6fdd982e307355deb913a2215a91ebccc1e13b766bbf4f.
const predecessor=JSON.parse(fs.readFileSync(new URL("./fixtures/phase2-predecessor-vessels.json",import.meta.url),"utf8"));
const phase2Ids=new Set(predecessor.vessels.filter(v=>!getMapPosition(v)).map(v=>v.id));
const withoutContext = ({locationContext, ...record}) => record;
const history = parsePhysicalStatusHistory(read('status-history.jsonl'));
const catalog = JSON.parse(read('status-history-catalog.json'));
const locations = parseLocationHistory(read('status-location-history.jsonl'), history, catalog);
const vengeance = fleet.vessels.find(v => v.id === 'hms-vengeance');
const fort = fleet.vessels.find(v => v.id === 'rfa-fort-victoria');
assert.equal(fleet.vessels.length, 69);
assert.equal(new Set(fleet.vessels.map(v=>v.id)).size, 69);
assert.equal(fleet.vessels.filter(v=>v.service==='Royal Fleet Auxiliary').length, 9);
assert.equal(getFleetStatusSummary(fleet.vessels).inRefit, 13);
assert.equal(vengeance.publicLocationLabel, 'On patrol');
assert.equal(vengeance.lastReportedLocation, 'On patrol');
assert.equal(vengeance.position, null);
assert.equal(vengeance.uncertaintyArea, null);
assert.equal(vengeance.locationPrecision, 'none');
assert.equal(vengeance.locationClassification, 'withheld');
assert.deepEqual(getMapPosition(vengeance), {lat:45,lon:-35,label:'On patrol'});
assert.equal(publicPresenceForVessel(vengeance), '', 'A symbolic display anchor cannot establish overseas presence.');
assert.equal(plottedVessels(fleet.vessels).filter(v=>v.id==='hms-vengeance').length, 1);
assert.deepEqual(summarizePlotEligibility(fleet.vessels), {total:69,pointMapped:42,regional:0,listOnly:0,representative:27});
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
  {vesselType:'SSN'}, {status:'Available'},
  {publicLocationLabel:'North Atlantic'}, {lastReportedLocation:'Patrol area'},
  {position:{lat:45,lon:-35,label:'On patrol'}},
  {locationPrecision:'region',uncertaintyArea:{centre:{lat:45,lon:-35},radiusKm:100}},
]) assert.throws(()=>validateFleet({...fleet,vessels:[{...vengeance,...delta}]}));
validateFleet({...fleet,vessels:[{...vengeance,id:'hms-vanguard',name:'HMS Vanguard'}]});
assert.throws(()=>validateFleet({...fleet,vessels:[vengeance,{...vengeance,id:'hms-vanguard'}]}),/exactly one/);
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
// These ten records were superseded by the separately reviewed 12 September release.
const revisedIds=new Set(['hms-queen-elizabeth','hms-dauntless','hms-dragon','hms-duncan','hms-sutherland','hms-portland','hms-st-albans','hms-mersey','hms-tamar','rfa-lyme-bay']);
for(const id of ['hms-duncan','hms-sutherland','hms-portland']) assert.equal(fleet.vessels.find(v=>v.id===id).status,'Unknown');
for(const id of ['hms-queen-elizabeth','hms-dragon','hms-mersey']) assert.match(fleet.vessels.find(v=>v.id===id).publicLocationLabel,/current location unconfirmed/);
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/fleet-correction-baseline.json',import.meta.url),'utf8'));
for (const [id, record] of Object.entries(baseline.reviewedReleaseCorrections)) {
 if(!revisedIds.has(id)) {
   const comparisonFleet=phase2Ids.has(id)?predecessor:fleet;
   assert.deepEqual(withoutContext(comparisonFleet.vessels.find(v=>v.id===id)), withoutContext(record), `${id}: preserve the separately reviewed published correction in its applicable release`);
 }
}
const publishedR1 = history.find(h=>h.snapshotDate==='2026-09-06' && h.releaseRevision===1);
assert.equal(Object.hasOwn(publishedR1.statuses, fort.id), false, 'Published r1 must not acquire Fort Victoria retrospectively.');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [name,record] of Object.entries(baseline.history)) {
 const text=read(name);assert.equal(hash(text.slice(0,record.bytes)),record.sha256,`${name}: historical prefix is immutable`);
}
const currentMarkers=new Map(plottedVessels(fleet.vessels).map(v=>[v.id,getMapPosition(v)]));
for(const [id,position] of Object.entries(baseline.markers)) if(!revisedIds.has(id)) {
 const current=currentMarkers.get(id), row=fleet.vessels.find(v=>v.id===id);
 if(fleet.metadata.asOfDate==='2026-09-20' && fleet.metadata.sweepCoverage?.classification==='partial' && row.locationContext?.retained) {
   assert.ok(current,`${id}: retained marker must remain selectable`);
   assert.deepEqual({lat:current.lat,lon:current.lon},{lat:position.lat,lon:position.lon},`${id}: retained geometry must not move`);
   assert.ok(row.locationContext.observedAt && row.locationContext.latestReport?.publishedAt,`${id}: retained and new report dates remain explicit`);
 } else assert.deepEqual(current,position,`${id}: existing marker must not disappear or move`);
}
assert.equal(currentMarkers.size,fleet.vessels.length);
assert.deepEqual(summarizePlotEligibility(predecessor.vessels),{total:69,pointMapped:42,regional:20,listOnly:2,representative:5});
assert.equal(plottedVessels(predecessor.vessels).length,47);
if(fleet.metadata.asOfDate === "2026-09-12" && fleet.metadata.releaseRevision === 2) {
 for(const prior of plottedVessels(predecessor.vessels)) assert.deepEqual(withoutContext(fleet.vessels.find(v=>v.id===prior.id)),withoutContext(prior),`${prior.id}: Phase2 preserves prior plotted state`);
 assert.equal(phase2Ids.size,22);
 for(const id of phase2Ids) assert.ok(currentMarkers.has(id),`${id}: newly represented record remains selectable`);
}
assert.equal((await new VesselPhotoService(async()=>{throw new Error('Local photo must not need network');}).find(fort)).imageUrl,'./photos/cards/fort_victoria.jpg');
assert.equal(fort.homePort, 'Marchwood Military Port, Southampton');
console.log('Fleet correction regressions passed: counts, representative semantics, filters, URL state, images and immutable history.');
