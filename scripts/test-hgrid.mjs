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

// ── 10a2. divergence ────────────────────────────────────────────────────────
head("Throat divergence");
{
  // buildTrajectory in isolation, against its own docstring claims.
  const A = [0, 0, 0], dirA = [1, 0, 0], B = [40, 30, 0], dirB = [0, 1, 0];
  const divergeLen = 12, tight = 0.55;
  const traj = M.buildTrajectory(A, dirA, B, dirB, { divergeLen, tight });
  // f (where the straight run ends) against its own documented closed form:
  // f = divergeLen / (divergeLen + chord), chord = |B - (A + dirA*divergeLen)|.
  // Computed independently here, not by calling into buildTrajectory, so this
  // checks the claim in the comment rather than the code's own arithmetic.
  const Ap = [A[0] + dirA[0] * divergeLen, A[1] + dirA[1] * divergeLen, A[2] + dirA[2] * divergeLen];
  const chord = Math.hypot(B[0] - Ap[0], B[1] - Ap[1], B[2] - Ap[2]);
  const f = divergeLen / (divergeLen + chord);
  const pAtF = traj(f);
  const lenAtF = Math.hypot(pAtF[0] - A[0], pAtF[1] - A[1], pAtF[2] - A[2]);
  check("straight run covers exactly divergeLen mm", lenAtF, divergeLen, 1e-9, "mm");
  check("...and lands exactly on A + dirA * divergeLen", Math.hypot(pAtF[1] - Ap[1], pAtF[2] - Ap[2]), 0, 1e-9, "mm");
  checkTrue("every sampled point before the join is exactly colinear with dirA",
    [0.1, 0.3, 0.5, 0.7, 0.9].map((u) => u * f).every((u) => {
      const p = traj(u);
      return Math.hypot(p[1], p[2]) < 1e-9;
    }), "y = z = 0 throughout the straight run");
  // C1 continuity: finite-difference tangent just before and after f agree
  const e = 1e-6;
  const before = traj(Math.max(0, f - e)), at = traj(f), after = traj(Math.min(1, f + e));
  const tBefore = [(at[0] - before[0]) / e, (at[1] - before[1]) / e, (at[2] - before[2]) / e];
  const tAfter = [(after[0] - at[0]) / e, (after[1] - at[1]) / e, (after[2] - at[2]) / e];
  const nB = Math.hypot(...tBefore) || 1, nA = Math.hypot(...tAfter) || 1;
  const cosAngle = (tBefore[0] * tAfter[0] + tBefore[1] * tAfter[1] + tBefore[2] * tAfter[2]) / (nB * nA);
  check("tangent is continuous across the straight-to-Hermite join", cosAngle, 1, 1e-6);
  checkTrue("divergeLen = 0 reduces to the plain Hermite (no straight run)",
    (() => {
      const t0 = M.buildTrajectory(A, dirA, B, dirB, { divergeLen: 0, tight });
      let worst = 0;
      for (const u of [0, 0.2, 0.5, 0.8, 1]) {
        const p = t0(u);
        // must match a hand-rolled Hermite with the same tangents
        const s2 = u * u, s3v = s2 * u;
        const h00 = 2 * s3v - 3 * s2 + 1, h10 = s3v - 2 * s2 + u, h01 = -2 * s3v + 3 * s2, h11 = s3v - s2;
        const chord = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
        const T0 = dirA.map((d) => d * tight * chord * 3), T1 = dirB.map((d) => d * tight * chord * 3);
        for (let k = 0; k < 3; k++) {
          const want = h00 * A[k] + h10 * T0[k] + h01 * B[k] + h11 * T1[k];
          worst = Math.max(worst, Math.abs(p[k] - want));
        }
      }
      return worst < 1e-9;
    })(), "identical to hermite(A,T0,B,T1,u)");

  // In the full pipeline: divergence must NOT separate cells that share a
  // throat divider. A shared boundary point's launch direction is a pure
  // function of its own position, so it is IDENTICAL whichever neighbouring
  // cell reads it — the straight run is the same physical ray for both, and
  // stays exactly coincident. That is the invariant divergeLen must never
  // break; it is not expected to create separation between glued cells, only
  // to delay how far downstream their (necessarily different) curvature
  // toward different mouth targets begins.
  const ST = 16;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const dl of [0, 15, 30]) {
    const map = M.mapThroatToMouth(L.throat, {
      c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120, depth: 150,
      flatten: 1, exitHalfAngle: 8, tight: 0.55, fTarget: 20000, dividerEndFrac: 0.35,
      stations: ST, keepGeometry: true, wallWidthAt: 200 / 6, divergeLen: dl,
    });
    let worst = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const A2 = map.rows.find((r) => r.id === i * 3 + j), B2 = map.rows.find((r) => r.id === (i + 1) * 3 + j);
      for (let q = 0; q <= ST; q++)
        for (let k = 0; k <= 16; k++)
          worst = Math.max(worst, d3(A2.sched[q].pts[(16 + k) % 64], B2.sched[q].pts[(64 - k) % 64]));
    }
    check(`divergeLen=${dl}mm: neighbours still share their whole boundary`, worst, 0, 1e-7, "mm");
  }
}

