import React, { useState, useMemo, useEffect } from "react";
import { C } from "./palette.js";

// ═══════════════════════════════════════════════════════════════════
// ANNULAR FLH SUBWOOFER — WALL-PRIMITIVE SECTIONAL AREA TOOL  (v2)
// ═══════════════════════════════════════════════════════════════════
//
// Half-section (r, z): r = horizontal distance from the central axis
// (red), z = height. White ground at z = 0, blue top at z = H.
// Square self-similar build (concentric square ducts, not revolved).
//
// ARCHITECTURE — walls are the primitives.
// Three ply walls, each a single 18 mm body defined by two straight
// face-lines r(z). Everything else (areas, air polygons, drawn bodies,
// derived leg lengths) samples the same face functions at true height,
// so drawing and math share one source of truth.
//
//   Divider A  (between legs 1 & 3): hangs from the top plate,
//              bottom tip held gFold1 (input 3) off the floor.
//              Inner face through (throatR @ z=H) and (s2R @ tip).
//   Divider B  (between legs 3 & 5): stands on the floor,
//              top tip held gFold2 (input 6) below the top.
//              Inner face placed by widths 4 (@ A-tip height) and
//              5 (@ B-tip height).
//   Outer wall (skin): hangs from the top, bottom tip held
//              gFold3 (input 9) off the floor. Inner face placed by
//              width 7 (@ B-tip height) and input 8 = horizontal
//              distance from divider B's outer face to the wall's
//              inner face at tip height.
//
// AIR PATH:  throat (top, in line with blue, FILLED square — inner
// edge is the axis) → leg 1 down → fold 1 under divider A's tip →
// leg 3 up → fold 2 over divider B's tip → leg 5 down → fold 3 under
// the outer wall's tip → exits radially through the slot (height
// gFold3) between the wall tip and the floor. No fabricated radial
// run beyond the slot; the physical mouth is the aperture at the
// wall's outer face.
//
// CONVENTION — this section is the MID-EDGE RADIAL PLANE of the square
// build (toward the middle of a square face, not the corners). Every r
// is therefore the HALF-SIDE measured to the flat face. All area laws
// below are exact for concentric square rings under this convention,
// at every height, including with leaning walls (a horizontal cut of a
// linearly-tapering square ring is still a square ring).
//
// AREA LAWS (square, r = half-side to flats):
//   filled square       A = (2r)²                      [s², s = full side]
//   annular square ring A = (2r_o)² − (2r_i)² = 4(r_o+r_i)(r_o−r_i)
//   perimeter slot      A = 4·(2r)·h = 8rh             [square perimeter × h]
//   fold (honest)       A = 8·r_tip_centerline·g_v
//   fold length ≈ (π/2)·g_v + ½·|Δr_centerline traverse|  (assumption)
// Note the square perimeter coefficient is 8r vs a circle's 2πr —
// square radial sections expand ~27% faster per unit travel (4/π).
//
// STATED SIMPLIFICATIONS:
//   · Wall faces offset horizontally by 18 mm (true ply thickness is
//     perpendicular; horizontal error = t·(1/cosθ − 1) ≈ 0.5 mm at the
//     steepest ~13° lean here — negligible, revisit if walls exceed ~20°).
//   · Widths are horizontal at their stations (cos-correction < 1%
//     at these leans).
//   · Fold path model is the (π/2)·g + traverse convention, not a
//     fillet-exact centerline.
//   · Boundary extension beyond the slot is a labelled placeholder:
//     A(x) = 4·(2·(r_mouth + x))·(gFold3 + x) — wavefront assumed to
//     grow outward and upward past the wall face. Dashed, speculative;
//     model properly in Hornresp (two-stage boundary transition).

// ─────────────────────────────────────────────
// PHYSICS
// ─────────────────────────────────────────────
const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);
const hypexArea = (x, St, m, T) => {
  const g = Math.cosh(m * x) + T * Math.sinh(m * x);
  return St * g * g;
};
const eqRadius = (A) => Math.sqrt(Math.max(A, 0) / Math.PI);

// square area laws (r in mm → A in mm²)
const sqA = (r) => (2 * r) * (2 * r);
const annA = (ri, ro) => Math.max(4 * (ri + ro) * (ro - ri), 0);
const perA = (r, h) => 4 * (2 * r) * h;

const fmt = (v, dec = 1) => {
  if (v == null || isNaN(v)) return "—";
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  if (Math.abs(v) >= 1) return v.toFixed(dec);
  return v.toPrecision(3);
};

