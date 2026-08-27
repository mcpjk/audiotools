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

// A layout the whole file reuses: 6x3, shape order 2, both mirrors enforced.
const cfg63 = M.lineGridConfig({ nc: 6, nr: 3, m: 2 });
// Note the guards: a grid can genuinely have no independent shape of one kind.
// A 4x2 has one interior latitude line and symmetry forces it onto the axis,
// so cfg.nLat is 0 and there is no latitude bow to ask for.
const bowRequest = (cfg, scale = 1) => {
  const p = M.nominalParams(cfg);
  if (cfg.nLon > 0 && cfg.orders.length) p[cfg.lonAt + 1] = 0.10 * scale;
  if (cfg.nLon > 1 && cfg.orders.length) p[cfg.lonAt + cfg.per + 1] = 0.08 * scale;
  if (cfg.nLat > 0 && cfg.orders.length) p[cfg.latAt + 1] = 0.06 * scale;
  return p;
};
const spreadOf = (A) => {
  const mean = A.reduce((a, b) => a + b, 0) / A.length;
  return ((Math.max(...A) - Math.min(...A)) / mean) * 100;
};

// ── 1. corner placement ────────────────────────────────────────────────────
head("Corner placement");
check("equal-arc alpha, 6x3", M.equalArcAlphaDeg(6, 3), 30.0, 1e-9, "deg");
check("equal-arc alpha, 6x6", M.equalArcAlphaDeg(6, 6), 45.0, 1e-9, "deg");
check("that is the default the tool seeds", M.nominalParams(cfg63)[cfg63.alphaAt] * 180 / Math.PI, 30.0, 1e-9, "deg");
const aSq = (M.scAlphaForAspect(1) * 180) / Math.PI;
check("conformal alpha for a square mouth", aSq, 45.0, 1e-3, "deg");
const a2 = M.scAlphaForAspect(2);
check("conformal rectangle aspect at that alpha", M.scRect(a2).X / M.scRect(a2).Y, 2.0, 1e-6);
checkTrue("conformal alpha for 2:1 is not the equal-arc value",
  Math.abs((a2 * 180) / Math.PI - 30) > 5, `${((a2 * 180) / Math.PI).toFixed(2)} deg vs 30 deg`);

// ── 2. degrees of freedom ──────────────────────────────────────────────────
head("Degrees of freedom");
check("6x3 m=2: free parameters", cfg63.nParams, 10, 0);
check("6x3 m=2: independent area constraints", cfg63.nConstraints, 5, 0);
check("6x3 m=2: spare", cfg63.spare, 5, 0);
check("6x3: independent line shapes", cfg63.nLon + cfg63.nLat, 3, 0);
for (const [m, np, sp] of [[1, 7, 2], [2, 10, 5], [3, 13, 8]]) {
  const c2 = M.lineGridConfig({ nc: 6, nr: 3, m });
  check(`m = ${m}: free params`, c2.nParams, np, 0);
  check(`m = ${m}: spare`, c2.spare, sp, 0);
}
// the cell-count reduction is general, not hard-coded for 6x3
for (const [nc, nr] of [[6, 3], [6, 6], [8, 3], [5, 5], [7, 4], [10, 3]]) {
  const c2 = M.lineGridConfig({ nc, nr, m: 2 });
  check(`distinct cells under both mirrors, ${nc}x${nr}`,
    c2.nClasses, Math.ceil(nc / 2) * Math.ceil(nr / 2), 0);
}
checkTrue("only even Chebyshev orders under mirror symmetry",
  cfg63.orders.every((o) => o % 2 === 0), JSON.stringify(cfg63.orders));
checkTrue("odd orders appear once symmetry is switched off",
  M.lineGridConfig({ nc: 6, nr: 3, m: 2, symmetric: false }).orders.some((o) => o % 2 === 1),
  JSON.stringify(M.lineGridConfig({ nc: 6, nr: 3, m: 2, symmetric: false }).orders));

