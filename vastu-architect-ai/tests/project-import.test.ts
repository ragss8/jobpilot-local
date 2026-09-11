import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgram} from '../src/autoProgram';
import {planProject} from '../src/planner';
import {parseProject} from '../src/engine';
const campus=()=>planProject(buildProgram('Design a resort on a 3 acre site with 4 cottages and reception',null)).proposals[0].project;
test('campus imports require valid allocation metadata and unique element IDs',()=>{
 const p=campus();assert.ok(parseProject(p));
 for(const mutate of [(p:any)=>delete p.campus.mainZone,(p:any)=>p.campus.mainZone.w=-5,(p:any)=>p.campus.elements[1].id=p.campus.elements[0].id,(p:any)=>p.campus.elements[0].quantity=-1]){
  const bad=structuredClone(p);mutate(bad);assert.throws(()=>parseProject(bad));
 }
});
test('unknown project types and malformed requirement inventories are rejected',()=>{
 const p=campus();assert.throws(()=>parseProject({...p,kind:'airport'}));
 assert.throws(()=>parseProject({...p,programFeatures:[{kind:'pool',count:'two'}]}));
});
