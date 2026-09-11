import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgram} from '../src/autoProgram';
import {resolveRequest,siteMeasurements,detectProjectKind} from '../src/requestContext';
import {planProject} from '../src/planner';
import {validateInventory,validateRequirements} from '../src/featureValidation';
import {parseProject} from '../src/engine';
const house=()=>buildProgram('Design a house on a 60 x 80 ft plot with 3 bedrooms and 2 bathrooms.',null);
test('new projects reset requirements, including same-type requests',()=>{
 const prev=house();
 for(const text of ['Design a resort on a 3 acre site with 6 cottages, reception and a pool.','New project: a house on a 50 x 70 ft plot.']){
  assert.equal(resolveRequest(text,prev).previous,null);
  const b=buildProgram(text,prev);assert.ok(!b.features?.some(f=>f.kind==='bedroom'&&f.count===3));
 }
});
test('amenities and corrections do not replace the active project type',()=>{
 assert.equal(detectProjectKind('Add a home theatre'),undefined);
 const prev=buildProgram('Design a resort on a 3 acre site.',null);
 assert.equal(resolveRequest('Add a garden',prev).intent,'edit');
 assert.equal(resolveRequest('Use 400 x 500 ft instead',prev).kind,'resort');
 assert.equal(detectProjectKind('Design a resort, not a house'),'resort');
});
test('only an unfinished active project contributes to corrections',()=>{
 const context=resolveRequest('Use a 3 acre site',null,'Design a resort with 8 cottages and reception');
 assert.match(context.text,/8 cottages/);assert.equal(context.kind,'resort');
 assert.equal(resolveRequest('New project: a house on a 40 x 60 ft plot',null,context.text).text,'New project: a house on a 40 x 60 ft plot');
});
test('site dimensions and facing do not come from room placement',()=>{
 const prev=house().site;
 const m=siteMeasurements('Put the bedroom in the north and make it 12 x 14 ft',prev);
 assert.equal(m.width,60);assert.equal(m.facing,'South');
 assert.equal(siteMeasurements('Use a 20 x 30 m plot').width,20*3.280839895);
 assert.equal(siteMeasurements('Design a resort on 3 acres. Allocate 0.5 acres for the main development zone.').mainZoneAreaSqFt,21780);
});
test('requested counts survive automatic house programs and excluded rooms are removed',()=>{
 const b=house();assert.equal(b.floors[0].spaces.find(s=>s.type==='bedroom')?.count,3);
 const edited=buildProgram('Remove the bedrooms',b);assert.ok(!edited.floors[0].spaces.some(s=>s.type==='bedroom'));
 const r=planProject(b);assert.ok(r.proposals.length,r.reasons.join('; '));
 for(const p of r.proposals)assert.deepEqual(validateRequirements(b,p.project),[]);
});
test('all feature kinds use the same presence, exclusion and count contract',()=>{
 for(const kind of ['pool','jacuzzi','cottage','restaurant','future-feature']){
  const feature={kind,count:3,evidence:kind,source:'requested' as const};
  assert.equal(validateInventory([feature],{[kind]:2}).length,1);
  assert.deepEqual(validateInventory([feature],{[kind]:3}),[]);
  assert.equal(validateInventory([{...feature,excluded:true}],{[kind]:1}).length,1);
 }
});
test('resorts use campus geometry and preserve requested features on export',()=>{
 const b=buildProgram('Design a resort on a 3 acre site with 6 cottages, reception, restaurant, a pool and garden.',null);
 const r=planProject(b);assert.ok(r.proposals.length,r.reasons.join('; '));
 for(const {project:p}of r.proposals){assert.equal(p.kind,'resort');assert.equal(p.campus?.capacity.cottages,6);assert.deepEqual(validateRequirements(b,p),[]);assert.equal(parseProject(JSON.parse(JSON.stringify(p))).campus?.capacity.cottages,6);}
});
test('apartments contain separate units with private rooms and shared core',()=>{
 const b=buildProgram('Design a G+1 apartment building on a 90 x 100 ft plot with 2 units per floor, 2 BHK.',null);
 const r=planProject(b);assert.ok(r.proposals.length,r.reasons.join('; '));
 for(const {project:p}of r.proposals){assert.equal(p.kind,'apartment');assert.equal(p.floors.length,2);
  for(const f of p.floors){const units=new Set(f.rooms.map(r=>r.unitId).filter(Boolean));assert.equal(units.size,2);for(const id of units){const rooms=f.rooms.filter(r=>r.unitId===id);assert.equal(rooms.filter(r=>r.type==='bedroom').length,2);assert.equal(rooms.filter(r=>r.type==='kitchen').length,1);}}
 }
});