// ── 10a3. expansion profile ─────────────────────────────────────────────────
head("Hypex expansion profile");
{
  // the profile maths, against closed forms
  check("T=1 is exponential: r(x) = rt e^(mx)", M.hypexR(50, 2, 0.01, 1), 2 * Math.exp(0.5), 1e-12);
  check("T=0 is hyperbolic: r(x) = rt cosh(mx)", M.hypexR(50, 2, 0.01, 0), 2 * Math.cosh(0.5), 1e-12);
  check("r(0) = rt for any T", M.hypexR(0, 3.7, 0.02, 0.4), 3.7, 1e-15);
  check("exponential flare rate is 2m everywhere", M.hypexFlareRate(37, 0.01, 1), 0.02, 1e-12, "/mm");
  // solveHypexM inverted against hypexR: the m it returns must reproduce the ratio
  let worstInv = 0;
  for (const T of [0, 0.4, 1]) for (const ratio of [1.5, 3, 8]) for (const Lp of [40, 150, 400]) {
    const m = M.solveHypexM(ratio, Lp, T);
    worstInv = Math.max(worstInv, Math.abs(M.hypexR(Lp, 1, m, T) - ratio) / ratio);
  }
  check("solveHypexM inverted against hypexR recovers the ratio", worstInv, 0, 1e-9);
  // and hypexLengthForRatio is the other inverse of the same relation
  let worstLen = 0;
  for (const T of [0, 0.4, 1]) for (const ratio of [1.5, 3, 8]) {
    const m = 0.01;
    const Lp = M.hypexLengthForRatio(ratio, m, T);
    if (Lp != null) worstLen = Math.max(worstLen, Math.abs(M.hypexR(Lp, 1, m, T) - ratio) / ratio);
  }
  check("hypexLengthForRatio is the length that reaches that ratio", worstLen, 0, 1e-12);

  // fc = mc/2pi, with m per MILLIMETRE and c in m/s. The two directions must be
  // exact inverses, and the forward one must match the relation computed
  // independently here rather than by calling the same helper back.
  check("fcForHypexM is fc = mc/2pi with the mm/m factor carried",
    M.fcForHypexM(0.01, 343), (0.01 * 1000 * 343) / (2 * Math.PI), 1e-12, "Hz");
  let worstFc = 0;
  for (const fc of [120, 500, 2000]) for (const cs of [331.3, 343, 349.5])
    worstFc = Math.max(worstFc, Math.abs(M.fcForHypexM(M.hypexMForFc(fc, cs), cs) - fc) / fc);
  check("hypexMForFc inverts it exactly", worstFc, 0, 1e-14);

  // The readout the tool owes once fc is a TARGET rather than a result: given
  // the ratio a cell must reach and the cutoff asked for, the path length it
  // would need. Closed as a round trip — a cell handed exactly that length
  // must solve back to exactly that m, which is what makes the shortfall
  // against the actual path length meaningful.
  let worstReq = 0;
  for (const T of [0, 0.5, 1]) for (const fc of [300, 600, 1200]) for (const ratio of [2, 3.27, 6]) {
    const mWant = M.hypexMForFc(fc, 343);
    const Lreq = M.hypexLengthForRatio(ratio, mWant, T);
    worstReq = Math.max(worstReq, Math.abs(M.solveHypexM(ratio, Lreq, T) - mWant) / mWant);
  }
  check("required path length for a target fc round-trips through solveHypexM", worstReq, 0, 1e-8);

  const ST = 16;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const mopt = {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120, depth: 150,
    flatten: 1, exitHalfAngle: 8, tight: 0.55, fTarget: 20000, dividerEndFrac: 0.35,
    stations: ST, keepGeometry: true, wallWidthAt: 200 / 6,
  };
  const off = M.mapThroatToMouth(L.throat, { ...mopt, profileT: null });

  // profileT = null must change nothing at all
  const t0 = M.mapThroatToMouth(L.throat, { ...mopt, profileT: null });
  checkTrue("profileT = null leaves every station area untouched",
    off.rows.every((r, i) => r.sched.every((s, q) => Math.abs(s.area - t0.rows[i].sched[q].area) < 1e-12)),
    "byte-for-byte with the pre-profile pipeline");
  check("...and the flowed sections still tile (zero clearance)", off.clearance.min, 0, 1e-7, "mm");
  check("...including mid-path, where a gap would have to show", off.clearance.minMid, 0, 1e-7, "mm");

  // While there is no overlap, `min` is pinned at 0 by the tiling ends, so it
  // cannot be the gap signal — minMid is. Once the metric is SIGNED that is no
  // longer the whole story: a negative interior value is smaller than the ~0
  // ends, so `min` becomes the global worst and stops being inert. Both halves
  // are asserted, because reading `min` as "the gap" is wrong either way.
  checkTrue("with no overlap, clearance.min is pinned at 0 by the tiling ends",
    [0, 0.5].every((T) => {
      const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: T });
      return Math.abs(mp.clearance.min) < 1e-7 && mp.clearance.minAt % ST === 0;
    }), "station 0 or 16 — read minMid for the gap");
  checkTrue("...but once ducts overlap it goes negative at an INTERIOR station",
    (() => {
      const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: 1 });
      return mp.clearance.min < -1e-6 && mp.clearance.minAt % ST !== 0;
    })(), "signed, so the worst penetration wins over the tiling ends");

  for (const T of [0, 0.7, 1]) {
    const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: T });
    // k = 1 at BOTH ends, so the throat mating face and the mouth tiling are
    // untouched whatever T is — that is what makes the profile safe to impose.
    let endWorst = 0;
    mp.rows.forEach((r, i) => {
      endWorst = Math.max(endWorst,
        Math.abs(r.sched[0].area / off.rows[i].sched[0].area - 1),
        Math.abs(r.sched[ST].area / off.rows[i].sched[ST].area - 1));
    });
    check(`T=${T}: throat and mouth areas preserved exactly`, endWorst, 0, 1e-9);

    // every station's area must be the closed-form Hypex value for that cell
    let profWorst = 0;
    for (const r of mp.rows) {
      const A0 = r.sched[0].area;
      for (const st of r.sched) {
        const want = A0 * M.hypexR(st.sLen, 1, r.profM, T) ** 2;
        profWorst = Math.max(profWorst, Math.abs(st.area - want) / want);
      }
    }
    check(`T=${T}: every section area is A_throat x hypexR(x,1,m,T)^2`, profWorst, 0, 1e-9);
  }

  // The gap the profile opens, and T ordering it. T=0 has zero initial flare so
  // it stays smallest longest and dips furthest below the tiling configuration.
  const g = [0, 0.7, 1].map((T) => {
    const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: T });
    return { T, gap: Math.max(...mp.clearance.perStation), kMin: mp.profScaleMin, kMax: mp.profScaleMax };
  });
  checkTrue("the profile opens a gap between neighbouring ducts",
    g.every((x) => x.gap > 1), g.map((x) => `T=${x.T}: ${x.gap.toFixed(2)}mm`).join("  "));
  checkTrue("...and T orders it: cosh dips furthest, exponential least",
    g[0].gap > g[1].gap && g[1].gap > g[2].gap,
    `${g[0].gap.toFixed(2)} > ${g[1].gap.toFixed(2)} > ${g[2].gap.toFixed(2)} mm`);

  // k <= 1 is the exact no-overlap condition, and k > 1 is REACHABLE, so it has
  // to be reported rather than assumed. Verified separately by ray cast: at
  // kMax = 1.00000 mid-path interpenetration is exactly 0, and at kMax = 1.018
  // it appears at precisely the stations where k > 1.
  checkTrue("T=0 stays within the tiling configuration (k <= 1, no overlap possible)",
    g[0].kMax <= 1 + 1e-9, `kMax = ${g[0].kMax.toFixed(6)}`);
  checkTrue("k > 1 is reachable and is reported, not clamped",
    g[2].kMax > 1 + 1e-6, `T=1 reaches kMax = ${g[2].kMax.toFixed(5)} — profile exceeds the tiling area`);

  // TWO INDEPENDENT MEASUREMENTS OF THE SAME BOUNDARY. k is an area ratio the
  // profile computes; minMid is a sampled point-to-segment distance between 18
  // real duct outlines. They know nothing about each other, so their agreeing
  // on where the ducts touch is a check and not a tautology: k <= 1 must mean
  // a measurable gap the whole way, and k > 1 must mean the gap has closed.
  const boundary = [0, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1].map((T) => {
    const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: T });
    return { T, k: mp.profScaleMax, mid: mp.clearance.minMid };
  });
  checkTrue("k <= 1 and a measurable mid-path gap are the same condition",
    boundary.every((x) => (x.k <= 1 + 1e-9) === (x.mid > 1e-3)),
    boundary.map((x) => `${x.T}:${x.k <= 1 + 1e-9 ? "gap" : "touch"}`).join(" "));
  // Monotone only WHILE a gap exists. Past the crossing the ducts are in
  // contact and the measurement is a sampled distance bottoming out on zero,
  // so its last digits are quadrature noise, not a trend to assert on.
  const open = boundary.filter((x) => x.mid > 1e-3);
  checkTrue("...and the gap closes monotonically as T rises toward it",
    open.every((x, i) => i === 0 || x.mid < open[i - 1].mid) &&
    boundary.filter((x) => x.mid <= 1e-3).every((x) => x.mid < 1e-3),
    open.map((x) => x.mid.toFixed(3)).join(" > ") + " > touching");

  // STATION BY STATION, not just in aggregate. CLAUDE.md records that overlap
  // appears "at precisely the stations where k > 1" — that was established by
  // ray cast and then only asserted in prose. Here the two detectors are
  // compared per station: wherever any cell's k exceeds 1 the measured
  // clearance must have collapsed, and wherever every k is at or below 1 there
  // must be a real gap. Same claim as above, at the resolution that makes it
  // falsifiable.
  const mpk = M.mapThroatToMouth(L.throat, { ...mopt, profileT: 1 });
  let agree = true, over = 0, detail = [];
  for (let q = 1; q < ST; q++) {
    const kq = Math.max(...mpk.rows.map((r) => r.profK[q]));
    const touching = mpk.clearance.perStation[q] < 1e-3;
    if (kq > 1 + 1e-6) over++;
    if ((kq > 1 + 1e-6) !== touching) { agree = false; detail.push(`st${q}: k=${kq.toFixed(4)} gap=${mpk.clearance.perStation[q].toFixed(4)}`); }
  }
  checkTrue("the ducts touch at exactly the stations where k > 1", agree && over > 0,
    over > 0 ? `${over} of ${ST - 1} interior stations are over, and every one of them is a contact` : detail.join("  "));

  // and the per-station k must reproduce the range the tool reports from it
  checkTrue("profScaleMin/Max are the range of the per-station k",
    mpk.rows.every((r) => Math.abs(Math.min(...r.profK) - r.profScaleMin) < 1e-12 &&
      Math.abs(Math.max(...r.profK) - r.profScaleMax) < 1e-12 &&
      Math.abs(r.profK[r.profKMaxAt] - r.profScaleMax) < 1e-12),
    `kMaxAt station ${mpk.rows[0].profKMaxAt} for cell ${mpk.rows[0].label}`);

  // ── PHASE A CALIBRATION ───────────────────────────────────────────────
  // The signed metric has to be calibrated WHILE the flow construction still
  // holds, because that is the only regime where overlap is known analytically:
  // scaling a tiling section about its centroid by k <= 1 maps it strictly
  // inside itself, so overlap is impossible. Every k <= 1 case must therefore
  // measure exactly zero overlap, and every k > 1 case must measure some. That
  // agreement is what lets the measurement be trusted later, when sections stop
  // coming from one shared flow and the k argument no longer applies.
  const cal = [null, 0, 0.3, 0.6, 0.79, 0.8, 0.9, 1].map((T) => {
    const mp = M.mapThroatToMouth(L.throat, { ...mopt, profileT: T });
    return { T, k: mp.profScaleMax, ov: mp.clearance.overlap, n: mp.clearance.overlapStations };
  });
  checkTrue("signed clearance measures ZERO overlap wherever k <= 1",
    cal.filter((x) => x.k == null || x.k <= 1 + 1e-9).every((x) => x.ov < 1e-6 && x.n === 0),
    cal.filter((x) => x.k == null || x.k <= 1 + 1e-9).map((x) => `T=${x.T}`).join(" "));
  checkTrue("...and measures real depth wherever k > 1",
    cal.filter((x) => x.k > 1 + 1e-9).every((x) => x.ov > 0 && x.n > 0),
    cal.filter((x) => x.k > 1 + 1e-9).map((x) => `T=${x.T}: ${x.ov.toFixed(4)}mm over ${x.n} st`).join("  "));
  // depth is a MEASUREMENT now, not a yes/no — it has to grow with the breach
  const deep = cal.filter((x) => x.k > 1 + 1e-9);
  checkTrue("overlap depth grows as the profile breaches further past k = 1",
    deep.every((x, i) => i === 0 || x.ov > deep[i - 1].ov),
    deep.map((x) => `${x.ov.toFixed(3)}`).join(" < ") + " mm");
  // the distinction the unsigned metric could not make: touching vs driven through
  checkTrue("touching and interpenetrating are now distinguishable",
    cal.find((x) => x.T === 0.79).ov === 0 && cal.find((x) => x.T === 1).ov > 0.2,
    `T=0.79 touches (0 mm), T=1 is driven ${cal.find((x) => x.T === 1).ov.toFixed(3)} mm through — both read 0 unsigned`);

  // a cell's own gap is the closest it comes to any neighbour, so the smallest
  // of them has to be the global mid-path minimum — no cell can be closer than
  // the closest pair, and the closest pair belongs to some cell
  const mpc = M.mapThroatToMouth(L.throat, { ...mopt, profileT: 0 });
  check("the per-cell gaps bottom out at exactly the global mid-path minimum",
    Math.min(...mpc.clearance.perCell.values()), mpc.clearance.minMid, 1e-12, "mm");
  checkTrue("every cell gets a gap, not just the pair that sets the minimum",
    mpc.clearance.perCell.size === mpc.rows.length &&
    [...mpc.clearance.perCell.values()].every((d) => d > 0),
    `${mpc.clearance.perCell.size} cells, ${Math.min(...mpc.clearance.perCell.values()).toFixed(3)}-${Math.max(...mpc.clearance.perCell.values()).toFixed(3)} mm`);

  // every cell has the same expansion RATIO (equal throat areas, uniform mouth
  // grid), so fc differs between cells only through path length
  const mp1 = M.mapThroatToMouth(L.throat, { ...mopt, profileT: 1 });
  checkTrue("fc spread across cells is small, and tracks path length only",
    (mp1.profFcMax - mp1.profFcMin) / mp1.profFcMin < 0.1,
    `${mp1.profFcMin.toFixed(0)}-${mp1.profFcMax.toFixed(0)} Hz over dL = ${mp1.dL.toFixed(1)} mm`);
}

