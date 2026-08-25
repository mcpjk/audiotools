// Test vectors for the H-grid throat partition tool. Run: npm run test:hgrid
//
// `vite build` succeeding proves nothing about this tool — a wrong coefficient
// compiles perfectly. These are the checks from the build spec, plus the two
// numerical properties the whole approach rests on: that the equal-area solve
// really reaches equal areas, and that the curvature knobs really cannot
// change them.
//
// Every expected value here comes from a closed form or from the spec, never
// from the tool's own output.
import * as M from "../src/hgrid-model.js";

const R = 17.75, D = 35.5, c = 349.0; // 30 C
const DISC = Math.PI * R * R; // 989.80 mm^2

let pass = 0, fail = 0;
const check = (name, got, want, tol, unit = "") => {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  const g = typeof got === "number" ? (Math.abs(got) < 1e-3 && got !== 0 ? got.toExponential(3) : got.toFixed(6)) : got;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(52)} ${String(g).padStart(14)} ${unit}  (want ${want}${tol ? ` ±${tol}` : ""})`);
};
const checkTrue = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(52)} ${detail}`);
};
const head = (s) => console.log(`\n${s}`);

// ── 1. corner placement ────────────────────────────────────────────────────
head("Corner placement");
check("equal-arc alpha, 6x3", M.equalArcAlphaDeg(6, 3), 30.0, 1e-9, "deg");
check("equal-arc alpha, 6x6", M.equalArcAlphaDeg(6, 6), 45.0, 1e-9, "deg");
// the conformally natural angle is NOT the equal-arc one, which is the point
const aSq = (M.scAlphaForAspect(1) * 180) / Math.PI;
check("conformal alpha for a square mouth", aSq, 45.0, 1e-3, "deg");
const a2 = M.scAlphaForAspect(2);
check("conformal rectangle aspect at that alpha", M.scRect(a2).X / M.scRect(a2).Y, 2.0, 1e-6);
checkTrue("conformal alpha for 2:1 differs from equal-arc 6x3",
  Math.abs((a2 * 180) / Math.PI - 30) > 5, `${((a2 * 180) / Math.PI).toFixed(2)} deg vs 30 deg`);

// ── 2. degrees of freedom ──────────────────────────────────────────────────
head("Degrees of freedom, 6x3");
const gStraight = M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: false });
check("DOF, straight edges", M.dofCount(gStraight), 38, 0);
check("independent area constraints", M.constraintCount(gStraight), 17, 0);
check("residual freedom", M.dofCount(gStraight) - M.constraintCount(gStraight), 21, 0);
const gCurved = M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true });
check("DOF with one control point per interior edge", M.dofCount(gCurved), 92, 0);
check("interior edges", gCurved.nInteriorEdges, 27, 0);

// ── 3. area closure ────────────────────────────────────────────────────────
head("Sum of cell areas = pi R^2, any layout");
const layouts = [
  ["hgrid 6x3 elliptical", M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, seed: "elliptical", bulge: true })],
  ["hgrid 6x3 conformal", M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, seed: "conformal", bulge: true })],
  ["hgrid 8x3 alpha 55", M.buildHGrid({ R, nc: 8, nr: 3, alphaDeg: 55, bulge: true })],
  ["hgrid 5x5", M.buildHGrid({ R, nc: 5, nr: 5, alphaDeg: 45, bulge: true })],
  ["ogrid 1+6+12", M.buildOGrid({ R, rings: [1, 6, 12] })],
  ["ogrid 1+5+8", M.buildOGrid({ R, rings: [1, 5, 8] })],
  ["ogrid 8 sectors", M.buildOGrid({ R, rings: [8] })],
  ["butterfly m2 p2", M.buildButterfly({ R, m: 2, p: 2, bulge: true })],
  ["butterfly m3 p1", M.buildButterfly({ R, m: 3, p: 1, bulge: true })],
];
for (const [name, mesh] of layouts) {
  let tot = 0;
  for (let i = 0; i < mesh.cells.length; i++) tot += M.cellArea(mesh, i);
  check(name, tot, DISC, 1e-9, "mm2");
}

