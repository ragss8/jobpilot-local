import type {FeatureRequest,ProjectKind} from './projectTypes';
/** Feature vocabulary is separate from request-specific requirements. Adding a
 * catalogue entry never makes that feature mandatory in another project. */
export const FEATURE_CATALOG:Record<string,{label:string;pattern:string;profiles:ProjectKind[]}>={
 living:{label:'living hall',pattern:'living(?:\\s+(?:room|hall))?s?|halls?|sitting(?:\\s+(?:room|area))?s?|family\\s+(?:lounge|room)s?',profiles:['house','apartment']},
 master:{label:'master bedroom',pattern:'master(?:\\s+(?:bedrooms?|rooms?))?',profiles:['house','apartment']},
 bedroom:{label:'bedroom',pattern:'bedrooms?',profiles:['house','apartment','resort']},
 bathroom:{label:'bathroom',pattern:'bathrooms?|toilets?',profiles:['house','apartment','resort']},
 kitchen:{label:'kitchen',pattern:'kitchens?',profiles:['house','apartment','resort']},
 dining:{label:'dining room',pattern:'dining(?:\\s+(?:room|area))?s?',profiles:['house','apartment']},
 pooja:{label:'pooja room',pattern:'pooja(?:\\s+rooms?)?|puja(?:\\s+rooms?)?',profiles:['house','apartment']},
 office:{label:'study',pattern:'study|offices?',profiles:['house','apartment']},
 theatre:{label:'home theatre',pattern:'(?:home\\s+)?theat(?:re|er)s?|cinema',profiles:['house','apartment']},
 parking:{label:'parking',pattern:'(?:car\\s+)?parking|car\\s+bays?',profiles:['house','apartment','resort']},
 entrance:{label:'entrance',pattern:'entrance(?:\\s+lobby)?|lobby|pedestrian\\s+entry',profiles:['house','apartment','resort']},
 stairs:{label:'staircase',pattern:'staircases?|stairs?',profiles:['house','apartment','resort']},
 lift:{label:'elevator',pattern:'lifts?|elevators?',profiles:['house','apartment','resort']},
 garden:{label:'garden',pattern:'gardens?|landscap(?:e|ed|ing)',profiles:['house','apartment','resort']},
 jacuzzi:{label:'jacuzzi',pattern:'jacuzzi|hot\\s+tubs?',profiles:['house','apartment','resort']},
 seating:{label:'covered seating',pattern:'(?:covered\\s+)?(?:shelters?|seating(?:\\s+areas?)?)|pergolas?|outdoor\\s+relaxation|space\\s+for\\s+relaxation',profiles:['house','apartment','resort']},
 balcony:{label:'balcony',pattern:'balcon(?:y|ies)',profiles:['house','apartment']},
 terrace:{label:'terrace',pattern:'terrace|rooftop',profiles:['house','apartment']},
 utility:{label:'utility',pattern:'utilit(?:y|ies)|laundry',profiles:['house','apartment','resort']},
 store:{label:'storage',pattern:'store(?:\\s+room)?s?|storage',profiles:['house','apartment','resort']},
 cottage:{label:'private cottage',pattern:'cottages?|cabins?',profiles:['resort']},
 pool:{label:'swimming pool',pattern:'(?:swimming\\s+)?pools?',profiles:['resort']},
 deck:{label:'pool deck',pattern:'decks?',profiles:['resort']},
 reception:{label:'reception',pattern:'reception(?:\\s+(?:areas?|desks?))?',profiles:['resort','apartment']},
 restaurant:{label:'restaurant',pattern:'restaurants?',profiles:['resort']},
 bar:{label:'resto-bar',pattern:'resto[- ]?bars?|bars?',profiles:['resort']},
 common:{label:'common facilities',pattern:'common\\s+(?:facilities|areas)|restrooms?',profiles:['resort']},
 service:{label:'service area',pattern:'service\\s+(?:areas?|buildings?)',profiles:['resort']},
 road:{label:'internal road',pattern:'internal\\s+roads?|vehicle\\s+(?:circulation|access)',profiles:['resort']},
 path:{label:'pedestrian paths',pattern:'pathways?|pedestrian\\s+circulation',profiles:['resort']},
 recreation:{label:'recreation space',pattern:'recreational?\\s+(?:spaces?|areas?)|playground',profiles:['resort']},
};
const numbers:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
/** Negation continues across a coordinated list until a positive instruction. */
function excludedAt(text:string,index:number){
 const before=text.slice(0,index).split(/[.;!\n]/).at(-1)??'';
 const negative=[...before.matchAll(/\b(?:no|without|remove|omit|exclude|don't want|do not want)\b/gi)].at(-1)?.index??-1;
 const positive=[...before.matchAll(/\b(?:add|include|keep|with|but|except|instead)\b/gi)].at(-1)?.index??-1;
 return negative>positive;
}
export function explicitFeatures(text:string):FeatureRequest[]{
 const found:FeatureRequest[]=[];
 for(const [kind,entry]of Object.entries(FEATURE_CATALOG)){
  const matches=[...text.matchAll(new RegExp(`\\b(?:(\\d+|${Object.keys(numbers).join('|')})\\s+)?(?:private\\s+|spacious\\s+)?(?:${entry.pattern})\\b`,'gi'))]
   .filter(m=>kind!=='bedroom'||!/master\s*$/i.test(text.slice(0,m.index!)));
  if(!matches.length)continue;
  const m=matches.at(-1)!,value=(match:RegExpMatchArray)=>match[1]===undefined?null:/^\d+$/.test(match[1])?Number(match[1]):numbers[match[1].toLowerCase()];
  const excluded=excludedAt(text,m.index!)||value(m)===0;
  // Repeated explicit floor lists contribute to one project inventory. An
  // edit such as "change two bedrooms to three bedrooms" uses the last value.
  const editing=/\b(?:change|update|revise|correct|resize|add|remove|replace|move|reduce|increase)\b/i.test(text);
  const positives=matches.filter(match=>!excludedAt(text,match.index!));
  const count=excluded||editing?value(m):positives.length>1?positives.reduce((sum,match)=>sum+(value(match)??1),0):value(m);
  found.push({kind,count:count===0?null:count,evidence:m[0],source:'requested',excluded});
 }
 return found;
}
