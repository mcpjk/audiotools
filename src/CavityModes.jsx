import React, { useState, useMemo, useEffect, useRef } from "react";
import { C } from "./palette.js";
import * as X from "./cavity-model.js";

// ═══════════════════════════════════════════════════════════════════
// CAVITY MODES — standing-wave pressure inside an imported enclosure shape
// ═══════════════════════════════════════════════════════════════════
//
// PURPOSE
//   Box Modes for any shape. Load an STL of the AIR SPACE inside a
//   loudspeaker (slanted walls, bracing, the driver's own bulk, anything
//   the CAD model has), place the driver and the port's inner entrance,
//   and see the pressure the box puts on the port, relative to the lumped
//   (uniform) value — so the entrance can go where the modes that couple
//   to the driver are quietest, at the port's own pipe resonance.
//
// MODEL (physics in cavity-model.js, tested by scripts/test-cavity.mjs
// against closed forms; the solve runs in cavity-worker.js)
//   1. The mesh is laid on a cubic grid of side h. Each cell records how
//      much of it is air, and each cell face how much of it is open
//      ("cut cells"), so slanted and curved walls are not staircased.
//   2. Finite-volume Helmholtz eigenproblem on that grid, rigid walls:
//      K·p = k²·M·p. Every mode up to 1.5× the highest frequency read is
//      found by shift-invert Lanczos.
//   3. Forced response by the SAME modal sum as Box Modes:
//        R = p/p₀ = 1 + Σ (−k²·w_n)·ψ̄_n(cone)·ψ̄_n(port) / (k_n² − k² + j·k·k_n/Q)
//      with ψ normalised to peak ±1 and w_n = V/Λ_n (2, 4, 8 for a box's
//      axial, tangential, oblique modes; whatever the shape gives here).
//   4. Plus the modes ABOVE the cut-off, as a static tail: two extra
//      solves give their spring term and its first dynamic correction
//      exactly. Without it, stopping at 1.5× the top frequency costs ~1 dB;
//      with it, ~0.3 dB (test-cavity §4).
//
// ACCURACY (measured against closed forms, test-cavity.mjs)
//   · Mode frequencies: within 0.2–0.5% for a box rotated 30° on a 20 mm
//     grid and a cylinder on a 14 mm grid; error falls as h² and is almost
//     always LOW (the grid makes the air slightly too compliant).
//   · Forced response: within 0.3 dB of the analytic box, 40–800 Hz, on a
//     12.5 mm grid. Errors are largest in DIPS, where small absolute
//     errors are large in dB.
//   · The grid default is λ/24 at the top frequency read, and never
//     coarser than 12 mm, because the cone and port mouth have to span
//     several cells for their averages to be right. A port mouth only two
//     cells across is a point probe, and reads accordingly.
//
// KNOWN LIMITS — and which way each one errs
//   · Rigid walls, still air, everything that is not in the mesh is not in
//     the model. Bracing and the driver's bulk ARE included if the mesh has
//     them — an improvement on the rectangular tool — but a brace or gap
//     thinner than about one cell is partly lost: a thin brace leaks, a
//     narrow slot closes.
//   · Lining and fill are ONE modal Q, as in Box Modes. Real absorption is
//     stronger at high frequency and fibre fill slows sound, moving modes
//     DOWN. A lined box has its modes lower and its upper modes better
//     damped than shown.
//   · Driver = rigid piston, uniform velocity, unaffected by the box; port
//     entrance = passive receiver of the averaged pressure. The port's own
//     tube is NOT in the model unless it is modelled as solid in the mesh.
//   · Only the largest connected air region is kept; a sealed sub-chamber
//     is dropped and its volume reported.
//   · Near the cone (within about a cone radius) the field converges
//     slowly; read the slices with caution there.
//
// The tool is good for: WHICH modes couple driver to port in a real shape,
// and WHERE an entrance sees the least of them. Absolute dB carries the Q
// guess with it; compare positions, not boxes.

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const AX = ["x", "y", "z"];
const fmt = (v, dec = 1) => {
  if (v == null || isNaN(v) || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  return v.toFixed(dec);
};
const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);

const rgb255 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Diverging map anchored on the palette, as in Box Modes: quieter → series2,
// lumped (0 dB) → panel, louder → series5. Solid cells draw as page.
const NEG = rgb255(C.series2), MID = rgb255(C.panel), POS = rgb255(C.series5), SOLID = rgb255(C.inkMuted);
const divRGB = [0, 0, 0];
function diverge(t) {
  const u = Math.max(-1, Math.min(1, t));
  const end = u < 0 ? NEG : POS, a = Math.abs(u);
  for (let i = 0; i < 3; i++) divRGB[i] = MID[i] + a * (end[i] - MID[i]);
  return divRGB;
}