// ── 10a4b. the law is written on the OPEN passage ──────────────────────────
// The wave travels through the open passage, not the gross cell outline, so
// the expansion law is keyed on open area. NOTE these tests pass `t` INTO
// mapThroatToMouth. Passing it only to buildLayout leaves the map at t = 0,
// where open and gross coincide and every assertion below passes vacuously —
// which is exactly how this path went untested when it was first written.
head("Expansion law on the open passage");
{
  const ST = 16, DEF = 0.35;
  for (const t of [0.4, 0.8]) {
    const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
    const base = {
      c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
      tight: 0.55, fTarget: 20000, dividerEndFrac: DEF, stations: ST, keepGeometry: true,
      wallWidthAt: 200 / 6, t, profileT: 0.3, mouthMode: "arc", thetaH: 90, thetaV: 40,
    };
    const gross = M.mapThroatToMouth(Lay.throat, { ...base, profileArea: "gross" });
    const open = M.mapThroatToMouth(Lay.throat, { ...base, profileArea: "open" });

    // THE LAW MUST HOLD ON THE OPEN AREA, station by station, computed here
    // from the inset polygons rather than read back off the model
    let worst = 0, endK = 0;
    for (const r of open.rows) {
      const cell = Lay.throat.cells.find((x) => x.id === r.id);
      const rim = cell.rimSide || [false, false, false, false];
      const dAt = (u) => rim.map((isRim) => (isRim ? 0 : (t / 2) * Math.max(0, 1 - u / DEF)));
      const openAt = (pts, d) => (d.some((v) => v > 0) ? M.polyArea3(M.insetSection3(pts, d)) : M.polyArea3(pts));
      const A0 = openAt(r.sched[0].pts, dAt(0));
      for (let q = 0; q <= ST; q++) {
        const got = openAt(r.sched[q].pts, dAt(q / ST));
        const want = A0 * M.hypexR(r.sched[q].sLen, 1, r.profM, 0.3) ** 2;
        worst = Math.max(worst, Math.abs(got - want) / want);
      }
      endK = Math.max(endK, Math.abs(r.profK[0] - 1), Math.abs(r.profK[ST] - 1));
    }
    check(`t=${t}: OPEN area follows A_open x hypexR(x,1,m,T)^2 at every station`, worst, 0, 1e-9);
    // and the ends must still be untouched, or the throat face and the mouth
    // tiling go with them. This is not automatic: the inset is a fixed offset,
    // so k = 1 at the ends is a property that has to be checked, not assumed.
    check(`t=${t}: ...with k still exactly 1 at both ends`, endK, 0, 1e-9);

    // keying on open RAISES the ratio, because the passage is smaller than the
    // outline: the real expansion is bigger than gross-to-gross reported
    checkTrue(`t=${t}: the open ratio exceeds the gross ratio`,
      open.rows[0].profRatio > gross.rows[0].profRatio,
      `${gross.rows[0].profRatio.toFixed(3)} -> ${open.rows[0].profRatio.toFixed(3)}, +${((open.rows[0].profRatio / gross.rows[0].profRatio - 1) * 100).toFixed(2)}%`);
    checkTrue(`t=${t}: ...so the reported fc rises with it`,
      open.profFcMin > gross.profFcMin,
      `${gross.profFcMin.toFixed(0)} -> ${open.profFcMin.toFixed(0)} Hz`);

    // THE PAYOFF. The equal-area solve equalises OPEN area to 1e-10, so keying
    // the law on it makes the throat reference identical across cells and the
    // ratio spread collapses. Gross cannot do this: it is unequal by
    // construction once dividers exist, because a rim cell has fewer of them.
    checkTrue(`t=${t}: keying on open collapses the ratio spread`,
      open.ratioSpread < gross.ratioSpread / 5,
      `${gross.ratioSpread.toFixed(3)}% gross -> ${open.ratioSpread.toFixed(3)}% open`);
    checkTrue(`t=${t}: ...and with it the ratio's share of the fc spread`,
      open.fcDecomp.fromRatio < gross.fcDecomp.fromRatio / 4,
      `${gross.fcDecomp.fromRatio.toFixed(3)}% -> ${open.fcDecomp.fromRatio.toFixed(3)}%`);
  }

  // with no dividers there is nothing to subtract, so the two must agree
  // exactly — the guard that says these tests are not silently comparing
  // a mode against itself
  const bare = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0, c });
  const opts = {
    c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
    tight: 0.55, fTarget: 20000, dividerEndFrac: DEF, stations: ST, keepGeometry: true,
    wallWidthAt: 200 / 6, t: 0, profileT: 0.3, mouthMode: "arc", thetaH: 90, thetaV: 40,
  };
  const g0 = M.mapThroatToMouth(bare.throat, { ...opts, profileArea: "gross" });
  const o0 = M.mapThroatToMouth(bare.throat, { ...opts, profileArea: "open" });
  check("with t = 0 the two conventions coincide exactly",
    Math.abs(o0.rows[0].profRatio - g0.rows[0].profRatio), 0, 1e-12);
}

// ── 10a4c. the apex-free biradial mouth ────────────────────────────────────
// The mouth is stated by what it must deliver — two arcs, each with its own
// angle and length — and not by a shared apex. The apex was an artifact of
// building the aperture as one spherical cap; it forced the two curvatures to
// be equal and made "solid angle at the apex" look like a design criterion,
// which it is not once each cell's path is independently aimed.
head("Biradial mouth (apex-free)");
{
  const ST = 16, t = 0.4, DEF = 0.35, depth = 200;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const rad = Math.PI / 180;

  // ── IT GENERALISES THE SPHERE, IT DOES NOT REPLACE IT ───────────────────
  // With rH = rV the swept-arc surface must reproduce the old cap about an
  // apex exactly, or the earlier arc-mode results would not carry over.
  const rSph = 305.6, TH = 90, TV = 40;
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8, tight: 0.55, fTarget: 20000,
    dividerEndFrac: DEF, stations: ST, keepGeometry: true, wallWidthAt: 80, t, profileT: 0.3,
  };
  const asArc = M.mapThroatToMouth(Lay.throat, {
    ...common, mouthMode: "arc", apex: rSph - depth, depth, thetaH: TH, thetaV: TV });
  const asBi = M.mapThroatToMouth(Lay.throat, {
    ...common, mouthMode: "biradial", depth, thetaH: TH, thetaV: TV,
    arcH: rSph * TH * rad, arcV: rSph * TV * rad });
  let worst = 0;
  asBi.rows.forEach((r, i) => {
    for (let k = 0; k < r.sched[ST].pts.length; k++) {
      const a = r.sched[ST].pts[k], b = asArc.rows[i].sched[ST].pts[k];
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  });
  check("rH = rV reproduces the sphere-about-apex mouth exactly", worst, 0, 1e-9, "mm");

  // ── THE FLAT LIMITS, against their closed forms ─────────────────────────
  const flatV = M.biradialMouth({ thetaH: TH, thetaV: 0, arcH: 480, arcV: 213, depth, nc: 6, nr: 3 });
  checkTrue("Th_v = 0 is a vertically FLAT mouth", !isFinite(flatV.rV) && flatV.sagV === 0,
    "vertical radius infinite, zero sagitta");
  check("...and its height is the arc length exactly", flatV.height, 213, 1e-9, "mm");
  const flatH = M.biradialMouth({ thetaH: 0, thetaV: TV, arcH: 480, arcV: 213, depth, nc: 6, nr: 3 });
  check("Th_h = 0 gives a width equal to its arc length exactly", flatH.width, 480, 1e-9, "mm");
  // a curved axis reports the CHORD as its extent, which is shorter than the arc
  const cur = M.biradialMouth({ thetaH: TH, thetaV: TV, arcH: 480, arcV: 213, depth, nc: 6, nr: 3 });
  check("a curved axis has radius arcLength / angle", cur.rH, 480 / (TH * rad), 1e-9, "mm");
  check("...and reports the chord 2 r sin(Th/2) as its extent",
    cur.width, 2 * cur.rH * Math.sin((TH / 2) * rad), 1e-9, "mm");
  check("...with sagitta r(1 - cos(Th/2))",
    cur.sagH, cur.rH * (1 - Math.cos((TH / 2) * rad)), 1e-9, "mm");

  // ── THE NORMAL IS APEX-FREE ─────────────────────────────────────────────
  // (sin a cos e, sin e, cos a cos e) depends on neither radius, which is what
  // lets the arrival direction be stated without a common radiating point.
  let nWorst = 0;
  for (const [th, tv] of [[90, 40], [90, 10], [60, 60]]) {
    const b = M.biradialMouth({ thetaH: th, thetaV: tv, arcH: 480, arcV: 213, depth, nc: 6, nr: 3 });
    for (let u = 0; u <= 6; u++) for (let v = 0; v <= 3; v++) {
      const n = b.normal(u, v);
      const a = (b.arcH * (u / 6 - 0.5)) / b.rH, e = (b.svAt(v)) / b.rV;
      const want = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
      nWorst = Math.max(nWorst, Math.hypot(n[0] - want[0], n[1] - want[1], n[2] - want[2]));
    }
  }
  check("the outward normal is (sin a cos e, sin e, cos a cos e), radius-free", nWorst, 0, 1e-12);

  // ── EQUAL AREA AT EVERY CURVATURE, which is the property that must not move
  const sweep = [40, 20, 0].map((tv) => {
    const m = M.mapThroatToMouth(Lay.throat, {
      ...common, mouthMode: "biradial", depth, thetaH: TH, thetaV: tv, arcH: 480, arcV: 213,
      sectionMode: "flow" });
    const A = m.rows.map((r) => r.mouthArea);
    const mean = A.reduce((x, y) => x + y, 0) / A.length;
    return { tv, spread: ((Math.max(...A) - Math.min(...A)) / mean) * 100, m };
  });
  checkTrue("equal mouth area survives the whole curvature range",
    sweep.every((x) => x.spread < 0.02),
    sweep.map((x) => `Th_v ${x.tv}: ${x.spread.toFixed(4)}%`).join("  "));
  checkTrue("...and the vertically flat case is EXACTLY equal-area",
    sweep[2].spread < 1e-9, `${sweep[2].spread.toExponential(1)}% at Th_v = 0`);

  // the aperture IS the arrival target now, so there is no aim error left
  checkTrue("arriving normal to the surface leaves no aim error",
    sweep.every((x) => x.m.aimMax < 1e-4),
    `worst ${Math.max(...sweep.map((x) => x.m.aimMax)).toExponential(1)} deg`);
  // and none of it disturbs the tiling: the normal is a function of (u,v), so
  // two cells sharing a boundary point still get an identical arrival direction
  checkTrue("the sections still tile at every curvature",
    sweep.every((x) => Math.abs(x.m.clearance.minMid) < 1e-6 || x.m.clearance.minMid > 0),
    sweep.map((x) => x.m.clearance.overlap.toFixed(6)).join(" / ") + " mm overlap");
}

