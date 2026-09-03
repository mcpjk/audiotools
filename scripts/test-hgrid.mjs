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
      flatten: 1, exitHalfAngle: 8, tight: 0.55, fTarget: 20000,
      stations: ST, keepGeometry: true, divergeLen: dl,
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
    flatten: 1, exitHalfAngle: 8, tight: 0.55, fTarget: 20000,
    stations: ST, keepGeometry: true,
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
  const ST = 16;
  for (const t of [0.4, 0.8]) {
    const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
    const base = {
      c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
      tight: 0.55, fTarget: 20000, stations: ST, keepGeometry: true,
      t, profileT: 0.3, mouthMode: "arc", thetaH: 90, thetaV: 40,
    };
    const gross = M.mapThroatToMouth(Lay.throat, { ...base, profileArea: "gross" });
    const open = M.mapThroatToMouth(Lay.throat, { ...base, profileArea: "open" });

    // THE LAW MUST HOLD ON THE OPEN AREA, station by station, computed here
    // from the inset polygons rather than read back off the model
    let worst = 0, endK = 0;
    for (const r of open.rows) {
      const cell = Lay.throat.cells.find((x) => x.id === r.id);
      const rim = cell.rimSide || [false, false, false, false];
      const dAt = (u) => rim.map((isRim) => (isRim ? 0 : (t / 2) * (1 - u)));
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
    tight: 0.55, fTarget: 20000, stations: ST, keepGeometry: true,
    t: 0, profileT: 0.3, mouthMode: "arc", thetaH: 90, thetaV: 40,
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
  const ST = 16, t = 0.4, depth = 200;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const rad = Math.PI / 180;

  // ── IT GENERALISES THE SPHERE, IT DOES NOT REPLACE IT ───────────────────
  // With rH = rV the swept-arc surface must reproduce the old cap about an
  // apex exactly, or the earlier arc-mode results would not carry over.
  const rSph = 305.6, TH = 90, TV = 40;
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8, tight: 0.55, fTarget: 20000,
    stations: ST, keepGeometry: true, t, profileT: 0.3,
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
    flatten: 1, exitHalfAngle: 8, fTarget: 20000, stations: 16,
    keepGeometry: true,
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
    fTarget: 20000, stations: ST, keepGeometry: true,
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
    fTarget: 20000, stations: 16, tight: 0.55,
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
    fTarget: 20000, stations: 16, tight: 0.55,
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
    t: 0, fTarget: 20000, stations: 16, profileT: null,
    sectionMode: "swept", keepGeometry: false, computeClearance: false,
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
    t: 0.4, profileArea: "open", fTarget: 20000,
    stations: 16, profileT: 0.7, sectionMode: "swept",
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

  // ── THE SYMMETRIC BOW DIRECTION ─────────────────────────────────────────
  // One world axis bows every duct the same way, which breaks the mirror the
  // layout has on that axis. "radial" gives each duct the outward ray from
  // the horn axis, so mirrored cells get mirrored bows and BOTH mirrors
  // survive. Measured on the centrelines, which is where a bow shows.
  const mirrorErr = (m) => {
    const byIdx = new Map(m.rows.map((r) => [`${r.i},${r.j}`, r]));
    let mx = 0, my = 0;
    m.rows.forEach((r) => {
      const rx = byIdx.get(`${5 - r.i},${r.j}`), ry = byIdx.get(`${r.i},${2 - r.j}`);
      r.sched.forEach((st, q) => {
        const p = st.origin, a = rx.sched[q].origin, b = ry.sched[q].origin;
        mx = Math.max(mx, Math.hypot(p[0] + a[0], p[1] - a[1], p[2] - a[2]));
        my = Math.max(my, Math.hypot(p[0] - b[0], p[1] + b[1], p[2] - b[2]));
      });
    });
    return { mx, my };
  };
  const curBow = (dir) => M.mapThroatToMouth(Lay.throat, {
    ...curOpts, keepGeometry: true, lengthen: { lobes: 2, dir },
  });
  const bowY = curBow("y"), bowR = curBow("radial");
  const eY = mirrorErr(bowY), eR = mirrorErr(bowR);
  checkTrue("a single-axis bow keeps the mirror it lies across and breaks the other",
    eY.mx < 1e-6 && eY.my > 1,
    `x-mirror ${eY.mx.toExponential(1)} mm, y-mirror ${eY.my.toFixed(1)} mm`);
  check("radial bows keep the x mirror", eR.mx, 0, 1e-6, "mm");
  check("radial bows keep the y mirror too — both, which is the point", eR.my, 0, 1e-6, "mm");
  checkTrue("and it still closes dL",
    bowR.dL < 0.02, `${bowR.dL.toFixed(4)} mm`);
  // on this geometry the symmetric field also happens to cost LESS clearance,
  // because neighbours fan apart instead of all leaning the same way
  const cY = M.ductClearance(bowY.rows), cR = M.ductClearance(bowR.rows);
  checkTrue("on a curved mouth the radial field costs less overlap than one axis",
    cR.overlap < cY.overlap,
    `radial ${cR.overlap.toFixed(2)} mm against +y ${cY.overlap.toFixed(2)} mm`);

  // ── THE BOW REGION, AND THE STRAIGHT RUNS ───────────────────────────────
  // The window spans [uStart, uEnd] of the arc length, with the straight runs
  // cut out of it per cell. sin^2 has zero value AND zero slope at both ends
  // of its support, so everything outside the support is untouched.
  const runOpts = { ...curOpts, keepGeometry: true, divergeLen: 12, arriveLen: 40, samples: 128, stations: 64 };
  // how far the last `len` mm of a centreline departs from its own chord
  const runBend = (m, len) => {
    let worst = 0;
    m.rows.forEach((r) => {
      const P = r.sched.map((x) => x.origin);
      const sA = [0];
      for (let q = 1; q < P.length; q++)
        sA.push(sA[q - 1] + Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1], P[q][2] - P[q - 1][2]));
      const L = sA[sA.length - 1];
      const seg = P.filter((_, q) => sA[q] >= L - len - 1e-9);
      if (seg.length < 3) return;
      const A = seg[0], B = seg[seg.length - 1];
      const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dl = Math.hypot(...d);
      for (const q of seg) {
        const v = [q[0] - A[0], q[1] - A[1], q[2] - A[2]];
        const t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / (dl * dl);
        worst = Math.max(worst, Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]));
      }
    });
    return worst;
  };
  const runsBowed = M.mapThroatToMouth(Lay.throat, { ...runOpts, lengthen: { lobes: 2, dir: "radial" } });
  check("an arrival run the user asked to be STRAIGHT is left straight by the bow",
    runBend(runsBowed, 40), 0, 1e-6, "mm");
  checkTrue("...and the bow still closed dL, using only the region left to it",
    runsBowed.dL < 0.05 && runsBowed.lengthen.ampMax > 1,
    `dL ${runsBowed.dL.toFixed(4)} mm at ${runsBowed.lengthen.ampMax.toFixed(1)} mm amplitude`);

  // narrowing the region: amplitude goes as sqrt(span), so a TIGHTER window
  // is a SMALLER bow — the opposite of the intuition, and it is why placing
  // the bend is not simply a cost
  const spanCase = (u0, u1) => M.mapThroatToMouth(Lay.throat, {
    ...curOpts, keepGeometry: true, lengthen: { lobes: 2, dir: "radial", uStart: u0, uEnd: u1 },
  });
  const wide = spanCase(0, 1), tight = spanCase(0, 0.35);
  checkTrue("a narrower bow region needs LESS amplitude, as sqrt(span) says",
    tight.lengthen.ampMax < wide.lengthen.ampMax && tight.dL < 0.05,
    `${wide.lengthen.ampMax.toFixed(1)} mm over [0,1] against ${tight.lengthen.ampMax.toFixed(1)} mm over [0,0.35]`);
  // and everything outside the support is untouched, to machine precision
  const bare = M.mapThroatToMouth(Lay.throat, { ...curOpts, keepGeometry: true });
  let outside = 0;
  tight.rows.forEach((r, k) => {
    const P = r.sched.map((x) => x.origin), Q = bare.rows[k].sched.map((x) => x.origin);
    for (let q = Math.ceil(0.45 * (P.length - 1)); q < P.length; q++)
      outside = Math.max(outside, Math.hypot(P[q][0] - Q[q][0], P[q][1] - Q[q][1], P[q][2] - Q[q][2]));
  });
  check("the path beyond the bow region is untouched", outside, 0, 1e-9, "mm");

  // ── BENDING ACROSS THE SHORT AXIS IS THE CHEAPER TURN ────────────────────
  // A duct of width w turning through th puts w * th more length on its outer
  // wall than its inner one. w is the extent along the BEND NORMAL, so
  // bending across the section's short dimension costs less — measured, not
  // assumed, and the reason the "short" direction exists.
  const bowRad = M.mapThroatToMouth(Lay.throat, { ...curOpts, keepGeometry: true, lengthen: { lobes: 1, dir: "radial" } });
  const bowShort = M.mapThroatToMouth(Lay.throat, { ...curOpts, keepGeometry: true, lengthen: { lobes: 1, dir: "short" } });
  checkTrue("the short axis is the cheaper turn: less outer-wall widening for the same dL",
    bowShort.bendWidenMax < bowRad.bendWidenMax && bowShort.dL < 0.05,
    `${bowShort.bendWidenMax.toFixed(1)} mm against radial's ${bowRad.bendWidenMax.toFixed(1)} mm`);
  const eS = mirrorErr(bowShort);
  checkTrue("and it is mirror-covariant too — both mirrors survive it",
    eS.mx < 1e-6 && eS.my < 1e-6,
    `x ${eS.mx.toExponential(1)} mm, y ${eS.my.toExponential(1)} mm`);

  // ── THE MEASURED WALL SPREAD, AND WHY IT OVERRULES THE INTEGRAL ─────────
  // bendWiden integrates |w dtheta| and so charges for every turn. A
  // reversing bend does not cost that: a wall fibre short through the first
  // half runs long through the second and the error cancels. wallSpread
  // measures the fibres instead, and the two RANK THE LOBE COUNT OPPOSITE
  // WAYS — which is the whole reason the measured one is the objective.
  const lobeCase = (n) => M.mapThroatToMouth(Lay.throat, {
    ...curOpts, keepGeometry: true, lengthen: { lobes: n, dir: "radial" },
  });
  const l1 = lobeCase(1), l2 = lobeCase(2), l3 = lobeCase(3);
  checkTrue("more lobes REDUCE the measured wall spread — reversals cancel",
    l2.wallSpreadMax < l1.wallSpreadMax / 2 && l3.wallSpreadMax < l2.wallSpreadMax,
    `${l1.wallSpreadMax.toFixed(1)} -> ${l2.wallSpreadMax.toFixed(1)} -> ${l3.wallSpreadMax.toFixed(1)} mm at 1/2/3 lobes`);
  checkTrue("...while the integrated estimate ranks them the other way, and is wrong to",
    l1.bendWidenMax < l2.bendWidenMax,
    `bendWiden ${l1.bendWidenMax.toFixed(1)} at 1 lobe against ${l2.bendWidenMax.toFixed(1)} at 2`);
  checkTrue("amplitude still falls as 1/lobes, so clearance improves in the same move",
    l2.lengthen.ampMax < l1.lengthen.ampMax / 2,
    `${l1.lengthen.ampMax.toFixed(1)} -> ${l2.lengthen.ampMax.toFixed(1)} mm`);
  // the window never changes sign, so a bow is one-sided: n lobes is n humps
  // on the SAME side, not a sine wave
  checkTrue("the sin^2 window is one-sided — n lobes is n humps, not an S",
    Array.from({ length: 401 }, (_, i) => Math.sin(2 * Math.PI * (i / 400)) ** 2).every((w) => w >= 0),
    "min window value is 0");

  // ── THE BOW SOLVER ──────────────────────────────────────────────────────
  const bowSolved = M.solveBow(Lay.throat, { ...curOpts, keepGeometry: true }, { overlapMax: 2.0 });
  checkTrue("solveBow enumerates the trade and returns a candidate inside the overlap floor",
    bowSolved.ok && bowSolved.best.overlap <= 2.0 && bowSolved.considered >= 12,
    `${bowSolved.considered} considered, best ${bowSolved.best.dir}/${bowSolved.best.lobes} lobe/[${bowSolved.best.uStart},${bowSolved.best.uEnd}] at wall spread ${bowSolved.best.wallSpread.toFixed(2)} mm, overlap ${bowSolved.best.overlap.toFixed(2)} mm`);
  checkTrue("...and its winner is no worse than hand-dialling the default",
    bowSolved.best.wallSpread <= l2.wallSpreadMax + 1e-9,
    `solved ${bowSolved.best.wallSpread.toFixed(2)} mm against the 2-lobe radial default's ${l2.wallSpreadMax.toFixed(2)} mm`);
  checkTrue("a floor no candidate can meet is reported, not quietly relaxed",
    !M.solveBow(Lay.throat, { ...curOpts, keepGeometry: true }, { overlapMax: 1e-6 }).ok,
    "an unreachable overlap floor returns ok: false with a reason");

  // a duct ON the axis has no radial direction, and no lateral bow can be
  // symmetric for it: left unbowed and REPORTED, never quietly skewed
  const odd = M.buildLayout({ family: "hgrid", R, nc: 5, nr: 3, m: 2, t: 0.4, c });
  const oddMap = M.mapThroatToMouth(odd.throat, {
    ...curOpts, nc: 5, nr: 3, arcH: 480, arcV: (480 * 40) / 90, depth: 300,
    lengthen: { lobes: 2, dir: "radial" },
  });
  checkTrue("a duct on the axis is reported, not bowed in an arbitrary direction",
    oddMap.lengthen.onAxis === 1 && oddMap.lengthen.shortfall > 1,
    `${oddMap.lengthen.onAxis} on-axis duct, ${oddMap.lengthen.shortfall.toFixed(1)} mm left short`);
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
  const t = 0.4;
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
      tight: 0.55, fTarget: 20000, keepGeometry: true,
      t, stations: ST, profileT: 0.3, ...mo });
    const solids = M.ductSolids(Lay.throat, map, { t });
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
  const ST = 16, t = 0.4;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const common = {
    c, nc: 6, nr: 3, R, rectangular: true, apex: 120, depth: 150, exitHalfAngle: 8,
    tight: 0.55, fTarget: 20000, stations: ST, keepGeometry: true,
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
  const solids = M.ductSolids(Lay.throat, sw, { t });
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
  const t = 0.4, ST = 16;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = L.throat;
  const map = M.mapThroatToMouth(th, {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120,
    depth: 150, flatten: 1, stations: ST, keepGeometry: true,
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

  const solids = M.ductSolids(th, map, { t });
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

  // The inset tapers linearly from a full half-thickness at the throat, where
  // the cells genuinely tile, to nothing at the mouth, where they tile again
  // and must NOT be inset or the mouth stops tiling. There is no adjustable
  // divider-end station any more: the ducts are pulled apart in between by
  // the profile, so there was no shared wall there for one to describe.
  const r0 = map.rows[0];
  const sec0 = M.ductSections(th.cells[0], r0, { t });
  check("the inset is gone at the mouth, so the mouth still tiles",
    sec0[ST].area - r0.sched[ST].area, 0, 1e-9, "mm2");
  checkTrue("...and is biting at full depth at the throat",
    r0.sched[0].area - sec0[0].area > 0.5 * t, `${(r0.sched[0].area - sec0[0].area).toFixed(3)} mm2`);
  // The inset DEPTH falls linearly, but the area it removes does NOT fall
  // monotonically — the section is expanding, so a shallower inset on a
  // longer perimeter can take more area. What must hold is that the inset
  // bites at every station except the last, and vanishes exactly there.
  checkTrue("...and bites at every station up to the mouth, vanishing only there",
    sec0.slice(0, ST).every((sc, q) => r0.sched[q].area - sc.area > 1e-9) &&
      Math.abs(sec0[ST].area - r0.sched[ST].area) < 1e-9,
    `${(r0.sched[0].area - sec0[0].area).toFixed(3)} mm2 at the throat, 0 at the mouth`);

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
  const t = 0.4, ST = 16, PT = 0;
  const L = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = L.throat;
  const mopt = {
    c, nc: 6, nr: 3, R, rectangular: true, mouthW: 200, mouthH: 100, apex: 120,
    depth: 150, flatten: 1, stations: ST, keepGeometry: true,
  };
  const plain = M.mapThroatToMouth(th, { ...mopt, profileT: null });
  const map = M.mapThroatToMouth(th, { ...mopt, profileT: PT });
  checkTrue("the profile stays inside the tiling configuration at this T",
    map.profScaleMax <= 1 + 1e-9, `kMax = ${map.profScaleMax.toFixed(6)}`);

  const solids = M.ductSolids(th, map, { t });
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
  const vPlain = M.ductSolids(th, plain, { t })
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

head("STEP export (AP214 B-spline solids)");
{
  // ── the closed forms first ────────────────────────────────────────────────
  // A straight square tube: linear data, so the cubic interpolant must
  // reproduce it EXACTLY, and the volume is a product. This catches basis,
  // collocation, LU and orientation errors with no geometry in the way.
  const n4 = 4, S4 = 9;
  const tube = [];
  for (let q = 0; q < S4; q++) {
    const z = q * 10, pts = [];
    const cs = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    for (let s = 0; s < 4; s++) {
      const A = cs[s], B = cs[(s + 1) % 4];
      for (let i = 0; i < n4; i++) pts.push([A[0] + (B[0] - A[0]) * (i / n4), A[1] + (B[1] - A[1]) * (i / n4), z]);
    }
    tube.push({ pts });
  }
  const tb = M.ductBrep(tube);
  check("straight tube: surface through every sample", M.brepResidual(tb, tube), 0, 1e-9, "mm");
  check("straight tube: exact 20x20x80 volume", M.brepVolume(tb, tube), 32000, 1e-6, "mm3");

  // ── the real geometry, and the file it emits ─────────────────────────────
  const t = 0.4, ST = 32;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  const map = M.mapThroatToMouth(th, {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    sectionMode: "swept", stations: ST, depth: 150, profileT: 0.7,
    keepGeometry: true, computeClearance: false,
  });
  const out = M.buildSTEP(th, map, { t, name: "test" });
  checkTrue("one B-rep solid per duct", out.checks.ducts === 18, `${out.checks.ducts} ducts`);
  check("wall surfaces pass through every sampled ring point", out.checks.residual, 0, 1e-9, "mm");
  checkTrue("every edge is used exactly twice, opposite senses", out.checks.edgePairing, "12 edges x 18 ducts");
  check("the throat cap is exactly planar in z = 0", out.checks.capPlanarZ, 0, 1e-9, "mm");
  const integ = M.stepIntegrity(out.text);
  checkTrue("every referenced entity is defined", integ.ok,
    `${integ.entities} entities, ${integ.refs} references, ${integ.missing} missing`);
  checkTrue("18 solids in one AP214 representation",
    (out.text.match(/MANIFOLD_SOLID_BREP/g) || []).length === 18
    && (out.text.match(/ADVANCED_BREP_SHAPE_REPRESENTATION/g) || []).length === 1
    && out.text.includes("AUTOMOTIVE_DESIGN"), "");
  // STEP grammar requires reals to carry a decimal point — "1" is an
  // integer, "1." is a real, and strict parsers reject the wrong one.
  let badReals = 0, nPts = 0;
  for (const m2 of out.text.matchAll(/CARTESIAN_POINT\('',\(([^)]*)\)\)/g)) {
    nPts++;
    for (const v of m2[1].split(","))
      if (!/\./.test(v)) badReals++;
  }
  checkTrue("every coordinate is written as a STEP real", badReals === 0 && nPts > 1000,
    `${nPts} points, ${badReals} bare integers`);

  // ── seams: shared by identity, so they must measure EXACTLY zero ─────────
  const cell = th.cells[7];
  const row = map.rows.find((r) => r.id === cell.id);
  const secs = M.ductSections(cell, row, { t });
  const brep = M.ductBrep(secs);
  let seamWall = 0, seamCap = 0;
  for (let s = 0; s < 4; s++)
    for (let q = 0; q <= 16; q++) {
      const P = M.evalBsplineSurf(brep.walls[s], brep.uKnots, brep.vKnots, 1, q / 16);
      const Q = M.evalBsplineSurf(brep.walls[(s + 1) % 4], brep.uKnots, brep.vKnots, 0, q / 16);
      seamWall = Math.max(seamWall, Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]));
    }
  // cap boundaries against the wall end curves: cap u runs along side 0, cap
  // v along side 1; sides 2 and 3 appear reversed, which the loop handles
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const pairs = [
      [M.evalBsplineSurf(brep.walls[0], brep.uKnots, brep.vKnots, u, 0),
       M.evalBsplineSurf(brep.capThroat, brep.uKnots, brep.uKnots, u, 0)],
      [M.evalBsplineSurf(brep.walls[1], brep.uKnots, brep.vKnots, u, 0),
       M.evalBsplineSurf(brep.capThroat, brep.uKnots, brep.uKnots, 1, u)],
      [M.evalBsplineSurf(brep.walls[2], brep.uKnots, brep.vKnots, u, 1),
       M.evalBsplineSurf(brep.capMouth, brep.uKnots, brep.uKnots, 1 - u, 1)],
      [M.evalBsplineSurf(brep.walls[3], brep.uKnots, brep.vKnots, u, 1),
       M.evalBsplineSurf(brep.capMouth, brep.uKnots, brep.uKnots, 0, 1 - u)],
    ];
    for (const [P, Q] of pairs)
      seamCap = Math.max(seamCap, Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]));
  }
  check("wall-to-wall seams", seamWall, 0, 1e-9, "mm");
  check("cap-to-wall seams", seamCap, 0, 1e-9, "mm");

  // ── volume, with the cap ambiguity separated out ─────────────────────────
  // The mouth ring lies on the curved aperture, so the surface that spans it
  // is a CHOICE and the enclosed volume moves with the choice. Closing the
  // B-rep walls with the SAME centroid fans ductMesh uses removes that
  // freedom: then the walls are the only thing that differs, and the two
  // constructions must agree to chord error. The Coons-capped volume — the
  // solid as actually emitted — differs from the fan-capped one by exactly
  // the two cap fills, and that difference must stay cap-sized: bounded by
  // mouth ring area x the ring's own spread along its normal.
  let worstWalls = 0, worstCapExcess = 0;
  for (const cc of th.cells) {
    const r2 = map.rows.find((x) => x.id === cc.id);
    const sc = M.ductSections(cc, r2, { t });
    const br = M.ductBrep(sc);
    const dm = M.ductMesh(sc);
    const vMesh = Math.abs(M.meshVolume(dm.verts, dm.tris));
    const vFan = M.brepVolume(br, sc, 16, 64, "fan");
    const vCoons = M.brepVolume(br, sc, 16, 64, "coons");
    worstWalls = Math.max(worstWalls, Math.abs(vFan - vMesh) / vMesh);
    // the ring's spread along its own mean normal bounds any fill's reach
    const ring = sc[sc.length - 1].pts;
    const ctr = [0, 0, 0];
    for (const p of ring) { ctr[0] += p[0] / ring.length; ctr[1] += p[1] / ring.length; ctr[2] += p[2] / ring.length; }
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < ring.length; k++) {
      const A = ring[k], B = ring[(k + 1) % ring.length];
      ax += (A[1] - ctr[1]) * (B[2] - ctr[2]) - (A[2] - ctr[2]) * (B[1] - ctr[1]);
      ay += (A[2] - ctr[2]) * (B[0] - ctr[0]) - (A[0] - ctr[0]) * (B[2] - ctr[2]);
      az += (A[0] - ctr[0]) * (B[1] - ctr[1]) - (A[1] - ctr[1]) * (B[0] - ctr[0]);
    }
    const nl = Math.hypot(ax, ay, az) || 1;
    let lo = Infinity, hi = -Infinity;
    for (const p of ring) {
      const d = (p[0] * ax + p[1] * ay + p[2] * az) / nl;
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    const bound = M.polyArea3(ring) * (hi - lo);
    const excess = Math.abs(vCoons - vFan) / Math.max(bound, 1e-9);
    worstCapExcess = Math.max(worstCapExcess, excess);
  }
  checkTrue("fan-capped B-rep volume matches the mesh volume", worstWalls < 2e-3,
    `worst ${(worstWalls * 100).toFixed(4)}% across 18 ducts — walls are the same geometry`);
  checkTrue("Coons-vs-fan difference stays cap-sized", worstCapExcess < 1,
    `worst ${(worstCapExcess * 100).toFixed(1)}% of the ring-spread bound`);
}

