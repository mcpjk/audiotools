import React, { useState, useMemo, useEffect, useRef } from "react";
import { C, SERIES } from "./palette.js";
import * as G from "./hgrid-model.js";

// ═══════════════════════════════════════════════════════════════════════════
// H-GRID THROAT PARTITION
// ═══════════════════════════════════════════════════════════════════════════
//
// Companion to the CD exit cell divider. That tool partitions a round exit
// into concentric rings; this one partitions it into a structured ROW-AND-
// COLUMN grid of exactly equal open area, so the throat cells can be lofted
// one-for-one to the cells of a rectangular mouth grid.
//
// All of the geometry, the equal-area solve and the acoustic model live in
// src/hgrid-model.js, which carries the long note on what is exact and what is
// estimated. It is a plain module with no React and no colour so that
// `npm run test:hgrid` can check it against closed forms under node — this
// tool has enough physics, and enough closed forms to check it against, that
// "it compiles" is not evidence of anything.
//
// GRID LINES ARE THE PRIMITIVE. Each latitude and longitude line is one
// continuous curve with its own low-order Chebyshev shape coefficients, and
// equal cell area is reached by solving on those coefficients. A node is just
// where two lines cross.
//
// SLIDERS ARE REQUESTS, NOT SETTINGS. Moving a bow slider states a wish; the
// solver returns the nearest parameter vector that still has equal areas. This
// file shows requested against achieved for every parameter and never quietly
// moves a slider the user set.
//
// THE ONE THING TO KEEP IN MIND WHILE READING THE NUMBERS
//   An equal-area map cannot also be conformal unless it is a rigid motion.
//   The residual cell aspect ratios are the mandatory price of holding the
//   areas equal, not a solver deficiency. Cells are as square as an equal-area
//   partition of a disc into a rectangular index permits, and no squarer.
//
// ═══════════════════════════════════════════════════════════════════════════

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const fmt = (v, d = 1) => {
  if (v == null || !isFinite(v)) return "—";
  if (v !== 0 && Math.abs(v) < 1e-4) return "0";
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(d, 1));
  if (Math.abs(v) >= 1) return v.toFixed(d);
  return v.toPrecision(3);
};

// ── a sequential ramp, endpoints taken from the palette ────────────────────
// Anything that mixes colour numerically has to derive its endpoints from C,
// never hold its own RGB — see the note in CLAUDE.md about the aperture tool.
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rampAt = (u) => {
  const a = hex2rgb(C.series3), b = hex2rgb(C.series1);
  const k = Math.max(0, Math.min(1, u));
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// ── UI primitives, matching the other tools ────────────────────────────────
const sInput = {
  background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.ink, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = {
  fontSize: 11, color: C.inkDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};
const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
const secTitle = { fontSize: 11, fontWeight: 600, color: C.inkDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
const btn = (active, col) => ({
  background: active ? col + "20" : "transparent",
  border: `1px solid ${active ? col : C.border}`,
  borderRadius: 3, color: active ? col : C.inkDim, fontSize: 10,
  padding: "3px 9px", cursor: "pointer", fontFamily: C.mono,
});

function NumInput({ label, value, onChange, unit, min, max, step: s = 1, accent, disabled }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const p = parseFloat(local);
    if (!isNaN(p)) onChange(Math.min(Math.max(p, min ?? -Infinity), max ?? Infinity));
    else setLocal(String(value));
  };
  return (
    <div style={{ marginBottom: 10, opacity: disabled ? 0.45 : 1 }}>
      <label style={sLabel}>{label} {unit && <span style={{ color: C.inkMuted }}>({unit})</span>}</label>
      <input type="number" value={local} min={min} max={max} step={s} disabled={disabled}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step, hint, disabled, col }) {
  return (
    <div style={{ marginBottom: 8, opacity: disabled ? 0.4 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ ...sLabel, marginBottom: 1 }}>{label}</label>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: col || C.accent }}>{value.toFixed(3)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: col || C.accent, margin: 0 }} />
      {hint && <div style={{ fontSize: 10, color: C.inkMuted, lineHeight: 1.35, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

const Metric = ({ label, value, sub, color }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
    <div style={{ fontSize: 10, color: C.inkDim, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 15, fontFamily: C.mono, fontWeight: 600, color: color || C.ink }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 1 }}>{sub}</div>}
  </div>
);

const dl = (name, text, mime) => {
  const b = new Blob([text], { type: mime });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
};

const ORDER_HINT = [
  "how much the line bows",
  "where the bow concentrates — mid-line against toward the rim",
  "finer structure, rarely needed",
];

const SEED_NOTE = {
  elliptical: "Closed form and fast. Its own corners sit at 45°, so the displacement needed to honour α is carried inward by a transfinite blend.",
  conformal: "Schwarz–Christoffel. Angle-preserving, so cells start locally square — the best shapes available, with the wrong areas. Its corners ARE the prevertices, so it honours any α exactly. Several times slower to solve.",
};

// The equal-area solve is deferred off the render pass so this can actually
// paint; without that a spinner would be frozen for exactly as long as it was
// needed. Keyframes live in a <style> tag because the tools carry no CSS file.
const SPIN_CSS = "@keyframes hgSpin{to{transform:rotate(360deg)}}";

function Solving({ label = "solving" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: C.mono, fontSize: 10, color: C.accent, whiteSpace: "nowrap" }}>
      <span style={{
        width: 9, height: 9, borderRadius: "50%", display: "inline-block", boxSizing: "border-box",
        border: `1.5px solid ${C.border}`, borderTopColor: C.accent, animation: "hgSpin 0.7s linear infinite", willChange: "transform",
      }} />
      {label}
    </span>
  );
}

