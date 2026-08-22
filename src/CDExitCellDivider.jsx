import React, { useState, useMemo, useEffect } from "react";
import { C } from "./palette.js";

// ═══════════════════════════════════════════════════════════════════════
// COMPRESSION DRIVER EXIT — EQUAL-AREA CELL DIVISION TOOL  (v1)
// ═══════════════════════════════════════════════════════════════════════
//
// PURPOSE
//   Partition a circular CD exit into N cells of equal OPEN (acoustic)
//   area, and emit geometry that transfers directly to CAD.
//
// PARTITION FAMILY
//   Concentric rings, ring j carrying n_j equal angular cells:
//       rings = [n_0, n_1, ... n_{k-1}]        N = Σ n_j
//   n_0 = 1  → central disc / polygon cell (the "hexagon + 6" family)
//   n_0 ≥ 2  → sectors meeting at the centre; requires a solid hub
//   k = 1    → pure sector division
//   n_j = 1 for j>0 → full annulus (included for comparison; poor)
//
// RING BOUNDARY MODES
//   arc   — boundaries are circles → ring dividers are cones of
//           revolution (lathe / printed).
//   chord — boundary between ring j and j+1 is a regular n_{j+1}-gon
//           with vertices on ring j+1's divider rays → ring dividers
//           are flat plates. Every cell is then CONVEX, which matters:
//           Payne–Weinberger (1960) guarantees the first non-zero
//           Neumann eigenvalue of a convex domain of diameter d obeys
//           μ₁ ≥ π²/d², i.e. f_HOM ≥ c/(2d). Non-convex cells (arc
//           inner boundary curving into the cell) carry no such
//           guarantee.
//
// SELECTION OBJECTIVE ("auto")
//   Minimise the largest cell diameter d_max → maximise the guaranteed
//   HOM-free bandwidth f ≥ c/(2·d_max). Isodiametric inequality gives
//   the unbeatable ceiling d_max ≥ 2R/√N (cells would have to be
//   circles), so the tool reports how close a layout gets to it.
//
// STATED SIMPLIFICATIONS
//   · Open-area correction is first order: each cell loses t/2 along
//     every edge it shares with a divider. Corner overlaps (~t²/4 per
//     junction) are ignored — <0.1% of cell area for t ≤ 1 mm on a
//     ≥25 mm exit.
//   · The equal-area solver assumes cells within a ring are identical.
//     True when each ring's count divides the next ("nested"). When it
//     doesn't, the tool computes every cell individually afterwards and
//     reports the intra-ring area spread so the error is visible.
//   · The optimiser ranks candidates using arc-mode analytic radii even
//     when chord mode is selected; the final geometry is then solved
//     exactly in the selected mode. Ranking is insensitive to this,
//     the reported numbers are not affected.
//   · Areas are taken in the exit plane. For a conical exit of half
//     angle θ the true (spherical) wavefront area is larger by
//     2/(1+cosθ) — 0.8% at 10°, 1.7% at 15°. Reported, not applied.
//   · Thermoviscous loss uses the wide-tube Kirchhoff approximation
//     α ≈ (1.475/(a·c))·√(νω/2) with a = hydraulic radius. Valid while
//     a ≫ boundary layer (~22 µm at 10 kHz); flagged when it isn't.
//
// ═══════════════════════════════════════════════════════════════════════

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const NU = 1.5e-5; // kinematic viscosity of air, m²/s
const TV = 1.475; // 1 + (γ−1)/√Pr for air

const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);

const fmt = (v, d = 1) => {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(d, 1));
  if (Math.abs(v) >= 1) return v.toFixed(d);
  return v.toPrecision(3);
};

// radius of a boundary at angle phi.  nSides < 3 → circle.
const rAtB = (r, nSides, phi, rot) => {
  if (!nSides || nSides < 3) return r;
  const step = TAU / nSides;
  let a = ((phi - rot) % step + step) % step;
  return (r * Math.cos(Math.PI / nSides)) / Math.cos(a - step / 2);
};

// analytic diameter of an arc-mode annular sector (used by the optimiser)
const sectorDia = (ri, ro, dphi) => {
  if (dphi >= Math.PI) return 2 * ro;
  const chord = 2 * ro * Math.sin(dphi / 2);
  const diag = Math.sqrt(ri * ri + ro * ro - 2 * ri * ro * Math.cos(dphi));
  return Math.max(chord, diag, ro - ri);
};

