import React, { useState, useMemo, useEffect, useRef } from "react";
import { C } from "./palette.js";
import * as M from "./box-modes-model.js";

// ═══════════════════════════════════════════════════════════════════
// BOX MODES — standing-wave pressure inside a rectangular enclosure
// ═══════════════════════════════════════════════════════════════════
//
// PURPOSE
//   Above a few hundred Hz a speaker box stops being one uniform spring
//   and fills with standing waves. A port's inner entrance samples the
//   pressure at one place, so WHERE it sits decides how hard the box
//   drives the port's pipe resonances. This tool shows that pressure,
//   relative to the lumped (uniform) value, so a port entrance can be
//   placed at a quiet spot before anything is cut.
//
// MODEL (physics lives in box-modes-model.js, tested by
// scripts/test-box-modes.mjs against closed forms)
//   Rigid rectangular cavity W × L × D.
//     f(l,m,n) = (c/2)·sqrt((l/W)² + (m/L)² + (n/D)²)
//     ψ(l,m,n) = cos(lπx/W)·cos(mπy/L)·cos(nπz/D)
//   Driver = rigid piston of the cone's effective diameter on one face,
//   a volume-velocity source; port entrance = an opening of given size
//   that samples the area-averaged pressure over its mouth.
//   Forced response by modal summation, every mode damped by one Q:
//     R = p/p₀ = 1 + Σ (−k²·w_n)·ψ̄_n(driver)·ψ̄_n(port) / (k_n² − k² + j·k·k_n/Q)
//   p₀ is the lumped-compliance pressure ρc²Q/(jωV), so R = 0 dB means
//   "the box is still behaving as a uniform spring here". w_n is 2, 4
//   or 8 for axial, tangential and oblique modes.
//
//   What each part of that product says, spatially: a mode carries energy
//   from driver to port only if BOTH ends sit off its nodes. ψ̄ is ±1 at a
//   mode's pressure peaks and 0 on its nodal planes. A centred cone
//   averages every mode that is odd across the cone to zero; a port mouth
//   spanning half a wavelength does the same at the other end.
//
// KNOWN LIMITS — and which way each one errs
//   · Rigid, empty box. Bracing, the driver's motor and the port tube
//     itself are not in the cavity. They shift individual modes by a few
//     percent, in either direction; treat mode frequencies as ±5%.
//   · Lining is ONE frequency-independent modal Q. Real absorption gets
//     more effective with frequency, and fibre fill slows the sound inside
//     it, which moves modes DOWN. So a lined box has its modes lower, and
//     its upper modes better damped, than shown. The default Q = 10 is a
//     guess for a lightly lined box; unlined ply is more like 20–50,
//     heavily lined 3–5. Measure it if it matters.
//   · The cone's velocity is taken as unaffected by the box modes — the
//     driver is a fixed volume-velocity source. Above a few hundred Hz its
//     moving mass dominates and this holds well; it is not a model of the
//     driver's impedance.
//   · The port entrance is a passive receiver. The tool shows how hard
//     the box DRIVES the port; it does not model the port's own reaction
//     on the box, or what then leaks out of it. Leakage ≈ this drive ×
//     the port's own transfer, which peaks at its pipe modes.
//   · The modal sum is truncated at a few times the frequency shown. It
//     converges slowly right next to the cone (the near field), so read
//     the slices with caution within about a cone radius of the driver.
//   · The face-averaging samples resolve modes up to several kHz for
//     sensible apertures; the cut-off stays inside that (see the aliasing
//     check in the test script).
//
// The tool is good for: WHICH modes couple driver to port, and WHERE in
// the box a port entrance sees the least of them. Absolute dB values carry
// the damping guess with them; compare positions, not boxes.

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const AX = ["x", "y", "z"];
const AXNAME = ["width x", "length y", "depth z"];
const dimOf = (dims, a) => [dims.W, dims.L, dims.D][a];

