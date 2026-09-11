import type {Brief} from './brief';
import type {Project,Room} from './engine';
import type {FeatureRequest} from './projectTypes';

/** Counts describe usable capacity. A single parking room can hold several
 * cars; a label or an empty parking rectangle is not evidence of capacity. */
export function roomQuantity(room:Room):number {
 return room.type==='parking'?room.furniture.filter(item=>item.kind==='car').length:1;
}
export function validateInventory(features:FeatureRequest[],inventory:Record<string,number>):string[]{
 return [...new Set(features.flatMap(f=>{
  const actual=Object.hasOwn(inventory,f.kind)?inventory[f.kind]:0;
  if(!Number.isInteger(actual)||actual<0)return [`Feature ${f.kind} has invalid inventory capacity.`];
  if(f.excluded)return actual?[`Excluded feature ${f.kind} is still present.`]:[];
  if(f.count!==null&&(!Number.isInteger(f.count)||f.count<1))return [`Requested feature ${f.kind} has an invalid count.`];
  if(!actual)return [`Requested feature ${f.kind} is missing.`];
  if(f.count!==null&&actual<f.count)return [`Requested ${f.count} ${f.kind}; found ${actual}.`];
  return [];
 }))];
}
export function projectInventory(p:Project):Record<string,number>{
 const inventory:Record<string,number>=Object.create(null);
 const add=(kind:string,quantity:number)=>{inventory[kind]=(inventory[kind]??0)+quantity;};
 for(const e of p.campus?.elements??[])add(e.kind,e.quantity??1);
 if(!p.campus){
  for(const f of p.floors){for(const r of f.rooms)add(r.type,roomQuantity(r));if(f.role==='terrace')add('terrace',1);}
 }
 return inventory;
}
function opensInto(room:Room,target:Room):boolean {
 const horizontal=room.doorSide==='n'||room.doorSide==='s';
 const along=(horizontal?room.w:room.d)-3;
 const offset=Math.max(0,along)*room.doorOffset+1.5;
 const x=horizontal?room.x+offset:room.doorSide==='w'?room.x:room.x+room.w;
 const y=horizontal?room.doorSide==='n'?room.y:room.y+room.d:room.y+offset;
 return x>=target.x-.05&&x<=target.x+target.w+.05&&y>=target.y-.05&&y<=target.y+target.d+.05;
}
function apartmentRequirements(brief:Brief,p:Project):string[]{
 const errors:string[]=[];
 const expectedUnits=brief.unitsPerFloor??2,expectedBeds=brief.bedroomsPerUnit??2;
 for(const f of p.floors){
  const units=new Set(f.rooms.map(r=>r.unitId).filter((id):id is string=>Boolean(id)));
  if(f.role!=='residential'){
   if(units.size)errors.push(`${f.name}: ${f.role} floors cannot contain apartment units.`);
  }else{
   if(units.size!==expectedUnits)errors.push(`${f.name}: requested ${expectedUnits} apartments; found ${units.size}.`);
   const shared=f.rooms.filter(r=>!r.unitId&&r.type==='entrance');
   for(const id of units){
    const rooms=f.rooms.filter(r=>r.unitId===id),halls=rooms.filter(r=>r.type==='entrance');
    const beds=rooms.filter(r=>r.type==='bedroom'||r.type==='master').length;
    if(beds!==expectedBeds)errors.push(`${f.name}, ${id}: requested ${expectedBeds} bedrooms per apartment; found ${beds}.`);
    for(const type of ['living','kitchen','bathroom'])if(!rooms.some(r=>r.type===type))errors.push(`${f.name}, ${id}: missing private ${type}.`);
    if(!halls.some(hall=>shared.some(access=>opensInto(hall,access))))errors.push(`${f.name}, ${id}: no private entrance from shared circulation.`);
    for(const room of rooms.filter(r=>r.type!=='entrance'))if(!halls.some(hall=>opensInto(room,hall)))errors.push(`${f.name}, ${room.name}: no door to its own apartment circulation.`);
   }
  }
  const stairs=f.rooms.filter(r=>r.type==='stairs'&&!r.unitId);
  if(!stairs.length)errors.push(`${f.name}: missing shared staircase.`);
  if(brief.lift&&!f.rooms.some(r=>r.type==='lift'&&!r.unitId))errors.push(`${f.name}: missing shared elevator.`);
  if(p.floors[0]!==f)for(const core of p.floors[0].rooms.filter(r=>!r.unitId&&(r.type==='stairs'||r.type==='lift'))){
   if(!f.rooms.some(r=>!r.unitId&&r.type===core.type&&['x','y','w','d'].every(key=>Math.abs(r[key as 'x']-core[key as 'x'])<.05)))errors.push(`${f.name}: shared ${core.type} is not aligned with the ground floor.`);
  }
 }
 return errors;
}
export function validateRequirements(brief:Brief,p:Project):string[]{
 const errors=validateInventory(brief.features??[],projectInventory(p));
 if(Math.abs(brief.site.width-p.site.width)>.01||Math.abs(brief.site.depth-p.site.depth)>.01||brief.site.facing!==p.site.facing)errors.push('The planned site dimensions or facing differ from the active request.');
 if(brief.kind&&p.kind!==brief.kind)errors.push(`Requested a ${brief.kind} project; received ${p.kind??'an unclassified project'}.`);
 if(brief.kind!=='resort'){
  if(p.floors.length!==brief.floors.length)errors.push(`Requested ${brief.floors.length} floors; found ${p.floors.length}.`);
  for(let i=0;i<brief.floors.length;i++)if(p.floors[i]&&p.floors[i].role!==brief.floors[i].role)errors.push(`${brief.floors[i].label}: requested ${brief.floors[i].role} floor; found ${p.floors[i].role}.`);
 }
 if(brief.kind==='apartment')errors.push(...apartmentRequirements(brief,p));
 if(brief.kind!=='resort'&&brief.kind!=='apartment')for(let i=0;i<brief.floors.length;i++){
  const requested=brief.floors[i],actual=p.floors[i];
  if(!actual){errors.push(`Missing floor ${requested.label}.`);continue;}
  // Requests with different modifiers still contribute to the same total.
  const required:Record<string,number>=Object.create(null);
  for(const s of requested.spaces)required[s.type]=(required[s.type]??0)+s.count;
  for(const [kind,wanted]of Object.entries(required)){
   const count=actual.rooms.filter(r=>r.type===kind).reduce((n,r)=>n+roomQuantity(r),0);
   if(count<wanted)errors.push(`${requested.label}: requested ${wanted} ${kind}; found ${count}.`);
  }
 }
 return [...new Set(errors)];
}
