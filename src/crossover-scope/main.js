// ─────────────────────────────────────────────────────────────────────────────
// CROSSOVER SCOPE — one crossover seen from four angles: level, group delay or
// phase, phasors at a probe frequency, and the waveform of a test signal.
//
// The physics (filter prototypes, delays, polarity, the FFT simulation) is in
// ./model.js, with its model, assumptions and direction of error stated at the
// top of that file. This file is drawing and wiring only.
//
// It is plain DOM + canvas, not React: it arrived as a finished standalone
// page, and porting its four canvas plots to React/SVG would have rewritten
// code that already worked. See ./CLAUDE.md.
//
// COLOUR ROLES (all from palette.js, set as CSS variables below and read
// directly for the canvases):
//   low-pass  series1     high-pass  series2     probe  series3
//   LP + HP   ink (heavier line)                 input  inkMuted, dashed
//   grid      border / borderStrong              text   ink / inkDim / inkMuted
// ─────────────────────────────────────────────────────────────────────────────
import { C } from "../palette.js";
import { Cx, ORDERS, buildModel, respAt, gdAt, simulate, FS, N, T0, lastSignalInfo } from "./model.js";
import MARKUP from "./markup.js";
import "./crossover-scope.css";

const ROOT_VARS = {
  "--page": C.page, "--panel": C.panel, "--ink": C.ink, "--muted": C.inkDim, "--faint": C.inkMuted,
  "--line": C.border, "--grid-strong": C.borderStrong, "--chip": C.panelAlt, "--accent": C.accent,
  "--lp": C.series1, "--hp": C.series2, "--sum": C.ink, "--input": C.inkMuted, "--probe": C.series3,
  "--f-body": C.sans, "--f-mono": C.mono,
};
for (const [k, v] of Object.entries(ROOT_VARS)) document.documentElement.style.setProperty(k, v);
document.getElementById("root").innerHTML = MARKUP;

/* ---------- state ---------- */
const S = {type:'LR', order:4, fc:100, fsel:100, signal:'burst', cycles:4, inv:false, dLP:0, dHP:0,
           show:{lp:true,hp:true,sum:true,in:true}, gd:'gd', spin:true};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduceMotion) S.spin=false;
let M = buildModel(S.type, S.order);

/* ---------- drawing helpers ---------- */
let TH={};
// Canvas colours come straight from the palette's roles (see the role map in
// main.js's header), not from CSS read back at draw time.
function readTheme(){
  TH={ink:C.ink, muted:C.inkDim, grid:C.border, gridS:C.borderStrong, lp:C.series1, hp:C.series2,
      sum:C.ink, input:C.inkMuted, probe:C.series3, panel:C.panel, mono:C.mono};
}
function prep(cv){
  const r=cv.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  const w=Math.max(20,Math.round(r.width)), h=Math.max(20,Math.round(r.height));
  if(cv.width!==Math.round(w*dpr) || cv.height!==Math.round(h*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); }
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  return {ctx,w,h};
}
const FMIN=10, FMAX=2000;
const fx=(f,L,W)=>L+(Math.log10(f)-Math.log10(FMIN))/(Math.log10(FMAX)-Math.log10(FMIN))*W;
const xf=(x,L,W)=>Math.pow(10, Math.log10(FMIN)+(x-L)/W*(Math.log10(FMAX)-Math.log10(FMIN)));
const FTICKS=[10,20,50,100,200,500,1000,2000], FMINOR=[30,40,60,70,80,90,300,400,600,700,800,900];
const flabel=f=>f>=1000?(f/1000)+'k':String(f);
function niceStep(range, target){
  const raw=range/target, p=Math.pow(10,Math.floor(Math.log10(raw))), n=raw/p;
  return (n<1.5?1:n<3?2:n<7?5:10)*p;
}
function freqAxes(ctx,L,R,Tp,B,w,h){
  const W=w-L-R;
  ctx.lineWidth=1;
  ctx.strokeStyle=TH.grid;
  for(const f of FMINOR){ const x=Math.round(fx(f,L,W))+0.5; ctx.beginPath(); ctx.moveTo(x,Tp); ctx.lineTo(x,h-B); ctx.stroke(); }
  ctx.strokeStyle=TH.gridS; ctx.fillStyle=TH.muted; ctx.font='11px '+TH.mono; ctx.textAlign='center'; ctx.textBaseline='top';
  for(const f of FTICKS){ const x=Math.round(fx(f,L,W))+0.5; ctx.beginPath(); ctx.moveTo(x,Tp); ctx.lineTo(x,h-B); ctx.stroke(); ctx.fillText(flabel(f), x, h-B+6); }
  ctx.textAlign='right'; ctx.fillText('Hz', w-R, h-B+6+12);
  return W;
}
function markers(ctx,L,W,Tp,B,h){
  const xc=fx(S.fc,L,W);
  ctx.save(); ctx.setLineDash([3,4]); ctx.strokeStyle=TH.muted; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xc,Tp); ctx.lineTo(xc,h-B); ctx.stroke(); ctx.restore();
  ctx.fillStyle=TH.muted; ctx.font='11px '+TH.mono; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText('fc', xc+4, Tp+2);
  const xp=fx(S.fsel,L,W);
  ctx.strokeStyle=TH.probe; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(xp,Tp); ctx.lineTo(xp,h-B); ctx.stroke();
  ctx.fillStyle=TH.probe; ctx.beginPath(); ctx.moveTo(xp-5,Tp); ctx.lineTo(xp+5,Tp); ctx.lineTo(xp,Tp+7); ctx.closePath(); ctx.fill();
}
function plotCurve(ctx, xs, ys, color, width, dash){
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.lineJoin='round'; if(dash) ctx.setLineDash(dash);
  ctx.beginPath(); let pen=false;
  for(let i=0;i<xs.length;i++){
    const y=ys[i];
    if(y===null || !isFinite(y)){ pen=false; continue; }
    if(!pen){ ctx.moveTo(xs[i],y); pen=true; } else ctx.lineTo(xs[i],y);
  }
  ctx.stroke(); ctx.restore();
}
const db = a => 20*Math.log10(Math.max(Cx.abs(a),1e-12));
const wrapDeg = d => ((d+180)%360+360)%360-180;

