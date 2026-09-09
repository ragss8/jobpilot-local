/** Write a generated Ground+2+terrace project to a file, for the browser
 *  tests to seed into localStorage. */
import { writeFileSync } from "node:fs";
import { defaultProject } from "../src/engine.ts";
import { normalizeBrief, validateBrief } from "../src/brief.ts";
import { generateFromBrief } from "../src/layout.ts";
const sp=(type:string,count=1,o:any={})=>({type,count,spacious:!!o.sp,attachedBath:!!o.ab,open:!!o.op});
const brief = normalizeBrief(validateBrief({ site:{width:30,depth:48,facing:"North"}, floors:[
  {label:"Ground",role:"stilt",spaces:[sp("parking"),sp("utility")]},
  {label:"First",role:"residential",spaces:[sp("living",1,{sp:1}),sp("bedroom"),sp("kitchen",1,{op:1}),sp("pooja"),sp("bathroom")]},
  {label:"Second",role:"residential",spaces:[sp("master",2,{sp:1,ab:1}),sp("theatre")]},
  {label:"Terrace",role:"terrace",spaces:[sp("seating"),sp("garden")]},
]}));
const base = defaultProject(); base.site.setback=2; base.site.front=4;
const p = generateFromBrief(base, brief, 0);
p.name = "Ground plus two";
writeFileSync(process.argv[2], JSON.stringify(p));
console.log("floors:", p.floors.map(f=>`${f.name}(${f.role})`).join(", "));