// ── 3. area closure for ANY parameter vector ───────────────────────────────
head("Sum of cell areas = pi R^2 for any parameter vector");
// This holds by construction, not by luck: every interior edge is traversed
// twice with opposite sign and cancels identically, so only the rim survives,
// and the rim telescopes to a full turn whatever the lines are doing.
{
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (const kind of ["elliptical", "conformal"]) {
    let worst = 0, worstMirror = 0;
    for (let trial = 0; trial < 12; trial++) {
      const p = M.nominalParams(cfg63);
      for (let k = 0; k < cfg63.nParams - 1; k++)
        if ((k % cfg63.per) !== 0) p[k] = 0.12 * rand();
      p[cfg63.alphaAt] = (20 + 45 * (rand() + 1) / 2) * Math.PI / 180;
      if (!M.monotonicity(cfg63, p).ok) continue;
      const seed = M.makeSeed(kind, R, p[cfg63.alphaAt]);
      const g = M.lineGrid(cfg63, p, seed);
      worst = Math.max(worst, Math.abs(g.areas.reduce((a, b) => a + b, 0) - DISC));
      for (const cc of g.cells)
        for (const [mi, mj] of [[cfg63.nc - 1 - cc.i, cc.j], [cc.i, cfg63.nr - 1 - cc.j]]) {
          const o = g.cells.find((x) => x.i === mi && x.j === mj);
          worstMirror = Math.max(worstMirror, Math.abs(cc.area - o.area) / cc.area);
        }
    }
    check(`${kind}: worst closure error over 12 random vectors`, worst, 0, 1e-9, "mm2");
    // The elliptical seed is closed form and mirrors to the last bit. The
    // conformal seed inverts a quadrature by Newton, and although the map
    // itself is reflected exactly rather than re-solved, the inversion still
    // stops at its own residual floor, so mirrored cells agree to ~1e-11
    // relative — about half a nanometre squared on a 55 mm² cell.
    check(`${kind}: mirrored cell pairs agree`, worstMirror, 0,
      kind === "conformal" ? 1e-10 : 1e-13);
  }
}

// ── 4. monotonicity ────────────────────────────────────────────────────────
head("Monotonicity");
{
  check("nominal grid gap, 6x3", M.monotonicity(cfg63, M.nominalParams(cfg63)).gap, 1 / 3, 1e-12);
  const p = M.nominalParams(cfg63);
  p[cfg63.lonAt + 1] = 0.5;   // a bow far larger than the line spacing
  const mono = M.monotonicity(cfg63, p);
  checkTrue("a bow past the line spacing is caught", !mono.ok,
    `gap ${mono.gap.toFixed(4)} between ${mono.where.kind} lines ${mono.where.between.join(" and ")}`);
}

// ── 5. the equal-area solve ────────────────────────────────────────────────
head("Equal-area solve: sliders are requests, not settings");
{
  // A pure tensor-product grid has only the three line positions and alpha —
  // four parameters against five constraints. It CANNOT be equal-area, and
  // saying so is the correct result, not an error.
  const tp = M.lineGridConfig({ nc: 6, nr: 3, m: 0 });
  check("tensor-product grid: free parameters", tp.nParams, 4, 0);
  check("tensor-product grid: constraints", tp.nConstraints, 5, 0);
  const tpSol = M.solveEqualArea(tp, M.nominalParams(tp), { R });
  checkTrue("tensor-product grid is reported infeasible", !tpSol.converged,
    `residual ${tpSol.residual.toExponential(2)}`);
  checkTrue("...and names the reason", /free parameters/.test(tpSol.reason || ""), tpSol.reason);

  // Correction shrinks as the shape order rises, for the same request.
  const corr = {};
  for (const m of [1, 2, 3]) {
    const cf = M.lineGridConfig({ nc: 6, nr: 3, m });
    const sol = M.solveEqualArea(cf, bowRequest(cf), { R });
    corr[m] = sol.correction;
    checkTrue(`m = ${m}: solves, ${cf.spare} spare parameter(s)`, sol.converged,
      `correction ${sol.correction.toFixed(4)}, residual ${sol.residual.toExponential(1)}`);
  }
  checkTrue("m = 1 needs a visible correction to the request", corr[1] > 0.05, corr[1].toFixed(4));
  checkTrue("m = 3 corrects the same request less than m = 1", corr[3] < corr[1],
    `${corr[3].toFixed(4)} against ${corr[1].toFixed(4)}`);

  // The whole point: whatever the slider, the areas come out equal.
  for (const kind of ["elliptical", "conformal"])
    for (const scale of [0, 0.5, 1, 1.5, -1]) {
      const sol = M.solveEqualArea(cfg63, bowRequest(cfg63, scale), { R, seedKind: kind });
      const A = sol.geometry.areas;
      checkTrue(`${kind}, bow x${scale}: areas equal after the solve`,
        sol.converged && spreadOf(A) < 1e-6,
        `spread ${spreadOf(A).toExponential(1)}%, correction ${sol.correction.toFixed(4)}`);
      check(`${kind}, bow x${scale}: closure holds`, A.reduce((a, b) => a + b, 0), DISC, 1e-9, "mm2");
    }

  // Requested against achieved is reported per parameter, and the request is
  // never silently overwritten.
  const sol = M.solveEqualArea(cfg63, bowRequest(cfg63), { R });
  checkTrue("requested and achieved are both reported",
    sol.pRequested.length === sol.p.length && sol.delta.length === sol.p.length,
    `largest single move ${Math.max(...sol.delta.map(Math.abs)).toFixed(4)}`);
  checkTrue("positions move more freely than bows (that is what W is for)",
    Math.abs(sol.delta[cfg63.lonAt]) > Math.abs(sol.delta[cfg63.lonAt + 1]),
    `position ${sol.delta[cfg63.lonAt].toFixed(4)} vs bow ${sol.delta[cfg63.lonAt + 1].toFixed(4)}`);
  check("parameter labels cover every parameter", M.paramLabels(cfg63).length, cfg63.nParams, 0);
}

