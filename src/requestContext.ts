import type {Brief} from './brief';
import type {ProjectKind,RequestIntent} from './projectTypes';
/** Project boundaries are shared by intent detection and feature extraction. */
export function latestProjectRequest(text:string){
 const boundaries=[...text.matchAll(/\b(?:new project|new design|different project|another project|start over|start fresh)\b/gi)];
 return boundaries.length?text.slice(boundaries.at(-1)!.index):text;
}
/** Remove negated uses and comparisons before selecting the requested use. */
function positiveUses(text:string){
 const uses='house|resort|retreat|holiday park|cottage complex|apartment(?: building| block| complex)?|flats?|multi[- ]family|villa|duplex|triplex|bungalow';
 return text.replace(new RegExp(`\\b(?:not|unlike|instead of|rather than|without)\\s+(?:an?\\s+|the\\s+)?(?:${uses})\\b`,'gi'),'')
  .replace(new RegExp(`\\b(?:${uses})[- ](?:style|like)\\b`,'gi'),'');
}
export function detectProjectKind(text:string):ProjectKind|undefined {
 const matches=[...positiveUses(latestProjectRequest(text)).matchAll(/\b(resort|retreat|holiday park|cottage complex|apartment(?: building| block| complex)?|flats?|multi[- ]family|house|villa|duplex|triplex|bungalow)\b/gi)];
 const value=matches.at(-1)?.[1];
 if(!value)return undefined;
 if(/resort|retreat|holiday park|cottage complex/i.test(value))return 'resort';
 if(/apartment|flat|multi/i.test(value))return 'apartment';
 return 'house';
}
/** A storey count does not turn a named nonresidential use into housing. */
export function unsupportedProjectUse(text:string){
 const positive=positiveUses(latestProjectRequest(text));
 return [...positive.matchAll(/\b(?:hospital|school|college|university|factory|warehouse|airport|stadium|shopping mall|office (?:building|block|complex)|hotel|hostel|clinic|temple|church|mosque)\b/gi)].some(m=>
  !/\b(?:near|opposite|beside|behind|next to|across from|view of|not|unlike|instead of|rather than)\s+(?:an?\s+|the\s+)?$/i.test(positive.slice(0,m.index!)));
}
/** A building let out in self-contained parts. "Portions" is the common Indian
 * term for exactly this and means the same as "rental units". */
export const LETTABLE=/\b(?:rental|rent(?:ed|ing)?\s+out|rent\s+out|to\s+let|let\s+out|lettable|tenants?|portions?|rental\s+income|paying\s+guests?)\b/i;
export function detectLettable(text:string){return LETTABLE.test(text);}
/** A request can describe a dwelling without ever naming its type: "G+3 on a
 * 30 x 40 plot with rental units" is unmistakably residential. Inferring it
 * keeps a terse brief working instead of demanding a keyword, while an
 * unrecognised use still falls through to the unsupported message. */