// ─────────────────────────────────────────────
// GEOMETRY BUILDER
// ─────────────────────────────────────────────
function buildGeometry({ R, hubR, rings, mode, rot, t, equalize, samples = 120 }) {
  const k = rings.length;
  const N = rings.reduce((a, b) => a + b, 0);
  const sidesAt = (j) => (mode === "chord" && j > 0 && j < k ? rings[j] : 0);

  // start from arc-mode equal geometric area
  const radii = [hubR];
  let cum = 0;
  for (let j = 0; j < k; j++) {
    cum += rings[j];
    radii.push(Math.sqrt(hubR * hubR + (cum / N) * (R * R - hubR * hubR)));
  }
  radii[k] = R;

  const evalCell = (j, i, rr) => {
    const n = rings[j];
    const dphi = TAU / n;
    const phiA = rot + dphi * i;
    const si = sidesAt(j),
      so = sidesAt(j + 1);
    const ri = rr[j],
      ro = rr[j + 1];
    const M = samples;
    let area = 0,
      Lin = 0,
      Lout = 0;
    let pIprev = null,
      pOprev = null;
    const ptsIn = [],
      ptsOut = [];
    const keep = Math.max(1, Math.floor(M / 20));
    for (let q = 0; q <= M; q++) {
      const phi = phiA + (dphi * q) / M;
      const rI = rAtB(ri, si, phi, rot);
      const rO = rAtB(ro, so, phi, rot);
      const w = q === 0 || q === M ? 0.5 : 1;
      area += w * 0.5 * (rO * rO - rI * rI);
      const pI = [rI * Math.cos(phi), rI * Math.sin(phi)];
      const pO = [rO * Math.cos(phi), rO * Math.sin(phi)];
      if (pIprev) Lin += Math.hypot(pI[0] - pIprev[0], pI[1] - pIprev[1]);
      if (pOprev) Lout += Math.hypot(pO[0] - pOprev[0], pO[1] - pOprev[1]);
      pIprev = pI;
      pOprev = pO;
      if (q % keep === 0 || q === M) {
        ptsIn.push(pI);
        ptsOut.push(pO);
      }
    }
    area *= dphi / M;

    const edgeA = rAtB(ro, so, phiA, rot) - rAtB(ri, si, phiA, rot);
    const edgeB =
      rAtB(ro, so, phiA + dphi, rot) - rAtB(ri, si, phiA + dphi, rot);

    let Pint = 0;
    if (n > 1) Pint += edgeA + edgeB; // both radial edges are shared dividers
    if (j > 0) Pint += Lin; // inner boundary is a ring divider
    if (j < k - 1) Pint += Lout; // outer boundary is a ring divider
    const open = Math.max(area - (t / 2) * Pint, 1e-6);

    const perim = Lin + Lout + (n > 1 ? edgeA + edgeB : 0);
    const dh = (4 * open) / Math.max(perim, 1e-9);

    // diameter over sampled boundary
    const all = ptsIn.concat(ptsOut);
    let dia = 0;
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++) {
        const dd = Math.hypot(all[a][0] - all[b][0], all[a][1] - all[b][1]);
        if (dd > dia) dia = dd;
      }

    // centroid (shoelace on the closed sampled polygon)
    const poly = ptsIn.concat([...ptsOut].reverse());
    let A2 = 0,
      cx = 0,
      cy = 0;
    for (let a = 0; a < poly.length; a++) {
      const p = poly[a],
        q2 = poly[(a + 1) % poly.length];
      const cr = p[0] * q2[1] - q2[0] * p[1];
      A2 += cr;
      cx += (p[0] + q2[0]) * cr;
      cy += (p[1] + q2[1]) * cr;
    }
    A2 = A2 / 2;
    const cen =
      Math.abs(A2) > 1e-9 ? [cx / (6 * A2), cy / (6 * A2)] : [0, 0];

    return {
      ring: j,
      index: i,
      phiA,
      phiB: phiA + dphi,
      area,
      open,
      perim,
      dh,
      dia,
      cen,
      ptsIn,
      ptsOut,
      edgeA,
      edgeB,
    };
  };

  // ── equalise OPEN area by moving ring boundaries ──
  if (equalize && t > 0 && k > 1) {
    for (let outer = 0; outer < 8; outer++) {
      let tot = 0;
      for (let j = 0; j < k; j++) tot += rings[j] * evalCell(j, 0, radii).open;
      const target = tot / N;
      for (let j = 1; j < k; j++) {
        let lo = radii[j - 1] + t,
          hi = radii[j + 1] - t;
        if (hi <= lo) continue;
        for (let it = 0; it < 34; it++) {
          const mid = (lo + hi) / 2;
          const test = radii.slice();
          test[j] = mid;
          if (evalCell(j - 1, 0, test).open < target) lo = mid;
          else hi = mid;
        }
        radii[j] = (lo + hi) / 2;
      }
    }
  }

  // final: every cell individually
  const cells = [];
  for (let j = 0; j < k; j++)
    for (let i = 0; i < rings[j]; i++) cells.push(evalCell(j, i, radii));

  const opens = cells.map((c) => c.open);
  const areas = cells.map((c) => c.area);
  const openMean = opens.reduce((a, b) => a + b, 0) / N;
  const spread =
    ((Math.max(...opens) - Math.min(...opens)) / openMean) * 100;
  const diaMax = Math.max(...cells.map((c) => c.dia));
  const dhMin = Math.min(...cells.map((c) => c.dh));
  const openTotal = opens.reduce((a, b) => a + b, 0);
  const grossTotal = Math.PI * (R * R - hubR * hubR);

  return {
    radii,
    rings,
    cells,
    k,
    N,
    openMean,
    openTotal,
    grossTotal,
    areaMean: areas.reduce((a, b) => a + b, 0) / N,
    spread,
    diaMax,
    dhMin,
    sidesAt,
  };
}

// ─────────────────────────────────────────────
// OPTIMISER — minimise the largest cell diameter
// ─────────────────────────────────────────────
function enumerateLayouts(N, nested, maxRings = 5) {
  const out = [];
  const rec = (parts, remaining, minPart) => {
    if (parts.length > maxRings) return;
    if (remaining === 0) {
      if (parts.length) out.push(parts.slice());
      return;
    }
    if (parts.length === maxRings) return;
    for (let n = minPart; n <= remaining; n++) {
      const last = parts.length ? parts[parts.length - 1] : 0;
      // nesting only constrains consecutive rings that both carry
      // radial dividers (a centre disc has none)
      if (nested && last >= 2 && n % last !== 0) continue;
      parts.push(n);
      rec(parts, remaining - n, n);
      parts.pop();
    }
  };
  rec([], N, 1);
  return out;
}