head("Feasibility is reported, never faked");
{
  // A moderate bow that a cold Gauss-Newton step used to jam on. It IS
  // reachable — the solver walks the request up from the nominal grid — and
  // reporting it as infeasible would have been the solver's failure, not the
  // geometry's. Keep this: it is the regression that matters.
  const ok = M.solveEqualArea(cfg63, bowRequest(cfg63, 2.5), { R });
  checkTrue("a bow that needs a walk to reach is still reached", ok.converged,
    `correction ${ok.correction.toFixed(3)}, spread ${spreadOf(ok.geometry.areas).toExponential(1)}%`);

  // Opposed full-scale bows genuinely drive one line through another. No
  // equal-area grid exists, and the tool must say so and name the lines.
  const p = M.nominalParams(cfg63);
  p[cfg63.lonAt + 1] = 1.0;
  p[cfg63.lonAt + cfg63.per + 1] = -1.0;
  const sol = M.solveEqualArea(cfg63, p, { R });
  checkTrue("an impossible request is refused", !sol.converged, `residual ${sol.residual.toExponential(2)}`);
  checkTrue("...naming the lines that would cross", /cross|touching/.test(sol.reason || ""), sol.reason);
  checkTrue("...and saying how far along the request it did get",
    sol.reachedFraction > 0 && sol.reachedFraction < 1, `${(sol.reachedFraction * 100).toFixed(0)}%`);
  // and what it shows is a real equal-area grid, not the degenerate one the
  // direct solve jammed into
  checkTrue("...while still showing an equal-area grid",
    spreadOf(sol.geometry.areas) < 1e-6 && sol.monotone.ok,
    `spread ${spreadOf(sol.geometry.areas).toExponential(1)}%, gap ${sol.monotone.gap.toFixed(4)}`);
  check("...that still closes on the disc", sol.geometry.areas.reduce((a, b) => a + b, 0), DISC, 1e-9, "mm2");
}

head("Grids where symmetry leaves a line no freedom at all");
{
  // 4x2: the single interior latitude line is the centre one, and the vertical
  // mirror forces it onto the axis. So there is no latitude shape to request.
  const c42 = M.lineGridConfig({ nc: 4, nr: 2, m: 2 });
  check("4x2 independent latitude shapes", c42.nLat, 0, 0);
  check("4x2 independent longitude shapes", c42.nLon, 1, 0);
  check("4x2 free parameters", c42.nParams, 4, 0);
  check("4x2 constraints", c42.nConstraints, 1, 0);
  const sol = M.solveEqualArea(c42, bowRequest(c42), { R });
  checkTrue("4x2 still solves", sol.converged && spreadOf(sol.geometry.areas) < 1e-6,
    `spread ${spreadOf(sol.geometry.areas).toExponential(1)}%`);
}

