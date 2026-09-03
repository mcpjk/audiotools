import React, { useState, useMemo, useEffect, useRef } from "react";
import { C, SERIES } from "./palette.js";
import * as G from "./hgrid-model.js";

// ═══════════════════════════════════════════════════════════════════════════
// GINKGO MULTICELL HORN
// ═══════════════════════════════════════════════════════════════════════════
//
// THE LAYOUT IS TWO PANES, and the split is the point. The LEFT pane scrolls
// and carries the inputs as eight numbered stages in DESIGN CHRONOLOGY —
// driver, throat partition, coverage & mouth, expansion law, depth & path,
// path lengthening, a ghost slot for the planned coped joints, export. Each
// stage houses its own diagram: the throat plan sits in the partition stage,
// the mouth plan in the mouth stage, the path-length chart in the lengthening
// stage, because a drawing belongs beside the inputs that shape it.
//
// The RIGHT pane is PINNED: the horn's name and solve status, the warnings, a
// tabbed viewport (3-D duct solids / horizontal section / cell table),
// and a verdict
// strip that scrolls independently underneath. Those verdicts — flare cutoff,
// loading limit, pattern per axis, f1, dL, wall spread, and the physical form
// — are what you judge a candidate horn by, so they stay on screen whatever
// the left side is editing. Below ~1020 px the two panes stack into one
// column, which is the old single-column page.
//
// This replaced a single scrolling column in which every readout was one
// scroll away from the control that moved it. Both layouts were built and
// compared side by side before this one was chosen; the other is deleted.
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

// ── 3-D DUCT PREVIEW ────────────────────────────────────────────────────────
// The inset duct solids — exactly what the STL exports — drawn by hand on a
// canvas: no three.js, because the repo carries no external libraries beyond
// React, and it does not need one. At preview resolution the whole horn is
// ~9k flat-shaded quads: orthographic projection, painter's sort, two-sided
// lambert shading, which canvas 2D fills at interactive rates. Colours mix
// each duct's palette colour toward C.page, so the shading follows the theme
// with nothing hard-coded.
function DuctPreview({ ducts, dim }) {
  const canvasRef = useRef(null);
  const view = useRef({ yaw: -2.45, pitch: 0.42, zoom: 1 });
  const raf = useRef(false);

  // one flat structure per geometry change: points, quads, per-duct shade
  // tables (17 quantised lambert levels, so no colour strings are built
  // inside the draw loop)
  const geom = useMemo(() => {
    if (!ducts || !ducts.length) return null;
    const pts = [], quads = [], quadDuct = [], shades = [];
    const pg = hex2rgb(C.page);
    ducts.forEach((d, di) => {
      const rgb = hex2rgb(d.color);
      const tab = [];
      for (let s = 0; s <= 16; s++) {
        const b = 0.3 + 0.7 * (s / 16);
        tab.push(`rgb(${Math.round(pg[0] + (rgb[0] - pg[0]) * b)},${Math.round(pg[1] + (rgb[1] - pg[1]) * b)},${Math.round(pg[2] + (rgb[2] - pg[2]) * b)})`);
      }
      shades.push(tab);
      const base = pts.length;
      d.rings.forEach((ring) => ring.forEach((p) => pts.push(p)));
      const n = d.rings[0].length, S = d.rings.length;
      for (let q = 0; q < S - 1; q++)
        for (let k = 0; k < n; k++) {
          quads.push([base + q * n + k, base + q * n + ((k + 1) % n),
            base + (q + 1) * n + ((k + 1) % n), base + (q + 1) * n + k]);
          quadDuct.push(di);
        }
    });
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0] / pts.length; cy += p[1] / pts.length; cz += p[2] / pts.length; }
    let rad = 1;
    for (const p of pts) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
    return { pts, quads, quadDuct, shades, ctr: [cx, cy, cz], rad };
  }, [ducts]);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv || !geom) return;
    const w = Math.max(300, cv.clientWidth || 600), h = 420;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const g = cv.getContext("2d");
    g.fillStyle = C.page;
    g.fillRect(0, 0, w, h);
    const { yaw, pitch, zoom } = view.current;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const sc = (Math.min(w, h) / (2.3 * geom.rad)) * zoom;
    const N = geom.pts.length;
    const px = new Float64Array(N), py = new Float64Array(N), pz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const p = geom.pts[i];
      const x = p[0] - geom.ctr[0], y = p[1] - geom.ctr[1], z = p[2] - geom.ctr[2];
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      px[i] = w / 2 + x1 * sc;
      py[i] = h / 2 - y2 * sc;
      pz[i] = z2;
    }
    // painter's algorithm: far quads first. Orthographic, so mean depth is a
    // sound sort key for quads this small relative to the ducts.
    const Q = geom.quads.length;
    const depth = new Float64Array(Q), order = new Array(Q);
    for (let q = 0; q < Q; q++) {
      const [a, b, c2, d] = geom.quads[q];
      depth[q] = pz[a] + pz[b] + pz[c2] + pz[d];
      order[q] = q;
    }
    order.sort((a, b) => depth[a] - depth[b]);
    for (let oi = 0; oi < Q; oi++) {
      const q = order[oi];
      const [a, b, c2, d] = geom.quads[q];
      // two-sided shading — the ducts are open tubes and their inner walls
      // are visible through the mouths, so backfaces are drawn, not culled
      const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
      const vx = px[d] - px[a], vy = py[d] - py[a], vz = pz[d] - pz[a];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1e-9;
      const lamb = Math.abs((0.33 * nx + 0.24 * ny + 0.91 * nz) / nl);
      const sIdx = Math.max(0, Math.min(16, Math.round(lamb * 16)));
      g.fillStyle = geom.shades[geom.quadDuct[q]][sIdx];
      g.beginPath();
      g.moveTo(px[a], py[a]); g.lineTo(px[b], py[b]);
      g.lineTo(px[c2], py[c2]); g.lineTo(px[d], py[d]);
      g.closePath(); g.fill();
    }
  };

  // THE POINTER HANDLERS ARE BOUND ONCE (the listener effect below has no
  // deps, deliberately — rebinding them on every geometry change would drop a
  // drag in progress), so everything they reach must be read at CALL time and
  // not captured at mount. `draw` closes over `geom`, so a handler holding the
  // first render's copy repainted the FIRST geometry: the preview tracked the
  // sliders correctly until it was touched, and then the very first drag or
  // scroll silently reverted it to the horn as it stood when the tool opened,
  // where it stayed for every later frame. The ref is the indirection that
  // keeps one binding and the current draw.
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });
  const requestDraw = () => {
    if (raf.current) return;
    raf.current = true;
    requestAnimationFrame(() => { raf.current = false; drawRef.current(); });
  };
  useEffect(() => { requestDraw(); }, [geom]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let dragging = null;
    const down = (e) => { dragging = [e.clientX, e.clientY]; e.preventDefault(); };
    const move = (e) => {
      if (!dragging) return;
      view.current.yaw += (e.clientX - dragging[0]) * 0.008;
      view.current.pitch = Math.max(-1.55, Math.min(1.55, view.current.pitch + (e.clientY - dragging[1]) * 0.008));
      dragging = [e.clientX, e.clientY];
      requestDraw();
    };
    const up = () => { dragging = null; };
    // wheel zoom needs a non-passive listener or preventDefault is ignored
    const wheel = (e) => {
      e.preventDefault();
      view.current.zoom = Math.max(0.3, Math.min(6, view.current.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      requestDraw();
    };
    cv.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cv.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cv.removeEventListener("wheel", wheel);
    };
  }, []);

  const setView = (yaw, pitch) => { view.current.yaw = yaw; view.current.pitch = pitch; requestDraw(); };
  return (
    <div style={{ opacity: dim ? 0.35 : 1 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[["three-quarter", -2.45, 0.42], ["front", Math.PI, 0], ["side", Math.PI / 2, 0], ["top", Math.PI, 1.55]].map(([l, yw, pt]) => (
          <button key={l} onClick={() => setView(yw, pt)} style={btn(false, C.series2)}>{l}</button>
        ))}
      </div>
      <canvas ref={canvasRef}
        style={{ width: "100%", height: 420, display: "block", borderRadius: 4, background: C.page, border: `1px solid ${C.border}`, cursor: "grab" }} />
    </div>
  );
}

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

// One numbered stage card in the left pane. The number is chronology, not
// decoration: each stage consumes what the one before it fixed.
function Stage({ n, title, why, ghost, children }) {
  return (
    <section style={{
      ...card, marginBottom: 0,
      ...(ghost ? { borderStyle: "dashed", background: "transparent" } : {}),
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 10 }}>
        <span style={{
          fontFamily: C.mono, fontSize: 10, color: C.accent, flex: "none",
          border: `1px ${ghost ? "dashed" : "solid"} ${C.accent}`, borderRadius: "50%",
          width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
          opacity: ghost ? 0.6 : 1,
        }}>{n}</span>
        <span style={{ ...secTitle, marginBottom: 0, opacity: ghost ? 0.7 : 1 }}>{title}</span>
        {why && <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: "auto", textAlign: "right", maxWidth: "46%", lineHeight: 1.35 }}>{why}</span>}
      </div>
      {children}
    </section>
  );
}