head("Coped joints (mouth-tile bulge)");
{
  const t = 0.4, ST = 32;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  const base = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    sectionMode: "swept", stations: ST, depth: 320, profileT: 0.7,
    keepGeometry: true, computeClearance: false,
  };
  const m0 = M.mapThroatToMouth(th, base);
  const m5 = M.mapThroatToMouth(th, { ...base, bulge: { amp: 5 } });

  // the union identity: interior-edge symmetric bulges trade area pairwise,
  // so the aperture total must not move at all
  check("the union of bulged tiles IS the tiled aperture",
    Math.abs(m5.mouthAreaTotal - m0.mouthAreaTotal) / m0.mouthAreaTotal, 0, 1e-9);
  checkTrue("the per-cell sum double-counts the joints",
    m5.mouthAreaSum > m5.mouthAreaTotal && m5.bulge.doubleCountPct > 5,
    `${m5.bulge.doubleCountPct.toFixed(2)}% of the sum is double-counted at 5 mm`);

  // both invariants the construction promised
  let cworst = 0, tworst = 0;
  for (const r5 of m5.rows) {
    const r0 = m0.rows.find((x) => x.id === r5.id);
    for (const k of [0, 16, 32, 48])
      cworst = Math.max(cworst, Math.hypot(...r5.sched[ST].pts[k].map((v, i) => v - r0.sched[ST].pts[k][i])));
    for (let k = 0; k < 64; k++)
      tworst = Math.max(tworst, Math.hypot(...r5.sched[0].pts[k].map((v, i) => v - r0.sched[0].pts[k][i])));
  }
  check("mouth-ring corners do not move (corner maps to corner)", cworst, 0, 1e-9, "mm");
  check("the throat ring is untouched", tworst, 0, 1e-12, "mm");

  // symmetric exchange needs symmetric lobes
  const A5 = (i, j) => m5.rows.find((r) => r.i === i && r.j === j).mouthArea;
  checkTrue("bulged areas keep both mirrors",
    Math.abs(A5(0, 0) - A5(5, 0)) < 1e-8 && Math.abs(A5(0, 0) - A5(0, 2)) < 1e-8,
    `x ${Math.abs(A5(0, 0) - A5(5, 0)).toExponential(1)}, y ${Math.abs(A5(0, 0) - A5(0, 2)).toExponential(1)} mm2`);

  // a sine lobe of amplitude a over an edge of length E carries (2/pi) a E;
  // an interior cell bulges all four edges
  const rc = m5.rows.find((r) => r.i === 2 && r.j === 1);
  const excess = rc.mouthArea - rc.mouthAreaTiled;
  const expect = (2 / Math.PI) * 5 * (2 * (m5.mouthWEff / 6) + 2 * (m5.mouthHEff / 3));
  checkTrue("interior-cell excess matches the sine-lobe closed form",
    excess / expect > 0.9 && excess / expect < 1.15,
    `${excess.toFixed(1)} mm2 against ${expect.toFixed(1)} predicted (${(excess / expect).toFixed(3)}x)`);

  // the law lands on the bulged outline: re-derive fc from the MEASURED
  // rings — throat open area by insetting the throat ring t/2 per shared
  // side, mouth area from the bulged mouth ring — through the closed-form
  // solver, independently of the profile's own bookkeeping. (Not the
  // layout's 2-D open area: the law is written on the sampled ring, and the
  // two open-area evaluations differ at discretisation level.)
  const rim = th.cells.find((cc) => cc.id === rc.id).rimSide || [false, false, false, false];
  const A0 = M.polyArea3(M.insetSection3(rc.sched[0].pts, rim.map((isRim) => (isRim ? 0 : t / 2))));
  const AL = M.polyArea3(rc.sched[ST].pts);
  const fcRe = M.fcForHypexM(M.solveHypexM(Math.sqrt(AL / A0), rc.Lpath, 0.7), c);
  check("k = 1 still lands on the (bulged) mouth: fc re-derives", fcRe, rc.profFc, rc.profFc * 1e-6, "Hz");
  // and fc must RISE: same throat, bigger per-cell mouth, same length
  const shift = m5.profFcMin / m0.profFcMin - 1;
  const beta = m5.bulge.doubleCountPct / 100;
  const rho = Math.sqrt(m0.mouthAreaTotal / th.openTotal);
  const est = Math.log(1 + beta) / (2 * Math.log(rho));
  checkTrue("fc rises by about beta / (2 ln rho)",
    shift > 0 && shift / est > 0.5 && shift / est < 2,
    `${(shift * 100).toFixed(2)}% measured against ${(est * 100).toFixed(2)}% estimated`);

  // joint-aware clearance: exact reduction without a bulge, engagement with
  const cl0 = M.ductClearance(m0.rows);
  const cl0j = M.ductClearance(m0.rows, { jointAware: true });
  checkTrue("without a bulge, joint-aware clearance reduces exactly",
    Math.abs(cl0.overlap - cl0j.overlap) < 1e-12 && Math.abs(cl0.minMid - cl0j.minMid) < 1e-12
    && cl0j.joint.engaged === 0, "");
  const cl5 = M.ductClearance(m5.rows, { jointAware: true });
  const cl5raw = M.ductClearance(m5.rows);
  checkTrue("5 mm of bulge engages every interior pair",
    cl5.joint.engaged === cl5.joint.pairs && cl5.joint.knifeMax < ST,
    `${cl5.joint.engaged}/${cl5.joint.pairs} at stations ${cl5.joint.knifeMin}-${cl5.joint.knifeMax} of ${ST}, ${cl5.joint.engageMax.toFixed(1)} mm deep`);
  checkTrue("the joint is engagement, not defect: defect overlap stays put",
    Math.abs(cl5.overlap - cl0.overlap) < 0.5 && cl5raw.overlap > cl5.overlap + 1,
    `defect ${cl5.overlap.toFixed(2)} vs ${cl0.overlap.toFixed(2)} unbulged; raw would read ${cl5raw.overlap.toFixed(2)}`);

  // flow mode: a shared boundary point cannot take two bulged targets
  const f0 = M.mapThroatToMouth(th, { ...base, sectionMode: "flow" });
  const f5 = M.mapThroatToMouth(th, { ...base, sectionMode: "flow", bulge: { amp: 5 } });
  checkTrue("flow mode ignores the bulge entirely",
    f5.bulge === null && Math.abs(f5.mouthAreaSum - f0.mouthAreaSum) < 1e-9
    && Math.abs(f5.dL - f0.dL) < 1e-12, "");

  // the exports must survive: corners survive, so the 4-side ring structure
  // and the curved-box STEP topology survive with them
  const solids = M.ductSolids(th, m5, { t });
  checkTrue("bulged ducts still mesh manifold", solids.every((sd) => sd.manifold.ok),
    `${solids.length} ducts`);
  const step5 = M.buildSTEP(th, m5, { t, name: "bulged" });
  const integ5 = M.stepIntegrity(step5.text);
  checkTrue("bulged ducts still export valid STEP",
    step5.checks.residual < 1e-9 && step5.checks.edgePairing && integ5.ok,
    `residual ${step5.checks.residual.toExponential(1)} mm, ${integ5.entities} entities`);
}