// ── 4. the equal-area solve ────────────────────────────────────────────────
head("Equal-area solve");
// The direct solve is enough on a well-conditioned seed...
for (const [name, mk] of [
  ["hgrid 6x3 elliptical", () => M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, seed: "elliptical", bulge: true })],
  ["hgrid 6x3 conformal", () => M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, seed: "conformal", bulge: true })],
  ["butterfly m2 p2", () => M.buildButterfly({ R, m: 2, p: 2, bulge: true })],
]) {
  const mesh = mk();
  const before = M.areaSpread(mesh);
  const res = M.equaliseAreas(mesh, { iters: 60 });
  checkTrue(`${name}: spread ${before.toFixed(1)}% -> solved`, res.spread < 1e-7,
    `${res.spread.toExponential(2)}% in ${res.iters} iterations`);
  let tot = 0;
  for (let i = 0; i < mesh.cells.length; i++) tot += M.cellArea(mesh, i);
  check(`${name}: area still closes`, tot, DISC, 1e-9, "mm2");
}

// ...and demonstrably is NOT on an elliptical seed at a small corner angle,
// which is the reason the pipeline walks alpha down from 45 instead. If this
// ever starts passing, the continuation has become dead weight and should go.
{
  const raw = M.buildHGrid({ R, nc: 8, nr: 3, alphaDeg: M.equalArcAlphaDeg(8, 3), bulge: true });
  const rawRes = M.equaliseAreas(raw, { iters: 80 });
  checkTrue("8x3 at 24.5 deg: direct solve alone stalls (why continuation exists)",
    rawRes.spread > 1e-3, `${rawRes.spread.toFixed(1)}% spread`);
}

// The whole pipeline has to land every one of these.
head("Equal-area solve through the full pipeline");
for (const [nc, nr] of [[6, 3], [8, 3], [8, 4], [10, 3], [12, 3], [6, 6], [5, 5], [4, 2]])
  for (const seed of ["elliptical", "conformal"])
    for (const alphaDeg of [M.equalArcAlphaDeg(nc, nr), 45, 20, 65]) {
      const L = M.buildLayout({ R, nc, nr, alphaDeg, seed, bulge: true, t: 0, equalIters: 50 });
      const th = M.analyseThroat(L.mesh, { c, R });
      checkTrue(`${nc}x${nr} alpha ${alphaDeg.toFixed(1)} ${seed}`, th.spread < 1e-6,
        `${th.spread.toExponential(1)}%${L.fallback ? "  [fell back to the elliptical seed]" : ""}`);
    }

// ── 5. the stream-function flow ────────────────────────────────────────────
head("Area drift under a full unit-time stream-function flow (target < 0.01%)");
const basis6 = M.psiBasis("both", 6);
const basisH = M.psiBasis("horizontal", 4);
const basisN = M.psiBasis("none", 4);
check("basis size, both mirrors, degree 6", basis6.length, 6, 0);
check("basis size, horizontal mirror, degree 4", basisH.length, 6, 0);
check("basis size, unrestricted, degree 4", basisN.length, 15, 0);
checkTrue("both-mirror basis is odd in x and odd in y",
  basis6.every(([a, b]) => a % 2 === 1 && b % 2 === 1), JSON.stringify(basis6));

let worstDrift = 0, worstSpread = 0;
const knobSets = [
  { row_bow: 0.15 }, { row_bow: -0.4 }, { col_splay: 0.3 }, { col_splay: -0.55 },
  { radial_bias: 0.3 }, { radial_bias: -0.45 },
  { row_bow: -0.5, col_splay: 0.4, radial_bias: 0.25 },
  { row_bow: 0.8, col_splay: -0.7, radial_bias: 0.6 },
];
for (const knobs of knobSets) {
  const mesh = M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true });
  M.equaliseAreas(mesh, { iters: 60 });
  const before = mesh.cells.map((_, i) => M.cellArea(mesh, i));
  M.flowMesh(mesh, basis6, M.knobsToCoeffs(knobs, basis6), 24);
  const after = mesh.cells.map((_, i) => M.cellArea(mesh, i));
  const d = Math.max(...after.map((v, i) => Math.abs(v - before[i]) / before[i])) * 100;
  worstDrift = Math.max(worstDrift, d);
  worstSpread = Math.max(worstSpread, M.areaSpread(mesh));
  let tot = 0;
  for (let i = 0; i < mesh.cells.length; i++) tot += M.cellArea(mesh, i);
  if (Math.abs(tot - DISC) > 1e-7) { fail++; console.log(`  FAIL  flow broke area closure for ${JSON.stringify(knobs)}`); }
}
check("worst per-cell drift over 8 knob settings", worstDrift, 0, 0.01, "%");
check("worst resulting spread, before correction", worstSpread, 0, 0.01, "%");