export default function GinkgoHorn() {
  // ── layout state ──
  // Which view the pinned pane shows, and whether the viewport is too narrow
  // for two panes at all — below the breakpoint the panes stack into one
  // scrolling column.
  const [view, setView] = useState("ducts");
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1020px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1020px)");
    const on = (e) => setNarrow(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ── driver ──
  const [exitDia, setExitDia] = useState(35.5);
  const [exitAngle, setExitAngle] = useState(16.55);
  const [temperature, setTemperature] = useState(30);
  const [thickness, setThickness] = useState(0.4);
  const [process, setProcess] = useState("FDM");

  // ── topology ──
  const [family, setFamily] = useState("hgrid");
  const [nc, setNc] = useState(6);
  const [nr, setNr] = useState(3);
  const [ringSpec, setRingSpec] = useState("1,6,12");
  const [seed, setSeed] = useState("elliptical");

  // ── line shapes ──
  // THREE by default (owner's call). m is the Chebyshev order of each grid
  // line, so it sets how much SHAPE the sliders can request — 13 parameters
  // against m=2's 10. At the NOMINAL vector it buys almost nothing on the
  // readouts, and what it does buy is a hair the wrong way: measured at 6x3,
  // f1_min 14.735 -> 14.727 kHz and worst aspect 2.510 -> 2.520, because the
  // extra freedom lets the equal-area solve land on a different member of the
  // same family. What it does buy is a TIGHTER solve — residual 5.4e-13 ->
  // 3.1e-15 for 37 iterations against 30, ~124 ms either way — and the room
  // to ask for a bow the m=2 space cannot express.
  const [shapeOrder, setShapeOrder] = useState(3); // m
  const [symmetric, setSymmetric] = useState(true);
  const [request, setRequest] = useState(null);    // p_requested, or null for nominal

  // ── mouth ──
  const [depth, setDepth] = useState(300);
  const [divergeLen, setDivergeLen] = useState(0);
  const [arriveLen, setArriveLen] = useState(0);
  // BEND TIGHTNESS IS FIXED, NOT DIALLED. The two Hermite tangent
  // magnitudes are the cubic's only remaining freedom, and the measured
  // optimum barely moves: wallSpread bottoms at 0.45-0.55 on every
  // well-posed geometry tried (curved 5.63 mm at 0.55, narrow 3.46 at 0.45)
  // and the curve is flat between them. Going to the slider MINIMUM is not
  // the safe choice it looks like — 0.25 measures 8.50 mm of wall spread
  // against 5.63, and 12.7 mm of dL against 2.4, because the tangents also
  // set how each cell's path length lands. Above 0.8 it collapses: 1.0
  // gives a 1 mm minimum radius and 17 mm of duct overlap. So it is pinned
  // at 0.5, and the model keeps the parameter for the day it is worth
  // SOLVING per geometry the way depth is.
  const tight = 0.5;

  // "rect" = the original uniform x/y lattice; "arc" = coverage angles,
  // subdivided at equal solid angle
  // The mouth is stated by what it must deliver: two arcs, each with its own
  // angle and length. No apex, and the two radii are independent — Th = 0 on
  // either axis is a flat one.
  const mouthMode = "biradial";
  const [thetaH, setThetaH] = useState(90);
  const [thetaV, setThetaV] = useState(0);
  // 555 x 245 mm, the owner's numbers, chosen for the PRINT rather than for
  // any acoustic reading. Th_v is 0, so arcV is literally the mouth height,
  // and arcH at 90 deg gives a 499.68 mm chord — 249.8 mm per half if the
  // horn is split on the vertical centreline. Both of those clear a Bambu
  // P1S bed (256 mm) with 6.2 and 11.0 mm to spare, where the 560 x 250 they
  // replace left 3.9 and 6.0. NOTE THE AXIAL DEPTH IS NOT IN THAT ARGUMENT:
  // at 300 mm it does not fit the 256 mm cube in any axis-aligned pose, so
  // the split still has to be planned. Acoustically the 5 mm costs almost
  // nothing: mouth 1396.0 -> 1355.9 cm2, dL 25.52 -> 24.08 mm, fc 457-496 ->
  // 457-494 Hz.
  const [arcH, setArcH] = useState(555);
  const [arcV, setArcV] = useState(245);
  const [dlSolve, setDlSolve] = useState(null);
  // ── per-cell path lengthening ──
  // Off by default: it is a correction to apply after depth has done what it
  // can, and the depth solves always run on the bare geometry. The deficit
  // map decides which cells bow — nothing assumes rows, centres or rims.
  const [lengthenOn, setLengthenOn] = useState(false);
  const [lengthDir, setLengthDir] = useState("radial");
  // WHERE the bow sits, as a fraction of each cell's own path. The straight
  // runs are excised from this on top, per cell, inside the model — a run
  // asked to be straight is not a place to put a bow.
  // Defaults to the throat fifth: a narrower region is a SMALLER bow that
  // turns harder (amplitude goes as sqrt(span), curvature as span^-1.5), and
  // the measured wall spread falls with it too — 17.44 mm at throat half
  // against 15.16 at throat fifth, for 46.8 mm of amplitude against 25.6.
  const [bowFrom, setBowFrom] = useState(0);
  const [bowTo, setBowTo] = useState(0.2);
  // ONE lobe by default, at the owner's call: three humps read as a
  // corrugation rather than a duct and are not commercially acceptable, and
  // one is the shape a real part wants. Two is offered because the measured
  // wall spread strongly prefers it — 23.2 mm at 1 lobe against 8.7 at 2 —
  // so the choice is a deliberate trade of phase error against how the part
  // looks and prints, not an oversight.
  const [lengthLobes, setLengthLobes] = useState(1);
  // THERE IS NO "SOLVE THE BOW" BUTTON, and the reason is the ranking
  // metric rather than the search. `solveBow` ranks candidates on wall
  // spread, and wall spread measures the length each wall fibre has run BY
  // THE MOUTH — so a bow that distorts the wavefront mid-path and unwinds it
  // again scores as though nothing happened. It therefore reads the wide,
  // expanded end of the passage as free real estate and puts the bow there
  // (the recorded winner was region [0.3, 0.95]), which is where a
  // displacement moves the most air and where the owner will not accept one.
  // The wall spread it buys back does not price that. The lobe lock existed
  // only to fence the same blind spot on the lobe count, so it went with the
  // solve. `solveBow` SURVIVES IN THE MODEL with its tests — it is the
  // documented enumeration of the trade, and the thing to reach for if a
  // metric ever exists that can see mid-path coherence.
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
  // null = no expansion law, the emergent schedule. A number is the Hypex T:
  // 0 hyperbolic (cosh), 1 exponential.
  const [profileT, setProfileT] = useState(0.7);
  // a target cutoff to compare against, NOT an input to the profile — m is
  // solved from the geometry, so fc is a result and this is the readout that
  // says how far the geometry is from delivering the one you wanted
  const [fcWanted, setFcWanted] = useState(500);
  // EXPORT resolution — 64 stations by default. The bows and the profile
  // both put structure BETWEEN stations, and at 16 the exported solid was
  // visibly faceted through a bend. The LIVE map no longer runs at this
  // setting: it is pinned to PREVIEW_STATIONS below, so this number is spent
  // only when an export button is pressed.
  const [stations, setStations] = useState(64);
  // ── horn shell ──
  // Wall thickness for the shell STEP kit. This is the OUTER skin and the
  // mid-path tube walls; the dividers between passages near the throat stay
  // at the layout t — the blanks reach at least the tiling outline, and the
  // cutters carve the passages back, so the boolean sets the divider, never
  // 2x this number. EXPORT ONLY: the blanks are not drawn, see the 3-D
  // preview note below.
  const [shellWall, setShellWall] = useState(3);
  // THE TWO ENDS ARE SET SEPARATELY, because they are not the same problem.
  // Each is "trim" (extend past the face and ship the trim solid that cuts it
  // back), "extend" (extend, ship no trim, cut it yourself) or "plain" (the
  // loft's own end ring makes the face, no cut at all). The MOUTH trim cuts on
  // the aperture surface itself and has never been reported failing; the
  // THROAT trim cuts on the plane z = 0, which is exactly the operation the
  // owner measured failing as a plane split on individual blanks.
  const [throatEnd, setThroatEnd] = useState("trim");
  const [mouthEnd, setMouthEnd] = useState("trim");
  const endCfg = (v) => ({ extend: v !== "plain", trim: v === "trim" });
  const [wallJitter, setWallJitter] = useState(0.5);
  const [shellStations, setShellStations] = useState(32);
  // WHICH SIDE OF EACH MIRROR TO EXPORT. 0 keeps both. The horn is symmetric
  // about x = 0 and y = 0, so a half or a quarter carries the whole design
  // and quarters the boolean work — but the two halves are NOT mirror copies
  // of each other in the SHELL, because the wall jitter is keyed to grid
  // parity; mirroring a half puts equal walls on both sides of the seam,
  // which is the near-copy case the jitter exists to break. Export the other
  // side here instead of mirroring this one.
  const [regX, setRegX] = useState(0);
  const [regY, setRegY] = useState(0);
  // HOW THE SHELL IS DELIVERED. "solid" is one horn body plus one cutter per
  // duct, so the CAD work is subtractions only — no unions at all. "bundle"
  // is a blank per cell, the literal multicell form, and it needs the union
  // that grazes: adjacent blanks overlap at both ends and stand apart
  // mid-path, so every pair passes through exact tangential contact on the
  // way. Solid is the default because that tangency is geometry, not a
  // tolerance, and no kernel setting makes it well posed.
  // The live mapping at 64 stations cost ~136 ms per slider tick (~7 fps on
  // a drag); at 24 it is ~60 ms, and every readout that matters on a drag —
  // path lengths, dL, fc — comes from the centreline sampling, which is a
  // separate `samples` setting and does not move with this. The clearance
  // and the 3-D preview follow the preview map, so they get cheaper too;
  // the full-resolution geometry is built fresh when an export is pressed.
  const PREVIEW_STATIONS = 24;

  // ── optimiser ──
  const [wAspect, setWAspect] = useState(0.6);
  const [wTwist, setWTwist] = useState(0);
  const [wCorrection, setWCorrection] = useState(0.5);
  const [maxEval, setMaxEval] = useState(160);
  const [optState, setOptState] = useState(null);
  const [running, setRunning] = useState(false);

  // ── coped joints ──
  // Bulge each interior mouth-cell edge into its neighbour so the ducts meet
  // at knife edges before the mouth. Off by default: it is a joinery feature
  // and it raises f_c — the double-count readout beside it says by how much.
  const [bulgeOn, setBulgeOn] = useState(false);
  const [bulgeAmp, setBulgeAmp] = useState(4);
  // ── duct separation ──
  // The solved per-cell displacement field that clears defect overlap and
  // thin slivers. A solver RESULT, not a setting: it was solved against one
  // geometry, so it is cleared the moment that geometry moves.
  const [sepSolve, setSepSolve] = useState(null);
  const [sepBusy, setSepBusy] = useState(false);
  const [sepFloor, setSepFloor] = useState(0.5);

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
    rings: rings.length ? rings : [1, 6, 12],
    t: thickness, c, nParams: cfg.nParams, alphaAt: cfg.alphaAt,
  }), [family, R, nc, nr, shapeOrder, symmetric, pReq, seed, seedObj, ringSpec, thickness, c, cfg]);

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
  useEffect(() => { setDlSolve(null); }, [thetaH, thetaV, arcH, arcV, profileT]);
  // a separation field was solved against ONE geometry — any input that moves
  // the ducts it was clearing invalidates it
  useEffect(() => { setSepSolve(null); },
    [thetaH, thetaV, arcH, arcV, profileT, depth, nc, nr, family, exitDia, thickness, bulgeOn, bulgeAmp]);
  // EVERY depth solve runs from the same reference state for the two straight
  // runs — divergence 0, arrival 0 — and resets the sliders to it. A solve is
  // then a repeatable reference point rather than a function of wherever the
  // last experiment left the runs; the sliders stay live afterwards, and
  // lengthening the arrival run FROM the solved state is the experiment
  // (it holds the path straight off the aperture and pushes the turning back
  // toward the throat, where the section is small).
  // The solves also run with lengthening OFF: they solve the bare geometry,
  // and the bows are the correction applied on top of whatever depth they
  // land on. The lengthening toggle itself is left alone.
  const RUN_DEFAULTS = { divergeLen: 0, arriveLen: 0 };
  const solveRefOpts = () => {
    setDivergeLen(RUN_DEFAULTS.divergeLen);
    setArriveLen(RUN_DEFAULTS.arriveLen);
    // the solves run on the BARE geometry: no lengthening and no separation
    // field — a field solved for one depth is meaningless at another, and
    // the sepSolve state is cleared the moment depth moves anyway
    return { ...mapOpts, ...RUN_DEFAULTS, lengthen: null, separate: null };
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
    divergeLen, arriveLen, tight, fTarget, stations: PREVIEW_STATIONS,
    // the profile is written on the OPEN passage, so it needs the divider
    // thickness — without this it silently falls back to the gross outline
    t: thickness, profileArea,
    tightThroat: tight, tightMouth: tight,
    mouthMode, thetaH, thetaV, arcH, arcV, sectionMode,
    lengthen: lengthenOn ? { lobes: lengthLobes, dir: lengthDir, uStart: bowFrom, uEnd: bowTo } : null,
    bulge: bulgeOn ? { amp: bulgeAmp } : null,
    separate: sepSolve && sepSolve.amps
      ? { amps: sepSolve.amps, uStart: sepSolve.uStart, uEnd: sepSolve.uEnd, lobes: sepSolve.lobes }
      : null,
  }), [layout, shown, exitAngle, divergeLen, arriveLen,
    thetaH, thetaV, arcH, arcV,
    fTarget, thickness, profileArea,
    lengthenOn, lengthDir, bowFrom, bowTo, lengthLobes,
    bulgeOn, bulgeAmp, sepSolve]);

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
    const id = setTimeout(() => setClr({
      of: map,
      // `sepFloor` is the one minimum-gap number: it is the thin-wall band,
      // the separation target, AND the throat knife-edge boundary — the run
      // over which the ducts have not yet opened to it is not a defect.
      value: G.ductClearance(map.rows, {
        jointAware: !!map.bulge, thinBand: sepFloor, throatFloor: sepFloor,
      }),
    }), 30);
    return () => clearTimeout(id);
  }, [map, sepFloor]);
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
  // The coverage angle here decides diaDirectivity = lambda/sin(Th/2), so it
  // has to be the angle the aperture is actually being asked for. It used to
  // read `mouthMode === "arc" ? thetaH : 90`, and mouthMode is a constant
  // "biradial" since the apex went away — so the ternary was dead and the
  // reference horn was pinned at 90 deg whatever the slider said. Measured at
  // the default throat, fc 500, T 0.7: Th_h 60 wants 15308 cm2 over 432 mm and
  // was shown 7654 cm2 over 393 mm (2x under); Th_h 120 wants 5103 cm2 and was
  // shown the same 7654 (1.5x over). Only the HORIZONTAL angle is used: this
  // is a single-axis 1-D reference, and the per-axis pattern question is
  // answered separately beside the arcs that set it.
  const href = useMemo(() => G.hypexReference({
    throatArea: throat.openTotal, fc: fcWanted, T: profileT, c,
    coverageDeg: thetaH,
  }), [throat, fcWanted, profileT, c, thetaH]);

  // ── THE THREE LIMITS, WHICH ARE THREE DIFFERENT QUESTIONS ─────────────────
  // f_c is the FLARE constant, m·c/2π — how fast the passage expands, and
  // nothing about the mouth. Whether the mouth is big enough to LOAD, and
  // whether it is big enough to hold the PATTERN, are separate and are
  // answered separately. They disagree by an order of magnitude at wide
  // coverage, which is why they are never combined into one "cutoff".
  const limits = useMemo(() => {
    if (!map) return null;
    // LOADING is an area question: the classic statement is a mouth
    // circumference of about one wavelength, so it keys on the equivalent
    // diameter of the total mouth area and has no per-axis form.
    const dEq = 2 * Math.sqrt(map.mouthAreaTotal / Math.PI);
    const loadHz = (c * 1000) / (Math.PI * dEq);
    // PATTERN is a per-axis question: an axis holds its coverage angle only
    // while the mouth measures about λ/sin(Θ/2) ACROSS THAT AXIS. Each axis
    // therefore has its own limit, set by its own chord and its own angle.
    const axis = (extent, thetaDeg) => {
      const half = Math.sin((thetaDeg / 2) * D2R);
      // Θ = 0 is a flat axis: it states no coverage angle, so this criterion
      // has nothing to say about it rather than saying infinity
      if (!(half > 1e-6) || !(extent > 1e-6)) return null;
      return (c * 1000) / (extent * half);
    };
    return {
      dEq, loadHz,
      patH: axis(map.mouthWEff, thetaH),
      patV: axis(map.mouthHEff, thetaV),
      fcLo: map.profFcMin, fcHi: map.profFcMax,
    };
  }, [map, c, thetaH, thetaV]);

  // ── THE PATH LENGTH THE TARGET CUTOFF ACTUALLY ASKS FOR ───────────────────
  // Keyed to the mouth BEING BUILT, not to the 1-D reference horn's mouth.
  // This is the profile inverted the other way round: fc and T give m, and
  // (m, T, the cell's own radius ratio) give the length that cell needs to
  // reach its own mouth area at that flare rate. It is the same equation
  // `solveHypexM` solves for m, read for L instead, so the two agree by
  // construction — feed back the length reported here and fc comes out at the
  // target.
  //
  // It replaces `hypexReference.minLength`, which was the length to the
  // REFERENCE mouth — max(lambda/pi, lambda/sin(Th/2)), 7654 cm2 at 90 deg and
  // 500 Hz against the 997 cm2 the coverage arcs specify, 7.7x. That made the
  // comparison below read "short of 393 mm by 75 mm" in red while FLARE CUTOFF
  // two rows down printed 437-440 Hz, already better than the 500 Hz asked
  // for. Two different horns, so the verdict was about the wrong one.
  //
  // PER CELL, and PAIRED per cell. Each cell solves its own ratio, so each has
  // its own required length, and the cell with the shortest path is not
  // necessarily the one that needs the least — comparing Lmin against the
  // minimum requirement would be comparing two different cells.
  const pathNeeded = useMemo(() => {
    if (!map || !map.rows.length || profileT == null || !(fcWanted > 0)) return null;
    const mTarget = G.hypexMForFc(fcWanted, c);
    let lo = Infinity, hi = -Infinity, worst = -Infinity;
    for (const r of map.rows) {
      const need = G.hypexLengthForRatio(r.profRatio, mTarget, profileT);
      // null when the ratio is <= 1 — no expansion left to deliver, so there
      // is no length that reaches the target and the metric says nothing
      if (need == null) return null;
      if (need < lo) lo = need;
      if (need > hi) hi = need;
      if (need - r.Lpath > worst) worst = need - r.Lpath;   // > 0 = short
    }
    return { lo, hi, worst, clears: worst <= 0 };
  }, [map, profileT, fcWanted, c]);

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
          exitHalfAngle: exitAngle, divergeLen, tight, fTarget, samples: 16, stations: 6,
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
    // The throat dip has its own warning below, which names the mechanism and
    // the resolution caveat. Without this gate the same one fact arrives three
    // times — once here, once as "the narrowest gap", once as the dip.
    const dipOwns = clearance && clearance.throat && clearance.throat.dip != null
      && clearance.minMidAt === clearance.throat.dipAt;
    if (map && clearance && clearance.overlap > 1e-3 && !dipOwns)
      w.push(`Swept sections interpenetrate ${fmt(clearance.overlap, 3)} mm at station ${clearance.overlapAt}, over ${clearance.overlapStations} station(s). This is the trade the mode makes on purpose — the ends stay shared, the interior does not — but it is not yet resolved: lower T pulls the sections further inward, and centreline manipulation is the stronger lever that is not built. Note the section scale reads k = ${fmt(map.profScaleMax, 4)} ≤ 1, which proves non-overlap ONLY for flowed sections; here it says nothing.`);
    if (map && map.profScaleMax != null && map.profScaleMax > 1 + 1e-6)
      w.push(`The expansion profile asks for more area than the tiling configuration has: section scale reaches k = ${fmt(map.profScaleMax, 4)} against a ceiling of 1. Scaling a section about its centroid by k ≤ 1 can only move it AWAY from its neighbours, so k > 1 is the one way this construction pushes ducts into each other — verified by ray cast to produce real interpenetration at exactly the stations where it exceeds 1. Lower T (toward cosh) to stay inside the tiling, or lengthen the path so the profile has room to reach the mouth area more gently.${clearance && clearance.overlap > 0 ? ` The geometry measurement agrees independently and says how deep: the ducts interpenetrate ${fmt(clearance.overlap, 4)} mm at station ${clearance.overlapAt}, over ${clearance.overlapStations} station(s).` : ""}`);
    if (map && clearance && profileT != null && clearance.minMid < 1e-3 && !(map.profScaleMax > 1 + 1e-6) && !dipOwns)
      w.push(`The narrowest duct-to-duct gap is ${fmt(clearance.minMid, 4)} mm at station ${clearance.minMidAt} — the ducts are touching even though the section scale stayed within k ≤ 1. Read the narrowest gap, not the widest: the widest is ${fmt(clearance.max, 2)} mm here and says nothing about whether the ducts are separate.`);
    if (map && map.bulge && clearance && clearance.joint && clearance.joint.engaged < clearance.joint.pairs)
      w.push(`The coped joints are on but only ${clearance.joint.engaged} of ${clearance.joint.pairs} neighbour pairs actually meet — the bulge is too small to reach across the gap on the rest, so those edges end blunt, not coped. Raise the bulge amplitude, or lower T to shrink the gap the profile opens.`);
    if (map && clearance && clearance.throat && clearance.throat.dip != null)
      w.push(`The duct gap stops opening at station ${clearance.throat.dipAt} of ${clearance.throat.stations} and closes by ${fmt(clearance.throat.dip, 3)} mm before the ducts ever reach the ${fmt(sepFloor, 1)} mm minimum. Near the throat the cells tile, so no absolute clearance is asked for there — only that the wall never gets THINNER than it already is, and here it does. That is a defect at any magnitude, and it is not a knife edge. Note the depth quoted is a LOWER BOUND: the dip is sharp, the preview samples ${PREVIEW_STATIONS} stations, and the same geometry measured at 48 reads several times deeper.`);
    if (map && clearance && clearance.throat && clearance.throat.saturated > 0)
      w.push(`${clearance.throat.saturated} of ${clearance.throat.pairs} neighbour pairs never open to the ${fmt(sepFloor, 1)} mm minimum anywhere along the path, so the throat knife-edge run would have swallowed the whole duct — it is capped, and the gap reported is the best those pairs actually have. Lower the minimum, or give the profile more room (lower T, or more depth).`);
    if (map && clearance && clearance.thin && clearance.thin.count > 0 && !(clearance.overlap > 1e-3))
      w.push(`${clearance.thin.count} spot(s) between ducts carry a wall sliver thinner than ${fmt(sepFloor, 1)} mm (worst ${fmt(clearance.thin.worst, 2)} mm at station ${clearance.thin.at}) — separate ducts that close will not print as two walls. Solve the separation in stage 8, or let them merge by raising the bulge.`);
    if (map && map.lengthen && map.lengthen.shortfall > 0.1)
      w.push(`Path lengthening hit its amplitude cap: the worst cell is still ${fmt(map.lengthen.shortfall, 1)} mm short of the ${fmt(map.lengthen.target, 1)} mm target. More lobes reach the same length at 1/n the amplitude — raise the lobe count rather than accepting the shortfall.`);
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
    if (shown.family !== "hgrid")
      w.push(`An O-grid throat has no cell-for-cell match to a rectangular mouth grid — that is a property of its topology, not a gap in the tool. The mouth mapping below is inactive; the throat metrics are still valid and comparable at equal N.`);
    return w;
  }, [solve, throat, shown, thickness, fab, map, clearance, profileT, fTarget, sepFloor]);

  // ── exports ────────────────────────────────────────────────────────────────
  const stem = `ginkgo_${fmt(exitDia, 1)}mm_${shown.family === "hgrid" ? `${shown.nc}x${shown.nr}` : shown.family}_${throat.N}cells`;

  // Exports run at the export station count, not the preview's. The map is
  // rebuilt here, once, when a button is pressed — ~140 ms at 64 stations,
  // paid at the click instead of on every slider tick.
  const exportMap = () => (map && stations !== PREVIEW_STATIONS
    ? G.mapThroatToMouth(throat, { ...mapOpts, depth, profileT, keepGeometry: true, computeClearance: false, stations })
    : map);
  const [stepNote, setStepNote] = useState(null);

  // EVERY EXPORT CARRIES THE SETTINGS THAT MADE IT, in the STEP header's
  // FILE_DESCRIPTION. A file the owner sends back from CAD is otherwise not
  // reproducible here — a whole session was spent inferring wall, ext and the
  // extension phases from the geometry, and depth and the arcs could not be
  // recovered at all. The writer escapes this, so it may contain anything.
  const exportParams = () => {
    const o = mapOpts;
    const n = (v) => (typeof v === "number" ? +v.toFixed(4) : v);
    const g = [
      `nc=${o.nc}`, `nr=${o.nr}`, `m=${shapeOrder}`, `symmetric=${symmetric}`,
      `R=${o.R}`, `t=${o.t}`, `seed=${seed}`,
      `c=${n(o.c)}`, `exitHalfAngle=${o.exitHalfAngle}`,
      `mouthMode=${o.mouthMode}`, `thetaH=${o.thetaH}`, `thetaV=${o.thetaV}`,
      `arcH=${o.arcH}`, `arcV=${o.arcV}`, `depth=${n(depth)}`, `profileT=${n(profileT)}`,
      `profileArea=${o.profileArea}`, `sectionMode=${o.sectionMode}`,
      `divergeLen=${o.divergeLen}`, `arriveLen=${o.arriveLen}`, `tight=${o.tight}`,
      `mapStations=${stations}`,
      `lengthen=${o.lengthen ? `${o.lengthen.lobes}lobe/${o.lengthen.dir}/[${o.lengthen.uStart},${o.lengthen.uEnd}]` : "off"}`,
      `bulge=${o.bulge ? o.bulge.amp : "off"}`,
      `separate=${o.separate ? `${o.separate.lobes}lobe/[${o.separate.uStart},${o.separate.uEnd}]` : "off"}`,
      `wall=${shellWall}`, `jitter=${wallJitter}`, `shellStations=${shellStations}`,
      `throatEnd=${throatEnd}`, `mouthEnd=${mouthEnd}`,
      `region=${regX || regY ? `x${regX}y${regY}` : "full"}`,
    ];
    return g.join(" ");
  };

  const buildDXF = (map) => {
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

  const buildJSON = (map) => JSON.stringify({
    tool: "ginkgo multicell horn",
    units: "mm, Hz, degrees",
    driver: { exitDiameter: exitDia, exitHalfAngle: exitAngle, temperature, speedOfSound: c },
    topology: {
      family: shown.family, nCols: shown.nc, nRows: shown.nr,
      rings: shown.family === "ogrid" ? shown.rings : undefined,
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
      copedJoints: map.bulge ? {
        bulgeAmpMm: map.bulge.amp,
        doubleCountPercent: +map.bulge.doubleCountPct.toFixed(3),
        note: "mouthAreaTotal is the union (= the tiled aperture); per-cell mouth areas are the bulged outlines the expansion law lands on",
      } : null,
      separation: map.separate ? {
        ampMaxMm: +map.separate.ampMax.toFixed(3), cells: map.separate.cells,
      } : null,
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

  const buildCSV = (map) => {
    // The deferred clearance belongs to the PREVIEW map; the CSV ships the
    // export-resolution geometry, so its clearance is measured on that map
    // here, at the click.
    const clrNow = map && map.rows.length && map.rows[0].sched[0].pts
      ? G.ductClearance(map.rows) : null;
    const head = [
      "cell", "i", "j", "kind", "area_mm2", "open_area_mm2", "L_long_mm", "L_short_mm",
      "aspect", "diameter_mm", "convex", "pw_floor_Hz", "min_curv_radius_mm", "curvature_flag",
      "f1_Hz", "f1_model", "centroid_x", "centroid_y",
      "path_length_mm", "s_pad_mm", "turn_deg", "twist_deg", "aim_err_deg",
      // the expansion profile, per cell. Empty when no law is imposed.
      "profile_T", "hypex_m_per_mm", "fc_Hz", "expansion_ratio", "k_min", "k_max", "min_gap_mm",
      // lateral bow amplitude from path lengthening; empty when it is off
      "bow_amp_mm",
      // separation displacement, empty when no field is applied
      "sep_amp_mm",
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
        profileT != null ? profileT.toFixed(4) : "",
        r && r.profM != null ? r.profM.toExponential(6) : "",
        r && r.profFc != null ? r.profFc.toFixed(2) : "",
        r && r.profRatio != null ? r.profRatio.toFixed(6) : "",
        r && r.profM != null ? r.profScaleMin.toFixed(6) : "",
        r && r.profM != null ? r.profScaleMax.toFixed(6) : "",
        clrNow && clrNow.perCell.has(cc.id) && profileT != null
          ? clrNow.perCell.get(cc.id).toFixed(4) : "",
        map && map.lengthen && r ? r.snakeAmp.toFixed(3) : "",
        map && map.separate && r ? r.sepAmp.toFixed(3) : "",
      ].join(",");
    });
    return [head, ...rows].join("\n");
  };

  const buildSigmaCSV = (map) => {
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

  // ── the solids for the 3-D preview, built off the render pass ─────────────
  // ductSections applies the same inset the STL export applies, so what the
  // preview shows IS the exported geometry. Every 2nd boundary point is kept
  // — plenty for the eye, and it halves the fill work per frame.
  // THE PREVIEW SHOWS THE AIR, AND NOTHING ELSE. A "shell blanks" mode was
  // built and removed at the owner's call: a blank is an intermediate the CAD
  // boolean consumes, not a form anyone judges a horn by, and its outline is
  // the duct's own outline pushed out by one number — so it showed nothing
  // the duct view did not already show. The shell kit still EXPORTS the
  // blanks; `shellSections` and `buildShellSTEP` are untouched.
  const [solids3d, setSolids3d] = useState(null);
  useEffect(() => {
    if (!map || !map.rows.length || !map.rows[0].sched[0].pts) { setSolids3d(null); return; }
    const id = setTimeout(() => {
      const ducts = [];
      for (const cc of throat.cells) {
        const r = map.rows.find((x) => x.id === cc.id);
        if (!r) continue;
        const secs = G.ductSections(cc, r, { t: thickness });
        if (!secs) continue;
        ducts.push({
          id: cc.id, color: cellFill(cc),
          rings: secs.map((s) => s.pts.filter((_, k) => k % 2 === 0)),
        });
      }
      setSolids3d({ of: map, ducts });
    }, 80);
    return () => clearTimeout(id);
  }, [map]);
  const solidsStale = !solids3d || solids3d.of !== map;

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
    // The chord extents are DIMENSIONED ON THE DRAWING rather than printed as
    // a line of text beside it: the two numbers describe the rectangle already
    // on screen, so a reader should not have to match "432.2 x 208.7" back to
    // an outline by eye. The padding is sized from the label rather than as a
    // fixed fraction, so the witness lines and their text always have room at
    // any aspect ratio.
    const fs = Math.min(mouthW, mouthH) * 0.075;
    const padx = mouthW * 0.05 + fs * 2.6, pady = mouthH * 0.05 + fs * 2.6;
    const vb = `${-mouthW / 2 - padx} ${-mouthH / 2 - pady} ${mouthW + 2 * padx} ${mouthH + 2 * pady}`;
    const sw = mouthW * 0.0016;
    const els = [];
    map.rows.forEach((r) => {
      const cc = throat.cells.find((x) => x.id === r.id);
      // with the joints on, the quad of corners is no longer the outline —
      // draw the real bulged ring so the overlaps are visible where they are
      const ring = map.bulge && r.sched[r.sched.length - 1].pts;
      const p = ring ? ring.map((q) => [q[0], q[1]]) : r.mouthCorners.map((q) => [q[0], q[1]]);
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

    // ── CHORD DIMENSIONS ────────────────────────────────────────────────────
    // Drafting convention: a witness tick at each end, a dimension line
    // between them, the figure sitting above the line. These are the CHORD
    // extents — the straight-line width and height of the aperture — not arc
    // lengths, which are the inputs a few rows up and are already stated
    // there.
    const wY = mouthH / 2 + fs * 1.1;    // dimension line below the outline
    const hX = -mouthW / 2 - fs * 1.1;   // and to the left of it
    const tick = fs * 0.38;
    els.push(<g key="dims" stroke={C.accent} strokeWidth={sw * 1.5} fill="none"
      opacity={0.75} style={{ pointerEvents: "none" }}>
      <line x1={-mouthW / 2} y1={wY - tick} x2={-mouthW / 2} y2={wY + tick} />
      <line x1={mouthW / 2} y1={wY - tick} x2={mouthW / 2} y2={wY + tick} />
      <line x1={-mouthW / 2} y1={wY} x2={mouthW / 2} y2={wY} />
      <line x1={hX - tick} y1={-mouthH / 2} x2={hX + tick} y2={-mouthH / 2} />
      <line x1={hX - tick} y1={mouthH / 2} x2={hX + tick} y2={mouthH / 2} />
      <line x1={hX} y1={-mouthH / 2} x2={hX} y2={mouthH / 2} />
    </g>);
    els.push(<text key="dimw" x={0} y={wY} dy={-fs * 0.38} fill={C.accent} fontSize={fs}
      fontFamily={C.mono} textAnchor="middle" style={{ pointerEvents: "none" }}>
      {fmt(map.mouthWEff, 1)} mm</text>);
    els.push(<text key="dimh" x={hX} y={0} dy={-fs * 0.38} fill={C.accent} fontSize={fs}
      fontFamily={C.mono} textAnchor="middle" transform={`rotate(-90 ${hX} 0)`}
      style={{ pointerEvents: "none" }}>{fmt(map.mouthHEff, 1)} mm</text>);

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
  // The exported region, and the tag that keeps a half's filename apart from
  // the whole horn's. A cell whose centroid sits ON a plane is its own mirror
  // image and is kept whole — `onPlane` is what says so.
  const regSel = throat && (regX || regY) ? G.symmetryRegion(throat, { xSide: regX, ySide: regY }) : null;
  const regTag = `${regX ? (regX > 0 ? "_x+" : "_x-") : ""}${regY ? (regY > 0 ? "_y+" : "_y-") : ""}`;

  // ── layout chrome ──────────────────────────────────────────────────────────
  const vGroup = { fontSize: 10, fontWeight: 600, color: C.inkDim, textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 2px 6px" };
  const tabBtn = (on) => ({
    fontFamily: C.mono, fontSize: 10, padding: "4px 11px", cursor: "pointer",
    color: on ? C.accent : C.inkMuted, background: on ? C.panel : "transparent",
    border: `1px solid ${on ? C.border : "transparent"}`, borderBottom: "none",
    borderRadius: "4px 4px 0 0",
  });
  const hintStyle = { fontSize: 10, color: C.inkMuted, lineHeight: 1.5 };

  // ── LEFT PANE — the design sequence ────────────────────────────────────────
  const leftPane = (
    <div style={{
      ...(narrow ? {} : { overflowY: "auto", minHeight: 0 }),
      padding: "12px 14px 20vh 14px", display: "flex", flexDirection: "column", gap: 12,
    }}>

      <Stage n={1} title="Driver & material" why="the physical givens — everything downstream starts from the exit">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0 12px" }}>
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
      </Stage>

      <Stage n={2} title="Throat partition" why="divide the exit into equal open areas — buy f₁ with rows, not columns">
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          {[["hgrid", "H-grid — one (i,j) index, 4 rim singularities"],
            ["ogrid", "O-grid — concentric rings, no singularities"]].map(([v, l]) => (
            <button key={v} onClick={() => setFamily(v)} style={{ ...btn(family === v, C.series4), fontSize: 11, padding: "5px 10px" }}>{l}</button>
          ))}
          {family === "hgrid" && <>
            <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: 8 }}>shape order m</span>
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => setShapeOrder(d)} style={btn(shapeOrder === d, C.series7)}>{d}</button>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, marginLeft: 6 }}>
              <input type="checkbox" checked={symmetric} onChange={(e) => setSymmetric(e.target.checked)} style={{ accentColor: C.series7 }} />
              <span style={{ color: C.inkDim }}>both mirrors</span>
            </label>
            <button onClick={() => setRequest(null)} style={{ ...btn(false, C.series5), marginLeft: 4 }}>Reset to nominal</button>
          </>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0 12px", marginBottom: 4 }}>
          {family === "hgrid" && <>
            <NumInput label="Columns n_cols" value={nc} onChange={(v) => setNc(Math.round(v))} min={2} max={16} step={1} accent={C.series4} />
            <NumInput label="Rows n_rows" value={nr} onChange={(v) => setNr(Math.round(v))} min={1} max={10} step={1} accent={C.series4} />
          </>}
          {family === "ogrid" && <div style={{ gridColumn: "span 2" }}>
            <label style={sLabel}>Ring counts</label>
            <input value={ringSpec} onChange={(e) => setRingSpec(e.target.value)} placeholder="1,6,12" style={{ ...sInput, fontSize: 12 }} />
            <div style={{ fontSize: 10, color: C.series3, fontFamily: C.mono, marginTop: 4 }}>{rings.join(" + ")} = {rings.reduce((a, b) => a + b, 0)}</div>
          </div>}
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
              <div><span style={{ color: C.series4 }}>{cfg.nParams}</span> free · <span style={{ color: C.series1 }}>{cfg.nConstraints}</span> constraints · spare <span style={{ color: cfg.spare >= 0 ? C.series3 : C.series5 }}>{cfg.spare}</span></div>
              <div style={{ color: C.inkMuted }}>{cfg.nClasses} distinct cells under the mirrors · {singular.length} singular vertices</div>
            </>) : (<>
              <div><span style={{ color: C.series4 }}>{layout.mesh ? G.dofCount(layout.mesh) : 0}</span> node DOF · comparison family</div>
              <div style={{ color: C.inkMuted }}>{singular.length} singular vertices</div>
            </>)}
          </div>
        </div>

        {family === "hgrid" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 18px" }}>
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
                            {nomVal === 0 ? "0" : "↺"}
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

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={runOptimiser} disabled={running}
                style={{ ...btn(true, C.series1), fontSize: 11, padding: "6px 14px", opacity: running ? 0.5 : 1 }}>
                {running ? "Optimising…" : "Maximise min f₁"}
              </button>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {[["aspect", wAspect, setWAspect], ["twist", wTwist, setWTwist], ["correction", wCorrection, setWCorrection]].map(([l, v, set]) => (
                  <label key={l} style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 4, alignItems: "center" }}>
                    w<sub>{l}</sub>
                    <input type="number" value={v} min={0} max={5} step={0.1} onChange={(e) => set(parseFloat(e.target.value) || 0)}
                      style={{ ...sInput, width: 52, padding: "3px 5px", fontSize: 11 }} />
                  </label>
                ))}
                <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 4, alignItems: "center" }}>
                  evals
                  <input type="number" value={maxEval} min={40} max={2000} step={20} onChange={(e) => setMaxEval(parseInt(e.target.value) || 160)}
                    style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
                </label>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted, marginLeft: "auto", textAlign: "right", lineHeight: 1.5 }}>
                <div>J = {fmt(obj.J, 3)} · softmin f₁ {fmt(obj.soft, 2)} kHz</div>
                {optState && <div style={{ color: C.series4 }}>{optState.evals} evaluations in {(optState.ms / 1000).toFixed(1)} s</div>}
              </div>
            </div>

            <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontFamily: C.mono, fontSize: 11 }}>
              {stale && <Solving label="re-solving — figures show the previous grid" />}
              <span><span style={{ color: C.inkMuted }}>status </span>
                <span style={{ color: solve.converged ? C.series4 : C.series5 }}>
                  {solve.converged
                    ? "equal-area solution found"
                    : `infeasible — showing ${fmt((solve.reachedFraction || 0) * 100, 0)}% of the request`}
                </span></span>
              <span><span style={{ color: C.inkMuted }}>residual </span>{solve.residual.toExponential(2)}</span>
              <span><span style={{ color: C.inkMuted }}>correction </span>
                <span style={{ color: solve.correction > 0.2 ? C.series1 : C.ink }}>{fmt(solve.correction, 4)}</span></span>
              <span><span style={{ color: C.inkMuted }}>closest line spacing </span>
                <span style={{ color: solve.monotone && solve.monotone.gap < 0.02 ? C.series5 : C.ink }}>
                  {solve.monotone
                    ? (solve.monotone.gap < 1e-3 ? solve.monotone.gap.toExponential(2) : solve.monotone.gap.toFixed(4))
                    : "—"}</span></span>
            </div>
            <div style={{ ...hintStyle, marginTop: 6 }}>
              Sliders are <strong style={{ color: C.inkDim }}>requests</strong>: the solver returns the nearest parameter vector that still
              has equal areas — request on the left, achieved on the right, red when they differ. Whole-line curvature can genuinely run
              out; when it does, the tool names the binding constraint instead of returning a distorted grid.
            </div>
          </>
        )}

        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
              throat plane · looking into the driver {stale && <Solving />}
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
          <div style={{ marginTop: 4, fontFamily: C.mono, fontSize: 10, color: C.inkMuted, textAlign: "center" }}>
            isodiametric ceiling {fmt(throat.f1ceiling / 1000, 2)} kHz · undivided exit {fmt(throat.fUndividedAz / 1000, 2)} kHz ·
            gain {fmt(throat.f1min / throat.fUndividedAz, 2)}× of a {fmt(throat.f1ceiling / throat.fUndividedAz, 2)}× ceiling
          </div>
        </div>
      </Stage>

      <Stage n={3} title="Coverage & mouth" why="the aperture is stated by what it must deliver — two arcs, each with its own angle and length">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 10px" }}>
          <NumInput label="Coverage Θh" value={thetaH} onChange={setThetaH} unit="°" min={0} max={170} step={1} accent={C.accent} />
          <NumInput label="Arc length h" value={arcH} onChange={setArcH} unit="mm" min={40} max={3000} step={5} accent={C.accent} />
          <NumInput label="Coverage Θv" value={thetaV} onChange={setThetaV} unit="°" min={0} max={170} step={1} accent={C.series2} />
          <NumInput label="Arc length v" value={arcV} onChange={setArcV} unit="mm" min={40} max={3000} step={5} accent={C.series2} />
        </div>
        {map && map.biradial && (
          <div style={{ marginTop: 2, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
            <span><span style={{ color: C.inkMuted }}>radii </span>
              <span style={{ color: C.ink }}>
                {isFinite(map.biradial.rH) ? `${fmt(map.biradial.rH, 0)}` : "flat"} h ·{" "}
                {isFinite(map.biradial.rV) ? `${fmt(map.biradial.rV, 0)}` : "flat"} v</span>
              <span style={{ color: C.inkMuted }}> mm</span></span>
            <span><span style={{ color: C.inkMuted }}>per-cell area spread </span>
              <span style={{ color: map.mouthAreaSpread < 0.1 ? C.series4 : C.series5 }}>{fmt(map.mouthAreaSpread, 4)}%</span></span>
          </div>
        )}
        <div style={{ opacity: stale ? 0.35 : 1 }}>{mouthSVG()}</div>
        <div style={hintStyle}>
          Choose the aperture from the <strong style={{ color: C.inkDim }}>directivity</strong> requirement, then equalise the paths
          <em> to</em> it. Θ = 0 on either axis makes that axis flat; there is <strong style={{ color: C.inkDim }}>no apex</strong>, and ducts
          arrive normal to the surface. The per-axis pattern limits these arcs buy sit in the verdict pane, keyed to the chords dimensioned
          on the drawing.
        </div>
      </Stage>

      <Stage n={4} title="Expansion law" why="how the passage loads — T sets the schedule shape and the duct gaps with one number">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: C.inkMuted }}>T</span>
          <input type="range" min={0} max={1} step={0.01} value={profileT}
            onChange={(e) => setProfileT(parseFloat(e.target.value))}
            style={{ width: 150, accentColor: C.series3 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>
            {fmt(profileT, 2)} · {profileT < 0.02 ? "hyperbolic (cosh²)" : profileT > 0.98 ? "exponential" : "hypex"}
          </span>
          <NumInput label="Cutoff f_c" value={fcWanted} onChange={setFcWanted} unit="Hz" min={20} max={20000} step={10} accent={C.series3} />
          <button onClick={() => setProfileArea(profileArea === "open" ? "gross" : "open")}
            style={btn(profileArea === "open", C.series6)}>
            on {profileArea} area
          </button>
        </div>
        {href && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
            <span><span style={{ color: C.inkMuted }}>acoustic throat </span>{fmt(throat.openTotal / 100, 2)} cm²
              <span style={{ color: C.inkMuted }}> · ⌀{fmt(2 * href.rt, 1)} mm equivalent</span></span>
            <span><span style={{ color: C.inkMuted }}>target flare m </span>{(href.m * 1000).toFixed(3)} /m</span>
            {map && profileT != null && thickness > 0 && map.rows[0] && map.rows[0].profRatioGross && (
              <span><span style={{ color: C.inkMuted }}>ratio spread </span>
                <span style={{ color: map.ratioSpread < 0.5 ? C.series4 : C.series5 }}>{fmt(map.ratioSpread, 3)}%</span>
                <span style={{ color: C.inkMuted }}> · gross would read {fmt(map.ratioSpreadGross, 2)}%</span></span>
            )}
          </div>
        )}
        <div style={{ ...hintStyle, marginTop: 6 }}>
          m is <strong style={{ color: C.inkDim }}>solved</strong> per cell so the profile lands exactly on each cell's mouth area — f_c is a
          verdict, not a setting, and the target above drives the <em>path-needed</em> comparison in the verdict pane. The law is written on
          the <strong style={{ color: C.inkDim }}>open</strong> passage, which is what the wave travels through. T also sets the duct gaps:
          the convex profile dips below the near-linear fan of the centrelines, and raising T flattens the dip until the ducts touch.
        </div>
      </Stage>

      <Stage n={5} title="Depth & path" why="the one knob ΔL and the joints will spend — solve it, then experiment on top">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 130 }}>
            <NumInput label="Axial depth" value={depth} onChange={setDepth} unit="mm" min={10} max={2000} step={5} accent={C.series4} />
          </div>
          <button onClick={() => {
            const r = G.solveDepthForMinDL(throat, solveRefOpts());
            setDlSolve(r);
            if (r.ok) setDepth(Math.round(r.depth));
          }} style={btn(false, C.series4)}>solve depth for minimum ΔL</button>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
            {depthEqualising ? `estimate ≈ ${fmt(depthEqualising, 0)} mm` : ""}
          </span>
        </div>
        {dlSolve && (
          <div style={{ marginTop: 5, fontFamily: C.mono, fontSize: 10, lineHeight: 1.6 }}>
            {dlSolve.ok
              ? <><span style={{ color: C.inkMuted }}>min ΔL → depth </span>
                  <span style={{ color: C.series4 }}>{fmt(dlSolve.depth, 0)} mm</span>
                  <span style={{ color: C.inkMuted }}> at ΔL {fmt(dlSolve.dL, 2)} mm{dlSolve.atBound ? " — at the search bound, not an interior optimum" : ""}</span></>
              : <span style={{ color: C.series5 }}>min ΔL — {dlSolve.reason}</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: C.inkMuted }}>divergence run</span>
          <input type="range" min={0} max={40} step={0.5} value={divergeLen} onChange={(e) => setDivergeLen(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: C.series7 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(divergeLen, 1)} mm</span>
          <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: 4 }}>arrival run</span>
          <input type="range" min={0} max={60} step={0.5} value={arriveLen} onChange={(e) => setArriveLen(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: C.series7 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{fmt(arriveLen, 1)} mm</span>
        </div>
        <div style={{ ...hintStyle, marginTop: 6 }}>
          Pick any <strong style={{ color: C.inkDim }}>two of three</strong> — f_c, mouth size, ΔL-optimal depth. Depth buys path length and
          nothing else on the biradial mouth, and at the ΔL optimum the mouth's curvature centre lands on the throat so every cell is
          equidistant — watch the <strong style={{ color: C.inkDim }}>section</strong> tab while this moves. The solve resets both straight
          runs to 0 first, so it is a repeatable reference; a long <strong style={{ color: C.inkDim }}>arrival run</strong> then pushes the
          turning back toward the throat, where the section is small. Bend tightness is fixed at 0.5 — see the notes.
        </div>
      </Stage>

      <Stage n={6} title="Path lengthening" why="the correction applied after depth has done what it can">
        {/* THE DEFICIT MAP, above the controls that close it. Each bar is one
            cell's developed path against the longest, which is exactly what
            lengthening equalises — so the chart belongs with these inputs
            rather than in the pinned pane, where it said nothing the ΔL
            verdict did not already say. */}
        {map && <>
          <div style={{ opacity: stale ? 0.35 : 1 }}>{pathSVG()}</div>
          <div style={{ ...hintStyle, marginBottom: 8 }}>
            Padding lengthens short paths and cannot shorten long ones, so the <strong style={{ color: C.inkDim }}>longest cell sets the
            budget</strong> for every other. ≤ λ/8 is about −0.7 dB on the worst-case pair summation; λ/8 to λ/4 is the amber band; past
            λ/4 the cells fight each other.
          </div>
        </>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setLengthenOn(!lengthenOn)} style={btn(lengthenOn, C.series1)}>
            {lengthenOn ? "equalising to the longest cell" : "off — bare geometry"}
          </button>
          <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: 6 }}>lobes</span>
          {[1, 2].map((n) => (
            <button key={n} onClick={() => setLengthLobes(n)} disabled={!lengthenOn}
              style={{ ...btn(lengthLobes === n, C.series1), opacity: lengthenOn ? 1 : 0.4 }}>{n}</button>
          ))}
          <span style={{ fontSize: 10, color: C.inkMuted, marginLeft: 6 }}>bow direction</span>
          {[["radial", "radial out"], ["short", "short axis"]].map(([v, l]) => (
            <button key={v} onClick={() => setLengthDir(v)} disabled={!lengthenOn}
              style={{ ...btn(lengthDir === v, C.series2), opacity: lengthenOn ? 1 : 0.4 }}>{l}</button>
          ))}
          {lengthenOn && map && map.lengthen && map.lengthen.onAxis > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.series5 }}>
              {map.lengthen.onAxis} duct(s) on the axis — no symmetric bow exists for them
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, opacity: lengthenOn ? 1 : 0.4 }}>
          <span style={{ fontSize: 10, color: C.inkMuted }}>bow region</span>
          <input type="range" min={0} max={0.9} step={0.01} value={bowFrom} disabled={!lengthenOn}
            onChange={(e) => setBowFrom(Math.min(parseFloat(e.target.value), bowTo - 0.1))}
            style={{ width: 100, accentColor: C.series1 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{bowFrom.toFixed(2)}</span>
          <span style={{ fontSize: 10, color: C.inkMuted }}>to</span>
          <input type="range" min={0.1} max={1} step={0.01} value={bowTo} disabled={!lengthenOn}
            onChange={(e) => setBowTo(Math.max(parseFloat(e.target.value), bowFrom + 0.1))}
            style={{ width: 100, accentColor: C.series1 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim }}>{bowTo.toFixed(2)}</span>
          {[["throat half", 0, 0.5], ["throat third", 0, 1 / 3],
            ["throat quarter", 0, 0.25], ["throat fifth", 0, 0.2]].map(([l, a, b]) => (
            <button key={l} onClick={() => { setBowFrom(a); setBowTo(b); }} disabled={!lengthenOn}
              style={btn(Math.abs(bowFrom - a) < 1e-9 && Math.abs(bowTo - b) < 1e-9, C.series7)}>{l}</button>
          ))}
        </div>
        {lengthenOn && map && map.lengthen && (
          <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
            <span><span style={{ color: C.inkMuted }}>target </span>{fmt(map.lengthen.target, 1)} mm
              <span style={{ color: C.inkMuted }}> · {map.lengthen.cells} bowed</span></span>
            <span><span style={{ color: C.inkMuted }}>max amplitude </span>
              <span style={{ color: map.lengthen.ampMax > 25 ? C.series5 : map.lengthen.ampMax > 15 ? C.series1 : C.series4 }}>
                {fmt(map.lengthen.ampMax, 1)} mm</span></span>
            <span><span style={{ color: C.inkMuted }}>ΔL now </span>
              <span style={{ color: map.dLfrac <= 0.125 ? C.series4 : C.series5 }}>{fmt(map.dL, 3)} mm</span></span>
          </div>
        )}
        <div style={{ ...hintStyle, marginTop: 6 }}>
          Cells shorter than the longest are <strong style={{ color: C.inkDim }}>bowed sideways</strong> to its length inside the bow
          region; the straight runs are excised automatically. Narrowing the region is a <em>smaller</em> bow that turns harder — and the
          room is not at the throat, where the profile already has the ducts near touching. The region is set <em>by hand</em>: the
          automatic solve was withdrawn because it ranked on wall spread, which is blind to a bow that distorts the wavefront mid-path
          and unwinds it before the mouth, so it kept placing the bow out in the expanded end of the passage. Judge a bow by
          <strong style={{ color: C.inkDim }}> wall spread</strong> in the verdict pane, never by gross turning. Sections are swept in
          specified planes{map && map.sweptRollMax != null ? ` — imposed roll ${fmt(map.sweptRollMax, 1)}°, landing to ${map.sweptAimMax.toExponential(0)}°` : ""}.
        </div>
      </Stage>

      <Stage n={7} title="Coped joints" why="bulge the mouth tiles; ducts overlap before the mouth and meet at knife edges">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setBulgeOn(!bulgeOn)} style={btn(bulgeOn, C.series1)}>
            {bulgeOn ? "joints on" : "off — tiled mouth"}
          </button>
          <span style={{ fontSize: 10, color: C.inkMuted, opacity: bulgeOn ? 1 : 0.5 }}>bulge amplitude</span>
          <input type="range" min={0.5} max={15} step={0.5} value={bulgeAmp} disabled={!bulgeOn}
            onChange={(e) => setBulgeAmp(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: C.series1, opacity: bulgeOn ? 1 : 0.4 }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkDim, opacity: bulgeOn ? 1 : 0.5 }}>{fmt(bulgeAmp, 1)} mm</span>
          {bulgeOn && map && map.bulge && (
            <span style={{ fontFamily: C.mono, fontSize: 11, marginLeft: 8 }}>
              <span style={{ color: C.inkMuted }}>double-counted </span>
              <span style={{ color: C.series1 }}>{fmt(map.bulge.doubleCountPct, 2)}%</span>
              <span style={{ color: C.inkMuted }}> of the per-cell sum · union {fmt(map.mouthAreaTotal / 100, 0)} cm² unchanged</span>
            </span>
          )}
        </div>
        {bulgeOn && map && (
          <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11 }}>
            {!clearance ? <Solving label="measuring the joints" /> : clearance.joint && <>
              <span><span style={{ color: C.inkMuted }}>joints formed </span>
                <span style={{ color: clearance.joint.engaged === clearance.joint.pairs ? C.series4 : C.series1 }}>
                  {clearance.joint.engaged} / {clearance.joint.pairs}</span>
                <span style={{ color: C.inkMuted }}> neighbour pairs</span></span>
              {clearance.joint.engaged > 0 && <>
                <span><span style={{ color: C.inkMuted }}>knife edges from </span>
                  <span style={{ color: C.ink }}>{fmt(100 * clearance.joint.knifeMin / clearance.joint.stations, 0)}%</span>
                  <span style={{ color: C.inkMuted }}> of the path</span></span>
                <span><span style={{ color: C.inkMuted }}>engagement up to </span>
                  <span style={{ color: C.ink }}>{fmt(clearance.joint.engageMax, 1)} mm</span></span>
              </>}
            </>}
            <span><span style={{ color: C.inkMuted }}>bulged-outline area spread </span>
              <span style={{ color: C.ink }}>{fmt(map.mouthAreaSpreadBulged, 2)}%</span>
              <span style={{ color: C.inkMuted }}> · union shares {fmt(map.mouthAreaSpread, 4)}%</span></span>
          </div>
        )}
        <div style={{ ...hintStyle, marginTop: 6 }}>
          Each mouth cell's <strong style={{ color: C.inkDim }}>interior</strong> edges bow outward into the neighbour with a sine lobe —
          zero at the corners, so corner-maps-to-corner and the STEP topology survive — and the swept loft carries the bulge back down the
          whole path, so neighbouring ducts overlap increasingly toward the mouth and meet at curved knife edges, like coped pipe joints.
          A boolean union of the exported solids in CAD <em>produces</em> those knife edges.
          The rim never bulges, so the radiating aperture, the loading limit and the pattern limits do not move at all: the readout above
          shows how much the naive per-cell sum would double-count. What <strong style={{ color: C.inkDim }}>does</strong> move is f_c —
          each cell's expansion law now lands on its bulged outline, so the flare cutoff reads higher by roughly the double-count over
          twice the log of the radius ratio. Overlap inside a joint run is <strong style={{ color: C.inkDim }}>engagement</strong>, not a
          defect: the clearance readouts and warnings count only what happens before the knife edges.
        </div>
      </Stage>

      <Stage n={8} title="Duct separation" why="displace centrelines until the ducts clear — solved against the measured gap, and solved LAST">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.inkMuted }}>min gap</span>
          <input type="number" value={sepFloor} min={0.1} max={5} step={0.1}
            onChange={(e) => setSepFloor(Math.max(0.1, parseFloat(e.target.value) || 0.5))}
            style={{ ...sInput, width: 58, padding: "3px 5px", fontSize: 11 }} />
          <span style={{ fontSize: 10, color: C.inkMuted }}>mm</span>
          <button disabled={sepBusy} onClick={() => {
            setSepBusy(true);
            setTimeout(() => {
              const r = G.solveSeparation(throat, { ...mapOpts, depth, profileT, separate: null },
                { floor: sepFloor, mode: "uniform" });
              setSepSolve(r);
              setSepBusy(false);
            }, 30);
          }} style={{ ...btn(false, C.series4), opacity: sepBusy ? 0.4 : 1 }}>
            {sepBusy ? "solving…" : "solve · quick spread"}</button>
          <button disabled={sepBusy} onClick={() => {
            setSepBusy(true);
            setTimeout(() => {
              const r = G.solveSeparation(throat, { ...mapOpts, depth, profileT, separate: null },
                { floor: sepFloor, mode: "nudge", maxIter: 20 });
              setSepSolve(r);
              setSepBusy(false);
            }, 30);
          }} style={{ ...btn(false, C.series3), opacity: sepBusy ? 0.4 : 1 }}>
            {sepBusy ? "solving…" : "solve · per-duct nudge"}</button>
          {sepSolve && sepSolve.amps && (
            <button onClick={() => setSepSolve(null)} style={btn(false, C.series5)}>clear</button>
          )}
        </div>
        {sepSolve && (
          <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 10, lineHeight: 1.6 }}>
            {sepSolve.already
              ? <span style={{ color: C.series4 }}>nothing to solve — the worst gap is already {fmt(sepSolve.gapBefore, 2)} mm</span>
              : <>
                  <span style={{ color: sepSolve.ok ? C.series4 : C.series1 }}>
                    {sepSolve.mode === "uniform" ? "quick spread" : "per-duct nudge"}: worst gap {fmt(sepSolve.gapBefore, 2)} → {fmt(sepSolve.gapAfter, 2)} mm
                  </span>
                  <span style={{ color: C.inkMuted }}>
                    {" "}· amplitude up to {fmt(sepSolve.ampMax, 1)} mm over [{fmt(sepSolve.uStart, 2)}, {fmt(sepSolve.uEnd, 2)}] of the path
                    {" "}· ΔL {fmt(sepSolve.dLBefore, 2)} → {fmt(sepSolve.dL, 2)} mm
                    {" "}· {sepSolve.iters != null ? `${sepSolve.iters} rounds` : `${sepSolve.evals} evaluations`}
                  </span>
                  {!sepSolve.ok && <div style={{ color: C.series5 }}>{sepSolve.reason}</div>}
                </>}
          </div>
        )}
        <div style={{ ...hintStyle, marginTop: 6 }}>
          <strong style={{ color: C.inkDim }}>This stage comes last on purpose.</strong> Every stage above it moves the geometry this
          solve has to clear — the coped joints most directly, since a bulge widens each cell toward its neighbour and so eats the very gap
          being solved for. Solve it here, and the answer is measured on the ducts you are actually going to export; solve it earlier and
          the next change silently invalidates it. The solve is discarded automatically whenever anything upstream moves, including the
          bulge, so a stale field can never survive on screen.
          <br />
          The centrelines are displaced with the same windowed bow the lengthening uses, but with the amplitudes
          <strong style={{ color: C.inkDim }}> solved against the measured clearance</strong>, and the window placed where the trouble is.
          Ducts touching or merging is a joint; a gap between 0 and the minimum above is a <strong style={{ color: C.inkDim }}>sliver of
          wall too thin to print</strong>, and this is the lever that clears both it and real interpenetration.
          {" "}<em>Quick spread</em> pushes every duct outward by one shared amount — cheap, one knob, and it honestly reports when that
          single knob cannot fix the geometry. <em>Per-duct nudge</em> resolves each over-packed row and column as a contact chain and
          moves every duct individually — a few seconds, and the field keeps both mirrors by construction. Both leave the throat face and
          the mouth tiling untouched, and lengthening re-equalises the separated paths if it is on.
          <br />
          The minimum also sets <strong style={{ color: C.inkDim }}>where it starts applying</strong>. The cells tile at the throat exactly
          as they tile at the mouth, so the first stations are a knife edge too, and asking for a full gap there asks the ducts for room they
          have had no path length to open. Each pair's <strong style={{ color: C.inkDim }}>throat run</strong> is therefore the stretch from
          the throat over which the gap is still below the minimum <em>and still opening</em>. It ends the moment either fails: reaching the
          minimum means the pair has separated and ordinary scoring takes over, while <strong style={{ color: C.inkDim }}>closing again</strong>
          means the ducts are moving back toward each other — a defect at any magnitude, at any station, and the station that closed is scored
          as one.
          <br />
          This replaced a symmetric band around zero, which was too weak in exactly the place it mattered: a gap that dived to −0.49 mm and
          recovered sat inside a 0.5 mm band and was filed as a knife edge, so it never reached the number this solver optimises. The rule now
          asks for no absolute clearance near the throat at all — only that the wall never gets <em>thinner</em> than it already is — which is
          the weakest requirement that still refuses to call closing ducts a joint. One consequence worth knowing: the minimum no longer
          decides whether a dive is forgiven, only how far the knife-edge run reaches.
          <br />
          <strong style={{ color: C.inkDim }}>The verdict is resolution-independent; the depth is not.</strong> The dip is a sharp minimum
          very close to the throat, and the preview samples {PREVIEW_STATIONS} stations, so it can step straight over the worst of it — on the
          default horn the same defect reads −0.002 mm here and −0.24 mm at 48 stations, confirmed against an independent point-in-solid test.
          Treat a reported dip as real and its depth as a lower bound.
        </div>
      </Stage>

      <Stage n={9} title="Export" why="exports build at full resolution on click; the preview stays at 24 stations">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={expBtn} onClick={() => dl(`${stem}.dxf`, buildDXF(exportMap()), "application/dxf")}>DXF · one layer per station</button>
          <button style={expBtn} onClick={() => dl(`${stem}.json`, buildJSON(exportMap()), "application/json")}>JSON cell definition</button>
          <button style={expBtn} onClick={() => dl(`${stem}.csv`, buildCSV(exportMap()), "text/csv")}>CSV · per cell</button>
          <button style={expBtn} disabled={!map} onClick={() => dl(`${stem}_area_schedule.csv`, buildSigmaCSV(exportMap()), "text/csv")}>ΣA(x) CSV</button>
          <button style={expBtn} disabled={!map} onClick={() => {
            const solids = G.ductSolids(throat, exportMap(), { t: thickness, only: regSel ? regSel.labels : null });
            if (solids) dlBin(`${stem}_ducts${regTag}.stl`, G.buildSTL(solids, stem), "model/stl");
          }}>STL · cell ducts</button>
          <button style={expBtn} disabled={!map} onClick={() => {
            const r = G.buildSTEP(throat, exportMap(), { t: thickness, only: regSel ? regSel.labels : null, params: exportParams(), name: stem });
            if (!r) { setStepNote({ ok: false, msg: "no geometry to export" }); return; }
            const integ = G.stepIntegrity(r.text);
            const ok = integ.ok && r.checks.edgePairing && r.checks.residual < 1e-6;
            setStepNote({
              ok,
              msg: `${r.checks.ducts} solids · ${integ.entities} entities · surface-through-samples ${r.checks.residual.toExponential(1)} mm · ${
                ok ? "self-checks pass" : "SELF-CHECK FAILED — file not written"}`,
            });
            if (ok) dl(`${stem}${regTag}.step`, r.text, "application/step");
          }}>STEP · B-spline solids</button>
          <button style={expBtn} disabled={!map} onClick={() => {
            // the blanks are an offset of the ducts' own rings, so this is
            // fast, but the file is large enough to be worth a word first
            setStepNote({ ok: true, msg: "building the shell — offsetting each duct outwards…" });
            setTimeout(() => {
            const em = exportMap();
            const cfg = {
              t: thickness, wall: shellWall, jitter: wallJitter, stations: shellStations,
              extendThroat: endCfg(throatEnd).extend, trimThroat: endCfg(throatEnd).trim,
              extendMouth: endCfg(mouthEnd).extend, trimMouth: endCfg(mouthEnd).trim,
            };
            const r = G.buildShellSTEP(throat, em, { ...cfg, xSide: regX, ySide: regY, params: exportParams(), name: `${stem}_shell` });
            if (!r) { setStepNote({ ok: false, msg: "no geometry to export" }); return; }
            const integ = G.stepIntegrity(r.text);
            const ok = integ.ok && r.checks.edgePairing && r.checks.residual < 1e-6;
            const co = G.shellCoincidence(throat, em, cfg);
            const sov = G.shellOverlap(throat, em, { t: thickness, wall: shellWall });
            // The number `wall` has to be read against. At the throat the cells
            // TILE, so each blank pushes `wall` into its neighbour across the
            // whole shared face; once 2·wall passes a cell's width, the blanks
            // on either side of that cell reach past each other and solids that
            // share no edge at all share material.
            // Does the loft run past its own throat cap? Only meaningful when
            // the throat is extended — a plain throat stops at its end ring.
            const ov = endCfg(throatEnd).extend
              ? G.shellCapOvershoot(throat, em, { t: thickness, wall: shellWall, jitter: wallJitter, stations: shellStations })
              : null;
            const cw = G.throatCellWidth(throat, em, { t: thickness });
            const span = 2 * shellWall + wallJitter;
            const reaches = cw && span > cw.min;
            // A region export rests on a mirror, so the mirror is MEASURED
            // rather than assumed — a world-axis bow breaks one of them.
            const mir = r.region ? G.mirrorSymmetry(throat, em, { t: thickness }) : null;
            const axes = r.region ? [regX && "x", regY && "y"].filter(Boolean) : [];
            const mirWorst = mir ? Math.max(...axes.map((k) => mir[k].worst)) : 0;
            const ends = [r.ends.throat && "throat", r.ends.mouth && "mouth"].filter(Boolean);
            const recipe = ends.length
              ? `${r.cells} blanks + ${r.cells} cutters${r.trims ? ` + ${r.trims} trim${r.trims > 1 ? "s" : ""}` : ""} — union the blanks (extended past the ${ends.join(" and ")}${ends.length > 1 ? " faces" : " face"})${
                r.trimNames.length ? `, subtract ${r.trimNames.join(" and ")}` : ""}, subtract the cutters`
              : `${r.cells} blanks + ${r.cells} cutters — subtract each cutter from the blank of the same cell, no unions`;
            setStepNote({
              ok,
              msg: `${recipe} · ${integ.entities} entities · surface-through-samples ${r.checks.residual.toExponential(1)} mm${
                co ? ` · near-copy surface ${fmt(co.arc, 1)} mm${co.arc > 1 ? " — RAISE THE JITTER" : ""}` : ""}${
                sov ? ` · blanks share material over ${fmt(sov.fracTouching * 100, 0)}% of the path` : ""}${
                ov ? ` · throat cap overshoot ${fmt(ov.worst, 3)} mm${
                  ov.worst > 1e-3 ? ` at cell ${ov.at} — the extension is ${fmt(ov.minRatio, 2)}x the station step, RAISE IT ABOVE 0.5x OR USE A PLAIN THROAT` : ""}` : ""}${
                cw ? ` · throat cells ${fmt(cw.min, 1)}-${fmt(cw.max, 1)} mm wide against 2x wall ${fmt(span, 1)} mm${
                  reaches ? ` — BLANKS REACH PAST THEIR NEIGHBOURS, wall must be under ${fmt((cw.min - wallJitter) / 2, 2)} mm to stop it` : ""}` : ""}${
                r.region ? ` · ${axes.join(" and ")} mirror holds to ${mirWorst.toExponential(1)} mm${
                  mirWorst > 1e-3 ? " — MIRROR BROKEN, this region is not the whole horn" : ""}${
                  r.region.onPlane.length ? `, ${r.region.onPlane.length} cell(s) on the plane (${r.region.onPlane.join(" ")}) — do not duplicate them` : ""}` : ""} · ${
                ok ? "self-checks pass" : "SELF-CHECK FAILED — file not written"}`,
            });
            if (ok) dl(`${stem}_shell${regTag}.step`, r.text, "application/step");
            }, 30);
          }}>STEP · horn shell</button>
          <button style={expBtn} disabled={!map} onClick={() => {
            // the smallest thing that can fail: one adjacent pair, same
            // settings. If the union of two blanks fails, nothing about the
            // other sixteen matters, and the repro is two solids instead of 38.
            const em = exportMap();
            // the first ORTHOGONALLY ADJACENT pair — two cells that do not
            // share a grid line have none of the near-copy surface the test
            // is for
            let lab = null;
            for (const c of throat.cells) {
              const [col, rw] = c.label.split(",").map(Number);
              for (const [dc, dr] of [[1, 0], [0, 1]]) {
                const nb = `${col + dc},${rw + dr}`;
                if (!lab && throat.cells.some((x) => x.label === nb)) lab = [c.label, nb];
              }
            }
            const r = lab && G.buildShellSTEP(throat, em, {
              t: thickness, wall: shellWall, jitter: wallJitter,
              extendThroat: endCfg(throatEnd).extend, extendMouth: endCfg(mouthEnd).extend,
              stations: shellStations, only: lab, params: exportParams(), name: `${stem}_twocell`,
            });
            if (!r) { setStepNote({ ok: false, msg: "no geometry to export" }); return; }
            const integ = G.stepIntegrity(r.text);
            const ok = integ.ok && r.checks.edgePairing && r.checks.residual < 1e-6;
            setStepNote({
              ok,
              msg: `cells ${lab.join(" and ")}: ${r.cells} blanks + ${r.cells} cutters · ${integ.entities} entities · union the two blanks first — if that fails, the full kit cannot · ${
                ok ? "self-checks pass" : "SELF-CHECK FAILED — file not written"}`,
            });
            if (ok) dl(`${stem}_twocell.step`, r.text, "application/step");
          }}>STEP · two-cell test</button>
          {[["throat", throatEnd, setThroatEnd], ["mouth", mouthEnd, setMouthEnd]].map(([lab, val, set]) => (
            <div key={lab} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: C.mono, width: 40 }}>{lab}</span>
              {[["trim", "extend + trim"], ["extend", "extend only"], ["plain", "plain"]].map(([v, l]) => (
                <button key={v} onClick={() => set(v)} style={btn(val === v, C.series2)}>{l}</button>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: C.mono }}>region</span>
            {[[0, "both"], [1, "+x"], [-1, "\u2212x"]].map(([v, l]) => (
              <button key={`x${v}`} onClick={() => setRegX(v)} style={btn(regX === v, C.series3)}>{l}</button>
            ))}
            {[[0, "both"], [1, "+y"], [-1, "\u2212y"]].map(([v, l]) => (
              <button key={`y${v}`} onClick={() => setRegY(v)} style={btn(regY === v, C.series3)}>{l}</button>
            ))}
            {regSel && (
              <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: C.mono }}>
                {regSel.labels.length} of {throat.N} cells{regSel.onPlane.length ? ` · ${regSel.onPlane.length} on the plane` : ""}
              </span>
            )}
          </div>
          <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center" }}>
            shell wall (mm)
            <input type="number" value={shellWall} min={0.5} max={20} step={0.5} onChange={(e) => setShellWall(Math.max(0.5, Math.min(20, parseFloat(e.target.value) || 3)))}
              style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
          </label>
          <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center" }}>
            wall jitter (mm)
            <input type="number" value={wallJitter} min={0} max={2} step={0.1} onChange={(e) => setWallJitter(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))}
              style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
          </label>
          <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center" }}>
            shell stations
            <input type="number" value={shellStations} min={4} max={64} step={4} onChange={(e) => setShellStations(Math.max(4, Math.min(64, parseInt(e.target.value) || 32)))}
              style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
          </label>
          <label style={{ fontSize: 10, color: C.inkMuted, display: "flex", gap: 5, alignItems: "center" }}>
            export stations
            <input type="number" value={stations} min={2} max={64} step={1} onChange={(e) => setStations(Math.max(2, Math.min(64, parseInt(e.target.value) || 16)))}
              style={{ ...sInput, width: 60, padding: "3px 5px", fontSize: 11 }} />
          </label>
        </div>
        {stepNote && (
          <div style={{ marginTop: 5, fontFamily: C.mono, fontSize: 10, color: stepNote.ok ? C.series4 : C.series5 }}>
            STEP: {stepNote.msg}
          </div>
        )}
        <div style={{ ...hintStyle, marginTop: 6 }}>
          The STL carries the {throat.N} ducts as faceted closed solids; the <strong style={{ color: C.inkDim }}>STEP</strong> carries the
          same ducts as lofted B-spline solids — the file for CAD when the ducts need filleting, offsetting or joint cuts.
          <br />
          The <strong style={{ color: C.inkDim }}>horn shell</strong> is the material around that air, and it ships as{" "}
          <strong style={{ color: C.inkDim }}>one blank and one cutter per cell</strong>: the blank is that cell's duct offset outwards by{" "}
          {fmt(shellWall, 1)} mm on every side, the cutter is the duct extended past both end faces. In CAD you{" "}
          <strong style={{ color: C.inkDim }}>subtract each cutter from the blank of the same cell — {throat.N} independent subtractions,
          no unions</strong>, and what comes back is {throat.N} cell shells of exactly {fmt(shellWall, 1)} mm wall.
          {" "}Adjacent blanks share material wherever their ducts run closer than {fmt(2 * shellWall, 0)} mm — most of the throat half of
          the horn — which is what a multicell's shared walls are.
          {" "}<strong style={{ color: C.inkDim }}>The two ends are set separately, because they are not the same problem.</strong>
          {" "}<em>Extend + trim</em> runs the blanks past that face (staggered per cell, so no two adjacent ones end on the same plane)
          and ships the trim solid that cuts them back, so the union never touches that plane — where 54 of the measured degeneracies
          lived, 27 pairs of coplanar throat caps and 27 of co-surface mouth caps. <em>Extend only</em> ships the overlength blanks and
          leaves the cut to you. <em>Plain</em> makes the face from the loft's own end ring and asks for no cut there at all.
          {" "}<strong style={{ color: C.inkDim }}>The mouth trim cuts on the aperture surface itself</strong>, a curved face the blanks
          cross transversally, and it has never been reported failing. <strong style={{ color: C.inkDim }}>The throat trim cuts on the
          plane z = 0</strong> — the same operation as a plane split at the throat, which has been measured failing on individual blanks.
          On a <em>plain</em> throat the end ring is planar in z = 0 by construction and the wall stops exactly there; extended, the loft
          runs up to 0.016 mm past its own cap plane on the shortest-extension cells, measured. The price of a plain throat is the
          coplanar overlapping caps coming back, so it is a trade, not a fix.
          {" "}The <em>wall jitter</em> gives cells of opposite grid parity different walls: without it two adjacent blanks each offset
          the same shared grid line by the same amount, so millimetres of their surfaces are the same surface computed twice, landing
          under a micron apart — invisible, and below what a kernel can resolve. The note measures how much near-copy surface is left;
          raise the jitter if it is not zero.
          {" "}<strong style={{ color: C.inkDim }}>The wall has to be read against the throat cell width.</strong> The cells tile
          there, so each blank pushes the wall into its neighbour across the whole shared face; once 2x the wall passes a cell's width,
          the blanks on either side of that cell reach past each other and solids that share no edge at all share material. Measured at
          the defaults, that stacks the blanks SIX deep at the throat, and it is the FACE offset that does it, not the corner mitre —
          clamping every mitre to a full round left the stack at six. Dropping the wall moves it: stack 6 / 5 / 4 and non-adjacent
          sharing 29 / 18 / 2 pairs at wall 3 / 2.5 / 2, and zero at 1.5. The note prints both numbers on every export.
          {" "}<strong style={{ color: C.inkDim }}>Region</strong> exports one side of each mirror \u2014 a half, or a quarter \u2014 so the CAD
          work is a quarter of the booleans. It applies to all three solid exports and the filename carries the side.
          {regSel && regSel.onPlane.length ? <> On this grid the {regX && regY ? "quarter" : "half"} straddles a plane:{" "}
            <strong style={{ color: C.inkDim }}>{regSel.onPlane.length} cell(s) sit ON it</strong> ({regSel.onPlane.join(", ")}) and are
            their own mirror image, so they are exported whole and must not be duplicated when the region is mirrored back.</> : null}
          {" "}The note measures the mirror it rests on rather than assuming it \u2014 a bow whose direction is a world axis breaks one of
          them outright, and the region would then be a different horn from the side it is meant to stand for.
          {" "}<strong style={{ color: C.inkDim }}>Do not mirror a shell half and union it to itself</strong>: the wall jitter is keyed to
          grid parity, so a mirrored copy carries the SAME wall as the cell it now sits beside, which is exactly the near-copy surface the
          jitter exists to break. Export the opposite side here instead \u2014 the passages are mirror images either way, it is only the
          blanks' walls that differ.
          {" "}<em>Shell stations</em> trades knots for fidelity: halving them measured 0.105 mm of departure from the full-station loft,
          and fewer knots is a better-conditioned boolean. Never offset one of our faces in CAD — that extrapolates the wall surfaces past
          their range and the corner identity breaks (a +1 mm throat offset succeeded and +2 mm failed); ask for the extension here instead,
          where it is built into the loft.
          {" "}The mouth end faces of every solid lie on the aperture surface the coverage arcs define, so the mouths are co-surface and
          that outer rim edge is the one to fillet against edge diffraction. The wall is exactly {fmt(shellWall, 1)} mm on every face at
          every station — the blank is an offset of the duct's own rings, not a shape fitted to them — with two stated exceptions: a mitred
          corner reaches further than the wall by construction (1/sin of the half-angle), and the mouth lip measures about 0.26 mm under
          because it is snapped onto the curved aperture. DXF is 2-D per plane, so only the throat layer imports as a sketch.
        </div>
      </Stage>

      <details style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        <summary style={{ fontSize: 11, color: C.inkDim, cursor: "pointer", fontFamily: C.mono }}>
          Notes & model assumptions — reference, not required reading
        </summary>
        <div style={{ fontSize: 10, color: C.inkMuted, lineHeight: 1.6, padding: "8px 4px 0", fontFamily: C.sans }}>
          <strong style={{ color: C.inkDim }}>The three limits are three different questions</strong> · f_c is the flare constant, m·c/2π —
          how fast the passage expands. Whether the mouth is large enough to <em>load</em> there, and whether it is large enough to hold the
          <em> pattern</em>, are separate questions with their own answers, and at wide coverage they disagree by an order of magnitude. A horn
          can honestly have a 500 Hz flare cutoff, load to 312 Hz, and lose 90° control above 1.4 kHz — that is a small-mouthed horn, not an
          inconsistency, and it is why the verdict pane prints them separately and never merges them.
          <br />
          <strong style={{ color: C.inkDim }}>Why lines, and why they bend individually</strong> · A fixed square-to-disc map with adjustable
          division values offers (n_cols−1)+(n_rows−1) knobs against n_cols·n_rows−1 area constraints — not solvable. Each line therefore
          carries its own Chebyshev coefficients: far more freedom than division vectors, far less than free nodes, and the parameters stay
          legible. Only even orders appear under mirror symmetry.
          <br />
          <strong style={{ color: C.inkDim }}>Whole-line curvature can genuinely run out</strong> · An equal-area grid may not exist for a
          given corner angle and bow request; the honest answer is naming the binding constraint rather than returning a converged-looking
          distorted grid. Feasibility tightens as m falls and as α leaves the equal-arc default.
          <br />
          <strong style={{ color: C.inkDim }}>Singular vertices are not a layout failure</strong> · A rectangular index on a disc must
          produce vertices where the number of cells meeting is not four; the H-grid puts its four on the rim, where cells are already most
          distorted.
          <br />
          <strong style={{ color: C.inkDim }}>Rows, not columns</strong> · f₁_min is set by the row-direction edge length: adding columns
          narrows every cell while L_long barely moves. Adding a row is what moves the number.
          <br />
          <strong style={{ color: C.inkDim }}>Depth is the dominant ΔL lever</strong> · At the optimum the mouth's curvature centre lands on
          the throat and every cell is equidistant — measured 81 mm of ΔL at 200 mm depth falling to 2.0 mm at 425 on a 600 mm arc. It needs
          both radii to land together, so ΔL is lowest near arc_h/arc_v ≈ Θh/Θv; the minimum is broad.
          <br />
          <strong style={{ color: C.inkDim }}>Bend tightness is fixed at 0.5</strong> · The measured optimum is 0.45–0.55 on every well-posed
          geometry and flat between; the old slider minimum of 0.25 measured 8.50 mm of wall spread against 5.63 and 12.7 mm of ΔL against
          2.4. Above 0.8 it collapses outright.
          <br />
          <strong style={{ color: C.inkDim }}>What the first-mode number is, and is not</strong> · f₁ ≈ c/(2·max(L_long, L_short)) is a
          flat-rectangle approximation with error O((L/r_curv)²), sign not established — strongly curved cells are flagged, not corrected.
          Closed forms are used where they exist (full disc, circular sector) and the cell says which model ran.
          <br />
          <strong style={{ color: C.inkDim }}>Where the dividers end</strong> · The inset tapers linearly from full at the throat to zero at
          the mouth — the only two places the tiling is exactly true. The recombination analysis returns when the coped joints give the walls
          a real end station.
          <br />
          <strong style={{ color: C.inkDim }}>Assumptions carried in this build</strong> · Open-area correction is first order (t/2 per
          shared edge). Areas are throat-plane, not spherical-wavefront — the 2/(1+cos θ) factor is reported, never applied. Thermoviscous
          loss is the smooth-wall Kirchhoff lower bound. The achieved area spread is reported rather than equality asserted.
        </div>
      </details>
    </div>
  );

  // ── RIGHT PANE — the horn, pinned ──────────────────────────────────────────
  const views = [["ducts", "3-D ducts"], ["section", "horizontal section"], ["cells", "cells"]];
  const rightPane = (
    <div style={{
      borderLeft: narrow ? "none" : `1px solid ${C.borderStrong}`,
      borderTop: narrow ? `2px solid ${C.borderStrong}` : "none",
      display: "flex", flexDirection: "column", minHeight: 0, background: C.page,
    }}>
      <div style={{ padding: "8px 14px", display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.accent, letterSpacing: "0.04em" }}>
          {shown.family === "hgrid" ? `${shown.nc}×${shown.nr}` : "O-grid"} · ⌀{fmt(exitDia, 1)} · {fmt(thetaH, 0)}°×{fmt(thetaV, 0)}°
        </span>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
          depth {fmt(depth, 0)} · T {fmt(profileT, 2)} · {throat.N} cells · swept
        </span>
        <span style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 10, padding: "2px 8px", borderRadius: 9,
          color: stale ? C.accent : solve.converged ? C.series4 : C.series5,
          border: `1px solid ${stale ? C.accent : solve.converged ? C.series4 : C.series5}` }}>
          {stale ? "solving…" : solve.converged ? "equal-area ✓" : "infeasible"}
        </span>
      </div>

      {warnings.length > 0 && (
        <div style={{ background: C.series5 + "10", borderBottom: `1px solid ${C.series5}`, padding: "5px 14px", maxHeight: 130, overflowY: "auto", flex: "none" }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10.5, color: C.series5, marginBottom: 3, lineHeight: 1.4 }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 2, padding: "8px 12px 0", flex: "none" }}>
        {views.map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={tabBtn(view === k)}>{l}</button>
        ))}
      </div>
      <div style={{ margin: "0 12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "0 4px 4px 4px", flex: "none", padding: 6 }}>
        {view === "ducts" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", padding: "0 4px 4px" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
                the air · drag to orbit · scroll to zoom · what the STL and STEP export
              </span>
              {solidsStale && <Solving label="building solids" />}
            </div>
            {solids3d
              ? <DuctPreview ducts={solids3d.ducts} dim={solidsStale} />
              : <div style={{ fontSize: 11, color: C.inkMuted, padding: 20 }}>No duct solids — the mapping needs the H-grid.</div>}
          </div>
        )}
        {view === "section" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", padding: "0 4px 4px" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>middle row · centrelines and duct extent · the view that explains ΔL</span>
            </div>
            <div style={{ opacity: stale ? 0.35 : 1 }}>{crossSVG()}</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 2, flexWrap: "wrap", fontSize: 10 }}>
              <span style={{ color: C.series5 }}>━ shorter than mean</span>
              <span style={{ color: C.series4 }}>━ near mean</span>
              <span style={{ color: C.series1 }}>━ longer than mean</span>
            </div>
          </div>
        )}
        {view === "cells" && (
          <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
              <thead><tr>{["cell", "open mm²", "aspect", "f₁ kHz", "model", "path mm", "turn°", "twist°",
                ...(map && map.lengthen ? ["bow mm"] : []),
                ...(profileT != null && map ? ["f_c Hz", "k max", "gap mm"] : [])].map((h) => (
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
                      {td(fmt(cc.aspect, 2), cc.aspect > 2.5 ? C.series1 : C.ink)}
                      {td(fmt(cc.f1 / 1000, 2), isMin ? C.series5 : C.series4)}
                      <td style={{ textAlign: "right", padding: "3px 9px", color: C.inkMuted, fontSize: 10, whiteSpace: "nowrap" }}>
                        {cc.f1model}{cc.curvatureSensitive ? " ⚠" : ""}
                      </td>
                      {td(r ? fmt(r.Lpath, 2) : "—", C.inkDim)}
                      {td(r ? fmt(r.turnDeg, 1) : "—", C.inkDim)}
                      {td(r ? fmt(r.twistDeg, 1) : "—", C.inkDim)}
                      {map && map.lengthen && td(r && r.snakeAmp > 1e-9 ? fmt(r.snakeAmp, 1) : "0", r && r.snakeAmp > 1e-9 ? C.series1 : C.inkMuted)}
                      {profileT != null && map && <>
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
        )}
      </div>

      <div style={{ ...(narrow ? {} : { flex: 1, overflowY: "auto", minHeight: 0 }), padding: "4px 12px 24px" }}>
        <div style={vGroup}>Acoustic behaviour</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7 }}>
          {limits && limits.fcLo != null && (
            <Metric label="Flare cutoff f_c" value={`${fmt(limits.fcLo, 0)}–${fmt(limits.fcHi, 0)} Hz`}
              sub={`m·c/2π, the expansion rate alone${map && map.fcDecomp ? ` · spread ${fmt(map.fcDecomp.full, 1)}%` : ""}`} color={C.series3} />
          )}
          {limits && (
            <Metric label="Loading limit" value={`${fmt(limits.loadHz, 0)} Hz`}
              sub={`⌀${fmt(limits.dEq, 0)} mm equivalent · circumference = λ`} color={C.series4} />
          )}
          {limits && map && (
            <Metric label={`Pattern holds · ${fmt(thetaH, 0)}° H`}
              value={limits.patH ? `${fmt(limits.patH, 0)} Hz` : "flat axis"}
              sub={`λ/sin(Θ/2) over the ${fmt(map.mouthWEff, 0)} mm chord`} color={C.series1} />
          )}
          {limits && map && (
            <Metric label={`Pattern holds · ${fmt(thetaV, 0)}° V`}
              value={limits.patV ? `${fmt(limits.patV, 0)} Hz` : "flat axis"}
              sub={`over the ${fmt(map.mouthHEff, 0)} mm chord — widen arc v to lower it`} color={C.series2} />
          )}
          <Metric label="f₁ min" value={`${fmt(throat.f1min / 1000, 2)} kHz`}
            sub={`cell ${throat.f1minCell.label} · ${throat.f1minCell.f1model}`} color={C.series4} />
          {pathNeeded && map && (
            <Metric label={`Path needed for ${fmt(fcWanted, 0)} Hz`}
              value={pathNeeded.hi - pathNeeded.lo < 0.5 ? `${fmt(pathNeeded.lo, 0)} mm` : `${fmt(pathNeeded.lo, 0)}–${fmt(pathNeeded.hi, 0)} mm`}
              sub={pathNeeded.clears
                ? `have ${fmt(map.Lmin, 0)}–${fmt(map.Lmax, 0)} — every cell clears it, worst by ${fmt(-pathNeeded.worst, 0)} mm`
                : `have ${fmt(map.Lmin, 0)}–${fmt(map.Lmax, 0)} — worst cell short by ${fmt(pathNeeded.worst, 0)} mm`}
              color={pathNeeded.clears ? C.series4 : C.series5} />
          )}
          {map && (
            <Metric label="ΔL" value={`${fmt(map.dL, 2)} mm`}
              sub={`${fmt(map.dL / (map.lambda / 8), 1)}× the λ/8 budget at ${fmt(fTarget / 1000, 1)} kHz`}
              color={map.band === "ok" ? C.series4 : map.band === "warn" ? C.series1 : C.series5} />
          )}
          {map && (
            <Metric label="Wall spread" value={`${fmt(map.wallSpreadMax, 1)} mm`}
              sub={`longest vs shortest wall fibre · λ/8 = ${fmt(map.lambda / 8, 2)} mm`}
              color={map.wallSpreadMax > map.lambda / 8 ? C.series1 : C.series4} />
          )}
          {/* THE PASSAGE, NOT THE SECTION. The expansion law is solved on each
              ring's own area; what the wave crosses is that ring projected on
              the direction it travels. The two are the same thing only while
              the section stays square to the path, so this is the readout that
              says the horn is delivering the schedule it was solved for. */}
          {map && map.sectionMode === "swept" && (
            <Metric label="Passage" value={map.fluxContractCells === 0 ? "opens throughout"
              : `−${fmt(map.fluxContractMax * 100, 1)}%`}
              sub={map.fluxContractCells === 0
                ? `cross-section square to travel never narrows here · tilt ≤ ${fmt(map.sectionObliqMax, 1)}° — a tight bow can still hide under this sampling, read bend clearance too`
                : `${map.fluxContractCells} of ${throat.N} ducts constrict · narrowest ${fmt(map.fluxVsThroatMin * 100, 0)}% of its own throat, at ${map.sectionObliqCell}`}
              color={map.fluxContractCells === 0 ? C.series4 : C.series5} />
          )}
          {map && map.fcDecomp && (
            <Metric label="f_c spread, decomposed" value={`${fmt(map.fcDecomp.full, 2)}%`}
              sub={`length alone ${fmt(map.fcDecomp.fromLength, 2)}% · ratio alone ${fmt(map.fcDecomp.fromRatio, 2)}% — they partially cancel`}
              color={map.fcDecomp.full > 3 ? C.series5 : C.ink} />
          )}
        </div>

        <div style={vGroup}>Physical form</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7 }}>
          {map && (
            <Metric label="Mouth" value={`${fmt(map.mouthAreaTotal / 100, 0)} cm²`}
              sub={`chord ${fmt(map.mouthWEff, 0)} × ${fmt(map.mouthHEff, 0)} mm · ${fmt(Math.sqrt(map.mouthAreaTotal / throat.openTotal), 2)}× on radius`} />
          )}
          {map && (
            <Metric label="Body" value={`${fmt(depth, 0)} mm`}
              sub={`paths ${fmt(map.Lmin, 0)}–${fmt(map.Lmax, 0)} mm developed`} />
          )}
          {map && profileT != null && (
            <Metric label="Duct separation"
              value={!clearance ? "measuring…" : clearance.overlap > 0 ? `−${fmt(clearance.overlap, 2)} mm` : `${fmt(clearance.minMid, 2)} mm`}
              sub={!clearance ? "deferred off the render pass"
                : clearance.overlap > 0
                  ? `ducts interpenetrate at station ${clearance.overlapAt} · k ${fmt(map.profScaleMin, 2)}–${fmt(map.profScaleMax, 2)}`
                  : `narrowest gap at station ${clearance.minMidAt} · widest ${fmt(clearance.max, 1)} mm`
                    + (clearance.throat && clearance.throat.runs
                      ? (clearance.throat.dip != null
                          ? ` · the gap STOPS OPENING at station ${clearance.throat.dipAt}, closing ${fmt(clearance.throat.dip, 3)} mm — depth is a lower bound at ${PREVIEW_STATIONS} stations`
                          : ` · measured past the throat knife edge, ${clearance.throat.knifeMax} of ${clearance.throat.stations} stations in`)
                      : "")}
              color={!clearance ? C.inkMuted : clearance.overlap > 0 || clearance.minMid < 1e-3 ? C.series5 : C.series4} />
          )}
          {map && profileT != null && (
            <Metric label="Thin walls"
              value={!clearance || !clearance.thin ? "measuring…"
                : clearance.thin.count === 0 ? "none" : `${clearance.thin.count} spots`}
              sub={!clearance || !clearance.thin ? `gaps under ${fmt(sepFloor, 1)} mm, before the joints`
                : clearance.thin.count === 0
                  ? `no duct gap under ${fmt(sepFloor, 1)} mm outside the joints`
                  : `slivers under ${fmt(sepFloor, 1)} mm · worst ${fmt(clearance.thin.worst, 2)} mm at station ${clearance.thin.at} — solve separation (stage 8)`}
              color={!clearance || !clearance.thin ? C.inkMuted : clearance.thin.count === 0 ? C.series4 : C.series1} />
          )}
          <Metric label="Shell" value={`⌀ ${fmt(fab.dShell, 2)} mm`}
            sub={`+${fmt(fab.oversize, 2)} mm on ⌀${fmt(exitDia, 1)} to give the blocked area back`} />
          <Metric label="Divider blockage" value={`${fmt(throat.blockage * 100, 1)}%`}
            sub={`${fmt(throat.dividerTotal, 0)} mm of centreline at ${fmt(thickness, 2)} mm`}
            color={throat.blockage > 0.12 ? C.series1 : C.ink} />
          <Metric label="Cells" value={`${throat.N}`}
            sub={`worst aspect ${fmt(throat.aspectMax, 2)} · ${throat.nonConvex} non-convex · ${throat.curvatureFlagged} curvature-flagged`}
            color={throat.nonConvex || throat.curvatureFlagged ? C.series1 : C.ink} />
        </div>

        {map && (
          <>
            <div style={vGroup}>Routing</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7 }}>
              <Metric label="Max turning" value={`${fmt(map.turnMax, 1)}°`} sub="gross centreline turning — wall spread is the phase metric" />
              {/* The torus condition. A section swept around a bend sweeps its
                  inner edge around a smaller radius; once that edge reaches the
                  centre of curvature the solid turns inside out, and nothing
                  else in the export can see it — a folded duct still meshes
                  closed and still passes every cap check. */}
              {map.sectionMode === "swept" && isFinite(map.bendFoldMin) && (
                <Metric label="Bend clearance" value={`${fmt(map.bendFoldMin, 1)} mm`}
                  sub={map.bendFoldMin <= 0
                    ? `${map.bendFoldCell} folds — the bend is tighter than the duct is wide`
                    : `tightest bend clears its own section by this much (${map.bendFoldCell}) — an upper bound, it falls with sampling`}
                  color={map.bendFoldMin <= 0 ? C.series5 : map.bendFoldMin < 2 ? C.series1 : C.series4} />
              )}
              <Metric label="Max twist" value={`${fmt(map.twistMax, 1)}°`} sub="cross-section rotation, throat to mouth" />
              <Metric label="Max aim error" value={`${fmt(map.aimMax, 2)}°`} sub={`tolerance ≈ λ/(4d) = ${fmt(map.aimLimitDeg, 1)}°`}
                color={map.aimMax > map.aimLimitDeg ? C.series5 : C.ink} />
              <Metric label="Bend centroid" value={fmt(map.bendCentroidMean, 3)}
                sub="0 = all turning at the throat, 1 = at the mouth" color={map.bendCentroidMean < 0.5 ? C.series4 : C.inkDim} />
            </div>
          </>
        )}

        <div style={{ ...vGroup, opacity: map && map.bulge ? 1 : 0.55 }}>
          Coped joints{map && map.bulge ? "" : " — off, see stage 7"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7, opacity: map && map.bulge ? 1 : 0.55 }}>
          {map && map.bulge ? <>
            <Metric label="Double-counted area" value={`${fmt(map.bulge.doubleCountPct, 1)}%`}
              sub={`of the per-cell sum · the union stays ${fmt(map.mouthAreaTotal / 100, 0)} cm²`} color={C.series1} />
            <Metric label="Joints"
              value={!clearance || !clearance.joint ? "measuring…"
                : `${clearance.joint.engaged} / ${clearance.joint.pairs}`}
              sub={!clearance || !clearance.joint ? "deferred off the render pass"
                : clearance.joint.engaged
                  ? `knife edges from ${fmt(100 * clearance.joint.knifeMin / clearance.joint.stations, 0)}% of the path · up to ${fmt(clearance.joint.engageMax, 1)} mm deep`
                  : "no pair engages — raise the bulge amplitude"}
              color={!clearance || !clearance.joint ? C.inkMuted
                : clearance.joint.engaged === clearance.joint.pairs ? C.series4 : C.series1} />
          </> : <>
            <Metric label="Double-counted area" value="—" sub="sum vs union of bulged tiles" />
            <Metric label="Knife edges" value="—" sub="first-touch station per pair · engagement depth" />
          </>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      background: C.page, color: C.ink, fontFamily: C.sans, boxSizing: "border-box",
      ...(narrow ? { minHeight: "100vh" } : { height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }),
    }}>
      <style>{SPIN_CSS}</style>
      <div style={{
        padding: "7px 16px", borderBottom: `1px solid ${C.borderStrong}`, background: C.panelAlt,
        display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", flex: "none",
      }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.accent, margin: 0, letterSpacing: "0.05em" }}>
          GINKGO MULTICELL HORN
        </h1>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
          equal-area partition of a compression driver exit · per-cell ducts under an imposed Hypex expansion · biradial coverage mouth
        </span>
      </div>
      <div style={narrow
        ? {}
        : { flex: 1, display: "grid", gridTemplateColumns: "minmax(430px, 53fr) minmax(430px, 47fr)", minHeight: 0 }}>
        {leftPane}
        {rightPane}
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
    </div>
  );
}
