import type {Brief} from './brief';
import type {ProjectKind} from './projectTypes';
import {planResidence,type PlanningResult} from './residentialPlanner';
import {planCampus,validateCampus} from './campusPlanner';
import {planApartments} from './apartmentPlanner';
import {validateRequirements} from './featureValidation';
import {parseProject,validate,type Project,type Floor} from './engine';
import {dimensionIssues,fixtureIssues} from './residentialPlanner';
/** A new building use must supply its own geometry and validation profile. */
export const PLANNING_PROFILES:Record<ProjectKind,{label:string;plan:(brief:Brief)=>PlanningResult}>={
 house:{label:'Independent house / rental floors',plan:planResidence},
 apartment:{label:'Apartment building with shared circulation',plan:planApartments},
 resort:{label:'Resort campus and site access',plan:planCampus},
};
function attempt(brief:Brief):PlanningResult{
 const kind=brief.kind??'house';
 if(!Object.hasOwn(PLANNING_PROFILES,kind))return {proposals:[],attempted:0,rejected:0,reasons:['This building use needs a dedicated planning profile.'],assumptions:[]};
 const result=PLANNING_PROFILES[kind].plan(brief);
 result.proposals=result.proposals.filter(candidate=>{
  const errors=validateRequirements(brief,candidate.project);
  try{parseProject(candidate.project);}catch(e){errors.push((e as Error).message);}
  if(errors.length){result.rejected++;result.reasons.push(...errors);return false;}
  return true;
 });
 result.proposals.forEach((candidate,i)=>candidate.project.variant=i);
 return result;
}
const bedCount=(brief:Brief)=>Math.max(0,...brief.floors.flatMap(f=>f.spaces.filter(s=>s.type==='bedroom').map(s=>s.count)));
const roomCount=(f:Brief['floors'][number])=>f.spaces.reduce((a,s)=>a+s.count,0);
/** The next smaller unit worth trying: one fewer bedroom, and finally a
 * single room with its own kitchen. Returns null once nothing remains. */
function smallerUnit(brief:Brief):Brief|null{
 const beds=bedCount(brief),next=structuredClone(brief);
 if(beds>1){for(const f of next.floors)for(const s of f.spaces)if(s.type==='bedroom')s.count=beds-1;return next;}
 if(beds===1&&next.floors.some(f=>f.spaces.some(s=>s.type==='living'))){
  for(const f of next.floors)if(f.role==='residential')f.spaces=f.spaces.filter(s=>s.type!=='living');
  return next;
 }
 return null;
}
function unitLabel(brief:Brief){
 const beds=bedCount(brief),living=brief.floors.some(f=>f.spaces.some(s=>s.type==='living'));
 return beds?`${beds}-bedroom unit${living?'':' without a separate living room'}`:'single-room unit';
}
/** Put the ground floor to work. A bare parking level wastes the one storey
 * that could take the rooms an upper floor cannot fit beside its landing.
 * `limit` is how few rooms the crowded floor should be left carrying, and
 * `sleeping` whether a bedroom may come down as well as the shared rooms. */
function useGroundFloor(brief:Brief,limit:number,sleeping:boolean):{brief:Brief;note:string}|null{
 if(brief.floors[0]?.role!=='stilt'||brief.groundParkingOnly)return null;
 const next=structuredClone(brief),ground=next.floors[0];
 const donor=next.floors.slice(1).filter(f=>f.role==='residential').sort((a,b)=>roomCount(b)-roomCount(a))[0];
 if(!donor||roomCount(donor)<=limit)return null;
 const order=['pooja','office','store','utility','dining','theatre','living','kitchen',...(sleeping?['bedroom','master']:[])];
 const moved:string[]=[];
 for(const type of order){
  if(roomCount(donor)<=limit)break;
  const space=donor.spaces.find(s=>s.type===type);
  if(!space)continue;
  if(space.count>1){space.count--;const old=ground.spaces.find(s=>s.type===type);if(old)old.count++;else ground.spaces.push({...space,count:1});}
  else{donor.spaces=donor.spaces.filter(s=>s!==space);ground.spaces.push(space);}
  moved.push(type);
 }
 if(!moved.length)return null;
 ground.role='residential';
 return {brief:next,note:`${donor.label} could not seat every room beside its landing, so the ground floor becomes mixed use: parking plus ${[...new Set(moved)].join(', ')}. Say "keep the ground floor for parking" to rule that out.`};
}
/** Ways to make an automatic program fit, in the order worth trying. */
function* adaptations(brief:Brief):Generator<{brief:Brief;note:string}>{
 if(brief.kind&&brief.kind!=='house')return;
 if(brief.lettable){
  if(brief.features?.some(f=>f.source==='requested'&&!f.excluded&&['bedroom','master','living','kitchen','bathroom'].includes(f.kind)))return;
  let current:Brief|null=brief;
  while((current=smallerUnit(current)))
   yield {brief:current,note:`A ${unitLabel(brief)} did not fit this plate with usable room sizes, so each floor is a ${unitLabel(current)}. Widen the plot, or ask for smaller rooms, to change that.`};
  return;
 }
 // Least disruptive first: shared rooms down, then a sleeping room, and only
 // then a floor stripped back further. The first that plans is the one used.
 for(const [limit,sleeping] of [[4,false],[3,false],[3,true],[2,true]] as const){
  const step=useGroundFloor(brief,limit,sleeping);
  if(step)yield step;
 }
}
export function planProject(brief:Brief):PlanningResult{
 const first=attempt(brief);
 if(first.proposals.length||!brief.automatic)return first;
 let attempted=first.attempted,rejected=first.rejected;
 for(const step of adaptations(brief)){
  const retry=attempt(step.brief);
  attempted+=retry.attempted;rejected+=retry.rejected;
  if(!retry.proposals.length)continue;
  retry.attempted=attempted;retry.rejected=rejected;
  retry.assumptions=[...retry.assumptions,step.note];
  retry.brief=step.brief;
  return retry;
 }
 first.attempted=attempted;first.rejected=rejected;
 return first;
}
export function planningIssues(project:Project,floor:Floor){
 const compact=Math.min(project.site.width,project.site.depth)<25;
 return project.kind==='resort'?validateCampus(project):[...validate(project,floor),...dimensionIssues(floor.rooms),...fixtureIssues(floor.rooms,compact)];
}
