export type ProjectKind = 'house'|'resort'|'apartment';
export type RequestIntent = 'new'|'edit';
export interface FeatureRequest { kind:string; count:number|null; evidence:string; source:'requested'|'default'; excluded?:boolean }
export interface SiteElement {quantity?:number;id:string;kind:string;name:string;x:number;y:number;w:number;d:number;height:number;building?:boolean;parent?:string;doorSide?:'n'|'s'|'e'|'w'}
export interface CampusLayout {elements:SiteElement[];mainZone:{x:number;y:number;w:number;d:number};siteAreaSqFt:number;mainZoneAreaSqFt:number;requestedMainZoneSqFt:number;capacity:{cottages:number;parking:number};notes:string[]}
