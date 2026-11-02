// Closed-form test vectors for src/box-modes-model.js. Run: npm run test:box
//
// Same rule as test-horn.mjs: every expected value comes from mathematics done
// independently — an exact 1D solution, an analytic limit, a defining
// property — never from running the tool and recording what it said.
// Where a quantity is approached by truncating a series, the CONVERGENCE RATE
// is asserted, not a fixed tolerance.
import * as M from "../src/box-modes-model.js";

let pass = 0, fail = 0;
const check = (name, got, want, tol, unit = "") => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  const g = Math.abs(got) < 1e-3 && got !== 0 ? got.toExponential(3) : got.toFixed(6);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(60)} ${g.padStart(14)} ${unit}  (want ${want}${tol ? ` ±${tol}` : ""})`);
};
const checkTrue = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(60)} ${detail}`);
};
const head = (s) => console.log(`\n${s}`);

const c = 343;
const dims = { W: 0.40, L: 0.60, D: 0.375 };

// ── 1. mode frequencies ─────────────────────────────────────────────────────
head("Axial modes are half-wavelength resonances, c/(2·dimension)");
{
  const ms = M.listModes(dims, c, 1500);
  const find = (l, m, n) => ms.find((q) => q.l === l && q.m === m && q.n === n);
  check("(1,0,0) at c/(2W)", find(1, 0, 0).f, c / (2 * dims.W), 1e-9, "Hz");
  check("(0,1,0) at c/(2L)", find(0, 1, 0).f, c / (2 * dims.L), 1e-9, "Hz");
  check("(0,0,2) at c/D, the second axial mode", find(0, 0, 2).f, c / dims.D, 1e-9, "Hz");
  // Pythagoras is an independent statement of the tangential case
  check("(1,1,0) = hypot of its two axial parents",
    find(1, 1, 0).f, Math.hypot(find(1, 0, 0).f, find(0, 1, 0).f), 1e-9, "Hz");
  checkTrue("list starts with the uniform mode at 0 Hz", ms[0].f === 0 && ms[0].weight === 1);
  checkTrue("list is sorted by frequency", ms.every((q, i) => i === 0 || q.f >= ms[i - 1].f));
  // Weyl's law: N(f) ≈ 4πVf³/(3c³) + πSf²/(4c²) + Lf/(8c). Counting modes
  // by brute force and comparing with this asymptotic count checks the
  // enumeration bounds — an off-by-one in lMax would show here.
  const V = dims.W * dims.L * dims.D;
  const S = 2 * (dims.W * dims.L + dims.L * dims.D + dims.W * dims.D);
  const Ltot = 4 * (dims.W + dims.L + dims.D);
  const f = 3000;
  const weyl = (4 * Math.PI * V * f ** 3) / (3 * c ** 3) + (Math.PI * S * f ** 2) / (4 * c ** 2) + (Ltot * f) / (8 * c);
  const count = M.listModes(dims, c, f).length;
  check("mode count to 3 kHz matches Weyl's asymptotic law", count / weyl, 1, 0.05, "ratio");
}

// ── 2. nodes are where theory puts them ─────────────────────────────────────
head("First axial mode has its pressure node at mid-dimension");
{
  const m = { l: 1, m: 0, n: 0 };
  check("ψ(1,0,0) at x = W/2", M.psi(m, [dims.W / 2, 0.1, 0.1], dims), 0, 1e-15);
  check("ψ(1,0,0) at x = 0 (antinode, +1)", M.psi(m, [0, 0.1, 0.1], dims), 1, 0);
  check("ψ(1,0,0) at x = W (antinode, −1)", M.psi(m, [dims.W, 0.1, 0.1], dims), -1, 1e-15);
  check("every mode is +1 at the origin corner",
    Math.min(...M.listModes(dims, c, 2000).map((q) => M.psi(q, [0, 0, 0], dims))), 1, 0);
}

