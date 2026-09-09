import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProject,generate,canWalk,getWalls,type Direction} from '../src/engine';
import {initialRoom,roomView} from '../src/presentation';
test('walkthrough begins in a furnished living room',()=>{const p=defaultProject();assert.equal(initialRoom(p,p.floors[0]).type,'living')});
test('room navigation finds clear points in generated rooms for every facing',()=>{for(const facing of ['North','East','South','West'] as Direction[])for(const variant of [0,1,2]){const p=defaultProject();p.site.facing=facing;const next=generate(p,variant),f=next.floors[0],walls=getWalls(next,f);for(const r of f.rooms){const view=roomView(next,f,r);assert.ok(view,`${facing} ${variant}: ${r.name}`);assert.ok(canWalk(view.x,view.z,next,f,walls));assert.ok(view.x>=r.x&&view.x<=r.x+r.w&&view.z>=r.y&&view.z<=r.y+r.d);assert.ok(Number.isFinite(view.yaw))}}});
test('fully blocked rooms do not produce a viewpoint inside furniture',()=>{const p=defaultProject(),f=p.floors[0],r=f.rooms[0];r.furniture=[{id:'block',kind:'bed',x:0,y:0,w:r.w,d:r.d,rotation:0}];assert.equal(roomView(p,f,r),null)});
