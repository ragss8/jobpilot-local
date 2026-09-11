import type {Brief,SpaceRequest,FloorBrief} from './brief';
import {briefSpaceTypes} from './brief';
import {explicitFeatures,FEATURE_CATALOG} from './featureCatalog';
import {explicitFloorSpaces} from './explicitProgram';
import {siteMeasurements,resolveRequest,detectLettable} from './requestContext';
import type {FeatureRequest,ProjectKind} from './projectTypes';
import type {ModelRequest} from './requestModel';
const space=(type:SpaceRequest['type'],count=1):SpaceRequest=>({type,count,spacious:false,attachedBath:false,open:false});
export function mergeFeatures(text:string,previous:FeatureRequest[]=[],model:ModelRequest['features']=[]):FeatureRequest[]{
 const map=new Map(previous.map(f=>[f.kind,{...f}]));
 for(const f of model)map.set(f.kind,{...f,source:'requested'});
 for(const f of explicitFeatures(text)){
  const old=map.get(f.kind);map.set(f.kind,{...f,count:f.count??old?.count??null});
 }
 return [...map.values()];
}
/** The buildable plate of one floor, mirroring the setbacks planResidence
 * adopts, so a program is proposed against the plate the planner will get. */
export function buildablePlate(width:number,depth:number){
 const compact=Math.min(width,depth)<25,side=compact?1:2,front=compact?3:4;
 return {w:Math.max(0,width-2*side),d:Math.max(0,depth-side-front)};
}
/** What one self-contained let can hold. Rooms are striped across the width of
 * the floor so that each one fronts the landing directly; that makes width,
 * not area, the thing that decides how many rooms fit. A deeper plot does not
 * buy another bedroom, which is why these thresholds are not areas. */
export function unitSpaces(width:number,depth:number):SpaceRequest[]{
 const {w,d}=buildablePlate(width,depth);
 const beds=w>=45&&d>=60?3:w>=28&&d>=32?2:1;
 return [space('living'),space('kitchen'),space('bedroom',beds),space('bathroom')];
}
/** How many self-contained units one apartment floor plate can actually
 * serve, given the corridor-and-core topology the apartment planner builds.
 * Room minimums are orientation-free, so a wide shallow room counts too. */
export function fitUnits(width:number,depth:number,beds:number,facing:string,corridor=6){
 const plateW=Math.max(0,width-8),plateD=Math.max(0,depth-10);
 const sideways=facing==='East'||facing==='West';
 const W=sideways?plateD:plateW,D=sideways?plateW:plateD,stack=beds+3;
 const roomW=(W-corridor)/2-4;
 for(const rows of [2,1]){
  const roomD=(D-14)/rows/stack;
  if(Math.min(roomW,roomD)>=10&&Math.max(roomW,roomD)>=12)return rows*2;
 }
 return 0;
}
/** Rooms that belong to the shared, lived-in part of a house rather than to a
 * sleeping floor. */
const SHARED=['living','kitchen','dining','pooja','office','theatre','store','utility'];
/** Rooms one floor can hold while each still fronts the landing directly. */
const PER_FLOOR=5;
/** Spread the rooms someone actually asked for across the floors, instead of
 * making them name a floor for each one. Sleeping rooms go up, shared rooms
 * stay on the first lived-in floor, and the totals asked for are preserved
 * exactly: nothing is added to a count and nothing is dropped from it. */