// ── 3. low-frequency limit: the box is a lumped compliance ──────────────────
head("As f → 0 the modal sum tends to the lumped spring, R → 1, as O(f²)");
// Away from resonances each n ≥ 1 term goes as −k²·w·ψψ/k_n², so the error
// from R = 1 must fall as f². The RATIO under halving f is the assertion.
{
  const modes = M.listModes(dims, c, 4000);
  const src = [0.2, 0.2, 0], rcv = [0.31, 0.47, 0.29];
  const pairs = modes.map((mode) => ({ mode, s: M.psi(mode, src, dims), r: M.psi(mode, rcv, dims) }));
  const err = (f) => M.mag([M.ratio(f, pairs, c, Infinity)[0] - 1, M.ratio(f, pairs, c, Infinity)[1]]);
  check("|R − 1| at 5 Hz is small", err(5), 0, 2e-3);
  // The halving ratio is 4·(1 + O(f²/f₁²)), not exactly 4: at 40 Hz against a
  // 286 Hz first mode that next-order term is ~2%. So assert what the series
  // actually says — the DEVIATION of the ratio from 4 itself falls as f².
  const r = (f) => err(2 * f) / err(f);
  const dev = [r(20), r(10), r(5)].map((v) => v - 4);
  checkTrue("halving f quarters |R − 1| ever more exactly", dev.every((v) => v > 0) && dev[2] < 0.005,
    `ratios ${[r(20), r(10), r(5)].map((v) => v.toFixed(4)).join(", ")}`);
  check("...and the deviation from 4 itself falls as f² (20 → 10 Hz)", dev[0] / dev[1], 4, 0.2, "x");
  check("damping does not move the 10 Hz value (Q = 5)",
    M.dB(M.ratio(10, pairs, c, 5)) - M.dB(M.ratio(10, pairs, c, Infinity)), 0, 1e-3, "dB");
}

// ── 4. the exact 1D duct solution ───────────────────────────────────────────
head("A piston filling the x = 0 face reproduces the exact 1D duct solution");
// R(x) = kW·cos(k(W−x))/sin(kW) is solved directly from the wave equation in
// a closed tube — a different method from the modal sum. A face-filling
// source averages every m,n ≠ 0 mode to zero — the face integral of
// cos(mπy/L) is exactly 0 — so the 3D sum must collapse onto the 1D one.
// The source weights here are that ANALYTIC face integral (1 if m = n = 0,
// else 0), not a sampled one: see the aliasing check that follows.
// Truncating at l ≤ N leaves a tail of terms ~ cos(lπx/W)/l², so the error
// must keep falling as the cut-off rises.
{
  const x = 0.27, rcv = [x, 0.33, 0.21];
  const fTest = [150, 300, 700, 1100];
  const faceExact = (mode) => (mode.m === 0 && mode.n === 0 ? 1 : 0);
  const worst = (pairs) => Math.max(...fTest.map((f) =>
    Math.abs(M.ratio(f, pairs, c, Infinity)[0] - M.ductRatio1D(f, x, dims.W, c))
      / Math.abs(M.ductRatio1D(f, x, dims.W, c))));
  const errAt = (fMax) => worst(M.listModes(dims, c, fMax).map((mode) =>
    ({ mode, s: faceExact(mode), r: M.psi(mode, rcv, dims) })));
  check("relative error vs exact 1D with modes to 24 kHz", errAt(24000), 0, 0.01, "rel");
  // The tail is an oscillating Fourier series, so the error at any ONE cut-off
  // depends on where the partial sum happens to sit — "each doubling halves
  // it" fails on that oscillation, not on the model. The assertion is on the
  // envelope: err·N must fall, i.e. convergence at least as fast as 1/N.
  const Ns = [10, 14, 20, 28, 56, 80, 113, 160];
  const eN = Ns.map((N) => errAt(((N + 0.5) * c) / (2 * dims.W)) * N);
  const early = Math.max(...eN.slice(0, 4)), late = Math.max(...eN.slice(4));
  checkTrue("err·N envelope halves from l ≤ 28 to l ≥ 56 — faster than 1/N",
    late < early / 2, `max err·N ${early.toFixed(3)} → ${late.toFixed(3)}`);
  const pairs = M.listModes(dims, c, 3000).map((mode) =>
    ({ mode, s: faceExact(mode), r: M.psi(mode, rcv, dims) }));
  checkTrue("the sum has no imaginary part with Q = ∞ (lossless)",
    Math.abs(M.ratio(500, pairs, c, Infinity)[1]) < 1e-12);

  // Aliasing, documented rather than hidden. An N × N midpoint sampling of
  // the face zeroes cos(mπy/L) exactly for 0 < m < 2N and gives ±1 at m = 2N.
  // So a sampled face is exact to the 1D answer while every mode in the sum
  // has m, n < 2N, and stops being exact once modes beyond that are included.
  const N = 8;
  const face = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    face.push([0, dims.L * (i + 0.5) / N, dims.D * (j + 0.5) / N]);
  const sampled = (fMax) => M.listModes(dims, c, fMax).map((mode) =>
    ({ mode, s: M.avgPsi(mode, face, dims), r: M.psi(mode, rcv, dims) }));
  const fAlias = (c * 2 * N) / (2 * Math.max(dims.L, dims.D)); // first m = 2N mode
  const exactBelow = M.listModes(dims, c, 0.95 * fAlias).map((mode) =>
    ({ mode, s: faceExact(mode), r: M.psi(mode, rcv, dims) }));
  check(`sampled face = exact face for modes below ${fAlias.toFixed(0)} Hz`,
    worst(sampled(0.95 * fAlias)) - worst(exactBelow), 0, 1e-9, "rel");
  checkTrue("...and diverges once the m = 2N mode enters the sum",
    Math.abs(worst(sampled(1.05 * fAlias)) - errAt(1.05 * fAlias)) > 1e-4);
}

