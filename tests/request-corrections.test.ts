import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgram} from '../src/autoProgram';
import {resolveRequest,detectProjectKind,inferResidentialKind} from '../src/requestContext';
import {explicitFeatures} from '../src/featureCatalog';
import {planProject} from '../src/planner';
import {validateRequirements} from '../src/featureValidation';
import type {Brief} from '../src/brief';
const house=()=>buildProgram('Design a G+2 house on a 90 x 100 ft plot. Ground: parking. First: living, kitchen, 1 bedroom and 1 bathroom. Second: 2 bedrooms and 1 bathroom.',null);
const count=(b:Brief,kind:string,floor?:string)=>b.floors.filter(f=>!floor||f.label===floor).flatMap(f=>f.spaces).filter(s=>s.type===kind).reduce((n,s)=>n+s.count,0);

test('named unsupported uses cannot become houses through storey or rental inference',()=>{
 for(const use of ['hospital','school','office building','hotel']){
  const text=`Design a ${use} with 3 floors on a 60 x 80 ft plot`;
  assert.equal(inferResidentialKind(text),undefined);
  assert.equal(resolveRequest(text,null,'',{intent:'new',projectType:'house'}).kind,'unsupported');
  assert.throws(()=>buildProgram(text,null),/supported project type/);
 }
 assert.equal(buildProgram('Design a house near the hospital on a 60 x 80 ft plot',null).kind,'house');
});

test('comparisons and negated uses do not change the project profile',()=>{
 assert.equal(detectProjectKind('Design a house with resort-style gardens'),'house');
 assert.equal(detectProjectKind('Design a house, not a holiday park'),'house');
 assert.equal(detectProjectKind('Design a resort instead of an apartment building'),'resort');
});

test('every explicit new-project boundary isolates the latest requirements',()=>{
 for(const boundary of ['New project','Another project','Different project','Start fresh']){
  const b=buildProgram(`My old resort had cottages and a pool. ${boundary}: a house on a 60 x 80 ft plot.`,house());
  assert.equal(b.kind,'house');
  assert.ok(!b.features?.some(f=>f.kind==='cottage'||f.kind==='pool'));
 }
 const changed=resolveRequest('Change this house into a resort on 3 acres',house());
 assert.equal(changed.intent,'new');assert.equal(changed.previous,null);
});

test('a model new-project guess cannot discard an active dimension correction',()=>{
 const previous=house();
 const context=resolveRequest('Use 100 x 110 ft',previous,'',{intent:'new',projectType:'house'});
 assert.equal(context.previous,previous);assert.equal(context.intent,'edit');
 const b=buildProgram('Use 100 x 110 ft',previous,{intent:'new',projectType:'house',features:[]});
 assert.deepEqual(b.floors,previous.floors);assert.equal(b.site.width,100);
});

test('G+0 is one floor and explicit G+4 plus terrace retains all six levels',()=>{
 assert.equal(buildProgram('Design a G+0 house on a 60 x 80 ft plot',null).floors.length,1);
 const b=buildProgram('Design a G+4 house on a 90 x 100 ft plot. Ground: parking. First: living and kitchen. Second: 2 bedrooms. Third: 1 bedroom. Fourth: bathroom. Terrace: garden.',null);
 assert.deepEqual(b.floors.map(f=>f.label),['Ground','First','Second','Third','Fourth','Terrace']);
});

test('floor-count corrections grow the program and preserve rooms when reducing levels',()=>{
 const original=house(),grown=buildProgram('Change to G+3',original);
 assert.equal(grown.floors.length,4);assert.deepEqual(grown.floors.slice(0,3),original.floors);
 const reduced=buildProgram('Change to G+1',original);
 assert.equal(reduced.floors.length,2);assert.equal(count(reduced,'bedroom'),3);
 assert.match(reduced.assumptions!.join(' '),/removed floors are retained/);
});

