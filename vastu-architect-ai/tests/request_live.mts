/** Real local-model integration. Run separately from deterministic unit tests. */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {understand} from '../src/program.ts';
import {planProject} from '../src/planner.ts';
import type {Brief} from '../src/brief.ts';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const value=String(input);
 return nativeFetch(value.startsWith('/ollama')?value.replace('/ollama','http://127.0.0.1:11434'):value.startsWith('/planning-ai')?value.replace('/planning-ai','http://127.0.0.1:11435'):input,init);
};
const records:Record<string,unknown>[]=[];
let active:Brief|null=null;
for(const scenario of [
 {text:'Design a G+2 house on a 40 x 60 ft plot with 3 bedrooms.',kind:'house'},
 {text:'Use 45 x 65 ft instead.',kind:'house'},
 {text:'New project: design a resort on 3 acres with 6 cottages, reception, restaurant and a swimming pool.',kind:'resort'},
 {text:'Change the cottages to 4 cottages.',kind:'resort'},
 {text:'New project: design a 2 storey apartment building on a 90 x 100 ft plot, 2 units per floor, 2 BHK.',kind:'apartment'},
]){
 const started=Date.now();const b=await understand(scenario.text,active,'qwen3:4b',AbortSignal.timeout(120000));assert.equal(b.kind,scenario.kind);
 const result=planProject(b);assert.ok(result.proposals.length,result.reasons.join('; '));
 if(scenario.kind!=='house')assert.ok(!b.features?.some(f=>f.kind==='bedroom'&&f.count===3),'Prior project leaked');
 records.push({request:scenario.text,kind:b.kind,proposals:result.proposals.length,elapsedMs:Date.now()-started});active=result.brief??b;
 console.log(JSON.stringify(records.at(-1)));
}
for(const text of ['Design a hospital with 3 floors on a 100 x 100 ft plot.','New project: a resort on 3 acres with reception and a helipad.']){
 await assert.rejects(understand(text,active,'qwen3:4b',AbortSignal.timeout(120000)),/supported|support|profile/);
 records.push({request:text,rejected:true});console.log(JSON.stringify(records.at(-1)));
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/request-live-results.json',JSON.stringify({generatedAt:new Date().toISOString(),records},null,2));
