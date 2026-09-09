import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/rim-lab/model.js';
import * as Original from '../src/hgrid-model.js';
import { rimProfile } from '../src/rim-lab/rim-geometry.js';
import { createCompute } from '../src/rim-lab/compute.js';
import { readDesignStamp } from '../src/rim-lab/state.js';
import { replayDesign } from '../src/rim-lab/replay.js';
const near = (a,b,t=1e-9) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);
const dist = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const cfg=G.lineGridConfig({nc:6,nr:3,m:3,symmetric:true});
const input={R:17.75,nc:6,nr:3,m:3,symmetric:true,t:.4,c:349,seed:'elliptical',params:G.nominalParams(cfg),alphaAt:cfg.alphaAt};
const th=G.buildLayout(input).throat;
const opts={nc:6,nr:3,R:17.75,t:.4,c:349,depth:300,mouthMode:'biradial',thetaH:90,thetaV:0,arcH:500,arcV:245,keepGeometry:true,computeClearance:false,stations:64,samples:1024,profileT:.7,sectionMode:'swept',profileArea:'open',shapeMorph:'radius',stationSampling:'interpolated'};
const map=G.mapThroatToMouth(th,opts);

test('circle/ellipse closed forms, shared endpoints, and spline curvature constraints',()=>{
 const base={width:35,depth:45,theta:.2,curvature:.0004,endAngle:150};
 const e=rimProfile({...base,family:'ellipse'}),s=rimProfile({...base,family:'spline'});
 near(dist(e.endpoint,s.samples.at(-1).p),0);
 near(s.startK,base.curvature); near(s.endK,0);
 near(s.samples[0].psi,base.theta); near(s.samples.at(-1).psi,150*Math.PI/180);
 near(e.startK,35/45**2);
 const c=rimProfile({...base,family:'circle'});
 near(c.radiusMin,35); near(c.startK,1/35);
 const b=rimProfile({...base,family:'spline',termination:'baffle'});
 near(b.samples.at(-1).psi,Math.PI/2); near(b.endK,0);
 assert.throws(()=>rimProfile({...base,width:NaN}));
});

test('experimental fork preserves the original cells and duct geometry exactly',()=>{
 const oldTh=Original.buildLayout(input).throat;
 assert.deepEqual(th,oldTh);
 const old=Original.mapThroatToMouth(oldTh,opts);
 assert.deepEqual(map.rows,old.rows);
 assert.equal(G.buildSTEP(th,map,{t:.4}).text,Original.buildSTEP(oldTh,old,{t:.4}).text);
 const before=structuredClone(map.rows);
 for(const family of ['circle','ellipse','spline']) assert.equal(G.rimCollar(th,map,{family,t:.4}).report.ok,true);
 assert.deepEqual(map.rows,before);
});

test('rim follows the exact aperture, shares patch boundaries and respects regions',()=>{
 const rim=G.rimCollar(th,map,{t:.4,family:'spline'});
 assert.equal(rim.report.ok,true); assert.equal(rim.solids.length,12);
 assert.ok(rim.report.cornerJoinDeg < .01);
 near(rim.report.joinJump,0);
 const field=G.rimExitField(th,map,{t:.4});
 for(let i=0;i<12;i+=3){
  const [h,c,v]=rim.solids.slice(i,i+3);
  assert.deepEqual(h.sections.at(-1).pts,c.sections[0].pts);
  assert.deepEqual(c.sections.at(-1).pts,v.sections[0].pts);
 }
 for(const solid of rim.solids) for(const sec of solid.sections) {
  near(dist(sec.pts[0],field.ap.snap(sec.pts[0])),0,1e-8);
  assert.ok(sec.pts.flat().every(Number.isFinite));
 }
 const quarter=G.rimCollar(th,map,{t:.4,xSide:-1,ySide:-1});
 assert.equal(quarter.solids.length,3);
 assert.deepEqual(quarter.solids,rim.solids.filter(s=>s.quadrant[0]===-1&&s.quadrant[1]===-1));
 assert.equal(G.rimCollar(th,map,{enabled:false}).solids.length,0);
 assert.equal(G.rimCollar(th,map,{width:3,depth:3,wall:3}).report.ok,false);
});