const sInput = {
  background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.ink, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = { fontSize: 11, color: C.inkDim, fontFamily: C.sans, marginBottom: 3, display: "block", letterSpacing: "0.03em" };

function NumInput({ label, value, onChange, unit, min, max, step = 1, accent }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const p = parseFloat(local);
    if (!isNaN(p)) onChange(Math.min(Math.max(p, min ?? -Infinity), max ?? Infinity));
    else setLocal(String(value));
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={sLabel}>{label} {unit && <span style={{ color: C.inkMuted }}>({unit})</span>}</label>
      <input type="number" value={local} min={min} max={max} step={step}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={sLabel}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={sInput}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}

// Per-frequency coefficients that turn mode shapes (and the two static
// fields) into R at any cell:  R(cell) = Σ_n A_n·ψ_n(cell) − k²·(z1 + k²·z2)(cell)
// where A_n carries the source average, the resonance, and REMOVES the kept
// modes' own static part (the static fields hold every mode; see
// cavity-model.js staticFields).
function coefficients(modes, sAvg, c, Q, freqs, withTail) {
  const nm = modes.length, nf = freqs.length;
  const re = new Float64Array(nm * nf), im = new Float64Array(nm * nf);
  for (let t = 0; t < nf; t++) {
    const k = (2 * Math.PI * freqs[t]) / c, k2 = k * k;
    for (let q = 0; q < nm; q++) {
      const m = modes[q], o = q * nf + t;
      if (m.uniform) { re[o] = sAvg[q]; continue; }
      const g = m.weight * sAvg[q], kk = m.k * m.k;
      const dr = kk - k2, di = Q > 0 ? (k * m.k) / Q : 0, den = dr * dr + di * di;
      re[o] = (-k2 * g * dr) / den + (withTail ? k2 * g * (1 / kk + k2 / (kk * kk)) : 0);
      im[o] = (k2 * g * di) / den;
    }
  }
  return { re, im };
}

// ─────────────────────────────────────────────
// SLICE — one grid plane through the port entrance, |R| dB as a heat map
// ─────────────────────────────────────────────
// h, v: axes drawn (horizontal, vertical); the third is fixed at `at`
// (metres). Pixels are grid cells; solid cells are drawn grey.
function Slice({ h, v, at, op, modes, sAvg, statics, c, f, Q, band, range, port, driver, onPick }) {
  const ref = useRef(null);
  const { nx, ny, nz, h: cell, origin } = op.grid;
  const n3 = [nx, ny, nz];
  const fixed = 3 - h - v;
  const nh = n3[h], nv = n3[v];
  const iFix = Math.min(n3[fixed] - 1, Math.max(0, Math.floor((at - origin[fixed]) / cell)));
  const PX = 280, scale = PX / Math.max(nh, nv);
  const cw = Math.round(nh * scale), ch = Math.round(nv * scale);

  const field = useMemo(() => {
    const freqs = band ? [0.891, 0.944, 1, 1.059, 1.122].map((r) => f * r) : [f];
    const nf = freqs.length, ks = freqs.map((fq) => (2 * Math.PI * fq) / c);
    const { re: cRe, im: cIm } = coefficients(modes, sAvg, c, Q, freqs, !!statics);
    const out = new Float32Array(nh * nv).fill(NaN);
    const re = new Float64Array(nf), im = new Float64Array(nf);
    let iMin = -1;
    for (let b = 0; b < nv; b++) for (let a = 0; a < nh; a++) {
      const ijk = [0, 0, 0]; ijk[h] = a; ijk[v] = b; ijk[fixed] = iFix;
      const n = op.index[(ijk[0] * ny + ijk[1]) * nz + ijk[2]];
      if (n < 0) continue;
      re.fill(0); im.fill(0);
      for (let q = 0; q < modes.length; q++) {
        const p = modes[q].psi[n];
        for (let t = 0; t < nf; t++) { re[t] += p * cRe[q * nf + t]; im[t] += p * cIm[q * nf + t]; }
      }
      let s = 0;
      for (let t = 0; t < nf; t++) {
        const k2 = ks[t] * ks[t];
        if (statics) re[t] -= k2 * (statics.z1[n] + k2 * statics.z2[n]);
        s += re[t] * re[t] + im[t] * im[t];
      }
      out[b * nh + a] = 10 * Math.log10(Math.max(s / nf, 1e-24));
      if (iMin < 0 || out[b * nh + a] < out[iMin]) iMin = b * nh + a;
    }
    return { out, iMin };
  }, [h, v, iFix, op, modes, sAvg, statics, c, f, Q, band, nh, nv]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    cv.width = nh; cv.height = nv;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(nh, nv);
    for (let b = 0; b < nv; b++) for (let a = 0; a < nh; a++) {
      const val = field.out[b * nh + a];
      const q = Number.isNaN(val) ? SOLID : diverge(val / range);
      const o = ((nv - 1 - b) * nh + a) * 4;
      img.data[o] = q[0]; img.data[o + 1] = q[1]; img.data[o + 2] = q[2]; img.data[o + 3] = Number.isNaN(val) ? 70 : 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [field, nh, nv, range]);

  const X_ = (m) => ((m - origin[h]) / cell) * scale;
  const Y_ = (m) => ch - ((m - origin[v]) / cell) * scale;
  const marks = [];
  { // port mouth: its outline if this plane is the mouth plane, else a bar
    const [u, w] = [0, 1, 2].filter((a) => a !== port.normal);
    const half = (a) => (a === u ? port.a / 2 : a === w ? port.b / 2 : 0);
    const x0 = X_(port.c[h] - half(h)), x1 = X_(port.c[h] + half(h));
    const y0 = Y_(port.c[v] - half(v)), y1 = Y_(port.c[v] + half(v));
    marks.push(<rect key="port" x={x0} y={Math.min(y0, y1)} width={Math.max(2, x1 - x0)} height={Math.max(2, Math.abs(y1 - y0))}
      fill="none" stroke={C.ink} strokeWidth={1.6} />);
  }
  if (driver.n) { // cone: projected outline (dashed) and centre
    const pts = [];
    const n = driver.n, a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
    const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    for (let i = 0; i <= 48; i++) {
      const t = (2 * Math.PI * i) / 48, p = [0, 1, 2].map((d) => driver.c[d] + driver.r * (Math.cos(t) * u[d] + Math.sin(t) * w[d]));
      pts.push(`${i ? "L" : "M"}${X_(p[h]).toFixed(1)},${Y_(p[v]).toFixed(1)}`);
    }
    marks.push(<path key="drv" d={pts.join("")} fill="none" stroke={C.ink} strokeWidth={1} strokeDasharray="4 3" />);
  }
  const iMin = field.iMin;
  const minMark = iMin >= 0 ? [(iMin % nh + 0.5) * scale, ch - (Math.floor(iMin / nh) + 0.5) * scale] : null;

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mh = origin[h] + ((e.clientX - r.left) / r.width) * nh * cell;
    const mv = origin[v] + (1 - (e.clientY - r.top) / r.height) * nv * cell;
    onPick(h, mh, v, mv);
  };
  return (
    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.inkDim, marginBottom: 4, fontFamily: C.mono }}>
        {AX[h]}–{AX[v]} PLANE <span style={{ color: C.inkMuted }}>· {AX[fixed]} = {fmt((origin[fixed] + (iFix + 0.5) * cell) * 1000, 0)} mm</span>
      </div>
      <div style={{ position: "relative", width: cw, height: ch, cursor: "crosshair", maxWidth: "100%" }} onClick={pick}>
        <canvas ref={ref} style={{ width: cw, height: ch, imageRendering: "pixelated", display: "block", border: `1px solid ${C.borderStrong}` }} />
        <svg width={cw} height={ch} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {marks}
          {minMark && (
            <g transform={`translate(${minMark[0]},${minMark[1]})`}>
              <line x1={-5} y1={-5} x2={5} y2={5} stroke={C.ink} strokeWidth={1.2} />
              <line x1={-5} y1={5} x2={5} y2={-5} stroke={C.ink} strokeWidth={1.2} />
            </g>
          )}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 3, fontFamily: C.mono }}>
        → {AX[h]} · ↑ {AX[v]} · × quietest {iMin >= 0 ? fmt(field.out[iMin], 1) : "—"} dB
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SWEEP — R at the port entrance vs frequency, with mode ticks
// ─────────────────────────────────────────────
function Sweep({ coupling, c, Q, f, setF, pipe, fLo, fHi, ticks }) {
  const W = 760, H = 230, padL = 44, padR = 12, padT = 12, padB = 46, N = 400;
  const lx = (fq) => padL + ((Math.log10(fq) - Math.log10(fLo)) / (Math.log10(fHi) - Math.log10(fLo))) * (W - padL - padR);
  const curve = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= N; i++) { const fq = fLo * (fHi / fLo) ** (i / N); pts.push([fq, X.dB(X.ratio(fq, coupling, c, Q))]); }
    return pts;
  }, [coupling, c, Q, fLo, fHi]);
  const yMax = 30, yMin = -30;
  const ly = (db) => padT + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * (H - padT - padB);
  const path = curve.map(([fq, db], i) => `${i ? "L" : "M"}${lx(fq).toFixed(1)},${ly(db).toFixed(1)}`).join(" ");
  const grid = [];
  for (let d = Math.floor(Math.log10(fLo)); d <= Math.log10(fHi); d++)
    for (let k = 1; k <= 9; k++) { const v = k * 10 ** d; if (v >= fLo && v <= fHi) grid.push([v, k === 1]); }
  const maxW = Math.max(1e-9, ...ticks.map((t) => t.cpl));
  const pick = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    if (px < padL || px > W - padR) return;
    setF(Math.round(10 ** (Math.log10(fLo) + ((px - padL) / (W - padL - padR)) * (Math.log10(fHi) - Math.log10(fLo)))));
  };
  const baseY = H - padB;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block" }} onClick={pick}>
      {grid.map(([v, major]) => <line key={v} x1={lx(v)} x2={lx(v)} y1={padT} y2={baseY} stroke={major ? C.borderStrong : C.border} strokeWidth={major ? 0.8 : 0.5} />)}
      {[-30, -20, -10, 0, 10, 20, 30].map((db) => (
        <g key={db}>
          <line x1={padL} x2={W - padR} y1={ly(db)} y2={ly(db)} stroke={db === 0 ? C.borderStrong : C.border} strokeWidth={db === 0 ? 1 : 0.5} />
          <text x={padL - 6} y={ly(db) + 3} fontSize={10} fill={C.inkMuted} textAnchor="end" fontFamily={C.mono}>{db}</text>
        </g>
      ))}
      {[50, 100, 200, 500, 1000, 2000].filter((v) => v >= fLo && v <= fHi).map((v) => (
        <text key={"t" + v} x={lx(v)} y={baseY + 12} fontSize={10} fill={C.inkMuted} textAnchor="middle" fontFamily={C.mono}>{v >= 1000 ? `${v / 1000}k` : v}</text>
      ))}
      {ticks.filter((t) => t.f >= fLo && t.f <= fHi).map((t, i) => (
        <line key={"k" + i} x1={lx(t.f)} x2={lx(t.f)} y1={H - 4} y2={H - 4 - 2 - 20 * Math.sqrt(t.cpl / maxW)} stroke={C.series1} strokeWidth={1.2} />
      ))}
      <path d={path} fill="none" stroke={C.series2} strokeWidth={1.6} />
      {pipe > 0 && pipe >= fLo && pipe <= fHi && (
        <g>
          <line x1={lx(pipe)} x2={lx(pipe)} y1={padT} y2={baseY} stroke={C.series5} strokeWidth={1} strokeDasharray="4 3" />
          <text x={lx(pipe) + 4} y={padT + 10} fontSize={10} fill={C.series5} fontFamily={C.mono}>pipe mode</text>
        </g>
      )}
      <line x1={lx(f)} x2={lx(f)} y1={padT} y2={baseY} stroke={C.reference} strokeWidth={1} />
      <text x={padL - 30} y={padT + 4} fontSize={10} fill={C.inkDim} fontFamily={C.mono} transform={`rotate(-90 ${padL - 34} ${padT + 60})`}>dB re lumped</text>
    </svg>
  );
}