head("Curvature sliders leave every cell area unchanged (after correction)");
for (const knobs of knobSets) {
  const L = M.buildLayout({
    R, nc: 6, nr: 3, alphaDeg: 30, bulge: true,
    basis: basis6, coef: M.knobsToCoeffs(knobs, basis6), t: 0.8, c,
  });
  const th = M.analyseThroat(L.mesh, { c, R, t: 0.8 });
  checkTrue(`${JSON.stringify(knobs).padEnd(46)}`, th.spread < 1e-7,
    `open-area spread ${th.spread.toExponential(2)}%`);
}

head("The flow only touches what has the freedom to move");
{
  // The O-grid has ring radii but no control points, so a curvature slider must
  // be a no-op on it rather than bending its radial dividers — which it did,
  // for 52% area spread, until flowMesh started checking.
  const og = M.buildLayout({
    family: "ogrid", R, rings: [1, 6, 12], t: 0.8, c,
    basis: basis6, coef: M.knobsToCoeffs({ row_bow: 0.35 }, basis6),
  });
  const ogt = M.analyseThroat(og.mesh, { c, R, t: 0.8 });
  checkTrue("a curvature slider is inert on the O-grid", M.canFlow(og.mesh) === false && ogt.spread < 1e-6,
    `spread ${ogt.spread.toExponential(1)}%, drift ${og.driftPct.toExponential(1)}%`);

  // Straight edges CAN carry the flow's node motion but not its shape, so the
  // drift is large by construction and the correction earns its keep.
  const straight = M.buildLayout({
    R, nc: 6, nr: 3, alphaDeg: 30, bulge: false, t: 0.8, c,
    basis: basis6, coef: M.knobsToCoeffs({ row_bow: 0.35 }, basis6),
  });
  const st = M.analyseThroat(straight.mesh, { c, R, t: 0.8 });
  checkTrue("straight edges: drift is large, and the correction still lands it",
    straight.driftPct > 1 && st.spread < 1e-6,
    `drift ${straight.driftPct.toFixed(1)}% -> spread ${st.spread.toExponential(1)}%`);
}

head("The rim is held fixed by the flow");
{
  const mesh = M.buildHGrid({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true });
  M.equaliseAreas(mesh, { iters: 60 });
  const th0 = mesh.nodes.map((n) => (n.kind === "rim" ? n.th : null));
  M.flowMesh(mesh, basis6, M.knobsToCoeffs({ row_bow: 0.8, col_splay: -0.7 }, basis6), 24);
  const moved = mesh.nodes.reduce((s, n, i) => (n.kind === "rim" ? Math.max(s, Math.abs(n.th - th0[i])) : s), 0);
  check("largest rim division point movement", moved, 0, 1e-12, "rad");
}

// ── 6. per-cell acoustics ──────────────────────────────────────────────────
head("Undivided references");
check("azimuthal (1,0)", (M.DISC_AZIMUTHAL * c) / (D / 1000) / 1000, 5.76, 0.005, "kHz");
check("radial (0,1)", (M.DISC_RADIAL * c) / (D / 1000) / 1000, 11.99, 0.005, "kHz");

