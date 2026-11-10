// Closed-form test vectors for src/cavity-model.js. Run: npm run test:cavity
//
// Same rule as test-horn.mjs and test-box-modes.mjs: every expected value
// comes from mathematics done independently — a shape whose modes are known
// exactly, an analytic volume, an exact mode count — never from running the
// tool and recording what it said. Shapes are deliberately MISALIGNED with
// the grid (a box rotated 30°, a cylinder), so that a voxel staircase has
// nowhere to hide.
import * as X from "../src/cavity-model.js";
import * as M from "../src/box-modes-model.js";

let pass = 0, fail = 0;
const t0 = Date.now();
const check = (name, got, want, tol, unit = "") => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  const g = Math.abs(got) < 1e-3 && got !== 0 ? got.toExponential(3) : got.toFixed(5);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(64)} ${g.padStart(13)} ${unit}  (want ${want}${tol ? ` ±${tol}` : ""})`);
};
const checkTrue = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(64)} ${detail}`);
};
const head = (s) => console.log(`\n${s}`);
const c = 343;
const kOf = (f) => (2 * Math.PI * f) / c;

// exact modes of a rigid W × L × D box, sorted
const boxExact = (W, L, D, fMax) => {
  const out = [];
  for (let l = 0; l <= 2 * fMax * W / c; l++) for (let m = 0; m <= 2 * fMax * L / c; m++) for (let n = 0; n <= 2 * fMax * D / c; n++) {
    const f = (c / 2) * Math.hypot(l / W, m / L, n / D);
    if (f <= fMax) out.push(f);
  }
  return out.sort((a, b) => a - b);
};

// ── 1. STL in and out ───────────────────────────────────────────────────────
head("STL: binary and ASCII both parse to the same triangles; mesh volume is exact");
{
  const tri = X.boxMesh(0.4, 0.6, 0.375, 0);
  const bin = X.parseSTL(X.writeSTL(tri));
  let ascii = "solid t\n";
  for (let t = 0; t < tri.length; t += 9) {
    ascii += " facet normal 0 0 0\n  outer loop\n";
    for (let v = 0; v < 3; v++) ascii += `   vertex ${tri[t + 3 * v] * 1000} ${tri[t + 3 * v + 1] * 1000} ${tri[t + 3 * v + 2] * 1000}\n`;
    ascii += "  endloop\n endfacet\n";
  }
  const asc = X.parseSTL(new TextEncoder().encode(ascii + "endsolid t\n").buffer);
  checkTrue("binary round trip: 12 triangles", bin.length === 108);
  check("binary vs ASCII, largest coordinate difference", Math.max(...bin.map((v, i) => Math.abs(v - asc[i]))), 0, 1e-7, "m");
  check("divergence-theorem volume = W·L·D", Math.abs(X.meshVolume(bin)), 0.4 * 0.6 * 0.375, 1e-7, "m³");
  check("surface area = 2(WL + LD + WD)", X.meshArea(bin), 2 * (0.24 + 0.225 + 0.15), 1e-6, "m²");
}

// ── 2. the voxeliser ────────────────────────────────────────────────────────
head("Cut-cell air volume matches the analytic volume, misaligned shapes");
const rotBox = X.boxMesh(0.40, 0.60, 0.375, Math.PI / 6);
const cyl = X.cylinderMesh(0.15, 0.40, 256);
{
  const v1 = X.voxelise(rotBox, 0.02);
  const op1 = X.buildOperator(v1);
  check("box rotated 30°, 20 mm grid: volume / exact", op1.volume / 0.09, 1, 0.002, "ratio");
  checkTrue("closed mesh: no broken rays", v1.badRays === 0, `${v1.badRays} of ${v1.rays}`);
  const v2 = X.voxelise(cyl, 0.02);
  // a 256-gon has area (n/2)·sin(2π/n)·a², 0.01% under πa²
  const exact = 128 * Math.sin((2 * Math.PI) / 256) * 0.15 ** 2 * 0.40;
  check("cylinder, 20 mm grid: volume / exact", X.buildOperator(v2).volume / exact, 1, 0.003, "ratio");
  // remove one triangle from a side wall (rays run along x, so a hole in a
  // wall parallel to x would never be crossed)
  const holed = Float64Array.from([...rotBox.slice(0, 54), ...rotBox.slice(63)]);
  checkTrue("a mesh with a hole is reported (broken rays > 0)", X.voxelise(holed, 0.02).badRays > 0);
}