// The built-in demo: a 300 mm wide box whose back slopes from 280 mm deep at
// the bottom to 200 mm at the top, 450 mm tall — 32.4 L. Coordinates as an
// STL would carry them: x across, y up, z front → back.
const DEMO = { name: "demo: slanted-back box, 32.4 L", tris: X.prismMesh([[0, 0], [0.28, 0], [0.20, 0.45], [0, 0.45]], 0.30),
  driver: [150, 290, 0], cone: 170, port: [150, 80, 150], portNormal: 2 };

// ═════════════════════════════════════════════
export default function CavityModes() {
  const [model, setModel] = useState({ name: DEMO.name, tris: DEMO.tris });
  const [unit, setUnit] = useState("0.001");
  const [fileBuf, setFileBuf] = useState(null);
  const [fRead, setFRead] = useState(1000);
  const [hAuto, setHAuto] = useState(true);
  const [hMm, setHMm] = useState(12);
  const [temp, setTemp] = useState(30);
  const [Q, setQ] = useState(10);
  const [f, setF] = useState(400);
  const [band, setBand] = useState(false);
  const [pipe, setPipe] = useState(600);
  const [range, setRange] = useState(20);
  const [drv, setDrv] = useState(DEMO.driver);
  const [coneD, setConeD] = useState(DEMO.cone);
  const [portC, setPortC] = useState(DEMO.port);
  const [portNormal, setPortNormal] = useState(DEMO.portNormal);
  const [portA, setPortA] = useState(70);
  const [portB, setPortB] = useState(70);
  const [clickSets, setClickSets] = useState("port");

  const [job, setJob] = useState({ state: "idle" });
  const [solved, setSolved] = useState(null); // { op, modes, h, fRead, name }
  const [statics, setStatics] = useState(null);
  const workerRef = useRef(null);
  const staticId = useRef(0);

  const c = speedOfSound(temp);
  const tris = model.tris;
  const meshV = useMemo(() => Math.abs(X.meshVolume(tris)), [tris]);
  const meshS = useMemo(() => X.meshArea(tris), [tris]);
  const bb = useMemo(() => X.bounds(tris), [tris]);
  const hAutoMm = Math.min(12, (1000 * c) / (24 * fRead));
  const hUse = (hAuto ? hAutoMm : hMm) / 1000;
  const cellsEst = meshV / hUse ** 3;
  const modesEst = X.weylCount(meshV, meshS, 1.5 * fRead, c);

  // re-read the file when the unit changes
  useEffect(() => {
    if (!fileBuf) return;
    try { setModel((m) => ({ ...m, tris: X.parseSTL(fileBuf, Number(unit)) })); }
    catch (e) { setJob({ state: "error", message: e.message }); }
  }, [unit, fileBuf]);

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => {
      try {
        const t = X.parseSTL(buf, Number(unit));
        setFileBuf(buf);
        setModel({ name: file.name, tris: t });
        const b = X.bounds(t);
        const mid = [0, 1, 2].map((a) => Math.round(((b.lo[a] + b.hi[a]) / 2) * 1000));
        setPortC(mid);
        setDrv([mid[0], mid[1], Math.round(b.lo[2] * 1000)]);
        setSolved(null); setStatics(null); setJob({ state: "idle" });
      } catch (err) { setJob({ state: "error", message: err.message }); }
    });
  };

  const solve = () => {
    if (workerRef.current) workerRef.current.terminate();
    const w = new Worker(new URL("./cavity-worker.js", import.meta.url), { type: "module" });
    workerRef.current = w;
    const name = model.name, h = hUse, fr = fRead;
    setJob({ state: "running", step: 0 });
    w.onmessage = ({ data }) => {
      if (data.type === "grid") setJob((j) => ({ ...j, grid: data }));
      else if (data.type === "progress") setJob((j) => ({ ...j, ...data }));
      else if (data.type === "modes") {
        setSolved({ op: data.op, modes: data.modes, h, fRead: fr, name, converged: data.converged });
        setStatics(null);
        setJob((j) => ({ ...j, state: "done", seconds: data.seconds, steps: data.steps }));
      } else if (data.type === "static") {
        if (data.id === staticId.current) setStatics({ z1: data.z1, z2: data.z2 });
      } else if (data.type === "error") setJob({ state: "error", message: data.message });
    };
    // k is geometry only; the cut-off is set at the current temperature
    w.postMessage({ type: "solve", tris: Float64Array.from(tris), h, kCut: (2 * Math.PI * 1.5 * fr) / c });
  };
  // run the demo once on arrival so the page is never empty
  useEffect(() => { solve(); return () => workerRef.current && workerRef.current.terminate(); }, []); // eslint-disable-line

  // ── driver and port, as functionals on the solved grid ──
  const drvM = useMemo(() => drv.map((v) => v / 1000), [drv]);
  const portM = useMemo(() => portC.map((v) => v / 1000), [portC]);
  const wall = useMemo(() => X.closestWallPoint(tris, drvM), [tris, drvM]);
  const op = solved && solved.op;
  const drvN = useMemo(() => (op ? X.wallNormal(op, tris, wall.point, Math.max(0.01, coneD / 4000)) : null), [op, tris, wall, coneD]);
  const src = useMemo(() => (op && drvN ? X.discFunctional(op, wall.point, drvN, coneD / 2000) : null), [op, wall, drvN, coneD]);
  const rcv = useMemo(() => (op ? X.rectFunctional(op, portM, portA / 1000, portB / 1000, portNormal) : null), [op, portM, portA, portB, portNormal]);
  const portInAir = useMemo(() => (op ? X.cellAt(op, portM) >= 0 : true), [op, portM]);

  // static tail for this driver position, from the worker
  useEffect(() => {
    if (!src || !workerRef.current) return;
    staticId.current += 1;
    setStatics(null);
    workerRef.current.postMessage({ type: "static", id: staticId.current, src: { idx: src.idx, w: src.w } });
  }, [src]);

  const modes = useMemo(() => (solved ? solved.modes.map((m) => ({ ...m, f: (m.k * c) / (2 * Math.PI) })) : []), [solved, c]);
  const sAvg = useMemo(() => (src ? modes.map((m) => X.average(src, m.psi)) : []), [modes, src]);
  const coupling = useMemo(() => (src && rcv ? X.couple(modes, src, rcv, statics) : null), [modes, src, rcv, statics]);

  const fLo = 40, fHi = solved ? solved.fRead : fRead;
  const atPort = coupling ? (band ? bandDb(f, coupling, c, Q) : X.dB(X.ratio(f, coupling, c, Q))) : null;
  const atPipe = coupling && pipe > 0 ? X.dB(X.ratio(pipe, coupling, c, Q)) : null;
  const ticks = useMemo(() => (coupling ? coupling.pairs.filter((p) => !p.mode.uniform)
    .map((p) => ({ f: p.mode.f, cpl: Math.abs(p.mode.weight * p.s * p.r) })) : []), [coupling]);
  const near = useMemo(() => {
    if (!coupling) return [];
    const k = (2 * Math.PI * f) / c;
    return coupling.pairs.map((p, i) => ({ ...p, i })).filter((p) => !p.mode.uniform && p.mode.f > f / Math.SQRT2 && p.mode.f < f * Math.SQRT2)
      .map((p) => {
        const dr = p.mode.k ** 2 - k * k, di = (k * p.mode.k) / Q;
        const term = Math.abs(k * k * p.mode.weight * p.s * p.r) / Math.hypot(dr, di);
        return { ...p, termDb: 20 * Math.log10(Math.max(term, 1e-12)) };
      }).sort((a, b) => b.termDb - a.termDb).slice(0, 10);
  }, [coupling, f, c, Q]);

  const onPick = (h, mh, v, mv) => {
    const set = clickSets === "port" ? setPortC : setDrv;
    set((p) => { const q = [...p]; q[h] = Math.round(mh * 1000); q[v] = Math.round(mv * 1000); return q; });
  };

  // ── layout ──
  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.inkDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0 12px" };
  const note = { fontSize: 10, color: C.inkMuted, lineHeight: 1.5 };
  const warn = { fontSize: 10, color: C.series5, lineHeight: 1.5, marginTop: 4 };
  const btn = (active, col) => ({
    background: active ? col + "20" : "transparent", border: `1px solid ${active ? col : C.border}`,
    borderRadius: 3, color: active ? col : C.inkDim, fontSize: 10, padding: "3px 9px", cursor: "pointer", fontFamily: C.mono,
  });
  const setAxis = (setter, a) => (val) => setter((p) => { const q = [...p]; q[a] = val; return q; });
  const stale = solved && (solved.name !== model.name || Math.abs(solved.h - hUse) > 1e-9 || solved.fRead !== fRead);
  const portAxes = [0, 1, 2].filter((a) => a !== portNormal);
  const portCells = op ? Math.min(portA, portB) / 1000 / op.grid.h : 0;
  const coneCells = op ? coneD / 1000 / op.grid.h : 0;

  const stats = [
    { label: "Air volume", value: `${fmt(meshV * 1000, 1)} L`, sub: op ? `grid ${fmt(op.volume * 1000, 2)} L in ${op.N.toLocaleString()} cells` : "from the mesh" },
    { label: "Modes found", value: solved ? `${modes.length - 1}` : "—", sub: solved ? `to ${fmt(1.5 * solved.fRead, 0)} Hz, + static tail${statics ? "" : " (computing)"}` : "solve to find them" },
    { label: "At port entrance", value: atPort == null ? "—" : `${fmt(atPort, 1)} dB`, sub: `${band ? "⅓-oct RMS" : "single f"} at ${f} Hz, re lumped`, color: atPort > 0 ? C.series5 : C.series2 },
    { label: "At pipe-mode marker", value: atPipe == null ? "—" : `${fmt(atPipe, 1)} dB`, sub: pipe > 0 ? `${pipe} Hz, re lumped` : "set a marker", color: atPipe > 0 ? C.series5 : C.series2 },
  ];

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, margin: 0, letterSpacing: "0.05em" }}>CAVITY MODES</h1>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2, marginBottom: 14 }}>
          Box Modes for any shape: load an STL of the air space inside a speaker, and see where its standing waves press on the port entrance.
          For a plain rectangular box, <a href="./box-modes.html" style={{ color: C.accent }}>Box Modes</a> is exact and instant.
        </div>

        <div style={card}>
          <div style={secTitle}>Geometry · the air space, as a closed STL</div>
          <div style={grid}>
            <div style={{ marginBottom: 10, gridColumn: "span 2" }}>
              <label style={sLabel}>STL file (binary or ASCII)</label>
              <input type="file" accept=".stl" onChange={onFile} style={{ ...sInput, padding: 4 }} />
            </div>
            <Select label="File units" value={unit} onChange={setUnit} options={[["0.001", "millimetres"], ["0.01", "centimetres"], ["1", "metres"], ["0.0254", "inches"]]} />
            <NumInput label="Highest frequency read" value={fRead} onChange={(v) => setFRead(Math.round(v))} unit="Hz" min={200} max={2500} />
            <div style={{ marginBottom: 10 }}>
              <label style={sLabel}>Grid cell <span style={{ color: C.inkMuted }}>(mm)</span></label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setHAuto(true)} style={btn(hAuto, C.series2)}>auto {fmt(hAutoMm, 1)}</button>
                <button onClick={() => setHAuto(false)} style={btn(!hAuto, C.series2)}>set</button>
              </div>
            </div>
            {!hAuto && <NumInput label="Cell size" value={hMm} onChange={setHMm} unit="mm" min={2} max={50} step={0.5} />}
          </div>
          <div style={note}>
            Loaded: <span style={{ fontFamily: C.mono, color: C.ink }}>{model.name}</span> · {(tris.length / 9).toLocaleString()} triangles ·
            {" "}extent {[0, 1, 2].map((a) => fmt((bb.hi[a] - bb.lo[a]) * 1000, 0)).join(" × ")} mm ({AX.join(" × ")}) ·
            {" "}about {Math.round(cellsEst).toLocaleString()} cells and {Math.round(modesEst)} modes at this setting
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={solve} disabled={job.state === "running"} style={{ ...btn(true, C.accent), fontSize: 12, padding: "6px 14px" }}>
              {job.state === "running" ? "solving…" : stale ? "solve again (settings changed)" : "solve modes"}</button>
            {fileBuf && <button onClick={() => { setFileBuf(null); setModel({ name: DEMO.name, tris: DEMO.tris }); setDrv(DEMO.driver); setPortC(DEMO.port); }} style={btn(false, C.inkDim)}>back to demo</button>}
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.inkDim }}>
              {job.state === "running" && (job.grid ? `${job.grid.N.toLocaleString()} cells · Lanczos step ${job.step ?? 0} · ${job.converged ?? 0}/${job.wanted ?? 0} modes converged · ${fmt(job.seconds ?? 0, 0)} s` : "building grid…")}
              {job.state === "done" && `solved in ${fmt(job.seconds, 1)} s (${job.steps} Lanczos steps)`}
              {job.state === "error" && <span style={{ color: C.series5 }}>{job.message}</span>}
            </span>
          </div>
          {job.grid && job.grid.badRays > 0 && (
            <div style={warn}>The mesh is not closed: {job.grid.badRays} of {job.grid.rays} test rays crossed its surface an odd number of times and were skipped.
              The air volume may be wrong — check the export for holes or overlapping shells.</div>
          )}
          {job.grid && job.grid.droppedVolume > 1e-6 && (
            <div style={warn}>{fmt(job.grid.droppedVolume * 1000, 2)} L of air is not connected to the main cavity and was left out.</div>
          )}
          {solved && !solved.converged && <div style={warn}>The eigen-solver stopped before every mode converged; the highest modes may be missing.</div>}
          {modesEst > 250 && <div style={warn}>That is a lot of modes for a browser — expect minutes and a few hundred MB of memory. Lowering the highest frequency read helps most.</div>}
        </div>

        <div style={card}>
          <div style={secTitle}>Air · damping · what to show</div>
          <div style={grid}>
            <NumInput label="Air temperature" value={temp} onChange={setTemp} unit="°C" min={-20} max={50} />
            <NumInput label="Modal Q (lining)" value={Q} onChange={setQ} min={1} max={200} />
            <NumInput label="Frequency shown" value={f} onChange={setF} unit="Hz" min={fLo} max={fHi} accent={C.reference} />
            <NumInput label="Pipe-mode marker (0 = off)" value={pipe} onChange={setPipe} unit="Hz" min={0} max={fHi} accent={C.series5} />
            <NumInput label="Colour range ±" value={range} onChange={setRange} unit="dB" min={3} max={40} />
            <div style={{ marginBottom: 10 }}>
              <label style={sLabel}>Averaging</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setBand(false)} style={btn(!band, C.series2)}>single f</button>
                <button onClick={() => setBand(true)} style={btn(band, C.series2)}>⅓ octave</button>
              </div>
            </div>
            {pipe > 0 && <div style={{ marginBottom: 10 }}><label style={sLabel}>Jump to</label><button onClick={() => setF(pipe)} style={btn(false, C.series5)}>pipe {pipe}</button></div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0 14px" }}>
          <div style={card}>
            <div style={secTitle}>Driver · rigid piston on the nearest wall</div>
            <div style={grid}>
              {[0, 1, 2].map((a) => <NumInput key={a} label={`Centre ${AX[a]}`} value={drv[a]} onChange={setAxis(setDrv, a)} unit="mm" />)}
              <NumInput label="Cone effective Ø" value={coneD} onChange={setConeD} unit="mm" min={10} max={1000} />
            </div>
            <div style={note}>
              Snapped to the wall at ({wall.point.map((v) => fmt(v * 1000, 0)).join(", ")}) mm, {fmt(wall.distance * 1000, 0)} mm from the point given
              {drvN && <> · facing ({drvN.map((v) => v.toFixed(2)).join(", ")})</>}.
            </div>
            {op && coneCells < 4 && <div style={warn}>The cone spans only {fmt(coneCells, 1)} grid cells; its average is coarse. A smaller cell helps.</div>}
          </div>
          <div style={card}>
            <div style={secTitle}>Port entrance · inner mouth</div>
            <div style={grid}>
              {[0, 1, 2].map((a) => <NumInput key={a} label={`Centre ${AX[a]}`} value={portC[a]} onChange={setAxis(setPortC, a)} unit="mm" accent={C.ink} />)}
              <Select label="Mouth faces along" value={String(portNormal)} onChange={(v) => setPortNormal(Number(v))} options={[["0", "x"], ["1", "y"], ["2", "z"]]} />
              <NumInput label={`Opening along ${AX[portAxes[0]]}`} value={portA} onChange={setPortA} unit="mm" min={1} max={2000} />
              <NumInput label={`Opening along ${AX[portAxes[1]]}`} value={portB} onChange={setPortB} unit="mm" min={1} max={2000} />
            </div>
            {!portInAir && <div style={warn}>The port centre is inside solid, not air. Its average uses the nearest air cells.</div>}
            {op && portCells < 3 && <div style={warn}>The mouth spans only {fmt(portCells, 1)} grid cells, so it reads close to a point value.</div>}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <span style={note}>Clicking a slice moves the</span>
              <button onClick={() => setClickSets("port")} style={btn(clickSets === "port", C.ink)}>port</button>
              <button onClick={() => setClickSets("driver")} style={btn(clickSets === "driver", C.ink)}>driver</button>
            </div>
          </div>
        </div>

        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 10, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              <div style={{ fontSize: 17, fontFamily: C.mono, color: s.color || C.ink, marginTop: 2 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.inkDim }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {coupling && (
          <div style={card}>
            <div style={secTitle}>Pressure at the port entrance vs frequency
              <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.inkMuted }}> · click to set frequency · ticks: modes, height = driver↔port coupling</span>
            </div>
            <Sweep coupling={coupling} c={c} Q={Q} f={f} setF={setF} pipe={pipe} fLo={fLo} fHi={fHi} ticks={ticks} />
          </div>
        )}

        {op && src && (
          <div style={card}>
            <div style={secTitle}>Slices through the port entrance · {f} Hz{band ? " ⅓-oct" : ""}
              <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.inkMuted }}>
                {" "}· <span style={{ color: C.series2 }}>quieter</span> / <span style={{ color: C.series5 }}>louder</span> than lumped · grey = solid · box = port mouth · dashed = cone</span>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[[0, 1, portM[2]], [2, 1, portM[0]], [0, 2, portM[1]]].map(([h, v, at]) => (
                <Slice key={`${h}${v}`} h={h} v={v} at={at} op={op} modes={modes} sAvg={sAvg} statics={statics} c={c} f={f} Q={Q}
                  band={band} range={range} onPick={onPick}
                  port={{ c: portM, normal: portNormal, a: portA / 1000, b: portB / 1000 }} driver={{ c: wall.point, n: drvN, r: coneD / 2000 }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 10, color: C.inkMuted, fontFamily: C.mono, flexWrap: "wrap" }}>
              <span>−{range} dB</span>
              <div style={{ width: 160, height: 8, border: `1px solid ${C.border}`, background: `linear-gradient(to right, ${C.series2}, ${C.panel}, ${C.series5})` }} />
              <span>+{range} dB re lumped</span>
              <span style={{ marginLeft: 8 }}>slices show the value in each grid cell; the readouts above average over the port mouth</span>
            </div>
          </div>
        )}

        {coupling && (
          <div style={card}>
            <div style={secTitle}>Modes within ±½ octave of {f} Hz · strongest driver→port links first</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
                <thead>
                  <tr style={{ color: C.inkMuted, fontSize: 10, textAlign: "right" }}>
                    {["mode #", "f (Hz)", "V/Λ", "ψ̄ cone", "ψ̄ port", "term at f (dB)"].map((t) => (
                      <th key={t} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {near.map((p) => (
                    <tr key={p.i} style={{ textAlign: "right", color: C.ink }}>
                      <td style={{ padding: "3px 8px" }}>{p.i}</td>
                      <td style={{ padding: "3px 8px" }}>{fmt(p.mode.f, 0)}</td>
                      <td style={{ padding: "3px 8px", color: C.inkDim }}>{fmt(p.mode.weight, 1)}</td>
                      <td style={{ padding: "3px 8px", color: Math.abs(p.s) < 0.1 ? C.inkMuted : C.ink }}>{p.s.toFixed(2)}</td>
                      <td style={{ padding: "3px 8px", color: Math.abs(p.r) < 0.1 ? C.inkMuted : C.ink }}>{p.r.toFixed(2)}</td>
                      <td style={{ padding: "3px 8px" }}>{fmt(p.termDb, 1)}</td>
                    </tr>
                  ))}
                  {near.length === 0 && <tr><td colSpan={6} style={{ padding: 8, color: C.inkMuted }}>no modes in this band</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ ...note, marginTop: 8 }}>
              ψ̄ is the mode shape averaged over the cone or the port mouth: ±1 at the mode's strongest pressure anywhere in the box, 0 on a nodal surface.
              V/Λ plays the part of the 2, 4, 8 of a rectangular box's axial, tangential and oblique modes. A mode links driver to port only if both ψ̄ are away from zero.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function bandDb(fc, coupling, c, Q, n = 9) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const m = X.mag(X.ratio(fc * 2 ** ((1 / 3) * ((i + 0.5) / n - 0.5)), coupling, c, Q));
    s += m * m;
  }
  return 10 * Math.log10(Math.max(s / n, 1e-24));
}