head("The residual has to be smooth enough to differentiate");
{
  // The equal-area solve builds its Jacobian by finite difference at h = 1e-6.
  // Anything noisier than that in the area computation IS the Jacobian, and the
  // solve is then following noise. The conformal seed's rim-angle inversion once
  // stopped at bisection accuracy (~6e-5 rad, ~1e-2 mm² on a rim edge) whenever
  // its Newton polish left the bracket, and a 4x2 grid would simply not solve.
  const c42 = M.lineGridConfig({ nc: 4, nr: 2, m: 2 });
  const p0 = M.nominalParams(c42);
  const Abar = DISC / 8;
  for (const kind of ["elliptical", "conformal"]) {
    const seed = M.makeSeed(kind, R, p0[c42.alphaAt]);
    const at = (d) => {
      const q = p0.slice(); q[0] += d;
      return M.lineGrid(c42, q, seed).cells[0].area / Abar - 1;
    };
    const xs = [-2e-5, -1e-5, 0, 1e-5, 2e-5].map(at);
    const monotone = xs.every((v, i) => i === 0 || v > xs[i - 1]);
    // second difference measures the wobble a smooth function should not have
    const wob = Math.abs(xs[0] - 2 * xs[2] + xs[4]);
    checkTrue(`${kind}: residual is smooth at the finite-difference scale`,
      monotone && wob < 1e-8, `second difference ${wob.toExponential(1)}`);
    const sol = M.solveEqualArea(c42, p0, { R, seedKind: kind });
    checkTrue(`${kind}: and 4x2 therefore solves`,
      sol.converged && spreadOf(sol.geometry.areas) < 1e-6,
      `spread ${spreadOf(sol.geometry.areas).toExponential(1)}%`);
  }
}

head("A warm start must not ignore the new request");
{
  // Any feasible point stays feasible when the request moves, so a convergence
  // test on the area residual alone returns the PREVIOUS answer — which looks
  // exactly like a working tool until you compare it with a cold solve.
  const cfg = M.lineGridConfig({ nc: 6, nr: 3, m: 2 });
  const seed = M.makeSeed("elliptical", R, M.nominalParams(cfg)[cfg.alphaAt]);
  let warm = M.solveEqualArea(cfg, bowRequest(cfg, 1), { R, seed }).p;
  let worst = 0;
  for (const scale of [3, 1.5, 0.5, 2]) {
    const req = bowRequest(cfg, scale);
    const hot = M.solveEqualArea(cfg, req, { R, seed, pStart: warm });
    const cold = M.solveEqualArea(cfg, req, { R, seed });
    warm = hot.p;
    worst = Math.max(worst, Math.max(...hot.p.map((v, i) => Math.abs(v - cold.p[i]))));
  }
  checkTrue("warm-started solves agree with cold ones", worst < 5e-3,
    `largest parameter difference ${worst.toExponential(1)}`);
}