head("O-grid references");
{
  const g = M.buildOGrid({ R, rings: [1, 6, 12] });
  // equal geometric area: r_j = R sqrt(cum/N). The spec quotes 4.0725 and
  // 10.7715, which are these to its own rounding.
  check("1+6+12  r1", g.radii[1], 4.0725, 0.002, "mm");
  check("1+6+12  r2", g.radii[2], 10.7715, 0.004, "mm");
  const a = M.analyseThroat(g, { c, R });
  check("1+6+12  f1_min", a.f1min / 1000, 22.5, 0.15, "kHz");
  const b = M.analyseThroat(M.buildOGrid({ R, rings: [1, 5, 8] }), { c, R });
  check("1+5+8   f1_min", b.f1min / 1000, 15.1, 0.15, "kHz");
}
head("O-grid ring specs, including the degenerate ones");
{
  // A circle carrying no divider still has to exist as geometry, and two points
  // on a circle bound TWO arcs. Both were once wrong in ways that left the
  // total area correct while individual cells were not, which is exactly the
  // kind of bug a sum-only check misses.
  for (const rings of [[1], [2], [8], [1, 6], [1, 1, 6], [1, 1, 1], [1, 2], [2, 4], [1, 6, 12], [6, 12], [1, 4, 8, 12]])
    for (const t of [0, 0.8]) {
      const L = M.buildLayout({ family: "ogrid", R, rings, t, c, equalIters: 40 });
      const th = M.analyseThroat(L.mesh, { c, R, t });
      let tot = 0;
      for (let i = 0; i < L.mesh.cells.length; i++) tot += M.cellArea(L.mesh, i);
      checkTrue(`${rings.join("+")} at t=${t}`,
        Math.abs(tot - DISC) < 1e-8 && th.f1min > 0 && (th.N < 2 || th.spread < 1e-6),
        `N=${th.N} sum=${tot.toFixed(6)} spread=${th.N < 2 ? "n/a" : th.spread.toExponential(1)} f1min=${(th.f1min / 1e3).toFixed(2)} kHz`);
    }
  // The build spec quotes 217 mm of divider centreline for the O-grid, and warns
  // that the H-grid must be recomputed rather than reusing it.
  const og = M.analyseThroat(M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], t: 0.8, c }).mesh, { c, R, t: 0.8 });
  check("1+6+12 divider centreline length", og.dividerTotal, 217, 1, "mm");
  // Ring radii move outward once wall thickness is accounted for: the centre
  // cell loses only its outer perimeter, the outer ring loses more.
  const g0 = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], t: 0, c }).mesh;
  const g1 = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], t: 0.8, c }).mesh;
  checkTrue("equalising OPEN area pushes the ring radii out",
    g1.radii[1] > g0.radii[1] && g1.radii[2] > g0.radii[2],
    `r1 ${g0.radii[1].toFixed(4)} -> ${g1.radii[1].toFixed(4)}, r2 ${g0.radii[2].toFixed(4)} -> ${g1.radii[2].toFixed(4)}`);
}

head("Pure-sector layouts saturate at the radial cap");
for (const n of [6, 8, 12, 18, 24]) {
  const a = M.analyseThroat(M.buildOGrid({ R, rings: [n] }), { c, R });
  check(`N = ${n}`, a.f1min / 1000, 11.99, 0.005, "kHz");
}
{
  const a4 = M.analyseThroat(M.buildOGrid({ R, rings: [4] }), { c, R });
  checkTrue("N = 4 is below the cap (azimuthal branch still governs)",
    a4.f1min / 1000 < 11.9, `${(a4.f1min / 1000).toFixed(3)} kHz`);
}

// ── 7. duct limits ─────────────────────────────────────────────────────────
head("Duct limits");
{
  const f1 = 22500, f = 20000;
  const alphaEv = ((2 * Math.PI) / c) * Math.sqrt(f1 * f1 - f * f);
  check("evanescent decay length, f1 22.5 kHz at 20 kHz", 1000 / alphaEv, 5.39, 0.01, "mm");
  check("three decay lengths", (3 * 1000) / alphaEv, 16.2, 0.1, "mm");
  const lam = (c / 20000) * 1000;
  check("lambda/8 at 20 kHz", lam / 8, 2.18, 0.01, "mm");
  check("bend turning limit, w = 10 mm at 20 kHz", ((lam / 8 / 10) * 180) / Math.PI, 12.5, 0.05, "deg");
}