export function distributeProgram(storeys:number,want:Map<string,number>,small:boolean):FloorBrief[]{
 const names=['Ground','First','Second','Third','Fourth'];
 const stilt=storeys>1;
 const floors:FloorBrief[]=Array.from({length:storeys},(_,i)=>({
  label:names[i]??`Level ${i+1}`,
  role:(i===0&&stilt?'stilt':'residential') as FloorBrief['role'],
  spaces:i===0&&stilt?[space('parking',want.get('parking')??1)]:[],
 }));
 const rooms=floors.map((_,i)=>i).filter(i=>floors[i].role==='residential');
 const live=rooms[0];
 const sleep=rooms.length>1?rooms.slice(1):rooms;
 const put=(i:number,type:string,n:number)=>{
  if(n<=0)return;const f=floors[i],old=f.spaces.find(s=>s.type===type);
  if(old)old.count+=n;else f.spaces.push(space(type as SpaceRequest['type'],n));
 };
 // A house needs these whether or not anyone thought to say so.
 // A second living-type room is a lounge or sitting area for another floor,
 // not two halls side by side, so extras go up rather than stacking here.
 const shareOut=(type:string,n:number)=>{
  for(let k=0;k<n;k++)put(rooms[Math.min(k,rooms.length-1)],type,1);
 };
 shareOut('living',want.get('living')??1);
 shareOut('kitchen',want.get('kitchen')??1);
 // Service rooms belong with the parking on the ground floor, not upstairs
 // with the living room.
 const service=stilt?['utility','store']:[];
 for(const type of service)if(want.has(type))put(0,type,want.get(type)!);
 for(const type of SHARED)
  if(type!=='living'&&type!=='kitchen'&&!service.includes(type)&&want.has(type))
   shareOut(type,want.get(type)!);
 // Sleeping rooms fill the floors above, one at a time so they stay even.
 const beds=want.get('bedroom')??Math.max(1,sleep.length*(small?1:2));
 const masters=want.get('master')??(want.has('bedroom')?0:1);
 for(let k=0;k<masters;k++)put(sleep[sleep.length-1-(k%sleep.length)],'master',1);
 for(let k=0;k<beds;k++)put(sleep[k%sleep.length],'bedroom',1);
 // At least one bathroom per lived-in floor, or the number asked for.
 const baths=want.get('bathroom')??rooms.length;
 for(let k=0;k<baths;k++)put(rooms[k%rooms.length],'bathroom',1);
 // Anything else that was asked for still has to land somewhere. Roof spaces
 // are placed by the terrace step, so only the rest is handled here: an
 // outdoor space goes with the sleeping floors, everything else with the
 // living floor.
 const ROOF=['garden','seating','jacuzzi','terrace'];
 const placed=new Set(floors.flatMap(f=>f.spaces.map(s=>s.type as string)));
 for(const [type,count] of want){
  if(placed.has(type)||type==='parking'||ROOF.includes(type))continue;
  put(type==='balcony'?sleep[sleep.length-1]:live,type,count);
 }
 // Rooms are laid in a single row fronting the landing, so a floor carrying
 // too many of them ends up with ribbons no bedroom can use. Move sleeping
 // rooms down to floors with space; nothing is dropped, only relocated.
 const count=(f:FloorBrief)=>f.spaces.reduce((a,s)=>a+s.count,0);
 for(let pass=0;pass<8;pass++){
  const over=rooms.filter(i=>count(floors[i])>PER_FLOOR).sort((a,b)=>count(floors[b])-count(floors[a]))[0];
  if(over===undefined)break;
  const room=rooms.filter(i=>i!==over&&count(floors[i])<PER_FLOOR).sort((a,b)=>count(floors[a])-count(floors[b]))[0];
  if(room===undefined)break;
  const movable=floors[over].spaces.find(s=>s.type==='bedroom'||s.type==='master')??floors[over].spaces.find(s=>!SHARED.includes(s.type));
  if(!movable)break;
  movable.count--;put(room,movable.type,1);
  if(movable.count<=0)floors[over].spaces=floors[over].spaces.filter(s=>s!==movable);
 }
 return floors;
}
export function buildProgram(text:string,previous:Brief|null,analysis?:ModelRequest):Brief{
 const context=resolveRequest(text,previous,'',analysis);
 previous=context.previous;
 text=context.text;
 const kind=context.kind;
 if(!kind||kind==='unsupported')throw Error('Specify a supported project type: house, apartment building or resort. Other uses need a dedicated planning profile.');
 const m=siteMeasurements(text,previous?.site);
 if(!m.width||!m.depth)throw Error('Give the site dimensions or total area, for example “20 × 30 ft” or “1.5 acres”. I can propose the remaining program.');
 const maxSide=kind==='resort'?2000:300;
 if(m.width<15||m.depth<15||m.width>maxSide||m.depth>maxSide)throw Error(`${kind} concepts support site sides from 15 to ${maxSide.toLocaleString('en-US')} feet.`);
 const features=mergeFeatures(text,previous?.features,analysis?.features);
 // One phrase can name different things in different buildings: an entrance
 // lobby is a reception in a hotel and simply the entrance in a house. Where
 // the reading we were given does not belong to this building type, prefer
 // one that does and that the requester's own words still support.
 for(const f of features){
  if(f.excluded||FEATURE_CATALOG[f.kind].profiles.includes(kind))continue;
  const alt=Object.keys(FEATURE_CATALOG).find(k=>FEATURE_CATALOG[k].profiles.includes(kind)&&typeof f.evidence==='string'&&new RegExp(`\\b(?:${FEATURE_CATALOG[k].pattern})\\b`,'i').test(f.evidence));
  if(alt)f.kind=alt;
 }
 const unsupported=features.filter(f=>!f.excluded&&!FEATURE_CATALOG[f.kind].profiles.includes(kind));
 if(unsupported.length)throw Error(`${kind} planning does not yet support: ${unsupported.map(f=>FEATURE_CATALOG[f.kind].label).join(', ')}. The requested feature will not be substituted with another amenity.`);
 const b:Brief={kind,features,groundParkingOnly:previous?.groundParkingOnly,site:{width:m.width,depth:m.depth,facing:m.facing,areaSqFt:m.areaSqFt,assumedShape:m.assumedShape},floors:[],assumptions:[],automatic:false};
 if(m.assumedShape)b.assumptions!.push(`Only the area was supplied. A rectangular ${m.width.toFixed(1)} × ${m.depth.toFixed(1)} ft site is assumed; supply actual sides to change its shape.`);
 if(!/\b(north|south|east|west)\b/i.test(text)&&!previous)b.assumptions!.push('South-facing access assumed.');
 const has=(id:string)=>features.some(f=>f.kind===id&&!f.excluded);
 if(/\b(?:keep|reserve)\s+(?:the\s+)?ground(?:\s+floor)?\s+(?:only\s+)?for\s+(?:car\s+)?parking\b|\bground(?:\s+floor)?[^.;\n]*\b(?:parking\s+only|only\s+(?:car\s+)?parking)\b/i.test(text))b.groundParkingOnly=true;

 b.lift=has('lift');b.shelter=has('seating');b.liftToTerrace=b.lift&&(previous?.liftToTerrace||/\b(?:lift|elevator)[^.\n]*\b(?:to|through|including)\s+(?:the\s+)?terrace\b/i.test(text));
 if(kind==='resort'){
  b.mainZoneAreaSqFt=m.mainZoneAreaSqFt??previous?.mainZoneAreaSqFt??m.width*m.depth*.23;
  if(b.mainZoneAreaSqFt>=m.width*m.depth*.75)throw Error('The main development zone leaves too little site area for accommodation and outdoor uses. Reduce that allocation.');
  // A broad resort request gets a disclosed starter program. Detailed requests
  // keep their own amenity list, including explicit exclusions.
  if(!features.some(f=>!f.excluded&&['cottage','pool','reception','restaurant'].includes(f.kind))) {
   for(const id of ['cottage','reception','restaurant','kitchen','common','service','parking','garden'])if(!features.some(f=>f.kind===id))features.push({kind:id,count:null,evidence:'',source:'default'});
   b.assumptions!.push('Starter resort program assumed: cottages, reception, dining/kitchen, common/service areas, parking and gardens.');b.automatic=true;
  }
  for(const id of ['entrance','path','road'])if(!features.some(f=>f.kind===id))features.push({kind:id,count:null,evidence:'',source:'default'});
  if(m.mainZoneAreaSqFt===undefined&&!previous?.mainZoneAreaSqFt)b.assumptions!.push('23% of the site is reserved for the main development zone; this is a planning assumption.');
  b.floors=[{label:'Site masterplan',role:'residential',spaces:[]}];return b;
 }
 const lettable=detectLettable(text)||previous?.lettable===true;
 b.lettable=lettable;
 const g=text.match(/\bg\s*(?:\+|plus)\s*(\d+|one|two|three|four)\b/i);
 const nums:Record<string,number>={one:1,two:2,three:3,four:4};
 const floorCount=text.match(/\b(\d+)\s*[- ]?(?:storey|story|storeys|stories|floors?)\b/i);
 const storeys=floorCount?Number(floorCount[1]):g?(/^[0-9]+$/.test(g[1])?Number(g[1]):nums[g[1].toLowerCase()])+1:previous?.floors.filter(f=>f.role!=='terrace').length??1;
 if(!Number.isInteger(storeys)||storeys<1||storeys>5)throw Error('The residential planners currently support up to G+4, plus an optional terrace.');
 if(kind==='apartment'){
  b.bedroomsPerUnit=Number(text.match(/\b([123])\s*[- ]?bhk\b/i)?.[1])||previous?.bedroomsPerUnit||2;
  const asked=Number(text.match(/\b(\d+)\s*(?:units?|flats?|apartments?)\s*(?:per|on each|each)\s*floor/i)?.[1])||previous?.unitsPerFloor;
  // Nobody said how many units a floor should hold, so work it out from what
  // the plate can serve rather than assuming a number and failing on it.
  const fits=fitUnits(m.width,m.depth,b.bedroomsPerUnit,m.facing);
  if(!asked&&!fits)throw Error(`A shared-corridor apartment building needs more depth back from the road than a ${m.width} × ${m.depth} ft plot entered from the ${m.facing.toLowerCase()} gives. Ask for a house with rental units instead, and each floor becomes one self-contained let.`);
  b.unitsPerFloor=asked||fits;
  if(b.unitsPerFloor<1||b.unitsPerFloor>4)throw Error('The apartment planner supports one to four units per floor.');
  if(!asked)b.assumptions!.push(`${fits} unit${fits>1?'s':''} per floor is what this plate serves with a shared corridor and core; ask for a different number and I will say whether it fits.`);
  b.floors=Array.from({length:storeys},(_,i)=>({label:i?`Floor ${i}`:'Ground',role:i===0&&has('parking')?'stilt':'residential',spaces:[]}));
  b.assumptions!.push(`${b.unitsPerFloor} apartments per residential floor, ${b.bedroomsPerUnit} bedrooms per apartment${previous?'':' assumed unless specified'}.`);b.automatic=true;return b;
 }
 const explicit=explicitFloorSpaces(text);
 const names=['Ground','First','Second','Third','Fourth'];
 const completeFloors=names.slice(0,storeys).every(label=>explicit.has(label.toLowerCase()));
 const scopedKinds=new Set<string>();
 if(completeFloors&&!/\b(?:add|remove|omit|exclude|move)\b/i.test(text)){
  b.floors=names.slice(0,storeys).map((label,i)=>({label,role:i===0&&explicit.get('ground')!.some(s=>s.type==='parking')?'stilt':'residential',spaces:explicit.get(label.toLowerCase())??[]}));
 } else if(previous?.floors.length){
  b.floors=structuredClone(previous.floors);
  b.automatic=previous.automatic;
  const residential=b.floors.filter(f=>f.role!=='terrace'),roof=b.floors.filter(f=>f.role==='terrace');
  if(storeys<residential.length){
   const removed=residential.splice(storeys),target=residential.at(-1)!;
   for(const old of removed)for(const room of old.spaces){const existing=target.spaces.find(s=>s.type===room.type);if(existing)existing.count+=room.count;else target.spaces.push({...room});}
   if(target.spaces.some(s=>s.type!=='parking'))target.role='residential';
   b.assumptions!.push(`Rooms from removed floors are retained on ${target.label}; move them as needed.`);
  }
  while(residential.length<storeys){
   residential.push({label:names[residential.length],role:'residential',spaces:lettable?unitSpaces(m.width,m.depth):[space('bedroom'),space('bathroom')]});
   b.assumptions!.push(`${residential.at(-1)!.label} floor uses ${lettable?'a self-contained rental unit':'an assumed bedroom and bathroom'}; specify its rooms to replace this program.`);
  }
  b.floors=[...residential,...roof];
  const operations=/\b(?:add|remove|omit|exclude|move|replace)\b/i.test(text);
  for(const [label,spaces]of explicit){
   const floor=b.floors.find(f=>f.label.toLowerCase()===label);
   if(!floor)throw Error(`There is no ${label} floor in this project. Change the storey count first.`);
   if(!operations){for(const room of [...floor.spaces,...spaces])scopedKinds.add(room.type);floor.spaces=spaces;}
  }
  const mentioned=[...new Set([...text.matchAll(/\b(ground|first|second|third|fourth|terrace)(?:\s+floor)?\b/gi)].map(m=>m[1].toLowerCase()))];
  const changes=explicitFeatures(text).filter(f=>(briefSpaceTypes as readonly string[]).includes(f.kind));
  const move=/\bmove\b/i.test(text);
  if(changes.length&&mentioned.length>1&&!move&&operations)throw Error('Apply room corrections to one floor at a time, or use “move [room] from [floor] to [floor]”.');
  for(const change of changes){
   // A complete floor heading already replaced its room list above.
   if(explicit.size&&!operations)continue;
   const targetName=mentioned[0],named=targetName?b.floors.find(f=>f.label.toLowerCase()===targetName):undefined;
   if(targetName&&!named)throw Error(`There is no ${targetName} floor in this project. Change the storey count first.`);
   if(move){
    const from=text.match(/\bfrom\s+(?:the\s+)?(ground|first|second|third|fourth|terrace)\b/i)?.[1].toLowerCase();
    const to=text.match(/\bto\s+(?:the\s+)?(ground|first|second|third|fourth|terrace)\b/i)?.[1].toLowerCase();
    const source=b.floors.find(f=>f.label.toLowerCase()===from),destination=b.floors.find(f=>f.label.toLowerCase()===to);
    if(!source||!destination||source===destination)throw Error('Specify different existing source and destination floors, for example “Move one bedroom from second floor to first floor”.');
    const old=source.spaces.find(s=>s.type===change.kind),count=change.count??old?.count??0;
    if(!old||count>old.count)throw Error(`${source.label} does not contain ${count||'the requested'} ${change.kind}.`);
    old.count-=count;source.spaces=source.spaces.filter(s=>s.count>0);
    const existing=destination.spaces.find(s=>s.type===change.kind);if(existing)existing.count+=count;else destination.spaces.push(space(change.kind as SpaceRequest['type'],count));
    if(destination.role==='stilt'&&change.kind!=='parking')destination.role='residential';
    scopedKinds.add(change.kind);continue;
   }
   const adding=/\badd\b/i.test(text);
   const removing=change.excluded===true;
   // Global exclusions are unambiguous; a numeric delta or addition needs a floor.
   if(!named&&residential.length>1&&(adding||change.count!==null))throw Error(`Specify the floor for the ${change.kind} correction so other floors keep their requirements.`);
   const targets=named?[named]:removing?b.floors:residential.length===1?[residential[0]]:[];
   if(!targets.length)throw Error(`Specify the floor and count for ${change.kind}.`);
   for(const floor of targets){
    const old=floor.spaces.find(s=>s.type===change.kind);
    if(removing){
     if(change.count!==null){if(!old||old.count<change.count)throw Error(`${floor.label} does not contain ${change.count} ${change.kind}.`);old.count-=change.count;floor.spaces=floor.spaces.filter(s=>s.count>0);}
     else floor.spaces=floor.spaces.filter(s=>s.type!==change.kind);
    }else if(adding){if(old)old.count+=change.count??1;else floor.spaces.push(space(change.kind as SpaceRequest['type'],change.count??1));}
    else if(change.count!==null){if(old)old.count=change.count;else floor.spaces.push(space(change.kind as SpaceRequest['type'],change.count));}
    else if(!old)floor.spaces.push(space(change.kind as SpaceRequest['type']));
    if(floor.role==='stilt'&&floor.spaces.some(s=>s.type!=='parking'&&s.type!=='entrance'))floor.role='residential';
   }
   scopedKinds.add(change.kind);
  }
 }else if(lettable&&storeys>1){
  // Every upper floor is its own dwelling, sized to what the plate can take.
  b.automatic=true;b.lettable=true;
  const plate=buildablePlate(m.width,m.depth),unit=unitSpaces(m.width,m.depth);
  const beds=unit.find(s=>s.type==='bedroom')!.count;
  const names=['Ground','First','Second','Third','Fourth'];
  b.floors=Array.from({length:storeys},(_,i):FloorBrief=>i===0
   ?{label:'Ground',role:'stilt',spaces:[space('parking')]}
   :{label:names[i],role:'residential',spaces:unit.map(s=>({...s}))});
  b.assumptions!.push(`Let out by floor: each upper level is a self-contained unit with its own living room, kitchen, bathroom and ${beds} bedroom${beds>1?'s':''}, reached from the shared stair core.`);
  b.assumptions!.push(`${storeys-1} lettable floors over ground-level parking, on a ${plate.w.toFixed(0)} × ${plate.d.toFixed(0)} ft buildable plate. Rooms front the landing directly, so the plot's width sets the unit size; ask for a wider plot or smaller rooms to change it.`);
  if(!features.some(f=>f.kind==='parking'))features.push({kind:'parking',count:1,evidence:'',source:'default'});
 }else{
  b.automatic=true;
  const small=m.width*m.depth<900;
  // Counts the person actually asked for, placed on floors for them.
  const want=new Map(features.filter(f=>!f.excluded&&f.source==='requested'&&(briefSpaceTypes as readonly string[]).includes(f.kind)&&f.count!==null).map(f=>[f.kind,f.count as number]));
  for(const f of features)if(!f.excluded&&f.source==='requested'&&(briefSpaceTypes as readonly string[]).includes(f.kind)&&!want.has(f.kind))want.set(f.kind,1);
  // With nothing asked for, keep the established default program. Spreading
  // rooms over floors is for briefs that actually name rooms without saying
  // which floor they belong on.
  b.floors=want.size?distributeProgram(storeys,want,small):Array.from({length:storeys},(_,i):FloorBrief=>({label:['Ground','First','Second','Third','Fourth'][i]??`Level ${i+1}`,role:i===0&&storeys>1?'stilt':'residential',spaces:i===0&&storeys>1?[space('parking')]:i===(storeys>1?1:0)?[space('living'),space('kitchen'),space('bathroom')]:i===storeys-1?[space('master'),space('bathroom')]:[space('bedroom',small?1:2),space('bathroom')]}));
  if(!want.size&&storeys===1)b.floors[0].spaces.push(space('bedroom'));
  b.assumptions!.push(want.size?'Independent family house assumed. The rooms you asked for are spread over the floors; tell me to move any of them.':'Independent family house assumed. Floor purposes and room counts are proposed automatically; tell me what to change.');
  if(storeys>1&&!features.some(f=>f.kind==='parking'))features.push({kind:'parking',count:1,evidence:'',source:'default'});
  if(small)b.assumptions!.push('A compact sleeping-floor program is proposed to protect room sizes and circulation. A lift is included only when requested.');
 }
 if(!previous&&b.automatic&&storeys===1){
  for(const f of features){if(!(briefSpaceTypes as readonly string[]).includes(f.kind)||has('terrace')&&['garden','jacuzzi','seating'].includes(f.kind))continue;
   b.floors[0].spaces=b.floors[0].spaces.filter(s=>s.type!==f.kind);
   if(!f.excluded)b.floors[0].spaces.push(space(f.kind as SpaceRequest['type'],f.count??1));
  }
 }
 if(has('terrace')&&!b.floors.some(f=>f.role==='terrace')){
  const roof=explicit.get('terrace')??features.filter(f=>!f.excluded&&['garden','jacuzzi','seating'].includes(f.kind)).map(f=>space(f.kind as SpaceRequest['type'],f.count??1));
  b.floors.push({label:'Terrace',role:'terrace',spaces:roof.length?roof:[space('seating')]});
 }
 if(features.some(f=>f.kind==='terrace'&&f.excluded)){
  for(const floor of b.floors.filter(f=>f.role==='terrace'))for(const room of floor.spaces)scopedKinds.add(room.type);
  b.floors=b.floors.filter(f=>f.role!=='terrace');
 }
 for(const f of features.filter(f=>f.excluded&&!scopedKinds.has(f.kind)))for(const floor of b.floors)floor.spaces=floor.spaces.filter(s=>s.type!==f.kind);
 // Floor-scoped edits change only their target. Reconcile the global inventory
 // from the resulting program so a local exclusion cannot erase another floor.
 for(const kind of scopedKinds){
  const count=b.floors.flatMap(f=>f.spaces).filter(s=>s.type===kind).reduce((n,s)=>n+s.count,0);
  const feature=features.find(f=>f.kind===kind);
  if(feature){feature.count=count||null;feature.excluded=count===0;}
 }

 if(b.groundParkingOnly&&b.floors[0]?.spaces.some(s=>!['parking','entrance'].includes(s.type))){
  if(/\b(?:add|move|change|replace)\b/i.test(text)&&/\bground\b/i.test(text))b.groundParkingOnly=false;
  else throw Error('The ground floor is reserved for parking. Move its other rooms to another floor or change that restriction.');
 }
 // One generic omission check, based on the active brief, replaces checks
 // named after individual example amenities.
 const produced=new Set(b.floors.flatMap(f=>f.spaces.map(s=>s.type as string)));if(b.lift)produced.add('lift');produced.add('stairs');produced.add('entrance');if(b.floors.some(f=>f.role==='terrace'))produced.add('terrace');
 const missing=features.filter(f=>f.source==='requested'&&!f.excluded&&!produced.has(f.kind));
 if(missing.length)throw Error(`Specify the floor for: ${missing.map(f=>FEATURE_CATALOG[f.kind].label).join(', ')}. These requested spaces have not been silently discarded.`);
 return b;
}