function scoreLayout(parts, R, hubR) {
  const N = parts.reduce((a, b) => a + b, 0);
  const hub = parts[0] >= 2 ? Math.max(hubR, R * 0.03) : hubR;
  let cum = 0,
    ri = hub,
    worst = 0;
  for (let j = 0; j < parts.length; j++) {
    cum += parts[j];
    const ro = Math.sqrt(hub * hub + (cum / N) * (R * R - hub * hub));
    worst = Math.max(worst, sectorDia(ri, ro, TAU / parts[j]));
    ri = ro;
  }
  return worst;
}

function optimizeLayout(N, R, hubR, nested) {
  const cands = enumerateLayouts(N, nested);
  let best = null,
    bestScore = Infinity;
  for (const c of cands) {
    const s = scoreLayout(c, R, hubR);
    if (s < bestScore - 1e-9 || (Math.abs(s - bestScore) < 1e-9 && best && c.length < best.length)) {
      bestScore = s;
      best = c;
    }
  }
  return { layout: best || [N], score: bestScore };
}

// ─────────────────────────────────────────────
// UI PRIMITIVES  (house style, matches the other tools)
// ─────────────────────────────────────────────
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

const btn = (active, col) => ({
  background: active ? col + "20" : "transparent",
  border: `1px solid ${active ? col : C.border}`,
  borderRadius: 3, color: active ? col : C.textDim, fontSize: 10,
  padding: "3px 9px", cursor: "pointer", fontFamily: C.mono,
});