/* ---------- curves cache ---------- */
const NPTS=480; let curves=null;
function computeCurves(){
  const f=[], lp=[], hp=[], sum=[];
  for(let i=0;i<NPTS;i++){
    const fr=Math.pow(10, Math.log10(FMIN)+i/(NPTS-1)*(Math.log10(FMAX)-Math.log10(FMIN)));
    const r=respAt(M,S,fr); f.push(fr); lp.push(r.lp); hp.push(r.hp); sum.push(r.sum);
  }
  const gd={lp:[],hp:[],sum:[]};
  for(const fr of f){ gd.lp.push(gdAt(M,S,fr,'lp')*1000); gd.hp.push(gdAt(M,S,fr,'hp')*1000); gd.sum.push(gdAt(M,S,fr,'sum')*1000); }
  curves={f, lp, hp, sum, gd};
}

/* ---------- panels ---------- */
const cMag=document.getElementById('cMag'), cGd=document.getElementById('cGd'), cPh=document.getElementById('cPh'), cWave=document.getElementById('cWave');
const MAGPAD={L:46,R:14,T:12,B:34};
function drawMag(){
  const {ctx,w,h}=prep(cMag), {L,R,T:Tp,B}=MAGPAD;
  const W=freqAxes(ctx,L,R,Tp,B,w,h), H=h-Tp-B, dbMax=9, dbMin=-60;
  const yd=d=>Tp+(dbMax-d)/(dbMax-dbMin)*H;
  ctx.font='11px '+TH.mono; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let d=6; d>=dbMin; d-=6){
    const y=Math.round(yd(d))+0.5;
    ctx.strokeStyle=(d===0||d===-6)?TH.gridS:TH.grid; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(w-R,y); ctx.stroke();
    if(d%12===0 || d===-6 || d===6){ ctx.fillStyle=TH.muted; ctx.fillText(d+'', L-6, y); }
  }
  ctx.save(); ctx.translate(12, Tp+H/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillStyle=TH.muted; ctx.fillText('dB',0,0); ctx.restore();
  markers(ctx,L,W,Tp,B,h);
  ctx.save(); ctx.beginPath(); ctx.rect(L,Tp,W,H); ctx.clip();
  const xs=curves.f.map(f=>fx(f,L,W));
  if(S.show.lp) plotCurve(ctx,xs,curves.lp.map(a=>yd(Math.max(db(a),dbMin-5))),TH.lp,1.8);
  if(S.show.hp) plotCurve(ctx,xs,curves.hp.map(a=>yd(Math.max(db(a),dbMin-5))),TH.hp,1.8);
  if(S.show.sum) plotCurve(ctx,xs,curves.sum.map(a=>yd(Math.max(db(a),dbMin-5))),TH.sum,2.6);
  ctx.restore();
}
const GDPAD={L:46,R:14,T:12,B:34};
function drawGd(){
  const {ctx,w,h}=prep(cGd), {L,R,T:Tp,B}=GDPAD;
  const W=freqAxes(ctx,L,R,Tp,B,w,h), H=h-Tp-B;
  let ymin, ymax, step, series, unit;
  if(S.gd==='gd'){
    series=curves.gd; unit='ms';
    let mx=-Infinity, mn=Infinity;
    for(const k of ['lp','hp','sum']){ if(!S.show[k]) continue; for(const v of series[k]){ if(isFinite(v)){ mx=Math.max(mx,v); mn=Math.min(mn,v); } } }
    if(!isFinite(mx)){ mx=1; mn=0; }
    ymax=Math.min(60, Math.max(2, mx*1.12)); ymin=Math.max(-10, Math.min(0, mn*1.12));
    step=niceStep(ymax-ymin,5);
    ymax=Math.ceil(ymax/step)*step; ymin=Math.floor(ymin/step)*step;
  } else {
    unit='°'; ymin=-180; ymax=180; step=90;
    series={lp:curves.lp.map(a=>Cx.arg(a)*180/Math.PI), hp:curves.hp.map(a=>Cx.arg(a)*180/Math.PI), sum:curves.sum.map(a=>Cx.arg(a)*180/Math.PI)};
  }
  const yv=v=>Tp+(ymax-v)/(ymax-ymin)*H;
  ctx.font='11px '+TH.mono; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let v=ymin; v<=ymax+1e-9; v+=step){
    const y=Math.round(yv(v))+0.5; ctx.strokeStyle=Math.abs(v)<1e-9?TH.gridS:TH.grid; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(w-R,y); ctx.stroke();
    ctx.fillStyle=TH.muted; ctx.fillText((Math.abs(v)<1e-9?0:+v.toFixed(step<1?1:0))+'', L-6, y);
  }
  ctx.save(); ctx.translate(12, Tp+H/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillStyle=TH.muted; ctx.fillText(unit==='ms'?'ms':'deg',0,0); ctx.restore();
  markers(ctx,L,W,Tp,B,h);
  ctx.save(); ctx.beginPath(); ctx.rect(L,Tp,W,H); ctx.clip();
  const xs=curves.f.map(f=>fx(f,L,W));
  const toY=arr=>{
    if(unit==='ms') return arr.map(v=>isFinite(v)?yv(Math.max(ymin-5,Math.min(ymax+5,v))):null);
    const out=[]; for(let i=0;i<arr.length;i++){ if(i>0 && Math.abs(arr[i]-arr[i-1])>180) out.push(null); out.push(yv(arr[i])); }
    return out;
  };
  const xsFor=arr=>{ if(unit==='ms') return xs; const out=[]; for(let i=0;i<arr.length;i++){ if(i>0 && Math.abs(arr[i]-arr[i-1])>180) out.push(xs[i]); out.push(xs[i]); } return out; };
  if(S.show.lp) plotCurve(ctx,xsFor(series.lp),toY(series.lp),TH.lp,1.8);
  if(S.show.hp) plotCurve(ctx,xsFor(series.hp),toY(series.hp),TH.hp,1.8);
  if(S.show.sum) plotCurve(ctx,xsFor(series.sum),toY(series.sum),TH.sum,2.6);
  ctx.restore();
}
function arrow(ctx,x0,y0,x1,y1,color,width){
  const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy);
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=width; ctx.lineCap='round';
  if(len<1.5){ ctx.beginPath(); ctx.arc(x0,y0,2.5,0,2*Math.PI); ctx.fill(); return; }
  const hl=Math.min(10+width, len*0.45), ux=dx/len, uy=dy/len;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1-ux*hl*0.7, y1-uy*hl*0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1,y1);
  ctx.lineTo(x1-ux*hl-uy*hl*0.45, y1-uy*hl+ux*hl*0.45);
  ctx.lineTo(x1-ux*hl+uy*hl*0.45, y1-uy*hl-ux*hl*0.45);
  ctx.closePath(); ctx.fill();
}
let theta=0;
function drawPhasor(){
  const {ctx,w,h}=prep(cPh);
  const r=respAt(M,S,S.fsel), rot=Cx.expj(theta);
  const lp=Cx.mul(r.lp,rot), hp=Cx.mul(r.hp,rot), sum=Cx.mul(r.sum,rot), inp=rot;
  const Mmax=Math.max(1.0, Cx.abs(r.lp)+Cx.abs(r.hp), Cx.abs(r.sum))*1.05;
  const box=Math.min(h-16, w*0.46), R=box/2-6, cx=8+box/2, cy=h/2, k=R/Mmax;
  // frame
  ctx.strokeStyle=TH.grid; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
  ctx.save(); ctx.setLineDash([3,4]); ctx.strokeStyle=TH.gridS; ctx.beginPath(); ctx.arc(cx,cy,k,0,2*Math.PI); ctx.stroke(); ctx.restore();
  ctx.fillStyle=TH.muted; ctx.font='11px '+TH.mono; ctx.textAlign='left'; ctx.textBaseline='bottom';
  ctx.fillText('0 dB', cx+k*0.72+4, cy-k*0.72);
  const P=z=>[cx+z[0]*k, cy-z[1]*k];
  if(S.show.in){ ctx.save(); ctx.setLineDash([4,4]); const p=P(inp); ctx.strokeStyle=TH.input; ctx.lineWidth=1.3; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p[0],p[1]); ctx.stroke(); ctx.restore(); }
  const pl=P(lp), ps=P(sum);
  if(S.show.lp) arrow(ctx,cx,cy,pl[0],pl[1],TH.lp,2.2);
  if(S.show.hp){ const o=S.show.lp?pl:[cx,cy]; const tip=[o[0]+hp[0]*k, o[1]-hp[1]*k]; arrow(ctx,o[0],o[1],tip[0],tip[1],TH.hp,2.2); }
  if(S.show.sum) arrow(ctx,cx,cy,ps[0],ps[1],TH.sum,3);
  // strip
  const sx0=cx+R+22, sx1=w-8, sw=sx1-sx0;
  if(sw<60) return;
  const sh=R; const yS=v=>cy-v/Mmax*sh;
  ctx.strokeStyle=TH.grid; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(sx0,cy); ctx.lineTo(sx1,cy); ctx.stroke();
  for(let c=0;c<=2;c++){ const x=Math.round(sx0+c/2*sw)+0.5; ctx.beginPath(); ctx.moveTo(x,cy-sh); ctx.lineTo(x,cy+sh); ctx.stroke(); }
  ctx.fillStyle=TH.muted; ctx.textAlign='right'; ctx.textBaseline='top';
  ctx.fillText('2 cycles at '+fmtF(S.fsel), sx1, cy+sh-12 > cy+4 ? cy+sh-12 : cy+4);
  const n=220, xs=[], trace=(z)=>{ const out=[]; for(let i=0;i<=n;i++){ const ph=i/n*4*Math.PI; out.push(yS(Cx.abs(z)*Math.sin(ph+Cx.arg(z)))); } return out; };
  for(let i=0;i<=n;i++) xs.push(sx0+i/n*sw);
  if(S.show.in) plotCurve(ctx,xs,trace([1,0]),TH.input,1.3,[4,4]);
  if(S.show.lp) plotCurve(ctx,xs,trace(r.lp),TH.lp,1.8);
  if(S.show.hp) plotCurve(ctx,xs,trace(r.hp),TH.hp,1.8);
  if(S.show.sum) plotCurve(ctx,xs,trace(r.sum),TH.sum,2.6);
  const phc=((theta%(4*Math.PI))+4*Math.PI)%(4*Math.PI), xc=sx0+phc/(4*Math.PI)*sw;
  ctx.strokeStyle=TH.probe; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(xc,cy-sh); ctx.lineTo(xc,cy+sh); ctx.stroke();
  if(S.show.sum){
    const yv=yS(Cx.abs(r.sum)*Math.sin(phc+Cx.arg(r.sum)));
    ctx.save(); ctx.setLineDash([2,3]); ctx.strokeStyle=TH.muted; ctx.beginPath(); ctx.moveTo(ps[0],ps[1]); ctx.lineTo(xc,yv); ctx.stroke(); ctx.restore();
    ctx.fillStyle=TH.sum; ctx.beginPath(); ctx.arc(xc,yv,3.2,0,2*Math.PI); ctx.fill();
  }
}
const WPAD={L:46,R:14,T:12,B:34};
let lastSim=null;
function drawWave(){
  const sim=lastSim; if(!sim) return;
  const {ctx,w,h}=prep(cWave), {L,R,T:Tp,B}=WPAD, W=w-L-R, H=h-Tp-B;
  const maxD=Math.max(S.dLP,S.dHP)/1000;
  let tS, tE, tRef;
  if(S.signal==='square'){ const fa=sim.info.fa; tS=Math.ceil(1.0*fa)/fa; tE=tS+3/fa; tRef=tS; }
  else {
    const post=sim.info.dur + 6/S.fc + maxD;
    const pre = S.type==='LIN' ? Math.max(5/S.fc, 0.12*post) : 0.12*post;
    tS=T0-pre; tE=Math.min(T0+post, T0+1.3); tRef=T0;
  }
  const i0=Math.max(0,Math.floor(tS*FS)), i1=Math.min(N-1,Math.ceil(tE*FS));
  const keys=[['in',sim.x,TH.input,1.3,[4,4]],['lp',sim.lp,TH.lp,1.7],['hp',sim.hp,TH.hp,1.7],['sum',sim.sum,TH.sum,2.5]];
  let amax=0.25; for(const [k,arr] of keys){ if(!S.show[k]) continue; for(let i=i0;i<=i1;i++){ const a=Math.abs(arr[i]); if(a>amax) amax=a; } }
  const ylim=amax*1.1; const yv=v=>Tp+H/2-v/ylim*(H/2);
  const xt=t=>L+(t-tS)/(tE-tS)*W;
  // grid
  ctx.font='11px '+TH.mono; ctx.lineWidth=1;
  const ys=niceStep(2*ylim,5);
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let v=-Math.floor(ylim/ys)*ys; v<=ylim+1e-9; v+=ys){
    const y=Math.round(yv(v))+0.5; ctx.strokeStyle=Math.abs(v)<1e-9?TH.gridS:TH.grid;
    ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(w-R,y); ctx.stroke();
    ctx.fillStyle=TH.muted; ctx.fillText((Math.abs(v)<1e-9?0:+v.toFixed(2))+'', L-6, y);
  }
  const spanMs=(tE-tS)*1000, ts=niceStep(spanMs,7);
  ctx.textAlign='center'; ctx.textBaseline='top';
  const startMs=(tS-tRef)*1000;
  for(let m=Math.ceil(startMs/ts)*ts; m<=(tE-tRef)*1000+1e-9; m+=ts){
    const x=Math.round(xt(tRef+m/1000))+0.5; ctx.strokeStyle=Math.abs(m)<1e-9?TH.gridS:TH.grid;
    ctx.beginPath(); ctx.moveTo(x,Tp); ctx.lineTo(x,h-B); ctx.stroke();
    ctx.fillStyle=TH.muted; ctx.fillText((+m.toFixed(1))+'', x, h-B+6);
  }
  ctx.textAlign='right'; ctx.fillText('ms', w-R, h-B+18);
  ctx.save(); ctx.beginPath(); ctx.rect(L,Tp,W,H); ctx.clip();
  for(const [k,arr,col,lw,dash] of keys){
    if(!S.show[k]) continue;
    ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.lineJoin='round'; if(dash) ctx.setLineDash(dash);
    ctx.beginPath();
    const count=i1-i0+1;
    if(count<=W*2){
      for(let i=i0;i<=i1;i++){ const x=xt(i/FS), y=yv(arr[i]); if(i===i0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    } else {
      const cols=Math.floor(W); let first=true;
      for(let c=0;c<cols;c++){
        const a=i0+Math.floor(c/cols*count), b=Math.min(i1, i0+Math.floor((c+1)/cols*count));
        let mn=Infinity, mx=-Infinity; for(let i=a;i<=b;i++){ const v=arr[i]; if(v<mn) mn=v; if(v>mx) mx=v; }
        const x=L+c+0.5;
        if(first){ ctx.moveTo(x,yv(mx)); first=false; } else ctx.lineTo(x,yv(mx));
        ctx.lineTo(x,yv(mn));
      }
    }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

/* ---------- readouts ---------- */
const $=id=>document.getElementById(id);
const fmtF=f=>f>=1000?(f/1000).toFixed(2)+' kHz':(f<100?f.toFixed(1):f.toFixed(0))+' Hz';
const fmtDb=v=>v<-99?'< −99 dB':(v>=0?'+':'−')+Math.abs(v).toFixed(1)+' dB';
const fmtDeg=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(0)+'°';
const fmtMs=v=>isFinite(v)?((v<0?'−':'')+Math.abs(v).toFixed(2)+' ms'):'—';
function flatness(invv){
  let mx=0; for(let i=0;i<80;i++){ const f=S.fc/4*Math.pow(16,i/79); const r=respAt(M,S,f,invv); mx=Math.max(mx, Math.abs(db(r.sum))); } return mx;
}
function updateReadout(){
  const r=respAt(M,S,S.fsel);
  $('roTitle').textContent='At the probe frequency, '+fmtF(S.fsel);
  $('rLPdb').textContent=fmtDb(db(r.lp)); $('rHPdb').textContent=fmtDb(db(r.hp)); $('rSdb').textContent=fmtDb(db(r.sum));
  $('rLPa').textContent=Cx.abs(r.lp).toFixed(3); $('rHPa').textContent=Cx.abs(r.hp).toFixed(3); $('rSa').textContent=Cx.abs(r.sum).toFixed(3);
  const pl=Cx.arg(r.lp)*180/Math.PI, phh=Cx.arg(r.hp)*180/Math.PI;
  $('rLPp').textContent=fmtDeg(pl); $('rHPp').textContent=fmtDeg(phh); $('rSp').textContent=fmtDeg(Cx.arg(r.sum)*180/Math.PI);
  $('rLPg').textContent=fmtMs(gdAt(M,S,S.fsel,'lp')*1000); $('rHPg').textContent=fmtMs(gdAt(M,S,S.fsel,'hp')*1000); $('rSg').textContent=fmtMs(gdAt(M,S,S.fsel,'sum')*1000);
  const diff=wrapDeg(phh-pl);
  const fNow=flatness(S.inv), fOther=flatness(!S.inv);
  let t='The two arrows are '+Math.abs(diff).toFixed(0)+'° apart here, so they '+(Math.abs(diff)<30?'mostly reinforce':Math.abs(diff)>150?'mostly cancel':'partly reinforce')+'. ';
  t+='From fc/4 to 4·fc the sum stays within ±'+fNow.toFixed(1)+' dB.';
  if(fOther+1<fNow) t+=' Inverting the high-pass would tighten that to ±'+fOther.toFixed(1)+' dB.';
  $('hint1').textContent=t;
  const dd=S.dLP-S.dHP, h2=$('hint2');
  if(Math.abs(dd)>0.05){
    const deg=Math.abs(dd)/1000*S.fsel*360;
    h2.textContent='The paths are offset by '+Math.abs(dd).toFixed(1)+' ms. Phase shift from a pure delay is 360° × f × τ, so at '+fmtF(S.fsel)+' that adds '+deg.toFixed(0)+'° ('+(deg/360).toFixed(2)+' cycles) between the two arrows. Unlike filter phase, it keeps growing with frequency.';
    h2.hidden=false;
  } else h2.hidden=true;
}
function updateCaptions(){
  $('gdTitle').textContent=S.gd==='gd'?'Group delay':'Phase';
  $('gdCap').innerHTML = S.gd==='gd'
    ? 'Group delay <code>τ(f) = −dφ/dω</code> is how long each frequency is held back. A flat line means the waveform passes through with its shape intact. A bump means frequencies near it arrive late relative to the rest.'
    : 'Phase <code>φ(f)</code> is the angle of each arrow, wrapped to ±180°. Where LP and HP lines coincide at fc they add fully. Where they are 180° apart they cancel.';
  const s=S.signal;
  let cap = s==='burst' ? 'A '+S.cycles+'-cycle tone burst at '+fmtF(S.fsel)+' starts at 0 ms. Watch the low-pass output start late and ring on, and whether LP + HP rebuilds the dashed input.'
         : s==='step' ? 'A step at 0 ms. The low-pass output rises slowly and may overshoot. The high-pass output spikes and decays. Their sum shows the crossover\'s own step response.'
         : 'A band-limited square wave at '+fmtF(lastSignalInfo()&&lastSignalInfo().fa?lastSignalInfo().fa:S.fsel)+', in steady state. An all-pass sum keeps every harmonic\'s level but shifts their timing, so the shape changes even though the level chart is flat.';
  if(S.type==='LIN') cap+=' Linear-phase is drawn zero-phase, so you can see ringing before the event. A real FIR would add its bulk latency on top.';
  cap+=' Simulated exactly in the frequency domain at 16 kHz.';
  $('waveCap').textContent=cap;
}

/* ---------- UI wiring ---------- */
const logMap=(v,a,b)=>a*Math.pow(b/a, v/1000), logInv=(f,a,b)=>Math.round(1000*Math.log(f/a)/Math.log(b/a));
const FC_A=30, FC_B=400, FS_A=20, FS_B=1000;
function setPressed(container, attr, val){ container.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset[attr]===String(val)))); }
function renderOrders(){
  const seg=$('orderSeg'); seg.innerHTML='';
  for(const o of ORDERS[S.type]){ const b=document.createElement('button'); b.type='button'; b.dataset.order=o; b.textContent=(S.type==='LR'||S.type==='LIN')?'LR'+o:String(o); seg.appendChild(b); }
  setPressed(seg,'order',S.order);
  $('slopeVal').textContent=(S.order*6)+' dB/oct';
}
function syncUI(){
  setPressed($('typeSeg'),'type',S.type); renderOrders();
  setPressed($('sigSeg'),'sig',S.signal); setPressed($('cycSeg'),'cyc',S.cycles); setPressed($('gdSeg'),'gd',S.gd);
  $('cycGroup').hidden = S.signal!=='burst';
  $('fc').value=logInv(S.fc,FC_A,FC_B); $('fcVal').textContent=fmtF(S.fc);
  $('fsel').value=logInv(S.fsel,FS_A,FS_B); $('fselVal').textContent=fmtF(S.fsel);
  $('inv').checked=S.inv;
  $('dLP').value=S.dLP; $('dLPVal').textContent=S.dLP.toFixed(1)+' ms';
  $('dHP').value=S.dHP; $('dHPVal').textContent=S.dHP.toFixed(1)+' ms';
  $('sLP').checked=S.show.lp; $('sHP').checked=S.show.hp; $('sSum').checked=S.show.sum; $('sIn').checked=S.show.in;
  $('spinBtn').textContent=S.spin?'Pause':'Rotate';
}
let pending=false, needSim=true;
function schedule(sim){ if(sim) needSim=true; if(pending) return; pending=true; requestAnimationFrame(render); }
function render(){
  pending=false; readTheme();
  computeCurves();
  if(needSim){ lastSim=simulate(M,S,S); needSim=false; }
  drawMag(); drawGd(); drawPhasor(); drawWave(); updateReadout(); updateCaptions();
}
function rebuild(){ M=buildModel(S.type,S.order); }