export default function HGridThroat() {
  // ── driver ──
  const [exitDia, setExitDia] = useState(35.5);
  const [exitAngle, setExitAngle] = useState(8);
  const [temperature, setTemperature] = useState(30);
  const [thickness, setThickness] = useState(0.8);
  const [process, setProcess] = useState("FDM");

  // ── topology ──
  const [family, setFamily] = useState("hgrid");
  const [nc, setNc] = useState(6);
  const [nr, setNr] = useState(3);
  const [ringSpec, setRingSpec] = useState("1,6,12");
  const [bm, setBm] = useState(2);
  const [bp, setBp] = useState(2);
  const [seed, setSeed] = useState("elliptical");

  // ── line shapes ──
  const [shapeOrder, setShapeOrder] = useState(2); // m
  const [symmetric, setSymmetric] = useState(true);
  const [request, setRequest] = useState(null);    // p_requested, or null for nominal

  // ── mouth ──
  const [mouthW, setMouthW] = useState(200);
  const [mouthH, setMouthH] = useState(100);
  const [apex, setApex] = useState(120);
  const [depth, setDepth] = useState(150);
  const [flatten, setFlatten] = useState(1);
  const [tight, setTight] = useState(0.55);
  const [fTarget, setFTarget] = useState(20000);
  const [dividerEndFrac, setDividerEndFrac] = useState(0.35);
  const [stations, setStations] = useState(16);

  // ── optimiser ──
  const [wAspect, setWAspect] = useState(0.6);
  const [wTwist, setWTwist] = useState(0);
  const [wCorrection, setWCorrection] = useState(0.5);
  const [maxEval, setMaxEval] = useState(160);
  const [optState, setOptState] = useState(null);
  const [running, setRunning] = useState(false);

  const [hover, setHover] = useState(null);
  const [hoverSide, setHoverSide] = useState("right");
  const [showLabels, setShowLabels] = useState(true);
  const busy = useRef(false);

  const c = useMemo(() => 331.3 * Math.sqrt(1 + temperature / 273.15), [temperature]);
  const R = exitDia / 2;
  const rings = useMemo(
    () => ringSpec.split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n > 0),
    [ringSpec]
  );
  // ── line-shape configuration and the requested parameter vector ──
  const cfg = useMemo(
    () => G.lineGridConfig({ nc, nr, m: shapeOrder, symmetric }),
    [nc, nr, shapeOrder, symmetric]
  );
  const labels = useMemo(() => G.paramLabels(cfg), [cfg]);
  const nominal = useMemo(() => G.nominalParams(cfg), [cfg]);
  // the request resets whenever the shape space itself changes
  const pReq = request && request.length === cfg.nParams ? request : nominal;
  useEffect(() => { setRequest(null); }, [cfg]);

  // The seed object is kept across solves so the conformal map's warm start
  // survives; only the corner angle moves inside it.
  const seedObj = useMemo(() => G.makeSeed(seed, R, pReq[cfg.alphaAt]), [seed, R, cfg]);
  const lastP = useRef(null);

  // The equal-area solve costs 0.1-1 s and used to run inside the render pass,
  // which meant the browser could not paint anything — not even a "solving"
  // mark — until it returned. So the inputs are gathered here and the build is
  // deferred to a timeout: the previous grid stays on screen, dimmed, with
  // `computing` set, until the new one is ready. The cleanup also coalesces a
  // slider drag, so only the last request in a burst is ever solved.
  const layoutInput = useMemo(() => ({
    family, R, nc, nr, m: shapeOrder, symmetric,
    params: pReq, seed, seedObj,
    rings: rings.length ? rings : [1, 6, 12], bm, bp,
    t: thickness, c, nParams: cfg.nParams,
  }), [family, R, nc, nr, shapeOrder, symmetric, pReq, seed, seedObj, ringSpec, bm, bp, thickness, c, cfg]);

  const buildFrom = (inp) => {
    const L = G.buildLayout({
      ...inp,
      pStart: lastP.current && lastP.current.length === inp.nParams ? lastP.current : null,
    });
    if (L.solve && L.solve.p) lastP.current = L.solve.p;
    return L;
  };

  // The first build is synchronous: there is nothing to keep on screen yet, so
  // deferring it would only show an empty frame.
  const [layout, setLayout] = useState(() => buildFrom(layoutInput));
  const [computing, setComputing] = useState(false);
  const builtFor = useRef(layoutInput);

  useEffect(() => {
    if (builtFor.current === layoutInput) return;
    setComputing(true);
    const id = setTimeout(() => {
      builtFor.current = layoutInput;
      setLayout(buildFrom(layoutInput));
      setComputing(false);
    }, 30);
    return () => clearTimeout(id);
  }, [layoutInput]);

  const throat = layout.throat;
  const solve = layout.solve;
  // While a build is deferred, cfg can already describe a different parameter
  // vector than the layout on screen, so the achieved vector is read only when
  // the two agree — otherwise the request stands in for one frame.
  const pOut = solve.p && solve.p.length === cfg.nParams ? solve.p : pReq;
  // Where the number of cells meeting is not four. For the H-grid these are the
  // four corners of the reference square, wherever the seed map puts them.
  const singular = useMemo(() => {
    if (layout.family === "hgrid" && layout.seedObj)
      return [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]) => layout.seedObj.map(u, v));
    if (layout.mesh) return layout.mesh.singular.map((ni) => G.nodeXY(layout.mesh, ni));
    return [];
  }, [layout]);
  const alphaEff = family === "hgrid" && solve.p ? pOut[cfg.alphaAt] * R2D : 45;

  const map = useMemo(() => G.mapThroatToMouth(throat, {
    c, nc, nr, R, rectangular: layout.rectangular,
    mouthW, mouthH, apex, depth, flatten, exitHalfAngle: exitAngle,
    tight, fTarget, dividerEndFrac, stations, keepGeometry: true,
    wallWidthAt: mouthW / nc,
  }), [layout, throat, c, nc, nr, R, mouthW, mouthH, apex, depth, flatten, exitAngle, tight, fTarget, dividerEndFrac, stations]);

  const fab = useMemo(() => G.fabrication({
    throat, t: thickness, R, c, f: Math.min(throat.f1min, fTarget), process,
  }), [throat, thickness, R, c, fTarget, process]);

  // ── objective, live ──
  const obj = useMemo(
    () => G.objective(throat, map, {
      wAspect, wTwist, wCorrection,
      correction: solve.correction || 0, infeasible: !solve.converged,
    }),
    [throat, map, wAspect, wTwist, wCorrection, solve]
  );

  // ── optimiser ──────────────────────────────────────────────────────────────
  // ── optimiser ─────────────────────────────────────────────────────────────
  // The search space is now the 7-13 line parameters, alpha among them, so
  // Nelder-Mead on the whole vector is enough — no outer scan is needed, and
  // every candidate goes through the equal-area solve before f1 is looked at.
  const runOptimiser = () => {
    if (busy.current || family !== "hgrid") return;
    busy.current = true;
    setRunning(true);
    setTimeout(() => {
      const t0 = Date.now();
      let evals = 0, warm = solve.p ? solve.p.slice() : null;
      const evalAt = (x) => {
        const q = x.slice();
        q[cfg.alphaAt] = Math.min(85 * D2R, Math.max(5 * D2R, q[cfg.alphaAt]));
        // Cheaper quadrature and no continuation fallback while RANKING
        // candidates; the winner is re-solved at full order by the pipeline
        // before anything is drawn or exported, so nothing reported is ever a
        // reduced-order number.
        const sol = G.solveEqualArea(cfg, q, {
          R, seed: seedObj, pStart: warm, t: thickness,
          tol: 1e-9, maxIter: 40, maxGeom: 240, gl: 10, continuation: false,
        });
        evals++;
        if (sol.converged) warm = sol.p;
        const cells = G.lineGridCells(sol.geometry, { c, t: thickness, per: 8 });
        const th = G.analyseThroat(cells, { c, R, dividerTotal: G.lineGridDividerLength(sol.geometry) });
        const mp = wTwist > 0 ? G.mapThroatToMouth(th, {
          c, nc, nr, R, rectangular: true, mouthW, mouthH, apex, depth, flatten,
          exitHalfAngle: exitAngle, tight, fTarget, samples: 16, stations: 6, wallWidthAt: mouthW / nc,
        }) : null;
        return G.objective(th, mp, {
          wAspect, wTwist, wCorrection,
          correction: sol.correction, infeasible: !sol.converged,
        }).J;
      };
      const res = G.nelderMead(evalAt, pReq.slice(), { maxEval, step: 0.06 });
      const best = res.x.slice();
      best[cfg.alphaAt] = Math.min(85 * D2R, Math.max(5 * D2R, best[cfg.alphaAt]));
      setRequest(best);
      setOptState({ J: res.f, evals, ms: Date.now() - t0 });
      setRunning(false);
      busy.current = false;
    }, 30);
  };

  // ── warnings ───────────────────────────────────────────────────────────────
  const warnings = useMemo(() => {
    const w = [];
    // The feasibility message is the solver's own, and it names the binding
    // constraint. It is the one warning that must never be softened: whole-line
    // curvature genuinely cannot always reach equal area.
    if (!solve.converged && solve.reason)
      w.push(`No equal-area grid for this request. ${solve.reason}${
        solve.reachedFraction != null
          ? ` The grid shown is the furthest point along the request that does have equal areas — ${fmt(solve.reachedFraction * 100, 0)}% of the way there.`
          : ""}`);
    else if (throat.spread > 1e-4)
      w.push(`Open-area spread is ${fmt(throat.spread, 3)}% — the solve did not reach equal areas here. Raise the shape order m, or ease the request.`);
    if (throat.blockage > 0.12)
      w.push(`Dividers block ${fmt(throat.blockage * 100, 1)}% of the exit. That is an unintended compression step: the shell has to grow to ⌀${fmt(fab.dShell, 2)} mm to give the area back.`);
    if (thickness > 0 && thickness < fab.tMin)
      w.push(`${fab.process.label} needs at least ${fab.tMin} mm of wall; ${fmt(thickness, 2)} mm will not print reliably.`);
    if (map && map.band !== "ok")
      w.push(`Path-length spread ΔL = ${fmt(map.dL, 2)} mm is λ/${fmt(map.lambda / map.dL, 1)} at ${fmt(fTarget / 1000, 1)} kHz — ${map.band === "warn" ? "inside λ/4 but past λ/8" : "past λ/4"}. Padding can only lengthen the short cells; the longest cell sets the budget.`);
    if (map && map.turnMax > map.turnLimitDeg)
      w.push(`Largest total turning angle is ${fmt(map.turnMax, 1)}° against a ${fmt(map.turnLimitDeg, 1)}° limit (w·θ < λ/8 at ${fmt(mouthW / nc, 0)} mm cell width). A symmetric S-bend is wall-length balanced; a single bend is not.`);
    if (map && map.aimMax > map.aimLimitDeg)
      w.push(`Aim error reaches ${fmt(map.aimMax, 1)}° against a ${fmt(map.aimLimitDeg, 1)}° tangency tolerance. Shape the aperture surface from the directivity requirement first — a surface chosen for routing radiates its own curvature error phase-coherently and no EQ removes it.`);
    if (family === "hgrid" && solve.converged && solve.monotone && solve.monotone.gap < 0.02)
      w.push(`Two grid lines come within ${solve.monotone.gap.toExponential(2)} of each other in parameter space — the areas are equal but a cell is pinched to nearly nothing there, which will not print and will not behave like a duct. Ease the bow, raise the shape order m, or move the corner angle.`);
    if (throat.curvatureFlagged)
      w.push(`${throat.curvatureFlagged} cell(s) have edge curvature strong relative to their own short dimension. The flat-rectangle first-mode model errs as O((L/r_curv)²) with the sign not established — verify these in ABEC.`);
    if (map && map.rows.some((r) => r.runNeeded && r.straightAvail < r.runNeeded))
      w.push(`Some cells have less straight run before the trailing edge than the three evanescent decay lengths they need. Below cut-on the field decays as exp(−α x) with α = (2π/c)·√(f1²−f²); a bend inside that distance re-excites what the duct just suppressed.`);
    if (family !== "hgrid")
      w.push(`${family === "ogrid" ? "An O-grid" : "A butterfly"} throat has no cell-for-cell match to a rectangular mouth grid — that is a property of its topology, not a gap in the tool. The mouth mapping below is inactive; the throat metrics are still valid and comparable at equal N.`);
    return w;
  }, [solve, throat, family, alphaEff, nc, nr, thickness, fab, map, fTarget, mouthW]);

  // ── exports ────────────────────────────────────────────────────────────────
  const stem = `hgrid_${fmt(exitDia, 1)}mm_${family === "hgrid" ? `${nc}x${nr}` : family}_${throat.N}cells`;

  const buildDXF = () => {
    const L = [];
    const put = (k, v) => { L.push(String(k)); L.push(String(v)); };
    put(0, "SECTION"); put(2, "ENTITIES");
    const poly = (pts, layer, closed = true) => {
      put(0, "POLYLINE"); put(8, layer); put(66, 1); put(70, closed ? 9 : 8);
      for (const p of pts) {
        put(0, "VERTEX"); put(8, layer); put(70, 32);
        put(10, p[0].toFixed(4)); put(20, p[1].toFixed(4)); put(30, (p[2] ?? 0).toFixed(4));
      }
      put(0, "SEQEND"); put(8, layer);
    };
    // The throat layer is the true throat-plane outline at z = 0. Intermediate
    // stations are sections PERPENDICULAR to each cell's own centreline, so
    // they are tilted — that is what a loft wants, and why they are not simply
    // the throat outline pushed along z.
    throat.cells.forEach((cc) => poly(cc.poly.map((p) => [p[0], p[1], 0]), "STATION_00_THROAT"));
    if (map) {
      for (let q = 1; q <= stations; q++) {
        const sec = map.sectionAt(q);
        const name = q === stations ? `STATION_${String(q).padStart(2, "0")}_MOUTH` : `STATION_${String(q).padStart(2, "0")}`;
        sec.forEach((sc) => sc && poly(sc.pts, name));
      }
    }
    put(0, "ENDSEC"); put(0, "EOF");
    return L.join("\n");
  };

  const buildJSON = () => JSON.stringify({
    tool: "h-grid throat partition",
    units: "mm, Hz, degrees",
    driver: { exitDiameter: exitDia, exitHalfAngle: exitAngle, temperature, speedOfSound: c },
    topology: {
      family, nCols: nc, nRows: nr, rings: family === "ogrid" ? rings : undefined,
      core: family === "butterfly" ? { m: bm, p: bp } : undefined,
      cornerAlphaDeg: alphaEff, equalArcAlphaDeg: G.equalArcAlphaDeg(nc, nr),
      seed, singularVertices: singular.length,
      lineShapes: family === "hgrid" ? {
        shapeOrder, symmetric, chebyshevOrders: cfg.orders,
        freeParameters: cfg.nParams, independentConstraints: cfg.nConstraints, spare: cfg.spare,
        parameters: labels.map((l, i) => ({
          group: l.group, name: l.name, kind: l.kind,
          requested: +pReq[i].toFixed(8), achieved: +pOut[i].toFixed(8),
        })),
      } : undefined,
    },
    solve: {
      converged: solve.converged,
      reason: solve.reason || undefined,
      openAreaSpreadPercent: throat.spread,
      areaResidual: solve.residual,
      correctionNorm: solve.correction,
      monotonicityGap: solve.monotone ? solve.monotone.gap : undefined,
      note: "Areas are equal to the solver tolerance reported here, not by construction.",
    },
    aperture: map ? { type: flatten === 1 ? "spherical cap" : "oblate spheroid", apexBehindThroat: apex, axialDepth: depth, flatten, mouthW, mouthH } : null,
    cells: throat.cells.map((cc) => {
      const r = map && map.rows.find((x) => x.id === cc.id);
      return {
        id: cc.id, label: cc.label, i: cc.i, j: cc.j,
        throatBoundary: cc.poly.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4), 0]),
        centroid: cc.centroid.map((v) => +v.toFixed(4)),
        area: +cc.area.toFixed(4), openArea: +cc.open.toFixed(4),
        Llong: +cc.Llong.toFixed(4), Lshort: +cc.Lshort.toFixed(4), aspect: +cc.aspect.toFixed(4),
        f1: +cc.f1.toFixed(1), f1model: cc.f1model, convex: cc.convex,
        aimVector: r ? r.mouthNormal.map((v) => +v.toFixed(6)) : null,
        pathLength: r ? +r.Lpath.toFixed(4) : null,
        sBendPadding: r ? +r.pad.toFixed(4) : null,
        turnDeg: r ? +r.turnDeg.toFixed(3) : null,
        twistDeg: r ? +r.twistDeg.toFixed(3) : null,
        aimErrorDeg: r ? +r.aimErrDeg.toFixed(3) : null,
        areaSchedule: r ? r.sched.map((st) => ({ s: +st.s.toFixed(4), area: +st.area.toFixed(3), z: +st.z.toFixed(3), sLength: +st.sLen.toFixed(3) })) : null,
        stations: r ? r.sched.map((st, q) => (st.local && map ? (map.sectionAt(q).find((x) => x && x.id === cc.id) || {}).pts.map((p) => p.map((v) => +v.toFixed(4))) : null)) : null,
      };
    }),
  }, null, 1);

  const buildCSV = () => {
    const head = [
      "cell", "i", "j", "kind", "area_mm2", "open_area_mm2", "L_long_mm", "L_short_mm",
      "aspect", "diameter_mm", "convex", "pw_floor_Hz", "min_curv_radius_mm", "curvature_flag",
      "f1_Hz", "f1_model", "centroid_x", "centroid_y",
      "path_length_mm", "s_pad_mm", "turn_deg", "twist_deg", "aim_err_deg",
      "f1_at_divider_end_Hz", "decay_len_mm", "straight_run_needed_mm", "straight_run_avail_mm",
    ].join(",");
    const rows = throat.cells.map((cc) => {
      const r = map && map.rows.find((x) => x.id === cc.id);
      return [
        // the label is "col,row" — it must be quoted or it splits the row
        `"${cc.label}"`, cc.i ?? "", cc.j ?? "", cc.kind, cc.area.toFixed(4), cc.open.toFixed(4),
        cc.Llong.toFixed(4), cc.Lshort.toFixed(4), cc.aspect.toFixed(4), cc.dia.toFixed(4),
        cc.convex, cc.pwFloor ? cc.pwFloor.toFixed(1) : "", isFinite(cc.minCurvR) ? cc.minCurvR.toFixed(3) : "inf",
        cc.curvatureSensitive ? "verify_in_ABEC" : "", cc.f1.toFixed(1), `"${cc.f1model}"`,
        cc.centroid[0].toFixed(4), cc.centroid[1].toFixed(4),
        r ? r.Lpath.toFixed(4) : "", r ? r.pad.toFixed(4) : "", r ? r.turnDeg.toFixed(3) : "",
        r ? r.twistDeg.toFixed(3) : "", r ? r.aimErrDeg.toFixed(3) : "",
        r ? r.f1End.toFixed(1) : "", r && r.decayLen ? r.decayLen.toFixed(3) : "",
        r && r.runNeeded ? r.runNeeded.toFixed(2) : "", r ? r.straightAvail.toFixed(2) : "",
      ].join(",");
    });
    return [head, ...rows].join("\n");
  };

  const buildSigmaCSV = () => {
    if (!map) return "";
    const head = "station,s,axial_z_mm,developed_s_mm,total_area_mm2,equivalent_diameter_mm";
    const rows = map.sigma.map((g, q) =>
      [q, g.s.toFixed(4), g.zMean.toFixed(3), g.sMean.toFixed(3), g.area.toFixed(3),
       (2 * Math.sqrt(g.area / Math.PI)).toFixed(3)].join(","));
    return [
      "# Sum of cell cross-sections along the loft, for Hornresp / ABEC.",
      "# s is the fraction of each cell's own developed centreline, so axial_z",
      "# and developed_s are MEANS across cells whose paths differ in length.",
      head, ...rows,
    ].join("\n");
  };

  // ── throat plan ────────────────────────────────────────────────────────────
  const fLo = Math.min(...throat.cells.map((x) => x.f1));
  const fHi = Math.max(...throat.cells.map((x) => x.f1));
  const cellFill = (cc) => rampAt(fHi > fLo ? (cc.f1 - fLo) / (fHi - fLo) : 0.5);
  const pathOf = (poly) => "M" + poly.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(" L") + " Z";

  const throatSVG = () => {
    const pad = R * 0.18;
    const vb = `${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}`;
    const sw = R * 0.006;
    const els = [];
    throat.cells.forEach((cc) => {
      const isMin = throat.f1minCell && cc.id === throat.f1minCell.id;
      els.push(<path key={`c${cc.id}`} d={pathOf(cc.poly)} fill={cellFill(cc)}
        fillOpacity={hover === cc.id ? 0.85 : 0.5}
        stroke={isMin ? C.series5 : C.inkDim} strokeWidth={isMin ? sw * 3 : sw * 1.4}
        onMouseEnter={hoverEnter(cc.id)} onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }} />);
    });
    els.push(<circle key="rim" cx={0} cy={0} r={R} fill="none" stroke={C.accent} strokeWidth={sw * 2.4} />);
    // singular vertices — where the number of cells meeting is not four. They
    // are unavoidable when a rectangular index is laid on a disc.
    singular.forEach((p, k) => {
      els.push(<g key={`sv${k}`}>
        <circle cx={p[0]} cy={-p[1]} r={R * 0.035} fill="none" stroke={C.series6} strokeWidth={sw * 2.2} />
        <circle cx={p[0]} cy={-p[1]} r={R * 0.011} fill={C.series6} />
      </g>);
    });
    if (showLabels)
      throat.cells.forEach((cc) => els.push(
        <text key={`t${cc.id}`} x={cc.centroid[0]} y={-cc.centroid[1]} fill={C.ink} fontSize={R * 0.062}
          fontFamily={C.mono} textAnchor="middle" dominantBaseline="middle" opacity={0.75}
          style={{ pointerEvents: "none" }}>{cc.label}</text>));
    return <svg viewBox={vb} width="100%" style={{ display: "block", maxHeight: 440 }}>{els}</svg>;
  };

  // ── mouth plan ─────────────────────────────────────────────────────────────
  const mouthSVG = () => {
    if (!map) return <div style={{ fontSize: 11, color: C.inkMuted, padding: 20 }}>
      Cell-for-cell mapping needs a rectangular index at both ends, which only the H-grid has.
    </div>;
    const padx = mouthW * 0.06, pady = mouthH * 0.12;
    const vb = `${-mouthW / 2 - padx} ${-mouthH / 2 - pady} ${mouthW + 2 * padx} ${mouthH + 2 * pady}`;
    const sw = mouthW * 0.0016;
    const els = [];
    map.rows.forEach((r) => {
      const cc = throat.cells.find((x) => x.id === r.id);
      const p = r.mouthCorners.map((q) => [q[0], q[1]]);
      els.push(<path key={`m${r.id}`} d={pathOf(p)} fill={cellFill(cc)}
        fillOpacity={hover === r.id ? 0.85 : 0.5} stroke={C.inkDim} strokeWidth={sw * 1.4}
        onMouseEnter={hoverEnter(r.id)} onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }} />);
      if (showLabels) els.push(
        <text key={`ml${r.id}`} x={r.mouthCentroid[0]} y={-r.mouthCentroid[1]} fill={C.ink}
          fontSize={mouthH * 0.05} fontFamily={C.mono} textAnchor="middle" dominantBaseline="middle"
          opacity={0.75} style={{ pointerEvents: "none" }}>{cc.label}</text>);
    });
    els.push(<rect key="outline" x={-mouthW / 2} y={-mouthH / 2} width={mouthW} height={mouthH}
      fill="none" stroke={C.accent} strokeWidth={sw * 2.4} />);
    return <svg viewBox={vb} width="100%" style={{ display: "block", maxHeight: 300 }}>{els}</svg>;
  };

  // ── path-length chart ──────────────────────────────────────────────────────
  const pathSVG = () => {
    if (!map) return null;
    const W = 780, H = 40 + map.rows.length * 15, pl = 46, pr = 130, pt = 26, pb = 22;
    const lo = Math.min(map.Lmin, map.Lmax - map.lambda / 3) * 0.998;
    const hi = map.Lmax * 1.002;
    const X = (v) => pl + ((v - lo) / (hi - lo)) * (W - pl - pr);
    const els = [];
    const band = (from, to, col, label) => {
      els.push(<rect key={`b${label}`} x={X(from)} y={pt - 8} width={Math.max(X(to) - X(from), 0)}
        height={H - pt - pb + 8} fill={col} opacity={0.09} />);
      els.push(<line key={`bl${label}`} x1={X(from)} y1={pt - 8} x2={X(from)} y2={H - pb}
        stroke={col} strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />);
      els.push(<text key={`bt${label}`} x={X(from) + 3} y={pt - 12} fill={col} fontSize={9} fontFamily={C.mono}>{label}</text>);
    };
    band(map.Lmax - map.lambda / 4, map.Lmax - map.lambda / 8, C.series1, "λ/4");
    band(map.Lmax - map.lambda / 8, map.Lmax, C.series4, "λ/8");
    map.rows.forEach((r, k) => {
      const y = pt + k * 15;
      const cc = throat.cells.find((x) => x.id === r.id);
      els.push(<rect key={`r${k}`} x={X(lo)} y={y} width={Math.max(X(r.Lpath) - X(lo), 0.5)} height={10}
        fill={cellFill(cc)} fillOpacity={hover === r.id ? 0.95 : 0.6}
        onMouseEnter={hoverEnter(r.id)} onMouseLeave={() => setHover(null)} />);
      els.push(<text key={`rl${k}`} x={pl - 6} y={y + 8} fill={C.inkDim} fontSize={9}
        fontFamily={C.mono} textAnchor="end">{cc.label}</text>);
      els.push(<text key={`rv${k}`} x={W - pr + 6} y={y + 8} fill={C.inkMuted} fontSize={9} fontFamily={C.mono}>
        {fmt(r.Lpath, 2)} mm · pad {fmt(r.pad, 2)}
      </text>);
    });
    els.push(<line key="max" x1={X(map.Lmax)} y1={pt - 8} x2={X(map.Lmax)} y2={H - pb}
      stroke={C.reference} strokeWidth={1.4} />);
    els.push(<text key="maxt" x={X(map.Lmax) + 3} y={H - pb + 12} fill={C.reference} fontSize={9} fontFamily={C.mono}>
      L_max {fmt(map.Lmax, 2)} mm — the longest cell sets the budget
    </text>);
    return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>{els}</svg>;
  };

  // parameters grouped by the line they belong to, for the panel above
  const groups = useMemo(() => {
    const out = [];
    labels.forEach((l, i) => {
      let g = out.find((x) => x.name === l.group);
      if (!g) { g = { name: l.group, items: [] }; out.push(g); }
      g.items.push({ i, l });
    });
    return out;
  }, [labels]);

  // The readout panel is fixed to the viewport and never enters the document
  // flow. In flow it sat above the path chart and the cell table, so showing it
  // pushed the very row the pointer was on downward — the pointer left, the
  // panel unmounted, the row sprang back, and the two states chased each other.
  // Fixed position removes the cause. It also parks on whichever half of the
  // viewport the pointer is NOT on, so it never covers what is being read, and
  // pointer-events: none keeps it from becoming a second hover trap.
  const hoverEnter = (id) => (e) => {
    setHover(id);
    setHoverSide(e.clientX > window.innerWidth / 2 ? "left" : "right");
  };

  const hoverCell = hover != null ? throat.cells.find((x) => x.id === hover) : null;
  const hoverRow = hover != null && map ? map.rows.find((x) => x.id === hover) : null;
  const presets = [["1″", 25.4], ["1.4″", 35.5], ["1.5″", 38.1], ["2″", 50.8]];
  const expBtn = { ...btn(false, C.series2), color: C.series2, borderColor: C.border, fontSize: 11, padding: "4px 10px" };

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <style>{SPIN_CSS}</style>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, margin: 0, letterSpacing: "0.05em" }}>
          H-GRID THROAT PARTITION
        </h1>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
          Equal-area row-and-column partition of a compression driver exit · independent grid-line curvature · lofted cell-for-cell to a rectangular mouth
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ ...card, border: `1px solid ${C.series5}`, background: C.series5 + "10" }}>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.series5, marginBottom: 4, lineHeight: 1.45 }}>⚠ {w}</div>)}
        </div>
      )}

      {/* DRIVER */}
      <div style={card}>
        <div style={secTitle}>Driver exit and material</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0 12px" }}>
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
              {presets.map(([l, v]) => (
                <button key={l} onClick={() => setExitDia(v)} style={btn(Math.abs(exitDia - v) < 0.05, C.accent)}>{l}</button>
              ))}
            </div>
            <NumInput label="Exit diameter" value={exitDia} onChange={setExitDia} unit="mm" min={5} max={200} step={0.1} accent={C.accent} />
          </div>
          <NumInput label="Exit half-angle" value={exitAngle} onChange={setExitAngle} unit="°" min={0} max={45} step={0.5} />
          <NumInput label="Temperature" value={temperature} onChange={setTemperature} unit="°C" min={-20} max={60} step={1} />
          <NumInput label="Divider thickness" value={thickness} onChange={setThickness} unit="mm" min={0} max={4} step={0.1} accent={C.series6} />
          <div>
            <label style={sLabel}>Process</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Object.entries(G.PROCESSES).map(([k, p]) => (
                <button key={k} onClick={() => setProcess(k)} style={btn(process === k, C.series6)}>{p.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 5, lineHeight: 1.4 }}>
              t_min {fab.tMin} mm · Ra ≈ {fmt(fab.ra * 1000, 0)} µm against a {fmt(fab.deltaV * 1000, 0)} µm boundary layer
            </div>
          </div>
        </div>
      </div>

      {/* TOPOLOGY */}
      <div style={card}>
        <div style={secTitle}>Topology</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {[["hgrid", "H-grid — one (i,j) index, 4 rim singularities"],
            ["ogrid", "O-grid — concentric rings, no singularities"],
            ["butterfly", "Butterfly — square core + 4 fans, 4 core singularities"]].map(([v, l]) => (
            <button key={v} onClick={() => setFamily(v)} style={{ ...btn(family === v, C.series4), fontSize: 11, padding: "5px 10px" }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          {family === "hgrid" && <>
            <NumInput label="Columns n_cols" value={nc} onChange={(v) => setNc(Math.round(v))} min={2} max={16} step={1} accent={C.series4} />
            <NumInput label="Rows n_rows" value={nr} onChange={(v) => setNr(Math.round(v))} min={1} max={10} step={1} accent={C.series4} />
          </>}
          {family === "ogrid" && <div style={{ gridColumn: "span 2" }}>
            <label style={sLabel}>Ring counts</label>
            <input value={ringSpec} onChange={(e) => setRingSpec(e.target.value)} placeholder="1,6,12" style={{ ...sInput, fontSize: 12 }} />
            <div style={{ fontSize: 10, color: C.series3, fontFamily: C.mono, marginTop: 4 }}>{rings.join(" + ")} = {rings.reduce((a, b) => a + b, 0)}</div>
          </div>}
          {family === "butterfly" && <>
            <NumInput label="Core subdivision m" value={bm} onChange={(v) => setBm(Math.round(v))} min={1} max={8} step={1} accent={C.series4} />
            <NumInput label="Fan rings p" value={bp} onChange={(v) => setBp(Math.round(v))} min={1} max={8} step={1} accent={C.series4} />
          </>}
          <div>
            <label style={sLabel}>Seed map</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button onClick={() => setSeed("elliptical")} style={btn(seed === "elliptical", C.series2)}>Elliptical</button>
              <button onClick={() => setSeed("conformal")} style={btn(seed === "conformal", C.series2)}>Conformal (SC)</button>
            </div>
            <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.4 }}>{SEED_NOTE[seed]}</div>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, lineHeight: 1.7, color: C.inkDim }}>
            {family === "hgrid" ? (<>
              <div><span style={{ color: C.series4 }}>{cfg.nParams}</span> free parameters · <span style={{ color: C.series1 }}>{cfg.nConstraints}</span> constraints</div>
              <div>spare <span style={{ color: cfg.spare >= 0 ? C.series3 : C.series5 }}>{cfg.spare}</span> · {cfg.nLon + cfg.nLat} line shapes</div>
              <div style={{ color: C.inkMuted }}>{cfg.nClasses} distinct cells under the mirrors</div>
            </>) : (<>
              <div><span style={{ color: C.series4 }}>{layout.mesh ? G.dofCount(layout.mesh) : 0}</span> node DOF</div>
              <div style={{ color: C.inkMuted }}>comparison family — no line parameterisation</div>
            </>)}
            <div style={{ color: C.inkMuted }}>{singular.length} singular vertices</div>
            <div style={{ color: C.inkMuted, fontSize: 10, marginTop: 3, lineHeight: 1.4, fontFamily: C.sans }}>
              Conformally natural α for a {fmt(mouthW / mouthH, 2)}:1 mouth is {fmt(G.scAlphaForAspect(mouthW / mouthH) * R2D, 1)}°, set by the
              Schwarz–Christoffel elliptic modulus. The equal-arc formula is a seed, not a derivation.
            </div>
          </div>
        </div>
      </div>

      {/* LINE SHAPES */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <span style={secTitle}>Grid-line shape — sliders are requests, not settings</span>
          {family === "hgrid" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.inkMuted }}>shape order m</span>
              {[1, 2, 3].map((d) => (
                <button key={d} onClick={() => setShapeOrder(d)} style={btn(shapeOrder === d, C.series7)}>{d}</button>
              ))}
              <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: C.mono, marginLeft: 4 }}>
                T{cfg.orders.join(", T")}
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, marginLeft: 8 }}>
                <input type="checkbox" checked={symmetric} onChange={(e) => setSymmetric(e.target.checked)} style={{ accentColor: C.series7 }} />
                <span style={{ color: C.inkDim }}>enforce both mirror symmetries</span>
              </label>
              <button onClick={() => setRequest(null)} style={{ ...btn(false, C.series5), marginLeft: 6 }}>Reset to nominal</button>
            </div>
          )}
        </div>

        {family !== "hgrid" ? (
          <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5 }}>
            The line parameterisation belongs to the H-grid: it needs one continuous latitude and longitude line across the whole disc.
            An O-grid has rings and radials, a butterfly has a core and four fans — neither carries a single (i,j) index, so neither has
            grid lines to shape. Both are here as equal-N comparisons at the throat and are solved on their own node positions.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${300}px, 1fr))`, gap: "0 20px" }}>
              {groups.map((grp) => (
                <div key={grp.name} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: C.series7, fontFamily: C.mono, letterSpacing: "0.05em", margin: "6px 0 2px" }}>
                    {grp.name.toUpperCase()}
                  </div>
                  {grp.items.map(({ i, l }) => {
                    const isAlpha = l.kind === "alpha";
                    const val = isAlpha ? pReq[i] * R2D : pReq[i];
                    const got = isAlpha ? pOut[i] * R2D : pOut[i];
                    const lim = l.kind === "pos" ? 1 : l.kind === "alpha" ? null : 0.6;
                    const moved = Math.abs(got - val) > (isAlpha ? 0.05 : 5e-4);
                    return (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                          <label style={{ ...sLabel, marginBottom: 1 }}>{l.name}</label>
                          <span style={{ fontFamily: C.mono, fontSize: 10, whiteSpace: "nowrap" }}>
                            <span style={{ color: C.inkDim }}>{val.toFixed(isAlpha ? 2 : 4)}</span>
                            <span style={{ color: C.inkMuted }}> → </span>
                            <span style={{ color: moved ? C.series5 : C.series4 }}>{got.toFixed(isAlpha ? 2 : 4)}</span>
                            {isAlpha && <span style={{ color: C.inkMuted }}>°</span>}
                          </span>
                        </div>
                        <input type="range"
                          min={isAlpha ? 5 : -lim} max={isAlpha ? 85 : lim} step={isAlpha ? 0.25 : 0.002}
                          value={val}
                          onChange={(e) => {
                            const q = pReq.slice();
                            q[i] = isAlpha ? parseFloat(e.target.value) * D2R : parseFloat(e.target.value);
                            setRequest(q);
                          }}
                          style={{ width: "100%", accentColor: moved ? C.series5 : C.series7, margin: 0 }} />
                        {l.kind === "bow" && (
                          <div style={{ fontSize: 9, color: C.inkMuted, lineHeight: 1.3 }}>
                            {ORDER_HINT[Math.min(cfg.orders.indexOf(l.order), 2)]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 6, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={runOptimiser} disabled={running}
                style={{ ...btn(true, C.series1), fontSize: 11, padding: "6px 14px", opacity: running ? 0.5 : 1 }}>
                {running ? "Optimising…" : "Maximise min f₁"}
              </button>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {[["aspect", wAspect, setWAspect], ["twist", wTwist, setWTwist], ["correction", wCorrection, setWCorrection]].map(([l, v, set]) => (
                  <label key={l} style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 4, alignItems: "center" }}>
                    w<sub>{l}</sub>
                    <input type="number" value={v} min={0} max={5} step={0.1} onChange={(e) => set(parseFloat(e.target.value) || 0)}
                      style={{ ...sInput, width: 56, padding: "3px 5px", fontSize: 11 }} />
                  </label>
                ))}
                <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 4, alignItems: "center" }}>
                  evals
                  <input type="number" value={maxEval} min={40} max={2000} step={20} onChange={(e) => setMaxEval(parseInt(e.target.value) || 160)}
                    style={{ ...sInput, width: 64, padding: "3px 5px", fontSize: 11 }} />
                </label>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted, marginLeft: "auto", textAlign: "right", lineHeight: 1.5 }}>
                <div>objective J = {fmt(obj.J, 3)} · softmin f₁ {fmt(obj.soft, 2)} kHz</div>
                <div>aspect {fmt(obj.aspectPenalty, 3)} · twist {fmt(obj.twistPenalty, 3)} · correction {fmt(obj.correctionPenalty, 3)}</div>
                {optState && <div style={{ color: C.series4 }}>{optState.evals} evaluations in {(optState.ms / 1000).toFixed(1)} s</div>}
              </div>
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontFamily: C.mono, fontSize: 11 }}>
              {computing && <Solving label="re-solving — figures below are the previous grid" />}
              <span><span style={{ color: C.inkMuted }}>status </span>
                <span style={{ color: solve.converged ? C.series4 : C.series5 }}>
                  {solve.converged
                    ? "equal-area solution found"
                    : `infeasible — showing ${fmt((solve.reachedFraction || 0) * 100, 0)}% of the request`}
                </span></span>
              <span><span style={{ color: C.inkMuted }}>area residual </span>{solve.residual.toExponential(2)}</span>
              <span><span style={{ color: C.inkMuted }}>correction ‖p−p_req‖_W </span>
                <span style={{ color: solve.correction > 0.2 ? C.series1 : C.ink }}>{fmt(solve.correction, 4)}</span></span>
              <span><span style={{ color: C.inkMuted }}>closest line spacing </span>
                <span style={{ color: solve.monotone && solve.monotone.gap < 0.02 ? C.series5 : C.ink }}>
                  {solve.monotone
                    ? (solve.monotone.gap < 1e-3 ? solve.monotone.gap.toExponential(2) : solve.monotone.gap.toFixed(4))
                    : "—"}</span></span>
            </div>

            <div style={{ marginTop: 8, fontSize: 10, color: C.inkMuted, lineHeight: 1.5 }}>
              A slider states what you want; the solver returns the <em>nearest</em> parameter vector that still has equal areas, and both numbers
              are shown above — request on the left, achieved on the right, in red when they differ. Positions are weighted cheap so they move
              freely; bows are weighted expensive so the shape you asked for survives wherever the constraint leaves room. Unlike free nodes,
              whole-line curvature <strong style={{ color: C.inkDim }}>cannot always reach equal area</strong>: when it cannot, the tool says so and names
              the binding constraint rather than returning a converged-looking but distorted grid.
            </div>
          </>
        )}
      </div>

      {/* THROAT + MOUTH */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(300px, 1.15fr)", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ ...secTitle, display: "flex", alignItems: "baseline", gap: 8 }}>
              Throat plane · looking into the driver
              {computing && <Solving />}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11 }}>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} style={{ accentColor: C.series4 }} />
              <span style={{ color: C.inkDim }}>labels</span>
            </label>
          </div>
          <div style={{ opacity: computing ? 0.35 : 1 }}>{throatSVG()}</div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 4, flexWrap: "wrap", fontSize: 10 }}>
            <span style={{ color: C.series3 }}>▮ low f₁</span>
            <span style={{ color: C.series1 }}>▮ high f₁</span>
            <span style={{ color: C.series5 }}>━ sets f₁_min</span>
            <span style={{ color: C.series6 }}>◎ singular vertex</span>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ ...secTitle, display: "flex", alignItems: "baseline", gap: 8 }}>
            Mouth aperture · same colour identity
            {computing && <Solving />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0 10px" }}>
            <NumInput label="Mouth width" value={mouthW} onChange={setMouthW} unit="mm" min={20} max={1200} step={5} accent={C.accent} />
            <NumInput label="Mouth height" value={mouthH} onChange={setMouthH} unit="mm" min={20} max={1200} step={5} accent={C.accent} />
            <NumInput label="Apex behind" value={apex} onChange={setApex} unit="mm" min={5} max={2000} step={5} />
            <NumInput label="Axial depth" value={depth} onChange={setDepth} unit="mm" min={10} max={1500} step={5} />
            <NumInput label="Oblate flatten" value={flatten} onChange={setFlatten} min={1} max={3} step={0.05} />
            <NumInput label="Target f" value={fTarget} onChange={setFTarget} unit="Hz" min={2000} max={40000} step={500} accent={C.series5} />
          </div>
          <div style={{ opacity: computing ? 0.35 : 1 }}>{mouthSVG()}</div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            Choose the aperture surface from the <strong style={{ color: C.inkDim }}>directivity</strong> requirement — apparent apex position and
            coverage angle — then equalise the paths <em>to</em> it, then close what is left with S-bend padding. A surface shaped for routing
            convenience radiates its own curvature error phase-coherently, and no EQ removes that.
            {" "}Flatten = 1 is a spherical cap about the apex, where the surface normal <em>is</em> the wavefront normal and the aim error is zero by construction.
          </div>
        </div>
      </div>

      {/* HOVER READOUT — fixed to the viewport, out of flow; see hoverEnter */}
      {hoverCell && (
        <div style={{
          ...card, marginBottom: 0, borderColor: C.accent,
          position: "fixed", bottom: 16, zIndex: 20,
          left: hoverSide === "left" ? 16 : "auto",
          right: hoverSide === "right" ? 16 : "auto",
          width: "min(420px, 46vw)", boxSizing: "border-box", pointerEvents: "none",
          boxShadow: `0 6px 20px ${C.page}cc`,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, fontFamily: C.mono, fontSize: 11,
        }}>
          <div><span style={{ color: C.inkMuted }}>cell </span><span style={{ color: C.accent }}>{hoverCell.label}</span></div>
          <div><span style={{ color: C.inkMuted }}>f₁ </span>{fmt(hoverCell.f1 / 1000, 2)} kHz</div>
          <div><span style={{ color: C.inkMuted }}>model </span><span style={{ fontSize: 10 }}>{hoverCell.f1model}</span></div>
          <div><span style={{ color: C.inkMuted }}>open </span>{fmt(hoverCell.open, 2)} mm²</div>
          <div><span style={{ color: C.inkMuted }}>L_long/L_short </span>{fmt(hoverCell.Llong, 2)} / {fmt(hoverCell.Lshort, 2)} mm</div>
          <div><span style={{ color: C.inkMuted }}>aspect </span>{fmt(hoverCell.aspect, 2)}</div>
          <div><span style={{ color: C.inkMuted }}>Payne–Weinberger </span>{hoverCell.pwFloor ? `${fmt(hoverCell.pwFloor / 1000, 2)} kHz` : <span style={{ color: C.inkMuted }}>n/a — not convex</span>}</div>
          {hoverRow && <>
            <div><span style={{ color: C.inkMuted }}>path </span>{fmt(hoverRow.Lpath, 2)} mm · pad {fmt(hoverRow.pad, 2)}</div>
            <div><span style={{ color: C.inkMuted }}>turn </span>{fmt(hoverRow.turnDeg, 1)}° · twist {fmt(hoverRow.twistDeg, 1)}°</div>
            <div><span style={{ color: C.inkMuted }}>straight run </span>{fmt(hoverRow.straightAvail, 1)} / {hoverRow.runNeeded ? fmt(hoverRow.runNeeded, 1) : "—"} mm</div>
          </>}
        </div>
      )}

      {/* PATHS */}
      {map && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={secTitle}>Developed path length per cell against the ΔL budget</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.inkMuted }}>bend tightness</span>
              <input type="range" min={0.25} max={1.2} step={0.01} value={tight} onChange={(e) => setTight(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: C.series2 }} />
              <span style={{ fontSize: 10, color: C.inkMuted }}>divider end</span>
              <input type="range" min={0.05} max={1} step={0.01} value={dividerEndFrac} onChange={(e) => setDividerEndFrac(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: C.series6 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{(dividerEndFrac * 100).toFixed(0)}% of the run</span>
            </div>
          </div>
          <div style={{ opacity: computing ? 0.35 : 1 }}>{pathSVG()}</div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Padding lengthens short paths — it cannot shorten long ones, so the longest cell sets the budget for every other cell.
            ≤ λ/8 is about −0.7 dB on the worst-case pair summation; λ/8 to λ/4 is the amber band; past λ/4 the cells are fighting each other.
          </div>
        </div>
      )}

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Metric label="Cells N" value={`${throat.N}`} sub={family === "hgrid" ? `${nc} × ${nr}` : family === "ogrid" ? rings.join(" + ") : `${bm}² + 4·${bm}·${bp}`} />
        <Metric label="Open area / cell" value={`${fmt(throat.openMean, 2)} mm²`} sub={`gross ${fmt(throat.areaMean, 2)} mm²`} />
        <Metric label="Open-area spread" value={throat.spread < 1e-6 ? `${throat.spread.toExponential(1)}%` : `${fmt(throat.spread, 3)}%`}
          sub={throat.spread < 1e-6 ? "achieved, not assumed" : "no equal-area solution"} color={throat.spread < 1e-6 ? C.series4 : C.series5} />
        <Metric label="f₁ min" value={`${fmt(throat.f1min / 1000, 2)} kHz`} sub={`cell ${throat.f1minCell.label} · ${throat.f1minCell.f1model}`} color={C.series4} />
        <Metric label="Isodiametric ceiling" value={`${fmt(throat.f1ceiling / 1000, 2)} kHz`} sub={`c·√N/(2D) · ${fmt((1 - throat.f1min / throat.f1ceiling) * 100, 0)}% left on the table`} />
        <Metric label="Undivided exit" value={`${fmt(throat.fUndividedAz / 1000, 2)} kHz`} sub={`radial mode ${fmt(throat.fUndividedRad / 1000, 2)} kHz`} color={C.inkDim} />
        <Metric label="Gain vs undivided" value={`${fmt(throat.f1min / throat.fUndividedAz, 2)}×`} sub={`ceiling is ${fmt(throat.f1ceiling / throat.fUndividedAz, 2)}×`} />
        <Metric label="Worst aspect" value={fmt(throat.aspectMax, 2)} sub="equal area forbids all-square cells" />
        {family === "hgrid" && <>
          <Metric label="Free parameters" value={`${cfg.nParams}`}
            sub={`${cfg.nLon + cfg.nLat} line shapes × (position + ${cfg.orders.length}) + α`} />
          <Metric label="Spare freedom" value={`${cfg.spare}`}
            sub={`${cfg.nConstraints} independent constraints`} color={cfg.spare > 0 ? C.ink : C.series5} />
          <Metric label="Slider correction" value={fmt(solve.correction, 4)}
            sub="‖p − p_requested‖_W" color={solve.correction > 0.2 ? C.series1 : C.ink} />
        </>}
        <Metric label="Divider blockage" value={`${fmt(throat.blockage * 100, 1)}%`} sub={`${fmt(throat.dividerTotal, 0)} mm of centreline at ${fmt(thickness, 2)} mm`} color={throat.blockage > 0.12 ? C.series1 : C.ink} />
        <Metric label="Shell oversize" value={`⌀ ${fmt(fab.dShell, 2)} mm`} sub={`+${fmt(fab.oversize, 2)} mm on ⌀${fmt(exitDia, 1)} to give the area back`} />
        <Metric label="Non-convex cells" value={`${throat.nonConvex}`} sub="Payne–Weinberger does not apply to these" color={throat.nonConvex ? C.series1 : C.ink} />
        <Metric label="Curvature-flagged" value={`${throat.curvatureFlagged}`} sub="verify in ABEC" color={throat.curvatureFlagged ? C.series1 : C.ink} />
        {map && <>
          <Metric label="ΔL max" value={`${fmt(map.dL, 2)} mm`} sub={`λ/${fmt(map.lambda / map.dL, 1)} at ${fmt(fTarget / 1000, 1)} kHz`}
            color={map.band === "ok" ? C.series4 : map.band === "warn" ? C.series1 : C.series5} />
          <Metric label="Max turning" value={`${fmt(map.turnMax, 1)}°`} sub={`limit ${fmt(map.turnLimitDeg, 1)}° · w·θ < λ/8`} color={map.turnMax > map.turnLimitDeg ? C.series5 : C.ink} />
          <Metric label="Max twist" value={`${fmt(map.twistMax, 1)}°`} sub="cross-section rotation, throat to mouth" />
          <Metric label="Max aim error" value={`${fmt(map.aimMax, 2)}°`} sub={`tolerance ≈ λ/(4d) = ${fmt(map.aimLimitDeg, 1)}°`} color={map.aimMax > map.aimLimitDeg ? C.series5 : C.ink} />
        </>}
        <Metric label="Speed of sound" value={`${fmt(c, 1)} m/s`} sub={`at ${temperature} °C`} />
        <Metric label="Wavefront correction" value={fmt(2 / (1 + Math.cos(exitAngle * D2R)), 4)} sub="spherical / planar area, reported not applied" />
      </div>

      {/* EXPORTS */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ ...secTitle, marginBottom: 0 }}>Export</span>
        <button style={expBtn} onClick={() => dl(`${stem}.dxf`, buildDXF(), "application/dxf")}>DXF · one layer per station</button>
        <button style={expBtn} onClick={() => dl(`${stem}.json`, buildJSON(), "application/json")}>JSON cell definition</button>
        <button style={expBtn} onClick={() => dl(`${stem}.csv`, buildCSV(), "text/csv")}>CSV · per cell</button>
        <button style={expBtn} disabled={!map} onClick={() => dl(`${stem}_area_schedule.csv`, buildSigmaCSV(), "text/csv")}>ΣA(x) CSV</button>
        <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center", marginLeft: 8 }}>
          stations
          <input type="number" value={stations} min={2} max={64} step={1} onChange={(e) => setStations(Math.max(2, Math.min(64, parseInt(e.target.value) || 16)))}
            style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
        </label>
        <span style={{ fontSize: 10, color: C.inkMuted, flex: "1 1 260px", lineHeight: 1.45 }}>
          The JSON is what makes the Shapr3D loft tractable — loft cell <em>n</em>'s throat profile to its own mouth profile, one cell at a time.
          Station 0 is the true throat plane at z = 0; the rest are sections perpendicular to each cell's own centreline, so they are tilted.
        </span>
      </div>

      {/* CELL TABLE */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={secTitle}>Cells · {throat.N} total</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 360 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
            <thead><tr>{["cell", "open mm²", "L_long", "L_short", "aspect", "⌀", "convex", "P–W kHz", "f₁ kHz", "model", "path mm", "pad", "turn°", "twist°", "aim°"].map((h) => (
              <th key={h} style={{ textAlign: "right", padding: "6px 9px", borderBottom: `1px solid ${C.borderStrong}`, color: C.inkDim, fontSize: 10, fontWeight: 500, position: "sticky", top: 0, background: C.panel, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {throat.cells.map((cc, i) => {
                const r = map && map.rows.find((x) => x.id === cc.id);
                const isMin = cc.id === throat.f1minCell.id;
                const td = (v, col) => <td style={{ textAlign: "right", padding: "3px 9px", color: col || C.ink, whiteSpace: "nowrap" }}>{v}</td>;
                return (
                  <tr key={i} onMouseEnter={hoverEnter(cc.id)} onMouseLeave={() => setHover(null)}
                    style={{ background: hover === cc.id ? C.panelAlt : i % 2 ? C.page + "60" : "transparent" }}>
                    {td(cc.label, isMin ? C.series5 : C.inkDim)}
                    {td(fmt(cc.open, 2), C.series1)}
                    {td(fmt(cc.Llong, 2))}
                    {td(fmt(cc.Lshort, 2))}
                    {td(fmt(cc.aspect, 2), cc.aspect > 2.5 ? C.series1 : C.ink)}
                    {td(fmt(cc.dia, 2))}
                    {td(cc.convex ? "yes" : "no", cc.convex ? C.inkMuted : C.series1)}
                    {td(cc.pwFloor ? fmt(cc.pwFloor / 1000, 2) : "—", cc.pwFloor ? C.inkDim : C.inkMuted)}
                    {td(fmt(cc.f1 / 1000, 2), isMin ? C.series5 : C.series4)}
                    <td style={{ textAlign: "right", padding: "3px 9px", color: C.inkMuted, fontSize: 10, whiteSpace: "nowrap" }}>
                      {cc.f1model}{cc.curvatureSensitive ? " ⚠" : ""}
                    </td>
                    {td(r ? fmt(r.Lpath, 2) : "—", C.inkDim)}
                    {td(r ? fmt(r.pad, 2) : "—", C.inkDim)}
                    {td(r ? fmt(r.turnDeg, 1) : "—", r && r.turnDeg > map.turnLimitDeg ? C.series5 : C.inkDim)}
                    {td(r ? fmt(r.twistDeg, 1) : "—", C.inkDim)}
                    {td(r ? fmt(r.aimErrDeg, 2) : "—", r && r.aimErrDeg > map.aimLimitDeg ? C.series5 : C.inkDim)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTES */}
      <div style={{ fontSize: 10, color: C.inkMuted, lineHeight: 1.6, padding: "0 4px", fontFamily: C.sans }}>
        <strong style={{ color: C.inkDim }}>Why lines, and why they bend individually</strong> · A fixed square-to-disc map with adjustable u and v
        division values offers (n_cols−1)+(n_rows−1) knobs against n_cols·n_rows−1 area constraints — for 6×3 that is a tensor-product grid with
        4 parameters against 5 independent constraints, and it is <em>not solvable</em>. The tool will tell you so if you ask for it. Each line therefore
        carries its own Chebyshev coefficients, which is far more freedom than two division vectors and far less than free nodes:
        {" "}{family === "hgrid" ? `${cfg.nParams} free parameters against ${cfg.nConstraints} constraints here, leaving ${cfg.spare} spare` : "a handful of parameters rather than hundreds"}.
        Only even orders appear under mirror symmetry — odd orders break it — and T₀ is a constant already absorbed into the line position.
        <br />
        <strong style={{ color: C.inkDim }}>Whole-line curvature can genuinely run out</strong> · Free nodes could always reach equal area. A line has to
        stay one curve, so an equal-area grid may not exist for a given corner angle and bow request, and the honest answer is to say which constraint is
        binding rather than to return a converged-looking distorted grid. Feasibility tightens as m falls, as α moves away from the equal-arc default, and
        as the mouth aspect ratio departs from the grid aspect ratio. Non-crossing is checked on 64 samples in parameter space, which is enough: Φ is a
        diffeomorphism, so lines that keep their order in the square keep it in the disc.
        <br />
        <strong style={{ color: C.inkDim }}>Singular vertices are not a layout failure</strong> · Mapping a rectangular index onto a disc must produce
        vertices where the number of cells meeting is not four. The H-grid puts its four on the rim, exactly where the cells are already most distorted;
        the butterfly moves them to the core corners, into a region that is otherwise well behaved. That is the trade between the two, and it is why both
        are here at equal N.
        <br />
        <strong style={{ color: C.inkDim }}>Rows, not columns</strong> · f₁_min is set by the row-direction edge length. Adding columns makes every cell
        narrower — raising its aspect ratio — while L_long barely moves, so a 6×3 and an 8×3 land within a few percent of each other despite a third more
        cells. Adding a row is what moves the number. Worth knowing before spending divider count on the wrong axis.
        <br />
        <strong style={{ color: C.inkDim }}>Shape distortion is mandatory here</strong> · An equal-area map cannot also be conformal unless it is a rigid
        motion, so the residual aspect ratios are the price of the area constraint and not a solver deficiency. The conformal seed shows the best shapes
        available — locally square cells, with the wrong areas; the equal-area solve then buys correct areas by spending exactly that squareness. Curvature is
        applied in <em>parameter</em> space and pushed through the seed map, so the seed still governs cell shape quality: the same bow coefficients give
        better-shaped cells on the conformal seed than on the elliptical one.
        <br />
        <strong style={{ color: C.inkDim }}>What the truncation costs</strong> · Line shapes stop at order 2m, so shapes needing finer structure are simply
        unreachable. Raising m widens the feasible set and shrinks the correction the solver has to apply to your request — but it also adds parameters the
        optimiser has to search. The area solve itself is exact to quadrature tolerance; the spread readout above is the ground truth, not an assumption of
        equality.
        <br />
        <strong style={{ color: C.inkDim }}>What the first-mode number is, and is not</strong> · For a curved quadrilateral, f₁ ≈ c/(2·max(L_long, L_short))
        with each L the mean of an opposing pair of edge arc lengths. That is a flat-rectangle approximation whose error is O((L/r_curv)²) <em>with the sign not
        established</em> — strongly curved cells are flagged, not corrected. Where a closed form exists it is used instead and the cell says so: the full disc at
        j′(1,1)·c/πD, and a circular sector at min(j′(π/β,1), j′(0,1))·c/2πa. The sector case is why a pure-sector layout saturates at the disc's own radial
        mode for N ≥ 6 — a radial cut lies along a nodal line of that mode and cannot remove it, no matter how many more you add.
        <br />
        <strong style={{ color: C.inkDim }}>Subdivision defers, it does not delete</strong> · Dividers raise the cutoff only over the length they exist. Where
        they end, the cells recombine and the array of cell mouths becomes a discrete source distribution. Below cut-on the field decays as exp(−αx) with
        α = (2π/c)·√(f₁²−f²), so the tool asks for three decay lengths of straight run before the trailing edge, computed from each cell's own f₁ at the
        station where the dividers stop — about 16 mm for a 22.5 kHz cell working at 20 kHz. A bend inside that distance re-excites what the duct just suppressed.
        <br />
        <strong style={{ color: C.inkDim }}>Assumptions carried in this build</strong> · Open-area correction is first order (t/2 per shared edge; corner
        overlaps ≈ t²/4 ignored, which makes the open area very slightly pessimistic). Areas are throat-plane, not spherical-wavefront — the correction factor
        2/(1+cos θ) is reported and never applied. Thermoviscous loss uses the wide-tube Kirchhoff approximation for a smooth wall; against FDM roughness
        of Ra 15–40 µm and a boundary layer of order 20 µm at 15 kHz, that figure is a <em>lower bound</em>. Moser's construction and semi-discrete optimal
        transport are exact in the continuum; discretised, any of them carries the integrator's error, which is why the achieved area spread is reported above
        rather than equality being asserted.
      </div>
    </div>
  );
}