// ── 10a5. the path family ──────────────────────────────────────────────────
head("Path family");
{
  const A = [0, 0, 0], dirA = [0, 0, 1], B = [60, 0, 140], dirB = [0.6, 0, 0.8];
  const un = (v) => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
  const dB = un(dirB);

  // the defaults must reduce EXACTLY to the single-tight, one-straight-run form
  const oldStyle = M.buildTrajectory(A, dirA, B, dB, { divergeLen: 12, tight: 0.55 });
  const newStyle = M.buildTrajectory(A, dirA, B, dB, {
    divergeLen: 12, arriveLen: 0, tightThroat: 0.55, tightMouth: 0.55 });
  let same = 0;
  for (let q = 0; q <= 400; q++) {
    const u = q / 400, a = oldStyle(u), b = newStyle(u);
    same = Math.max(same, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  check("split tangents with no mouth run reproduce the old path exactly", same, 0, 1e-12, "mm");

  // the straight runs must actually be straight, and exactly as long as asked
  const tj = M.buildTrajectory(A, dirA, B, dB, { divergeLen: 20, arriveLen: 30, tight: 0.55 });
  let offA = 0, offB = 0;
  for (let q = 0; q <= 4000; q++) {
    const u = q / 4000, P = tj(u);
    const tA = P[2]; // along dirA = +z from the origin
    if (tA <= 20 + 1e-9) offA = Math.max(offA, Math.hypot(P[0], P[1]));
    const d = [B[0] - P[0], B[1] - P[1], B[2] - P[2]];
    const along = d[0] * dB[0] + d[1] * dB[1] + d[2] * dB[2];
    if (along <= 30 + 1e-9 && along >= 0)
      offB = Math.max(offB, Math.hypot(d[0] - dB[0] * along, d[1] - dB[1] * along, d[2] - dB[2] * along));
  }
  check("the throat run is straight along dirA", offA, 0, 1e-9, "mm");
  check("the mouth run is straight along dirB", offB, 0, 1e-9, "mm");

  // G1 at BOTH joins: the Hermite leaves along dirA and arrives along dirB, so
  // a dense walk must show no kink anywhere. A tangent discontinuity at a join
  // would appear as one large angular step among small ones.
  let maxStep = 0;
  let prev = null;
  for (let q = 0; q <= 3000; q++) {
    const u = q / 3000, P = tj(u), Q = tj(Math.min(1, u + 1 / 3000));
    const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
    const n = Math.hypot(...d);
    if (n < 1e-12) continue;
    const e = [d[0] / n, d[1] / n, d[2] / n];
    if (prev) maxStep = Math.max(maxStep, Math.acos(Math.min(1, Math.max(-1, e[0] * prev[0] + e[1] * prev[1] + e[2] * prev[2]))) * 180 / Math.PI);
    prev = e;
  }
  checkTrue("no kink at either straight-to-Hermite join", maxStep < 0.5,
    `worst angular step ${maxStep.toFixed(4)} deg over 3000 samples`);

  // ── AND THE KNOBS MUST MOVE THE BEND WHERE THEY CLAIM ────────────────────
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120, depth: 150,
    flatten: 1, exitHalfAngle: 8, fTarget: 20000, dividerEndFrac: 0.35, stations: 16,
    keepGeometry: true, wallWidthAt: 200 / 6,
  };
  const bend = (o) => {
    const m = M.mapThroatToMouth(Lay.throat, { ...common, ...o });
    const b = m.rows.map((r) => r.bendCentroid);
    return { b: b.reduce((x, y) => x + y, 0) / b.length, tile: m.clearance.minMid, ov: m.clearance.overlap };
  };
  // a bigger MOUTH tangent holds the curve straight off the mouth for longer,
  // so the turning is forced back toward the throat
  const bm = [0.3, 0.55, 0.9].map((t) => bend({ tightThroat: 0.55, tightMouth: t }));
  checkTrue("a larger mouth tangent pushes the bend toward the throat",
    bm[0].b > bm[1].b && bm[1].b > bm[2].b,
    bm.map((x) => x.b.toFixed(3)).join(" > ") + " (bend centroid, 0 = throat)");
  // and a bigger THROAT tangent is the opposite lever
  const bt = [0.3, 0.55, 0.9].map((t) => bend({ tightThroat: t, tightMouth: 0.55 }));
  checkTrue("...and a larger throat tangent pushes it toward the mouth",
    bt[0].b < bt[1].b && bt[1].b < bt[2].b,
    bt.map((x) => x.b.toFixed(3)).join(" < "));
  // the mouth-side straight run does the same job by a different mechanism
  const ba = [0, 25, 45].map((a) => bend({ tight: 0.55, arriveLen: a }));
  checkTrue("the mouth straight run also pushes the bend toward the throat",
    ba[0].b > ba[1].b && ba[1].b > ba[2].b,
    ba.map((x) => x.b.toFixed(3)).join(" > "));
  // none of it may disturb the flow invariant — these are still flowed sections
  checkTrue("every path setting still tiles exactly",
    [...bm, ...bt, ...ba].every((x) => Math.abs(x.tile) < 1e-7 && x.ov < 1e-7),
    `worst |gap| ${Math.max(...[...bm, ...bt, ...ba].map((x) => Math.abs(x.tile))).toExponential(2)} mm`);
}

// ── 10a4. the mouth by arc angles ──────────────────────────────────────────
head("Mouth by arc angles");
{
  const ST = 16, TH = 90, TV = 60, apex = 120, depth = 150, rCap = apex + depth;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0, c });
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, apex, depth, exitHalfAngle: 8, tight: 0.55,
    fTarget: 20000, dividerEndFrac: 0.35, stations: ST, keepGeometry: true, wallWidthAt: 200 / 6,
  };
  const rect = M.mapThroatToMouth(Lay.throat, { ...common, mouthMode: "rect", mouthW: 200, mouthH: 100, flatten: 1, profileT: 1 });
  const arc = M.mapThroatToMouth(Lay.throat, { ...common, mouthMode: "arc", thetaH: TH, thetaV: TV, profileT: 1 });
  const aH = (TH / 2) * Math.PI / 180, eH = (TV / 2) * Math.PI / 180;

  // the planar extent of a spherical cap is a chord, and it is exact
  check("arc mouth width is the chord 2 r sin(Th_h/2)", arc.mouthWEff, 2 * rCap * Math.sin(aH), 1e-9, "mm");
  check("arc mouth height is the chord 2 r sin(Th_v/2)", arc.mouthHEff, 2 * rCap * Math.sin(eH), 1e-9, "mm");

  // total area against the closed form r^2 * (2 a_h) * (2 sin e_h). The 64-point
  // ring is a chord approximation of a convex patch, so it must come out just
  // BELOW the closed form — a value above it would mean the rings are not on
  // the cap at all.
  const areaCF = rCap * rCap * 2 * aH * 2 * Math.sin(eH);
  checkTrue("total mouth area matches r^2 (2a_h)(2 sin e_h), from below",
    arc.mouthAreaTotal < areaCF && arc.mouthAreaTotal > 0.99 * areaCF,
    `${arc.mouthAreaTotal.toFixed(0)} against ${areaCF.toFixed(0)} mm2, ${((1 - arc.mouthAreaTotal / areaCF) * 100).toFixed(2)}% low — chord under-measure`);

  // THE POINT OF THE MODE. Equal d(azimuth) and equal d(sin elevation) is the
  // Lambert equal-area arrangement, so every cell gets the same solid angle and
  // the same area while the cells still tile.
  checkTrue("equal-solid-angle subdivision equalises the mouth areas",
    arc.mouthAreaSpread < 0.05 && arc.mouthAreaSpread < rect.mouthAreaSpread / 100,
    `${arc.mouthAreaSpread.toFixed(4)}% against ${rect.mouthAreaSpread.toFixed(4)}% for the uniform x/y lattice`);
  checkTrue("...so every cell gets the same expansion ratio too",
    arc.ratioSpread < 0.05 && arc.ratioSpread < rect.ratioSpread / 50,
    `${arc.ratioSpread.toFixed(4)}% against ${rect.ratioSpread.toFixed(4)}%`);

  // and it holds across coverages, not at one lucky setting
  const cov = [[40, 30], [60, 40], [120, 80]].map(([h, v]) => {
    const m = M.mapThroatToMouth(Lay.throat, { ...common, mouthMode: "arc", thetaH: h, thetaV: v, profileT: 1 });
    return { h, v, a: m.mouthAreaSpread, r: m.ratioSpread };
  });
  checkTrue("equal area holds across coverage, not at one setting",
    cov.every((x) => x.a < 0.1 && x.r < 0.1),
    cov.map((x) => `${x.h}x${x.v}: ${x.a.toFixed(3)}%`).join("  "));

  // the reparameterisation must not disturb the tiling invariant: neighbours
  // share an edge in GRID coordinates, so their boundary points are identical
  const arcPlain = M.mapThroatToMouth(Lay.throat, { ...common, mouthMode: "arc", thetaH: TH, thetaV: TV, profileT: null });
  check("arc sections still tile — no gap and no overlap", arcPlain.clearance.minMid, 0, 1e-7, "mm");
  check("...and the signed metric agrees there is no penetration", arcPlain.clearance.overlap, 0, 1e-7, "mm");

  // a sphere about the apex, or the equal-area argument does not hold
  const arcFlat = M.mapThroatToMouth(Lay.throat, { ...common, mouthMode: "arc", thetaH: TH, thetaV: TV, flatten: 0.55 });
  checkTrue("arc mode overrides flatten to 1 and reports it", arcFlat.flattenEff === 1,
    "a flattened cap is not a sphere, so equal solid angle would stop being equal area");

  // ── THE fc DECOMPOSITION, AND THE CLAIM IT CORRECTS ──────────────────────
  // CLAUDE.md used to say every cell has the SAME expansion ratio, so fc
  // differs only through path length. False for a uniform x/y mouth: the cap
  // stretches the outer cells. The decomposition freezes one variable at its
  // mean to separate the two contributions.
  checkTrue("rect mouth: fc moves with BOTH path length and area ratio",
    rect.fcDecomp.fromRatio > 1 && rect.fcDecomp.fromLength > 1,
    `L alone ${rect.fcDecomp.fromLength.toFixed(2)}%, ratio alone ${rect.fcDecomp.fromRatio.toFixed(2)}%, full ${rect.fcDecomp.full.toFixed(2)}%`);
  // and they partially cancel — an outer cell has both a longer path and a
  // larger ratio, which push fc in opposite directions
  checkTrue("...and the two partially cancel, so the full spread is the smaller",
    rect.fcDecomp.full < rect.fcDecomp.fromLength,
    `full ${rect.fcDecomp.full.toFixed(2)}% < path length alone ${rect.fcDecomp.fromLength.toFixed(2)}%`);
  // arc mode is what makes the old claim TRUE: equal ratios leave path length
  // as the only term, so equalising dL really does equalise the cutoff
  checkTrue("arc mouth makes fc a function of path length ALONE",
    arc.fcDecomp.fromRatio < 0.05 && Math.abs(arc.fcDecomp.full - arc.fcDecomp.fromLength) < 0.5,
    `ratio alone ${arc.fcDecomp.fromRatio.toFixed(3)}%, full ${arc.fcDecomp.full.toFixed(2)}% = L alone ${arc.fcDecomp.fromLength.toFixed(2)}%`);
}

