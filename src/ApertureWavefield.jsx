import React, { useState, useMemo, useRef, useEffect } from "react";
import { C } from "./palette.js";

// ═══════════════════════════════════════════════════════════════════
// APERTURE ARRAY WAVEFIELD  v2 — curved mouths & constant directivity
// ═══════════════════════════════════════════════════════════════════
//
// NEW IN v2 — mouth wavefront curvature
//   Each cell mouth is an ARC of half-angle α rather than a straight
//   segment. Sub-sources sit on that arc with normals pointing radially
//   from the virtual apex behind it, so the spherical wavefront is
//   produced by GEOMETRY, not by an imposed phase term. Set α = 0 and
//   every v1 result returns unchanged.
//
//   R = (w/2)/sin α          virtual apex distance
//   sag = R(1 − cos α)       forward bulge of the arc
//   N_F = (w/2)·sin α / λ    Fresnel number — the CD switch
//
//   Stationary phase: a point at height y radiates into sinθ = y/R,
//   so radiated directions are bounded by |sinθ| ≤ sin α. Frequency
//   has cancelled — that is constant directivity in one line.
//
// MODEL — one honest sum, no pattern multiplication assumed
//   Every sub-source radiates p = (1/√r)·e^(−ikr) into its own forward
//   half-space. Field map, polar and beamwidth sweep are all direct
//   sums. Array factor and element factor are drawn as separate
//   overlays so you can see where factorisation holds and where it fails.
//
// STATED ASSUMPTIONS
//   · 2D line sources: amplitude ∝ 1/√r, element factor sinc() not
//     2J₁(x)/x. Angles, onset frequencies and fill-factor leakage
//     transfer to 3D exactly; absolute levels and null depths do not.
//   · Uniform amplitude across each mouth, and a perfectly spherical
//     wavefront. Real horn mouths have amplitude taper and higher-order
//     mode structure; both blunt the results here. This flatters CD
//     horns and multicells alike.
//   · No wall reflection, mouth diffraction, mutual coupling or
//     interior propagation. The horn is represented only by the mouth
//     distribution it produces. For prediction, use ABEC/AKABAK.
//
// ═══════════════════════════════════════════════════════════════════


const sInput = {
  background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.text, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = {
  fontSize: 11, color: C.textDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};

const fmt = (v, dec = 1) => {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  if (Math.abs(v) >= 1) return v.toFixed(dec);
  return v.toPrecision(3);
};

const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);

// Field colour map, anchored to the palette so the zero-pressure level matches
// the page background exactly. These were previously raw RGB literals holding
// the old cool background, which left the canvas off-theme when the palette
// changed. Unpacked to scalars because the map runs per pixel per frame.
const rgb255 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const [bgR, bgG, bgB] = rgb255(C.bg);       // zero pressure
const [posR, posG, posB] = rgb255(C.amber); // positive half-cycle
const [negR, negG, negB] = rgb255(C.blue);  // negative half-cycle
const DEG = 180 / Math.PI;

// Magnitude (dB) view uses a fixed, conventional heat-map ramp instead of the
// theme palette — blue (quietest) -> green -> yellow -> orange -> red
// (loudest). Deliberately does not follow the theme or blend with the page;
// that's the point of a "standard" heatmap. Raw colour, opted out on purpose.
const [m0R, m0G, m0B] = rgb255("#0000ff"); // blue — quietest        // palette-exempt
const [m1R, m1G, m1B] = rgb255("#00cc00"); // green                  // palette-exempt
const [m2R, m2G, m2B] = rgb255("#ffff00"); // yellow                 // palette-exempt
const [m3R, m3G, m3B] = rgb255("#ff8000"); // orange                 // palette-exempt
const [m4R, m4G, m4B] = rgb255("#ff0000"); // red — loudest          // palette-exempt

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
      <label style={sLabel}>{label} {unit && <span style={{ color: C.textMuted }}>({unit})</span>}</label>
      <input type="number" value={local} min={min} max={max} step={step}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

// ── cell placement: chord spacing along the fan arc equals the pitch ──
function placeCells(N, d, fanDeg) {
  const out = [];
  if (N === 1 || Math.abs(fanDeg) < 1e-6) {
    for (let i = 0; i < N; i++) out.push({ x: 0, y: (i - (N - 1) / 2) * d, phi: 0 });
    return { cells: out, R: Infinity, dphi: 0 };
  }
  const dphi = (fanDeg / DEG) / (N - 1);
  const R = d / (2 * Math.sin(dphi / 2));
  for (let i = 0; i < N; i++) {
    const phi = (i - (N - 1) / 2) * dphi;
    out.push({ x: R * Math.cos(phi) - R, y: R * Math.sin(phi), phi });
  }
  return { cells: out, R, dphi };
}

// ── sub-sources on a curved (or flat) mouth, in mm, cell-local ──
// alpha = 0 → straight segment through ±w/2, normals along +x.
// alpha > 0 → arc of radius R = (w/2)/sinα whose chord endpoints are
//             at ±w/2, bulging forward by sag = R(1−cosα).
function localMouth(w, alphaDeg, M) {
  const a = alphaDeg / DEG;
  const pts = [];
  if (a < 1e-4) {
    for (let q = 0; q < M; q++) {
      const t = ((q + 0.5) / M - 0.5) * w;
      pts.push({ lx: 0, ly: t, psi: 0 });
    }
    return { pts, R: Infinity, sag: 0 };
  }
  const R = (w / 2) / Math.sin(a);
  const xc = R * Math.cos(a);
  for (let q = 0; q < M; q++) {
    const psi = ((q + 0.5) / M - 0.5) * 2 * a;
    pts.push({ lx: R * Math.cos(psi) - xc, ly: R * Math.sin(psi), psi });
  }
  return { pts, R, sag: R * (1 - Math.cos(a)) };
}