head("Throat knife edge (the defect metric's other boundary)");
{
  const t = 0.4;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  // the 2026-09-01 defaults, where the near-throat contact is a knife edge
  const dflt = (o = {}) => ({
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 16.55,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 0, arcH: 560, arcV: 250,
    sectionMode: "swept", stations: 24, depth: 300, profileT: 0.7,
    keepGeometry: true, computeClearance: false, ...o,
  });

  // 1. INERT BY DEFAULT. The rule may not move a single existing number
  //    unless it is asked for — every other clearance test in this file is
  //    written against the form with no throat boundary at all.
  const mD = M.mapThroatToMouth(th, dflt());
  const off = M.ductClearance(mD.rows), zero = M.ductClearance(mD.rows, { throatFloor: 0 });
  checkTrue("throatFloor 0 reproduces the boundary-less form exactly",
    ["minMid", "minMidAt", "min", "minAt", "overlap", "overlapStations", "max", "maxAt"]
      .every((k) => Object.is(off[k], zero[k]))
    && off.perStationDefect.every((x, i) => Object.is(x, zero.perStationDefect[i]))
    && off.pairWorst.every((x, i) => x.gap === zero.pairWorst[i].gap && x.at === zero.pairWorst[i].at)
    && zero.throat === null,
    "every statistic and the whole per-station profile identical");

  // 2. IT MOVES THE BOUNDARY OFF THE KNIFE EDGE. At these defaults the worst
  //    "defect" is the throat tiling one station in — measured -0.002 mm at
  //    station 1 of 24 — and the ducts have simply had no path length to
  //    open yet. With the floor as the boundary the metric starts where they
  //    have separated.
  const on = M.ductClearance(mD.rows, { throatFloor: 0.5 });
  checkTrue("the throat knife edge stops being read as a defect",
    off.minMid < 0 && off.minMidAt === 1 && on.minMid >= 0.5 && on.minMidAt > off.minMidAt,
    `minMid ${off.minMid.toFixed(3)} at station ${off.minMidAt} -> ${on.minMid.toFixed(3)} at ${on.minMidAt}`);
  checkTrue("...and reports the run and its deepest contact rather than hiding them",
    on.throat.runs > 0 && on.throat.knifeMax >= 1 && Math.abs(on.throat.worst - Math.abs(off.minMid)) < 1e-9,
    `run to station ${on.throat.knifeMin}-${on.throat.knifeMax} on ${on.throat.runs}/${on.throat.pairs} pairs, ${on.throat.worst.toFixed(4)} mm deep inside it`);

  // 3. THE NEGATIVE HALF OF THE BAND IS THE POINT. A literal mirror of the
  //    mouth rule — walk while in contact — would swallow the profile's own
  //    interpenetration, which is the one defect that matters most. The old
  //    defaults at depth 150 dive to -1.5 mm at station 1: that must survive
  //    the rule untouched, at the same depth and the same station.
  const deep = (T) => M.mapThroatToMouth(th, dflt({
    exitHalfAngle: 8, thetaV: 40, arcH: 480, arcV: 213, depth: 150, profileT: T }));
  for (const T of [0.7, 1.0]) {
    const md = deep(T);
    const dOff = M.ductClearance(md.rows), dOn = M.ductClearance(md.rows, { throatFloor: 0.5 });
    checkTrue(`real interpenetration is NOT swallowed at T ${T}`,
      dOff.minMid < -1 && Math.abs(dOn.minMid - dOff.minMid) < 1e-12 && dOn.minMidAt === dOff.minMidAt,
      `${dOff.minMid.toFixed(3)} mm at station ${dOff.minMidAt}, unchanged by the rule`);
  }

  // 4. IT SURVIVES REFINEMENT. The near-throat gap does NOT refine away —
  //    measured -0.002 / -0.122 / -0.241 / -0.122 mm at 24 / 32 / 48 / 64
  //    stations — so a rule keyed to a station COUNT would drift with the
  //    export resolution. Keyed to the floor, the answer holds.
  const post = [24, 32, 48, 64].map((stations) => {
    const m = M.mapThroatToMouth(th, dflt({ stations }));
    return { stations, off: M.ductClearance(m.rows), on: M.ductClearance(m.rows, { throatFloor: 0.5 }) };
  });
  checkTrue("the boundary holds under refinement, where a station count would not",
    post.every((r) => r.off.minMid < 0 && r.on.minMid >= 0.5)
    && Math.max(...post.map((r) => r.on.minMid)) - Math.min(...post.map((r) => r.on.minMid)) < 0.05,
    post.map((r) => `${r.stations}: ${r.off.minMid.toFixed(3)} -> ${r.on.minMid.toFixed(3)}`).join(", "));

  // 5. A FLOOR THE HORN NEVER REACHES MUST NOT PASS VACUOUSLY. If the run
  //    were allowed to eat every interior station the defect set would be
  //    empty and the worst gap would come back Infinity — a floor of 40 mm
  //    would then read as "clear".
  const huge = M.ductClearance(mD.rows, { throatFloor: 40 });
  checkTrue("an unreachable floor saturates and reports, it does not pass",
    isFinite(huge.minMid) && huge.throat.saturated === huge.throat.pairs
    && huge.minMid < 40,
    `saturated ${huge.throat.saturated}/${huge.throat.pairs}, best gap ${huge.minMid.toFixed(2)} mm against the 40 mm asked`);

  // 6. THE TWO BOUNDARIES ARE INDEPENDENT and compose: the mouth joint walk
  //    and the throat run must not interfere.
  // on the geometry where engagement is recorded — the flat-mouth default
  // does not engage a 5 mm bulge at all, which is a fact about that mouth
  // and not what this check is for
  const mb = M.mapThroatToMouth(th, dflt({
    thetaV: 40, arcH: 480, arcV: 213, depth: 320, stations: 32, bulge: { amp: 5 } }));
  const both = M.ductClearance(mb.rows, { jointAware: true, throatFloor: 0.5 });
  const jOnly = M.ductClearance(mb.rows, { jointAware: true });
  checkTrue("the mouth joint and the throat run compose without interfering",
    both.joint.engaged === jOnly.joint.engaged
    && Math.abs(both.joint.engageMax - jOnly.joint.engageMax) < 1e-12
    && both.throat.knifeMax < both.joint.knifeMin,
    `throat run to ${both.throat.knifeMax}, joint from ${both.joint.knifeMin}, engagement ${both.joint.engageMax.toFixed(2)} mm unchanged`);
}