// ═════════════════════════════════════════════
export default function CDExitCellDivider() {
  // driver / acoustics
  const [exitDia, setExitDia] = useState(35.5);
  const [exitAngle, setExitAngle] = useState(8);   // half-angle, deg
  const [hornAngle, setHornAngle] = useState(8);   // downstream horn half-angle
  const [temperature, setTemperature] = useState(30);

  // division
  const [nCells, setNCells] = useState(12);
  const [scheme, setScheme] = useState("auto");    // auto | sectors | rings | custom
  const [customSpec, setCustomSpec] = useState("1,6,12");
  const [nested, setNested] = useState(true);
  const [mode, setMode] = useState("chord");       // chord | arc
  const [rotDeg, setRotDeg] = useState(0);
  const [hubDia, setHubDia] = useState(0);
  const [thickness, setThickness] = useState(0.8);
  const [equalize, setEqualize] = useState(true);
  const [dividerLen, setDividerLen] = useState(25);

  // display
  const [showThk, setShowThk] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showSide, setShowSide] = useState(true);

  const c = useMemo(() => speedOfSound(temperature), [temperature]);
  const R = exitDia / 2;
  const rot = rotDeg * D2R;

  // ── resolve the ring layout ──
  const layoutInfo = useMemo(() => {
    const warn = [];
    let rings;
    if (scheme === "sectors") rings = [nCells];
    else if (scheme === "rings") rings = new Array(nCells).fill(1);
    else if (scheme === "custom") {
      rings = customSpec.split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n > 0);
      if (!rings.length) { rings = [nCells]; warn.push("Could not read the ring spec — fell back to a single ring."); }
    } else {
      rings = optimizeLayout(nCells, R, hubDia / 2, nested).layout;
    }
    const N = rings.reduce((a, b) => a + b, 0);
    if (scheme === "custom" && N !== nCells) warn.push(`Ring spec totals ${N} cells; the N input (${nCells}) is ignored in custom mode.`);
    return { rings, N, warn };
  }, [scheme, nCells, customSpec, nested, R, hubDia]);

  const rings = layoutInfo.rings;
  const N = layoutInfo.N;

  // hub is mandatory when radial dividers meet at the centre
  const hubR = useMemo(() => {
    const need = rings[0] >= 2;
    const r = hubDia / 2;
    return need ? Math.max(r, thickness * 0.75) : r;
  }, [rings, hubDia, thickness]);

  const geo = useMemo(
    () => buildGeometry({ R, hubR, rings, mode, rot, t: thickness, equalize }),
    [R, hubR, rings, mode, rot, thickness, equalize]
  );

  // ── acoustic readouts ──
  const bound = (d) => c / (2 * (d / 1000)); // Hz, Payne–Weinberger lower bound
  const fUndividedExact = (0.5861 * c) / (exitDia / 1000);
  const fUndividedBound = bound(exitDia);
  const fCells = bound(geo.diaMax);
  const dCeiling = (2 * R) / Math.sqrt(N); // isodiametric ceiling
  const fCeiling = bound(dCeiling);

  const nestedOK = rings.every((n, i) => i === 0 || rings[i - 1] < 2 || n % rings[i - 1] === 0);

  // thermoviscous loss over the divider run, evaluated at fCells
  const lossDb = useMemo(() => {
    const f = Math.min(fCells, 20000);
    const w = TAU * f;
    const a = geo.dhMin / 2 / 1000; // hydraulic radius, m
    if (a <= 0) return null;
    const alpha = (TV / (a * c)) * Math.sqrt((NU * w) / 2); // Np/m
    return alpha * (dividerLen / 1000) * 8.686;
  }, [geo.dhMin, fCells, c, dividerLen]);
  const deltaV = Math.sqrt((2 * NU) / (TAU * Math.min(fCells, 20000))) * 1000; // mm

  // comparison table
  const compare = useMemo(() => {
    const rows = [];
    const mk = (name, parts) => {
      const d = scoreLayout(parts, R, hubR);
      rows.push({ name, parts: parts.join("+"), d, f: bound(d) });
    };
    mk("Undivided exit", [1]);
    mk(`${N} pure sectors`, [N]);
    mk(`${N} rings only`, new Array(N).fill(1));
    mk("Centre + one ring", [1, N - 1]);
    const o = optimizeLayout(N, R, hubR, true);
    mk("Optimum (nested)", o.layout);
    const o2 = optimizeLayout(N, R, hubR, false);
    mk("Optimum (free)", o2.layout);
    return rows;
  }, [N, R, hubR, c]);

  const warnings = useMemo(() => {
    const w = [...layoutInfo.warn];
    if (mode === "chord" && !nestedOK)
      w.push("Chord mode with non-nested ring counts: cells within a ring are not congruent and equal area cannot be exact. Intra-ring spread is reported below.");
    if (rings[0] >= 2 && hubDia / 2 < thickness * 0.75)
      w.push(`Radial dividers meet at the axis — a hub of at least ${fmt(thickness * 1.5, 2)} mm diameter is implied and has been assumed.`);
    if (hornAngle < exitAngle - 0.1)
      w.push(`Downstream horn half-angle (${hornAngle}°) is narrower than the exit (${exitAngle}°) — reverse taper at the throat transition.`);
    if (geo.dhMin < 2)
      w.push(`Smallest hydraulic diameter is ${fmt(geo.dhMin, 2)} mm — check the loss figure and the boundary-layer ratio before committing.`);
    if (geo.spread > 2)
      w.push(`Open-area spread across cells is ${fmt(geo.spread, 1)}%. Reduce divider thickness, change ring counts, or accept unequal loading.`);
    if (geo.openTotal / geo.grossTotal < 0.85)
      w.push(`Dividers block ${fmt(100 * (1 - geo.openTotal / geo.grossTotal), 1)}% of the exit area — this is an added compression step at the throat.`);
    return w;
  }, [layoutInfo, mode, nestedOK, rings, hubDia, thickness, hornAngle, exitAngle, geo]);

  // ── exports ──
  const dl = (name, text, mime) => {
    const b = new Blob([text], { type: mime });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = name; a.click();
    URL.revokeObjectURL(u);
  };

  const buildDXF = () => {
    const L = [];
    const put = (code, val) => { L.push(String(code)); L.push(String(val)); };
    const layer = (n, col) => { put(0, "LAYER"); put(2, n); put(70, 0); put(62, col); put(6, "CONTINUOUS"); };
    put(0, "SECTION"); put(2, "TABLES");
    put(0, "TABLE"); put(2, "LAYER"); put(70, 4);
    layer("EXIT_OUTER", 7); layer("RING_DIV", 3); layer("RADIAL_DIV", 1); layer("HUB", 5);
    put(0, "ENDTAB"); put(0, "ENDSEC");
    put(0, "SECTION"); put(2, "ENTITIES");
    const circle = (r, lay) => { put(0, "CIRCLE"); put(8, lay); put(10, 0); put(20, 0); put(30, 0); put(40, r.toFixed(4)); };
    const line = (x1, y1, x2, y2, lay) => {
      put(0, "LINE"); put(8, lay);
      put(10, x1.toFixed(4)); put(20, y1.toFixed(4)); put(30, 0);
      put(11, x2.toFixed(4)); put(21, y2.toFixed(4)); put(31, 0);
    };
    circle(R, "EXIT_OUTER");
    if (hubR > 0) circle(hubR, "HUB");
    for (let j = 1; j < geo.k; j++) {
      const sides = geo.sidesAt(j);
      if (!sides) circle(geo.radii[j], "RING_DIV");
      else {
        for (let v = 0; v < sides; v++) {
          const a1 = rot + (TAU * v) / sides, a2 = rot + (TAU * (v + 1)) / sides;
          line(geo.radii[j] * Math.cos(a1), geo.radii[j] * Math.sin(a1),
               geo.radii[j] * Math.cos(a2), geo.radii[j] * Math.sin(a2), "RING_DIV");
        }
      }
    }
    for (let j = 0; j < geo.k; j++) {
      const n = rings[j];
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const phi = rot + (TAU * i) / n;
        const ri = rAtB(geo.radii[j], geo.sidesAt(j), phi, rot);
        const ro = rAtB(geo.radii[j + 1], geo.sidesAt(j + 1), phi, rot);
        line(ri * Math.cos(phi), ri * Math.sin(phi), ro * Math.cos(phi), ro * Math.sin(phi), "RADIAL_DIV");
      }
    }
    put(0, "ENDSEC"); put(0, "EOF");
    return L.join("\n");
  };

  const exportCSV = () => {
    const head = "cell,ring,phi_start_deg,phi_end_deg,r_in_mm,r_out_mm,area_mm2,open_area_mm2,diameter_mm,hydraulic_dia_mm,centroid_x_mm,centroid_y_mm\n";
    const rows = geo.cells.map((cc, i) =>
      [i + 1, cc.ring + 1, fmt(cc.phiA * R2D, 3), fmt(cc.phiB * R2D, 3),
       fmt(geo.radii[cc.ring], 3), fmt(geo.radii[cc.ring + 1], 3),
       fmt(cc.area, 3), fmt(cc.open, 3), fmt(cc.dia, 3), fmt(cc.dh, 3),
       fmt(cc.cen[0], 3), fmt(cc.cen[1], 3)].join(",")
    ).join("\n");
    dl(`cd_exit_${fmt(exitDia, 1)}mm_${N}cells.csv`, head + rows, "text/csv");
  };

  const exportSVG = () => {
    const pad = R * 0.12;
    const s = renderPlanSVG(true);
    dl(`cd_exit_${fmt(exitDia, 1)}mm_${N}cells.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}">${s}</svg>`,
      "image/svg+xml");
  };

  // ── plan view ──
  const cellPath = (cc) => {
    const p = cc.ptsIn.concat([...cc.ptsOut].reverse());
    return "M" + p.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(" L") + " Z";
  };

  const renderPlanSVG = (plain = false) => {
    const els = [];
    const strokeW = R * 0.006;
    geo.cells.forEach((cc, i) => {
      const tint = cc.ring % 2 === 0 ? C.amber : C.blue;
      els.push(`<path d="${cellPath(cc)}" fill="${plain ? "none" : tint + "16"}" stroke="${plain ? "#000" : C.textMuted}" stroke-width="${strokeW}"/>`);
    });
    els.push(`<circle cx="0" cy="0" r="${R}" fill="none" stroke="${plain ? "#000" : C.amber}" stroke-width="${strokeW * 2}"/>`);
    if (hubR > 0) els.push(`<circle cx="0" cy="0" r="${hubR}" fill="${plain ? "none" : C.textMuted + "60"}" stroke="${plain ? "#000" : C.textDim}" stroke-width="${strokeW}"/>`);
    return els.join("");
  };

  const planSVG = () => {
    const pad = R * 0.16;
    const vb = `${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}`;
    const sw = R * 0.006;
    const els = [];

    // cells
    geo.cells.forEach((cc, i) => {
      const tint = cc.ring % 2 === 0 ? C.amber : C.cyan;
      els.push(<path key={`c${i}`} d={cellPath(cc)} fill={tint + "14"} stroke="none" />);
    });

    // divider centrelines (or thickness bands)
    const divStroke = showThk ? thickness : sw * 1.4;
    for (let j = 1; j < geo.k; j++) {
      const sides = geo.sidesAt(j);
      const rj = geo.radii[j];
      if (!sides) {
        els.push(<circle key={`rb${j}`} cx={0} cy={0} r={rj} fill="none" stroke={C.violet} strokeWidth={divStroke} opacity={0.9} />);
      } else {
        const pts = [];
        for (let v = 0; v <= sides; v++) {
          const a = rot + (TAU * v) / sides;
          pts.push(`${(rj * Math.cos(a)).toFixed(3)},${(-rj * Math.sin(a)).toFixed(3)}`);
        }
        els.push(<polyline key={`rb${j}`} points={pts.join(" ")} fill="none" stroke={C.violet} strokeWidth={divStroke} opacity={0.9} strokeLinejoin="miter" />);
      }
    }
    for (let j = 0; j < geo.k; j++) {
      const n = rings[j];
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const phi = rot + (TAU * i) / n;
        const ri = rAtB(geo.radii[j], geo.sidesAt(j), phi, rot);
        const ro = rAtB(geo.radii[j + 1], geo.sidesAt(j + 1), phi, rot);
        els.push(<line key={`sp${j}_${i}`}
          x1={ri * Math.cos(phi)} y1={-ri * Math.sin(phi)}
          x2={ro * Math.cos(phi)} y2={-ro * Math.sin(phi)}
          stroke={C.green} strokeWidth={divStroke} opacity={0.9} strokeLinecap="butt" />);
      }
    }

    els.push(<circle key="outer" cx={0} cy={0} r={R} fill="none" stroke={C.amber} strokeWidth={sw * 2.2} />);
    if (hubR > 0) els.push(<circle key="hub" cx={0} cy={0} r={hubR} fill={C.textMuted + "55"} stroke={C.textDim} strokeWidth={sw} />);

    // axes
    els.push(<line key="ax" x1={-R * 1.1} y1={0} x2={R * 1.1} y2={0} stroke={C.red} strokeWidth={sw * 0.7} opacity={0.35} strokeDasharray={`${R * 0.03} ${R * 0.02}`} />);
    els.push(<line key="ay" x1={0} y1={-R * 1.1} x2={0} y2={R * 1.1} stroke={C.red} strokeWidth={sw * 0.7} opacity={0.35} strokeDasharray={`${R * 0.03} ${R * 0.02}`} />);

    if (showLabels)
      geo.cells.forEach((cc, i) => {
        els.push(<text key={`t${i}`} x={cc.cen[0]} y={-cc.cen[1]} fill={C.text} fontSize={R * 0.075}
          fontFamily={C.mono} textAnchor="middle" dominantBaseline="middle" opacity={0.8}>{i + 1}</text>);
      });

    return (
      <svg viewBox={vb} width="100%" style={{ display: "block", maxHeight: 480 }}>
        {els}
      </svg>
    );
  };

  // ── side view (downstream projection) ──
  const sideSVG = () => {
    const Ld = dividerLen;
    const tanE = Math.tan(exitAngle * D2R);
    const Rend = R + Ld * tanE;
    const W = 760, H = 300, pl = 40, pr = 150, pt = 20, pb = 30;
    const sx = (W - pl - pr) / Math.max(Ld, 1);
    const sy = (H - pt - pb) / (2 * Rend * 1.1);
    const s = Math.min(sx, sy);
    const X = (z) => pl + z * s;
    const Y = (r) => pt + (H - pt - pb) / 2 - r * s;
    const els = [];
    els.push(<line key="ax" x1={X(0)} y1={Y(0)} x2={X(Ld)} y2={Y(0)} stroke={C.red} strokeWidth={1.2} opacity={0.5} strokeDasharray="6 4" />);
    // horn wall
    els.push(<line key="w1" x1={X(0)} y1={Y(R)} x2={X(Ld)} y2={Y(Rend)} stroke={C.amber} strokeWidth={2.4} />);
    els.push(<line key="w2" x1={X(0)} y1={Y(-R)} x2={X(Ld)} y2={Y(-Rend)} stroke={C.amber} strokeWidth={2.4} />);
    els.push(<line key="ep" x1={X(0)} y1={Y(R)} x2={X(0)} y2={Y(-R)} stroke={C.amber} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />);
    // ring divider cones (self-similar: theta_j = atan(rho * tan theta))
    for (let j = 1; j < geo.k; j++) {
      const rho = geo.radii[j] / R;
      const rEnd = geo.radii[j] + Ld * rho * tanE;
      els.push(<line key={`d${j}a`} x1={X(0)} y1={Y(geo.radii[j])} x2={X(Ld)} y2={Y(rEnd)} stroke={C.violet} strokeWidth={Math.max(thickness * s, 1.4)} opacity={0.9} />);
      els.push(<line key={`d${j}b`} x1={X(0)} y1={Y(-geo.radii[j])} x2={X(Ld)} y2={Y(-rEnd)} stroke={C.violet} strokeWidth={Math.max(thickness * s, 1.4)} opacity={0.9} />);
    }
    if (hubR > 0) {
      const rho = hubR / R, rEnd = hubR + Ld * rho * tanE;
      els.push(<polygon key="hub" points={`${X(0)},${Y(hubR)} ${X(Ld)},${Y(rEnd)} ${X(Ld)},${Y(-rEnd)} ${X(0)},${Y(-hubR)}`} fill={C.textMuted + "55"} stroke={C.textDim} strokeWidth={1} />);
    }
    // annotations
    const ann = [
      [`exit ⌀ ${fmt(exitDia, 1)} mm`, C.amber],
      [`half-angle ${fmt(exitAngle, 1)}° (full ${fmt(2 * exitAngle, 1)}°)`, C.amber],
      [`virtual apex ${fmt(R / Math.max(tanE, 1e-6), 0)} mm behind`, C.textDim],
      [`divider run ${fmt(Ld, 0)} mm`, C.violet],
      [`⌀ at run end ${fmt(2 * Rend, 1)} mm`, C.cyan],
      [`wavefront area factor ${fmt(2 / (1 + Math.cos(exitAngle * D2R)), 4)}`, C.textDim],
    ];
    ann.forEach(([txt, col], i) =>
      els.push(<text key={`an${i}`} x={W - pr + 8} y={pt + 14 + i * 15} fill={col} fontSize={10} fontFamily={C.mono}>{txt}</text>));
    return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>{els}</svg>;
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };

  const presets = [
    ["1\u2033", 25.4], ["1.4\u2033", 35.5], ["1.5\u2033", 38.1],
    ["2\u2033", 50.8], ["3\u2033", 76.2],
  ];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.amber, margin: 0, letterSpacing: "0.05em" }}>
          CD EXIT — EQUAL-AREA CELL DIVISION
        </h1>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          Concentric-ring partitions · equal open area · layout chosen to maximise the guaranteed HOM-free band
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ ...card, border: `1px solid ${C.red}`, background: C.red + "10" }}>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 3 }}>⚠ {w}</div>)}
        </div>
      )}

      {/* DRIVER */}
      <div style={card}>
        <div style={secTitle}>Driver exit</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
              {presets.map(([l, v]) => (
                <button key={l} onClick={() => setExitDia(v)} style={btn(Math.abs(exitDia - v) < 0.05, C.amber)}>{l}</button>
              ))}
            </div>
            <NumInput label="Exit diameter" value={exitDia} onChange={setExitDia} unit="mm" min={5} max={200} step={0.1} accent={C.amber} />
          </div>
          <NumInput label="Exit half-angle" value={exitAngle} onChange={setExitAngle} unit="°" min={0} max={45} step={0.5} />
          <NumInput label="Horn initial half-angle" value={hornAngle} onChange={setHornAngle} unit="°" min={0} max={90} step={0.5} />
          <NumInput label="Divider run length" value={dividerLen} onChange={setDividerLen} unit="mm" min={1} max={400} step={1} accent={C.violet} />
          <NumInput label="Temperature" value={temperature} onChange={setTemperature} unit="°C" min={-20} max={60} step={1} />
        </div>
      </div>

      {/* DIVISION */}
      <div style={card}>
        <div style={secTitle}>Division</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <NumInput label="Cells N" value={nCells} onChange={(v) => setNCells(Math.round(v))} min={2} max={64} step={1} accent={C.green} />
          <NumInput label="Divider thickness" value={thickness} onChange={setThickness} unit="mm" min={0} max={6} step={0.1} accent={C.violet} />
          <NumInput label="Central hub ⌀" value={hubDia} onChange={setHubDia} unit="mm" min={0} max={exitDia * 0.8} step={0.5} />
          <NumInput label="Rotation offset" value={rotDeg} onChange={setRotDeg} unit="°" min={-180} max={180} step={1} />
          <div>
            <label style={sLabel}>Ring layout</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {[["auto", "Auto"], ["sectors", "Sectors"], ["rings", "Rings"], ["custom", "Custom"]].map(([v, l]) => (
                <button key={v} onClick={() => setScheme(v)} style={btn(scheme === v, C.green)}>{l}</button>
              ))}
            </div>
            {scheme === "custom" ? (
              <input value={customSpec} onChange={(e) => setCustomSpec(e.target.value)}
                placeholder="1,6,12" style={{ ...sInput, fontSize: 12 }} />
            ) : (
              <div style={{ fontSize: 11, color: C.cyan, fontFamily: C.mono, padding: "5px 0" }}>
                {rings.join(" + ")} = {N}
              </div>
            )}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Ring boundary</span>
            <button onClick={() => setMode("chord")} style={btn(mode === "chord", C.violet)}>Chord (flat plate)</button>
            <button onClick={() => setMode("arc")} style={btn(mode === "arc", C.violet)}>Arc (cone)</button>
          </div>
          {[["Nested ring counts (continuous radial plates)", nested, setNested],
            ["Equalise open area (accounts for divider thickness)", equalize, setEqualize],
            ["Draw divider thickness", showThk, setShowThk],
            ["Cell numbers", showLabels, setShowLabels],
            ["Side view", showSide, setShowSide]].map(([l, v, set], i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} style={{ accentColor: C.green }} />
              <span style={{ color: C.textDim }}>{l}</span>
            </label>
          ))}
        </div>
      </div>

      {/* PLAN */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={secTitle}>Exit plane · looking into the driver</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => dl(`cd_exit_${fmt(exitDia, 1)}mm_${N}cells.dxf`, buildDXF(), "application/dxf")}
              style={{ ...btn(false, C.blue), color: C.blue, borderColor: C.border, fontSize: 11, padding: "4px 10px" }}>Export DXF</button>
            <button onClick={exportSVG} style={{ ...btn(false, C.blue), color: C.blue, borderColor: C.border, fontSize: 11, padding: "4px 10px" }}>Export SVG</button>
            <button onClick={exportCSV} style={{ ...btn(false, C.blue), color: C.blue, borderColor: C.border, fontSize: 11, padding: "4px 10px" }}>Export CSV</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 260px", gap: 16, alignItems: "start" }}>
          {planSVG()}
          <div style={{ fontFamily: C.mono, fontSize: 11, lineHeight: 1.8 }}>
            <div style={{ color: C.textDim, marginBottom: 6 }}>RING RADII (mm, to the divider centreline)</div>
            {geo.radii.map((r, i) => (
              <div key={i} style={{ color: i === 0 || i === geo.k ? C.amber : C.violet }}>
                {i === 0 ? "hub  " : i === geo.k ? "wall " : `r${i}   `} {fmt(r, 3)}
                {i > 0 && i < geo.k && mode === "chord" && (
                  <span style={{ color: C.textMuted }}> · {rings[i]}-gon circumradius</span>
                )}
              </div>
            ))}
            <div style={{ color: C.textDim, margin: "10px 0 6px" }}>DOWNSTREAM DIVIDER ANGLES</div>
            <div style={{ color: C.green }}>radial: planar, contains the axis</div>
            {geo.radii.slice(1, geo.k).map((r, i) => (
              <div key={i} style={{ color: C.violet }}>
                r{i + 1} cone half-angle {fmt(Math.atan((r / R) * Math.tan(exitAngle * D2R)) * R2D, 2)}°
              </div>
            ))}
            <div style={{ color: C.textMuted, marginTop: 6, fontSize: 10, lineHeight: 1.5 }}>
              All ring-divider cones share the exit cone's virtual apex, {fmt(R / Math.max(Math.tan(exitAngle * D2R), 1e-6), 0)} mm behind the exit plane. That is what keeps the area split constant along the run.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.amber }}>━ Exit wall</span>
          <span style={{ fontSize: 10, color: C.violet }}>━ Ring dividers</span>
          <span style={{ fontSize: 10, color: C.green }}>━ Radial dividers</span>
          <span style={{ fontSize: 10, color: C.textDim }}>▮ Hub</span>
        </div>
      </div>

      {/* SIDE */}
      {showSide && (
        <div style={card}>
          <div style={secTitle}>Longitudinal section · divider run</div>
          {sideSVG()}
        </div>
      )}

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Cells", value: `${N}`, sub: rings.join(" + ") },
          { label: "Open area / cell", value: `${fmt(geo.openMean, 2)} mm²`, sub: `gross ${fmt(geo.areaMean, 2)} mm²` },
          { label: "Open-area spread", value: `${fmt(geo.spread, 2)}%`, sub: geo.spread < 1 ? "✓ within 1%" : "check ring counts", color: geo.spread < 1 ? C.green : C.amber },
          { label: "Divider blockage", value: `${fmt(100 * (1 - geo.openTotal / geo.grossTotal), 1)}%`, sub: `open ${fmt(geo.openTotal / 100, 2)} cm²` },
          { label: "Largest cell ⌀", value: `${fmt(geo.diaMax, 2)} mm`, sub: `ceiling ${fmt(dCeiling, 2)} mm (${fmt((geo.diaMax / dCeiling - 1) * 100, 0)}% off)` },
          { label: "Guaranteed HOM-free", value: `≥ ${fmt(fCells / 1000, 2)} kHz`, sub: "c/(2·d_max), convex cells", color: C.green },
          { label: "Undivided exit", value: `${fmt(fUndividedExact / 1000, 2)} kHz`, sub: `exact (1,0) mode · bound ${fmt(fUndividedBound / 1000, 2)}`, color: C.textDim },
          { label: "Gain vs undivided", value: `${fmt(fCells / fUndividedBound, 2)}×`, sub: `ceiling for N=${N} is ${fmt(fCeiling / fUndividedBound, 2)}×` },
          { label: "Min hydraulic ⌀", value: `${fmt(geo.dhMin, 2)} mm`, sub: `boundary layer ${fmt(deltaV, 3)} mm`, color: geo.dhMin > 3 ? C.text : C.amber },
          { label: "Loss over run", value: `${fmt(lossDb, 2)} dB`, sub: `at ${fmt(fCells / 1000, 1)} kHz, ${fmt(dividerLen, 0)} mm`, color: lossDb < 0.5 ? C.text : C.amber },
          { label: "Speed of sound", value: `${fmt(c, 1)} m/s`, sub: `at ${temperature}°C` },
          { label: "Wavefront correction", value: `${fmt(2 / (1 + Math.cos(exitAngle * D2R)), 4)}`, sub: "spherical / planar area" },
        ].map((it, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>{it.label}</div>
            <div style={{ fontSize: 15, fontFamily: C.mono, fontWeight: 600, color: it.color || C.text }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{it.sub}</div>}
          </div>
        ))}
      </div>

      {/* SCHEME COMPARISON */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={secTitle}>Division schemes at N = {N} · ranked by guaranteed HOM-free limit</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
          <thead><tr>{["Scheme", "Rings", "Largest cell ⌀ (mm)", "f ≥ (kHz)", "vs undivided"].map((h) => (
            <th key={h} style={{ textAlign: "right", padding: "6px 12px", borderBottom: `1px solid ${C.borderLight}`, color: C.textDim, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {compare.map((r, i) => (
              <tr key={i} style={{ background: i % 2 ? C.bg + "60" : "transparent" }}>
                <td style={{ textAlign: "left", padding: "4px 12px", color: C.text }}>{r.name}</td>
                <td style={{ textAlign: "right", padding: "4px 12px", color: C.cyan }}>{r.parts}</td>
                <td style={{ textAlign: "right", padding: "4px 12px", color: C.text }}>{fmt(r.d, 2)}</td>
                <td style={{ textAlign: "right", padding: "4px 12px", color: C.green }}>{fmt(r.f / 1000, 2)}</td>
                <td style={{ textAlign: "right", padding: "4px 12px", color: C.textDim }}>{fmt(r.f / fUndividedBound, 2)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CELL TABLE */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={secTitle}>Cells · {N} total</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 320 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
            <thead><tr>{["#", "Ring", "φ start (°)", "φ end (°)", "r in", "r out", "Gross (mm²)", "Open (mm²)", "⌀ (mm)", "d_h (mm)", "centroid r (mm)"].map((h) => (
              <th key={h} style={{ textAlign: "right", padding: "6px 10px", borderBottom: `1px solid ${C.borderLight}`, color: C.textDim, fontSize: 10, fontWeight: 500, position: "sticky", top: 0, background: C.surface, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {geo.cells.map((cc, i) => (
                <tr key={i} style={{ background: i % 2 ? C.bg + "60" : "transparent" }}>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.textDim }}>{i + 1}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.cyan }}>{cc.ring + 1}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.text }}>{fmt(cc.phiA * R2D, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.text }}>{fmt(cc.phiB * R2D, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.violet }}>{fmt(geo.radii[cc.ring], 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.violet }}>{fmt(geo.radii[cc.ring + 1], 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.text }}>{fmt(cc.area, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.amber }}>{fmt(cc.open, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.text }}>{fmt(cc.dia, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.textDim }}>{fmt(cc.dh, 2)}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: C.textDim }}>{fmt(Math.hypot(cc.cen[0], cc.cen[1]), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTES */}
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, padding: "0 4px", fontFamily: C.sans }}>
        <strong style={{ color: C.textDim }}>What the HOM number means</strong> · For a convex duct cross-section of diameter d, the Payne–Weinberger inequality (1960) bounds the first non-zero Neumann eigenvalue as μ₁ ≥ π²/d², so no transverse mode can propagate below f = c/(2d). The bound is sharp only in the thin-slot limit; real compact cells cut on 15–40% higher (a circle at 1.17×, an equilateral triangle at 1.33×, a square at 1.41×). The tool reports the guaranteed floor, not the actual cutoff, so the real figure is better than shown. In chord mode every cell is convex and the bound applies. In arc mode the inner boundary curves into the cell, the cell is not convex, and the bound is indicative only.
        <br />
        <strong style={{ color: C.textDim }}>Why sector division saturates</strong> · A pie slice always spans the full radius, so once N ≥ 6 its diameter is fixed at R no matter how many more cuts you add. Splitting radially as well as circumferentially is the only way to keep shrinking the largest cell; the optimiser searches ring compositions for the minimum. The unbeatable ceiling is d ≥ 2R/√N (isodiametric inequality — only circles reach it, and circles do not tile), so a good layout lands 25–35% above it.
        <br />
        <strong style={{ color: C.textDim }}>Equal area is not equal loading</strong> · Equal open area gives equal volume velocity per cell only if the exit-plane pressure is uniform and every cell sees the same downstream impedance. Neither is guaranteed: the phase plug imposes its own annular or radial channel structure on the exit, and cells at different radii see different downstream geometry once the horn starts to bend or flatten. Use the rotation offset to land dividers between phase-plug channels rather than across them.
        <br />
        <strong style={{ color: C.textDim }}>Subdivision defers, it does not delete</strong> · Dividers raise the cutoff only over the length they exist. Where they end, the cells recombine and the array of cell mouths becomes a discrete source distribution — pitch greater than λ/2 there reintroduces exactly the lobing that killed classic multicell horns. Keep the run short relative to the wavelength at the top of the band, taper the trailing edges, and treat the recombination plane as the new critical section.
        <br />
        <strong style={{ color: C.textDim }}>Assumptions in this build</strong> · Open-area correction is first order (t/2 per shared edge, corner overlaps ignored). The equal-area solver assumes congruent cells within a ring; when ring counts are not nested the tool computes each cell separately and reports the spread instead of hiding it. The optimiser ranks layouts with arc-mode analytic radii, then the selected mode is solved exactly. Areas are exit-plane, not spherical-wavefront. Thermoviscous loss uses the wide-tube approximation and is only meaningful while d_h is much larger than the quoted boundary-layer thickness.
        <br />
        <strong style={{ color: C.textDim }}>DXF output</strong> · Zero-thickness centrelines on four layers (EXIT_OUTER, RING_DIV, RADIAL_DIV, HUB), in millimetres, origin on the axis. Offset by half the divider thickness in CAD; the radii already account for thickness when open-area equalisation is on.
      </div>
    </div>
  );
}