// ── 10a5b. the 1-D Hypex reference ─────────────────────────────────────────
head("1-D Hypex reference");
{
  const St = 895.3, fc = 500, T = 0.7, cov = 90;
  const ref = M.hypexReference({ throatArea: St, fc, T, c, coverageDeg: cov });
  const lam = (c / fc) * 1000;
  // the two mouth criteria, against their closed forms
  check("loading mouth diameter is lambda/pi", ref.diaLoading, lam / Math.PI, 1e-9, "mm");
  check("directivity mouth diameter is lambda / sin(Th/2)",
    ref.diaDirectivity, lam / Math.sin((cov / 2) * Math.PI / 180), 1e-9, "mm");
  checkTrue("the binding criterion is the larger of the two",
    ref.dia === Math.max(ref.diaLoading, ref.diaDirectivity) && ref.governedBy === "directivity",
    `directivity ${ref.diaDirectivity.toFixed(0)} mm governs over loading ${ref.diaLoading.toFixed(0)} mm`);

  // the length must be the one that actually reaches that mouth under the law,
  // checked by running the profile forward rather than trusting the solver
  const ratio = (ref.dia / 2) / Math.sqrt(St / Math.PI);
  check("minimum length is the length that reaches the required ratio",
    M.hypexR(ref.minLength, 1, ref.m, T), ratio, 1e-9);
  check("...and the ratio it reports is that same ratio", ref.ratio, ratio, 1e-12);
  check("m is the cutoff's own flare constant", ref.m, M.hypexMForFc(fc, c), 1e-15, "/mm");

  // WIDER coverage needs a SMALLER mouth — the relation is 1/sin(Th/2), which
  // is why the narrow-coverage horn is the one that comes out enormous
  const wide = M.hypexReference({ throatArea: St, fc, T, c, coverageDeg: 120 });
  const narrow = M.hypexReference({ throatArea: St, fc, T, c, coverageDeg: 40 });
  checkTrue("wider coverage needs a smaller mouth, not a larger one",
    wide.dia < ref.dia && ref.dia < narrow.dia,
    `120deg ${wide.dia.toFixed(0)} < 90deg ${ref.dia.toFixed(0)} < 40deg ${narrow.dia.toFixed(0)} mm`);
  // and a lower cutoff needs a bigger mouth and a longer horn, both ~1/fc
  const lower = M.hypexReference({ throatArea: St, fc: 250, T, c, coverageDeg: cov });
  check("halving the cutoff doubles the required mouth diameter",
    lower.dia / ref.dia, 2, 1e-9);
  checkTrue("...and lengthens the horn", lower.minLength > ref.minLength,
    `${ref.minLength.toFixed(0)} -> ${lower.minLength.toFixed(0)} mm`);
  // cosh needs more length than exponential for the same mouth, as ever
  const t0 = M.hypexReference({ throatArea: St, fc, T: 0, c, coverageDeg: cov });
  const t1 = M.hypexReference({ throatArea: St, fc, T: 1, c, coverageDeg: cov });
  checkTrue("hyperbolic needs more length than exponential for the same mouth",
    t0.minLength > t1.minLength, `${t0.minLength.toFixed(0)} vs ${t1.minLength.toFixed(0)} mm`);
}

// ── 10a6. fc as an input ───────────────────────────────────────────────────
head("fc as an input (depth solved)");
{
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const arcOpts = {
    c, nc: 6, nr: 3, R, rectangular: true, apex: 120, flatten: 1, exitHalfAngle: 8,
    fTarget: 20000, dividerEndFrac: 0.35, stations: 16, wallWidthAt: 200 / 6, tight: 0.55,
    mouthMode: "arc", thetaH: 90, thetaV: 60,
  };
  // THE ROUND TRIP, and it is closed against the forward model rather than
  // against the solver's own bookkeeping: take the depth it returns, rebuild
  // the mapping from scratch at that depth, and read the cutoff back out.
  let worst = 0;
  for (const target of [350, 500, 800]) {
    const r = M.solveDepthForFc(Lay.throat, arcOpts, { fcTarget: target, T: 1 });
    const back = M.mapThroatToMouth(Lay.throat, { ...arcOpts, depth: r.depth, profileT: 1, keepGeometry: false });
    const fcs = back.rows.map((x) => x.profFc);
    const mean = fcs.reduce((a, b) => a + b, 0) / fcs.length;
    worst = Math.max(worst, Math.abs(mean - target) / target);
  }
  check("depth solved for fc reproduces that fc through the forward model", worst, 0, 1e-5);

  // deeper is a lower cutoff, so a higher target must come back shallower
  const byTarget = [300, 500, 900].map((t) => M.solveDepthForFc(Lay.throat, arcOpts, { fcTarget: t, T: 1 }));
  checkTrue("a higher cutoff needs less depth, monotonically",
    byTarget.every((r) => r.ok) && byTarget[0].depth > byTarget[1].depth && byTarget[1].depth > byTarget[2].depth,
    byTarget.map((r) => `${r.depth.toFixed(1)}`).join(" > ") + " mm");

  // cosh flares more slowly off the throat than exponential, so it needs more
  // length to reach the same mouth area at the same cutoff
  const byT = [0, 0.5, 1].map((T) => M.solveDepthForFc(Lay.throat, arcOpts, { fcTarget: 500, T }));
  checkTrue("hyperbolic needs more depth than exponential for the same fc",
    byT[0].depth > byT[1].depth && byT[1].depth > byT[2].depth,
    byT.map((r) => r.depth.toFixed(1)).join(" > ") + " mm for T = 0, 0.5, 1");

  // out of reach is REPORTED with the bound it ran into, never clamped to the
  // nearest achievable value and presented as a solution
  const tooLow = M.solveDepthForFc(Lay.throat, arcOpts, { fcTarget: 20, T: 1 });
  const tooHigh = M.solveDepthForFc(Lay.throat, arcOpts, { fcTarget: 8000, T: 1 });
  checkTrue("an unreachable cutoff is reported with its bound, not clamped",
    !tooLow.ok && tooLow.reason === "too low" && tooLow.bound > 20 &&
    !tooHigh.ok && tooHigh.reason === "too high" && tooHigh.bound < 8000,
    `20 Hz floors at ${tooLow.bound.toFixed(0)} Hz, 8000 Hz ceilings at ${tooHigh.bound.toFixed(0)} Hz`);

  // and it is not an arc-mode-only trick
  const rectOpts = { ...arcOpts, mouthMode: "rect", mouthW: 200, mouthH: 100 };
  const rr = M.solveDepthForFc(Lay.throat, rectOpts, { fcTarget: 500, T: 1 });
  const rback = M.mapThroatToMouth(Lay.throat, { ...rectOpts, depth: rr.depth, profileT: 1, keepGeometry: false });
  const rfc = rback.rows.map((x) => x.profFc);
  check("the inversion works in rect mode too", rfc.reduce((a, b) => a + b, 0) / rfc.length, 500, 0.05, "Hz");

  // ── WHAT IS LEFT IN THE fc SPREAD, AND WHERE IT COMES FROM ──────────────
  // With an equal-area mouth AND no dividers, path length is the whole story,
  // so the dL budget is the only lever left.
  const bare = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0, c });
  const solvedBare = M.solveDepthForFc(bare.throat, arcOpts, { fcTarget: 500, T: 1 });
  checkTrue("with t = 0 the residual fc spread is path length ALONE",
    solvedBare.fcDecomp.fromRatio < 0.05 && solvedBare.fcDecomp.fromLength > 1,
    `${solvedBare.fcLo.toFixed(0)}-${solvedBare.fcHi.toFixed(0)} Hz: ratio alone ${solvedBare.fcDecomp.fromRatio.toFixed(3)}%, length alone ${solvedBare.fcDecomp.fromLength.toFixed(2)}%`);

  // BUT the throat is not equal-area in the sense the profile uses. The solve
  // equalises OPEN area; the duct section is built on the GROSS cell outline,
  // and open = gross - (t/2) x divider length. A rim cell has fewer dividers,
  // so equal open area means it needs LESS gross area — and the profile's
  // expansion ratio, being gross to gross, inherits that inequality. This is a
  // second, independent source of fc spread, sitting at the throat rather than
  // the mouth, and it scales with the divider thickness.
  const grossSpread = (t) => {
    const lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
    const a = lay.throat.cells.map((x) => x.area), o = lay.throat.cells.map((x) => x.open);
    const sp = (v) => ((Math.max(...v) - Math.min(...v)) / (v.reduce((x, y) => x + y, 0) / v.length)) * 100;
    return { gross: sp(a), open: sp(o) };
  };
  const g0 = grossSpread(0), g4 = grossSpread(0.4), g8 = grossSpread(0.8);
  checkTrue("the solve equalises OPEN area, at every divider thickness",
    [g0, g4, g8].every((x) => x.open < 1e-6),
    `open spread ${g4.open.toExponential(2)}% at t = 0.4`);
  checkTrue("...but GROSS throat area is unequal once dividers exist, and grows with t",
    g0.gross < 1e-6 && g4.gross > 1 && g8.gross > g4.gross,
    `gross spread ${g0.gross.toFixed(3)}% / ${g4.gross.toFixed(2)}% / ${g8.gross.toFixed(2)}% at t = 0 / 0.4 / 0.8`);
  // so an equal-area MOUTH does not by itself buy an equal expansion ratio
  const ratioAt = (t) => {
    const lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
    return M.mapThroatToMouth(lay.throat, { ...arcOpts, depth: 280.47, profileT: 1, keepGeometry: false });
  };
  const r0 = ratioAt(0), r4 = ratioAt(0.4), r8 = ratioAt(0.8);
  checkTrue("the divider inset, not the mouth, is what is left in the ratio spread",
    r0.mouthAreaSpread === r4.mouthAreaSpread && r4.mouthAreaSpread === r8.mouthAreaSpread &&
    r0.ratioSpread < 0.05 && r4.ratioSpread > 1 && r8.ratioSpread > r4.ratioSpread,
    `mouth fixed at ${r4.mouthAreaSpread.toFixed(4)}% while ratio goes ${r0.ratioSpread.toFixed(3)} -> ${r4.ratioSpread.toFixed(2)} -> ${r8.ratioSpread.toFixed(2)}%`);
}