// ── 8. the cross-check ─────────────────────────────────────────────────────
head("Cross-check: an equal-area H-grid should not beat the O-grid at comparable N");
{
  const o = M.analyseThroat(M.buildOGrid({ R, rings: [1, 6, 12] }), { c, R });
  const L = M.buildLayout({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true, t: 0, c });
  const h = M.analyseThroat(L.mesh, { c, R });
  checkTrue("hgrid 6x3 f1_min below ogrid 1+6+12", h.f1min < o.f1min,
    `${(h.f1min / 1000).toFixed(2)} kHz (N=${h.N}) vs ${(o.f1min / 1000).toFixed(2)} kHz (N=${o.N})`);
  checkTrue("below the isodiametric ceiling c sqrt(N) / 2D", h.f1min < h.f1ceiling,
    `${(h.f1min / 1000).toFixed(2)} vs ceiling ${(h.f1ceiling / 1000).toFixed(2)} kHz`);

  // ROWS, NOT COLUMNS. The build spec's hand estimates put 8x3 near 19.2 kHz,
  // above 6x3's 15.9 — and flag themselves as order-of-magnitude only. They are
  // wrong in DIRECTION: f1_min is set by the row-direction edge length, which
  // extra columns do not touch. A column only makes each cell narrower, raising
  // its aspect ratio while L_long stays put. Every closed-form vector above is
  // reproduced exactly, so this is reported as a finding, not patched away.
  const at = (nc, nr) => {
    let best = 0, bestA = 0;
    for (let a = 25; a <= 55; a += 2.5) {
      const t = M.analyseThroat(M.buildLayout({ R, nc, nr, alphaDeg: a, bulge: true, t: 0, c }).mesh, { c, R });
      if (t.f1min > best) { best = t.f1min; bestA = a; }
    }
    return { f: best, a: bestA };
  };
  const p63 = at(6, 3), p83 = at(8, 3), p64 = at(6, 4), p65 = at(6, 5);
  checkTrue("adding COLUMNS barely moves f1_min (6x3 -> 8x3)",
    Math.abs(p83.f - p63.f) / p63.f < 0.05,
    `${(p63.f / 1e3).toFixed(2)} -> ${(p83.f / 1e3).toFixed(2)} kHz for a third more cells`);
  checkTrue("adding ROWS does move it (6x3 -> 6x4 -> 6x5)",
    p64.f > p63.f * 1.2 && p65.f > p64.f * 1.15,
    `${(p63.f / 1e3).toFixed(2)} -> ${(p64.f / 1e3).toFixed(2)} -> ${(p65.f / 1e3).toFixed(2)} kHz`);
  checkTrue("the best corner angle is not the equal-arc seed for 8x3",
    Math.abs(p83.a - M.equalArcAlphaDeg(8, 3)) > 5,
    `best ${p83.a} deg vs equal-arc ${M.equalArcAlphaDeg(8, 3).toFixed(1)} deg`);
}

// ── 9. mapping ─────────────────────────────────────────────────────────────
head("Throat to mouth");
{
  const L = M.buildLayout({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true, t: 0.8, c });
  const th = M.analyseThroat(L.mesh, { c, R, t: 0.8 });
  const sph = M.mapThroatToMouth(L.mesh, th, { c, mouthW: 200, mouthH: 100, apex: 120, depth: 150, flatten: 1 });
  check("spherical cap about the apex: aim error", sph.aimMax, 0, 1e-6, "deg");
  const obl = M.mapThroatToMouth(L.mesh, th, { c, mouthW: 200, mouthH: 100, apex: 120, depth: 150, flatten: 1.6 });
  checkTrue("oblate spheroid: aim error appears", obl.aimMax > 1, `${obl.aimMax.toFixed(2)} deg`);
  checkTrue("padding brings every cell up to the longest path",
    sph.rows.every((r) => Math.abs(r.Lpath + r.pad - sph.Lmax) < 1e-9), `L_max ${sph.Lmax.toFixed(2)} mm`);
  checkTrue("the mapping is refused for a topology it cannot match",
    M.mapThroatToMouth(M.buildOGrid({ R, rings: [1, 6, 12] }), th, { c }) === null, "ogrid returns null");
  check("lambda at 20 kHz", sph.lambda, 17.45, 0.01, "mm");
}

head("Fabrication");
{
  const L = M.buildLayout({ R, nc: 6, nr: 3, alphaDeg: 30, bulge: true, t: 0.8, c });
  const th = M.analyseThroat(L.mesh, { c, R, t: 0.8 });
  checkTrue("blockage at 0.8 mm walls lands in the 15-20% band",
    th.blockage > 0.15 && th.blockage < 0.20, `${(th.blockage * 100).toFixed(1)}%`);
  checkTrue("H-grid divider run recomputed, not the O-grid's 217 mm",
    Math.abs(th.dividerTotal - 217) > 5, `${th.dividerTotal.toFixed(1)} mm`);
  const fab = M.fabrication({ throat: th, t: 0.8, R, c, f: 15000, process: "FDM" });
  check("shell oversize to give the area back", fab.dShell, D / Math.sqrt(1 - th.blockage), 1e-9, "mm");
  checkTrue("FDM roughness is not small against the boundary layer",
    fab.roughRatio > 0.5, `Ra/delta_v = ${fab.roughRatio.toFixed(2)}`);
}

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} checks passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
