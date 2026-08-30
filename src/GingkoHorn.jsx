import React, { useState, useMemo, useEffect, useRef } from "react";
import { C, SERIES } from "./palette.js";
import * as G from "./hgrid-model.js";

// ═══════════════════════════════════════════════════════════════════════════
// GINGKO MULTICELL HORN
// ═══════════════════════════════════════════════════════════════════════════
//
// Named for the leaf: a round stem that fans out into a broad, gently folded
// blade. The tool partitions a compression driver's round exit into a
// structured ROW-AND-COLUMN grid of exactly equal open area, then routes each
// throat cell as its own duct to the matching cell of a biradial mouth.
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

// Binary STL is bytes, not text, so it cannot go through dl() — a Blob built
// from a string would UTF-8 encode every byte above 0x7f and corrupt the file.
const dlBin = (name, buf, mime) => {
  const u = URL.createObjectURL(new Blob([buf], { type: mime }));
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

export default function GingkoHorn() {
  // ── driver ──
  const [exitDia, setExitDia] = useState(35.5);
  const [exitAngle, setExitAngle] = useState(8);
  const [temperature, setTemperature] = useState(30);
  const [thickness, setThickness] = useState(0.4);
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
  const [depth, setDepth] = useState(150);
  const [divergeLen, setDivergeLen] = useState(0);
  const [arriveLen, setArriveLen] = useState(0);
  const [tight, setTight] = useState(0.55);
  // the two tangent magnitudes are the cubic's only free scalars; splitting
  // them is what lets curvature be pushed toward the small end of the duct.
  // null = locked together, which is the original single-knob behaviour.
  const [tightSplit, setTightSplit] = useState(false);
  const [tightThroat, setTightThroat] = useState(0.55);
  const [tightMouth, setTightMouth] = useState(0.55);
  // "rect" = the original uniform x/y lattice; "arc" = coverage angles,
  // subdivided at equal solid angle
  // The mouth is stated by what it must deliver: two arcs, each with its own
  // angle and length. No apex, and the two radii are independent — Th = 0 on
  // either axis is a flat one.
  const mouthMode = "biradial";
  const [thetaH, setThetaH] = useState(90);
  const [thetaV, setThetaV] = useState(40);
  const [arcH, setArcH] = useState(480);
  const [arcV, setArcV] = useState(213);
  const [fcSolve, setFcSolve] = useState(null);
  const [dlSolve, setDlSolve] = useState(null);
  // "flow" = every boundary point on its own trajectory, so neighbours share
  // their boundary and cannot overlap. "swept" = per-cell sections in
  // specified planes, which trades that for centreline freedom.
  // Swept only. The flowed construction guarantees non-overlap by SHARING
  // boundary points between neighbours, and that same sharing is what makes
  // per-cell path length structurally impossible — a shared point cannot follow
  // two different paths. It survives in the model as the comparison baseline
  // the tests measure against, but it is not a design choice offered here.
  const sectionMode = "swept";
  // the wave travels through the OPEN passage, not the gross cell outline
  const [profileArea, setProfileArea] = useState("open");
  const [fTarget, setFTarget] = useState(20000);
  const [dividerEndFrac, setDividerEndFrac] = useState(0.35);
  // null = no expansion law, the emergent schedule. A number is the Hypex T:
  // 0 hyperbolic (cosh), 1 exponential.
  const [profileT, setProfileT] = useState(0.7);
  // a target cutoff to compare against, NOT an input to the profile — m is
  // solved from the geometry, so fc is a result and this is the readout that
  // says how far the geometry is from delivering the one you wanted
  const [fcWanted, setFcWanted] = useState(500);
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
  // No derived apex any more: the launch direction is computed inside the
  // model from R and the exit half-angle, and the omega readouts that were
  // the apex's last consumer are gone — per-cell solid angle at a reference
  // point stops predicting the pattern once the mouth radiates as one
  // coupled surface, so it was removed rather than surfaced.
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
  // deferred to a timeout: the previous grid stays on screen, dimmed, until the
  // new one is ready. The cleanup also coalesces a slider drag, so only the
  // last request in a burst is ever solved.
  //
  // alphaAt rides along because everything downstream reads the built layout,
  // never the live inputs — see `shown` below.
  const layoutInput = useMemo(() => ({
    family, R, nc, nr, m: shapeOrder, symmetric,
    params: pReq, seed, seedObj,
    rings: rings.length ? rings : [1, 6, 12], bm, bp,
    t: thickness, c, nParams: cfg.nParams, alphaAt: cfg.alphaAt,
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
  // deferring it would only show an empty frame. The input is kept WITH the
  // layout it produced, because a deferred build means the two can disagree.
  const [built, setBuilt] = useState(() => ({ in: layoutInput, out: buildFrom(layoutInput) }));
  const stale = built.in !== layoutInput;

  useEffect(() => {
    if (!stale) return;
    const id = setTimeout(() => setBuilt({ in: layoutInput, out: buildFrom(layoutInput) }), 30);
    return () => clearTimeout(id);
  }, [layoutInput, stale]);

  const layout = built.out;
  // EVERYTHING that describes the grid on screen must read `shown`, not the
  // live inputs. The inputs update on the keystroke; the layout is one deferred
  // build behind them. Pairing live n_cols with the previous throat handed the
  // mouth mapping 18 cells and a 5-column grid to put them in, and the render
  // died on the sixth column's undefined corners — a blank page, not a glitch.
  const shown = built.in;
  const throat = layout.throat;
  const solve = layout.solve;
  // The sliders are the one exception: they are the request UI, so they render
  // from the live cfg. Their "achieved" column has to fall back to the request
  // until the solve that answers it exists.
  const pOut = !stale && solve.p && solve.p.length === cfg.nParams ? solve.p : pReq;
  // Where the number of cells meeting is not four. For the H-grid these are the
  // four corners of the reference square, wherever the seed map puts them.
  const singular = useMemo(() => {
    if (layout.family === "hgrid" && layout.seedObj)
      return [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]) => layout.seedObj.map(u, v));
    if (layout.mesh) return layout.mesh.singular.map((ni) => G.nodeXY(layout.mesh, ni));
    return [];
  }, [layout]);
  const alphaEff = shown.family === "hgrid" && solve.p ? solve.p[shown.alphaAt] * R2D : 45;

  // The mouth's own chord extents, derived from the two arcs. Everything that
  // used to read the mouthW/mouthH inputs now reads these, so the plan view and
  // the aspect guidance describe the aperture actually being built.
  const mouthGeo = useMemo(() => G.biradialMouth({
    thetaH, thetaV, arcH, arcV, depth, nc: shown.nc || 6, nr: shown.nr || 3,
  }), [thetaH, thetaV, arcH, arcV, depth, shown]);
  const mouthW = mouthGeo.width, mouthH = mouthGeo.height;
  // a solver readout describes the geometry it was run against — clear it the
  // moment that geometry moves, or a stale "depth X → Y Hz" sits beside inputs
  // it no longer belongs to
  useEffect(() => { setFcSolve(null); setDlSolve(null); }, [thetaH, thetaV, arcH, arcV, profileT, fcWanted]);
  // EVERY depth solve runs from the same reference state for the two straight
  // runs — divergence 0, arrival 0 — and resets the sliders to it. A solve is
  // then a repeatable reference point rather than a function of wherever the
  // last experiment left the runs; the sliders stay live afterwards, and
  // lengthening the arrival run FROM the solved state is the experiment
  // (it holds the path straight off the aperture and pushes the turning back
  // toward the throat, where the section is small).
  const RUN_DEFAULTS = { divergeLen: 0, arriveLen: 0 };
  const solveRefOpts = () => {
    setDivergeLen(RUN_DEFAULTS.divergeLen);
    setArriveLen(RUN_DEFAULTS.arriveLen);
    return { ...mapOpts, ...RUN_DEFAULTS };
  };
  // THE DEPTH THAT EQUALISES PATH LENGTH. When the mouth's curvature centre
  // lands on the throat the mouth IS a sphere about the throat, so every cell
  // is equidistant and dL collapses. That happens at depth ~ the mouth radius;
  // measured optima run about 9% deeper because the paths curve rather than
  // running straight. Both radii have to be close for it to work, which pins
  // the aspect ratio near Th_h/Th_v — see the note under the drawing.
  const depthEqualising = useMemo(() => {
    const rH = mouthGeo.rH, rV = mouthGeo.rV;
    const fin = [rH, rV].filter((x) => isFinite(x));
    if (!fin.length) return null;
    return 1.09 * (fin.reduce((a, b) => a + b, 0) / fin.length);
  }, [mouthGeo]);

  // ONE options object for the mapping and BOTH depth solvers. The fc solver
  // used to assemble its own copy and left arcH/arcV out of it, so it silently
  // solved the default 480x213 mouth whatever the sliders said — right at the
  // defaults, 17 Hz off at a 600 mm arc, worse further out. Shared, the two
  // solvers cannot drift from the mapping again.
  const mapOpts = useMemo(() => ({
    c: shown.c, nc: shown.nc, nr: shown.nr, R: shown.R, rectangular: layout.rectangular,
    exitHalfAngle: exitAngle,
    divergeLen, arriveLen, tight, fTarget, dividerEndFrac, stations,
    // the profile is written on the OPEN passage, so it needs the divider
    // thickness — without this it silently falls back to the gross outline
    t: thickness, profileArea,
    tightThroat: tightSplit ? tightThroat : tight, tightMouth: tightSplit ? tightMouth : tight,
    mouthMode, thetaH, thetaV, arcH, arcV, sectionMode,
    wallWidthAt: arcH / shown.nc,
  }), [layout, shown, exitAngle, divergeLen, arriveLen,
    tight, tightSplit, tightThroat, tightMouth, thetaH, thetaV, arcH, arcV,
    fTarget, dividerEndFrac, stations, thickness, profileArea]);

  // The clearance is skipped HERE and measured in the deferred effect below:
  // it costs ~5x the rest of the mapping (measured ~100 ms against ~20), and
  // inside this memo every tick of the depth or T slider paid for it.
  const map = useMemo(() => G.mapThroatToMouth(throat, {
    ...mapOpts, depth, profileT, keepGeometry: true, computeClearance: false,
  }), [throat, mapOpts, depth, profileT]);

  // Same treatment as the equal-area solve: the mapping's own numbers track
  // the sliders live, the clearance follows a beat later, and everything that
  // reads it shows a solving mark meanwhile. The timeout also coalesces a
  // drag, so only the last mapping in a burst is ever measured.
  const [clr, setClr] = useState(null);
  useEffect(() => {
    if (!map || !map.rows.length || !map.rows[0].sched[0].pts) { setClr(null); return; }
    const id = setTimeout(() => setClr({ of: map, value: G.ductClearance(map.rows) }), 30);
    return () => clearTimeout(id);
  }, [map]);
  const clearance = clr && clr.of === map ? clr.value : null;

  // What path length would deliver the cutoff you asked for? m is solved from
  // the geometry, so fc comes out rather than going in — the only honest way to
  // put a target fc to this tool today is to invert the same relation for the
  // LENGTH it needs and show it against the length the cells have. Once the
  // path is independently controllable that shortfall becomes something to
  // close; until then it is the number that says how far off the geometry is.
  const fcReq = useMemo(() => {
    if (!map || profileT == null || !map.rows.length || !map.rows[0].profRatio) return { ok: false };
    const mWant = G.hypexMForFc(fcWanted, shown.c);
    const need = map.rows.map((r) => G.hypexLengthForRatio(r.profRatio, mWant, profileT));
    if (need.some((x) => x == null || !isFinite(x))) return { ok: false };
    const lo = Math.min(...need), hi = Math.max(...need);
    // per cell, because each has its own path length to make up
    const shortfall = Math.max(...map.rows.map((r, i) => need[i] - r.Lpath));
    return { ok: true, lo, hi, shortfall };
  }, [map, profileT, fcWanted, shown]);

  // The 1-D Hypex horn this multicell is standing in for: same acoustic throat,
  // same law, same cutoff. Advisory — it says what the cutoff demands, and the
  // geometry below says what you have.
  const href = useMemo(() => G.hypexReference({
    throatArea: throat.openTotal, fc: fcWanted, T: profileT, c,
    coverageDeg: mouthMode === "arc" ? thetaH : 90,
  }), [throat, fcWanted, profileT, c, mouthMode, thetaH]);

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
          c, nc, nr, R, rectangular: true, depth, mouthMode: "biradial", thetaH, thetaV, arcH, arcV,
          exitHalfAngle: exitAngle, divergeLen, tight, fTarget, samples: 16, stations: 6, wallWidthAt: arcH / nc,
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
      w.push(`Largest total turning angle is ${fmt(map.turnMax, 1)}° against a ${fmt(map.turnLimitDeg, 1)}° limit (w·θ < λ/8 at ${fmt(arcH / shown.nc, 0)} mm cell width). A symmetric S-bend is wall-length balanced; a single bend is not.`);
    if (map && clearance && clearance.overlap > 1e-3)
      w.push(`Swept sections interpenetrate ${fmt(clearance.overlap, 3)} mm at station ${clearance.overlapAt}, over ${clearance.overlapStations} station(s). This is the trade the mode makes on purpose — the ends stay shared, the interior does not — but it is not yet resolved: lower T pulls the sections further inward, and centreline manipulation is the stronger lever that is not built. Note the section scale reads k = ${fmt(map.profScaleMax, 4)} ≤ 1, which proves non-overlap ONLY for flowed sections; here it says nothing.`);
    if (map && map.profScaleMax != null && map.profScaleMax > 1 + 1e-6)
      w.push(`The expansion profile asks for more area than the tiling configuration has: section scale reaches k = ${fmt(map.profScaleMax, 4)} against a ceiling of 1. Scaling a section about its centroid by k ≤ 1 can only move it AWAY from its neighbours, so k > 1 is the one way this construction pushes ducts into each other — verified by ray cast to produce real interpenetration at exactly the stations where it exceeds 1. Lower T (toward cosh) to stay inside the tiling, or lengthen the path so the profile has room to reach the mouth area more gently.${clearance && clearance.overlap > 0 ? ` The geometry measurement agrees independently and says how deep: the ducts interpenetrate ${fmt(clearance.overlap, 4)} mm at station ${clearance.overlapAt}, over ${clearance.overlapStations} station(s).` : ""}`);
    if (map && clearance && profileT != null && clearance.minMid < 1e-3 && !(map.profScaleMax > 1 + 1e-6))
      w.push(`The narrowest duct-to-duct gap is ${fmt(clearance.minMid, 4)} mm at station ${clearance.minMidAt} — the ducts are touching even though the section scale stayed within k ≤ 1. Read the narrowest gap, not the widest: the widest is ${fmt(clearance.max, 2)} mm here and says nothing about whether the ducts are separate.`);
    // Only one fc when dL is small — past a few percent the horn does not have
    // one cutoff, and the honest report is the range plus the lever.
    if (map && profileT != null && map.fcDecomp && map.fcDecomp.full > 3)
      w.push(`f_c spans ${fmt(map.fcDecomp.lo, 0)}–${fmt(map.fcDecomp.hi, 0)} Hz across cells — a ${fmt(map.fcDecomp.full, 1)}% spread, so the horn does not have one cutoff. Path length dominates it (${fmt(map.fcDecomp.fromLength, 1)}% alone), so the lever is ΔL: move depth toward the equalising optimum, and the equal-area horn becomes the equal-f_c horn (measured 0.5% spread at the dL optimum).`);
    if (map && map.aimMax > map.aimLimitDeg)
      w.push(`Aim error reaches ${fmt(map.aimMax, 1)}° against a ${fmt(map.aimLimitDeg, 1)}° tangency tolerance. Shape the aperture surface from the directivity requirement first — a surface chosen for routing radiates its own curvature error phase-coherently and no EQ removes it.`);
    if (shown.family === "hgrid" && solve.converged && solve.monotone && solve.monotone.gap < 0.02)
      w.push(`Two grid lines come within ${solve.monotone.gap.toExponential(2)} of each other in parameter space — the areas are equal but a cell is pinched to nearly nothing there, which will not print and will not behave like a duct. Ease the bow, raise the shape order m, or move the corner angle.`);
    if (throat.curvatureFlagged)
      w.push(`${throat.curvatureFlagged} cell(s) have edge curvature strong relative to their own short dimension. The flat-rectangle first-mode model errs as O((L/r_curv)²) with the sign not established — verify these in ABEC.`);
    if (map && map.rows.some((r) => r.runNeeded && r.straightAvail < r.runNeeded))
      w.push(`Some cells have less straight run before the trailing edge than the three evanescent decay lengths they need. Below cut-on the field decays as exp(−α x) with α = (2π/c)·√(f1²−f²); a bend inside that distance re-excites what the duct just suppressed.`);
    if (shown.family !== "hgrid")
      w.push(`${shown.family === "ogrid" ? "An O-grid" : "A butterfly"} throat has no cell-for-cell match to a rectangular mouth grid — that is a property of its topology, not a gap in the tool. The mouth mapping below is inactive; the throat metrics are still valid and comparable at equal N.`);
    return w;
  }, [solve, throat, shown, thickness, fab, map, clearance, profileT, fTarget]);

  // ── exports ────────────────────────────────────────────────────────────────
  const stem = `gingko_${fmt(exitDia, 1)}mm_${shown.family === "hgrid" ? `${shown.nc}x${shown.nr}` : shown.family}_${throat.N}cells`;

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
    tool: "gingko multicell horn",
    units: "mm, Hz, degrees",
    driver: { exitDiameter: exitDia, exitHalfAngle: exitAngle, temperature, speedOfSound: c },
    topology: {
      family: shown.family, nCols: shown.nc, nRows: shown.nr,
      rings: shown.family === "ogrid" ? shown.rings : undefined,
      core: shown.family === "butterfly" ? { m: shown.bm, p: shown.bp } : undefined,
      cornerAlphaDeg: alphaEff, equalArcAlphaDeg: G.equalArcAlphaDeg(shown.nc, shown.nr),
      seed, singularVertices: singular.length,
      lineShapes: shown.family === "hgrid" ? {
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
    aperture: map && map.biradial ? {
      type: "biradial swept arc, no apex",
      coverageDeg: { h: thetaH, v: thetaV },
      arcLength: { h: arcH, v: arcV },
      radius: { h: map.biradial.rH, v: map.biradial.rV },
      sagitta: { h: map.biradial.sagH, v: map.biradial.sagV },
      chord: { w: map.mouthWEff, h: map.mouthHEff },
      axialDepth: depth, mouthAreaTotal: map.mouthAreaTotal,
    } : null,
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
        stations: r ? r.sched.map((st, q) => (st.pts && map ? (map.sectionAt(q).find((x) => x && x.id === cc.id) || {}).pts.map((p) => p.map((v) => +v.toFixed(4))) : null)) : null,
      };
    }),
  }, null, 1);

  const buildCSV = () => {
    // an export must not wait on the deferred measurement — compute it on the
    // spot if the click beat the timeout
    const clrNow = clearance || (map && map.rows.length && map.rows[0].sched[0].pts
      ? G.ductClearance(map.rows) : null);
    const head = [
      "cell", "i", "j", "kind", "area_mm2", "open_area_mm2", "L_long_mm", "L_short_mm",
      "aspect", "diameter_mm", "convex", "pw_floor_Hz", "min_curv_radius_mm", "curvature_flag",
      "f1_Hz", "f1_model", "centroid_x", "centroid_y",
      "path_length_mm", "s_pad_mm", "turn_deg", "twist_deg", "aim_err_deg",
      "f1_at_divider_end_Hz", "decay_len_mm", "straight_run_needed_mm", "straight_run_avail_mm",
      // the expansion profile, per cell. Empty when no law is imposed.
      "profile_T", "hypex_m_per_mm", "fc_Hz", "expansion_ratio", "k_min", "k_max", "min_gap_mm",
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
        profileT != null ? profileT.toFixed(4) : "",
        r && r.profM != null ? r.profM.toExponential(6) : "",
        r && r.profFc != null ? r.profFc.toFixed(2) : "",
        r && r.profRatio != null ? r.profRatio.toFixed(6) : "",
        r && r.profM != null ? r.profScaleMin.toFixed(6) : "",
        r && r.profM != null ? r.profScaleMax.toFixed(6) : "",
        clrNow && clrNow.perCell.has(cc.id) && profileT != null
          ? clrNow.perCell.get(cc.id).toFixed(4) : "",
      ].join(",");
    });
    return [head, ...rows].join("\n");
  };

  const buildSigmaCSV = () => {
    if (!map) return "";
    const head = "station,s,axial_z_mm,developed_s_mm,section_area_mm2,flux_area_mm2,equivalent_diameter_mm";
    const rows = map.sigma.map((g, q) =>
      [q, g.s.toFixed(4), g.zMean.toFixed(3), g.sMean.toFixed(3), g.area.toFixed(3),
       g.axial.toFixed(3), (2 * Math.sqrt(g.axial / Math.PI)).toFixed(3)].join(","));
    return [
      "# Sum of cell cross-sections along the loft, for Hornresp / ABEC.",
      "# s is the fraction of each cell's own developed path, so axial_z and",
      "# developed_s are MEANS across cells whose paths differ in length.",
      "# Both are measured at the SECTION CENTROIDS, not on the centreline:",
      "# the two drift apart by up to ~4.5 mm on a wide-coverage mouth, and",
      "# attributing an area to the centreline's position would put the",
      "# schedule that far out of register with the areas it reports.",
      "# section_area is the sections' own area; flux_area is their projection",
      "# on the direction of travel. A flowed section is a level set of the",
      "# flow, not a cut square to the path, so the two differ by the section's",
      "# obliquity. USE flux_area for a 1-D horn schedule — it is the",
      "# cross-section normal to propagation, and equivalent_diameter follows",
      "# it. It is NOT exactly what integrates to the duct volume: that is the",
      "# vector area dotted with the centroid step, which differs because",
      "# flux_area projects on the centreline tangent while the volume",
      "# advances along the section's own displacement.",
      profileT != null
        ? `# Hypex expansion profile imposed, T = ${profileT.toFixed(3)}, f_c = ${fmt(map.profFcMin, 0)}-${fmt(map.profFcMax, 0)} Hz.`
        : "# NO expansion law is imposed: this schedule is whatever the routing produced.",
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
  // ── HORIZONTAL CROSS-SECTION ───────────────────────────────────────────────
  // Looking down on the horn: the throat plane at left, the mouth arc at right,
  // and the centreline of every cell in the middle row drawn between them. This
  // is the view that shows WHY the path lengths differ — the mouth curves away
  // from the throat, so the outer cells reach further — and it is the one to
  // watch while depth is varied, because the whole point is to find the depth
  // at which the mouth's curvature centre lands on the throat and every cell
  // becomes equidistant.
  const crossSVG = () => {
    if (!map || !map.rows.length || !map.rows[0].sched[0].origin)
      return <div style={{ fontSize: 11, color: C.inkMuted, padding: 20 }}>No mapping to draw.</div>;
    const midJ = Math.floor(shown.nr / 2);
    const band = map.rows.filter((r) => r.j === midJ);
    if (!band.length) return null;

    // world (x, z) -> screen; z runs left to right, x runs up the page
    const zMax = depth * 1.14, xMax = Math.max(mouthW / 2, 40) * 1.16;
    const vb = `${-zMax * 0.09} ${-xMax} ${zMax * 1.09} ${2 * xMax}`;
    const sw = zMax * 0.0022;
    const els = [];

    // axis of symmetry
    els.push(<line key="ax" x1={-zMax * 0.06} y1={0} x2={zMax} y2={0}
      stroke={C.inkMuted} strokeWidth={sw * 0.8} strokeDasharray={`${sw * 5} ${sw * 7}`} opacity={0.5} />);

    // throat plane — the driver mating face, flat by construction
    els.push(<line key="th" x1={0} y1={-R} x2={0} y2={R}
      stroke={C.accent} strokeWidth={sw * 3.2} strokeLinecap="round" />);
    els.push(<text key="thl" x={-zMax * 0.012} y={R + xMax * 0.075} fill={C.inkDim}
      fontSize={xMax * 0.055} fontFamily={C.mono} textAnchor="middle">throat</text>);

    // mouth arc, traced along the horizontal edge of the aperture
    const arcPts = [];
    for (let u = 0; u <= 48; u++) {
      const P = mouthGeo.point((u / 48) * shown.nc, shown.nr / 2);
      arcPts.push([P[2], P[0]]);
    }
    els.push(<path key="mo" d={"M" + arcPts.map(([z, x]) => `${z.toFixed(2)},${(-x).toFixed(2)}`).join(" L")}
      fill="none" stroke={C.series2} strokeWidth={sw * 3.2} strokeLinecap="round" />);
    els.push(<text key="mol" x={arcPts[0][0]} y={-arcPts[0][1] - xMax * 0.045} fill={C.series2}
      fontSize={xMax * 0.055} fontFamily={C.mono} textAnchor="middle">mouth</text>);

    // each centreline in the middle row, coloured by how far it is from the mean
    const Ls = band.map((r) => r.Lpath);
    const Lmean = Ls.reduce((a, b) => a + b, 0) / Ls.length;
    const spread = Math.max(1e-6, map.Lmax - map.Lmin);
    band.forEach((r) => {
      const pts = r.sched.map((st) => [st.origin[2], st.origin[0]]);
      const dev = (r.Lpath - Lmean) / spread;          // -0.5 short .. +0.5 long
      const col = dev < -0.08 ? C.series5 : dev > 0.08 ? C.series1 : C.series4;
      els.push(<path key={`c${r.id}`}
        d={"M" + pts.map(([z, x]) => `${z.toFixed(2)},${(-x).toFixed(2)}`).join(" L")}
        fill="none" stroke={col} strokeWidth={sw * 2.2} strokeLinecap="round"
        opacity={hover === r.id ? 1 : 0.85}
        onMouseEnter={hoverEnter(r.id)} onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }} />);
      // rough duct extent: the section's own horizontal spread at each station
      const hi = [], lo = [];
      r.sched.forEach((st) => {
        if (!st.pts) return;
        let a = Infinity, b = -Infinity;
        for (const q of st.pts) { if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; }
        hi.push([st.origin[2], b]); lo.push([st.origin[2], a]);
      });
      if (hi.length) els.push(<path key={`w${r.id}`}
        d={"M" + hi.map(([z, x]) => `${z.toFixed(2)},${(-x).toFixed(2)}`).join(" L")
          + " L" + lo.reverse().map(([z, x]) => `${z.toFixed(2)},${(-x).toFixed(2)}`).join(" L") + " Z"}
        fill={col} fillOpacity={0.10} stroke="none" style={{ pointerEvents: "none" }} />);
    });

    // depth dimension
    const yDim = xMax * 0.88;
    els.push(<line key="dl" x1={0} y1={yDim} x2={depth} y2={yDim} stroke={C.inkMuted} strokeWidth={sw} />);
    els.push(<line key="dl0" x1={0} y1={yDim - xMax * 0.03} x2={0} y2={yDim + xMax * 0.03} stroke={C.inkMuted} strokeWidth={sw} />);
    els.push(<line key="dl1" x1={depth} y1={yDim - xMax * 0.03} x2={depth} y2={yDim + xMax * 0.03} stroke={C.inkMuted} strokeWidth={sw} />);
    els.push(<text key="dlt" x={depth / 2} y={yDim - xMax * 0.028} fill={C.inkDim}
      fontSize={xMax * 0.055} fontFamily={C.mono} textAnchor="middle">depth {fmt(depth, 0)}</text>);

    return <svg viewBox={vb} width="100%" style={{ display: "block", maxHeight: 340 }}>{els}</svg>;
  };

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
          GINGKO MULTICELL HORN
        </h1>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
          Equal-area row-and-column partition of a compression driver exit · independent grid-line curvature · per-cell ducts under an imposed Hypex expansion, routed to a biradial coverage mouth
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
                    // Per-slider reset. Every bow parameter is nominally zero, so on
                    // those this is literally a zero button and says so; a position is
                    // nominally its even spacing and alpha the equal-arc angle, and
                    // zero is meaningless for one and outside the range of the other,
                    // so there it returns that slider to its own nominal instead.
                    const nomVal = isAlpha ? nominal[i] * R2D : nominal[i];
                    const atNom = Math.abs(val - nomVal) <= (isAlpha ? 5e-3 : 5e-5);
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
                          <button
                            onClick={() => { const q = pReq.slice(); q[i] = nominal[i]; setRequest(q); }}
                            disabled={atNom}
                            title={`reset this slider to ${nomVal.toFixed(isAlpha ? 2 : 4)}${isAlpha ? "°" : ""}`}
                            style={{
                              ...btn(false, C.series5), padding: "0 5px", lineHeight: 1.6, minWidth: 18,
                              color: atNom ? C.inkMuted : C.series5,
                              borderColor: atNom ? C.border : C.series5,
                              opacity: atNom ? 0.35 : 1, cursor: atNom ? "default" : "pointer",
                            }}>
                            {nomVal === 0 ? "0" : "\u21ba"}
                          </button>
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
              {stale && <Solving label="re-solving — figures below are the previous grid" />}
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

      {/* HORIZONTAL CROSS-SECTION — the view that shows path length differing */}
      {map && (
        <div style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ ...secTitle, marginBottom: 0 }}>Horizontal section</span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
              middle row · centrelines and rough duct extent
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 14, fontFamily: C.mono, fontSize: 11 }}>
              <span><span style={{ color: C.inkMuted }}>ΔL </span>
                <span style={{ color: map.dLfrac <= 0.125 ? C.series4 : map.dLfrac <= 0.25 ? C.series1 : C.series5 }}>
                  {fmt(map.dL, 1)} mm</span>
                <span style={{ color: C.inkMuted }}> · {fmt(map.dL / (map.lambda / 8), 1)}× the λ/8 budget</span></span>
              {depthEqualising && (
                <span><span style={{ color: C.inkMuted }}>equalising depth ≈ </span>
                  <span style={{ color: C.series4 }}>{fmt(depthEqualising, 0)} mm</span>
                  {/* the seed is the closed-form argument; the button runs the
                      golden section on the REAL dL through the forward model
                      and lands on the measured optimum, not the estimate */}
                  <button onClick={() => {
                    const r = G.solveDepthForMinDL(throat, solveRefOpts());
                    setDlSolve(r);
                    if (r.ok) setDepth(Math.round(r.depth));
                  }} style={{ ...btn(false, C.series4), marginLeft: 6 }}>solve min ΔL</button>
                  {dlSolve && (dlSolve.ok
                    ? <span style={{ marginLeft: 6 }}><span style={{ color: C.inkMuted }}>→ depth </span>
                        <span style={{ color: C.series4 }}>{fmt(dlSolve.depth, 0)} mm</span>
                        <span style={{ color: C.inkMuted }}> at ΔL {fmt(dlSolve.dL, 2)} mm{dlSolve.atBound ? " — at the search bound, not an interior optimum" : ""}</span></span>
                    : <span style={{ marginLeft: 6, color: C.series5 }}>{dlSolve.reason}</span>)}</span>
              )}
            </span>
          </div>
          <div style={{ opacity: stale ? 0.35 : 1 }}>{crossSVG()}</div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 2, flexWrap: "wrap", fontSize: 10 }}>
            <span style={{ color: C.series5 }}>━ shorter than mean</span>
            <span style={{ color: C.series4 }}>━ near mean</span>
            <span style={{ color: C.series1 }}>━ longer than mean</span>
          </div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
            Watch this while moving <strong style={{ color: C.inkDim }}>axial depth</strong>. Shallow, and the mouth curves away from the
            throat so the outer cells reach further — they are the long ones. Deep, and the mouth flattens out ahead of the throat so the
            centre cell becomes the long one. Between the two there is a depth where the mouth's curvature centre sits ON the throat, the
            mouth is momentarily a sphere about it, and <strong style={{ color: C.inkDim }}>every cell is the same distance away</strong>.
            Measured at 90°×40° with a 600 mm arc, ΔL falls from 81 mm at 200 mm depth to <strong style={{ color: C.inkDim }}>2.0 mm at
            425 mm</strong> — from 38× the phase budget to about 1×, with no path manipulation at all.
            {" "}It needs <em>both</em> mouth radii to land together, so the aspect ratio is not free: ΔL is lowest near
            arc<sub>h</sub>/arc<sub>v</sub> ≈ Θh/Θv, and rises steeply away from it (2.4 mm at matched radii, 9.2 mm at aspect 1.4 for
            90°×40°). The minimum is broad, so near enough is enough.
            {" "}Note the over-determination: the dL rule ties depth to the mouth radius while the expansion law ties mouth area to path
            length, so of <strong style={{ color: C.inkDim }}>{"{f_c, mouth size, dL-optimal depth}"}</strong> you may pick any two — the
            third follows. This button spends depth on ΔL; the f_c solve below spends it on the cutoff. They fight over the same knob.
          </div>
        </div>
      )}

      {/* HYPEX EXPANSION — the design intent, before any geometry */}
      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ ...secTitle, marginBottom: 0 }}>Hypex expansion</span>
          <span style={{ fontSize: 10, color: C.inkMuted }}>T</span>
          <input type="range" min={0} max={1} step={0.01} value={profileT}
            onChange={(e) => setProfileT(parseFloat(e.target.value))}
            style={{ width: 150, accentColor: C.series3 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>
            {fmt(profileT, 2)} · {profileT < 0.02 ? "hyperbolic (cosh²)" : profileT > 0.98 ? "exponential" : "hypex"}
          </span>
          <NumInput label="Cutoff f_c" value={fcWanted} onChange={setFcWanted} unit="Hz" min={20} max={20000} step={10} accent={C.series3} />
        </div>
        {href && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <Metric label="Acoustic throat" value={`${fmt(throat.openTotal / 100, 2)} cm²`}
              sub={`summed open area · ⌀${fmt(2 * href.rt, 1)} mm equivalent`} />
            <Metric label="Flare constant m" value={`${(href.m * 1000).toFixed(3)} /m`}
              sub={`f_c = mc/2π at ${fmt(c, 1)} m/s`} />
            <Metric label="Mouth area needed" value={`${fmt(href.mouthArea / 100, 0)} cm²`}
              sub={`⌀${fmt(href.dia, 0)} mm · ${href.governedBy} governs`} color={C.series3} />
            <Metric label="Minimum horn length" value={`${fmt(href.minLength, 0)} mm`}
              sub={`expansion ratio ${fmt(href.ratio, 1)}×`} color={C.series3} />
            {map && <Metric label="Mouth you have" value={`${fmt(map.mouthAreaTotal / 100, 0)} cm²`}
              sub={map.mouthAreaTotal >= href.mouthArea
                ? `${fmt(map.mouthAreaTotal / href.mouthArea, 2)}× the requirement`
                : `${fmt(100 * (1 - map.mouthAreaTotal / href.mouthArea), 0)}% under`}
              color={map.mouthAreaTotal >= href.mouthArea ? C.series4 : C.series5} />}
            {map && <Metric label="Path you have" value={`${fmt(map.Lmin, 0)}–${fmt(map.Lmax, 0)} mm`}
              sub={map.Lmin >= href.minLength
                ? `clears the ${fmt(href.minLength, 0)} mm minimum`
                : `short of ${fmt(href.minLength, 0)} mm by ${fmt(href.minLength - map.Lmin, 0)} mm`}
              color={map.Lmin >= href.minLength ? C.series4 : C.series5} />}
          </div>
        )}
        <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
          The same calculation the standalone horn tool does, run on this multicell's <strong style={{ color: C.inkDim }}>acoustic</strong> throat —
          the summed open area of the cells, not the driver's bore, because the dividers are in the way and the wave only sees what is left.
          Two criteria compete for the mouth size: <em>loading</em> wants a mouth circumference of about λ at cutoff (⌀{fmt(href ? href.diaLoading : 0, 0)} mm here),
          and <em>directivity</em> wants λ/sin(Θ/2) (⌀{fmt(href ? href.diaDirectivity : 0, 0)} mm). The larger binds. Note the direction:
          <strong style={{ color: C.inkDim }}> wider coverage needs a smaller mouth</strong>, so it is the narrow-pattern horn that comes out enormous.
          {" "}These are <strong style={{ color: C.inkDim }}>reference</strong> figures, not constraints — the mouth below comes from the coverage and
          cap geometry, and these say how far short of the 1-D requirement it falls.
        </div>
      </div>

      {/* THROAT + MOUTH */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(300px, 1.15fr)", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ ...secTitle, display: "flex", alignItems: "baseline", gap: 8 }}>
              Throat plane · looking into the driver
              {stale && <Solving />}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11 }}>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} style={{ accentColor: C.series4 }} />
              <span style={{ color: C.inkDim }}>labels</span>
            </label>
          </div>
          <div style={{ opacity: stale ? 0.35 : 1 }}>{throatSVG()}</div>
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
            {stale && <Solving />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 10px" }}>
            <NumInput label="Coverage Θh" value={thetaH} onChange={setThetaH} unit="°" min={0} max={170} step={1} accent={C.accent} />
            <NumInput label="Arc length h" value={arcH} onChange={setArcH} unit="mm" min={40} max={3000} step={5} accent={C.accent} />
            <NumInput label="Coverage Θv" value={thetaV} onChange={setThetaV} unit="°" min={0} max={170} step={1} accent={C.series2} />
            <NumInput label="Arc length v" value={arcV} onChange={setArcV} unit="mm" min={40} max={3000} step={5} accent={C.series2} />
            <NumInput label="Axial depth" value={depth} onChange={setDepth} unit="mm" min={10} max={2000} step={5} />
          </div>
          {map && map.biradial && (
            <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
              <span><span style={{ color: C.inkMuted }}>radii </span>
                <span style={{ color: C.ink }}>
                  {isFinite(map.biradial.rH) ? `${fmt(map.biradial.rH, 0)}` : "flat"} h ·{" "}
                  {isFinite(map.biradial.rV) ? `${fmt(map.biradial.rV, 0)}` : "flat"} v</span>
                <span style={{ color: C.inkMuted }}> mm</span></span>
              <span><span style={{ color: C.inkMuted }}>chord </span>
                <span style={{ color: C.ink }}>{fmt(map.mouthWEff, 1)} × {fmt(map.mouthHEff, 1)} mm</span></span>
              <span><span style={{ color: C.inkMuted }}>sagitta </span>
                <span style={{ color: C.ink }}>{fmt(map.biradial.sagH, 1)} / {fmt(map.biradial.sagV, 1)} mm</span></span>
              <span><span style={{ color: C.inkMuted }}>area </span>
                <span style={{ color: C.ink }}>{fmt(map.mouthAreaTotal / 100, 0)} cm²</span>
                <span style={{ color: C.inkMuted }}> · per-cell spread </span>
                <span style={{ color: map.mouthAreaSpread < 0.1 ? C.series4 : C.series5 }}>{fmt(map.mouthAreaSpread, 4)}%</span></span>
            </div>
          )}
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            The aperture is stated by what it has to deliver — a horizontal arc of Θh over its own length, and a vertical arc of Θv over
            its own — and the two radii are <strong style={{ color: C.inkDim }}>independent</strong>. Θ = 0 on either axis makes that axis
            flat, so a vertically straight-sided mouth is just Θv = 0. There is <strong style={{ color: C.inkDim }}>no apex</strong>: it was
            an artifact of building the mouth as one spherical cap, which forced both curvatures to be the same number. Ducts arrive normal
            to the surface, which is the direction the aperture itself points, so no common radiating centre is needed to define it.
            Cells subdivide at equal <em>area</em> on both axes at every curvature — exactly equal when an axis is flat — which is what keeps
            the expansion ratio identical across cells. Axial depth is the free variable the path optimiser will take over; for now set it
            here or solve it from the cutoff below.
          </div>
          <div style={{ opacity: stale ? 0.35 : 1 }}>{mouthSVG()}</div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
            Choose the aperture from the <strong style={{ color: C.inkDim }}>directivity</strong> requirement — the two coverage angles and the
            arc length each needs — then equalise the paths <em>to</em> it. A surface shaped for routing convenience radiates its own curvature
            error phase-coherently, and no EQ removes that, which is why the mouth is a constraint here and the connection to it is what gets solved.
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
            {profileT != null && hoverRow.profFc != null && <>
              <div><span style={{ color: C.inkMuted }}>f_c </span>{fmt(hoverRow.profFc, 0)} Hz
                <span style={{ color: C.inkMuted }}> · m </span>{hoverRow.profM.toExponential(3)}/mm</div>
              <div><span style={{ color: C.inkMuted }}>scale k </span>
                <span style={{ color: hoverRow.profScaleMax > 1 + 1e-6 ? C.series5 : C.ink }}>
                  {fmt(hoverRow.profScaleMin, 3)}–{fmt(hoverRow.profScaleMax, 3)}</span>
                {hoverRow.profScaleMax > 1 + 1e-6 && <span style={{ color: C.inkMuted }}> · over at station {hoverRow.profKMaxAt}</span>}</div>
              {clearance && clearance.perCell.has(hoverRow.id) && (
                <div><span style={{ color: C.inkMuted }}>
                  {clearance.perCell.get(hoverRow.id) < 0 ? "overlap with neighbour " : "gap to nearest neighbour "}</span>
                  <span style={{ color: clearance.perCell.get(hoverRow.id) < 1e-3 ? C.series5 : C.series4 }}>
                    {fmt(Math.abs(clearance.perCell.get(hoverRow.id)), 3)} mm</span></div>
              )}
            </>}
          </>}
        </div>
      )}

      {/* PATHS */}
      {map && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={secTitle}>Developed path length per cell against the ΔL budget</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.inkMuted }}>divergence run</span>
              <input type="range" min={0} max={40} step={0.5} value={divergeLen} onChange={(e) => setDivergeLen(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: C.series7 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(divergeLen, 1)} mm</span>
              <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: 4 }}>arrival run</span>
              <input type="range" min={0} max={60} step={0.5} value={arriveLen} onChange={(e) => setArriveLen(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: C.series7 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(arriveLen, 1)} mm</span>
              <button onClick={() => { if (!tightSplit) { setTightThroat(tight); setTightMouth(tight); } setTightSplit(!tightSplit); }}
                style={btn(tightSplit, C.series2)}>{tightSplit ? "split tangents" : "one tightness"}</button>
              {!tightSplit ? <>
                <span style={{ fontSize: 10, color: C.inkMuted }}>bend tightness</span>
                <input type="range" min={0.25} max={1.2} step={0.01} value={tight} onChange={(e) => setTight(parseFloat(e.target.value))}
                  style={{ width: 110, accentColor: C.series2 }} />
              </> : <>
                <span style={{ fontSize: 10, color: C.inkMuted }}>throat</span>
                <input type="range" min={0.25} max={1.2} step={0.01} value={tightThroat} onChange={(e) => setTightThroat(parseFloat(e.target.value))}
                  style={{ width: 84, accentColor: C.series2 }} />
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(tightThroat, 2)}</span>
                <span style={{ fontSize: 10, color: C.inkMuted }}>mouth</span>
                <input type="range" min={0.25} max={1.2} step={0.01} value={tightMouth} onChange={(e) => setTightMouth(parseFloat(e.target.value))}
                  style={{ width: 84, accentColor: C.series3 }} />
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(tightMouth, 2)}</span>
              </>}
              <span style={{ fontSize: 10, color: C.inkMuted }}>divider end</span>
              <input type="range" min={0.05} max={1} step={0.01} value={dividerEndFrac} onChange={(e) => setDividerEndFrac(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: C.series6 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{(dividerEndFrac * 100).toFixed(0)}% of the run</span>
            </div>
          </div>
          <div style={{ opacity: stale ? 0.35 : 1 }}>{pathSVG()}</div>
          <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Padding lengthens short paths — it cannot shorten long ones, so the longest cell sets the budget for every other cell.
            ≤ λ/8 is about −0.7 dB on the worst-case pair summation; λ/8 to λ/4 is the amber band; past λ/4 the cells are fighting each other.
            {" "}Divergence run is a straight launch of that exact length, along the local wavefront normal, before any bend starts — direction
            only, it does not hold the cross-section at its throat size; the profile expands from the very first station regardless.
            {" "}The <strong style={{ color: C.inkDim }}>arrival run</strong> is its mirror at the mouth, and the two tangent magnitudes are the
            cubic's only other freedom. Raising the <em>mouth</em> tangent, or lengthening the arrival run, holds the path straight off the
            aperture and forces the turning back toward the throat — which is where you want it, because the section is small there and large
            at the mouth. Past about 1.2 the tangent overshoots into a loop; the turning-angle warning catches it.
            {" "}Both depth solves <strong style={{ color: C.inkDim }}>reset the two runs to 0</strong> as their reference state, so a solve is
            repeatable; adjust the runs afterwards to experiment from that point.
          </div>

          {/* SECTION CONSTRUCTION */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...secTitle, marginBottom: 0 }}>Section construction</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>swept — per-cell planes</span>
              {map.sweptRollMax != null && (
                <span style={{ fontFamily: C.mono, fontSize: 10 }}>
                  <span style={{ color: C.inkMuted }}>imposed roll </span>
                  <span style={{ color: C.ink }}>{fmt(map.sweptRollMax, 1)}°</span>
                  <span style={{ color: C.inkMuted }}> · lands to {map.sweptAimMax.toExponential(0)}°</span>
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
              Each cell's sections are built in planes <strong style={{ color: C.inkDim }}>specified</strong> along its own centreline — ẑ at the
              throat, blending through the tangent to the aperture normal — with the residual roll <strong style={{ color: C.inkDim }}>imposed and
              distributed</strong> so the section lands on the mouth quad rather than arriving rotated. Both end rings are still shared exactly, so
              the driver face stays flat and the mouth still tiles; only the interior is free. That freedom is the point: it is what makes a cell's
              centreline movable, and moving centrelines is the only mechanism that can lengthen an interior cell's path. The interpenetration
              below is its price, and is not yet resolved. Note <em>k</em> ≤ 1 proves nothing here — read the measured clearance.
            </div>
          </div>

          {/* EXPANSION PROFILE */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...secTitle, marginBottom: 0 }}>Per-cell realisation</span>
              {<>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
                  T {fmt(profileT, 2)} · f_c {fmt(fcWanted, 0)} Hz set above
                </span>
                <button onClick={() => setProfileArea(profileArea === "open" ? "gross" : "open")}
                  style={btn(profileArea === "open", C.series6)}>
                  on {profileArea} area
                </button>
                {map.profFcMin != null && (
                  <span style={{ fontFamily: C.mono, fontSize: 10, marginLeft: 6 }}>
                    <span style={{ color: C.inkMuted }}>f_c </span>
                    <span style={{ color: C.series4 }}>{fmt(map.profFcMin, 0)}–{fmt(map.profFcMax, 0)} Hz</span>
                  </span>
                )}
              </>}
            </div>
            {profileT != null && !clearance && <div style={{ marginTop: 6 }}><Solving label="measuring clearance" /></div>}
            {profileT != null && clearance && (
              <div style={{ marginTop: 6, display: "flex", gap: 18, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
                {/* The NARROWEST gap is the one that says whether you have separate
                    ducts at all. The widest is next to it because it is the one the
                    eye reads off the section plot, and on its own it is reassuring
                    while the ducts are touching somewhere else entirely. */}
                {clearance.overlap > 0
                  ? <span><span style={{ color: C.inkMuted }}>ducts INTERPENETRATE </span>
                      <span style={{ color: C.series5 }}>{fmt(clearance.overlap, 3)} mm deep</span>
                      <span style={{ color: C.inkMuted }}> at station {clearance.overlapAt}, {clearance.overlapStations} station(s)</span></span>
                  : <span><span style={{ color: C.inkMuted }}>narrowest duct gap </span>
                      <span style={{ color: clearance.minMid < 1e-3 ? C.series5 : C.series4 }}>
                        {fmt(clearance.minMid, 3)} mm</span>
                      <span style={{ color: C.inkMuted }}> at station {clearance.minMidAt}</span></span>}
                <span><span style={{ color: C.inkMuted }}>widest </span>
                  <span style={{ color: C.ink }}>{fmt(clearance.max, 2)} mm</span>
                  <span style={{ color: C.inkMuted }}> at {clearance.maxAt}</span></span>
                <span><span style={{ color: C.inkMuted }}>section scale k </span>
                  <span style={{ color: map.profScaleMax > 1 + 1e-6 ? C.series5 : C.ink }}>
                    {fmt(map.profScaleMin, 3)} – {fmt(map.profScaleMax, 3)}</span></span>
              </div>
            )}
            {/* WHERE THE fc SPREAD COMES FROM. Freezing one variable at its mean
                separates the two contributions. They partially cancel — an outer
                cell has both a longer path and a larger ratio, which move fc in
                opposite directions — so the full spread sits below the larger term
                and quoting either alone misleads. */}
            {profileT != null && thickness > 0 && map.rows[0].profRatioGross && (
              <div style={{ marginTop: 6, display: "flex", gap: 18, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
                <span><span style={{ color: C.inkMuted }}>expansion ratio </span>
                  <span style={{ color: C.series4 }}>{fmt(map.rows[0].profRatio, 3)}</span>
                  <span style={{ color: C.inkMuted }}> · gross would read {fmt(map.rows[0].profRatioGross, 3)}</span></span>
                <span><span style={{ color: C.inkMuted }}>ratio spread </span>
                  <span style={{ color: map.ratioSpread < 0.5 ? C.series4 : C.series5 }}>{fmt(map.ratioSpread, 3)}%</span>
                  <span style={{ color: C.inkMuted }}> · gross {fmt(map.ratioSpreadGross, 2)}%</span></span>
              </div>
            )}
            {profileT != null && map.fcDecomp && (
              <div style={{ marginTop: 6, display: "flex", gap: 18, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
                <span><span style={{ color: C.inkMuted }}>f_c spread </span>
                  <span style={{ color: C.ink }}>{fmt(map.fcDecomp.full, 2)}%</span></span>
                <span><span style={{ color: C.inkMuted }}>from path length alone </span>
                  <span style={{ color: C.series1 }}>{fmt(map.fcDecomp.fromLength, 2)}%</span></span>
                <span><span style={{ color: C.inkMuted }}>from area ratio alone </span>
                  <span style={{ color: C.series3 }}>{fmt(map.fcDecomp.fromRatio, 2)}%</span></span>
                {map.fcDecomp.full < map.fcDecomp.fromLength - 0.01 && (
                  <span style={{ color: C.inkMuted }}>— the two partially cancel</span>
                )}
              </div>
            )}
            {profileT != null && map.profFcMin != null && (
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: C.inkMuted }}>to reach f_c = {fmt(fcWanted, 0)} Hz</span>
                {/* m is solved from the geometry, so fc is a RESULT. Until path length
                    is independently controllable, the honest way to ask for an fc is
                    to show the path length that would deliver it against the length
                    the cells actually have. */}
                <span style={{ fontFamily: C.mono, fontSize: 11 }}>
                  <span style={{ color: C.inkMuted }}>needs path </span>
                  {fcReq.ok ? <>
                    <span style={{ color: C.ink }}>{fmt(fcReq.lo, 1)}–{fmt(fcReq.hi, 1)} mm</span>
                    <span style={{ color: C.inkMuted }}> vs {fmt(map.Lmin, 1)}–{fmt(map.Lmax, 1)} actual · </span>
                    <span style={{ color: Math.abs(fcReq.shortfall) < 1 ? C.series4 : C.series5 }}>
                      {fcReq.shortfall > 0 ? `${fmt(fcReq.shortfall, 1)} mm short` : `${fmt(-fcReq.shortfall, 1)} mm spare`}</span>
                  </> : <span style={{ color: C.inkMuted }}>unreachable at this T</span>}
                </span>
                {/* THE INVERSION. m is solved from (ratio, length), so fc has only
                    ever been a readout. Leaving the axial depth free turns it into
                    an input: fc and T give m, m gives the length each cell needs,
                    and depth is solved to deliver it. */}
                <button style={btn(false, C.series3)} onClick={() => {
                  // the SAME options the live mapping uses — this once carried
                  // its own copy with arcH/arcV missing, and solved the default
                  // mouth whatever the sliders said. The straight runs reset to
                  // the reference state, like every depth solve.
                  const r = G.solveDepthForFc(throat, solveRefOpts(), { fcTarget: fcWanted, T: profileT });
                  setFcSolve(r);
                  if (r.ok) setDepth(Math.round(r.depth * 10) / 10);
                }}>solve depth for it</button>
                {fcSolve && (
                  <span style={{ fontFamily: C.mono, fontSize: 10 }}>
                    {fcSolve.ok
                      ? <><span style={{ color: C.inkMuted }}>depth </span>
                          <span style={{ color: C.series4 }}>{fmt(fcSolve.depth, 1)} mm</span>
                          <span style={{ color: C.inkMuted }}> → {fmt(fcSolve.fcLo, 0)}–{fmt(fcSolve.fcHi, 0)} Hz across cells</span></>
                      : <span style={{ color: C.series5 }}>
                          out of reach — {fcSolve.reason === "too low"
                            ? `${fmt(fcSolve.bound, 0)} Hz is the floor at ${fcSolve.at} mm depth`
                            : `${fmt(fcSolve.bound, 0)} Hz is the ceiling at ${fcSolve.at} mm depth`}</span>}
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
              {<>m is <strong style={{ color: C.inkDim }}>solved</strong>, not asked for: (f_c, T) and the geometry are over-determined, so m is
                  set to land each cell exactly on its own mouth area at its own path length. That makes the scale <em>k</em> = 1 at both ends,
                  leaving the throat mating face and the mouth tiling untouched, and turns f_c into a readout of the loading you got.
                  {" "}The law is written on the <strong style={{ color: C.inkDim }}>open</strong> passage — the cell outline less the half-divider
                  on each shared side — because that is what the wave travels through. The gross outline includes wall the wave never sees, so keying
                  on it understates the expansion and reports f_c low. Since the equal-area solve equalises <em>open</em> area, this also makes the
                  throat reference identical across cells, which is what collapses the ratio spread. Note it is not a change of reference constant:
                  the inset is a fixed offset, not a proportion, so the scale is solved per station inside the divider region — the outline is
                  enlarged to give back what the wall takes, exactly the shell-oversize argument applied station by station.
                  {" "}Leaving the <strong style={{ color: C.inkDim }}>axial depth</strong> free turns f_c from a readout into an input: solve depth
                  for the cutoff you want.
                  {" "}The gap between ducts is not a separate feature: it is the convex profile dipping below the near-linear fan of the centrelines,
                  which are pinned together at both ends. T sets both — but only up to a point. Raising T flattens the dip, and past the T where
                  the profile starts asking for more area than the tiling configuration has (<em>k</em> &gt; 1) the ducts come back into contact
                  near the throat and then interpenetrate. Read the <strong style={{ color: C.inkDim }}>narrowest</strong> gap for that, never the
                  widest: the widest keeps reporting several mm while the ducts are already touching somewhere else.</>}
            </div>
          </div>
        </div>
      )}

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Metric label="Cells N" value={`${throat.N}`} sub={shown.family === "hgrid" ? `${shown.nc} × ${shown.nr}` : shown.family === "ogrid" ? shown.rings.join(" + ") : `${shown.bm}² + 4·${shown.bm}·${shown.bp}`} />
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
        {map && <Metric label="Bend centroid" value={fmt(map.bendCentroidMean, 3)}
          sub="0 = all turning at the throat, 1 = at the mouth" color={map.bendCentroidMean < 0.5 ? C.series4 : C.inkDim} />}
        <Metric label="Wavefront correction" value={fmt(2 / (1 + Math.cos(exitAngle * D2R)), 4)} sub="spherical / planar area, reported not applied" />
      </div>

      {/* EXPORTS */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ ...secTitle, marginBottom: 0 }}>Export</span>
        <button style={expBtn} onClick={() => dl(`${stem}.dxf`, buildDXF(), "application/dxf")}>DXF · one layer per station</button>
        <button style={expBtn} onClick={() => dl(`${stem}.json`, buildJSON(), "application/json")}>JSON cell definition</button>
        <button style={expBtn} onClick={() => dl(`${stem}.csv`, buildCSV(), "text/csv")}>CSV · per cell</button>
        <button style={expBtn} disabled={!map} onClick={() => dl(`${stem}_area_schedule.csv`, buildSigmaCSV(), "text/csv")}>ΣA(x) CSV</button>
        <button style={expBtn} disabled={!map} onClick={() => {
          const solids = G.ductSolids(throat, map, { t: thickness, dividerEndFrac });
          if (solids) dlBin(`${stem}_ducts.stl`, G.buildSTL(solids, stem), "model/stl");
        }}>STL · cell ducts</button>
        <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center", marginLeft: 8 }}>
          stations
          <input type="number" value={stations} min={2} max={64} step={1} onChange={(e) => setStations(Math.max(2, Math.min(64, parseInt(e.target.value) || 16)))}
            style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
        </label>
        <span style={{ fontSize: 10, color: C.inkMuted, flex: "1 1 260px", lineHeight: 1.45 }}>
          The STL is the one that needs no CAD work: it carries the {throat.N} ducts as closed solids, already inset by half the
          divider thickness where the dividers are and tapering to nothing where they stop. Loft a blank from the throat circle to the
          mouth and subtract them — what is left is the divider web. DXF is 2-D per plane, so only the throat layer will import as a sketch.
        </span>
      </div>

      {/* CELL TABLE */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={secTitle}>Cells · {throat.N} total</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 360 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
            <thead><tr>{["cell", "open mm²", "L_long", "L_short", "aspect", "⌀", "convex", "P–W kHz", "f₁ kHz", "model", "path mm", "pad", "turn°", "twist°", "aim°",
              ...(profileT != null ? ["f_c Hz", "k max", "gap mm"] : [])].map((h) => (
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
                    {profileT != null && <>
                      {td(r && r.profFc != null ? fmt(r.profFc, 0) : "—", C.series4)}
                      {td(r && r.profScaleMax != null ? fmt(r.profScaleMax, 3) : "—",
                        r && r.profScaleMax > 1 + 1e-6 ? C.series5 : C.inkDim)}
                      {td(clearance && clearance.perCell.has(cc.id)
                        ? fmt(clearance.perCell.get(cc.id), 3) : "—",
                        clearance && clearance.perCell.get(cc.id) < 1e-3 ? C.series5 : C.inkDim)}
                    </>}
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