test('curved and flat apertures support both termination conditions',()=>{
 for(const thetaH of [0,90]) for(const thetaV of [0,40]) {
  const m=G.mapThroatToMouth(th,{...opts,thetaH,thetaV});
  for(const termination of ['free','baffle']) for(const family of ['ellipse','spline']) {
   const r=G.rimCollar(th,m,{t:.4,width:35,depth:45,termination,family});
   assert.equal(r.report.ok,true,JSON.stringify({thetaH,thetaV,termination,family,why:r.report.why}));
  }
 }
});

test('rim STEP surfaces reproduce sections and enclose the expected material volume',()=>{
 const r=G.rimCollar(th,map,{t:.4,xSide:-1,ySide:-1,width:35,depth:45});
 for(const solid of r.solids) {
  const b=G.ductBrep(solid.sections,{vParam:'chord'});
  assert.ok(G.brepResidual(b,solid.sections)<1e-8);
  const mesh=G.ductMesh(solid.sections);
  const vm=Math.abs(G.meshVolume(mesh.verts,mesh.tris));
  const vb=Math.abs(G.brepShellOrientation(b,32,64).volume);
  assert.ok(vm>0 && Math.abs(vb/vm-1)<.05,`${solid.label}: ${vb} vs ${vm}`);
 }
});

test('STEP air face retains the full quintic profile between samples',()=>{
 const r=G.rimCollar(th,map,{t:.4,xSide:-1,ySide:-1});
 for(const solid of r.solids) {
  const sec=solid.sections[0], b=G.ductBrep(solid.sections), n=sec.pts.length/4;
  const [v0,a0,v1,a1]=sec.rimBoundary;
  const p0=sec.pts[0],p5=sec.pts[n];
  const p1=p0.map((v,k)=>v+v0[k]/5),p4=p5.map((v,k)=>v-v1[k]/5);
  const p2=p0.map((v,k)=>a0[k]/20+2*p1[k]-v),p3=p5.map((v,k)=>a1[k]/20+2*p4[k]-v);
  const controls=[p0,p1,p2,p3,p4,p5],binomial=[1,5,10,10,5,1];
  assert.equal(b.uKnots.length-b.nu-1,5);
  for(const u of [.013,.237,.519,.877,.997]) {
   const expected=[0,1,2].map(k=>controls.reduce((sum,p,i)=>sum+p[k]*binomial[i]*u**i*(1-u)**(5-i),0));
   const actual=G.evalBsplineSurf(b.walls[0],b.uKnots,b.vKnots,u,0);
   near(dist(actual,expected),0,1e-8);
  }
 }
});

test('worker shell export records and replays the selected rim, refusing invalid profiles',()=>{
 const compute=createCompute();
 const layout=compute('layout','layout',input);
 const payload={throat:layout.throat,options:opts,floor:1.5};
 const shell={wall:3,stations:32,xSide:-1,ySide:-1,extendThroat:false,trimThroat:false,extendMouth:true,trimMouth:true,rim:{enabled:true,family:'ellipse',width:35,depth:45,termination:'free',endAngle:150}};
 const result=compute('export','rim-export',{...payload,format:'shell',name:'rim-test',shell,state:{tool:'ginkgo-rim-lab',layout:input,achieved:layout.solve.p,export:{shell}}});
 assert.equal(result.ok,true);
 assert.match(result.msg,/3 rim pieces/);
 const saved=readDesignStamp(result.text);
 assert.deepEqual(saved.export.shell.rim,shell.rim);
 const replay=replayDesign(saved);
 assert.equal(replay.rim.report.ok,true); assert.equal(replay.rim.solids.length,3);
 const expected=G.rimCollar(replay.throat,replay.map,{...shell.rim,t:.4,wall:3,xSide:-1,ySide:-1});
 assert.deepEqual(replay.rim.solids,expected.solids);
 assert.throws(()=>compute('export','rim-export',{...payload,format:'shell',name:'invalid',shell:{...shell,rim:{...shell.rim,width:1,depth:1}},state:{}}),/Rim refused/);
});
