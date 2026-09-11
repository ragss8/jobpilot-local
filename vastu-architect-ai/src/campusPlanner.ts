import {validateInventory,projectInventory} from './featureValidation';
import {defaultProject,uid,type Project} from './engine';
import type {Brief} from './brief';
import type {CampusLayout,SiteElement} from './projectTypes';
import type {PlanningResult} from './residentialPlanner';
type Rect={x:number;y:number;w:number;d:number};
const EPS=.05;
const PUBLIC_KINDS=['reception','restaurant','bar','kitchen','common','service','utility','store','bathroom'];
const LEISURE_KINDS=['pool','deck','recreation','seating','jacuzzi'];
const SUPPORTED=new Set([...PUBLIC_KINDS,...LEISURE_KINDS,'cottage','parking','garden','entrance','road','path']);
const area=(r:Rect)=>r.w*r.d;
const overlap=(a:Rect,b:Rect)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>EPS&&Math.min(a.y+a.d,b.y+b.d)-Math.max(a.y,b.y)>EPS;
const contains=(a:Rect,b:Rect)=>b.x>=a.x-EPS&&b.y>=a.y-EPS&&b.x+b.w<=a.x+a.w+EPS&&b.y+b.d<=a.y+a.d+EPS;
const validRect=(r:Rect)=>[r.x,r.y,r.w,r.d].every(Number.isFinite)&&r.w>0&&r.d>0;
/** Shared edges count as access; touching at a corner does not. */
const touches=(a:Rect,b:Rect)=>{
 const x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),y=Math.min(a.y+a.d,b.y+b.d)-Math.max(a.y,b.y);
 return x>=-EPS&&y>=-EPS&&(x>EPS||y>EPS);
};
function door(e:SiteElement){
 switch(e.doorSide??'s'){
  case 'n':return {x:e.x+e.w/2,y:e.y};
  case 'e':return {x:e.x+e.w,y:e.y+e.d/2};
  case 'w':return {x:e.x,y:e.y+e.d/2};
  default:return {x:e.x+e.w/2,y:e.y+e.d};
 }
}
const atDoor=(e:SiteElement,r:Rect)=>{const p=door(e);return p.x>=r.x-EPS&&p.x<=r.x+r.w+EPS&&p.y>=r.y-EPS&&p.y<=r.y+r.d+EPS;};
function streetEdge(e:Rect,p:Project){
 switch(p.site.facing){case 'North':return Math.abs(e.y)<EPS;case 'East':return Math.abs(e.x+e.w-p.site.width)<EPS;case 'West':return Math.abs(e.x)<EPS;default:return Math.abs(e.y+e.d-p.site.depth)<EPS;}
}
export function validateCampus(p:Project):string[]{
 const c=p.campus;if(!c)return ['Missing site layout.'];const errors:string[]=[];
 const site={x:0,y:0,w:p.site.width,d:p.site.depth};
 if(!validRect(site))errors.push('The site has invalid geometry.');
 const ids=new Set<string>();
 for(const e of c.elements){
  if(ids.has(e.id))errors.push(`${e.name}: duplicate element identifier.`);ids.add(e.id);
  if(!validRect(e)||!Number.isFinite(e.height))errors.push(`${e.name}: invalid geometry.`);
  if(!contains(site,e))errors.push(`${e.name} crosses the site boundary.`);
  if(e.quantity!==undefined&&(!Number.isInteger(e.quantity)||e.quantity<1))errors.push(`${e.name}: invalid capacity.`);
  if(e.quantity!==undefined&&e.quantity!==1&&e.kind!=='parking')errors.push(`${e.name}: individual features require separate geometry.`);
 }
 const solid=c.elements.filter(e=>!['garden','zone','deck','path','entrance'].includes(e.kind));
 for(let i=0;i<solid.length;i++)for(let j=i+1;j<solid.length;j++)if(overlap(solid[i],solid[j]))errors.push(`${solid[i].name} overlaps ${solid[j].name}.`);
 for(const deck of c.elements.filter(e=>e.kind==='deck'))for(const e of solid.filter(e=>e.kind!=='pool'))if(overlap(deck,e))errors.push(`${deck.name} overlaps ${e.name}.`);
 if(!validRect(c.mainZone)||!contains(site,c.mainZone))errors.push('The main development zone has invalid geometry or crosses the site boundary.');
 if(!Number.isFinite(c.mainZoneAreaSqFt)||!Number.isFinite(c.requestedMainZoneSqFt)||c.requestedMainZoneSqFt<=0||Math.abs(area(c.mainZone)-c.requestedMainZoneSqFt)>1||Math.abs(c.mainZoneAreaSqFt-area(c.mainZone))>1)errors.push('The main development zone does not match the requested allocation.');
 if(!Number.isFinite(c.siteAreaSqFt)||Math.abs(c.siteAreaSqFt-area(site))>1)errors.push('The reported site area does not match its geometry.');
 for(const e of c.elements.filter(e=>PUBLIC_KINDS.includes(e.kind)))if(!contains(c.mainZone,e))errors.push(`${e.name} lies outside the main development zone.`);
 const inventory=projectInventory(p);
 errors.push(...validateInventory(p.programFeatures??[],inventory));
 for(const [key,kind]of [['cottages','cottage'],['parking','parking']] as const)if(c.capacity[key]!== (inventory[kind]??0))errors.push(`Reported ${key} capacity does not match the geometry.`);
 // A front-door path is only useful if it is part of a network that reaches
 // the requested street. Isolated decorative paths cannot satisfy access.
 const network=c.elements.filter(e=>['path','road','entrance','deck'].includes(e.kind));
 const starts=network.filter(e=>e.kind==='entrance'&&streetEdge(e,p));
 if(!starts.length)errors.push(`The site needs an entrance on its ${p.site.facing.toLowerCase()} street edge.`);
 const reached=new Set(starts.map(e=>e.id));let changed=true;
 while(changed){changed=false;for(const e of network)if(!reached.has(e.id)&&network.some(other=>reached.has(other.id)&&touches(e,other))){reached.add(e.id);changed=true;}}
 for(const e of network.filter(e=>e.kind==='path'||e.kind==='road'))if(!reached.has(e.id))errors.push(`${e.name} is disconnected from the site entrance.`);
 for(const e of c.elements.filter(e=>e.building||['pool','jacuzzi','recreation'].includes(e.kind))){
  if(!network.some(r=>r.id!==e.id&&reached.has(r.id)&&r.kind!=='road'&&atDoor(e,r)))errors.push(`${e.name} has no connected pedestrian path at its entrance.`);
 }
 for(const path of network.filter(e=>e.kind==='path'))for(const obstacle of solid.filter(e=>e.kind!=='road'))if(overlap(path,obstacle))errors.push(`${path.name} passes through ${obstacle.name}.`);
 for(const parking of c.elements.filter(e=>e.kind==='parking')){
  const bays=parking.quantity??1;
  if(!((parking.w>=19-EPS&&parking.d>=bays*9-EPS)||(parking.d>=19-EPS&&parking.w>=bays*9-EPS)))errors.push(`${parking.name}: requested parking capacity exceeds the bay strip.`);
  if(!network.some(e=>e.kind==='road'&&reached.has(e.id)&&touches(parking,e)))errors.push(`${parking.name} has no vehicle access.`);
 }
 return [...new Set(errors)];
}
/** Build in a south-facing frame, then transform every footprint and door. */
function orient<T extends Rect>(r:T,W:number,D:number,facing:Project['site']['facing'],mirror:boolean):T {
 const out={...r} as T&{doorSide?:SiteElement['doorSide']};
 if(mirror){out.x=W-out.x-out.w;if(out.doorSide==='e')out.doorSide='w';else if(out.doorSide==='w')out.doorSide='e';}
 if(facing==='North'||facing==='West'){out.y=D-out.y-out.d;if(out.doorSide==='n')out.doorSide='s';else if(out.doorSide==='s')out.doorSide='n';}
 if(facing==='East'||facing==='West'){
  [out.x,out.y,out.w,out.d]=[out.y,out.x,out.d,out.w];
  if(out.doorSide)out.doorSide=({n:'w',s:'e',e:'s',w:'n'} as const)[out.doorSide];
 }
 if(Math.abs(out.x)<1e-8)out.x=0;if(Math.abs(out.y)<1e-8)out.y=0;
 return out;
}
function candidate(brief:Brief,gap:number,cottageSide:number,mirror:boolean):Project {
 const p=defaultProject();p.name='Your resort masterplan';p.kind='resort';p.site={...brief.site,setback:12,front:12};p.requirements.bedrooms=0;
 p.floors=[{id:uid(),name:'Site masterplan',role:'residential',height:12,rooms:[]}];
 const sideways=['East','West'].includes(p.site.facing),W=sideways?p.site.depth:p.site.width,D=sideways?p.site.width:p.site.depth;
 const pad=12,roadW=16,parkingW=22,pathW=6,innerW=W-2*pad-roadW-parkingW-pathW;
 const target=brief.mainZoneAreaSqFt??W*D*.23,mainD=target/innerW,mainY=D-pad-mainD;
 if(!Number.isFinite(target)||target<=0||innerW<36||mainY<pad||mainD<30)throw Error('The site cannot fit the main zone and separate access under this arrangement. Adjust the main-zone allocation or provide a larger site.');
 const elements:SiteElement[]=[];
 const add=(kind:string,name:string,x:number,y:number,w:number,d:number,height=0,building=false)=>{const e:SiteElement={id:uid(),kind,name,x,y,w,d,height,building,doorSide:'s'};elements.push(e);return e;};
 const has=(kind:string)=>brief.features?.some(f=>f.kind===kind&&!f.excluded);
 const excluded=(kind:string)=>brief.features?.some(f=>f.kind===kind&&f.excluded);
 const count=(kind:string,fallback=1)=>brief.features?.find(f=>f.kind===kind&&!f.excluded)?.count??fallback;
 const roadX=W-pad-roadW,spineX=roadX-parkingW-pathW;
 add('road','Vehicle access',roadX,pad,roadW,D-pad);
 const parkingCount=has('parking')?count('parking',8):0;
 if(parkingCount*9>D-2*pad)throw Error('The requested parking count exceeds the available access-side bay strip.');
 if(parkingCount)Object.assign(add('parking',`${parkingCount} parking bays`,roadX-parkingW,D-pad-parkingCount*9,parkingW,parkingCount*9),{quantity:parkingCount});
 add('path','Pedestrian spine',spineX,pad,pathW,D-pad*2);
 add('path','Arrival crossing',spineX,D-pad,W-pad-spineX,pathW);
 add('entrance','Resort entrance',roadX,D-8,roadW,8);
 const mainZone={x:pad,y:mainY,w:innerW,d:mainD};
 const facilities=(brief.features??[]).filter(f=>!f.excluded&&PUBLIC_KINDS.includes(f.kind));
 if(!facilities.length)throw Error('Describe the public facilities for the main development zone.');
 const expanded=facilities.flatMap(f=>Array.from({length:f.count??1},()=>f));
 const facilityRows=Math.min(2,expanded.length),columns=Math.ceil(expanded.length/facilityRows),cellW=(innerW-pathW*(columns+1))/columns,cellD=(mainD-pathW*(facilityRows+1))/facilityRows;
 if(cellW<14||cellD<12)throw Error('Too many common facilities for the allocated main zone.');
 add('path','Public arrival walk',pad,mainY-pathW,innerW+pathW,pathW);
 for(let row=0;row<facilityRows;row++){
  const y=mainY+pathW+row*(cellD+pathW);
  add('path',`Public courtyard ${row+1}`,pad,y+cellD,innerW+pathW,pathW);
  for(let col=0;col<columns;col++){
   const f=expanded[row*columns+col];if(!f)continue;
   const labels:Record<string,string>={reception:'Reception',restaurant:'Restaurant',bar:'Resto-bar',kitchen:'Main kitchen',common:'Common facilities',service:'Service area',bathroom:'Restrooms',utility:'Laundry',store:'Storage'};
   add(f.kind,`${labels[f.kind]??f.kind} ${row*columns+col+1}`,pad+pathW+col*(cellW+pathW),y,cellW,cellD,12,true);
  }
 }
 // Every requested outdoor amenity gets a distinct footprint. Shelf packing
 // makes the leisure allocation grow with counts instead of dropping copies.
 type Leisure={kind:string;w:number;d:number;poolDeck?:boolean;x?:number;y?:number;row?:number};
 const leisure:Leisure[]=[];
 const pools=has('pool')?count('pool'):0,deckCount=has('deck')?count('deck'):0;
 for(let i=0;i<pools;i++)leisure.push({kind:'pool',w:excluded('deck')?50:70,d:excluded('deck')?28:48,poolDeck:!excluded('deck')});
 for(let i=0;i<Math.max(0,deckCount-(excluded('deck')?0:pools));i++)leisure.push({kind:'deck',w:48,d:32});
 for(const [kind,w,d]of [['recreation',32,32],['seating',28,30],['jacuzzi',12,12]] as const)if(has(kind))for(let i=0;i<count(kind);i++)leisure.push({kind,w,d});
 let cursorX=0,cursorY=0,row=0,rowHeight=0;
 const leisureRows:{y:number;d:number}[]=[];
 for(const e of leisure){
  if(e.w>innerW)throw Error(`The available leisure-zone width cannot fit ${e.kind}.`);
  if(cursorX&&cursorX+e.w>innerW){leisureRows.push({y:cursorY,d:rowHeight});cursorY+=rowHeight+pathW+gap;cursorX=0;rowHeight=0;row++;}
  e.x=pad+cursorX;e.y=cursorY;e.row=row;cursorX+=e.w+gap;rowHeight=Math.max(rowHeight,e.d);
 }
 if(leisure.length)leisureRows.push({y:cursorY,d:rowHeight});
 const leisureDepth=leisure.length?cursorY+rowHeight+pathW:0,leisureY=mainY-pathW-leisureDepth;
 if(leisureY<pad)throw Error('The requested outdoor amenities exceed the remaining site depth. Reduce amenity counts or the main-zone allocation.');
 leisureRows.forEach((r,i)=>add('path',`Leisure walk ${i+1}`,pad,leisureY+r.y+r.d,innerW+pathW,pathW));
 leisure.forEach((e,i)=>{
  const x=e.x!,y=leisureY+e.y!,walkY=leisureY+leisureRows[e.row!].y+leisureRows[e.row!].d;
  if(e.kind==='pool'&&e.poolDeck){add('deck',`Pool deck ${i+1}`,x,y,e.w,e.d);add('pool',`Swimming pool ${i+1}`,x+10,y+8,e.w-20,e.d-20,-4);}
  else add(e.kind,`${e.kind[0].toUpperCase()+e.kind.slice(1)} ${i+1}`,x,y,e.w,e.d,e.kind==='seating'?9:e.kind==='pool'?-4:e.kind==='jacuzzi'?2.4:0,e.kind==='seating');
  if(walkY>y+e.d+EPS)add('path',`Leisure approach ${i+1}`,x+e.w/2-pathW/2,y+e.d,pathW,walkY-y-e.d);
 });
 const cottageEnd=leisureY-gap,cottageW=cottageSide,cottageD=cottageSide;
 const cols=Math.max(0,Math.floor((innerW+gap)/(cottageW+gap))),rows=Math.max(0,Math.floor((cottageEnd-pad+gap)/(cottageD+gap+pathW)));
 const capacity=cols*rows,requested=has('cottage')?count('cottage',Math.min(8,capacity)):0;
 if(has('cottage')&&(requested<1||requested>capacity))throw Error(`This arrangement fits ${capacity} cottages with ${gap} ft separation; ${requested} are requested.`);
 for(let i=0;i<requested;i++){
  const row=Math.floor(i/cols),col=i%cols,x=pad+col*(cottageW+gap),y=pad+row*(cottageD+gap+pathW);
  add('cottage',`Private cottage ${i+1}`,x,y,cottageW,cottageD,11,true);
  add('path',`Cottage ${i+1} approach`,x+cottageW/2-2,y+cottageD,4,gap/2);
  if(col===0)add('path',`Cottage walk ${row+1}`,pad,y+cottageD+gap/2,innerW+pathW,pathW);
 }
 if(has('garden'))for(let i=0;i<count('garden');i++)add('garden',`Landscaped garden ${i+1}`,i*W/count('garden'),0,W/count('garden'),pad);
 p.programFeatures=brief.features??[];
 const c:CampusLayout={elements:elements.map(e=>orient(e,W,D,p.site.facing,mirror)),mainZone:orient(mainZone,W,D,p.site.facing,mirror),siteAreaSqFt:W*D,mainZoneAreaSqFt:area(mainZone),requestedMainZoneSqFt:target,capacity:{cottages:requested,parking:parkingCount},notes:[`${requested} cottages, each ${cottageSide} × ${cottageSide} ft, with ${gap} ft spacing.`,`${parkingCount} parking bays have access from a separate ${roadW} ft vehicle lane.`, 'Public buildings, cottages and outdoor amenities connect to the site entrance through pedestrian paths.', 'Road turning radii, gradients and emergency access are not engineered.']};
 p.campus=c;return p;
}
export function planCampus(brief:Brief):PlanningResult {
 const proposals:PlanningResult['proposals']=[],failures=new Set<string>();let attempted=0,rejected=0;
 const unsupported=(brief.features??[]).filter(f=>!f.excluded&&!SUPPORTED.has(f.kind));
 const malformed=(brief.features??[]).filter(f=>!f.excluded&&f.count!==null&&(!Number.isInteger(f.count)||f.count<1||f.count>500));
 if(unsupported.length||malformed.length)return {proposals:[],attempted:0,rejected:0,reasons:[...unsupported.map(f=>`The resort planner does not yet provide ${f.kind} geometry. That requirement has not been omitted.`),...malformed.map(f=>`Requested ${f.kind} count must be an integer from 1 to 500.`)],assumptions:brief.assumptions??[]};
 for(const gap of [12,16,20])for(const side of [24,28,32])for(const mirror of [false,true]){
  attempted++;try{const p=candidate(brief,gap,side,mirror);const errors=validateCampus(p);if(errors.length)throw Error(errors[0]);proposals.push({project:p,score:p.campus!.capacity.cottages*4+side*.2+gap*.3,notes:p.campus!.notes});}catch(e){rejected++;failures.add((e as Error).message);}
 }
 const best=proposals.sort((a,b)=>b.score-a.score).slice(0,3);best.forEach((p,i)=>p.project.variant=i);
 return {proposals:best,attempted,rejected,reasons:best.length?[]:[...failures].slice(0,4),assumptions:[...(brief.assumptions??[]), 'Areas are planning allocations; the masterplan is not a surveyed site or construction drawing.', 'Cottages are individual building footprints with conceptual interiors, not detailed construction plans.']};
}
