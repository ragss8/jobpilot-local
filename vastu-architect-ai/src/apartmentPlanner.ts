import {buildableRect,defaultProject,furnish,uid,validate,type Project,type Room,type RoomType} from './engine';
import type {Brief} from './brief';
import {dimensionIssues,fixtureIssues,orientRoom,type PlanningResult} from './residentialPlanner';
import {validateRequirements} from './featureValidation';
const make=(type:RoomType,name:string,x:number,y:number,w:number,d:number,doorSide:Room['doorSide'],unitId?:string):Room=>({id:uid(),type,name,x,y,w,d,doorSide,doorOffset:.5,windowOffset:.5,material:'terrazzo',furniture:[],unitId});
/** Repeated self-contained units around shared access and a stacked core.
 * Bounded concept topology; no municipal or fire-code certification. */
export function planApartments(brief:Brief):PlanningResult{
 const result:PlanningResult={proposals:[],attempted:0,rejected:0,reasons:[],assumptions:[...(brief.assumptions??[]),'Apartment concepts use a shared corridor and aligned stair/lift core; each unit has its own living room, kitchen, bathroom and bedrooms.','One core is a conceptual reservation. Egress, accessibility and local occupancy rules require separate engineering.']};
 const units=brief.unitsPerFloor??2,beds=brief.bedroomsPerUnit??2;
 for(const corridor of [6,7,8]){
  result.attempted++;
  try{
   const p:Project=defaultProject();p.kind='apartment';p.name='Your apartment building';p.site={...brief.site,setback:4,front:6};p.programFeatures=brief.features;
   const actual=buildableRect(p.site),sideways=['East','West'].includes(p.site.facing),W=sideways?actual.d:actual.w,D=sideways?actual.w:actual.d;
   const coreY=D-14,unitW=(W-corridor)/2,rows=Math.ceil(units/2),unitD=coreY/rows;
   // A structural floor only: whether the rooms are actually usable is decided
   // by the dimension check below, against the real room standards. A flat 24 ft
   // guess rejected sites the layout can in fact serve.
   const stack=beds+3;
   if(unitW<14||unitD<stack*7)throw Error(`The site needs more width or depth for ${units} separate ${beds}-bedroom units and shared circulation.`);
   p.floors=brief.floors.map((f,level)=>{
    const rooms:Room[]=[make('stairs','Shared staircase',W/2-6,coreY,7,14,'n'),make(brief.lift?'lift':'entrance',brief.lift?'Shared elevator':'Core landing',W/2+1,coreY,5,14,'n'),make('entrance','Shared corridor',unitW,0,corridor,coreY,'s')];
    if(f.role==='stilt'){
     const count=brief.features?.find(x=>x.kind==='parking'&&!x.excluded)?.count??units*2;
     const columns=Math.floor((W/2-6)/9);
     if(count>columns*2)throw Error('Requested parking bays exceed the straight-access frontage.');
     for(let bay=0;bay<count;bay++){const side=bay>=columns;const index=bay%columns;rooms.push(make('parking',`Parking bay ${bay+1}`,side?W/2+6+index*9:index*9,D-19,9,19,'s'));}
    }else for(let u=0;u<units;u++){
     const col=u%2,row=Math.floor(u/2),x=col?unitW+corridor:0,y=row*unitD,id=`floor-${level}-unit-${u+1}`;
     const hallX=col?x:x+unitW-4,roomX=col?x+4:x;
     rooms.push(make('entrance',`Unit ${u+1} private hall`,hallX,y,4,unitD,col?'w':'e',id));
     const types:RoomType[]=['living','kitchen',...Array.from({length:beds},()=>'bedroom' as const),'bathroom'];
     types.forEach((type,i)=>rooms.push(make(type,`Unit ${u+1} ${type} ${i+1}`,roomX,y+i*unitD/types.length,unitW-4,unitD/types.length,col?'w':'e',id)));
    }
    for(const r of rooms){orientRoom(r,{x:0,y:0,w:W,d:D},actual,p.site.facing);r.furniture=furnish(r);}
    return {id:uid(),name:f.label,role:f.role,height:10,rooms};
   });
   p.requirements.bedrooms=units*beds*p.floors.filter(f=>f.role==='residential').length;
   const errors=[...p.floors.flatMap(f=>[...dimensionIssues(f.rooms),...fixtureIssues(f.rooms),...validate(p,f)]),...validateRequirements(brief,p)];
   if(errors.length)throw Error(errors[0]);
   p.variant=result.proposals.length;result.proposals.push({project:p,score:100-corridor,notes:[`${units} separate ${beds}-bedroom units per floor; ${corridor} ft shared corridor.`,'Private unit halls connect to shared access, with the vertical core aligned on every level.']});
  }catch(e){result.rejected++;result.reasons.push((e as Error).message);}
 }
 result.reasons=result.proposals.length?[]:[...new Set(result.reasons)];return result;
}