// ── 10a6c. depth for the dL minimum, and the separable clearance ───────────
// The dL optimum is geometric: when the mouth's curvature centre lands on the
// throat the mouth is a sphere about it and every cell is equidistant. The
// solver is checked against the recorded measurement (90x40, 600 mm arc,
// matched radii: optimum near 425 mm), against the FORWARD model for local
// minimality, and for T-independence — the profile scales sections about
// their own centroids and never moves a centreline, so dL cannot see T.
head("Depth for minimum dL");
{
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const biOpts = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    fTarget: 20000, dividerEndFrac: 0.35, stations: 16, wallWidthAt: 100, tight: 0.55,
    t: 0.4, profileArea: "open", sectionMode: "swept",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 600, arcV: (600 * 40) / 90,
  };
  const r = M.solveDepthForMinDL(Lay.throat, biOpts);
  checkTrue("the solve lands near the recorded 425 mm optimum for 90x40 at 600 mm arc",
    r.ok && Math.abs(r.depth - 425) < 20 && !r.atBound,
    `depth ${r.depth.toFixed(1)} mm, dL ${r.dL.toFixed(2)} mm, ${r.evals} evals`);
  checkTrue("dL at the optimum is within the half-wave a single snake could cover",
    r.dL < 6, `${r.dL.toFixed(2)} mm`);
  // local minimality through the forward model, never the solver's bookkeeping
  const dLAt = (depth, T) => M.mapThroatToMouth(Lay.throat, {
    ...biOpts, depth, profileT: T, keepGeometry: false, computeClearance: false,
  }).dL;
  checkTrue("the forward model confirms an interior minimum",
    dLAt(r.depth * 0.85, null) > r.dL && dLAt(r.depth * 1.15, null) > r.dL,
    `${dLAt(r.depth * 0.85, null).toFixed(1)} > ${r.dL.toFixed(2)} < ${dLAt(r.depth * 1.15, null).toFixed(1)} mm`);
  // the seed is the closed-form argument; the search only refines it
  checkTrue("the closed-form seed 1.09 x mean radius is already close",
    Math.abs(r.seed - r.depth) / r.depth < 0.15,
    `seed ${r.seed.toFixed(1)} against solved ${r.depth.toFixed(1)} mm`);
  check("dL is independent of T — the profile never moves a centreline",
    dLAt(r.depth, 0.7), dLAt(r.depth, null), 1e-9, "mm");
  const flat = M.solveDepthForMinDL(Lay.throat, { ...biOpts, thetaH: 0, thetaV: 0 });
  checkTrue("a doubly flat mouth is refused, not given a fictitious optimum",
    !flat.ok && flat.reason === "flat mouth", flat.reason);

  // ── the clearance metric is separable, and separating it changes nothing ──
  const withC = M.mapThroatToMouth(Lay.throat, { ...biOpts, depth: 200, profileT: 0.7, keepGeometry: true });
  const without = M.mapThroatToMouth(Lay.throat, { ...biOpts, depth: 200, profileT: 0.7, keepGeometry: true, computeClearance: false });
  const sep = M.ductClearance(without.rows);
  checkTrue("computeClearance: false skips the measurement and says so",
    without.clearance === null, "clearance is null");
  checkTrue("ductClearance run standalone reproduces the inline result exactly",
    sep.minMid === withC.clearance.minMid && sep.overlap === withC.clearance.overlap &&
    sep.max === withC.clearance.max && sep.pairs === withC.clearance.pairs &&
    sep.perStation.every((v, i) => v === withC.clearance.perStation[i]),
    `minMid ${sep.minMid.toFixed(6)} mm, ${sep.pairs} pairs, ${sep.perStation.length} stations`);
}

// ── 10a6d. per-cell path lengthening ────────────────────────────────────────
// A short cell is bowed laterally — window sin^2(n pi u), zero value AND zero
// slope at both ends — until its centreline reaches the longest cell's
// length. The amplitude is bisected on the MEASURED length; the closed form
// dL = n^2 pi^2 a^2 / (4L) is its seed and holds on a STRAIGHT path only (a
// curved path picks up a FIRST-order kappa.delta term), so the closed form is
// checked on a genuinely straight cell and the curved cases are checked
// against the achieved target through the forward model.
head("Per-cell path lengthening");
{
  // a 1x1 grid is one cell dead on axis: base turn measures 0.0000 deg, so
  // the straight-path closed form applies. This case also used to CRASH in
  // solveEqualArea (zero constraints hit a temporal dead zone), so building
  // it at all is itself a regression check.
  const one = M.buildLayout({ family: "hgrid", R, nc: 1, nr: 1, m: 2, t: 0, c });
  const oneOpts = {
    c, nc: 1, nr: 1, R, rectangular: true, exitHalfAngle: 8, depth: 300,
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    t: 0, fTarget: 20000, dividerEndFrac: 0.35, stations: 16, profileT: null,
    sectionMode: "swept", wallWidthAt: 80, keepGeometry: false, computeClearance: false,
  };
  const oneBase = M.mapThroatToMouth(one.throat, oneOpts);
  const L0 = oneBase.rows[0].Lpath;
  checkTrue("the 1x1 straight cell builds and is straight",
    Math.abs(oneBase.rows[0].turnDeg) < 1e-3, `turn ${oneBase.rows[0].turnDeg.toExponential(1)} deg`);
  let worstCf = 0, worstHit = 0;
  const amps = {};
  for (const lobes of [1, 2, 3]) for (const dfc of [2, 5]) {
    const on = M.mapThroatToMouth(one.throat, {
      ...oneOpts, lengthen: { lobes, dir: "y", targetLen: L0 + dfc },
    });
    const a = on.rows[0].snakeAmp;
    if (dfc === 5) amps[lobes] = a;
    worstCf = Math.max(worstCf, Math.abs((lobes * lobes * Math.PI ** 2 * a * a) / (4 * L0) - dfc) / dfc);
    worstHit = Math.max(worstHit, Math.abs(on.rows[0].Lpath - (L0 + dfc)));
  }
  check("straight path: the closed form n^2 pi^2 a^2 / 4L matches the solved amplitude",
    worstCf, 0, 0.03);
  check("the solver lands on the target length through the forward model", worstHit, 0, 1e-3, "mm");
  check("amplitude scales as 1/lobes — n lobes buy the same length at a/n",
    amps[1] / amps[2], 2, 0.05);

  // the motivating case: a vertically flat mouth, where depth cannot close dL
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t: 0.4, c });
  const flatOpts = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8, depth: 200,
    mouthMode: "biradial", thetaH: 90, thetaV: 0, arcH: 480, arcV: 213,
    t: 0.4, profileArea: "open", fTarget: 20000, dividerEndFrac: 0.35,
    stations: 16, profileT: 0.7, sectionMode: "swept", wallWidthAt: 80,
    keepGeometry: true, computeClearance: false,
  };
  const off = M.mapThroatToMouth(Lay.throat, flatOpts);
  const on = M.mapThroatToMouth(Lay.throat, { ...flatOpts, lengthen: { lobes: 2, dir: "y" } });
  checkTrue("flat mouth: a real dL to close, and lengthening closes it",
    off.dL > 10 && on.dL < 0.05,
    `${off.dL.toFixed(1)} -> ${on.dL.toFixed(4)} mm`);
  // the longest cell is found on the BASE map — after lengthening every cell
  // is the same length by construction, so "longest" is a tie there
  const longestBase = off.rows.reduce((a, r) => (r.Lpath > a.Lpath ? r : a));
  const longestOn = on.rows.find((r) => r.id === longestBase.id);
  checkTrue("the longest cell is left alone — lengthening only ever adds",
    longestOn.snakeAmp === 0, `amp ${longestOn.snakeAmp} on cell ${longestOn.i},${longestOn.j}`);
  const midMax = Math.max(...on.rows.filter((r) => r.j === 1).map((r) => r.snakeAmp));
  const rimMax = Math.max(...on.rows.filter((r) => r.j !== 1).map((r) => r.snakeAmp));
  checkTrue("the deficit map decides who bows: the flat mouth's middle row bows deepest",
    midMax > rimMax && on.lengthen.cells >= 12,
    `middle ${midMax.toFixed(1)} vs rim ${rimMax.toFixed(1)} mm over ${on.lengthen.cells} cells`);
  // the two END rings must not move: the throat mating face and the mouth
  // tiling are exactly what the sin^2 window's zero ends exist to protect
  let mouthMove = 0, throatZ = 0;
  on.rows.forEach((r, k) => {
    const a = r.sched[r.sched.length - 1].pts, b = off.rows[k].sched[off.rows[k].sched.length - 1].pts;
    for (let q = 0; q < a.length; q++)
      mouthMove = Math.max(mouthMove, Math.hypot(a[q][0] - b[q][0], a[q][1] - b[q][1], a[q][2] - b[q][2]));
    for (const p of r.sched[0].pts) throatZ = Math.max(throatZ, Math.abs(p[2]));
  });
  check("the mouth rings do not move under lengthening", mouthMove, 0, 1e-9, "mm");
  check("station 0 stays in the throat plane", throatZ, 0, 1e-9, "mm");

  // equalising dL equalises fc — the whole point of the mechanism
  const curOpts = {
    ...flatOpts, thetaV: 40, arcH: 600, arcV: (600 * 40) / 90, depth: 425,
    keepGeometry: false,
  };
  const cOff = M.mapThroatToMouth(Lay.throat, curOpts);
  const cOn = M.mapThroatToMouth(Lay.throat, { ...curOpts, lengthen: { lobes: 2, dir: "y" } });
  checkTrue("equalising dL collapses the fc spread",
    cOn.dL < 0.02 && cOn.fcDecomp.full < cOff.fcDecomp.full / 5,
    `dL ${cOff.dL.toFixed(2)} -> ${cOn.dL.toFixed(3)} mm, fc spread ${cOff.fcDecomp.full.toFixed(3)} -> ${cOn.fcDecomp.full.toFixed(3)}%`);

  // structurally unavailable in flow mode, so it must be refused there
  const fl = M.mapThroatToMouth(Lay.throat, {
    ...flatOpts, sectionMode: "flow", lengthen: { lobes: 2, dir: "y" },
  });
  checkTrue("flow mode ignores lengthening — a shared point cannot follow two paths",
    fl.lengthen === null && Math.abs(fl.dL - off.dL) < off.dL * 0.2,
    `lengthen null, dL ${fl.dL.toFixed(1)} mm`);
}