head("Duct separation (field and solver)");
{
  const t = 0.4, ST = 24;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  const opts = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    sectionMode: "swept", stations: ST, depth: 320, profileT: 0.7,
    keepGeometry: true, computeClearance: false,
  };
  const m0 = M.mapThroatToMouth(th, opts);
  const cl0 = M.ductClearance(m0.rows, { thinBand: 1.0 });
  checkTrue("the test case genuinely interpenetrates without help",
    cl0.overlap > 1.5, `${cl0.overlap.toFixed(2)} mm at station ${cl0.overlapAt}`);
  checkTrue("the thin-wall band sees slivers on the baseline",
    cl0.thin.count > 0 && cl0.thin.worst > 0 && cl0.thin.worst < 1.0,
    `${cl0.thin.count} pair-stations under 1 mm, worst ${cl0.thin.worst.toFixed(2)} mm`);

  // the field itself: a single explicit displacement, measured
  const one = {};
  const rc = m0.rows.find((r) => r.i === 2 && r.j === 1);
  one[rc.id] = { dx: 0, dy: 1, amp: 5 };
  const m1 = M.mapThroatToMouth(th, { ...opts, separate: { amps: one, uStart: 0.1, uEnd: 0.9, lobes: 1 } });
  const r1 = m1.rows.find((r) => r.id === rc.id);
  let maxDisp = 0;
  for (let q = 0; q <= ST; q++)
    maxDisp = Math.max(maxDisp, Math.hypot(...r1.sched[q].origin.map((v, i) => v - rc.sched[q].origin[i])));
  checkTrue("a 5 mm separation displaces the centreline by about 5 mm",
    maxDisp > 4.5 && maxDisp < 5.5, `${maxDisp.toFixed(2)} mm at peak`);
  let endDrift = 0;
  for (let k = 0; k < 64; k += 4) {
    endDrift = Math.max(endDrift, Math.hypot(...r1.sched[0].pts[k].map((v, i) => v - rc.sched[0].pts[k][i])));
    endDrift = Math.max(endDrift, Math.hypot(...r1.sched[ST].pts[k].map((v, i) => v - rc.sched[ST].pts[k][i])));
  }
  check("both end rings stay pinned under separation", endDrift, 0, 1e-12, "mm");
  checkTrue("only the displaced cell moved", m1.separate.cells === 1, "");

  // the chain-resolved solver on the recorded 2 mm interpenetration
  const n = M.solveSeparation(th, opts, { floor: 0.2, mode: "nudge", maxIter: 20 });
  checkTrue("nudge clears the recorded interpenetration to the floor",
    n.ok && n.gapBefore < -1.5 && n.gapAfter >= 0.15,
    `${n.gapBefore.toFixed(2)} -> ${n.gapAfter.toFixed(2)} mm in ${n.iters} rounds, amp ${n.ampMax.toFixed(1)} mm`);
  const byIJ = {};
  for (const r of m0.rows) byIJ[`${r.i},${r.j}`] = r.id;
  let asym = 0;
  for (const r of m0.rows) {
    const a = n.amps[r.id] ? n.amps[r.id].amp : 0;
    const bx = n.amps[byIJ[`${5 - r.i},${r.j}`]], by = n.amps[byIJ[`${r.i},${2 - r.j}`]];
    asym = Math.max(asym, Math.abs(a - (bx ? bx.amp : 0)), Math.abs(a - (by ? by.amp : 0)));
  }
  check("the solved field keeps both mirrors", asym, 0, 1e-8, "mm");
  // the result must survive an independent rebuild + measurement. The solver
  // measures with the floor as the throat boundary, so the re-measure has to
  // use the same convention — a gap is only a number once you say which
  // stations count. What the re-measure must NOT do is take the solver's
  // word for it, and it does not: this is a fresh build and a fresh measure.
  const sep = { amps: n.amps, uStart: n.uStart, uEnd: n.uEnd, lobes: 1 };
  const mv = M.mapThroatToMouth(th, { ...opts, separate: sep });
  const clv = M.ductClearance(mv.rows, { thinBand: 0.15, throatFloor: 0.2 });
  check("independent re-measure returns the solver's gap", clv.minMid, n.gapAfter, 1e-9, "mm");
  // and the convention must not be hiding anything mid-path: whatever the
  // boundary-less form still calls contact has to sit INSIDE the throat run,
  // not somewhere the ducts have had length to open
  const clvRaw = M.ductClearance(mv.rows);
  checkTrue("the contact the throat rule excludes is at the throat, not mid-path",
    clvRaw.minMid <= clv.minMid + 1e-12
    && (clvRaw.minMid >= 0 || clvRaw.minMidAt <= clv.throat.knifeMax),
    `boundary-less reads ${clvRaw.minMid.toFixed(3)} mm at station ${clvRaw.minMidAt}, throat run ends at ${clv.throat.knifeMax}`);
  checkTrue("the slivers thinner than the floor are gone", clv.thin.count === 0, "");
  // separation composes with length equalisation
  const ml = M.mapThroatToMouth(th, { ...opts, separate: sep, lengthen: { lobes: 1, dir: "radial", uStart: 0, uEnd: 0.5 } });
  checkTrue("lengthening re-equalises the separated paths", ml.dL < 0.05,
    `dL ${ml.dL.toFixed(3)} mm with both fields on`);

  // the cheap mode is honest about its limit on this case
  const u = M.solveSeparation(th, opts, { floor: 0.5, mode: "uniform" });
  checkTrue("uniform reports its best and points at nudge",
    !u.ok && u.gapAfter > u.gapBefore && /nudge/.test(u.reason),
    `best ${u.gapAfter.toFixed(2)} mm at ${u.ampMax.toFixed(1)} mm spread`);

  // and the two features compose: separation under a bulge clears the defect
  // without disturbing a single joint
  const nb = M.solveSeparation(th, { ...opts, bulge: { amp: 5 } }, { floor: 0.2, mode: "nudge", maxIter: 20 });
  const mb = M.mapThroatToMouth(th, { ...opts, bulge: { amp: 5 }, separate: { amps: nb.amps, uStart: nb.uStart, uEnd: nb.uEnd, lobes: 1 } });
  const cb = M.ductClearance(mb.rows, { jointAware: true });
  checkTrue("separation under a bulge keeps every joint engaged",
    cb.joint.engaged === cb.joint.pairs && nb.gapAfter > 0,
    `defect ${nb.gapBefore.toFixed(2)} -> ${nb.gapAfter.toFixed(2)} mm, ${cb.joint.engaged}/${cb.joint.pairs} joints`);
}

