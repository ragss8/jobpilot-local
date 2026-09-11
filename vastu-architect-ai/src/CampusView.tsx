import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {Project} from './engine';
const colors:Record<string,string>={garden:'#dce5c5',path:'#e5d7bd',road:'#8b9091',parking:'#b5b7b7',pool:'#66b8ce',deck:'#cfa977',cottage:'#b87e5b',restaurant:'#d3a879',reception:'#e1c09a',kitchen:'#b6a7a0',entrance:'#708c73'};
export default function CampusView({project:p,three=false}:{project:Project;three?:boolean}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!three||!host.current||!p.campus)return;
  const node=host.current,scene=new THREE.Scene();scene.background=new THREE.Color('#e9eee8');
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));node.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(45,1,1,10000),span=Math.max(p.site.width,p.site.depth);
  camera.position.set(span*.7,span*.85,span*.95);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(p.site.width/2,0,p.site.depth/2);controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff,0x657264,3));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(100,300,120);scene.add(sun);
  const assets:{geometry:THREE.BufferGeometry;material:THREE.Material}[]=[];
  const ground=new THREE.Mesh(new THREE.BoxGeometry(p.site.width,.2,p.site.depth),new THREE.MeshStandardMaterial({color:'#dce5c5'}));ground.position.set(p.site.width/2,-.3,p.site.depth/2);scene.add(ground);assets.push(ground);
  for(const e of p.campus.elements.filter(e=>e.kind!=='garden')){
   const h=Math.max(.25,e.height),mesh=new THREE.Mesh(new THREE.BoxGeometry(e.w,h,e.d),new THREE.MeshStandardMaterial({color:colors[e.kind]??'#c7b49a',roughness:.8}));
   mesh.position.set(e.x+e.w/2,h/2,e.y+e.d/2);scene.add(mesh);assets.push(mesh);
  }
  const resize=()=>{const w=node.clientWidth,h=Math.max(420,node.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);};
  const observer=new ResizeObserver(resize);observer.observe(node);controls.addEventListener('change',resize);resize();
  return()=>{observer.disconnect();controls.dispose();assets.forEach(a=>{a.geometry.dispose();a.material.dispose();});renderer.dispose();renderer.domElement.remove();};
 },[p,three]);
 if(three)return <div ref={host} style={{width:'100%',height:560}} aria-label="Resort 3D massing model"/>;
 const c=p.campus!;
 return <svg role="img" aria-label="Resort site masterplan" viewBox={`-12 -22 ${p.site.width+24} ${p.site.depth+44}`} style={{width:'100%',maxHeight:650}}>
  <rect width={p.site.width} height={p.site.depth} fill="#dce5c5" stroke="#52624c" strokeWidth={1}/>
  <rect {...{x:c.mainZone.x,y:c.mainZone.y,width:c.mainZone.w,height:c.mainZone.d}} fill="none" stroke="#a37550" strokeDasharray="4 3"/>
  {[...c.elements].sort((a,b)=>Number(!!a.building)-Number(!!b.building)).filter(e=>e.kind!=='garden').map(e=><g key={e.id}><title>{e.name}: {e.w.toFixed(1)} × {e.d.toFixed(1)} ft</title><rect x={e.x} y={e.y} width={e.w} height={e.d} fill={colors[e.kind]??'#c7b49a'} stroke="#ffffff" strokeWidth={.5}/>{!['path','road','entrance'].includes(e.kind)&&<text x={e.x+e.w/2} y={e.y+e.d/2} textAnchor="middle" fontSize={Math.max(2,Math.min(4,e.w/8))}>{e.name}</text>}</g>)}
  <text x={0} y={-9} fontSize={6}>N ↑ · {p.site.width.toFixed(1)} × {p.site.depth.toFixed(1)} ft · Site masterplan</text>
 </svg>;
}