// ── 10a6b. the volume identity, done properly ──────────────────────────────
// The swept volume of a tube is exactly INT A_vec . dr, so the identity has
// three parts that all have to be right: the VECTOR area (not its magnitude
// times a scalar obliquity), the SECTION CENTROID displacement (not the
// centreline's), and the trapezoid rule over stations. Get the first two right
// and the residual is pure quadrature, which must fall as O(h^2). Get either
// wrong and it hits a geometric floor that more stations cannot clear — which
// is the failure this block exists to pin down, because a fixed tolerance on a
// coarse station count hides it completely.
head("Volume identity and its convergence");
{
  const t = 0.4, DEF = 0.35;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const vecArea = (r) => {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < r.length; k++) {
      const a = r[k], b = r[(k + 1) % r.length];
      ax += a[1] * b[2] - a[2] * b[1];
      ay += a[2] * b[0] - a[0] * b[2];
      az += a[0] * b[1] - a[1] * b[0];
    }
    return [ax / 2, ay / 2, az / 2];
  };
  const ctrOf = (r) => {
    const q = [0, 0, 0];
    for (const p of r) { q[0] += p[0] / r.length; q[1] += p[1] / r.length; q[2] += p[2] / r.length; }
    return q;
  };
  // worst relative error over all 18 ducts, for a given integral form
  const err = (mo, ST, form) => {
    const map = M.mapThroatToMouth(Lay.throat, {
      c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
      tight: 0.55, fTarget: 20000, dividerEndFrac: DEF, keepGeometry: true,
      wallWidthAt: 200 / 6, t, stations: ST, profileT: 0.3, ...mo });
    const solids = M.ductSolids(Lay.throat, map, { t, dividerEndFrac: DEF });
    let worst = 0;
    for (const cell of Lay.throat.cells) {
      const row = map.rows.find((r) => r.id === cell.id);
      const sd = solids.find((x) => x.id === cell.id);
      let V = 0;
      for (let q = 1; q < sd.sections.length; q++) {
        const c0 = ctrOf(sd.sections[q - 1].pts), c1 = ctrOf(sd.sections[q].pts);
        const dC = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
        if (form === "exact") {
          const A0 = vecArea(sd.sections[q - 1].pts), A1 = vecArea(sd.sections[q].pts);
          V += 0.5 * ((A0[0] + A1[0]) * dC[0] + (A0[1] + A1[1]) * dC[1] + (A0[2] + A1[2]) * dC[2]);
        } else {
          // the old form: scalar area x tangent obliquity x CENTRELINE step
          const o0 = sd.sections[q - 1].origin, o1 = sd.sections[q].origin;
          const sc = (k) => row.sched[k].axial / row.sched[k].area;
          V += 0.5 * (sd.sections[q].area * sc(q) + sd.sections[q - 1].area * sc(q - 1))
             * Math.hypot(o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]);
        }
      }
      worst = Math.max(worst, Math.abs(Math.abs(V) - sd.volume) / sd.volume);
    }
    return worst;
  };
  const cases = [
    ["rect, flow", { mouthMode: "rect", mouthW: 200, mouthH: 100, flatten: 1, sectionMode: "flow" }],
    ["arc, flow", { mouthMode: "arc", thetaH: 90, thetaV: 40, sectionMode: "flow" }],
    ["arc, swept", { mouthMode: "arc", thetaH: 90, thetaV: 40, sectionMode: "swept" }],
  ];
  for (const [nm, mo] of cases) {
    const e16 = err(mo, 16, "exact"), e32 = err(mo, 32, "exact");
    checkTrue(`${nm}: the exact identity converges at second order`,
      e32 < e16 / 3 && e32 < 0.0025,
      `${(e16 * 100).toFixed(3)}% -> ${(e32 * 100).toFixed(3)}% doubling the stations, ${(e16 / e32).toFixed(1)}x`);
  }
  // AND THE COUNTER-CASE, so nobody "simplifies" it back. Attributing a
  // section's area to the CENTRELINE's position instead of its own leaves a
  // geometric offset — 0.775 mm rect, 4.466 mm arc — that no amount of
  // quadrature clears, so the residual stalls instead of falling.
  const o16 = err(cases[1][1], 16, "origin"), o32 = err(cases[1][1], 32, "origin");
  checkTrue("...while the centreline-referenced form stalls instead of converging",
    o32 > o16 / 2.2 && o32 > 4 * err(cases[1][1], 32, "exact"),
    `${(o16 * 100).toFixed(3)}% -> ${(o32 * 100).toFixed(3)}%, only ${(o16 / o32).toFixed(1)}x for a 2x refinement`);
}

