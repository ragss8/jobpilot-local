import type {Brief} from './brief';
import {extractRequest} from './requestModel';
import {buildProgram} from './autoProgram';
import {resolveRequest,siteMeasurements} from './requestContext';
export {siteMeasurements} from './requestContext';
export function dimensions(text:string){const m=[...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:x|×|by|[-–])\s*(\d+(?:\.\d+)?)\b/gi)].at(-1);return m?{width:Number(m[1]),depth:Number(m[2])}:null;}
/** Resolve project boundaries before any text reaches inference. A dimension
 * correction preserves the structured requirements exactly. */
export async function understand(text:string,previous:Brief|null,model:string,signal:AbortSignal):Promise<Brief>{
 signal.throwIfAborted();
 const context=resolveRequest(text,previous);
 const onlyDimensions=/^\s*(?:please\s+)?(?:(?:use|resize(?:\s+the\s+(?:site|plot))?(?:\s+to)?|change(?:\s+the\s+(?:site|plot))?\s+to|make\s+(?:it|the\s+(?:site|plot)))\s+)?(?:an?\s+)?\d+(?:\.\d+)?\s*(?:x|×|by)\s*\d+(?:\.\d+)?\s*(?:ft|feet|foot|m|metres?|meters?)?\s*(?:site|plot)?\s*(?:instead)?[.!]?\s*$/i;
 if(context.previous&&onlyDimensions.test(context.text)){
  const measured=siteMeasurements(context.text,context.previous.site),max=context.previous.kind==='resort'?2000:300;
  if(!measured.width||!measured.depth||Math.min(measured.width,measured.depth)<15||Math.max(measured.width,measured.depth)>max)throw Error(`This planning profile supports site sides from 15 to ${max} feet.`);
  return {...structuredClone(context.previous),site:{...context.previous.site,width:measured.width,depth:measured.depth,areaSqFt:measured.areaSqFt,assumedShape:measured.assumedShape}};
 }
 const analysis=await extractRequest(context.text,context.previous?.kind??(context.previous?'house':null),model,signal);
 signal.throwIfAborted();
 return buildProgram(context.text,context.previous,analysis);
}