// ── 3. mode frequencies against closed forms ────────────────────────────────
head("Mode frequencies: rotated box (exact = unrotated box) and closed cylinder (Bessel zeros)");
const errs = (got, want) => got.map((f, i) => Math.abs(f / want[i] - 1));
{
  const fCut = 720;
  const op = X.buildOperator(X.voxelise(rotBox, 0.02));
  const r = X.solveModes(op, kOf(fCut));
  const ms = X.normaliseModes(op, r.modes, c);
  const ex = boxExact(0.40, 0.60, 0.375, fCut);
  checkTrue("Lanczos reports convergence", r.converged, `${r.steps} steps`);
  // the count is exact for a box; skip it only if a mode sits within 1% of the cut
  checkTrue("number of modes found = exact count below the cut-off", ms.length === ex.length || ex.some((f) => Math.abs(f / fCut - 1) < 0.01),
    `${ms.length} vs ${ex.length}`);
  check("uniform mode first, at 0 Hz", ms[0].f, 0, 1e-3, "Hz");
  checkTrue("uniform mode flagged", ms[0].uniform);
  check("uniform mode weight V/Λ", ms[0].weight, 1, 1e-6);
  check("worst relative error, first 8 modes, 20 mm grid", Math.max(...errs(ms.slice(1, 9).map((m) => m.f), ex.slice(1, 9))), 0, 0.004, "");
  // modes are orthogonal in the mass inner product
  let worst = 0;
  for (let i = 1; i < 6; i++) for (let j = 0; j < i; j++) {
    let s = 0; for (let n = 0; n < op.N; n++) s += op.mass[n] * r.modes[i].phi[n] * r.modes[j].phi[n];
    worst = Math.max(worst, Math.abs(s));
  }
  check("M-orthogonality of the first six modes, worst |φᵢᵀMφⱼ|", worst, 0, 1e-5);
}
{
  // closed cylinder, radius a, height H: f = (c/2π)·hypot(j'_mn/a, pπ/H)
  // j'_mn: zeros of J_m' — 1.841184 (1,1), 3.054237 (2,1), 3.831706 (0,1), 4.201189 (3,1)
  const a = 0.15, H = 0.40, fCut = 1000;
  const jp = [[0, 0], [1, 1.841184], [2, 3.054237], [0, 3.831706], [3, 4.201189], [4, 5.317553], [1, 5.331443]];
  const ex = [];
  for (const [m, z] of jp) for (let p = 0; p < 6; p++) {
    const f = (c / (2 * Math.PI)) * Math.hypot(z / a, (p * Math.PI) / H);
    if (f <= fCut) { ex.push(f); if (m > 0) ex.push(f); } // m ≥ 1 is a degenerate pair
  }
  ex.sort((x, y) => x - y);
  const run = (h) => {
    const op = X.buildOperator(X.voxelise(cyl, h));
    return X.normaliseModes(op, X.solveModes(op, kOf(fCut)).modes, c).map((m) => m.f);
  };
  const f20 = run(0.02), f14 = run(0.014);
  const e20 = Math.max(...errs(f20.slice(1, 11), ex.slice(1, 11)));
  const e14 = Math.max(...errs(f14.slice(1, 11), ex.slice(1, 11)));
  checkTrue("number of modes found = exact count", f14.length === ex.length, `${f14.length} vs ${ex.length}`);
  check("worst relative error, all modes to 1 kHz, 20 mm grid", e20, 0, 0.012, "");
  check("worst relative error, all modes to 1 kHz, 14 mm grid", e14, 0, 0.006, "");
  // degenerate pairs stay paired — a staircased circle splits them by ~3%
  const pair = f14.filter((f) => Math.abs(f / 670.1 - 1) < 0.03);
  checkTrue("(1,1,0) at 670 Hz comes out as a pair", pair.length === 2, `${pair.length} found`);
  check("(1,1,0) pair: relative split", Math.abs(pair[1] / pair[0] - 1), 0, 0.002, "");
  checkTrue("error falls as the grid refines (20 → 14 mm)", e14 < e20, `${(e20 * 100).toFixed(2)}% → ${(e14 * 100).toFixed(2)}%`);
}

// ── 4. the forced response against the analytic box ────────────────────────
// The numerical modes go through the same modal sum as box-modes-model.js.
// Reference: the analytic box, converged (modes to 8 kHz). Numerical: modes
// to only 1.5× the top frequency read, with and without the static tail.
head("Forced response R = p/p₀, driver disc → port mouth, against the analytic box");
{
  const dims = { W: 0.30, L: 0.45, D: 0.25 }, Q = 10, fRead = 800, h = 0.0125;
  const tris = X.boxMesh(dims.W, dims.L, dims.D, 0);
  const op = X.buildOperator(X.voxelise(tris, h));
  const modes = X.normaliseModes(op, X.solveModes(op, kOf(1.5 * fRead)).modes, c);
  const dC = [0.15, 0.28, 0], pC = [0.08, 0.10, 0.20];
  const n = X.wallNormal(op, tris, dC, 0.05);
  check("wall normal at the baffle points into the box (+z)", n[2], 1, 1e-9);
  const src = X.discFunctional(op, dC, n, 0.085), rcv = X.rectFunctional(op, pC, 0.06, 0.06, 2);
  const st = X.staticFields(op, src);
  const withTail = X.couple(modes, src, rcv, st), noTail = { ...withTail, t1: 0, t2: 0 };
  const ref = M.listModes(dims, c, 8000).map((mode) => ({ mode,
    s: M.avgPsi(mode, M.discPoints(dC, 0.085, "front", dims, 12), dims),
    r: M.avgPsi(mode, M.rectPoints(pC, 0.06, 0.06, 2, dims, 9), dims) }));
  let e1 = 0, e0 = 0;
  for (let f = 40; f <= fRead; f *= 1.01) {
    const a = M.dB(M.ratio(f, ref, c, Q));
    e1 = Math.max(e1, Math.abs(X.dB(X.ratio(f, withTail, c, Q)) - a));
    e0 = Math.max(e0, Math.abs(X.dB(X.ratio(f, noTail, c, Q)) - a));
  }
  check("lumped limit: R at 20 Hz", X.dB(X.ratio(20, withTail, c, Q)), 0, 0.02, "dB");
  check("worst |error| 40–800 Hz, modes to 1.2 kHz + tail", e1, 0, 1.0, "dB");
  checkTrue("the tail at least halves the truncation error", e1 < 0.5 * e0, `${e0.toFixed(2)} → ${e1.toFixed(2)} dB`);
}

console.log(`\n${pass} passed, ${fail} failed  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (fail) process.exit(1);