head("Horn shell export (blanks + cutters)");
{
  // ── the offset closed forms first ─────────────────────────────────────────
  // Mitred outward offset of a 10 mm square by d: every side line moves out
  // by d and the corners are line intersections, so the result is exactly the
  // (10+2d) square. Interior run points sit on straight (collinear) segments
  // and take the pure-displacement branch; corners take the mitre branch —
  // this exercises both.
  const n4 = 3, sq = [];
  const cs = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
  for (let s = 0; s < 4; s++) {
    const A = cs[s], B = cs[(s + 1) % 4];
    for (let i = 0; i < n4; i++) sq.push([A[0] + (B[0] - A[0]) * (i / n4), A[1] + (B[1] - A[1]) * (i / n4)]);
  }
  const outset = M.insetPolygon(sq, [-1.5, -1.5, -1.5, -1.5]);
  check("mitred outset of a 10 mm square: exact (10+2d)^2", M.polyArea2(outset), 169, 1e-9, "mm2");
  // Offset out then in by the same d puts every side line back where it was,
  // and the vertices are intersections of those same lines — so the round
  // trip is EXACT, not approximate. This is the invertibility the shell
  // construction rests on.
  const back = M.insetPolygon(outset, [1.5, 1.5, 1.5, 1.5]);
  let rt = 0;
  for (let k = 0; k < sq.length; k++) rt = Math.max(rt, Math.hypot(back[k][0] - sq[k][0], back[k][1] - sq[k][1]));
  check("outset then inset round-trips the square exactly", rt, 0, 1e-9, "mm");

  // ── the real geometry ─────────────────────────────────────────────────────
  const t = 0.4, wall = 3, ext = 3, ST = 24;
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  const map = M.mapThroatToMouth(th, {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    sectionMode: "swept", stations: ST, depth: 320, profileT: 0.7,
    keepGeometry: true, computeClearance: false,
  });

  // point-in-polygon in the ring's own best-fit plane, for containment
  const inside2 = (poly, p) => {
    let w = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if (a[1] <= p[1]) { if (b[1] > p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) > 0) w++; }
      else if (b[1] <= p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) < 0) w--;
    }
    return w !== 0;
  };
  const project = (pts) => pts.map((p) => [p[0], p[1]]); // used only at the planar throat

  let capZmax = 0, offErr = 0, containFail = 0, crossFail = 0, blanksBigger = true;
  const ductVols = [], blankVols = [];
  for (const cell of th.cells) {
    const rowR = map.rows.find((r) => r.id === cell.id);
    const duct = M.ductSections(cell, rowR, { t });
    const blank = M.shellSections(cell, rowR, { t, wall });
    // the blank's throat ring stays exactly planar in z = 0
    for (const p of blank[0].pts) capZmax = Math.max(capZmax, Math.abs(p[2]));
    // at the throat every blank segment lies on the offset LINE of its DUCT
    // segment, at exactly `wall` on all four sides — constant, which is what
    // makes the wall the same number wherever it is cut and what removed the
    // mitre EARS the old rim/shared split threw at every cell junction.
    // Line distance, measured at segment midpoints — exact, not approximate.
    const src = duct[0].pts, bl = blank[0].pts;
    const N = src.length;
    for (let k = 0; k < N; k++) {
      const a = src[k], b = src[(k + 1) % N];
      const m = [(bl[k][0] + bl[(k + 1) % N][0]) / 2, (bl[k][1] + bl[(k + 1) % N][1]) / 2];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dist = Math.abs(((b[0] - a[0]) * (m[1] - a[1]) - (m[0] - a[0]) * (b[1] - a[1])) / L);
      offErr = Math.max(offErr, Math.abs(dist - wall));
    }
    // containment and simplicity at every station: each duct point inside its
    // blank ring (tested at the planar throat; elsewhere by area ordering and
    // by the blank ring never self-intersecting)
    for (const p of project(duct[0].pts)) if (!inside2(project(bl), p)) containFail++;
    for (let q = 0; q < duct.length; q++) {
      if (blank[q].area <= duct[q].area) blanksBigger = false;
      const P = blank[q].pts, n = P.length;
      for (let i = 0; i < n; i++)
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          const A = P[i], B = P[(i + 1) % n], Cc = P[j], D = P[(j + 1) % n];
          const d1 = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
          const d2 = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
          const d3 = (D[0] - Cc[0]) * (A[1] - Cc[1]) - (D[1] - Cc[1]) * (A[0] - Cc[0]);
          const d4 = (D[0] - Cc[0]) * (B[1] - Cc[1]) - (D[1] - Cc[1]) * (B[0] - Cc[0]);
          if (d1 * d2 < 0 && d3 * d4 < 0) crossFail++;
        }
    }
    const dmesh = M.ductMesh(duct), bmesh = M.ductMesh(blank);
    ductVols.push(Math.abs(M.meshVolume(dmesh.verts, dmesh.tris)));
    blankVols.push(Math.abs(M.meshVolume(bmesh.verts, bmesh.tris)));
  }
  check("blank throat rings exactly planar in z = 0", capZmax, 0, 1e-9, "mm");
  check("throat outset lands on the offset lines exactly", offErr, 0, 1e-9, "mm");
  checkTrue("every duct point sits inside its blank at the throat", containFail === 0, `${containFail} outside`);
  checkTrue("blank ring area exceeds duct ring area at every station", blanksBigger, "");
  checkTrue("no blank ring self-intersects (x-y projection)", crossFail === 0, `${crossFail} crossings`);
  checkTrue("every blank holds more volume than its duct",
    blankVols.every((v, i) => v > ductVols[i]), "");

  // ── the cutter extension is a pair of exact prisms ────────────────────────
  // A ring translated along its own unit vector-area normal spans a prism of
  // volume |A_vec|·ext, whatever surface caps it — vector area is set by the
  // boundary alone. So extending a duct adds exactly ext·(|A_throat|+|A_mouth|).
  {
    const cell = th.cells[7];
    const rowR = map.rows.find((r) => r.id === cell.id);
    const duct = M.ductSections(cell, rowR, { t });
    const extd = M.extendSections(duct, ext);
    const dm = M.ductMesh(duct), em = M.ductMesh(extd);
    const v0 = Math.abs(M.meshVolume(dm.verts, dm.tris));
    const v1 = Math.abs(M.meshVolume(em.verts, em.tris));
    const want = ext * (M.polyArea3(duct[0].pts) + M.polyArea3(duct[duct.length - 1].pts));
    check("extension volume = ext x (|A_throat| + |A_mouth|)", (v1 - v0) / want, 1, 1e-9);
    // and the prepended throat ring is planar in z = -ext, exactly
    let z = 0;
    for (const p of extd[0].pts) z = Math.max(z, Math.abs(p[2] + ext));
    check("cutter throat ring planar in z = -ext", z, 0, 1e-9, "mm");
  }

  // ── the emitted file ──────────────────────────────────────────────────────
  const out = M.buildShellSTEP(th, map, { t, wall, ext, extend: false, jitter: 0, stations: null, name: "shelltest" });
  checkTrue("two solids per cell: 18 blanks + 18 cutters", out.checks.ducts === 36, `${out.checks.ducts} solids`);
  check("shell surfaces pass through every sampled ring point", out.checks.residual, 0, 1e-9, "mm");
  checkTrue("every edge used exactly twice, opposite senses", out.checks.edgePairing, "");
  check("throat caps planar in their own planes (0 and -ext)", out.checks.capPlanarZ, 0, 1e-9, "mm");
  const integ = M.stepIntegrity(out.text);
  checkTrue("every referenced entity is defined", integ.ok,
    `${integ.entities} entities, ${integ.missing} missing`);
  checkTrue("36 solids in one AP214 representation, labelled by role",
    (out.text.match(/MANIFOLD_SOLID_BREP/g) || []).length === 36
    && (out.text.match(/'shell blank /g) || []).length === 18
    && (out.text.match(/'duct cutter /g) || []).length === 18, "");
  // solids alternate blank, cutter — the blank must out-hold the plain duct,
  // and the cutter is the duct plus its two end prisms
  let volOK = true;
  for (let i = 0; i < 18; i++) {
    const blank = out.checks.volumes[2 * i].mesh, cutter = out.checks.volumes[2 * i + 1].mesh;
    if (!(blank > ductVols[i] && Math.abs(cutter - ductVols[i]) / ductVols[i] < 0.2)) volOK = false;
  }
  checkTrue("emitted volumes: blank > duct, cutter = duct + end prisms", volOK, "");
  // shellSolids (the preview's source) agrees with what the file carries
  const ss = M.shellSolids(th, map, { t, wall });
  checkTrue("shellSolids meshes every blank manifold",
    ss.length === 18 && ss.every((sd) => sd.manifold.ok), "");
}

head("Aperture surface, per-cell shell, orientation");
{
  const t = 0.4, wall = 3, ST = 24;
  const opts = {
    c, nc: 6, nr: 3, R, rectangular: true, exitHalfAngle: 8,
    divergeLen: 0, arriveLen: 0, tight: 0.5, tightThroat: 0.5, tightMouth: 0.5,
    fTarget: 20000, t, profileArea: "open",
    mouthMode: "biradial", thetaH: 90, thetaV: 40, arcH: 480, arcV: 213,
    sectionMode: "swept", stations: ST, depth: 320, profileT: 0.7,
    keepGeometry: true, computeClearance: false,
  };
  const Lay = M.buildLayout({ family: "hgrid", R, nc: 6, nr: 3, m: 2, t, c });
  const th = Lay.throat;
  const map = M.mapThroatToMouth(th, opts);
  const ap = M.apertureFrame(map.mouthSurf);

  // ── the inversion is exact, and it is an inversion ─────────────────────────
  // Round-trip the surface's OWN parameters through param() and back: any
  // point the forward map produces must come back with the same (a, e).
  let rt = 0, fwd = 0;
  for (let ia = -4; ia <= 4; ia++)
    for (let ie = -3; ie <= 3; ie++) {
      const a = (ia / 4) * (45 * Math.PI / 180), e = (ie / 3) * (20 * Math.PI / 180);
      const P = ap.at(a, e), pr = ap.param(P);
      rt = Math.max(rt, Math.abs(pr.a - a), Math.abs(pr.e - e));
      fwd = Math.max(fwd, Math.abs(ap.deviation(P)));
    }
  check("aperture param inverts its own forward map", rt, 0, 1e-12, "rad");
  check("a surface point measures zero deviation", fwd, 0, 1e-12, "mm");
  // and the surface the DUCTS were built on is the same surface
  let ductDev = 0;
  for (const r of map.rows)
    for (const p of r.sched[r.sched.length - 1].pts) ductDev = Math.max(ductDev, Math.abs(ap.deviation(p)));
  check("duct mouth rings already lie on it", ductDev, 0, 1e-9, "mm");

  // ── the shell mouth ring is put back ON the surface ───────────────────────
  // Offsetting happens in the ring's best-fit plane, so it leaves the curved
  // aperture by the local slope times the offset — and every cell fits its own
  // plane, so the lips disagreed with each other too. Snapped, they cannot.
  let unsnapped = 0, snapped = 0;
  for (const cell of th.cells) {
    const row = map.rows.find((r) => r.id === cell.id);
    const a = M.shellSections(cell, row, { t, wall });
    const b = M.shellSections(cell, row, { t, wall, surf: map.mouthSurf });
    for (const p of a[a.length - 1].pts) unsnapped = Math.max(unsnapped, Math.abs(ap.deviation(p)));
    for (const p of b[b.length - 1].pts) snapped = Math.max(snapped, Math.abs(ap.deviation(p)));
  }
  checkTrue("unsnapped blank lips leave the aperture measurably", unsnapped > 0.5,
    `${unsnapped.toFixed(3)} mm off — the artifact this fixes`);
  check("snapped blank lips lie on the aperture", snapped, 0, 1e-9, "mm");

  // ── the cap interior lies on the surface too, not on a chord ──────────────
  // A Coons blend of a boundary that lies on a curved cap falls BEHIND the
  // surface inside; blending in (a, e) and evaluating cannot.
  const blank0 = M.shellSections(th.cells[0], map.rows.find((r) => r.id === th.cells[0].id), { t, wall, surf: map.mouthSurf });
  const ring = blank0[blank0.length - 1].pts;
  const grid = M.apertureCapGrid(ring, ap);
  let gDev = 0, gEdge = 0;
  const nB = ring.length / 4;
  for (const row of grid) for (const p of row) gDev = Math.max(gDev, Math.abs(ap.deviation(p)));
  for (let i = 0; i <= nB; i++) {
    gEdge = Math.max(gEdge, Math.hypot(...grid[i][0].map((v, k) => v - ring[i % ring.length][k])));
    gEdge = Math.max(gEdge, Math.hypot(...grid[nB][i].map((v, k) => v - ring[(nB + i) % ring.length][k])));
  }
  check("every cap grid point lies on the aperture", gDev, 0, 1e-9, "mm");
  check("the cap grid reproduces the ring on its boundary", gEdge, 0, 1e-9, "mm");
  {
    const bare = M.ductBrep(blank0);
    const withAp = M.ductBrep(blank0, { capMouthPts: grid });
    const at = (br, u, v) => M.evalBsplineSurf(br.capMouth, br.uKnots, br.uKnots, u, v);
    let dC = 0, dG = 0;
    for (let i = 1; i < 8; i++)
      for (let j = 1; j < 8; j++) {
        dC = Math.max(dC, Math.abs(ap.deviation(at(bare, i / 8, j / 8))));
        dG = Math.max(dG, Math.abs(ap.deviation(at(withAp, i / 8, j / 8))));
      }
    // AT CELL SCALE THE CAP-FILL CHOICE IS SMALL, and that is worth knowing:
    // a Coons chord across ONE cell's mouth falls 0.02 mm behind the surface,
    // against 5.6 mm across the whole aperture. The interpolated cap is still
    // the right fill — it is what makes every cell's mouth face lie on ONE
    // analytic surface, which is what the owner asked for — but the argument
    // for it is co-surface mouths, not a large error.
    checkTrue("the interpolated cap lies on the aperture and a Coons blend does not",
      dG < 1e-9 && dC > 1e-3, `Coons ${dC.toFixed(3)} mm off, interpolated ${dG.toExponential(1)} mm`);
  }

  // ── THE BLANK IS THE DUCT OFFSET OUTWARDS, AND NOTHING ELSE ───────────────
  // Every construction that gave the horn a single outer skin came out with
  // visible surface texture, because its rings were DERIVED per station by a
  // discrete search (a raster iso-line; a convex hull) and the search's
  // decisions change abruptly along the path. A blank ring is the duct ring
  // EVALUATED and offset, so vertex k is the same material line all the way
  // down and the loft is as clean as the duct's. The wall is therefore exact
  // rather than fitted, and that is what these checks assert.
  {
    const dseg = (p, A, B) => {
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-12;
      let u = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
      u = Math.max(0, Math.min(1, u));
      return Math.hypot(p[0] - A[0] - ab[0] * u, p[1] - A[1] - ab[1] * u, p[2] - A[2] - ab[2] * u);
    };
    let faceLo = Infinity, faceHi = 0, lipLo = Infinity, mouthDev = 0, zT = 0, cornerHi = 0;
    for (const cell of th.cells) {
      const row = map.rows.find((r) => r.id === cell.id);
      const d = M.ductSections(cell, row, { t });
      const b = M.shellSections(cell, row, { t, wall, surf: map.mouthSurf });
      const Q = d.length - 1, n = b[0].pts.length / 4;
      for (let q = 0; q <= Q; q++)
        b[q].pts.forEach((p, k) => {
          let m = Infinity;
          for (let i = 0; i < d[q].pts.length; i++) m = Math.min(m, dseg(p, d[q].pts[i], d[q].pts[(i + 1) % d[q].pts.length]));
          if (k % n === 0) cornerHi = Math.max(cornerHi, m);
          else if (q === Q) lipLo = Math.min(lipLo, m);
          else { faceLo = Math.min(faceLo, m); faceHi = Math.max(faceHi, m); }
        });
      for (const p of b[Q].pts) mouthDev = Math.max(mouthDev, Math.abs(ap.deviation(p)));
      for (const p of b[0].pts) zT = Math.max(zT, Math.abs(p[2]));
    }
    check("the wall is exactly the wall on every face, every station, every cell (min)", faceLo, wall, 1e-9, "mm");
    // and never more than wall / cos(half the largest turn between two
    // samples of a run) — the rings are polylines, so an interior vertex
    // mitres too, by 0.35 um on a 0.9 deg turn. Not a tolerance: a bound.
    checkTrue("and at most the wall plus the discretisation's own mitre", faceHi - wall < 1e-3,
      `${((faceHi - wall) * 1000).toFixed(2)} um over ${wall} mm`);
    // a mitred corner reaches wall / sin(half-angle) — geometry, not error
    checkTrue("a mitred corner reaches further than the wall, by construction", cornerHi > wall && cornerHi < 4 * wall,
      `${cornerHi.toFixed(2)} mm at the sharpest corner, against a ${wall} mm wall`);
    // the mouth lip is snapped onto the aperture, which is what costs it
    checkTrue("the mouth lip is a little under, because it is snapped to the aperture", lipLo > 0.85 * wall && lipLo < wall,
      `${lipLo.toFixed(3)} mm — the only ring that is not exactly ${wall}`);
    check("every blank's mouth ring lies on the aperture", mouthDev, 0, 1e-9, "mm");
    check("every blank's throat ring is planar in z = 0", zT, 0, 1e-12, "mm");
  }

  // adjacent blanks share material where the ducts run closer than 2·wall,
  // which is what a multicell's shared walls ARE — measured, not assumed
  {
    const ov = M.shellOverlap(th, map, { t, wall });
    check("every adjacent pair is examined", ov.pairs, 27, 0, "pairs");
    checkTrue("adjacent blanks share material near the ends and part mid-path", ov.touching === 27 && ov.fracTouching > 0.1 && ov.fracTouching < 0.9,
      `${ov.touching}/${ov.pairs} pairs, over ${(ov.fracTouching * 100).toFixed(0)}% of the stations, deepest ${ov.deepest.toFixed(2)} mm`);
    // at the mouth the ducts tile exactly, so the blanks overlap by exactly 2·wall
    checkTrue("at the mouth, where the ducts tile, the overlap is 2·wall", Math.abs(ov.deepest - 2 * wall) < 0.05 && ov.deepestAt.q === ov.S - 1,
      `${ov.deepest.toFixed(3)} mm at station ${ov.deepestAt.q} of ${ov.S - 1}`);
  }

  // ── the kit, and the recipe it states ─────────────────────────────────────
  {
    const out = M.buildShellSTEP(th, map, { t, wall, extend: false, jitter: 0, stations: null, name: "cellstest" });
    checkTrue("the shell emits one blank and one cutter per cell",
      !!out && out.mode === "cells" && out.cells === th.cells.length && out.checks.ducts === 2 * th.cells.length,
      out ? `${out.cells} blanks + ${out.cells} cutters` : "no output");
    checkTrue("and states the recipe: subtract, never union", /subtract/i.test(out.text) && /no unions/i.test(out.text), "");
    check("every surface passes through its samples", out.checks.residual, 0, 1e-9, "mm");
    checkTrue("every solid's edges pair up", out.checks.edgePairing, "");
    checkTrue("the file is referentially intact", M.stepIntegrity(out.text).ok, "");
    // the cutter's throat cap is exactly planar below the blank's, so the
    // subtraction cannot leave a membrane over the passage
    checkTrue("cutters overhang both end faces", out.checks.capPlanarZ < 1e-9, `${out.checks.capPlanarZ.toExponential(1)} mm`);
  }

  // ── PHASE 1: WHAT MAKES THE UNION OF THE BLANKS TRACTABLE ────────────────
  // Three measured degeneracies, three switches, each tested on the number
  // that justifies it. None of this changes the geometry of the passages —
  // the cutters are untouched.
  {
    // (a) THE NEAR-COPY SURFACES. Two adjacent cells share a grid line, so on
    // their other sides both blanks offset the SAME curve by the SAME
    // distance: the identical surface computed twice, landing sub-micron
    // apart. `jitter` gives cells of opposite grid parity different walls.
    const bare = M.shellCoincidence(th, map, { t, wall, jitter: 0, stations: 32 });
    const jit = M.shellCoincidence(th, map, { t, wall, jitter: 0.5, stations: 32 });
    checkTrue("without jitter, blanks carry surface that is a near-copy of a neighbour's", bare.arc > 10,
      `${bare.arc.toFixed(1)} mm of arc inside ${bare.eps} mm, over ${bare.pairs} pairs`);
    check("with jitter, none is left", jit.arc, 0, 1e-12, "mm");
    checkTrue("every adjacent pair is examined", bare.pairs === 27 && jit.pairs === 27, "");
    // parity is what guarantees it: orthogonal neighbours always differ
    let sameParity = 0;
    for (const c of th.cells) {
      const [col, rw] = c.label.split(",").map(Number);
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const nb = `${col + dc},${rw + dr}`;
        if (th.cells.some((x) => x.label === nb) && M.cellParity(c.label) === M.cellParity(nb)) sameParity++;
      }
    }
    check("no two orthogonally adjacent cells share a wall parity", sameParity, 0, 0, "pairs");
    // and the jitter only ever ADDS, so the wall stays the minimum
    let wMin = Infinity;
    for (const c of th.cells) {
      const b = M.shellSections(c, map.rows.find((r) => r.id === c.id), { t, wall, jitter: 0.5, snapMouth: false });
      const d = M.ductSections(c, map.rows.find((r) => r.id === c.id), { t });
      const n = b[0].pts.length / 4;
      b[0].pts.forEach((p, k) => {
        if (k % n === 0) return;
        let m = Infinity;
        for (let i = 0; i < d[0].pts.length; i++) {
          const A = d[0].pts[i], B = d[0].pts[(i + 1) % d[0].pts.length];
          const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
          const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
          let u = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
          u = Math.max(0, Math.min(1, u));
          m = Math.min(m, Math.hypot(p[0] - A[0] - ab[0] * u, p[1] - A[1] - ab[1] * u, p[2] - A[2] - ab[2] * u));
        }
        wMin = Math.min(wMin, m);
      });
    }
    checkTrue("jitter only ever adds, so the wall stays the minimum", wMin >= wall - 1e-9,
      `thinnest face ${wMin.toFixed(3)} mm against ${wall}`);

    // (b) THE END CAPS. Every blank's throat ring is planar in z = 0, so
    // adjacent blanks meet with coplanar OVERLAPPING caps — 27 of 27 pairs.
    // Extending past the end, staggered per cell, puts no two adjacent
    // blanks on one plane, and the trim solids cut the faces back exactly.
    const inside = (pt, poly) => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        if ((poly[i][1] > pt[1]) !== (poly[j][1] > pt[1])
          && pt[0] < ((poly[j][0] - poly[i][0]) * (pt[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) ins = !ins;
      return ins;
    };
    const capPairs = (ext) => {
      const E = new Map();
      for (const c of th.cells) {
        const b = M.shellSections(c, map.rows.find((r) => r.id === c.id), { t, wall, surf: map.mouthSurf, jitter: 0.5, stations: 32, snapMouth: ext > 0 ? false : true });
        E.set(c.label, ext > 0 ? M.extendSections(b, ext * (1 + 0.4 * M.cellPhase5(c.label))) : b);
      }
      let n = 0;
      for (const c of th.cells) {
        const [col, rw] = c.label.split(",").map(Number);
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
          const nb = `${col + dc},${rw + dr}`;
          if (!E.has(nb)) continue;
          const A = E.get(c.label)[0].pts, B = E.get(nb)[0].pts;
          if (Math.abs(A[0][2] - B[0][2]) < 1e-6 && (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A)))) n++;
        }
      }
      return n;
    };
    check("plain blanks: every adjacent pair has coplanar overlapping throat caps", capPairs(0), 27, 0, "pairs");
    check("extended and staggered: none does", capPairs(3), 0, 0, "pairs");
    let phaseSame = 0;
    for (const c of th.cells) {
      const [col, rw] = c.label.split(",").map(Number);
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const nb = `${col + dc},${rw + dr}`;
        if (th.cells.some((x) => x.label === nb) && M.cellPhase5(c.label) === M.cellPhase5(nb)) phaseSame++;
      }
    }
    check("no two orthogonally adjacent cells share an extension phase", phaseSame, 0, 0, "pairs");

    // (c) THE STATION COUNT. Fewer knots is a better-conditioned boolean, and
    // the count is snapped to a DIVISOR because the loft interpolates with a
    // uniform parameterisation — unevenly spaced rings are told they are
    // evenly spaced and the surface leaves them.
    const cell0 = th.cells[0], row0 = map.rows.find((r) => r.id === cell0.id);
    const full = M.shellSections(cell0, row0, { t, wall, snapMouth: false });
    const Q = full.length - 1;
    for (const want of [Q / 2, Q / 4]) {
      const co = M.shellSections(cell0, row0, { t, wall, stations: want, snapMouth: false });
      const gaps = new Set();
      for (let i = 1; i < co.length; i++) gaps.add(Math.round((co[i].s - co[i - 1].s) * Q));
      check(`stations ${want}: the kept rings are evenly spaced`, gaps.size, 1, 0, "gap sizes");
      // and the loft passes through every ring it kept, exactly
      const br = M.ductBrep(co);
      let dev = 0;
      for (let j = 0; j < co.length; j++)
        for (let w = 0; w < 4; w++)
          for (let i = 0; i <= br.n; i += 4) {
            const P = M.evalBsplineSurf(br.walls[w], br.uKnots, br.vKnots, i / br.n, j / (co.length - 1));
            const T = co[j].pts[(w * br.n + i) % (4 * br.n)];
            dev = Math.max(dev, Math.hypot(P[0] - T[0], P[1] - T[1], P[2] - T[2]));
          }
      check(`stations ${want}: the loft passes through every kept ring`, dev, 0, 1e-9, "mm");
    }
    // a count that does NOT divide is snapped rather than obeyed
    const odd = M.shellSections(cell0, row0, { t, wall, stations: Q - 1, snapMouth: false });
    const oddGaps = new Set();
    for (let i = 1; i < odd.length; i++) oddGaps.add(Math.round((odd[i].s - odd[i - 1].s) * Q));
    check("a non-dividing count is snapped to one that divides", oddGaps.size, 1, 0, "gap sizes");
  }

  // ── the trim solids, and the recipe the file states ───────────────────────
  {
    const ext = 3;
    const tr = M.throatTrimSections(th, map, { t, wall, ext });
    const mo = M.mouthTrimSections(th, map, { t, wall, ext, jitter: 0.5 });
    checkTrue("the throat trim is a slab below z = 0", tr && tr[tr.length - 1].pts.every((p) => Math.abs(p[2]) < 1e-12) && tr[0].pts.every((p) => p[2] < -ext),
      tr ? `top at z = 0, bottom at z = ${tr[0].pts[0][2].toFixed(1)}` : "none");
    // it has to cover the whole throat end, extended blanks included
    let rB = 0;
    for (const c of th.cells) {
      const b = M.shellSections(c, map.rows.find((r) => r.id === c.id), { t, wall, jitter: 0.5, snapMouth: false });
      for (const p of b[0].pts) rB = Math.max(rB, Math.abs(p[0]), Math.abs(p[1]));
    }
    let half = 0;
    for (const p of tr[0].pts) half = Math.max(half, Math.abs(p[0]), Math.abs(p[1]));
    checkTrue("and it reaches past every blank at the throat", half > rB, `${half.toFixed(1)} mm against ${rB.toFixed(1)}`);
    // the mouth trim's near face IS the aperture, not a chord across it
    const grid = M.apertureCapGrid(mo[mo.length - 1].pts, ap);
    let dev = 0;
    for (const rw of grid) for (const p of rw) dev = Math.max(dev, Math.abs(ap.deviation(p)));
    check("the mouth trim's cutting face lies on the aperture", dev, 0, 1e-9, "mm");
    checkTrue("and it stands clear of the aperture on the far side", mo[0].pts.every((p, i) => p[2] > mo[mo.length - 1].pts[i][2] + 1),
      `${(mo[0].pts[0][2] - mo[mo.length - 1].pts[0][2]).toFixed(0)} mm of stand-off`);

    const out = M.buildShellSTEP(th, map, { t, wall, ext, extend: true, jitter: 0.5, stations: 32, name: "phase1" });
    checkTrue("extended mode emits the blanks, the cutters and both trims",
      out.mode === "extended" && out.cells === th.cells.length && out.trims === 2
      && out.checks.ducts === 2 * th.cells.length + 2, `${out.checks.ducts} solids`);
    // the recipe's own quotes are DOUBLED, because it lives in a STEP string
    checkTrue("and states the union-then-subtract recipe",
      /union the \d+ ''shell blank'' solids/.test(out.text)
      && /subtract ''throat trim'' and ''mouth trim''/.test(out.text), "");
    check("every surface passes through its samples", out.checks.residual, 0, 1e-9, "mm");
    checkTrue("every solid's edges pair up", out.checks.edgePairing, "");
    checkTrue("the file is referentially intact", M.stepIntegrity(out.text).ok, "");
    // the two-cell test file: the smallest thing that can fail
    const two = M.buildShellSTEP(th, map, { t, wall, ext, extend: true, jitter: 0.5, stations: 32, only: [th.cells[0].label, th.cells[1].label], name: "twocell" });
    checkTrue("the two-cell test emits one adjacent pair and no trims",
      two.cells === 2 && two.trims === 0 && two.checks.ducts === 4, `${two.checks.ducts} solids`);
    // plain mode still available, ends still exact
    const plain = M.buildShellSTEP(th, map, { t, wall, ext, extend: false, jitter: 0, stations: null, name: "plain" });
    checkTrue("plain mode is unchanged: N blanks, N cutters, no trims, no unions",
      plain.mode === "cells" && plain.trims === 0 && /no unions/.test(plain.text), "");
  }

  // ── the two ends are separable, and a plain throat stops exactly at z=0 ──
  // The mouth trim cuts on the aperture surface; the throat trim cuts on the
  // plane z = 0, which is the operation the owner measured failing as a plane
  // split. A plain throat makes that face from the loft's own end ring, and
  // the check that matters is that the WALL does not run past it — extended,
  // it does, by tens of microns on the shortest-extension cells.
  {
    const ext = 3;
    const cases = [
      ["both ends", {}, 2, true, true],
      ["mouth only", { extendThroat: false }, 1, false, true],
      ["throat only", { extendMouth: false }, 1, true, false],
      ["neither", { extend: false }, 0, false, false],
      ["extend both, trim mouth", { trimThroat: false }, 1, true, true],
    ];
    for (const [tag, cfg, nTrim, eT, eM] of cases) {
      const r = M.buildShellSTEP(th, map, { t, wall, ext, jitter: 0.5, stations: 32, ...cfg, name: tag });
      const ok = r && r.trims === nTrim && r.ends.throat === eT && r.ends.mouth === eM
        && r.checks.ducts === 2 * th.cells.length + nTrim
        && M.stepIntegrity(r.text).ok && r.checks.edgePairing && r.checks.residual < 1e-6;
      checkTrue(`ends: ${tag}`, ok, r ? `${r.checks.ducts} solids, trims [${r.trimNames.join(", ") || "none"}]` : "null");
    }
    // a trim with no extension behind it would cut the real body: refused
    const bad = M.buildShellSTEP(th, map, { t, wall, ext, jitter: 0.5, stations: 32,
      extendThroat: false, trimThroat: true, name: "bad" });
    checkTrue("a trim with no extension behind it is refused",
      bad.trims === 1 && !bad.trimNames.includes("throat trim"),
      `trims [${bad.trimNames.join(", ")}]`);

    // the geometry that motivates the option: does the WALL pass its own cap?
    const past = (eThroat) => {
      let worst = 0;
      for (const c of th.cells) {
        const row = map.rows.find((r) => r.id === c.id);
        const b = M.shellSections(c, row, { t, wall, surf: map.mouthSurf, jitter: 0.5, stations: 32, snapMouth: false });
        const e = ext * (1 + 0.4 * M.cellPhase5(c.label));
        const sec = M.extendSections(b, e, { throat: eThroat, mouth: true });
        const br = M.ductBrep(sec);
        const z0 = sec[0].pts[0][2];
        let zmin = Infinity;
        for (let j = 0; j <= 24; j++) for (const w of br.walls) for (let i = 0; i < br.n; i++)
          zmin = Math.min(zmin, M.evalBsplineSurf(w, br.uKnots, br.vKnots, i / br.n, (0.06 * j) / 24)[2]);
        worst = Math.max(worst, z0 - zmin);
      }
      return worst;
    };
    // and the model reports it, with the ratio that explains it
    const rep = M.shellCapOvershoot(th, map, { t, wall, jitter: 0.5, stations: 32, ext });
    checkTrue("shellCapOvershoot finds it and names the cell",
      rep.worst > 1e-3 && rep.at && rep.minRatio < 0.5 && rep.step > 1,
      `${rep.worst.toFixed(4)} mm at ${rep.at}, ext/step ${rep.minRatio.toFixed(2)}, step ${rep.step.toFixed(1)} mm`);
    // raising the extension past the threshold removes it
    const big = M.shellCapOvershoot(th, map, { t, wall, jitter: 0.5, stations: 32, ext: 12 });
    checkTrue("and a long enough extension removes it entirely",
      big.worst <= 1e-9 && big.minRatio > 0.5, `${big.worst.toExponential(2)} mm at ext/step ${big.minRatio.toFixed(2)}`);
    const withExt = past(true), noExt = past(false);
    checkTrue("a plain throat: the wall stops exactly at its own end ring",
      noExt <= 1e-9, `${noExt.toExponential(2)} mm past`);
    checkTrue("and an extended one runs past its cap plane, measurably",
      withExt > 1e-3, `${withExt.toFixed(4)} mm past — the uniform-parameterisation loft over a short first gap`);
    // the plain throat ring is exactly planar in z = 0, which is the point
    let flat = 0;
    for (const c of th.cells) {
      const row = map.rows.find((r) => r.id === c.id);
      const b = M.shellSections(c, row, { t, wall, surf: map.mouthSurf, jitter: 0.5, stations: 32, snapMouth: false });
      for (const p of b[0].pts) flat = Math.max(flat, Math.abs(p[2]));
    }
    check("and its end ring is planar in z = 0", flat, 0, 1e-9, "mm");
  }

  // ── the header must be a legal STEP string, and carry the settings ──────
  // A string literal is delimited by apostrophes, so one INSIDE it has to be
  // doubled. Every shell kit written before 2026-09-03 put bare quotes in its
  // recipe, which made FILE_DESCRIPTION a syntax error. The check is a real
  // tokeniser over the header, not a substring search.
  {
    const kit = M.buildShellSTEP(th, map, { t, wall, ext: 3, extend: true, jitter: 0.5, stations: 32,
      params: "depth=320 note=o'brien back\\slash em—dash", name: "hdr" });
    const head = kit.text.slice(0, kit.text.indexOf("ENDSEC;"));
    // walk the header and count string literals, treating '' as an escape
    const strings = [];
    let i = 0, cur = null;
    while (i < head.length) {
      const ch = head[i];
      if (cur === null) { if (ch === "'") { cur = ""; i++; continue; } i++; continue; }
      if (ch === "'") {
        if (head[i + 1] === "'") { cur += "'"; i += 2; continue; }
        strings.push(cur); cur = null; i++; continue;
      }
      cur += ch; i++;
    }
    checkTrue("the header closes every string literal it opens", cur === null,
      `${strings.length} literals parsed`);
    // outside the literals the header must contain no bare apostrophe-free words
    // where a string was meant: rebuild FILE_DESCRIPTION's argument list
    const fd = /FILE_DESCRIPTION\(\(([\s\S]*?)\),'2;1'\);/.exec(head);
    checkTrue("FILE_DESCRIPTION parses as a list of quoted strings only",
      !!fd && /^\s*'(?:[^']|'')*'(?:\s*,\s*'(?:[^']|'')*')*\s*$/.test(fd[1]),
      fd ? `${fd[1].length} chars` : "not found");
    checkTrue("and the recipe's own quotes survive as doubled apostrophes",
      /union the \d+ ''shell blank'' solids/.test(head), "");
    checkTrue("the settings are stamped and their quotes escaped",
      /depth=320/.test(head) && /o''brien/.test(head), "");
    checkTrue("no character outside printable ASCII reaches the file",
      !/[^\x09\x0a\x0d\x20-\x7e]/.test(kit.text), "");
    // and the file still passes its own integrity check
    checkTrue("the escaped file is still referentially intact", M.stepIntegrity(kit.text).ok, "");
    // a shell export with no params supplied still stamps the shell settings
    const auto = M.buildShellSTEP(th, map, { t, wall, ext: 3, extend: true, jitter: 0.5, stations: 32, name: "auto" });
    checkTrue("an export with no params still carries the shell settings",
      /wall=3/.test(auto.text) && /jitter=0.5/.test(auto.text), "");
  }

  // ── the wall against the cell width, which is what stacks the blanks ─────
  // At the throat the cells tile, so a blank pushes `wall` into its neighbour
  // across the whole shared face. Once 2·wall passes a cell's width the blanks
  // on either side of that cell reach past each other. The closed form and the
  // measured throat-plane stack must agree, and the mitre must be ruled OUT as
  // the cause — clamping every corner to a full round leaves the stack alone.
  {
    const cw = M.throatCellWidth(th, map, { t });
    checkTrue("the narrowest throat cell is measured on the duct ring",
      cw.min > 3 && cw.min < cw.max && cw.max < 12,
      `${cw.min.toFixed(2)}-${cw.max.toFixed(2)} mm, narrowest ${cw.narrowest}`);
    const insideXY = (pt, poly) => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        if ((poly[i][1] > pt[1]) !== (poly[j][1] > pt[1])
          && pt[0] < ((poly[j][0] - poly[i][0]) * (pt[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) ins = !ins;
      return ins;
    };
    // how many blanks share throat material with a cell they are NOT adjacent
    // to — the thing that can only happen by reaching across a whole cell
    const farSharing = (w, cap = 0) => {
      const B = new Map();
      for (const c of th.cells) {
        const row = map.rows.find((r) => r.id === c.id);
        const b = M.shellSections(c, row, { t, wall: w, surf: map.mouthSurf, jitter: 0, stations: 32, snapMouth: false })[0].pts;
        if (cap) {
          const D = M.ductSections(c, row, { t })[0].pts, lim = cap * w;
          for (let k = 0; k < b.length; k++) {
            const o = D[k], v = [b[k][0] - o[0], b[k][1] - o[1], b[k][2] - o[2]];
            const L = Math.hypot(v[0], v[1], v[2]);
            if (L > lim) b[k] = [o[0] + (v[0] * lim) / L, o[1] + (v[1] * lim) / L, o[2] + (v[2] * lim) / L];
          }
        }
        B.set(c.label, b);
      }
      const L = [...B.keys()];
      let far = 0, stack = 0;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const [ci, ri] = L[i].split(",").map(Number), [cj, rj] = L[j].split(",").map(Number);
        if (Math.abs(ci - cj) <= 1 && Math.abs(ri - rj) <= 1) continue;
        const P = B.get(L[i]), Q = B.get(L[j]);
        if (P.some((p) => insideXY(p, Q)) || Q.some((q) => insideXY(q, P))) far++;
      }
      for (let x = -26; x <= 26; x += 0.4) for (let y = -26; y <= 26; y += 0.4) {
        let n = 0;
        for (const [, P] of B) if (insideXY([x, y], P)) n++;
        if (n > stack) stack = n;
      }
      return { far, stack };
    };
    const thick = farSharing(3), thin = farSharing(1.5);
    checkTrue("a wall over half the narrowest cell reaches past a neighbour",
      2 * 3 > cw.min && thick.far > 0 && thick.stack > 4,
      `2x3 = 6.0 mm against ${cw.min.toFixed(2)} mm: ${thick.far} non-adjacent pairs share, stack ${thick.stack}`);
    checkTrue("and a wall under it does not, down to the structural floor",
      2 * 1.5 < cw.min && thin.far === 0 && thin.stack === 4,
      `2x1.5 = 3.0 mm: ${thin.far} non-adjacent pairs, stack ${thin.stack} (four cells meet at a node)`);
    // The mitre is NOT the cause, and this is the test that says so. Stated as
    // a BOUND rather than an equality: clamping every corner to a full round
    // does move the stack a little on some geometries (6 -> 6 at the tool's
    // defaults, 6 -> 5 here), but it leaves the great majority of the reaching
    // in place, where halving the wall removes ALL of it.
    const round = farSharing(3, 1);
    checkTrue("clamping every mitre to a full round does NOT fix it",
      round.stack >= thick.stack - 1 && round.far > 0.8 * thick.far,
      `stack ${thick.stack} -> ${round.stack}, non-adjacent pairs ${thick.far} -> ${round.far} — it is the face offset, not the corner`);
  }

  // ── symmetry regions: a half is a half, and the mirror is MEASURED ───────
  // A region export rests on the horn being mirror-symmetric. That is a
  // property of the built geometry, not of the intent — a world-axis bow
  // breaks one mirror outright — so the check that matters is that the
  // measurement can DETECT a broken mirror, not merely that it reads small on
  // a good one.
  {
    const ext = 3;
    const xp = M.symmetryRegion(th, { xSide: 1 }), xm = M.symmetryRegion(th, { xSide: -1 });
    checkTrue("x+ and x- partition a 6x3 grid with nothing on the plane",
      xp.labels.length === 9 && xm.labels.length === 9 && xp.onPlane.length === 0 &&
      xp.labels.every((l) => !xm.labels.includes(l)),
      `${xp.labels.length} + ${xm.labels.length} of ${th.cells.length}, even column count splits clean`);
    const yp = M.symmetryRegion(th, { ySide: 1 }), ym = M.symmetryRegion(th, { ySide: -1 });
    const shared = yp.labels.filter((l) => ym.labels.includes(l));
    checkTrue("an ODD row count straddles, and the straddling row is reported",
      yp.labels.length === 12 && yp.onPlane.length === 6 &&
      shared.length === 6 && shared.every((l) => yp.onPlane.includes(l)),
      `${yp.labels.length} cells, ${yp.onPlane.length} of them on y = 0 and in BOTH halves`);
    const q = M.symmetryRegion(th, { xSide: 1, ySide: 1 });
    checkTrue("a quarter is the intersection of the two halves",
      q.labels.length === 6 && q.labels.every((l) => xp.labels.includes(l) && yp.labels.includes(l)),
      `${q.labels.length} cells, ${q.onPlane.length} on a plane`);
    // every cell appears in exactly one of the four quadrants, or on a plane
    const quads = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, y]) => M.symmetryRegion(th, { xSide: x, ySide: y }));
    const covered = th.cells.every((c) => quads.some((r) => r.labels.includes(c.label)));
    checkTrue("the four quadrants cover every cell", covered, `${quads.map((r) => r.labels.length).join(" + ")}`);

    const mir = M.mirrorSymmetry(th, map, { t });
    checkTrue("both mirrors hold on the built ducts",
      mir.x.worst < 1e-6 && mir.y.worst < 1e-6 && mir.x.paired === th.cells.length,
      `x ${mir.x.worst.toExponential(2)} mm, y ${mir.y.worst.toExponential(2)} mm, ${mir.x.paired} pairs`);
    // the detector has to fire, or it is measuring nothing
    const broken = M.mapThroatToMouth(th, { ...opts, lengthen: { lobes: 1, dir: "y", uStart: 0, uEnd: 0.2 } });
    const mb = M.mirrorSymmetry(th, broken, { t });
    checkTrue("and a world-axis bow is CAUGHT breaking the y mirror only",
      mb.y.worst > 1 && mb.x.worst < 1e-6,
      `y ${mb.y.worst.toFixed(1)} mm broken, x ${mb.x.worst.toExponential(2)} mm intact`);

    // the kit itself: a region ships the same trims and the same blanks
    const full = M.buildShellSTEP(th, map, { t, wall, ext, extend: true, jitter: 0.5, stations: 32, name: "full" });
    const half = M.buildShellSTEP(th, map, { t, wall, ext, extend: true, jitter: 0.5, stations: 32, xSide: 1, name: "half" });
    checkTrue("a half kit is half the cells and still both trims",
      half.cells === 9 && half.trims === 2 && half.checks.ducts === 2 * 9 + 2 && full.cells === 18,
      `${half.checks.ducts} solids against the full kit's ${full.checks.ducts}`);
    checkTrue("and it names exactly the region's cells",
      half.region.labels.every((l) => half.text.includes(`shell blank ${l}`)) &&
      M.symmetryRegion(th, { xSide: -1 }).labels.every((l) => !half.text.includes(`shell blank ${l}`)),
      `${half.region.labels.join(" ")}`);
    const hi = M.stepIntegrity(half.text);
    checkTrue("a half kit passes the same self-checks as the whole",
      hi.ok && half.checks.edgePairing && half.checks.residual < 1e-6,
      `${hi.entities} entities, residual ${half.checks.residual.toExponential(1)} mm`);
    // `only` is the two-cell test and must keep its no-trims behaviour
    const both = M.buildShellSTEP(th, map, { t, wall, ext, extend: true, jitter: 0.5, stations: 32,
      only: [th.cells[0].label], xSide: 1, name: "both" });
    checkTrue("`only` still wins over a region and ships no trims",
      both.cells === 1 && both.trims === 0 && both.region === null, `${both.checks.ducts} solids`);
    // the duct exports honour the same selection
    const dsteps = M.buildSTEP(th, map, { t, only: half.region.labels, name: "ducts_half" });
    checkTrue("the duct STEP honours the region too",
      dsteps.checks.ducts === 9, `${dsteps.checks.ducts} duct solids`);
  }

  // ── orientation: ONE decision, and it must come out outward ──────────────
  // A shell whose faces are oriented by a per-face radial proxy can disagree
  // with itself; a hard-flaring solid is where that happened (two of four
  // walls read backwards, their loops reversed and the shared vertical edges
  // used twice in the SAME direction). The whole-shell divergence integral
  // cannot disagree with itself, and its sign is the check.
  {
    const br = M.ductBrep(blank0, { capMouthPts: grid });
    const o = M.brepShellOrientation(br);
    checkTrue("a blank shell orients outward as assembled", o.outward,
      `enclosed volume ${(o.volume / 1000).toFixed(1)} cm3`);
    // Compare LIKE WITH LIKE. The mesh fans the mouth ring to its centroid;
    // this brep closes it with the aperture surface, and on a curved cap the
    // two fills enclose genuinely different volumes — the cap-fill finding at
    // full strength, not an error. Closing the brep walls with the same fan
    // removes the freedom, and then only the walls differ and they must agree.
    const dm = M.ductMesh(blank0);
    const vm = Math.abs(M.meshVolume(dm.verts, dm.tris));
    const vFan = M.brepVolume(br, blank0, 12, 48, "fan");
    checkTrue("fan-capped, the brep blank agrees with the meshed blank",
      Math.abs(vFan - vm) / vm < 0.01,
      `${(vFan / 1000).toFixed(2)} vs ${(vm / 1000).toFixed(2)} cm3, ${(100 * Math.abs(vFan - vm) / vm).toFixed(3)}%`);
    checkTrue("and the aperture cap holds more than the fan, as a curved cap must",
      o.volume > vm, `${(o.volume / 1000).toFixed(2)} vs ${(vm / 1000).toFixed(2)} cm3 — the cap-fill difference`);
  }

  // ── why the union is avoided: the blanks genuinely graze ─────────────────
  // Blanks overlap near both ends (the ducts nearly tile there) and stand
  // apart mid-path (the profile opens the gap), so every neighbouring pair
  // crosses ZERO in between — exact tangential contact, the boolean's worst
  // case. This is a property of the geometry, not of a tolerance.
  {
    const blankRows = (w) => map.rows.map((r) => {
      const cell = th.cells.find((x) => x.id === r.id);
      const sec = M.shellSections(cell, r, { t, wall: w, surf: map.mouthSurf });
      return { ...r, sched: sec.map((x, q) => ({ ...r.sched[q], pts: x.pts })) };
    });
    const ps = M.ductClearance(blankRows(wall), {}).perStation;
    let flips = 0;
    for (let q = 2; q < ps.length - 1; q++) if (ps[q] * ps[q - 1] < 0) flips++;
    checkTrue("bundle blanks cross from overlapping to apart mid-path", flips > 0,
      `${flips} sign change(s) — the tangency the solid mode removes`);
    const duct = M.ductClearance(map.rows, {});
    checkTrue("and the wall that would avoid it is half the widest duct gap",
      duct.max / 2 > wall, `widest duct gap ${duct.max.toFixed(1)} mm, so wall > ${(duct.max / 2).toFixed(1)} mm`);
  }
}

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} checks passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