head("Solve across the layout space");
{
  let bad = 0, n = 0;
  for (const kind of ["elliptical", "conformal"])
    for (const [nc, nr, m] of [[6, 3, 2], [6, 3, 1], [6, 3, 3], [6, 4, 2], [6, 5, 2],
      [6, 6, 2], [8, 3, 2], [5, 5, 2], [10, 3, 2], [4, 2, 2]]) {
      const cf = M.lineGridConfig({ nc, nr, m });
      const sol = M.solveEqualArea(cf, bowRequest(cf, 0.7), { R, seedKind: kind });
      const A = sol.geometry.areas;
      n++;
      const ok = sol.converged && spreadOf(A) < 1e-6 && Math.abs(A.reduce((a, b) => a + b, 0) - DISC) < 1e-9;
      if (!ok) { bad++; console.log(`  FAIL  ${nc}x${nr} m=${m} ${kind}: ${sol.reason || spreadOf(A).toExponential(1) + "%"}`); }
    }
  checkTrue(`every layout in the sweep solves`, bad === 0, `${n - bad}/${n}`);
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
  const a = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], c, t: 0 }).throat;
  check("1+6+12  f1_min", a.f1min / 1000, 22.5, 0.15, "kHz");
  const b = M.buildLayout({ family: "ogrid", R, rings: [1, 5, 8], c, t: 0 }).throat;
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
      const L = M.buildLayout({ family: "ogrid", R, rings, t, c });
      const th = L.throat;
      const tot = th.areaTotal;
      checkTrue(`${rings.join("+")} at t=${t}`,
        Math.abs(tot - DISC) < 1e-8 && th.f1min > 0 && (th.N < 2 || th.spread < 1e-6),
        `N=${th.N} sum=${tot.toFixed(6)} spread=${th.N < 2 ? "n/a" : th.spread.toExponential(1)} f1min=${(th.f1min / 1e3).toFixed(2)} kHz`);
    }
  // The build spec quotes 217 mm of divider centreline for the O-grid, and warns
  // that the H-grid must be recomputed rather than reusing it.
  const og = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], t: 0.8, c }).throat;
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
  const a = M.buildLayout({ family: "ogrid", R, rings: [n], c, t: 0 }).throat;
  check(`N = ${n}`, a.f1min / 1000, 11.99, 0.005, "kHz");
}
{
  const a4 = M.buildLayout({ family: "ogrid", R, rings: [4], c, t: 0 }).throat;
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

// ── 9. cross-check and the rows-not-columns finding ────────────────────────
head("Cross-check: an equal-area H-grid should not beat the O-grid at comparable N");
{
  const og = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], c, t: 0 }).throat;
  const at = (nc, nr, m = 2) => {
    let best = 0, bestA = 0;
    for (let a = 25; a <= 55; a += 5) {
      const th = M.buildLayout({ family: "hgrid", R, nc, nr, m, c, t: 0, alphaDeg: a }).throat;
      if (th.f1min > best) { best = th.f1min; bestA = a; }
    }
    return { f: best, a: bestA };
  };
  const p63 = at(6, 3), p83 = at(8, 3), p64 = at(6, 4), p65 = at(6, 5);
  checkTrue("hgrid 6x3 f1_min below ogrid 1+6+12", p63.f < og.f1min,
    `${(p63.f / 1e3).toFixed(2)} kHz (N=18) vs ${(og.f1min / 1e3).toFixed(2)} kHz (N=19)`);
  // ROWS, NOT COLUMNS. The build spec's hand estimates put 8x3 above 6x3 and
  // flag themselves as order-of-magnitude only. They are wrong in DIRECTION:
  // f1_min is set by the row-direction edge length, which extra columns do not
  // touch — a column only makes each cell narrower. Every closed-form vector in
  // this file is reproduced exactly, so this is reported, not patched away.
  checkTrue("adding COLUMNS barely moves f1_min (6x3 -> 8x3)",
    Math.abs(p83.f - p63.f) / p63.f < 0.06,
    `${(p63.f / 1e3).toFixed(2)} -> ${(p83.f / 1e3).toFixed(2)} kHz for a third more cells`);
  checkTrue("adding ROWS does move it (6x3 -> 6x4 -> 6x5)",
    p64.f > p63.f * 1.15 && p65.f > p64.f * 1.1,
    `${(p63.f / 1e3).toFixed(2)} -> ${(p64.f / 1e3).toFixed(2)} -> ${(p65.f / 1e3).toFixed(2)} kHz`);
  const th = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, c, t: 0 }).throat;
  checkTrue("below the isodiametric ceiling c sqrt(N) / 2D", th.f1min < th.f1ceiling,
    `${(th.f1min / 1e3).toFixed(2)} vs ceiling ${(th.f1ceiling / 1e3).toFixed(2)} kHz`);
}

// ── 10. mapping ────────────────────────────────────────────────────────────
head("Throat to mouth");
{
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.8, c });
  const mopt = { c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120, depth: 150 };
  const sph = M.mapThroatToMouth(L.throat, { ...mopt, flatten: 1 });
  check("spherical cap about the apex: aim error", sph.aimMax, 0, 1e-6, "deg");
  const obl = M.mapThroatToMouth(L.throat, { ...mopt, flatten: 1.6 });
  checkTrue("oblate spheroid: aim error appears", obl.aimMax > 1, `${obl.aimMax.toFixed(2)} deg`);
  checkTrue("padding brings every cell up to the longest path",
    sph.rows.every((r) => Math.abs(r.Lpath + r.pad - sph.Lmax) < 1e-9), `L_max ${sph.Lmax.toFixed(2)} mm`);
  check("lambda at 20 kHz", sph.lambda, 17.45, 0.01, "mm");
  const og = M.buildLayout({ family: "ogrid", R, rings: [1, 6, 12], c, t: 0.8 });
  checkTrue("the mapping is refused for a topology it cannot match",
    M.mapThroatToMouth(og.throat, { c, R, rectangular: og.rectangular }) === null, "ogrid returns null");
}