const sInput = {
  background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.text, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = {
  fontSize: 11, color: C.textDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};

function NumInput({ label, value, onChange, unit, min, max, step: s = 1, accent }) {
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
      <input type="number" value={local} min={min} max={max} step={s}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

// ═════════════════════════════════════════════
export default function AnnularFLHCalculator() {
  // acoustic / global
  const [temperature, setTemperature] = useState(30);
  const [cutoffFreq, setCutoffFreq] = useState(34);
  const [tParam, setTParam] = useState(0.5);
  const [wallThk, setWallThk] = useState(18);
  const [resolution, setResolution] = useState(80);

  // geometry — the nine path-order inputs + leg-1 centerline length
  const [throatR, setThroatR] = useState(80);    // 1  radius
  const [s2R, setS2R] = useState(150);           // 2  radius
  const [leg1Len, setLeg1Len] = useState(400);   //    purple centerline
  const [gFold1, setGFold1] = useState(60);      // 3  clearance (A tip ↔ floor)
  const [w4, setW4] = useState(70);              // 4  width @ A-tip height
  const [w5, setW5] = useState(95);              // 5  width @ B-tip height
  const [gFold2, setGFold2] = useState(70);      // 6  clearance (B tip ↔ top)
  const [w7, setW7] = useState(100);             // 7  width @ B-tip height
  const [w8, setW8] = useState(130);             // 8  divider B ↔ outer-wall tip
  const [gFold3, setGFold3] = useState(150);     // 9  clearance (O tip ↔ floor) = exit slot height

  // extension
  const [showExt, setShowExt] = useState(true);
  const [extLen, setExtLen] = useState(300);

  // display
  const [foldMode, setFoldMode] = useState("honest");
  const [showHypex, setShowHypex] = useState(true);
  const [plotMode, setPlotMode] = useState("area");

  const c = useMemo(() => speedOfSound(temperature), [temperature]);

  // ═══════════════════════════════════════════
  // WALL SOLVER — single source of truth
  // ═══════════════════════════════════════════
  const geom = useMemo(() => {
    const t = wallThk;
    const dxC = (s2R - throatR) / 2;
    const L1 = Math.max(leg1Len, Math.abs(dxC) + 1);
    const dzC = Math.sqrt(L1 * L1 - dxC * dxC);
    const H = dzC + gFold1;
    const zA = gFold1;        // divider A bottom tip
    const zB = H - gFold2;    // divider B top tip
    const zO = gFold3;        // outer wall bottom tip

    const line = (r1, z1, r2, z2) => (z) => r1 + (r2 - r1) * (z - z1) / ((z2 - z1) || 1);

    // Divider A — inner face anchored by the two radius inputs
    const A_in = line(throatR, H, s2R, zA);
    const A_out = (z) => A_in(z) + t;
    // Divider B — inner face anchored by widths 4 and 5 at true stations
    const B_in = line(A_out(zA) + w4, zA, A_out(zB) + w5, zB);
    const B_out = (z) => B_in(z) + t;
    // Outer wall — inner face anchored by width 7 and input 8
    const O_in = line(B_out(zB) + w7, zB, B_out(zO) + w8, zO);
    const O_out = (z) => O_in(z) + t;

    // warnings for degenerate geometry
    const warnings = [];
    if (zB <= zA) warnings.push("Divider B tip is at/below divider A tip — legs 3/5 have no height. Increase leg 1 length or reduce fold gaps.");
    if (zO >= zB) warnings.push("Exit slot (input 9) reaches above divider B's tip — leg 5 has no height.");
    if (leg1Len <= Math.abs(dxC)) warnings.push("Leg 1 centerline shorter than its horizontal run — length clamped.");

    // derived
    const leanA = Math.atan2(A_in(zA) - A_in(H), H - zA);
    const leanB = Math.atan2(B_in(0) - B_in(zB), zB);
    const leanO = Math.atan2(O_in(zO) - O_in(H), H - zO);
    const c1bot = s2R / 2;
    const c3bot = (A_out(zA) + B_in(zA)) / 2, c3top = (A_out(zB) + B_in(zB)) / 2;
    const c5top = (B_out(zB) + O_in(zB)) / 2, c5bot = (B_out(zO) + O_in(zO)) / 2;
    const leg3Slant = Math.hypot(c3top - c3bot, Math.max(zB - zA, 0));
    const leg5Slant = Math.hypot(c5bot - c5top, Math.max(zB - zO, 0));

    return {
      t, H, zA, zB, zO, dzC, leanC: Math.atan2(dxC, dzC),
      A_in, A_out, B_in, B_out, O_in, O_out,
      leanA, leanB, leanO,
      c1bot, c3bot, c3top, c5top, c5bot, leg3Slant, leg5Slant,
      mouthR: O_out(zO),      // physical mouth aperture radius (wall outer face @ tip)
      warnings,
    };
  }, [throatR, s2R, leg1Len, gFold1, gFold2, gFold3, w4, w5, w7, w8, wallThk]);

  // ═══════════════════════════════════════════
  // DEVELOPED A(x) PROFILE — sampled from wall faces
  // ═══════════════════════════════════════════
  const profile = useMemo(() => {
    const N = Math.max(20, Math.min(resolution, 300));
    const g = geom;
    const pts = [], segMarkers = [];
    let x = 0;
    const push = (xv, A, seg, kind) => pts.push({ x_mm: xv, A_mm2: A, A_cm2: A / 100, seg, kind });
    const lerp = (a, b, f) => a + (b - a) * f;

    // 1 · leg 1 (filled square), z: H → zA along the centerline path
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const z = lerp(g.H, g.zA, f);
      push(x + leg1Len * f, sqA(g.A_in(z)), 1, "filled");
    }
    x += leg1Len; segMarkers.push({ x, label: "Fold 1" });

    // 2 · fold 1 — turn under divider A's tip
    {
      const A_h = perA(g.A_in(g.zA) + g.t / 2, gFold1);
      const A_i = sqA(g.A_in(g.zA));
      const A_o = annA(g.A_out(g.zA), g.B_in(g.zA));
      const len = (Math.PI / 2) * gFold1 + Math.abs(g.c3bot - g.c1bot) / 2;
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        push(x + len * f, foldMode === "smoothed" ? lerp(A_i, A_o, f) : A_h, 2, "fold");
      }
      x += len; segMarkers.push({ x, label: "Leg 3 ↑" });
    }

    // 3 · leg 3 (annular), z: zA → zB, faces at true height
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const z = lerp(g.zA, g.zB, f);
      push(x + g.leg3Slant * f, annA(g.A_out(z), g.B_in(z)), 3, "ring");
    }
    x += g.leg3Slant; segMarkers.push({ x, label: "Fold 2" });

    // 4 · fold 2 — turn over divider B's tip
    {
      const A_h = perA(g.B_in(g.zB) + g.t / 2, gFold2);
      const A_i = annA(g.A_out(g.zB), g.B_in(g.zB));
      const A_o = annA(g.B_out(g.zB), g.O_in(g.zB));
      const len = (Math.PI / 2) * gFold2 + Math.abs(g.c5top - g.c3top) / 2;
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        push(x + len * f, foldMode === "smoothed" ? lerp(A_i, A_o, f) : A_h, 4, "fold");
      }
      x += len; segMarkers.push({ x, label: "Leg 5 ↓" });
    }

    // 5 · leg 5 (annular), z: zB → zO
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const z = lerp(g.zB, g.zO, f);
      push(x + g.leg5Slant * f, annA(g.B_out(z), g.O_in(z)), 5, "ring");
    }
    x += g.leg5Slant; segMarkers.push({ x, label: "Fold 3" });

    // 6 · fold 3 — turn under the outer wall's tip
    {
      const A_h = perA(g.O_in(g.zO) + g.t / 2, gFold3);
      const A_i = annA(g.B_out(g.zO), g.O_in(g.zO));
      const A_o = perA(g.O_in(g.zO), gFold3);
      const len = (Math.PI / 2) * gFold3;
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        push(x + len * f, foldMode === "smoothed" ? lerp(A_i, A_o, f) : A_h, 6, "fold");
      }
      x += len; segMarkers.push({ x, label: "Slot" });
    }

    // 6b · slot under the wall thickness (tiny radial run, O_in → O_out)
    for (let i = 1; i <= N / 4; i++) {
      const f = i / (N / 4);
      const r = lerp(geom.O_in(geom.zO), geom.O_out(geom.zO), f);
      push(x + geom.t * f, perA(r, gFold3), 6, "radial");
    }
    x += geom.t; segMarkers.push({ x, label: "Mouth" });

    const A_throat = sqA(geom.A_in(geom.H));
    const A_mouth = perA(geom.mouthR, gFold3);

    // 7 · boundary extension (speculative placeholder)
    const extPts = [];
    if (showExt) {
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        const xr = extLen * f;
        extPts.push({
          x_mm: x + xr,
          A_mm2: perA(geom.mouthR + xr, gFold3 + xr),
          A_cm2: perA(geom.mouthR + xr, gFold3 + xr) / 100,
          seg: 7, kind: "ext",
        });
      }
    }

    return { pts, extPts, segMarkers, totalLen: x, A_throat, A_mouth };
  }, [geom, leg1Len, gFold1, gFold2, gFold3, foldMode, resolution, showExt, extLen]);

  // ═══════════════════════════════════════════
  // ACOUSTIC READOUTS
  // ═══════════════════════════════════════════
  const St = profile.A_throat;
  const m = (2 * Math.PI * cutoffFreq) / c;
  const lambda_c = (c / cutoffFreq) * 1000;
  const hypexPts = useMemo(() => {
    if (!showHypex) return [];
    const out = [];
    for (let i = 0; i <= 200; i++) {
      const x_m = (profile.totalLen / 1000) * (i / 200);
      const A = hypexArea(x_m, St, m, tParam);
      out.push({ x_mm: x_m * 1000, A_mm2: A, A_cm2: A / 100 });
    }
    return out;
  }, [showHypex, profile.totalLen, St, m, tParam]);

  const eqMouthDia = 2 * eqRadius(profile.A_mouth);
  const minMouthDia = (c / (Math.PI * cutoffFreq)) * 1000;
  const adequacy = (eqMouthDia / minMouthDia) * 100;
  const compression = profile.A_mouth / St;

  // RMS log-area deviation vs hypex, physical path only
  const deviation = useMemo(() => {
    if (!showHypex || !hypexPts.length || profile.pts.length < 2) return null;
    let sum = 0, n = 0;
    const all = profile.pts;
    for (const hp of hypexPts) {
      let a = null, b = null;
      for (let i = 1; i < all.length; i++) {
        if (all[i].x_mm >= hp.x_mm) { a = all[i - 1]; b = all[i]; break; }
      }
      if (!a || !b) continue;
      const f = (hp.x_mm - a.x_mm) / Math.max(b.x_mm - a.x_mm, 1e-9);
      const A = a.A_mm2 + (b.A_mm2 - a.A_mm2) * f;
      if (A > 0 && hp.A_mm2 > 0) { const d = Math.log(A / hp.A_mm2); sum += d * d; n++; }
    }
    return n ? Math.sqrt(sum / n) : null;
  }, [showHypex, hypexPts, profile.pts]);

  // ═══════════════════════════════════════════
  // CROSS-SECTION RENDER — same face functions
  // ═══════════════════════════════════════════
  const renderSection = () => {
    const g = geom;
    const W = 780, Hh = 480, pL = 44, pR = 128, pT = 24, pB = 34;
    const rMax = (g.O_out(g.zO) + (showExt ? Math.min(extLen, 200) : 40)) * 1.03;
    const zMax = g.H * 1.06;
    const scale = Math.min((W - pL - pR) / rMax, (Hh - pT - pB) / zMax);
    const X = (r) => pL + r * scale;
    const Z = (z) => pT + (zMax - z) * scale;
    const P = (arr) => arr.map(([r, z]) => `${X(r).toFixed(1)},${Z(z).toFixed(1)}`).join(" ");

    const els = [];
    const airMain = C.amber + "1d", airExit = C.cyan + "22";

    // ground (white), top (blue), axis (red)
    els.push(<line key="gnd" x1={X(0)} y1={Z(0)} x2={X(rMax)} y2={Z(0)} stroke={C.white} strokeWidth={2.5} opacity={0.85} />);
    els.push(<line key="top" x1={X(0)} y1={Z(g.H)} x2={X(g.O_out(g.H))} y2={Z(g.H)} stroke={C.blue} strokeWidth={2.5} opacity={0.85} />);
    els.push(<line key="axis" x1={X(0)} y1={Z(zMax)} x2={X(0)} y2={Z(0)} stroke={C.red} strokeWidth={2} opacity={0.7} />);

    // ── air regions (from wall faces) ──
    // leg 1: axis → A inner, z H → zA
    els.push(<polygon key="a1" points={P([[0, g.H], [g.A_in(g.H), g.H], [g.A_in(g.zA), g.zA], [0, g.zA]])} fill={airMain} />);
    // fold 1 band: axis → B inner, z 0 → zA (complete turn volume under A)
    els.push(<polygon key="f1" points={P([[0, g.zA], [g.B_in(g.zA), g.zA], [g.B_in(0), 0], [0, 0]])} fill={airMain} />);
    // leg 3: A outer → B inner, z zA → zB
    els.push(<polygon key="a3" points={P([[g.A_out(g.zA), g.zA], [g.B_in(g.zA), g.zA], [g.B_in(g.zB), g.zB], [g.A_out(g.zB), g.zB]])} fill={airMain} />);
    // fold 2 band: A outer → O inner, z zB → H (complete turn volume over B)
    els.push(<polygon key="f2" points={P([[g.A_out(g.zB), g.zB], [g.O_in(g.zB), g.zB], [g.O_in(g.H), g.H], [g.A_out(g.H), g.H]])} fill={airMain} />);
    // leg 5: B outer → O inner, z zB → zO
    els.push(<polygon key="a5" points={P([[g.B_out(g.zB), g.zB], [g.O_in(g.zB), g.zB], [g.O_in(g.zO), g.zO], [g.B_out(g.zO), g.zO]])} fill={airMain} />);
    // exit slot: B outer → O outer(tip), z 0 → zO
    els.push(<polygon key="slot" points={P([[g.B_out(g.zO), g.zO], [g.O_out(g.zO), g.zO], [g.O_out(g.zO), 0], [g.B_out(0), 0]])} fill={airExit} />);

    // extension (dashed trapezoid: growing height outward)
    if (showExt) {
      const r0 = g.O_out(g.zO), xr = Math.min(extLen, rMax - r0 - 5);
      els.push(<polygon key="ext" points={P([[r0, g.zO], [r0 + xr, g.zO + xr], [r0 + xr, 0], [r0, 0]])}
        fill={C.textMuted + "12"} stroke={C.textMuted} strokeWidth={1} strokeDasharray="5 4" />);
    }

    // ── wall bodies (between the two face lines: exact source of truth) ──
    const wall = (fin, fout, zTop, zBot, key) =>
      <polygon key={key} points={P([[fin(zTop), zTop], [fout(zTop), zTop], [fout(zBot), zBot], [fin(zBot), zBot]])}
        fill={C.amber} opacity={0.9} stroke="#000" strokeWidth={0.4} />;  // palette-exempt: black is correct for plain SVG/DXF export
    els.push(wall(g.A_in, g.A_out, g.H, g.zA, "wA"));
    els.push(wall(g.B_in, g.B_out, g.zB, 0, "wB"));
    els.push(wall(g.O_in, g.O_out, g.H, g.zO, "wO"));

    // purple leg-1 centerline
    els.push(<line key="cl" x1={X(throatR / 2)} y1={Z(g.H)} x2={X(s2R / 2)} y2={Z(g.zA)}
      stroke={C.violet} strokeWidth={1.6} strokeDasharray="6 3" opacity={0.85} />);

    // ── green input indicators (mirror the sketch) ──
    const gl = (r1, z1, r2, z2, key) =>
      <line key={key} x1={X(r1)} y1={Z(z1)} x2={X(r2)} y2={Z(z2)} stroke={C.green} strokeWidth={2.2} opacity={0.9} />;
    const glab = (r, z, txt, key, dy = -4) =>
      <text key={key} x={X(r)} y={Z(z) + dy} fill={C.green} fontSize={9} fontFamily={C.mono} textAnchor="middle">{txt}</text>;
    els.push(gl(0, g.H, throatR, g.H, "g1")); els.push(glab(throatR / 2, g.H, "1", "l1", -5));
    els.push(gl(0, g.zA, s2R, g.zA, "g2")); els.push(glab(s2R / 2, g.zA, "2", "l2", -5));
    els.push(gl(g.A_in(g.zA) + g.t / 2, 0, g.A_in(g.zA) + g.t / 2, g.zA, "g3")); els.push(glab(g.A_in(g.zA) + g.t / 2 + 10, g.zA / 2, "3", "l3", 3));
    els.push(gl(g.A_out(g.zA), g.zA, g.B_in(g.zA), g.zA, "g4")); els.push(glab((g.A_out(g.zA) + g.B_in(g.zA)) / 2, g.zA, "4", "l4", 12));
    els.push(gl(g.A_out(g.zB), g.zB, g.B_in(g.zB), g.zB, "g5")); els.push(glab((g.A_out(g.zB) + g.B_in(g.zB)) / 2, g.zB, "5", "l5", -5));
    els.push(gl(g.B_in(g.zB) + g.t / 2, g.zB, g.B_in(g.zB) + g.t / 2, g.H, "g6")); els.push(glab(g.B_in(g.zB) + g.t / 2 + 10, (g.zB + g.H) / 2, "6", "l6", 3));
    els.push(gl(g.B_out(g.zB), g.zB, g.O_in(g.zB), g.zB, "g7")); els.push(glab((g.B_out(g.zB) + g.O_in(g.zB)) / 2, g.zB, "7", "l7", 12));
    els.push(gl(g.B_out(g.zO), g.zO, g.O_in(g.zO), g.zO, "g8")); els.push(glab((g.B_out(g.zO) + g.O_in(g.zO)) / 2, g.zO, "8", "l8", -5));
    els.push(gl(g.O_in(g.zO) + g.t / 2, 0, g.O_in(g.zO) + g.t / 2, g.zO, "g9")); els.push(glab(g.O_in(g.zO) + g.t / 2 + 10, g.zO / 2, "9", "l9", 3));

    // ── flow arrows ──
    const arrow = (r1, z1, r2, z2, key) => {
      const x1 = X(r1), y1 = Z(z1), x2 = X(r2), y2 = Z(z2);
      const a = Math.atan2(y2 - y1, x2 - x1), ah = 6;
      return <g key={key} opacity={0.6}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.green} strokeWidth={1.3} />
        <path d={`M${x2},${y2} L${x2 - ah * Math.cos(a - 0.5)},${y2 - ah * Math.sin(a - 0.5)} L${x2 - ah * Math.cos(a + 0.5)},${y2 - ah * Math.sin(a + 0.5)} Z`} fill={C.green} />
      </g>;
    };
    els.push(arrow(throatR / 2 + 6, g.H - 40, s2R / 2 + 6, g.zA + 50, "ar1"));
    els.push(arrow((g.A_out(g.zA) + g.B_in(g.zA)) / 2, g.zA + 40, (g.A_out(g.zB) + g.B_in(g.zB)) / 2, g.zB - 40, "ar3"));
    els.push(arrow((g.B_out(g.zB) + g.O_in(g.zB)) / 2, g.zB - 40, (g.B_out(g.zO) + g.O_in(g.zO)) / 2, g.zO + 30, "ar5"));
    els.push(arrow(g.O_in(g.zO) - 10, g.zO / 2, g.O_out(g.zO) + 30, g.zO / 2, "arM"));

    // scale bar + annotations
    const bar = 100 * scale;
    els.push(<g key="sb">
      <line x1={pL} y1={Hh - 12} x2={pL + bar} y2={Hh - 12} stroke={C.textDim} strokeWidth={2} />
      <text x={pL + bar / 2} y={Hh - 16} fill={C.textDim} fontSize={10} textAnchor="middle" fontFamily={C.mono}>100 mm</text>
    </g>);
    const ann = [
      [`H: ${fmt(g.H, 0)} mm`, C.blue],
      [`leg1 lean: ${fmt(g.leanC * 180 / Math.PI, 1)}°`, C.violet],
      [`wall leans A/B/O:`, C.textDim],
      [`${fmt(g.leanA * 180 / Math.PI, 1)}° / ${fmt(g.leanB * 180 / Math.PI, 1)}° / ${fmt(g.leanO * 180 / Math.PI, 1)}°`, C.amber],
      [`leg3: ${fmt(g.leg3Slant, 0)} mm`, C.textDim],
      [`leg5: ${fmt(g.leg5Slant, 0)} mm`, C.textDim],
      [`mouth r: ${fmt(g.mouthR, 0)} mm`, C.cyan],
    ];
    ann.forEach(([txt, col], i) =>
      els.push(<text key={`an${i}`} x={W - pR + 10} y={pT + 16 + i * 16} fill={col} fontSize={10} fontFamily={C.mono}>{txt}</text>));

    return (
      <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" style={{ display: "block" }}>
        {els}
        <text x={pL} y={14} fill={C.textDim} fontSize={9} fontFamily={C.sans}>half-section · r →</text>
      </svg>
    );
  };

  // ═══════════════════════════════════════════
  // AREA PLOT
  // ═══════════════════════════════════════════
  const allPts = [...profile.pts, ...(showExt ? profile.extPts : [])];
  const plotLen = profile.totalLen + (showExt ? extLen : 0);
  const yOf = (p) => plotMode === "area" ? p.A_cm2 : eqRadius(p.A_mm2);
  const maxY = Math.max(...allPts.map(yOf), ...(showHypex ? hypexPts.map(yOf) : [0]), 1);
  const pW = 780, pH = 330, pdL = 58, pdR = 16, pdT = 16, pdB = 38;
  const iW = pW - pdL - pdR, iH = pH - pdT - pdB;
  const sx = (x) => pdL + (x / plotLen) * iW;
  const sy = (y) => pdT + iH - (y / maxY) * iH;
  const path = (arr) => !arr.length ? "" : arr.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x_mm).toFixed(1)},${sy(yOf(p)).toFixed(1)}`).join(" ");
  const xStep = plotLen > 2000 ? 500 : plotLen > 1000 ? 250 : 100;
  const xGrid = []; for (let gx = 0; gx <= plotLen; gx += xStep) xGrid.push(gx);
  const yStep = maxY > 4000 ? 1000 : maxY > 1500 ? 500 : maxY > 600 ? 200 : maxY > 200 ? 100 : 50;
  const yGrid = []; for (let gy = 0; gy <= maxY; gy += yStep) yGrid.push(gy);
  const segColor = (k) => k === "fold" ? C.violet : k === "radial" ? C.cyan : k === "ext" ? C.textMuted : C.amber;

  const exportCSV = () => {
    const rows = allPts.map((p) => `${fmt(p.x_mm, 2)},${fmt(p.A_cm2, 3)},${fmt(p.A_mm2, 1)},${p.seg},${p.kind}`).join("\n");
    const blob = new Blob(["x_mm,area_cm2,area_mm2,segment,kind\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `annular_flh_fc${cutoffFreq}_T${tParam}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const btn = (active, col) => ({
    background: active ? col + "20" : "transparent", border: `1px solid ${active ? col : C.border}`,
    borderRadius: 3, color: active ? col : C.textDim, fontSize: 10, padding: "2px 8px",
    cursor: "pointer", fontFamily: C.mono,
  });

  const g = geom;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.amber, margin: 0, letterSpacing: "0.05em" }}>
          ANNULAR FLH — WALL-PRIMITIVE v2
        </h1>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          Three ply walls as face-line functions r(z) · areas, drawing & derived lengths all sample the same faces
        </div>
      </div>

      {geom.warnings.length > 0 && (
        <div style={{ ...card, border: `1px solid ${C.red}`, background: C.red + "10" }}>
          {geom.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.red }}>⚠ {w}</div>)}
        </div>
      )}

      {/* ACOUSTIC */}
      <div style={card}>
        <div style={secTitle}>Acoustic & Global</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <NumInput label="Target f_c" value={cutoffFreq} onChange={setCutoffFreq} unit="Hz" min={15} max={200} step={1} />
          <NumInput label="Temperature" value={temperature} onChange={setTemperature} unit="°C" min={-20} max={50} step={1} />
          <NumInput label="Wall thickness" value={wallThk} onChange={setWallThk} unit="mm" min={1} max={50} step={1} />
          <div style={{ marginBottom: 10 }}>
            <label style={sLabel}>Hypex T <span style={{ color: C.amber, fontFamily: C.mono, fontSize: 10 }}>{tParam === 0 ? "cosh" : tParam === 1 ? "exp" : tParam}</span></label>
            <input type="range" min={0} max={1.5} step={0.01} value={tParam}
              onChange={(e) => setTParam(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.amber }} />
          </div>
          <NumInput label="Resolution" value={resolution} onChange={setResolution} unit="pts/seg" min={20} max={300} step={10} />
        </div>
      </div>

      {/* GEOMETRY */}
      <div style={card}>
        <div style={secTitle}>Geometry · nine inputs in path order (numbers match section view)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <NumInput label="1 · Throat radius" value={throatR} onChange={setThroatR} unit="mm" min={5} max={1000} step={1} accent={C.green} />
          <NumInput label="2 · Leg 1 end radius" value={s2R} onChange={setS2R} unit="mm" min={5} max={1500} step={1} accent={C.green} />
          <NumInput label="Leg 1 length (purple)" value={leg1Len} onChange={setLeg1Len} unit="mm" min={20} max={3000} step={5} accent={C.violet} />
          <NumInput label="3 · Fold 1 gap (A tip↕floor)" value={gFold1} onChange={setGFold1} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="4 · Leg 3 width @ fold 1" value={w4} onChange={setW4} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="5 · Leg 3 width @ fold 2" value={w5} onChange={setW5} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="6 · Fold 2 gap (B tip↕top)" value={gFold2} onChange={setGFold2} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="7 · Leg 5 width @ fold 2" value={w7} onChange={setW7} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="8 · B wall → outer tip" value={w8} onChange={setW8} unit="mm" min={5} max={500} step={1} accent={C.green} />
          <NumInput label="9 · Exit slot (O tip↕floor)" value={gFold3} onChange={setGFold3} unit="mm" min={5} max={500} step={1} accent={C.green} />
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showExt} onChange={(e) => setShowExt(e.target.checked)} style={{ accentColor: C.textMuted }} />
            <span style={{ color: C.textDim }}>Boundary extension (speculative, dashed)</span>
          </label>
          {showExt && (
            <div style={{ width: 180 }}>
              <NumInput label="Extension length" value={extLen} onChange={setExtLen} unit="mm" min={10} max={2000} step={10} />
            </div>
          )}
        </div>
      </div>

      {/* SECTION VIEW */}
      <div style={card}>
        <div style={secTitle}>Cross-section (r–z half) · green numbers = inputs</div>
        {renderSection()}
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.red }}>━ Axis</span>
          <span style={{ fontSize: 10, color: C.blue }}>━ Top</span>
          <span style={{ fontSize: 10, color: C.white }}>━ Ground</span>
          <span style={{ fontSize: 10, color: C.amber }}>▮ Walls (t = {wallThk} mm)</span>
          <span style={{ fontSize: 10, color: C.violet }}>╌ Leg 1 centerline</span>
          <span style={{ fontSize: 10, color: C.green }}>━ Inputs 1–9 · → flow</span>
          <span style={{ fontSize: 10, color: C.cyan }}>▮ Exit slot</span>
        </div>
      </div>

      {/* AREA VIEW */}
      <div style={{ ...card, paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={secTitle}>Area profile</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPlotMode("area")} style={btn(plotMode === "area", C.amber)}>Area (cm²)</button>
            <button onClick={() => setPlotMode("radius")} style={btn(plotMode === "radius", C.amber)}>Eq. round r (mm)</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setFoldMode("honest")} style={btn(foldMode === "honest", C.violet)}>Honest folds</button>
            <button onClick={() => setFoldMode("smoothed")} style={btn(foldMode === "smoothed", C.violet)}>Smoothed</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showHypex} onChange={(e) => setShowHypex(e.target.checked)} style={{ accentColor: C.green }} />
            <span style={{ color: C.green }}>Hypex T={tParam}</span>
          </label>
        </div>
        <svg viewBox={`0 0 ${pW} ${pH}`} width="100%" style={{ display: "block" }}>
          {xGrid.map((gx) => <g key={`x${gx}`}>
            <line x1={sx(gx)} y1={pdT} x2={sx(gx)} y2={pdT + iH} stroke={C.border} strokeWidth={0.5} />
            <text x={sx(gx)} y={pdT + iH + 16} fill={C.textMuted} fontSize={10} textAnchor="middle" fontFamily={C.mono}>{gx}</text>
          </g>)}
          {yGrid.map((gy) => <g key={`y${gy}`}>
            <line x1={pdL} y1={sy(gy)} x2={pdL + iW} y2={sy(gy)} stroke={C.border} strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={pdL - 6} y={sy(gy) + 3} fill={C.textMuted} fontSize={10} textAnchor="end" fontFamily={C.mono}>{gy}</text>
          </g>)}
          {profile.segMarkers.map((mk, i) => <g key={`mk${i}`}>
            <line x1={sx(mk.x)} y1={pdT} x2={sx(mk.x)} y2={pdT + iH} stroke={C.borderLight} strokeWidth={0.7} strokeDasharray="2 4" opacity={0.6} />
            <text x={sx(mk.x)} y={pdT + 10} fill={C.textDim} fontSize={8} textAnchor="middle" fontFamily={C.mono} opacity={0.8}>{mk.label}</text>
          </g>)}
          {showHypex && <path d={path(hypexPts)} fill="none" stroke={C.green} strokeWidth={2} strokeDasharray="6 4" opacity={0.85} />}
          {(() => {
            const segs = []; let cur = [profile.pts[0]];
            for (let i = 1; i < profile.pts.length; i++) {
              if (profile.pts[i].kind !== profile.pts[i - 1].kind) { segs.push(cur); cur = [profile.pts[i - 1], profile.pts[i]]; }
              else cur.push(profile.pts[i]);
            }
            segs.push(cur);
            return segs.map((s, i) => <path key={`s${i}`} d={path(s)} fill="none" stroke={segColor(s[Math.floor(s.length / 2)].kind)} strokeWidth={2.4} />);
          })()}
          {showExt && <path d={path(profile.extPts)} fill="none" stroke={C.textMuted} strokeWidth={2} strokeDasharray="4 4" opacity={0.8} />}
          {plotMode === "area" && (() => {
            const A_min = Math.PI * (minMouthDia / 2) ** 2 / 100;
            if (A_min > maxY) return null;
            return <g>
              <line x1={pdL} y1={sy(A_min)} x2={pdL + iW} y2={sy(A_min)} stroke={adequacy >= 100 ? C.green : C.red} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
              <text x={pdL + iW - 4} y={sy(A_min) - 4} fill={adequacy >= 100 ? C.green : C.red} fontSize={9} textAnchor="end" fontFamily={C.mono} opacity={0.7}>min mouth (loading)</text>
            </g>;
          })()}
          <text x={pdL + iW / 2} y={pH - 4} fill={C.textDim} fontSize={11} textAnchor="middle" fontFamily={C.sans}>Developed path length (mm)</text>
          <text x={14} y={pdT + iH / 2} fill={C.textDim} fontSize={11} textAnchor="middle" fontFamily={C.sans} transform={`rotate(-90 14 ${pdT + iH / 2})`}>
            {plotMode === "area" ? "Area (cm²)" : "Eq. round radius (mm)"}
          </text>
        </svg>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.amber }}>━ Legs</span>
          <span style={{ fontSize: 10, color: C.violet }}>━ Folds</span>
          <span style={{ fontSize: 10, color: C.cyan }}>━ Under-wall slot</span>
          {showExt && <span style={{ fontSize: 10, color: C.textMuted }}>╌ Extension</span>}
          {showHypex && <span style={{ fontSize: 10, color: C.green }}>╌ Hypex</span>}
        </div>
      </div>

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Speed of sound", value: `${fmt(c, 1)} m/s`, sub: `at ${temperature}°C` },
          { label: "Blue→white H", value: `${fmt(g.H, 0)} mm`, sub: `leg-1 drop ${fmt(g.dzC, 0)} + fold 1` },
          { label: "Leg 1 lean", value: `${fmt(g.leanC * 180 / Math.PI, 1)}°`, sub: "centerline from vertical" },
          { label: "Legs 3 / 5 (derived)", value: `${fmt(g.leg3Slant, 0)} / ${fmt(g.leg5Slant, 0)}`, sub: "mm slant centerline" },
          { label: "Throat area", value: `${fmt(profile.A_throat / 100, 1)} cm²`, sub: "filled square (2r)²" },
          { label: "Mouth area", value: `${fmt(profile.A_mouth / 100, 1)} cm²`, sub: "slot @ wall outer face" },
          { label: "Compression", value: `${fmt(compression, 1)}:1`, sub: "mouth / throat" },
          { label: "Developed length", value: `${fmt(profile.totalLen, 0)} mm`, sub: `${fmt(profile.totalLen / lambda_c, 3)}·λ_c` },
          { label: "Min mouth (loading)", value: `⌀${fmt(minMouthDia, 0)}`, sub: "mm, circ = λ at f_c", color: C.textDim },
          { label: "Mouth adequacy", value: `${fmt(adequacy, 0)}%`, sub: adequacy >= 100 ? "✓ adequate" : "boundary-dependent", color: adequacy >= 100 ? C.green : C.amber },
          { label: "Hypex deviation", value: deviation != null ? fmt(deviation, 3) : "—", sub: "RMS log-area (phys. path)", color: C.textDim },
        ].map((it, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>{it.label}</div>
            <div style={{ fontSize: 15, fontFamily: C.mono, fontWeight: 600, color: it.color || C.text }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 10, color: it.color || C.textMuted, marginTop: 1 }}>{it.sub}</div>}
          </div>
        ))}
      </div>

      {/* SEGMENT TABLE */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={secTitle}>Segments</span>
          <button onClick={exportCSV} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 4, color: C.blue, fontSize: 11, padding: "3px 10px", cursor: "pointer", fontFamily: C.mono }}>Export CSV</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
            <thead><tr>{["Segment", "A in (cm²)", "A out (cm²)", "Fold A (cm²)", "Dev. len (mm)"].map((h) => (
              <th key={h} style={{ textAlign: "right", padding: "6px 12px", borderBottom: `1px solid ${C.borderLight}`, color: C.textDim, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {(() => {
                const rows = [
                  ["1 · Leg 1 ↓ (filled)", sqA(g.A_in(g.H)), sqA(g.A_in(g.zA)), null, leg1Len, C.amber],
                  ["2 · Fold 1 ↻", sqA(g.A_in(g.zA)), annA(g.A_out(g.zA), g.B_in(g.zA)), perA(g.A_in(g.zA) + g.t / 2, gFold1), (Math.PI / 2) * gFold1 + Math.abs(g.c3bot - g.c1bot) / 2, C.violet],
                  ["3 · Leg 3 ↑", annA(g.A_out(g.zA), g.B_in(g.zA)), annA(g.A_out(g.zB), g.B_in(g.zB)), null, g.leg3Slant, C.amber],
                  ["4 · Fold 2 ↻", annA(g.A_out(g.zB), g.B_in(g.zB)), annA(g.B_out(g.zB), g.O_in(g.zB)), perA(g.B_in(g.zB) + g.t / 2, gFold2), (Math.PI / 2) * gFold2 + Math.abs(g.c5top - g.c3top) / 2, C.violet],
                  ["5 · Leg 5 ↓", annA(g.B_out(g.zB), g.O_in(g.zB)), annA(g.B_out(g.zO), g.O_in(g.zO)), null, g.leg5Slant, C.amber],
                  ["6 · Fold 3 ↻ + slot", annA(g.B_out(g.zO), g.O_in(g.zO)), perA(g.O_out(g.zO), gFold3), perA(g.O_in(g.zO) + g.t / 2, gFold3), (Math.PI / 2) * gFold3 + g.t, C.violet],
                ];
                if (showExt) rows.push(["7 · Extension ⇢ (spec.)", perA(g.mouthR, gFold3), perA(g.mouthR + extLen, gFold3 + extLen), null, extLen, C.textMuted]);
                return rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? C.bg + "60" : "transparent" }}>
                    <td style={{ textAlign: "left", padding: "4px 12px", color: r[5] }}>{r[0]}</td>
                    <td style={{ textAlign: "right", padding: "4px 12px", color: C.text }}>{fmt(r[1] / 100, 1)}</td>
                    <td style={{ textAlign: "right", padding: "4px 12px", color: C.text }}>{fmt(r[2] / 100, 1)}</td>
                    <td style={{ textAlign: "right", padding: "4px 12px", color: C.violet }}>{r[3] != null ? fmt(r[3] / 100, 1) : "—"}</td>
                    <td style={{ textAlign: "right", padding: "4px 12px", color: C.textDim }}>{fmt(r[4], 1)}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTES */}
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, padding: "0 4px", fontFamily: C.sans }}>
        <strong style={{ color: C.textDim }}>Model</strong> · Three ply walls (divider A hangs from top, tip gFold1 off floor · divider B stands on floor, tip gFold2 below top · outer wall hangs from top, tip gFold3 off floor). Faces are straight lines r(z) anchored exactly at the input stations; widths 4/5/7/8 are horizontal air gaps at their true heights. Throat = filled square in line with blue; the path becomes annular after fold 1. Physical mouth = exit slot at the outer wall's outer face (no fabricated radial run).
        <br />
        <strong style={{ color: C.textDim }}>Square-build convention</strong> · This section is the mid-edge radial plane; every r is the half-side to the flat face. Area laws are exact for concentric square rings under this convention at every height, leaning walls included. Square perimeter = 8r (vs 2πr round): radial sections expand ~27% faster than a circular equivalent. Leaning rings remain buildable from flat ply: each face is a planar trapezoid, corner joints are straight lines with constant mitre.
        <br />
        <strong style={{ color: C.textDim }}>Simplifications (stated margins)</strong> · Wall faces offset horizontally by t: error vs true perpendicular ply thickness ≈ t·(1/cosθ−1) ≈ 0.5 mm at the steepest ~13° lean here; revisit above ~20°. Areas are horizontal cuts; flow-normal area = horizontal × cos(centerline lean): 0.4% (leg 1), 0.9% (leg 3), 1.3% (leg 5) at defaults. Corners: radial-flow paths toward a corner are √2× the flat path — the lumped model measures at the flats (standard, but real corner-region behaviour is not captured). Fold path length = (π/2)·g + ½·traverse (convention, not fillet-exact). Honest fold area = perimeter at the wall-tip centerline × clearance. Mouth adequacy uses an equivalent round diameter √(A/π) against the circular c/(πf_c) criterion — fine for relative comparison, soft as an absolute pass/fail for a square mouth.
        <br />
        <strong style={{ color: C.textDim }}>Speculative</strong> · Extension: A(x) = 4·(2·(r_mouth+x))·(gFold3+x) — wavefront assumed to expand outward and upward past the wall face. Placeholder only; the two-stage boundary transition belongs in Hornresp. Deviation metric excludes the extension.
        <br />
        <strong style={{ color: C.textDim }}>Reading the plot</strong> · A fold's honest level sitting below its neighbours = a real constriction at that turn (fix by increasing that fold's clearance). Steps between segments in honest mode are real reflection sites; smoothed mode shows the intended continuous design.
      </div>
    </div>
  );
}
