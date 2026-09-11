import {OLLAMA_HOST,listModels,pickModel} from './brief';
import type {ProjectKind} from './projectTypes';
import {FEATURE_CATALOG} from './featureCatalog';
export const REQUEST_SYSTEM='You extract architectural requirements. Return JSON only with projectType (house, resort, apartment, unsupported), intent (new or edit), features (an array of {kind,count,evidence,excluded}), and unsupportedFeatures (an array of {evidence}, empty when none). Report explicitly requested amenities outside the allowed kinds in unsupportedFeatures instead of dropping them or substituting a known kind. A removed unsupported amenity does not need to be planned; omit it from unsupportedFeatures. Extract only features explicitly requested in the latest Request; evidence must be an exact quote from that Request. count is a positive integer or null when unspecified. excluded is true for negated or removed features, otherwise false. Classify by the requested building use, not amenities like a home theatre. Unsupported building uses must be unsupported. A swimming pool is pool, not jacuzzi. An indoor sitting area, family sitting area or family lounge is living, never seating and never theatre. Only an outdoor covered seat, shelter, pergola or space for relaxation is seating. Only a home theatre or cinema is theatre. A new project replaces old requirements. Never output coordinates. Do not invent amenities. Allowed kinds: '+Object.keys(FEATURE_CATALOG).join(', ')+'.';
export interface ModelRequest {projectType:ProjectKind|'unsupported';intent:'new'|'edit';features:{kind:string;count:number|null;evidence:string;excluded:boolean}[];unsupportedFeatures?:{evidence:string}[]}
export const REQUEST_SCHEMA={type:'object',properties:{projectType:{type:'string',enum:['house','resort','apartment','unsupported']},intent:{type:'string',enum:['new','edit']},features:{type:'array',items:{type:'object',properties:{kind:{type:'string',enum:Object.keys(FEATURE_CATALOG)},count:{type:['integer','null']},evidence:{type:'string'},excluded:{type:'boolean'}},required:['kind','count','evidence','excluded']}},unsupportedFeatures:{type:'array',items:{type:'object',properties:{evidence:{type:'string'}},required:['evidence']}}},required:['projectType','intent','features','unsupportedFeatures']};
export async function extractRequest(text:string,active:ProjectKind|null,model:string,signal:AbortSignal):Promise<ModelRequest>{
 const messages=[{role:'system',content:REQUEST_SYSTEM},{role:'user',content:`Active project: ${active??'none'}\nRequest: ${text}`}];
 let raw:string|undefined;
 // The local service uses an adapter only after its held-out evaluation passes;
 // otherwise it explicitly serves the base model.
 try{
  const health=await fetch('/planning-ai/health',{signal:AbortSignal.any([signal,AbortSignal.timeout(1000)])});
  const status=health.ok?await health.json():null;
  if(status?.ready){const res=await fetch('/planning-ai/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}),signal});if(res.ok)raw=(await res.json()).content;}
 }catch{if(signal.aborted)throw signal.reason;}
 if(!raw){
  if(model.includes(' ')){const fallback=pickModel(await listModels(OLLAMA_HOST,signal));if(!fallback)throw Error('No fallback model is available. Restart local planning inference.');model=fallback;}
  // The model often pads its answer with an entry for every feature it knows,
  // which the evidence check below discards. That padding is only a problem
  // when it runs past the token budget, because a truncated answer is not
  // JSON at all: ask again with more room before giving up on it.
  for(const budget of [2400,4000]){
   const res=await fetch(`${OLLAMA_HOST}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model,messages,format:REQUEST_SCHEMA,stream:false,think:false,options:{temperature:0,num_ctx:8192,num_predict:budget}})});
   if(!res.ok)throw Error(`Local model returned ${res.status}.`);
   const body=await res.json();raw=body.message?.content;
   if(body.done_reason!=='length')break;
   raw=undefined;
  }
 }
 return parseModelRequest(raw,text);
}
export function parseModelRequest(raw:unknown,text:string):ModelRequest {
 let b:ModelRequest;try{b=JSON.parse(typeof raw==='string'?raw:'');}catch{throw Error('The local model did not return a valid requirements object. Your active project has been preserved.');}
 if(!b||typeof b!=='object'||!['house','resort','apartment','unsupported'].includes(b.projectType)||!['new','edit'].includes(b.intent)||!Array.isArray(b.features)||b.features.length>60)throw Error('The local model returned an unsupported requirements object.');
 const unsupported=b.unsupportedFeatures??[];
 if(!Array.isArray(unsupported)||unsupported.length>60||unsupported.some(f=>!f||typeof f.evidence!=='string'||!f.evidence.trim()||!text.includes(f.evidence)))throw Error('The model returned unsupported features without valid request evidence. Please clarify the requirements.');
 if(unsupported.length)throw Error(`Planning support is not yet available for: ${unsupported.map(f=>f.evidence).join(', ')}. These requirements need an additional feature profile.`);
 // Ignore empty padding; reject a claimed requirement with invalid evidence
 // instead of trusting the model or quietly changing its meaning.
 b.features=b.features.filter(f=>f&&typeof f.evidence==='string'&&f.evidence.trim());
 for(const f of b.features){
  if(!Object.hasOwn(FEATURE_CATALOG,f.kind)||typeof f.excluded!=='boolean'||!text.includes(f.evidence)||!new RegExp(`\\b(?:${FEATURE_CATALOG[f.kind].pattern})\\b`,'i').test(f.evidence)||(f.count!==null&&(!Number.isInteger(f.count)||f.count<1||f.count>100)))throw Error('The model returned a feature that is not supported by the request. Please clarify it; the active project is preserved.');
 }
 const seen=new Map<string,ModelRequest['features'][number]>();
 for(const f of b.features){
  const old=seen.get(f.kind);
  if(!old){seen.set(f.kind,f);continue;}
  // A room named twice in one brief is usually two floors each asking for it
  // - "one bedroom" upstairs and "two bedrooms" above that - not a
  // contradiction. Only the same words claiming different counts, or a room
  // both kept and removed, is a genuine conflict.
  if(old.excluded!==f.excluded||(old.evidence===f.evidence&&old.count!==f.count))throw Error(`The model returned conflicting requirements for ${f.kind}. Please clarify its count or exclusion.`);
  if(old.evidence!==f.evidence&&!(old.count===null&&f.count===null))old.count=(old.count??0)+(f.count??0);
 }
 b.features=[...seen.values()];b.unsupportedFeatures=unsupported;return b;
}