test('floor-specific additions, count changes and removals preserve other floors',()=>{
 const original=house();
 for(const [text,expected]of [['Add one bedroom on second floor',3],['Change second floor to four bedrooms',4],['Remove one bedroom from second floor',1]] as const){
  const b=buildProgram(text,original);
  assert.equal(count(b,'bedroom','First'),1,text);assert.equal(count(b,'bedroom','Second'),expected,text);
  assert.equal(b.features?.find(f=>f.kind==='bedroom')?.count,expected+1);
 }
 const removed=buildProgram('Remove bedrooms from second floor',original);
 assert.equal(count(removed,'bedroom','First'),1);assert.equal(count(removed,'bedroom','Second'),0);
 assert.equal(removed.features?.find(f=>f.kind==='bedroom')?.excluded,false);
});

test('moving rooms requires named floors and preserves the project total',()=>{
 const moved=buildProgram('Move one bedroom from second floor to first floor',house());
 assert.equal(count(moved,'bedroom','First'),2);assert.equal(count(moved,'bedroom','Second'),1);assert.equal(count(moved,'bedroom'),3);
 assert.throws(()=>buildProgram('Move one bedroom to first floor',house()),/source and destination/);
 assert.throws(()=>buildProgram('Move three bedrooms from second floor to first floor',house()),/does not contain/);
});

test('ambiguous changes never silently overwrite global room counts',()=>{
 const original=house();
 for(const text of ['Add one bedroom','Change bedrooms to four bedrooms','Remove one bedroom'])assert.throws(()=>buildProgram(text,original),/Specify the floor/);
 assert.equal(count(original,'bedroom'),3);
 assert.throws(()=>buildProgram('Add one bedroom on fourth floor',original),/no fourth floor/);
});

test('coordinated exclusions and repeated floor counts use the same feature vocabulary',()=>{
 const excluded=explicitFeatures('No pool, jacuzzi or garden. Add restaurant.');
 for(const kind of ['pool','jacuzzi','garden'])assert.equal(excluded.find(f=>f.kind===kind)?.excluded,true);
 assert.equal(excluded.find(f=>f.kind==='restaurant')?.excluded,false);
 assert.equal(explicitFeatures('First: 2 bedrooms. Second: 3 bedrooms.').find(f=>f.kind==='bedroom')?.count,5);
 assert.equal(explicitFeatures('zero bedrooms').find(f=>f.kind==='bedroom')?.excluded,true);
});

test('removing a terrace removes its roof spaces while retaining lower levels',()=>{
 const original=buildProgram('Design a house on a 60 x 80 ft plot with terrace and garden',null);
 const changed=buildProgram('Remove the terrace',original);
 assert.ok(!changed.floors.some(f=>f.role==='terrace'));assert.deepEqual(changed.floors[0],original.floors[0]);
 assert.equal(changed.features?.find(f=>f.kind==='garden')?.excluded,true);
});

test('rental edits preserve lettable topology and explicit parking restrictions',()=>{
 const original=buildProgram('Design a G+2 house with rental units on a 60 x 80 ft plot',null);
 const changed=buildProgram('Change plot to 70 x 90 ft',original);
 assert.equal(changed.lettable,true);assert.deepEqual(changed.floors,original.floors);
 const locked=buildProgram('Keep the ground floor for parking',original);
 assert.equal(locked.groundParkingOnly,true);
 assert.equal(buildProgram('Change site to 70 x 90 ft',locked).groundParkingOnly,true);
 const mixed=buildProgram('Add one bedroom on ground floor',locked);
 assert.equal(mixed.groundParkingOnly,false);
});

test('residential site bounds match editable saved project support',()=>{
 assert.throws(()=>buildProgram('Design a house on a 301 x 100 ft plot',null),/300 feet/);
 assert.equal(buildProgram('Design a resort on a 400 x 500 ft plot',null).kind,'resort');
});

test('a corrected concept satisfies its updated project inventory and per-floor program',()=>{
 const b=buildProgram('Remove bedrooms from second floor',house());
 const result=planProject(b);
 assert.ok(result.proposals.length,result.reasons.join('; '));
 for(const {project}of result.proposals)assert.deepEqual(validateRequirements(b,project),[]);
});
