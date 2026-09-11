import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModelRequest,extractRequest} from '../src/requestModel';
import {understand} from '../src/program';
import {buildProgram} from '../src/autoProgram';
const model=(features:unknown[],extra:Record<string,unknown>={})=>JSON.stringify({projectType:'resort',intent:'new',features,unsupportedFeatures:[],...extra});
const feature={kind:'pool',count:2,evidence:'2 pools',excluded:false};
test('model evidence validates meaning, exact quote, count bounds and exclusions',()=>{
 assert.equal(parseModelRequest(model([feature]),'A resort with 2 pools').features.length,1);
 for(const change of [{kind:'jacuzzi',evidence:'A resort'},{count:0},{count:Infinity},{evidence:'3 pools'},{excluded:'false'}]){
  const serialized=model([{...feature,...change}]);
  // JSON serializes infinity to null, which represents an unspecified count.
  if(change.count===Infinity)continue;
  assert.throws(()=>parseModelRequest(serialized,'A resort with 2 pools'));
 }
 assert.throws(()=>parseModelRequest(model([feature,{...feature,count:3}]),'A resort with 2 pools'),/conflicting/);
 assert.throws(()=>parseModelRequest('null','Anything'));
 assert.throws(()=>parseModelRequest('{','Anything'));
});
test('a quote matches the request words whatever their spacing or case',()=>{
 for(const text of ['A resort with 2\u00a0pools','A resort with 2  pools','A RESORT WITH 2 POOLS'])assert.equal(parseModelRequest(model([feature]),text).features.length,1,JSON.stringify(text));
});
test('a quote filed under the wrong kind takes the one kind its words name',()=>{
 assert.equal(parseModelRequest(model([{...feature,kind:'jacuzzi'}]),'A resort with 2 pools').features[0].kind,'pool');
 const house='First floor: living hall. Second floor: a family sitting area. Terrace: covered seating area and a small terrace garden.';
 const b=parseModelRequest(model([{kind:'living',count:1,evidence:'living hall',excluded:false},{kind:'seating',count:1,evidence:'family sitting area',excluded:false},{kind:'seating',count:1,evidence:'covered seating area',excluded:false}],{projectType:'house'}),house);
 assert.equal(b.features.find(f=>f.kind==='living')?.count,2);assert.equal(b.features.find(f=>f.kind==='seating')?.count,1);
 // Naming several kinds, none of them the one claimed, is still ambiguous.
 assert.throws(()=>parseModelRequest(model([{kind:'seating',count:1,evidence:'small terrace garden',excluded:false}],{projectType:'house'}),house),/small terrace garden/);
});
test('one slip in a model answer is sent back once with its reason',async()=>{
 const originalFetch=globalThis.fetch,sent:{messages:{content:string}[]}[]=[],signal=new AbortController().signal;
 const answers=(...contents:string[])=>{sent.length=0;globalThis.fetch=async(input,init)=>{
  if(String(input).endsWith('/health'))return new Response(JSON.stringify({ready:false}));
  sent.push(JSON.parse(String(init!.body)));
  return new Response(JSON.stringify({message:{content:contents[sent.length-1]},done_reason:'stop'}));
 };};
 try{
  answers(model([{...feature,count:0}]),model([feature]));
  assert.equal((await extractRequest('A resort with 2 pools',null,'test',signal)).features[0].count,2);
  assert.equal(sent.length,2);assert.match(sent[1].messages.at(-1)!.content,/invalid count of 0/);
  answers(model([{...feature,count:0}]),model([{...feature,evidence:'3 pools'}]));
  await assert.rejects(extractRequest('A resort with 2 pools',null,'test',signal),/not quoted/);assert.equal(sent.length,2);
  // A request the planners cannot serve is an answer, not a slip.
  answers(model([],{unsupportedFeatures:[{evidence:'helipad'}]}));
  await assert.rejects(extractRequest('A resort with a helipad',null,'test',signal),/helipad/);assert.equal(sent.length,1);
 }finally{globalThis.fetch=originalFetch;}
});
test('unknown amenities receive an explicit unsupported response',()=>{
 assert.throws(()=>parseModelRequest(model([],{unsupportedFeatures:[{evidence:'helipad'}]}),'Design a resort with a helipad'),/helipad/);
 assert.throws(()=>parseModelRequest(model([],{unsupportedFeatures:[{evidence:'invented'}]}),'Design a resort'),/evidence/);
});
test('a dimension correction works without inference and preserves rental metadata',async()=>{
 const previous=buildProgram('Design a G+3 house with rental units on a 30 x 40 ft plot',null);
 const original=structuredClone(previous);
 const next=await understand('Use 32 x 45 ft instead',previous,'unavailable',new AbortController().signal);
 assert.equal(next.site.width,32);assert.equal(next.site.depth,45);assert.equal(next.lettable,true);
 assert.deepEqual(next.floors,previous.floors);assert.deepEqual(previous,original);
});
test('only the new project section reaches the local model',async()=>{
 const originalFetch=globalThis.fetch;const prompts:string[]=[];
 globalThis.fetch=async(_input,init)=>{
  if(!init?.body)return new Response(JSON.stringify({ready:true}),{status:200});
  const body=JSON.parse(String(init.body));prompts.push(body.messages[1].content);
  return new Response(JSON.stringify({content:model([{kind:'cottage',count:4,evidence:'4 cottages',excluded:false},{kind:'reception',count:null,evidence:'reception',excluded:false}])}),{status:200});
 };
 try{
  const b=await understand('Old house: jacuzzi and theatre. New project: resort on 3 acres with 4 cottages and reception',null,'test',new AbortController().signal);
  assert.equal(b.kind,'resort');assert.ok(prompts.length);assert.ok(!prompts[0].includes('jacuzzi'));
  assert.ok(!b.features?.some(f=>f.kind==='jacuzzi'));
 }finally{globalThis.fetch=originalFetch;}
});
test('aborted requests do not invoke inference or produce a new brief',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(understand('Design a house on a 40 x 60 ft plot',null,'test',controller.signal));
});