// ── 10b. loft parameterisation ─────────────────────────────────────────────
head("Loft parameterisation");
{
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const ST = 16, nMs = 16;
  const map = M.mapThroatToMouth(L.throat, {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100,
    apex: 120, depth: 150, flatten: 1, stations: ST, keepGeometry: true,
  });
  // the four sides of a cell must join corner to corner
  const cc = L.throat.cells.find((x) => x.label === "3,1");
  const sides = M.cellSides(cc.poly);
  checkTrue("cellSides splits the outline into four corner-to-corner runs",
    sides !== null && sides.length === 4 && sides.every((sd) => sd.length === cc.poly.length / 4 + 1),
    `${sides.length} sides of ${sides[0].length} points`);
  checkTrue("consecutive sides share their corner exactly",
    sides.every((sd, e) => {
      const a = sd[sd.length - 1], b = sides[(e + 1) % 4][0];
      return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12;
    }), "closed loop");

  // A corner must blend to a corner, not into the middle of a mouth edge. The
  // mouth outline is square, so its four corners are the four sharpest turns;
  // at EVERY station the sharpest four must sit at 0, nMs, 2nMs, 3nMs.
  const cornerIdx = (poly) => poly
    .map((_, k) => {
      const a = poly[(k - 1 + poly.length) % poly.length], b = poly[k], d = poly[(k + 1) % poly.length];
      const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [d[0] - b[0], d[1] - b[1]];
      return [Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])), k];
    })
    .sort((x, y) => y[0] - x[0]).slice(0, 4).map((x) => x[1]).sort((x, y) => x - y);
  const row = map.rows.find((r) => r.label === "3,1");
  let aligned = true;
  for (let q = 0; q <= ST; q++)
    if (cornerIdx(row.sched[q].local).join(",") !== [0, nMs, 2 * nMs, 3 * nMs].join(",")) aligned = false;
  checkTrue("every station keeps its corners at the side boundaries", aligned,
    `stations 0..${ST} all at [0, ${nMs}, ${2 * nMs}, ${3 * nMs}]`);

  // the last station IS the mouth cell, so the areas must sum to the mouth
  check("station areas close on the mouth rectangle", map.mouthAreaTotal, 200 * 100, 1e-6, "mm2");
}

