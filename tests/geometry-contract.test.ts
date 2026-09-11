import test from 'node:test';
import assert from 'node:assert/strict';
import {planCampus,validateCampus} from '../src/campusPlanner';
import {planProject} from '../src/planner';
import {buildProgram} from '../src/autoProgram';
import {projectInventory,validateInventory,validateRequirements} from '../src/featureValidation';
import {defaultProject,parseProject,type Direction} from '../src/engine';
import type {Brief} from '../src/brief';
import type {FeatureRequest} from '../src/projectTypes';
const feature=(kind:string,count:number|null=1,excluded=false):FeatureRequest=>({kind,count,excluded,evidence:kind,source:'requested'});
const resort=(facing:Direction='South',features:FeatureRequest[]=[]):Brief=>({kind:'resort',site:{width:400,depth:520,facing},floors:[{label:'Site',role:'residential',spaces:[]}],mainZoneAreaSqFt:40000,features:[feature('cottage',8),feature('reception'),feature('restaurant'),...features]});
function campus(brief=resort()){
 const result=planCampus(brief);assert.ok(result.proposals.length,result.reasons.join('; '));return result.proposals[0].project;
}
test('campus geometry, door access and exact allocation work in all street directions',()=>{
 for(const facing of ['North','South','East','West'] as const){
  const brief=resort(facing,[feature('parking',2),feature('pool',2),feature('jacuzzi',2),feature('seating',2),feature('recreation',2),feature('garden',3)]);
  const result=planCampus(brief);assert.ok(result.proposals.length,`${facing}: ${result.reasons.join('; ')}`);
  for(const {project:p}of result.proposals){
   assert.deepEqual(validateCampus(p),[]);assert.deepEqual(validateRequirements(brief,p),[]);
   const c=p.campus!,entrance=c.elements.find(e=>e.kind==='entrance')!;
   const edge=facing==='North'?entrance.y:facing==='South'?p.site.depth-entrance.y-entrance.d:facing==='West'?entrance.x:p.site.width-entrance.x-entrance.w;
   assert.ok(Math.abs(edge)<.01,`${facing} entrance reaches street`);
   assert.ok(Math.abs(c.mainZone.w*c.mainZone.d-40000)<.01);
   for(const kind of ['pool','jacuzzi','seating','recreation'])assert.equal(projectInventory(p)[kind],2);
   assert.equal(projectInventory(p).garden,3);assert.equal(projectInventory(p).parking,2);
   assert.equal(parseProject(JSON.parse(JSON.stringify(p))).campus?.capacity.cottages,8);
  }
 }
});
test('leisure requests work independently and pool deck exclusions remain absent',()=>{
 for(const kinds of [['jacuzzi'],['seating'],['recreation'],['deck'],['pool','deck']] as string[][]){
  const b=resort('South',kinds.map(kind=>feature(kind,kind==='deck'&&kinds.includes('pool')?1:2,kind==='deck'&&kinds.includes('pool'))));
  const p=campus(b);assert.deepEqual(validateRequirements(b,p),[]);assert.deepEqual(validateCampus(p),[]);
  if(kinds.includes('pool'))assert.equal(projectInventory(p).deck,undefined);
 }
});
test('campus validation rejects disconnected paths and incorrect doorway sides',()=>{
 const disconnected=campus();disconnected.campus!.elements=disconnected.campus!.elements.filter(e=>e.name!=='Arrival crossing');
 assert.match(validateCampus(disconnected).join('; '),/disconnected|connected pedestrian/);
 const wrongDoor=campus();wrongDoor.campus!.elements.find(e=>e.kind==='cottage')!.doorSide='n';
 assert.match(validateCampus(wrongDoor).join('; '),/cottage.*no connected pedestrian/i);
});
test('campus validation rejects footprint collisions, nonfinite allocations and false capacities',()=>{
 const p=campus(resort('South',[feature('parking',1)])),c=p.campus!;
 const cottages=c.elements.filter(e=>e.kind==='cottage');cottages[1].x=cottages[0].x;cottages[1].y=cottages[0].y;
 c.mainZoneAreaSqFt=Number.NaN;c.capacity.cottages=500;
 const parking=c.elements.find(e=>e.kind==='parking')!;parking.quantity=50;
 const errors=validateCampus(p).join('; ');
 assert.match(errors,/overlaps/);assert.match(errors,/requested allocation/);assert.match(errors,/capacity does not match/);assert.match(errors,/exceeds the bay strip/);
});
test('unsupported geometry and impossible counts produce explicit reasons',()=>{
 for(const kind of ['future-feature','bedroom','stairs','lift']){
  const result=planCampus(resort('South',[feature(kind)]));assert.equal(result.proposals.length,0);assert.match(result.reasons.join('; '),new RegExp(kind));
 }
 const huge=planCampus(resort('South',[feature('pool',500)]));assert.equal(huge.proposals.length,0);assert.ok(huge.reasons.length);
 for(const kind of ['road','path','entrance']){
  const result=planCampus(resort('South',[feature(kind,1,true)]));assert.equal(result.proposals.length,0);assert.match(result.reasons.join('; '),/Excluded feature/);
 }
});
test('feature inventory rejects malformed capacities and treats unknown names as ordinary keys',()=>{
 for(const kind of ['pool','future-feature','constructor','__proto__']){
  assert.match(validateInventory([feature(kind)],{}).join('; '),/missing/);
  assert.match(validateInventory([feature(kind)],{[kind]:Number.NaN}).join('; '),/invalid inventory/);
  assert.match(validateInventory([feature(kind,0)],{[kind]:1}).join('; '),/invalid count/);
 }
});
test('parking requirements count actual car capacity globally and on each floor',()=>{
 const brief=buildProgram('Design a house on a 60 x 90 ft plot. G+1. Ground floor: 3 car parking. First floor: living hall, kitchen, one bedroom and one bathroom.',null);
 const result=planProject(brief);assert.ok(result.proposals.length,result.reasons.join('; '));
 for(const {project:p}of result.proposals){
  assert.equal(projectInventory(p).parking,3);assert.deepEqual(validateRequirements(brief,p),[]);
  p.floors[0].rooms.find(r=>r.type==='parking')!.furniture.pop();
  assert.match(validateRequirements(brief,p).join('; '),/requested 3 parking; found 2/i);
 }
});
test('separate requests with the same room type are accumulated before validation',()=>{
 const p=defaultProject();p.kind='house';p.floors[0].rooms=p.floors[0].rooms.filter(r=>r.type!=='bedroom');
 const b:Brief={kind:'house',site:p.site,floors:[{label:'Ground',role:'residential',spaces:[{type:'bedroom',count:1,spacious:false,attachedBath:false,open:false},{type:'bedroom',count:2,spacious:true,attachedBath:false,open:false}]}]};
 assert.match(validateRequirements(b,p).join('; '),/requested 3 bedroom; found 0/);
});