function assemble(cells, w, alphaDeg, M) {
  const { pts, R, sag } = localMouth(w, alphaDeg, M);
  const n = cells.length * pts.length;
  const sx = new Float32Array(n), sy = new Float32Array(n);
  const nx = new Float32Array(n), ny = new Float32Array(n);
  const wt = new Float32Array(n);
  let j = 0;
  for (const cell of cells) {
    const cp = Math.cos(cell.phi), sp = Math.sin(cell.phi);
    for (const p of pts) {
      sx[j] = (cell.x + cp * p.lx - sp * p.ly) / 1000;
      sy[j] = (cell.y + sp * p.lx + cp * p.ly) / 1000;
      nx[j] = Math.cos(cell.phi + p.psi);
      ny[j] = Math.sin(cell.phi + p.psi);
      wt[j] = 1 / pts.length;
      j++;
    }
  }
  return { sx, sy, nx, ny, wt, n, M: pts.length, R, sag, localPts: pts };
}

// ── far-field pattern by direct summation, dB, normalised ──
function farPattern(S, freq, c, nA) {
  const k = (2 * Math.PI * freq) / c;
  const out = new Float32Array(nA);
  for (let a = 0; a < nA; a++) {
    const th = ((a / (nA - 1)) * 180 - 90) / DEG;
    const ux = Math.cos(th), uy = Math.sin(th);
    let re = 0, im = 0;
    for (let j = 0; j < S.n; j++) {
      if (S.nx[j] * ux + S.ny[j] * uy <= 0) continue;
      const ph = k * (S.sx[j] * ux + S.sy[j] * uy);
      re += S.wt[j] * Math.cos(ph); im += S.wt[j] * Math.sin(ph);
    }
    out[a] = Math.hypot(re, im);
  }
  let mx = 1e-12;
  for (const v of out) if (v > mx) mx = v;
  return Array.from(out, (v) => 20 * Math.log10(Math.max(v / mx, 1e-5)));
}

// ── −6 dB beamwidth from a symmetric polar, searching outward ──
function beamwidth(db, nA) {
  const mid = (nA - 1) / 2;
  const step = 180 / (nA - 1);
  for (let i = 0; i <= mid; i++) {
    const up = db[Math.round(mid + i)], dn = db[Math.round(mid - i)];
    if (up < -6 || dn < -6) return 2 * i * step;
  }
  return 180;
}

const PRESETS = {
  "CD waveguide 90°": { N: 1, d: 300, w: 300, fan: 0, alpha: 45, freq: 4000, Lx: 3.0, rObs: 2.5 },
  "CD waveguide 60°": { N: 1, d: 300, w: 300, fan: 0, alpha: 30, freq: 4000, Lx: 3.0, rObs: 2.5 },
  "Flat piston": { N: 1, d: 300, w: 300, fan: 0, alpha: 0, freq: 4000, Lx: 3.0, rObs: 2.5 },
  "Hi-fi line array": { N: 12, d: 90, w: 78, fan: 0, alpha: 0, freq: 4000, Lx: 3.5, rObs: 2.5 },
  "Multicell 8× flat cells": { N: 8, d: 32, w: 30, fan: 60, alpha: 0, freq: 6000, Lx: 2.0, rObs: 1.5 },
  "Multicell 8× curved cells": { N: 8, d: 32, w: 30, fan: 60, alpha: 20, freq: 6000, Lx: 2.0, rObs: 1.5 },
};