export function inferResidentialKind(text:string):ProjectKind|undefined{
 // An acreage brief is a campus question, so leave those to the explicit
 // vocabulary rather than reading a storey count as a small building.
 if(unsupportedProjectUse(text)||/\b\d+(?:\.\d+)?\s*[- ]?(?:acres?|hectares?)\b/i.test(text))return undefined;
 // Only signals that can mean nothing else: a storey count, a BHK, or letting.
 // Bare room words are deliberately not enough, since a resort has bedrooms too.
 const storeys=/\bg\s*(?:\+|plus)\s*(?:\d|one|two|three|four)\b/i.test(text)||/\b\d+\s*[- ]?(?:storey|story|storeys|stories|floors?)\b/i.test(text);
 const bhk=/\b\d\s*[- ]?bhk\b/i.test(text);
 if(!storeys&&!bhk&&!LETTABLE.test(text))return undefined;
 // Repeated units on every floor is the apartment topology; anything else on
 // a single plot is planned as one dwelling per floor.
 return /\b(?:units?|flats?|apartments?)\s*(?:per|on each|each)\s*floor\b/i.test(text)?'apartment':'house';
}
export function resolveRequest(text:string,previous:Brief|null,activeRequest='',model?:{intent:RequestIntent;projectType:ProjectKind|'unsupported'}) {
 text=latestProjectRequest(text);
 const detected=detectProjectKind(text),old=previous?.kind??(previous?'house':detectProjectKind(activeRequest));
 const reset=/\b(new project|new design|start over|start fresh|another project|different project)\b/i.test(text);
 const correction=/\b(?:change|update|revise|correct|keep|resize|add|remove|replace|move|use|make|omit|exclude|reduce|increase)\b/i.test(text);
 const complete=!!detected&&!correction&&(/\b(?:design|create|generate|plan|build)\b/i.test(text)||/\b(?:want|need)\s+(?:(?:an?|new|another|different|independent|family)\s+)*(?:house|resort|apartment|villa|duplex|triplex|bungalow)\b/i.test(text));
 // Explicit changes of building use require a fresh profile and requirements.
 // A model's "new" guess alone cannot erase a valid brief during a correction.
 const intent:RequestIntent=reset||complete||detected&&old&&detected!==old||!previous&&!activeRequest?'new':'edit';
 const unsupported=unsupportedProjectUse(text);
 const kind:ProjectKind|'unsupported'|undefined=unsupported?'unsupported':detected??(intent==='edit'?old:undefined)??(model?.projectType==='unsupported'?'unsupported':inferResidentialKind(text)??model?.projectType);
 return {text:intent==='edit'&&!previous&&activeRequest?`${activeRequest}\nUpdate: ${text}`:text,previous:intent==='new'?null:previous,intent,kind};
}
export function siteMeasurements(text:string,previous?:Brief['site']){
 // Prefer a site-labelled measurement so room dimensions cannot resize a plot.
 const pattern=/\b(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|m|metres?|meters?)?\b/gi;
 const all=[...text.matchAll(pattern)];
 // A site word can sit a little way after the measurement - "20 x 40 ft
 // north-facing plot" - so look further ahead than the words immediately
 // following it, while still refusing a measurement that a room laid claim
 // to just before.
 const roomish=/\b(room|kitchen|bathroom|toilet|pool|cottage|bedroom|hall|balcony|terrace|garden)\b/i;
 const dims=all.find(m=>{
  const before=text.slice(Math.max(0,m.index!-25),m.index!);
  return /\b(site|plot|land)\b/i.test(before+text.slice(m.index!,m.index!+m[0].length+40))&&!roomish.test(before);
 })??(all.length===1&&!/\b(room|kitchen|bathroom|pool|cottage|bedroom)\b/i.test(text)?all[0]:undefined);
 let siteArea:number|undefined,mainZoneArea:number|undefined;
 for(const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(acres?|hectares?)\b/gi)){
  const before=text.slice(0,m.index!).split(/[.;\n]/).at(-1)??'';
  const area=Number(m[1])*(/^hectare/i.test(m[2])?107639.104:43560);
  const allocation=/\b(allocate|reserve|main built|main development|built[- ]up zone)\b/i.test(before)&&!/\bon\s+(?:a\s*)?$/i.test(before);
  if(allocation)mainZoneArea=area;else siteArea=area;
 }
 const sq=text.match(/(?:site|plot|land)\s*(?:of|is|area is|area:)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*ft|square feet)/i);
 if(!siteArea&&sq)siteArea=Number(sq[1].replaceAll(',',''));
 let width=previous?.width,depth=previous?.depth,assumedShape=previous?.assumedShape??false;
 if(dims){const k=/^m/i.test(dims[3]??'')?3.280839895:1;width=Number(dims[1])*k;depth=Number(dims[2])*k;siteArea=width*depth;assumedShape=false;}
 else if(siteArea){width=Math.sqrt(siteArea*.8);depth=siteArea/width;assumedShape=true;}
 const facing=text.match(/\b(north|south|east|west)[- ](?:facing|frontage|entrance|road)\b/i)?.[1]??text.match(/\b(?:faces?|facing|road (?:on|to)(?: the)?)\s+(north|south|east|west)\b/i)?.[1];
 return {width,depth,areaSqFt:siteArea??previous?.areaSqFt,mainZoneAreaSqFt:mainZoneArea,assumedShape,facing:facing?(facing[0].toUpperCase()+facing.slice(1).toLowerCase()) as Brief['site']['facing']:previous?.facing??'South'};
}