// ── 10c. duct solids ───────────────────────────────────────────────────────
head("Duct solids");
{
  const t = 0.4, ST = 16, DEF = 0.35;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = L.throat;
  const map = M.mapThroatToMouth(th, {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120,
    depth: 150, flatten: 1, dividerEndFrac: DEF, stations: ST, keepGeometry: true,
  });

  // An interior cell is inset on all four sides, a rim cell only on its
  // dividers. The invariant is not how far a POINT moved — on a curved side a
  // mitred corner moves d/cos(half-angle), slightly more than d — it is that
  // the moved point sits exactly d from the LINE of each segment it mitres.
  const lineDist = (P, A, B) => {
    const ux = B[0] - A[0], uy = B[1] - A[1];
    const L = Math.hypot(ux, uy) || 1e-18;
    return Math.abs((P[0] - A[0]) * uy - (P[1] - A[1]) * ux) / L;
  };
  for (const label of ["1,1", "3,2"]) {
    const cell = th.cells.find((x) => x.label === label);
    const flat = map.rows.find((r) => r.label === label).sched[0].local;
    const want = cell.rimSide.map((isRim) => (isRim ? 0 : t / 2));
    const ins = M.insetPolygon(flat, want);
    const N = flat.length, n = N / 4;
    let worst = 0;
    for (let k = 0; k < N; k++)
      for (const seg of [(k - 1 + N) % N, k]) {
        const d = want[Math.floor(seg / n)];
        worst = Math.max(worst, Math.abs(lineDist(ins[k], flat[seg], flat[(seg + 1) % N]) - d));
      }
    check(`cell ${label}: every side inset by exactly its own distance`, worst, 0, 1e-9, "mm");

    // The model subtracts (t/2) x dividerLen and says so is "very slightly
    // pessimistic" because it ignores the corner overlaps. Each divider-divider
    // corner double-counts about (t/2)^2, so the true inset area must come out
    // ABOVE the reported open area by roughly that much per such corner.
    const nCorner = [0, 1, 2, 3].filter((e) => !cell.rimSide[e] && !cell.rimSide[(e + 3) % 4]).length;
    const excess = M.polyArea2(ins) - cell.open;
    checkTrue(`cell ${label}: open area is pessimistic by ~${nCorner} corner overlap(s)`,
      excess > 0.5 * nCorner * (t / 2) ** 2 && excess < 1.5 * nCorner * (t / 2) ** 2,
      `${excess.toFixed(4)} against ${(nCorner * (t / 2) ** 2).toFixed(4)} mm2`);
  }

  const solids = M.ductSolids(th, map, { t, dividerEndFrac: DEF });
  checkTrue("one solid per cell", solids.length === th.cells.length, `${solids.length} ducts`);

  // the throat face must be FLAT, or there is nothing to seat on the driver
  let zWorst = 0;
  for (const s of solids) for (const p of s.sections[0].pts) zWorst = Math.max(zWorst, Math.abs(p[2]));
  check("station 0 lies in the throat plane", zWorst, 0, 1e-12, "mm");

  // and the wall between two neighbours there must measure exactly t
  const pSeg = (P, A, B) => {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = u[0] ** 2 + u[1] ** 2 + u[2] ** 2 || 1e-18;
    let k = ((P[0] - A[0]) * u[0] + (P[1] - A[1]) * u[1] + (P[2] - A[2]) * u[2]) / L2;
    k = Math.max(0, Math.min(1, k));
    return Math.hypot(P[0] - A[0] - u[0] * k, P[1] - A[1] - u[1] * k, P[2] - A[2] - u[2] * k);
  };
  const sep = (A, B) => {
    let m = Infinity;
    for (const a of A) for (let k = 0; k < B.length; k++) m = Math.min(m, pSeg(a, B[k], B[(k + 1) % B.length]));
    return m;
  };
  const byId = (id) => solids.find((s) => s.id === id);
  let wMin = Infinity, wMax = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const d = sep(byId(i * 3 + j).sections[0].pts, byId((i + 1) * 3 + j).sections[0].pts);
    wMin = Math.min(wMin, d); wMax = Math.max(wMax, d);
  }
  check("throat wall between neighbours is exactly t", wMin, t, 1e-9, "mm");
  check("...and no thicker anywhere either", wMax, t, 1e-9, "mm");

  // the inset must be gone by the station where the dividers stop, or the duct
  // is being shrunk for a wall that is not there
  const r0 = map.rows[0];
  const sec0 = M.ductSections(th.cells[0], r0, { t, dividerEndFrac: DEF });
  const endIdx = Math.ceil(DEF * ST);
  check("inset has tapered out where the dividers end",
    sec0[endIdx].area - r0.sched[endIdx].area, 0, 1e-9, "mm2");
  checkTrue("...and is still biting at the throat",
    r0.sched[0].area - sec0[0].area > 0.5 * t, `${(r0.sched[0].area - sec0[0].area).toFixed(3)} mm2`);

  // a mesh a slicer or a kernel will accept: closed, orientable, positive
  const bad = solids.filter((s) => !s.manifold.ok);
  checkTrue("every duct mesh is closed and consistently wound", bad.length === 0,
    `${solids.length} ducts, ${solids[0].manifold.edges} edges each, 0 unpaired`);
  checkTrue("every end cap fans from a point its outline can see",
    solids.every((s) => M.fanIsValid(s.sections[0].pts).ok && M.fanIsValid(s.sections[s.sections.length - 1].pts).ok),
    "no folded caps");

  // volume by the divergence theorem against the integrated area schedule
  let vWorst = 0;
  for (const s of solids) {
    let V = 0;
    for (let q = 1; q < s.sections.length; q++) {
      const a = s.sections[q - 1].origin, b = s.sections[q].origin;
      V += 0.5 * (s.sections[q].area + s.sections[q - 1].area)
         * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    vWorst = Math.max(vWorst, Math.abs(s.volume - V) / V);
  }
  checkTrue("mesh volume agrees with the integrated area schedule", vWorst < 0.005,
    `worst ${(vWorst * 100).toFixed(3)}% — trapezoid error over ${ST} stations`);

  const stl = M.buildSTL(solids);
  const facets = new DataView(stl).getUint32(80, true);
  const want = solids.reduce((a, s) => a + s.tris.length, 0);
  checkTrue("binary STL declares the facets it carries", facets === want && stl.byteLength === 84 + want * 50,
    `${facets} facets, ${(stl.byteLength / 1048576).toFixed(2)} MB`);
}

head("Fabrication");
{
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.8, c });
  const th = L.throat;
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