export default function ApertureWavefield() {
  const [N, setN] = useState(1);
  const [pitch, setPitch] = useState(300);
  const [width, setWidth] = useState(300);
  const [fan, setFan] = useState(0);
  const [alpha, setAlpha] = useState(45);       // mouth half-angle, deg
  const [freq, setFreq] = useState(4000);
  const [temp, setTemp] = useState(30);

  const [Lx, setLx] = useState(3.0);
  const [gridW, setGridW] = useState(300);
  const [mapMode, setMapMode] = useState("instant");
  const [animate, setAnimate] = useState(true);
  const [gain, setGain] = useState(1.0);
  const [showRays, setShowRays] = useState(true);

  const [rObs, setRObs] = useState(2.5);
  const [showAF, setShowAF] = useState(false);
  const [showEF, setShowEF] = useState(true);
  const [showProd, setShowProd] = useState(false);
  const [showSweep, setShowSweep] = useState(true);

  const c = useMemo(() => speedOfSound(temp), [temp]);
  const lambda_mm = (c / freq) * 1000;
  const aRad = alpha / DEG;

  const { cells, R: fanR, dphi } = useMemo(() => placeCells(N, pitch, fan), [N, pitch, fan]);

  // ── sub-sources for the field & near polar (λ-adaptive sampling) ──
  const src = useMemo(() => {
    let M = Math.max(2, Math.ceil(width / (lambda_mm / 8)));
    M = Math.min(M, 48);
    if (N * M > 380) M = Math.max(2, Math.floor(380 / N));
    return assemble(cells, width, alpha, M);
  }, [cells, width, alpha, lambda_mm, N]);

  // ── single isolated cell, for the element factor ──
  const srcOne = useMemo(
    () => assemble([{ x: 0, y: 0, phi: 0 }], width, alpha, src.M),
    [width, alpha, src.M]
  );

  // ── derived acoustics ──
  const mouthR = src.R, sag = src.sag;
  const fresnel = ((width / 2) * Math.sin(aRad)) / lambda_mm;
  const fCD = alpha > 0 ? (2 * c) / ((width / 1000) * Math.sin(aRad)) : Infinity;
  const fill = width / pitch;
  const leakDb = (() => {
    const a = Math.PI * fill;
    return 20 * Math.log10(Math.max(Math.abs(a < 1e-9 ? 1 : Math.sin(a) / a), 1e-6));
  })();
  const gratingAngles = useMemo(() => {
    const out = [];
    if (N < 2) return out;
    for (let n = 1; n <= 3; n++) {
      const s = (n * lambda_mm) / pitch;
      if (s <= 1) out.push({ n, deg: Math.asin(s) * DEG });
    }
    return out;
  }, [lambda_mm, pitch, N]);
  const D_mm = (N - 1) * pitch + width;
  const rFF = (2 * (D_mm / 1000) ** 2) / (lambda_mm / 1000);
  const diffHalf = (() => {
    const s = (0.6 * lambda_mm) / width;
    return s < 1 ? Math.asin(s) * DEG : 90;
  })();

  // ── field computation ──
  const field = useMemo(() => {
    const W = gridW, H = Math.round(gridW * 0.72);
    const re = new Float32Array(W * H), im = new Float32Array(W * H);
    const k = (2 * Math.PI * freq) / c;
    const x0 = -0.12 * Lx, x1 = 0.88 * Lx;
    const Ly = (Lx * H) / W, y0 = -Ly / 2;
    const rmin = lambda_mm / 1000 / 6;
    const { sx, sy, nx, ny, wt, n } = src;

    for (let py = 0; py < H; py++) {
      const Y = y0 + ((py + 0.5) / H) * Ly;
      for (let px = 0; px < W; px++) {
        const X = x0 + ((px + 0.5) / W) * (x1 - x0);
        let ar = 0, ai = 0;
        for (let j = 0; j < n; j++) {
          const dx = X - sx[j], dy = Y - sy[j];
          if (dx * nx[j] + dy * ny[j] <= 0) continue;
          let r = Math.sqrt(dx * dx + dy * dy);
          if (r < rmin) r = rmin;
          const a = wt[j] / Math.sqrt(r);
          const ph = -k * r;
          ar += a * Math.cos(ph); ai += a * Math.sin(ph);
        }
        const idx = py * W + px;
        re[idx] = ar; im[idx] = ai;
      }
    }
    let ref = 1e-9;
    const pxStand = Math.max(Math.floor(((0.15 * Lx - x0) / (x1 - x0)) * W), 0);
    for (let py = 0; py < H; py++)
      for (let px = pxStand; px < W; px++) {
        const mg = Math.hypot(re[py * W + px], im[py * W + px]);
        if (mg > ref) ref = mg;
      }
    return { re, im, W, H, ref, x0, x1, y0, Ly };
  }, [src, gridW, freq, c, Lx, lambda_mm]);

  // ── canvas render + animation ──
  const canvasRef = useRef(null);
  const phaseRef = useRef(0);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { re, im, W, H, ref } = field;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(W, H);
    const data = img.data;
    let raf = null;
    const reduce = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

    const draw = () => {
      const ph = phaseRef.current;
      const ct = Math.cos(ph), st = Math.sin(ph);
      const inv = gain / ref;
      for (let i = 0; i < W * H; i++) {
        let r, g, b;
        if (mapMode === "instant") {
          const v = Math.tanh((re[i] * ct - im[i] * st) * inv);
          if (v >= 0) {
            r = bgR + v * (posR - bgR); g = bgG + v * (posG - bgG); b = bgB + v * (posB - bgB);
          } else {
            const t = -v;
            r = bgR + t * (negR - bgR); g = bgG + t * (negG - bgG); b = bgB + t * (negB - bgB);
          }
        } else {
          // fixed heat-map ramp — see the m0..m4 constants above.
          const mg = Math.hypot(re[i], im[i]) * inv;
          const db = 20 * Math.log10(Math.max(mg, 1e-6));
          const seg = Math.min(Math.max((db + 40) / 40, 0), 1) * 4;
          if (seg < 1) {
            const u = seg;
            r = m0R + u * (m1R - m0R); g = m0G + u * (m1G - m0G); b = m0B + u * (m1B - m0B);
          } else if (seg < 2) {
            const u = seg - 1;
            r = m1R + u * (m2R - m1R); g = m1G + u * (m2G - m1G); b = m1B + u * (m2B - m1B);
          } else if (seg < 3) {
            const u = seg - 2;
            r = m2R + u * (m3R - m2R); g = m2G + u * (m3G - m2G); b = m2B + u * (m3B - m2B);
          } else {
            const u = Math.min(seg - 3, 1);
            r = m3R + u * (m4R - m3R); g = m3G + u * (m4G - m3G); b = m3B + u * (m4B - m3B);
          }
        }
        const p = i * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };

    if (animate && mapMode === "instant" && !reduce) {
      const loop = () => { phaseRef.current += 0.13; draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    } else draw();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [field, mapMode, animate, gain]);

  // ── polar curves ──
  const polar = useMemo(() => {
    const nA = 361;
    const k = (2 * Math.PI * freq) / c;
    const meas = new Float32Array(nA), af = new Float32Array(nA);
    const { sx, sy, nx, ny, wt, n } = src;

    for (let a = 0; a < nA; a++) {
      const th = ((a / (nA - 1)) * 180 - 90) / DEG;
      const ux = Math.cos(th), uy = Math.sin(th);
      const X = rObs * ux, Y = rObs * uy;
      let mr = 0, mi = 0;
      for (let j = 0; j < n; j++) {
        const dx = X - sx[j], dy = Y - sy[j];
        if (dx * nx[j] + dy * ny[j] <= 0) continue;
        const r = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-4);
        const amp = wt[j] / Math.sqrt(r);
        const ph = -k * r;
        mr += amp * Math.cos(ph); mi += amp * Math.sin(ph);
      }
      meas[a] = Math.hypot(mr, mi);

      let arr = 0, ari = 0;
      for (const cell of cells) {
        const ph = k * ((cell.x / 1000) * ux + (cell.y / 1000) * uy);
        arr += Math.cos(ph); ari += Math.sin(ph);
      }
      af[a] = Math.hypot(arr, ari) / N;
    }
    const norm = (arr) => {
      let mx = 1e-12;
      for (const v of arr) if (v > mx) mx = v;
      return Array.from(arr, (v) => 20 * Math.log10(Math.max(v / mx, 1e-5)));
    };
    const ef = farPattern(srcOne, freq, c, nA);
    const afdb = norm(af);
    const prodLin = afdb.map((v, i) => v + ef[i]);
    let pmx = -1e9; for (const v of prodLin) if (v > pmx) pmx = v;
    const total = farPattern(src, freq, c, nA);
    return {
      meas: norm(meas), af: afdb, ef, prod: prodLin.map((v) => v - pmx),
      total, nA,
      bwFar: beamwidth(total, nA), bwNear: beamwidth(norm(meas), nA),
      bwCell: beamwidth(ef, nA),
    };
  }, [src, srcOne, cells, N, freq, c, rObs]);

  // ── beamwidth vs frequency sweep (the CD chart) ──
  const sweep = useMemo(() => {
    if (!showSweep) return null;
    const f0 = 200, f1 = 20000, NF = 34, nA = 181;
    // fixed sampling fine enough for the top of the sweep
    let M = Math.max(4, Math.ceil(width / ((c / f1) * 1000 / 6)));
    M = Math.min(M, 60);
    if (N * M > 600) M = Math.max(4, Math.floor(600 / N));
    const S = assemble(cells, width, alpha, M);
    const out = [];
    for (let i = 0; i < NF; i++) {
      const f = f0 * Math.pow(f1 / f0, i / (NF - 1));
      const db = farPattern(S, f, c, nA);
      const lam = (c / f) * 1000;
      const s = (0.6 * lam) / width;
      out.push({
        f, bw: beamwidth(db, nA),
        diff: 2 * (s < 1 ? Math.asin(s) * DEG : 90),
        nf: ((width / 2) * Math.sin(aRad)) / lam,
      });
    }
    return out;
  }, [showSweep, cells, width, alpha, aRad, N, c]);

  // ── overlay mapping ──
  const { W: FW, H: FH, x0, x1, y0, Ly } = field;
  const PX = (x_m) => ((x_m - x0) / (x1 - x0)) * FW;
  const PY = (y_m) => ((y_m - y0) / Ly) * FH;

  const PS = 300, PCx = 46, PCy = PS / 2, PR = PS - 78;
  const polarPt = (deg, db) => {
    const t = Math.min(Math.max((db + 40) / 40, 0), 1);
    const th = deg / DEG;
    return [PCx + PR * t * Math.cos(th), PCy - PR * t * Math.sin(th)];
  };
  const polarPath = (arr) =>
    arr.map((db, i) => {
      const [x, y] = polarPt((i / (arr.length - 1)) * 180 - 90, db);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const btn = (active, col) => ({
    background: active ? col + "20" : "transparent", border: `1px solid ${active ? col : C.border}`,
    borderRadius: 3, color: active ? col : C.textDim, fontSize: 10, padding: "3px 9px",
    cursor: "pointer", fontFamily: C.mono,
  });

  const applyPreset = (p) => {
    const v = PRESETS[p];
    setN(v.N); setPitch(v.d); setWidth(v.w); setFan(v.fan);
    setAlpha(v.alpha); setFreq(v.freq); setLx(v.Lx); setRObs(v.rObs);
  };

  // ── sweep chart geometry ──
  const SW = 780, SH = 250, sL = 52, sR = 16, sT = 14, sB = 34;
  const siW = SW - sL - sR, siH = SH - sT - sB;
  const sfx = (f) => sL + (Math.log(f / 200) / Math.log(100)) * siW;
  const sfy = (bw) => sT + siH - (bw / 190) * siH;

  const metrics = [
    { label: "Wavelength λ", value: `${fmt(lambda_mm, 1)} mm`, sub: `c = ${fmt(c, 1)} m/s at ${temp}°C` },
    { label: "Mouth half-angle α", value: alpha > 0 ? `${fmt(alpha, 1)}°` : "flat", sub: alpha > 0 ? `geometric coverage ${fmt(2 * alpha, 0)}°` : "no curvature", color: C.violet },
    { label: "Wavefront radius R", value: alpha > 0 ? `${fmt(mouthR, 0)} mm` : "∞", sub: `sag ${fmt(sag, 1)} mm · (w/2)/sinα`, color: C.violet },
    { label: "Fresnel number N_F", value: fmt(fresnel, 2), sub: fresnel >= 1 ? "✓ geometric — CD holds" : "diffraction — beamwidth widening", color: fresnel >= 1 ? C.green : C.amber },
    { label: "CD lower limit", value: alpha > 0 ? `${fmt(fCD, 0)} Hz` : "—", sub: "f = 2c/(w·sinα), N_F = 1", color: C.cyan },
    { label: "Measured beamwidth", value: `${fmt(polar.bwFar, 0)}°`, sub: `−6 dB, far field · at r: ${fmt(polar.bwNear, 0)}°`, color: C.amber },
    { label: "Diffraction estimate", value: `${fmt(2 * diffHalf, 0)}°`, sub: "2·asin(0.6λ/w), flat-mouth", color: C.blue },
    { label: "Single cell −6 dB", value: `${fmt(polar.bwCell, 0)}°`, sub: "one mouth in isolation", color: C.violet },
    { label: "Aperture D", value: `${fmt(D_mm, 0)} mm`, sub: `(N−1)d + w` },
    { label: "Far field 2D²/λ", value: `${fmt(rFF, 2)} m`, sub: rObs >= rFF ? "✓ listening in far field" : `r/r_ff = ${fmt(rObs / rFF, 2)} — near field`, color: rObs >= rFF ? C.green : C.amber },
    { label: "1st grating angle", value: N < 2 ? "n/a" : gratingAngles[0] ? `±${fmt(gratingAngles[0].deg, 1)}°` : "none", sub: N < 2 ? "single aperture" : "sinθ = λ/d", color: N < 2 ? C.textDim : gratingAngles[0] ? C.red : C.green },
    { label: "Grating leakage", value: N < 2 ? "n/a" : `${fmt(leakDb, 1)} dB`, sub: N < 2 ? "single aperture" : `fill w/d = ${fmt(fill, 2)}`, color: N < 2 ? C.textDim : C.violet },
  ];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.amber, margin: 0, letterSpacing: "0.05em" }}>
          APERTURE WAVEFIELD · v2 — CURVED MOUTHS
        </h1>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          Mouth curvature by geometry, not imposed phase · N_F = (w/2)·sinα/λ is the constant-directivity switch
        </div>
      </div>

      <div style={{ ...card, paddingTop: 11, paddingBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...secTitle, marginBottom: 0 }}>Start from</span>
          {Object.keys(PRESETS).map((p) => (
            <button key={p} onClick={() => applyPreset(p)} style={btn(false, C.blue)}>{p}</button>
          ))}
        </div>
      </div>

      {/* MOUTH */}
      <div style={card}>
        <div style={secTitle}>Mouth wavefront</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 12px", alignItems: "end" }}>
          <div style={{ marginBottom: 10 }}>
            <label style={sLabel}>
              Half-angle α <span style={{ color: C.violet, fontFamily: C.mono, fontSize: 10 }}>
                {alpha === 0 ? "flat piston" : `${fmt(2 * alpha, 0)}° coverage`}
              </span>
            </label>
            <input type="range" min={0} max={75} step={0.5} value={alpha}
              onChange={(e) => setAlpha(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: C.violet }} />
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {[0, 15, 20, 30, 45, 60].map((v) => (
                <button key={v} onClick={() => setAlpha(v)} style={btn(Math.abs(alpha - v) < 0.3, C.violet)}>
                  {v === 0 ? "flat" : `${v}°`}
                </button>
              ))}
            </div>
          </div>
          <NumInput label="Mouth width w (chord)" value={width} onChange={setWidth} unit="mm" min={1} max={1200} step={1} accent={C.amber} />
          <NumInput label="Frequency" value={freq} onChange={setFreq} unit="Hz" min={50} max={20000} step={50} accent={C.cyan} />
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => setFreq(Math.round(fCD * 0.4))} style={btn(false, C.cyan)}>0.4 f_CD</button>
            <button onClick={() => setFreq(Math.round(fCD))} style={btn(false, C.cyan)}>f_CD</button>
            <button onClick={() => setFreq(Math.round(fCD * 3))} style={btn(false, C.cyan)}>3 f_CD</button>
          </div>
        </div>
      </div>

      {/* ARRAY */}
      <div style={card}>
        <div style={secTitle}>Array geometry {N < 2 && <span style={{ color: C.textMuted, textTransform: "none", letterSpacing: 0 }}>· single aperture, array terms inactive</span>}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0 12px" }}>
          <NumInput label="Cells N" value={N} onChange={setN} min={1} max={40} step={1} accent={C.amber} />
          <NumInput label="Pitch d" value={pitch} onChange={setPitch} unit="mm" min={2} max={800} step={1} accent={C.amber} />
          <NumInput label="Total fan angle" value={fan} onChange={setFan} unit="°" min={0} max={180} step={1} accent={C.violet} />
          <NumInput label="Temperature" value={temp} onChange={setTemp} unit="°C" min={-20} max={50} step={1} />
        </div>
        {N > 1 && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>Snap w to:</span>
            <button onClick={() => setWidth(pitch)} style={btn(Math.abs(fill - 1) < 0.005, C.green)}>gapless</button>
            <button onClick={() => setWidth(Math.round(pitch * 0.95))} style={btn(false, C.green)}>0.95 d</button>
            <button onClick={() => setWidth(Math.round(pitch * 0.8))} style={btn(false, C.green)}>0.80 d</button>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginLeft: 6 }}>
              arc radius {fan > 0 ? `${fmt(fanR, 0)} mm · Δφ ${fmt(dphi * DEG, 2)}°` : "straight"}
            </span>
          </div>
        )}
      </div>

      {/* FIELD */}
      <div style={card}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ ...secTitle, marginBottom: 0 }}>Pressure field</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setMapMode("instant")} style={btn(mapMode === "instant", C.amber)}>Wavefronts</button>
            <button onClick={() => setMapMode("mag")} style={btn(mapMode === "mag", C.amber)}>Magnitude (dB)</button>
          </div>
          {mapMode === "instant" && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} style={{ accentColor: C.amber }} />
              <span style={{ color: C.textDim }}>Propagate</span>
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showRays} onChange={(e) => setShowRays(e.target.checked)} style={{ accentColor: C.red }} />
            <span style={{ color: C.textDim }}>Geometry overlays</span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>Gain</span>
            <input type="range" min={0.2} max={6} step={0.1} value={gain}
              onChange={(e) => setGain(parseFloat(e.target.value))} style={{ width: 90, accentColor: C.amber }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>Detail</span>
            {[220, 300, 400].map((g) => (
              <button key={g} onClick={() => setGridW(g)} style={btn(gridW === g, C.blue)}>
                {g === 220 ? "fast" : g === 300 ? "med" : "fine"}
              </button>
            ))}
          </div>
          <div style={{ width: 140 }}>
            <NumInput label="Field width" value={Lx} onChange={setLx} unit="m" min={0.1} max={30} step={0.1} />
          </div>
        </div>

        <div style={{ position: "relative", width: "100%", lineHeight: 0 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }} />
          <svg viewBox={`0 0 ${FW} ${FH}`} preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <line x1={PX(0)} y1={PY(0)} x2={PX(x1)} y2={PY(0)} stroke={C.white} strokeWidth={0.5} opacity={0.22} strokeDasharray="6 5" />

            {/* geometric coverage edges from the virtual apex */}
            {showRays && alpha > 0 && N === 1 && [1, -1].map((s) => {
              const th = (s * alpha) / DEG;
              const ax = -(mouthR * Math.cos(aRad)) / 1000;
              const L = x1 * 1.8;
              return <line key={s} x1={PX(ax)} y1={PY(0)}
                x2={PX(ax + L * Math.cos(th))} y2={PY(L * Math.sin(th))}
                stroke={C.violet} strokeWidth={1.2} opacity={0.7} strokeDasharray="8 5" />;
            })}
            {showRays && alpha > 0 && N === 1 && (
              <circle cx={PX(-(mouthR * Math.cos(aRad)) / 1000)} cy={PY(0)} r={FW * 0.008} fill={C.violet} opacity={0.8} />
            )}

            {/* predicted grating lobe rays */}
            {showRays && gratingAngles.map(({ n, deg }) => (
              <g key={`gr${n}`}>
                {[1, -1].map((s) => {
                  const th = (s * deg) / DEG, L = x1 * 1.7;
                  return <line key={s} x1={PX(0)} y1={PY(0)}
                    x2={PX(L * Math.cos(th))} y2={PY(L * Math.sin(th))}
                    stroke={C.red} strokeWidth={n === 1 ? 1.1 : 0.7}
                    opacity={n === 1 ? 0.7 : 0.35} strokeDasharray="7 5" />;
                })}
              </g>
            ))}

            {rFF < x1 * 1.2 && showRays && (
              <path d={`M ${PX(0)} ${PY(-rFF)} A ${(rFF / (x1 - x0)) * FW} ${(rFF / Ly) * FH} 0 0 0 ${PX(0)} ${PY(rFF)}`}
                fill="none" stroke={C.cyan} strokeWidth={0.9} opacity={0.45} strokeDasharray="3 4" />
            )}
            <path d={`M ${PX(0)} ${PY(-rObs)} A ${(rObs / (x1 - x0)) * FW} ${(rObs / Ly) * FH} 0 0 0 ${PX(0)} ${PY(rObs)}`}
              fill="none" stroke={C.green} strokeWidth={1.1} opacity={0.65} />

            {/* mouth arcs */}
            {cells.map((cell, i) => {
              const cp = Math.cos(cell.phi), sp = Math.sin(cell.phi);
              const d = src.localPts.map((p) => {
                const X = (cell.x + cp * p.lx - sp * p.ly) / 1000;
                const Y = (cell.y + sp * p.lx + cp * p.ly) / 1000;
                return `${PX(X).toFixed(1)},${PY(Y).toFixed(1)}`;
              }).join(" L");
              return <path key={i} d={`M${d}`} fill="none" stroke={C.green} strokeWidth={2.2} opacity={0.95} />;
            })}
          </svg>
        </div>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.green }}>━ Mouth arc(s)</span>
          {alpha > 0 && N === 1 && <span style={{ fontSize: 10, color: C.violet }}>╌ Geometric coverage ±α from virtual apex ●</span>}
          {gratingAngles.length > 0 && <span style={{ fontSize: 10, color: C.red }}>╌ Grating angles sinθ = nλ/d</span>}
          <span style={{ fontSize: 10, color: C.cyan }}>╌ Far-field boundary</span>
          <span style={{ fontSize: 10, color: C.green }}>◜ Listening arc</span>
        </div>
      </div>

      {/* SWEEP */}
      <div style={card}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={{ ...secTitle, marginBottom: 0 }}>Beamwidth vs frequency</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showSweep} onChange={(e) => setShowSweep(e.target.checked)} style={{ accentColor: C.amber }} />
            <span style={{ color: C.textDim }}>Compute sweep</span>
          </label>
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>far field · −6 dB · 200 Hz – 20 kHz</span>
        </div>
        {sweep ? (
          <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" style={{ display: "block" }}>
            {[200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => (
              <g key={f}>
                <line x1={sfx(f)} y1={sT} x2={sfx(f)} y2={sT + siH} stroke={C.border} strokeWidth={0.5} />
                <text x={sfx(f)} y={sT + siH + 15} fill={C.textMuted} fontSize={9} textAnchor="middle" fontFamily={C.mono}>
                  {f >= 1000 ? `${f / 1000}k` : f}
                </text>
              </g>
            ))}
            {[0, 30, 60, 90, 120, 150, 180].map((b) => (
              <g key={b}>
                <line x1={sL} y1={sfy(b)} x2={sL + siW} y2={sfy(b)} stroke={C.border} strokeWidth={0.5} strokeDasharray="3 3" />
                <text x={sL - 6} y={sfy(b) + 3} fill={C.textMuted} fontSize={9} textAnchor="end" fontFamily={C.mono}>{b}°</text>
              </g>
            ))}
            {/* geometric target */}
            {alpha > 0 && (
              <>
                <line x1={sL} y1={sfy(2 * alpha)} x2={sL + siW} y2={sfy(2 * alpha)}
                  stroke={C.violet} strokeWidth={1.6} strokeDasharray="7 4" opacity={0.85} />
                <text x={sL + siW - 4} y={sfy(2 * alpha) - 5} fill={C.violet} fontSize={9}
                  textAnchor="end" fontFamily={C.mono}>geometric 2α = {fmt(2 * alpha, 0)}°</text>
              </>
            )}
            {/* diffraction estimate */}
            <path d={sweep.map((p, i) => `${i ? "L" : "M"}${sfx(p.f).toFixed(1)},${sfy(Math.min(p.diff, 190)).toFixed(1)}`).join(" ")}
              fill="none" stroke={C.blue} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.7} />
            {/* N_F = 1 marker */}
            {alpha > 0 && fCD > 200 && fCD < 20000 && (
              <>
                <line x1={sfx(fCD)} y1={sT} x2={sfx(fCD)} y2={sT + siH} stroke={C.cyan} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.8} />
                <text x={sfx(fCD) + 4} y={sT + 11} fill={C.cyan} fontSize={9} fontFamily={C.mono}>N_F = 1</text>
              </>
            )}
            {/* current frequency */}
            <line x1={sfx(Math.min(Math.max(freq, 200), 20000))} y1={sT}
              x2={sfx(Math.min(Math.max(freq, 200), 20000))} y2={sT + siH}
              stroke={C.green} strokeWidth={1.2} opacity={0.8} />
            {/* measured */}
            <path d={sweep.map((p, i) => `${i ? "L" : "M"}${sfx(p.f).toFixed(1)},${sfy(p.bw).toFixed(1)}`).join(" ")}
              fill="none" stroke={C.amber} strokeWidth={2.4} />
            <text x={sL + siW / 2} y={SH - 3} fill={C.textDim} fontSize={10} textAnchor="middle" fontFamily={C.sans}>Frequency (Hz)</text>
          </svg>
        ) : (
          <div style={{ fontSize: 11, color: C.textMuted, padding: "18px 0", textAlign: "center" }}>
            Sweep off. Turn it on to see where constant directivity starts and stops.
          </div>
        )}
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.amber }}>━ Modelled −6 dB beamwidth</span>
          {alpha > 0 && <span style={{ fontSize: 10, color: C.violet }}>╌ Geometric 2α</span>}
          <span style={{ fontSize: 10, color: C.blue }}>╌ Flat-mouth diffraction 2·asin(0.6λ/w)</span>
          {alpha > 0 && <span style={{ fontSize: 10, color: C.cyan }}>╌ N_F = 1</span>}
          <span style={{ fontSize: 10, color: C.green }}>━ Current frequency</span>
        </div>
      </div>

      {/* POLAR */}
      <div style={card}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={{ ...secTitle, marginBottom: 0 }}>Polar response</span>
          <div style={{ width: 145 }}>
            <NumInput label="Listening radius" value={rObs} onChange={setRObs} unit="m" min={0.05} max={200} step={0.1} accent={C.green} />
          </div>
          <button onClick={() => setRObs(parseFloat(Math.max(rFF, 0.05).toFixed(2)))} style={btn(false, C.cyan)}>jump to far field</button>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showEF} onChange={(e) => setShowEF(e.target.checked)} style={{ accentColor: C.violet }} />
            <span style={{ color: C.violet }}>Single cell</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showAF} onChange={(e) => setShowAF(e.target.checked)} style={{ accentColor: C.blue }} />
            <span style={{ color: C.blue }}>Array factor</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showProd} onChange={(e) => setShowProd(e.target.checked)} style={{ accentColor: C.cyan }} />
            <span style={{ color: C.cyan }}>AF × EF</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <svg viewBox={`0 0 ${PS} ${PS}`} width={PS} height={PS} style={{ flexShrink: 0 }}>
            {[0, -10, -20, -30].map((db) => {
              const t = (db + 40) / 40;
              return (
                <g key={db}>
                  <path d={`M ${PCx} ${PCy - PR * t} A ${PR * t} ${PR * t} 0 0 1 ${PCx} ${PCy + PR * t}`}
                    fill="none" stroke={C.border} strokeWidth={0.7} />
                  <text x={PCx + 3} y={PCy - PR * t - 3} fill={C.textMuted} fontSize={8} fontFamily={C.mono}>{db}</text>
                </g>
              );
            })}
            {[-90, -60, -30, 0, 30, 60, 90].map((deg) => {
              const th = deg / DEG;
              return (
                <g key={deg}>
                  <line x1={PCx} y1={PCy} x2={PCx + PR * Math.cos(th)} y2={PCy - PR * Math.sin(th)} stroke={C.border} strokeWidth={0.6} />
                  <text x={PCx + (PR + 12) * Math.cos(th)} y={PCy - (PR + 12) * Math.sin(th) + 3}
                    fill={C.textMuted} fontSize={9} fontFamily={C.mono} textAnchor="middle">{deg}°</text>
                </g>
              );
            })}
            {/* geometric coverage edges */}
            {alpha > 0 && [1, -1].map((s) => {
              const th = (s * alpha) / DEG;
              return <line key={s} x1={PCx} y1={PCy} x2={PCx + PR * Math.cos(th)} y2={PCy - PR * Math.sin(th)}
                stroke={C.violet} strokeWidth={1.3} opacity={0.6} strokeDasharray="6 4" />;
            })}
            {gratingAngles.map(({ n, deg }) => [1, -1].map((s) => {
              const th = (s * deg) / DEG;
              return <line key={`${n}${s}`} x1={PCx} y1={PCy} x2={PCx + PR * Math.cos(th)} y2={PCy - PR * Math.sin(th)}
                stroke={C.red} strokeWidth={n === 1 ? 1 : 0.6} opacity={0.45} strokeDasharray="4 3" />;
            }))}

            {showEF && <path d={polarPath(polar.ef)} fill="none" stroke={C.violet} strokeWidth={1.3} opacity={0.75} strokeDasharray="5 3" />}
            {showAF && <path d={polarPath(polar.af)} fill="none" stroke={C.blue} strokeWidth={1.3} opacity={0.75} strokeDasharray="3 3" />}
            {showProd && <path d={polarPath(polar.prod)} fill="none" stroke={C.cyan} strokeWidth={1.6} opacity={0.9} />}
            <path d={polarPath(polar.meas)} fill="none" stroke={C.amber} strokeWidth={2.2} />
          </svg>

          <div style={{ flex: 1, minWidth: 240, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
            <div><span style={{ color: C.amber }}>━</span> Summed field at r = {fmt(rObs, 2)} m — nothing factorised</div>
            <div><span style={{ color: C.violet }}>╌</span> One mouth in isolation, curvature included</div>
            <div><span style={{ color: C.blue }}>╌</span> Array factor — point sources on the pitch grid</div>
            <div><span style={{ color: C.cyan }}>━</span> AF × EF — exact only for identically-oriented elements</div>
            <div><span style={{ color: C.violet }}>╌</span> Geometric coverage edges at ±α</div>
            <div style={{ marginTop: 8, color: C.textMuted, fontSize: 10, lineHeight: 1.6 }}>
              Each curve is normalised to its own maximum — read shape and relative level, not SPL.
              With α &gt; 0 the single-cell curve is no longer sinc: it flattens out to ±α and the deep
              nulls fill in, because the phasors trace a Cornu spiral instead of closing into a circle.
            </div>
          </div>
        </div>
      </div>

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        {metrics.map((it, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>{it.label}</div>
            <div style={{ fontSize: 15, fontFamily: C.mono, fontWeight: 600, color: it.color || C.text }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 10, color: it.color || C.textMuted, marginTop: 1 }}>{it.sub}</div>}
          </div>
        ))}
      </div>

      {/* NOTES */}
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, padding: "0 4px", fontFamily: C.sans }}>
        <strong style={{ color: C.textDim }}>How curvature is modelled</strong> · Sub-sources sit on an arc of radius
        R = (w/2)/sinα whose chord endpoints land at ±w/2, each with its normal pointing radially from the virtual apex.
        The spherical wavefront is therefore produced by where the sources <em>are</em>, not by an added phase term —
        the same code path handles flat and curved mouths, and α = 0 reproduces every v1 result exactly.
        <br />
        <strong style={{ color: C.textDim }}>What the sweep shows</strong> · Below N_F = 1 the quadratic phase is too
        small to matter across the aperture and beamwidth tracks the flat-mouth diffraction line (blue). Above it,
        beamwidth locks to the geometric 2α (violet). The dip just below N_F = 1 is real Fresnel behaviour, and it is
        the midband narrowing that CD horns are known for — it emerges from the model rather than being put in.
        <br />
        <strong style={{ color: C.textDim }}>2D, not 3D</strong> · Line sources spread as 1/√r; a flat mouth's element
        factor is sinc(πw·sinθ/λ) with a −13.3 dB first sidelobe, versus −17.6 dB for a circular piston. Angles, onset
        frequencies and fill-factor leakage transfer to 3D exactly. Absolute levels and null depths do not.
        <br />
        <strong style={{ color: C.textDim }}>Assumptions worth distrusting</strong> · Uniform amplitude across the mouth
        and a perfectly spherical wavefront. Real horns taper in amplitude toward the mouth edges and carry higher-order
        mode structure, both of which blunt the coverage edges and raise the off-axis floor. Nothing here models the
        horn interior, wall reflections, mouth diffraction or mutual coupling — the horn appears only through the mouth
        distribution it is assumed to produce. Intuition-building, not prediction: use ABEC/AKABAK for the latter.
      </div>
    </div>
  );
}