// ── 10a7. swept sections (Phase D) ─────────────────────────────────────────
// The flowed construction guarantees non-overlap by SHARING boundary points.
// Swept sections give that up on purpose, so that each cell's centreline can be
// manipulated independently — the only mechanism that can lengthen an interior
// cell's path, which the dL measurements say is required at any useful
// coverage. What must survive is the two ENDS: the driver mating face and the
// mouth tiling. What is traded is the interior, and it is bounded by the SIGNED
// clearance rather than asserted to be zero.
head("Swept sections (Phase D)");
{
  const ST = 16, t = 0.4, DEF = 0.35;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
    tight: 0.55, fTarget: 20000, dividerEndFrac: DEF, stations: ST, keepGeometry: true,
    wallWidthAt: 200 / 6,
  };
  const modes = [["rect", { mouthMode: "rect", mouthW: 200, mouthH: 100, flatten: 1 }],
                 ["arc", { mouthMode: "arc", thetaH: 90, thetaV: 60 }]];

  for (const [nm, mo] of modes) {
    const flow = M.mapThroatToMouth(Lay.throat, { ...common, ...mo, profileT: 0.3, sectionMode: "flow" });
    const swept = M.mapThroatToMouth(Lay.throat, { ...common, ...mo, profileT: 0.3, sectionMode: "swept" });

    // ── THE ENDS MUST BE EXACT, or the trade is not worth making ───────────
    let e0 = 0, eN = 0, z0 = 0;
    swept.rows.forEach((r, i) => {
      const f = flow.rows[i];
      for (let k = 0; k < r.sched[0].pts.length; k++) {
        const a = r.sched[0].pts[k], b = f.sched[0].pts[k];
        e0 = Math.max(e0, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        z0 = Math.max(z0, Math.abs(a[2]));
        const p = r.sched[ST].pts[k], q = f.sched[ST].pts[k];
        eN = Math.max(eN, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
    });
    check(`${nm}: station 0 IS the throat polygon`, e0, 0, 1e-12, "mm");
    check(`${nm}: ...and lies flat in the throat plane`, z0, 0, 1e-12, "mm");
    check(`${nm}: station N IS the mouth quad on the aperture`, eN, 0, 1e-11, "mm");

    // both end rings are therefore still SHARED point-for-point between
    // neighbours, which is what keeps the driver face seatable and the mouth
    // tiling intact. This is the half of the old invariant that survives.
    const share = (map, q) => {
      const byIdx = new Map(map.rows.map((r) => [`${r.i},${r.j}`, r]));
      let worst = 0;
      for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++)
        for (const [da, db] of [[1, 0], [0, 1]]) {
          const A = byIdx.get(`${a},${b}`), B = byIdx.get(`${a + da},${b + db}`);
          if (!A || !B) continue;
          let best = Infinity;
          for (const pa of A.sched[q].pts) {
            let d = Infinity;
            for (const pb of B.sched[q].pts)
              d = Math.min(d, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]));
            best = Math.min(best, d);
          }
          worst = Math.max(worst, best);
        }
      return worst;
    };
    check(`${nm}: neighbours still share the throat ring exactly`, share(swept, 0), 0, 1e-9, "mm");
    check(`${nm}: ...and the mouth ring exactly`, share(swept, ST), 0, 1e-9, "mm");

    // ── THE IMPOSED TWIST ──────────────────────────────────────────────────
    // End-ring exactness cannot show this: the rings are rebuilt from their own
    // local coordinates and come out exact whatever the frame did. The residual
    // after the roll is what says the roll actually landed on the mouth's +x.
    checkTrue(`${nm}: the imposed roll lands the axis on the mouth's own +x`,
      swept.sweptAimMax < 1e-9 && swept.sweptRollMax > 10,
      `${swept.sweptRollMax.toFixed(1)} deg of roll imposed, residual ${swept.sweptAimMax.toExponential(1)} deg`);

    // ── AND THE TRADE ITSELF, MEASURED ─────────────────────────────────────
    checkTrue(`${nm}: the interior no longer shares — the deliberate trade`,
      swept.clearance.overlap > 1e-3,
      `${swept.clearance.overlap.toFixed(3)} mm over ${swept.clearance.overlapStations} interior station(s), against 0 for the flow`);
    check(`${nm}: the flow it replaces still measures exactly zero overlap`,
      flow.clearance.overlap, 0, 1e-7, "mm");

    // THE k <= 1 ARGUMENT IS DEAD HERE, and this is why Phase A had to land
    // first. k is an area ratio computed by the profile against the tiling
    // configuration; it knows nothing about where a swept section actually
    // sits. It reads <= 1 — "cannot overlap" — while ducts really do overlap.
    checkTrue(`${nm}: k <= 1 no longer proves non-overlap, and must not be read as if it did`,
      swept.profScaleMax <= 1 + 1e-9 && swept.clearance.overlap > 1e-3,
      `kMax = ${swept.profScaleMax.toFixed(5)} says "safe" while the geometry measures ${swept.clearance.overlap.toFixed(3)} mm of penetration`);

    // the profile is the one lever that exists on it today
    const bare = M.mapThroatToMouth(Lay.throat, { ...common, ...mo, profileT: null, sectionMode: "swept" });
    checkTrue(`${nm}: the profile pulls sections inward and cuts the overlap hard`,
      bare.clearance.overlap > 4 * swept.clearance.overlap,
      `${bare.clearance.overlap.toFixed(2)} mm with no law -> ${swept.clearance.overlap.toFixed(2)} mm at T = 0.3`);
  }

  // ── EXPORTS MUST STILL WORK, or none of this reaches a printer ───────────
  const sw = M.mapThroatToMouth(Lay.throat, {
    ...common, mouthMode: "arc", thetaH: 90, thetaV: 60, profileT: 0.3, sectionMode: "swept" });
  const solids = M.ductSolids(Lay.throat, sw, { t, dividerEndFrac: DEF });
  checkTrue("swept ducts are closed, consistently wound solids",
    solids.length === Lay.throat.cells.length && solids.every((s) => s.manifold.ok),
    `${solids.length} ducts, ${solids[0].manifold.edges} edges each, 0 unpaired`);
  checkTrue("...with valid end caps",
    solids.every((s) => M.fanIsValid(s.sections[0].pts).ok &&
      M.fanIsValid(s.sections[s.sections.length - 1].pts).ok), "no folded caps");
  let zw = 0;
  for (const s of solids) for (const q of s.sections[0].pts) zw = Math.max(zw, Math.abs(q[2]));
  check("...seating on a flat throat face", zw, 0, 1e-12, "mm");
  const stl = M.buildSTL(solids);
  const facets = new DataView(stl).getUint32(80, true);
  const want = solids.reduce((a, s) => a + s.tris.length, 0);
  checkTrue("...and exporting a well-formed binary STL",
    facets === want && stl.byteLength === 84 + want * 50,
    `${facets} facets, ${(stl.byteLength / 1048576).toFixed(2)} MB`);
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

  // A corner must flow to a corner, not into the middle of a mouth edge. The
  // mouth outline is square, so its four corners are the four sharpest turns;
  // at EVERY station the sharpest four must sit at 0, nMs, 2nMs, 3nMs. The
  // flowed sections are space polygons, so the turn is measured in 3-D.
  const cornerIdx = (poly) => poly
    .map((_, k) => {
      const a = poly[(k - 1 + poly.length) % poly.length], b = poly[k], d = poly[(k + 1) % poly.length];
      const v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const n1 = Math.hypot(...v1) || 1e-18, n2 = Math.hypot(...v2) || 1e-18;
      const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (n1 * n2);
      return [Math.acos(Math.max(-1, Math.min(1, dot))), k];
    })
    .sort((x, y) => y[0] - x[0]).slice(0, 4).map((x) => x[1]).sort((x, y) => x - y);
  const row = map.rows.find((r) => r.label === "3,1");
  let aligned = true;
  for (let q = 0; q <= ST; q++)
    if (cornerIdx(row.sched[q].pts).join(",") !== [0, nMs, 2 * nMs, 3 * nMs].join(",")) aligned = false;
  checkTrue("every station keeps its corners at the side boundaries", aligned,
    `stations 0..${ST} all at [0, ${nMs}, ${2 * nMs}, ${3 * nMs}]`);

  // ── the defining property of the flowed construction ────────────────────
  // Neighbours share their boundary points EXACTLY, at every station, because a
  // point's trajectory depends only on the point. This is what makes the ducts
  // tile instead of drifting through each other.
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let share = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const A = map.rows.find((r) => r.id === i * 3 + j), B = map.rows.find((r) => r.id === (i + 1) * 3 + j);
    for (let q = 0; q <= ST; q++)
      for (let k = 0; k <= nMs; k++)
        share = Math.max(share, d3(A.sched[q].pts[(nMs + k) % 64], B.sched[q].pts[(4 * nMs - k) % 64]));
  }
  check("neighbours share their whole boundary at every station", share, 0, 1e-8, "mm");

  // The last station IS the mouth cell — but the aperture is a curved cap, so
  // the sections close on the CAP's area, which is larger than its projection.
  const capRatio = map.mouthAreaTotal / (200 * 100);
  checkTrue("station areas close on the aperture, not on its flat projection",
    capRatio > 1.02 && capRatio < 1.05, `cap is ${((capRatio - 1) * 100).toFixed(1)}% above 200x100 mm`);
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
    const s0 = map.rows.find((r) => r.label === label).sched[0].pts;
    const flat = s0.map((p) => [p[0] - cell.centroid[0], p[1] - cell.centroid[1]]);
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

  // Volume by the divergence theorem against the integrated area schedule. It
  // is the AXIAL area that integrates to a volume: a flowed section is a level
  // set of the flow, not a cut square to the path, so its own area runs above
  // its projection on the direction of travel.
  let vWorst = 0, oblique = 0;
  for (const cellRec of th.cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    const s = solids.find((x) => x.id === cellRec.id);
    let V = 0;
    for (let q = 1; q < s.sections.length; q++) {
      const a = s.sections[q - 1].origin, b = s.sections[q].origin;
      const scale = (k) => row.sched[k].axial / row.sched[k].area;
      V += 0.5 * (s.sections[q].area * scale(q) + s.sections[q - 1].area * scale(q - 1))
         * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      oblique = Math.max(oblique, 1 - scale(q));
    }
    vWorst = Math.max(vWorst, Math.abs(s.volume - V) / V);
  }
  checkTrue("mesh volume agrees with the integrated AXIAL area schedule", vWorst < 0.01,
    `worst ${(vWorst * 100).toFixed(3)}% over ${ST} stations`);
  checkTrue("section obliquity is reported, not assumed away", oblique > 0 && oblique < 0.2,
    `worst section runs ${(oblique * 100).toFixed(1)}% above its axial projection`);

  const stl = M.buildSTL(solids);
  const facets = new DataView(stl).getUint32(80, true);
  const want = solids.reduce((a, s) => a + s.tris.length, 0);
  checkTrue("binary STL declares the facets it carries", facets === want && stl.byteLength === 84 + want * 50,
    `${facets} facets, ${(stl.byteLength / 1048576).toFixed(2)} MB`);
}

// ── 10d. duct solids UNDER the expansion profile ───────────────────────────
// The solids above are built with no expansion law. The profile rescales every
// section, so none of what they establish carries over on its own: a mesh that
// was closed can be reopened, and a volume identity that held can stop holding.
// This repeats the load-bearing checks with the profile ON, at a T where k <= 1
// so the geometry is legal and any failure would be the profile's doing.
head("Duct solids under the profile");
{
  const t = 0.4, ST = 16, DEF = 0.35, PT = 0;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = L.throat;
  const mopt = {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120,
    depth: 150, flatten: 1, dividerEndFrac: DEF, stations: ST, keepGeometry: true,
  };
  const plain = M.mapThroatToMouth(th, { ...mopt, profileT: null });
  const map = M.mapThroatToMouth(th, { ...mopt, profileT: PT });
  checkTrue("the profile stays inside the tiling configuration at this T",
    map.profScaleMax <= 1 + 1e-9, `kMax = ${map.profScaleMax.toFixed(6)}`);

  const solids = M.ductSolids(th, map, { t, dividerEndFrac: DEF });
  checkTrue("one solid per cell, with the profile on", solids.length === th.cells.length,
    `${solids.length} ducts`);

  // k = 1 at station 0, so the driver mating face must be as flat as it was
  let zWorst = 0;
  for (const sd of solids) for (const q of sd.sections[0].pts) zWorst = Math.max(zWorst, Math.abs(q[2]));
  check("station 0 still lies in the throat plane", zWorst, 0, 1e-12, "mm");

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
  const byId = (id) => solids.find((sd) => sd.id === id);
  let wMin = Infinity, wMax = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const d = sep(byId(i * 3 + j).sections[0].pts, byId((i + 1) * 3 + j).sections[0].pts);
    wMin = Math.min(wMin, d); wMax = Math.max(wMax, d);
  }
  check("throat wall is still exactly t with the profile on", wMin, t, 1e-9, "mm");
  check("...and still no thicker anywhere", wMax, t, 1e-9, "mm");

  // and the far end: k = 1 there too, so the mouth must still tile
  let mouthWorst = 0;
  map.rows.forEach((r, i) => {
    mouthWorst = Math.max(mouthWorst, Math.abs(r.sched[ST].area / plain.rows[i].sched[ST].area - 1));
  });
  check("the mouth tiling survives the profile", mouthWorst, 0, 1e-9);

  const bad = solids.filter((sd) => !sd.manifold.ok);
  checkTrue("every duct mesh is still closed and consistently wound", bad.length === 0,
    `${solids.length} ducts, ${solids[0].manifold.edges} edges each, 0 unpaired`);
  checkTrue("every end cap still fans from a point its outline can see",
    solids.every((sd) => M.fanIsValid(sd.sections[0].pts).ok &&
      M.fanIsValid(sd.sections[sd.sections.length - 1].pts).ok),
    "no folded caps");

  // the volume-vs-axial identity, re-established on the scaled sections
  let vWorst = 0;
  for (const cellRec of th.cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    const sd = solids.find((x) => x.id === cellRec.id);
    let V = 0;
    for (let q = 1; q < sd.sections.length; q++) {
      const a = sd.sections[q - 1].origin, b = sd.sections[q].origin;
      const scale = (k) => row.sched[k].axial / row.sched[k].area;
      V += 0.5 * (sd.sections[q].area * scale(q) + sd.sections[q - 1].area * scale(q - 1))
         * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    vWorst = Math.max(vWorst, Math.abs(sd.volume - V) / V);
  }
  checkTrue("mesh volume still agrees with the integrated AXIAL schedule", vWorst < 0.01,
    `worst ${(vWorst * 100).toFixed(3)}% over ${ST} stations`);

  // the gaps are real material, so the ducts must together hold LESS than they
  // did tiling — that volume is exactly what opened the space between them
  const vProf = solids.reduce((a, sd) => a + sd.volume, 0);
  const vPlain = M.ductSolids(th, plain, { t, dividerEndFrac: DEF })
    .reduce((a, sd) => a + sd.volume, 0);
  checkTrue("the profile removes duct volume — that is the gap it opened",
    vProf < vPlain && vProf > 0.5 * vPlain,
    `${(vPlain / 1000).toFixed(0)} -> ${(vProf / 1000).toFixed(0)} cm3, ${((1 - vProf / vPlain) * 100).toFixed(0)}% removed`);

  const stl = M.buildSTL(solids);
  const facets = new DataView(stl).getUint32(80, true);
  const want = solids.reduce((a, sd) => a + sd.tris.length, 0);
  checkTrue("the profiled solids still export a well-formed binary STL",
    facets === want && stl.byteLength === 84 + want * 50,
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