const fmt = (v, dec = 1) => {
  if (v == null || isNaN(v) || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  return v.toFixed(dec);
};

const rgb255 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Diverging map anchored on the palette: quieter than lumped → series2,
// lumped (0 dB) → panel, louder → series5. Derived from C so it follows the
// theme; lightness falls away from the centre on both sides in either theme.
const NEG = rgb255(C.series2), MID = rgb255(C.panel), POS = rgb255(C.series5);
const divRGB = [0, 0, 0];
function diverge(t) { // t in [−1, 1]
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
const sLabel = {
  fontSize: 11, color: C.inkDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};

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

// ─────────────────────────────────────────────
// SLICE — one plane through the port entrance, |R| in dB as a heat map
// ─────────────────────────────────────────────
// h, v: the two axes drawn (horizontal, vertical); the third is fixed at the
// port entrance. vUp: draw the vertical axis increasing upward.
function Slice({ title, h, v, fixed, dims, modes, sAvg, c, f, Q, band, range, port, driver,
  onPick, hLabel, vLabel, vUp = true }) {
  const ref = useRef(null);
  const Wm = dimOf(dims, h), Hm = dimOf(dims, v);
  const PX = 220;
  const scale = PX / Math.max(Wm, Hm);
  const cw = Math.max(20, Math.round(Wm * scale)), ch = Math.max(20, Math.round(Hm * scale));
  const nx = Math.max(12, Math.round(cw / 3.5)), ny = Math.max(12, Math.round(ch / 3.5));

  const field = useMemo(() => {
    // separable cosines: ψ = cos_l(x)·cos_m(y)·cos_n(z), tabulated per axis
    const fixedAxis = 3 - h - v;
    const idx = (mo, a) => [mo.l, mo.m, mo.n][a];
    const coordH = Array.from({ length: nx }, (_, i) => (Wm * (i + 0.5)) / nx);
    const coordV = Array.from({ length: ny }, (_, j) => (Hm * (j + 0.5)) / ny);
    const freqs = band ? [0.891, 0.944, 1, 1.059, 1.122].map((r) => f * r) : [f];
    const ks = freqs.map((fq) => (2 * Math.PI * fq) / c);
    const k2s = ks.map((k) => k * k);
    const out = new Float32Array(nx * ny);
    // per-mode, per-frequency complex coefficient (everything but ψ at the pixel)
    const nm = modes.length, nf = freqs.length;
    const cRe = new Float64Array(nm * nf), cIm = new Float64Array(nm * nf);
    const ch_ = new Float64Array(nm * nx), cv_ = new Float64Array(nm * ny), cfix = new Float64Array(nm);
    for (let q = 0; q < nm; q++) {
      const mo = modes[q];
      const ih = idx(mo, h), iv = idx(mo, v), ifx = idx(mo, fixedAxis);
      for (let i = 0; i < nx; i++) ch_[q * nx + i] = Math.cos((ih * Math.PI * coordH[i]) / Wm);
      for (let j = 0; j < ny; j++) cv_[q * ny + j] = Math.cos((iv * Math.PI * coordV[j]) / Hm);
      cfix[q] = Math.cos((ifx * Math.PI * fixed) / dimOf(dims, fixedAxis));
      for (let t = 0; t < nf; t++) {
        if (mo.weight === 1) { cRe[q * nf + t] = sAvg[q]; cIm[q * nf + t] = 0; continue; }
        const num = -k2s[t] * mo.weight * sAvg[q];
        const dr = mo.k * mo.k - k2s[t], di = (ks[t] * mo.k) / Q;
        const den = dr * dr + di * di;
        cRe[q * nf + t] = (num * dr) / den; cIm[q * nf + t] = (-num * di) / den;
      }
    }
    const re = new Float64Array(nf), im = new Float64Array(nf);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      re.fill(0); im.fill(0);
      for (let q = 0; q < nm; q++) {
        const p = ch_[q * nx + i] * cv_[q * ny + j] * cfix[q];
        if (p === 0) continue;
        for (let t = 0; t < nf; t++) { re[t] += p * cRe[q * nf + t]; im[t] += p * cIm[q * nf + t]; }
      }
      let s = 0;
      for (let t = 0; t < nf; t++) s += re[t] * re[t] + im[t] * im[t];
      out[j * nx + i] = 10 * Math.log10(Math.max(s / nf, 1e-24));
    }
    // quietest pixel, for the marker
    let iMin = 0;
    for (let q = 1; q < out.length; q++) if (out[q] < out[iMin]) iMin = q;
    return { out, min: { h: coordH[iMin % nx], v: coordV[Math.floor(iMin / nx)], db: out[iMin] } };
  }, [h, v, fixed, dims, modes, sAvg, c, f, Q, band, nx, ny, Wm, Hm]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    cv.width = nx; cv.height = ny;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const row = vUp ? ny - 1 - j : j;
      const q = diverge(field.out[j * nx + i] / range);
      const o = (row * nx + i) * 4;
      img.data[o] = q[0]; img.data[o + 1] = q[1]; img.data[o + 2] = q[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [field, nx, ny, range, vUp]);

  const X = (m) => m * scale;
  const Y = (m) => (vUp ? ch - m * scale : m * scale);

  // the port mouth and driver, as seen in this plane
  const marks = [];
  const fixedAxis = 3 - h - v;
  { // port: rectangle if the plane is its mouth plane, otherwise a segment
    const [u, w] = [0, 1, 2].filter((a) => a !== port.normal);
    const halfOn = (a) => (a === u ? port.a / 2 : a === w ? port.b / 2 : 0);
    const x0 = port.c[h] - halfOn(h), x1 = port.c[h] + halfOn(h);
    const y0 = port.c[v] - halfOn(v), y1 = port.c[v] + halfOn(v);
    marks.push(<rect key="port" x={X(x0)} y={Math.min(Y(y0), Y(y1))} width={Math.max(2, X(x1) - X(x0))}
      height={Math.max(2, Math.abs(Y(y1) - Y(y0)))} fill="none" stroke={C.ink} strokeWidth={1.6} />);
  }
  { // driver: chord of the disc where this plane cuts it
    const fa = M.FACES[driver.face];
    const pos = fa.at === "min" ? 0 : dimOf(dims, fa.axis);
    const c3 = [...driver.c]; c3[fa.axis] = pos;
    const r = driver.r;
    if (fa.axis === fixedAxis) {
      // plane parallel to the face: the cone's outline, projected
      marks.push(<circle key="drv" cx={X(c3[h])} cy={Y(c3[v])} r={r * scale} fill="none"
          stroke={C.ink} strokeWidth={1} strokeDasharray="4 3" />);
    } else {
      const inPlane = [0, 1, 2].filter((a) => a !== fa.axis);
      const along = inPlane.find((a) => a !== fixedAxis);
      const d = fixed - c3[fixedAxis];
      if (Math.abs(d) < r) {
        const half = Math.sqrt(r * r - d * d);
        const p0 = [...c3], p1 = [...c3];
        p0[along] -= half; p1[along] += half;
        marks.push(<line key="drv" x1={X(p0[h])} y1={Y(p0[v])} x2={X(p1[h])} y2={Y(p1[v])}
          stroke={C.ink} strokeWidth={4} />);
      }
    }
  }

  const pick = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    const mh = ((e.clientX - b.left) / b.width) * Wm;
    const mvRaw = ((e.clientY - b.top) / b.height) * Hm;
    onPick(h, mh, v, vUp ? Hm - mvRaw : mvRaw);
  };

  return (
    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.inkDim, marginBottom: 4, fontFamily: C.mono }}>
        {title} <span style={{ color: C.inkMuted }}>· {AX[fixedAxis]} = {fmt(fixed * 1000, 0)} mm</span>
      </div>
      <div style={{ position: "relative", width: cw, height: ch, cursor: "crosshair", maxWidth: "100%" }} onClick={pick}>
        <canvas ref={ref} style={{ width: cw, height: ch, imageRendering: "auto", display: "block",
          border: `1px solid ${C.borderStrong}` }} />
        <svg width={cw} height={ch} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {marks}
          <g transform={`translate(${X(field.min.h)},${Y(field.min.v)})`}>
            <line x1={-5} y1={-5} x2={5} y2={5} stroke={C.ink} strokeWidth={1.2} />
            <line x1={-5} y1={5} x2={5} y2={-5} stroke={C.ink} strokeWidth={1.2} />
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 3, fontFamily: C.mono }}>
        → {hLabel} · ↑ {vLabel} · × quietest {fmt(field.min.db, 1)} dB
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SWEEP — R at the port entrance vs frequency, with mode ticks
// ─────────────────────────────────────────────
function Sweep({ pairs, c, Q, f, setF, pipe, fLo, fHi, modesForTicks }) {
  const W = 760, H = 230, padL = 44, padR = 12, padT = 12, padB = 46;
  const N = 500;
  const lx = (fq) => padL + ((Math.log10(fq) - Math.log10(fLo)) / (Math.log10(fHi) - Math.log10(fLo))) * (W - padL - padR);
  const curve = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const fq = fLo * (fHi / fLo) ** (i / N);
      pts.push([fq, M.dB(M.ratio(fq, pairs, c, Q))]);
    }
    return pts;
  }, [pairs, c, Q, fLo, fHi]);
  const yMax = 30, yMin = -30;
  const ly = (db) => padT + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * (H - padT - padB);
  const path = curve.map(([fq, db], i) => `${i ? "L" : "M"}${lx(fq).toFixed(1)},${ly(db).toFixed(1)}`).join(" ");
  const decades = [];
  for (let d = Math.ceil(Math.log10(fLo)); d <= Math.log10(fHi); d++) decades.push(10 ** d);
  const minor = [];
  for (let d = Math.floor(Math.log10(fLo)); d <= Math.log10(fHi); d++)
    for (let k = 2; k <= 9; k++) { const v = k * 10 ** d; if (v > fLo && v < fHi) minor.push(v); }
  const maxW = Math.max(1e-9, ...modesForTicks.map((t) => t.cpl));
  const tickCol = { axial: C.series1, tangential: C.series3, oblique: C.inkMuted };
  const pick = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    if (px < padL || px > W - padR) return;
    const fq = 10 ** (Math.log10(fLo) + ((px - padL) / (W - padL - padR)) * (Math.log10(fHi) - Math.log10(fLo)));
    setF(Math.round(fq));
  };
  const baseY = H - padB;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block" }} onClick={pick}>
      {minor.map((v) => <line key={"m" + v} x1={lx(v)} x2={lx(v)} y1={padT} y2={baseY} stroke={C.border} strokeWidth={0.5} />)}
      {decades.map((v) => <line key={"d" + v} x1={lx(v)} x2={lx(v)} y1={padT} y2={baseY} stroke={C.borderStrong} strokeWidth={0.8} />)}
      {[-30, -20, -10, 0, 10, 20, 30].map((db) => (
        <g key={db}>
          <line x1={padL} x2={W - padR} y1={ly(db)} y2={ly(db)} stroke={db === 0 ? C.borderStrong : C.border} strokeWidth={db === 0 ? 1 : 0.5} />
          <text x={padL - 6} y={ly(db) + 3} fontSize={10} fill={C.inkMuted} textAnchor="end" fontFamily={C.mono}>{db}</text>
        </g>
      ))}
      {[50, 100, 200, 500, 1000, 2000, 5000].filter((v) => v >= fLo && v <= fHi).map((v) => (
        <text key={"t" + v} x={lx(v)} y={baseY + 12} fontSize={10} fill={C.inkMuted} textAnchor="middle" fontFamily={C.mono}>
          {v >= 1000 ? `${v / 1000}k` : v}</text>
      ))}
      {/* mode ticks: height = how strongly that mode links driver to port */}
      {modesForTicks.filter((t) => t.f >= fLo && t.f <= fHi).map((t, i) => (
        <line key={"k" + i} x1={lx(t.f)} x2={lx(t.f)} y1={H - 4} y2={H - 4 - 2 - 20 * Math.sqrt(t.cpl / maxW)}
          stroke={tickCol[t.type]} strokeWidth={1.2} />
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

// ═════════════════════════════════════════════
export default function BoxModes() {
  // box — internal dimensions, mm
  const [Wmm, setWmm] = useState(400);
  const [Lmm, setLmm] = useState(600);
  const [Dmm, setDmm] = useState(375);
  const [temp, setTemp] = useState(30);
  const [Q, setQ] = useState(10);
  const [f, setF] = useState(400);
  const [band, setBand] = useState(false);
  const [pipe, setPipe] = useState(400);
  const [range, setRange] = useState(20);

  // driver
  const [face, setFace] = useState("front");
  const [drv, setDrv] = useState([200, 200, 0]); // mm; the face-normal one is ignored
  const [coneD, setConeD] = useState(263);

  // port entrance
  const [portC, setPortC] = useState([200, 470, 300]);
  const [portNormal, setPortNormal] = useState(2);
  const [portA, setPortA] = useState(250);
  const [portB, setPortB] = useState(60);

  const dims = useMemo(() => ({ W: Wmm / 1000, L: Lmm / 1000, D: Dmm / 1000 }), [Wmm, Lmm, Dmm]);
  const c = M.speedOfSound(temp);
  const V = dims.W * dims.L * dims.D;

  const clampPt = (p) => [Math.min(Math.max(p[0], 0), Wmm), Math.min(Math.max(p[1], 0), Lmm), Math.min(Math.max(p[2], 0), Dmm)];
  const portM = useMemo(() => clampPt(portC).map((v) => v / 1000), [portC, Wmm, Lmm, Dmm]);
  const drvM = useMemo(() => clampPt(drv).map((v) => v / 1000), [drv, Wmm, Lmm, Dmm]);

  const srcPts = useMemo(() => M.discPoints(drvM, coneD / 2000, face, dims), [drvM, coneD, face, dims]);
  const rcvPts = useMemo(() => M.rectPoints(portM, portA / 1000, portB / 1000, portNormal, dims),
    [portM, portA, portB, portNormal, dims]);

  const fLo = 40, fHi = 2500;
  // Sweep and table: modes to 2.5× the top of the plot. Slices: modes to
  // 3× the frequency shown (and at least 1.5 kHz) — enough for the field
  // away from the cone; see KNOWN LIMITS.
  const sweepModes = useMemo(() => M.listModes(dims, c, 2.5 * fHi), [dims, c]);
  const pairs = useMemo(() => sweepModes.map((mode) =>
    ({ mode, s: M.avgPsi(mode, srcPts, dims), r: M.avgPsi(mode, rcvPts, dims) })), [sweepModes, srcPts, rcvPts, dims]);
  const sliceModes = useMemo(() => sweepModes.filter((m) => m.f <= Math.max(1500, 3 * f * (band ? 1.12 : 1))), [sweepModes, f, band]);
  const sliceS = useMemo(() => sliceModes.map((m) => M.avgPsi(m, srcPts, dims)), [sliceModes, srcPts, dims]);

  const atPort = band ? M.bandRatioDb(f, pairs, c, Q, 1 / 3, 9) : M.dB(M.ratio(f, pairs, c, Q));
  const atPipe = pipe > 0 ? M.dB(M.ratio(pipe, pairs, c, Q)) : null;

  // coupling strength per mode, for the ticks and the table
  const ticks = useMemo(() => pairs.filter((p) => p.mode.weight > 1)
    .map((p) => ({ f: p.mode.f, type: p.mode.type, cpl: Math.abs(p.mode.weight * p.s * p.r) })), [pairs]);

  // modes within ±½ octave of f, with their contribution at f
  const near = useMemo(() => {
    const k = 2 * Math.PI * f / c;
    return pairs.filter((p) => p.mode.weight > 1 && p.mode.f > f / Math.SQRT2 && p.mode.f < f * Math.SQRT2)
      .map((p) => {
        const dr = p.mode.k ** 2 - k * k, di = k * p.mode.k / Q;
        const term = Math.abs(k * k * p.mode.weight * p.s * p.r) / Math.hypot(dr, di);
        return { ...p, termDb: 20 * Math.log10(Math.max(term, 1e-12)) };
      }).sort((a, b) => b.termDb - a.termDb).slice(0, 10);
  }, [pairs, f, c, Q]);

  const firstAxial = [0, 1, 2].map((a) => c / (2 * dimOf(dims, a)));

  const onPick = (h, mh, v, mv) => {
    setPortC((p) => { const q = [...p]; q[h] = Math.round(mh * 1000); q[v] = Math.round(mv * 1000); return q; });
  };

  // ── layout ──
  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.inkDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0 12px" };
  const btn = (active, col) => ({
    background: active ? col + "20" : "transparent", border: `1px solid ${active ? col : C.border}`,
    borderRadius: 3, color: active ? col : C.inkDim, fontSize: 10, padding: "3px 9px", cursor: "pointer", fontFamily: C.mono,
  });
  const fa = M.FACES[face];
  const drvAxes = [0, 1, 2].filter((a) => a !== fa.axis);
  const portAxes = [0, 1, 2].filter((a) => a !== portNormal);
  const setDrvAxis = (a) => (val) => setDrv((p) => { const q = [...p]; q[a] = val; return q; });
  const setPortAxis = (a) => (val) => setPortC((p) => { const q = [...p]; q[a] = val; return q; });
  const dimMm = [Wmm, Lmm, Dmm];
  const portOutside = [[portAxes[0], portA], [portAxes[1], portB]]
    .some(([a, s]) => portC[a] - s / 2 < 0 || portC[a] + s / 2 > dimMm[a]);

  const stats = [
    { label: "Internal volume", value: `${fmt(V * 1000, 1)} L`, sub: `c = ${fmt(c, 1)} m/s at ${temp} °C` },
    { label: "1st axial modes", value: `${fmt(firstAxial[0], 0)} · ${fmt(firstAxial[1], 0)} · ${fmt(firstAxial[2], 0)} Hz`, sub: "across W · L · D, c/(2·dim)" },
    { label: "At port entrance", value: `${fmt(atPort, 1)} dB`, sub: `${band ? "⅓-oct RMS" : "single f"} around ${f} Hz, re lumped`, color: atPort > 0 ? C.series5 : C.series2 },
    { label: "At pipe-mode marker", value: atPipe == null ? "—" : `${fmt(atPipe, 1)} dB`, sub: pipe > 0 ? `${pipe} Hz, re lumped` : "set a marker", color: atPipe > 0 ? C.series5 : C.series2 },
  ];

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, margin: 0, letterSpacing: "0.05em" }}>
          BOX MODES</h1>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2, marginBottom: 14 }}>
          Standing-wave pressure inside a rectangular box, relative to the lumped (uniform) value — for placing a port entrance away from the modes that couple to the driver.
        </div>

        <div style={card}>
          <div style={secTitle}>Box · internal</div>
          <div style={grid}>
            <NumInput label="L — length (y, vertical)" value={Lmm} onChange={setLmm} unit="mm" min={50} max={3000} />
            <NumInput label="W — width (x)" value={Wmm} onChange={setWmm} unit="mm" min={50} max={3000} />
            <NumInput label="D — depth (z, front→back)" value={Dmm} onChange={setDmm} unit="mm" min={50} max={3000} />
            <NumInput label="Air temperature" value={temp} onChange={setTemp} unit="°C" min={-20} max={50} />
            <NumInput label="Modal Q (lining)" value={Q} onChange={setQ} min={1} max={200} step={1} />
          </div>
          <div style={grid}>
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
            <div style={{ marginBottom: 10 }}>
              <label style={sLabel}>Jump to</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pipe > 0 && <button onClick={() => setF(pipe)} style={btn(false, C.series5)}>pipe</button>}
                {[["W", 0], ["L", 1], ["D", 2]].map(([n, a]) => (
                  <button key={n} onClick={() => setF(Math.round(firstAxial[a]))} style={btn(false, C.series1)}>{n} {fmt(firstAxial[a], 0)}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0 14px" }}>
          <div style={card}>
            <div style={secTitle}>Driver · rigid piston on a face</div>
            <div style={grid}>
              <Select label="Mounted on" value={face} onChange={setFace}
                options={[["front", "front baffle (z = 0)"], ["back", "back (z = D)"], ["left", "left (x = 0)"],
                  ["right", "right (x = W)"], ["bottom", "bottom (y = 0)"], ["top", "top (y = L)"]]} />
              <NumInput label="Cone effective Ø" value={coneD} onChange={setConeD} unit="mm" min={10} max={1000} />
              {drvAxes.map((a) => (
                <NumInput key={a} label={`Centre ${AXNAME[a]}`} value={drv[a]} onChange={setDrvAxis(a)} unit="mm" min={0} max={dimMm[a]} />
              ))}
            </div>
          </div>
          <div style={card}>
            <div style={secTitle}>Port entrance · inner mouth</div>
            <div style={grid}>
              {[0, 1, 2].map((a) => (
                <NumInput key={a} label={`Centre ${AXNAME[a]}`} value={portC[a]} onChange={setPortAxis(a)} unit="mm" min={0} max={dimMm[a]} accent={C.ink} />
              ))}
              <Select label="Mouth faces along" value={String(portNormal)} onChange={(v) => setPortNormal(Number(v))}
                options={[["2", "z (front/back)"], ["0", "x (sideways)"], ["1", "y (up/down)"]]} />
              <NumInput label={`Opening along ${AX[portAxes[0]]}`} value={portA} onChange={setPortA} unit="mm" min={1} max={2000} />
              <NumInput label={`Opening along ${AX[portAxes[1]]}`} value={portB} onChange={setPortB} unit="mm" min={1} max={2000} />
            </div>
            {portOutside && (
              <div style={{ fontSize: 10, color: C.series5, marginBottom: 4 }}>
                The mouth extends past a wall — the model clamps its samples onto the wall, so the average over-weights the wall's pressure peak.
              </div>
            )}
            <div style={{ fontSize: 10, color: C.inkMuted }}>Click any slice to move the entrance there.</div>
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

        <div style={card}>
          <div style={secTitle}>Pressure at the port entrance vs frequency
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.inkMuted }}>
              {" "}· click to set frequency · ticks: modes, height = driver↔port coupling
              (<span style={{ color: C.series1 }}>axial</span> · <span style={{ color: C.series3 }}>tangential</span> · <span style={{ color: C.inkMuted }}>oblique</span>)</span>
          </div>
          <Sweep pairs={pairs} c={c} Q={Q} f={f} setF={setF} pipe={pipe} fLo={fLo} fHi={fHi} modesForTicks={ticks} />
        </div>

        <div style={card}>
          <div style={secTitle}>Slices through the port entrance · {f} Hz{band ? " ⅓-oct" : ""}
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.inkMuted }}>
              {" "}· <span style={{ color: C.series2 }}>quieter</span> / <span style={{ color: C.series5 }}>louder</span> than lumped · solid box = port mouth · dashed / bar = cone</span>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Slice title="FRONT VIEW" h={0} v={1} fixed={portM[2]} dims={dims} modes={sliceModes} sAvg={sliceS} c={c}
              f={f} Q={Q} band={band} range={range} onPick={onPick} hLabel="x" vLabel="y"
              port={{ c: portM, normal: portNormal, a: portA / 1000, b: portB / 1000 }} driver={{ face, c: drvM, r: coneD / 2000 }} />
            <Slice title="TOP VIEW" h={0} v={2} fixed={portM[1]} dims={dims} modes={sliceModes} sAvg={sliceS} c={c}
              f={f} Q={Q} band={band} range={range} onPick={onPick} hLabel="x" vLabel="z (front at bottom)" vUp={true}
              port={{ c: portM, normal: portNormal, a: portA / 1000, b: portB / 1000 }} driver={{ face, c: drvM, r: coneD / 2000 }} />
            <Slice title="SIDE VIEW" h={2} v={1} fixed={portM[0]} dims={dims} modes={sliceModes} sAvg={sliceS} c={c}
              f={f} Q={Q} band={band} range={range} onPick={onPick} hLabel="z (front at left)" vLabel="y"
              port={{ c: portM, normal: portNormal, a: portA / 1000, b: portB / 1000 }} driver={{ face, c: drvM, r: coneD / 2000 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 10, color: C.inkMuted, fontFamily: C.mono }}>
            <span>−{range} dB</span>
            <div style={{ width: 160, height: 8, border: `1px solid ${C.border}`,
              background: `linear-gradient(to right, ${C.series2}, ${C.panel}, ${C.series5})` }} />
            <span>+{range} dB re lumped</span>
            <span style={{ marginLeft: 8 }}>slices show point pressure; the readouts above average over the port mouth</span>
          </div>
        </div>

        <div style={card}>
          <div style={secTitle}>Modes within ±½ octave of {f} Hz · strongest driver→port links first</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.inkMuted, fontSize: 10, textAlign: "right" }}>
                  {["(l,m,n)", "type", "f (Hz)", "ψ̄ cone", "ψ̄ port", "term at f (dB)"].map((t) => (
                    <th key={t} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {near.map((p, i) => (
                  <tr key={i} style={{ textAlign: "right", color: C.ink }}>
                    <td style={{ padding: "3px 8px" }}>({p.mode.l},{p.mode.m},{p.mode.n})</td>
                    <td style={{ padding: "3px 8px", color: p.mode.type === "axial" ? C.series1 : p.mode.type === "tangential" ? C.series3 : C.inkMuted }}>{p.mode.type}</td>
                    <td style={{ padding: "3px 8px" }}>{fmt(p.mode.f, 0)}</td>
                    <td style={{ padding: "3px 8px", color: Math.abs(p.s) < 0.1 ? C.inkMuted : C.ink }}>{p.s.toFixed(2)}</td>
                    <td style={{ padding: "3px 8px", color: Math.abs(p.r) < 0.1 ? C.inkMuted : C.ink }}>{p.r.toFixed(2)}</td>
                    <td style={{ padding: "3px 8px", color: p.termDb < -120 ? C.inkMuted : C.ink }}>{p.termDb < -120 ? "node — 0" : fmt(p.termDb, 1)}</td>
                  </tr>
                ))}
                {near.length === 0 && <tr><td colSpan={6} style={{ padding: 8, color: C.inkMuted }}>no modes in this band</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
            A mode links driver to port only if both ψ̄ are away from zero. ψ̄ is the mode shape averaged over the cone or the port mouth: ±1 at a pressure peak, 0 on a nodal plane.
            To kill a mode at the port, put the entrance on its nodal plane — or centre the driver so that its ψ̄ cone averages to zero.
          </div>
        </div>
      </div>
    </div>
  );
}