// ── 5. reciprocity ──────────────────────────────────────────────────────────
head("Reciprocity: swapping source and receiver leaves R unchanged");
// Not an independent closed form — the symmetry is visible in the formula —
// but it guards the pairs plumbing: a swapped s/r index would break it as
// soon as one end becomes an averaged aperture.
{
  const modes = M.listModes(dims, c, 2500);
  const A = M.discPoints([0.2, 0.2, 0], 0.13, "front", dims);
  const B = M.rectPoints([0.25, 0.45, 0.3], 0.12, 0.06, 1, dims);
  const ab = modes.map((mode) => ({ mode, s: M.avgPsi(mode, A, dims), r: M.avgPsi(mode, B, dims) }));
  const ba = modes.map((mode) => ({ mode, s: M.avgPsi(mode, B, dims), r: M.avgPsi(mode, A, dims) }));
  check("|R(A→B)| − |R(B→A)| at 600 Hz, Q = 8",
    M.mag(M.ratio(600, ab, c, 8)) - M.mag(M.ratio(600, ba, c, 8)), 0, 1e-12);
}

// ── 6. aperture averaging ───────────────────────────────────────────────────
head("A centred source cannot drive an antisymmetric mode");
// (1,0,0) is odd about x = W/2. A disc centred there averages it to zero by
// symmetry — the reason a centred woofer leaves the first width mode alone.
{
  const disc = M.discPoints([dims.W / 2, 0.3, 0], 0.13, "front", dims);
  check("ψ̄(1,0,0) over a disc centred at x = W/2", M.avgPsi({ l: 1, m: 0, n: 0 }, disc, dims), 0, 1e-12);
  // and the uniform mode averages to exactly 1 over any aperture
  check("ψ̄(0,0,0) over the same disc", M.avgPsi({ l: 0, m: 0, n: 0 }, disc, dims), 1, 0);
  // The area-weighted mean of r² over the samples must equal a²/2, the
  // continuous disc's value, and the weights must sum to πa² — independent
  // checks of the ring radii and weights. This is the check that caught the
  // first version over-weighting the rim by 30%.
  const a = 0.1, cen = [0.2, 0.3, 0];
  for (const rings of [3, 6, 12]) {
    const pts = M.discPoints(cen, a, "front", dims, rings);
    const wSum = pts.reduce((s, p) => s + p.w, 0);
    const r2 = pts.reduce((s, p) => s + p.w * ((p[0] - cen[0]) ** 2 + (p[1] - cen[1]) ** 2), 0) / wSum;
    check(`${rings} rings: weights sum to πa²`, wSum / (Math.PI * a * a), 1, 1e-12, "ratio");
    check(`${rings} rings: weighted mean r² = a²/2`, r2 / (a * a / 2), 1, 0.01, "ratio");
  }
  // and a disc average is a true average: for (0,1,0) across a small disc it
  // must approach the point value at the centre as the disc shrinks
  check("tiny disc ψ̄ → point ψ at its centre",
    M.avgPsi({ l: 0, m: 1, n: 0 }, M.discPoints(cen, 1e-4, "front", dims), dims),
    M.psi({ l: 0, m: 1, n: 0 }, cen, dims), 1e-7);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