$('typeSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.type=b.dataset.type;
  const os=ORDERS[S.type]; if(!os.includes(S.order)) S.order=os.reduce((p,c)=>Math.abs(c-S.order)<Math.abs(p-S.order)?c:p, os[0]);
  rebuild(); syncUI(); schedule(true); });
$('orderSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.order=+b.dataset.order; rebuild(); syncUI(); schedule(true); });
$('sigSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.signal=b.dataset.sig; syncUI(); schedule(true); });
$('cycSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.cycles=+b.dataset.cyc; syncUI(); schedule(true); });
$('gdSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; S.gd=b.dataset.gd; syncUI(); schedule(false); });
$('fc').addEventListener('input',e=>{ S.fc=logMap(+e.target.value,FC_A,FC_B); $('fcVal').textContent=fmtF(S.fc); schedule(true); });
$('fsel').addEventListener('input',e=>{ S.fsel=logMap(+e.target.value,FS_A,FS_B); $('fselVal').textContent=fmtF(S.fsel); schedule(true); });
$('inv').addEventListener('change',e=>{ S.inv=e.target.checked; schedule(true); });
$('dLP').addEventListener('input',e=>{ S.dLP=+e.target.value; $('dLPVal').textContent=S.dLP.toFixed(1)+' ms'; schedule(true); });
$('dHP').addEventListener('input',e=>{ S.dHP=+e.target.value; $('dHPVal').textContent=S.dHP.toFixed(1)+' ms'; schedule(true); });
[['sLP','lp'],['sHP','hp'],['sSum','sum'],['sIn','in']].forEach(([id,k])=>$(id).addEventListener('change',e=>{ S.show[k]=e.target.checked; schedule(false); }));
$('spinBtn').addEventListener('click',()=>{ S.spin=!S.spin; syncUI(); if(S.spin) startSpin(); });

function probeDrag(cv, pad){
  let down=false;
  const set=e=>{ const r=cv.getBoundingClientRect(), x=e.clientX-r.left, W=r.width-pad.L-pad.R;
    let f=xf(Math.max(pad.L,Math.min(r.width-pad.R,x)),pad.L,W); f=Math.max(FS_A,Math.min(FS_B,f));
    S.fsel=f; $('fsel').value=logInv(f,FS_A,FS_B); $('fselVal').textContent=fmtF(f); schedule(true); };
  cv.addEventListener('pointerdown',e=>{ down=true; try{cv.setPointerCapture(e.pointerId);}catch(_){} set(e); });
  cv.addEventListener('pointermove',e=>{ if(down) set(e); });
  const up=()=>{ down=false; };
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
}
probeDrag(cMag,MAGPAD); probeDrag(cGd,GDPAD);

const PRESETS=[
  {t:'LR4 at 100 Hz', d:'the usual default', s:{type:'LR',order:4,fc:100,fsel:100,inv:false,dLP:0,dHP:0,signal:'burst',cycles:4}},
  {t:'LR2 polarity', d:'deep null until you invert', s:{type:'LR',order:2,fc:100,fsel:100,inv:false,dLP:0,dHP:0,signal:'burst',cycles:4}},
  {t:'Butterworth 1st order', d:'sum is a perfect wire', s:{type:'BW',order:1,fc:100,fsel:50,inv:false,dLP:0,dHP:0,signal:'square'}},
  {t:'Square wave through LR4', d:'flat level, changed shape', s:{type:'LR',order:4,fc:100,fsel:40,inv:false,dLP:0,dHP:0,signal:'square'}},
  {t:'Uncompensated horn path', d:'8.7 ms extra on the low side', s:{type:'LR',order:4,fc:100,fsel:100,inv:false,dLP:8.7,dHP:0,signal:'burst',cycles:4}},
  {t:'Linear-phase pre-ringing', d:'LR8 shape, zero phase', s:{type:'LIN',order:8,fc:100,fsel:100,inv:false,dLP:0,dHP:0,signal:'step'}},
  {t:'LR8 ringing', d:'steep slope, long tail', s:{type:'LR',order:8,fc:100,fsel:100,inv:false,dLP:0,dHP:0,signal:'step'}}
];
const pc=$('presets');
PRESETS.forEach(p=>{ const b=document.createElement('button'); b.type='button'; b.innerHTML='<b></b> · <span></span>'; b.querySelector('b').textContent=p.t; b.querySelector('span').textContent=p.d;
  b.addEventListener('click',()=>{ Object.assign(S,p.s); rebuild(); syncUI(); schedule(true); }); pc.appendChild(b); });

/* spin */
let spinT=null;
function spinLoop(ts){
  if(!S.spin){ spinT=null; return; }
  if(spinT!==null){ theta+= (ts-spinT)/1000*2*Math.PI*0.3; }
  spinT=ts; drawPhasor(); requestAnimationFrame(spinLoop);
}
function startSpin(){ spinT=null; requestAnimationFrame(spinLoop); }

/* resize (the theme is fixed at build time by palette.js) */
if('ResizeObserver' in window){ const ro=new ResizeObserver(()=>schedule(false)); [cMag,cGd,cPh,cWave].forEach(c=>ro.observe(c)); }
else window.addEventListener('resize',()=>schedule(false));
if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>schedule(false));

syncUI(); schedule(true); if(S.spin) startSpin();
