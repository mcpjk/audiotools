// Closed-form test vectors for src/horn-model.js. Run: npm run test:horn
//
// EVERY expected value here comes from mathematics done independently — an
// analytic limit, an exact identity, a defining geometric property, or a
// round trip through the forward model. NONE of it comes from running the
// tool and recording what it said. That distinction is the whole point: a
// snapshot of the tool's own output catches CHANGES but can never catch
// WRONGNESS, because a wrong value recorded on day one is agreed with
// forever. The tractrix orientation bug this suite was written alongside is
// the worked example — it had shipped, and no amount of "does it still match
// last time" would have found it.
//
// Two rules this file follows, both learned the expensive way on the Ginkgo
// side of this project:
//   * A derived constant is asserted against an INDEPENDENTLY known value,
//     never against a second copy of its own formula. Re-deriving the same
//     expression in the test proves only that you can copy.
//   * Where a quantity is approached numerically, assert the CONVERGENCE
//     RATE, not a fixed tolerance. A loose tolerance passed a stalling
//     integration for three sessions before a rate test caught it.
import * as M from "../src/horn-model.js";

let pass = 0, fail = 0;
const check = (name, got, want, tol, unit = "") => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  const g = typeof got === "number"
    ? (Math.abs(got) < 1e-3 && got !== 0 ? got.toExponential(3) : got.toFixed(9))
    : String(got);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(56)} ${g.padStart(16)} ${unit}  (want ${want}${tol ? ` ±${tol}` : ""})`);
};
const checkTrue = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(56)} ${detail}`);
};
const head = (s) => console.log(`\n${s}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

// ── 1. the family's two named members are EXACT, not approximate ───────────
head("The Hypex family reduces exactly at its two named members");
// cosh(u) + sinh(u) === e^u identically, so T = 1 IS the exponential horn.
// Math.exp is an independent implementation, not a rearrangement of ours.
{
  let worstExp = 0, worstCosh = 0;
  for (const rt of [0.0125, 0.025, 0.05])
    for (const m of [0.5, 2, 5, 12.7])
      for (let i = 0; i <= 60; i++) {
        const x = i * 0.02;
        worstExp = Math.max(worstExp, rel(M.hypexR(x, rt, m, 1), rt * Math.exp(m * x)));
        worstCosh = Math.max(worstCosh, rel(M.hypexR(x, rt, m, 0), rt * Math.cosh(m * x)));
      }
  check("T = 1 is r = rt·exp(mx) to floating point", worstExp, 0, 1e-15, "rel");
  check("T = 0 is r = rt·cosh(mx) to floating point", worstCosh, 0, 1e-15, "rel");
}

// ── 2. the two endpoint conditions, for every member of the family ─────────
head("Endpoint conditions hold for every (m, T)");
// cosh(0) = 1 and sinh(0) = 0, so r(0) = rt and r'(0) = rt·m·T, whatever
// the family parameter is. These are the throat conditions the whole
// profile is anchored on.
{
  let worstR0 = 0, worstD0 = 0;
  for (const rt of [0.0125, 0.05]) for (const m of [0.5, 3, 12.7])
    for (const T of [0, 0.3, 0.7, 1, 1.4]) {
      worstR0 = Math.max(worstR0, Math.abs(M.hypexR(0, rt, m, T) - rt));
      worstD0 = Math.max(worstD0, Math.abs(M.hypexDrDx(0, rt, m, T) - rt * m * T));
    }
  check("r(0) = rt exactly", worstR0, 0, 0, "m");
  check("dr/dx(0) = rt·m·T exactly", worstD0, 0, 0, "m/m");
}

// ── 3. the derivative is the derivative — proved by CONVERGENCE RATE ───────
head("hypexDrDx is the true derivative (Richardson: O(h^2))");
// Asserting the analytic form here would just copy the code's own formula.
// Instead: a central difference must approach it as O(h^2), so halving h
// must quarter the error. The RATIO is the assertion, not the magnitude.
{
  const rt = 0.025, m = 3.5, T = 0.6, x = 0.31;
  const exact = M.hypexDrDx(x, rt, m, T);
  const err = (h) => Math.abs((M.hypexR(x + h, rt, m, T) - M.hypexR(x - h, rt, m, T)) / (2 * h) - exact);
  // The magnitude at any one h says nothing — it is a property of h. What
  // says the derivative is RIGHT is that err/h^2 is CONSTANT: a wrong
  // derivative leaves a residual that does not shrink at all, and a
  // first-order one halves rather than quarters.
  const hs = [1e-2, 5e-3, 2.5e-3, 1.25e-3];
  const k = hs.map((h) => err(h) / (h * h));
  check("halving h quarters the error (first ratio)", err(hs[0]) / err(hs[1]), 4, 0.25, "x");
  check("...and again (second ratio)", err(hs[1]) / err(hs[2]), 4, 0.25, "x");
  checkTrue("err/h^2 is constant over four halvings — that is O(h^2)",
    Math.max(...k) / Math.min(...k) < 1.01,
    `${k.map((v) => v.toFixed(4)).join(", ")}`);
}

// ── 4. flare rate: two independent expressions of one quantity ─────────────
head("Flare rate (1/S)(dS/dx), checked two ways");
// The model computes it from the sinh/cosh ratio. S = pi r^2, so the same
// quantity is 2·r'/r — a DIFFERENT expression built from two other
// functions. Agreement between them is a mutual check, not a tautology.
{
  let worst = 0;
  for (const m of [0.5, 3, 12.7]) for (const T of [0, 0.3, 0.7, 1])
    for (let i = 0; i <= 40; i++) {
      const x = i * 0.03;
      const viaArea = 2 * M.hypexDrDx(x, 1, m, T) / M.hypexR(x, 1, m, T);
      worst = Math.max(worst, rel(M.hypexFlareRate(x, m, T), viaArea));
    }
  check("matches 2·r'/r everywhere", worst, 0, 1e-14, "rel");
  // and at T = 1 the exponential horn has flare rate EXACTLY 2m at every x
  let worstExp = 0;
  for (const m of [0.5, 3, 12.7]) for (let i = 0; i <= 40; i++)
    worstExp = Math.max(worstExp, rel(M.hypexFlareRate(i * 0.03, m, 1), 2 * m));
  check("T = 1 gives exactly 2m at every x", worstExp, 0, 1e-14, "rel");
}

// ── 5. the length solve, inverted against the forward model ───────────────
head("hypexLengthForRatio inverts hypexR");
// The strongest form available: solve L from a target ratio, then feed L
// back through the FORWARD model and require the ratio to come back. This
// shares no algebra with the solve — the solve is a quadratic in e^(mL),
// the forward model is cosh + T·sinh.
{
  let worst = 0, n = 0;
  for (const T of [0, 0.3, 0.7, 1]) for (const m of [0.8, 3, 12.7])
    for (const R of [1.5, 2, 5, 10, 50, 500]) {
      const L = M.hypexLengthForRatio(R, m, T);
      if (L === null) continue;
      worst = Math.max(worst, rel(M.hypexR(L, 1, m, T), R)); n++;
    }
  check(`round trip returns the ratio (${n} cases)`, worst, 0, 1e-14, "rel");
  // two analytic limits, from independent inverse functions
  let wExp = 0, wCosh = 0;
  for (const m of [0.8, 3, 12.7]) for (const R of [1.5, 2, 10, 500]) {
    wExp = Math.max(wExp, rel(M.hypexLengthForRatio(R, m, 1), Math.log(R) / m));
    wCosh = Math.max(wCosh, rel(M.hypexLengthForRatio(R, m, 0), Math.acosh(R) / m));
  }
  check("T = 1 is ln(R)/m", wExp, 0, 1e-14, "rel");
  check("T = 0 is arccosh(R)/m", wCosh, 0, 1e-13, "rel");
  checkTrue("a ratio of 1 or less asks for no horn", M.hypexLengthForRatio(1, 3, 0.7) === 0
    && M.hypexLengthForRatio(0.5, 3, 0.7) === 0, "returns 0, not NaN or a negative length");
}

// ── 6. the tractrix, against its DEFINITION ───────────────────────────────
head("The tractrix satisfies its defining property");
// A tractrix is the curve whose tangent, from any point to the axis, has
// CONSTANT length. That length is the mouth radius. This is the definition,
// so it is the honest test — and note it holds under BOTH signs of the
// axial coordinate, which is exactly why it alone could not catch the
// orientation bug. The monotonicity assertion below is what catches that.
{
  const rt = 0.0125, Rm = 0.2;
  // 20000 points: the tolerance below is set by the FINITE DIFFERENCE used
  // to measure the tangent, not by the curve. At 4000 points the same test
  // reads 2.4e-6 m — the quotient is ill-conditioned near the ends, where
  // dr/dt -> 0 — so the bound has to be justified against the sampling
  // rather than picked.
  const pts = M.tractrixPoints(rt, Rm, 20000);
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < pts.length - 2; i++) {
    const dx = pts[i + 1].x - pts[i - 1].x, dr = pts[i + 1].r - pts[i - 1].r;
    lo = Math.min(lo, pts[i].r * Math.hypot(dx, dr) / Math.abs(dr));
    hi = Math.max(hi, pts[i].r * Math.hypot(dx, dr) / Math.abs(dr));
  }
  check("tangent length to the axis is the mouth radius (min)", lo, Rm, 1e-6, "m");
  check("...and the max, so it is CONSTANT", hi, Rm, 1e-6, "m");

  // endpoints are exact by construction: t0 = asin(rt/Rm) and t = pi/2
  check("starts at the throat radius", pts[0].r, rt, 1e-15, "m");
  check("ends at the mouth radius", pts[pts.length - 1].r, Rm, 1e-15, "m");
  check("starts at x = 0", pts[0].x, 0, 0, "m");

  // THE ORIENTATION. x is the axial distance FROM THE THROAT, so it must
  // start at zero and increase. Shipped negated until 2026-09-09, which
  // made tractrixAtX return null for every positive x and printed a
  // negative length in the UI.
  checkTrue("x increases from throat to mouth", pts.every((p, i) => i === 0 || p.x > pts[i - 1].x),
    `x spans 0 -> ${(pts[pts.length - 1].x * 1000).toFixed(3)} mm`);
  checkTrue("the total length is positive", pts[pts.length - 1].x > 0,
    `${(pts[pts.length - 1].x * 1000).toFixed(3)} mm for rt ${rt * 1000} / Rm ${Rm * 1000} mm`);

  // a degenerate request is refused rather than returned wrong
  checkTrue("a throat wider than the mouth yields no curve",
    M.tractrixPoints(0.3, 0.2).length === 0, "empty, not garbage");
}

// ── 7. the interpolator lands on the curve, and errs the way it must ───────
head("tractrixAtX interpolates onto the curve");
{
  const rt = 0.0125, Rm = 0.2;
  const fine = M.tractrixPoints(rt, Rm, 20000);
  const used = M.tractrixPoints(rt, Rm);            // the default 500
  const at = (pts, x) => M.tractrixAtX(pts, x);
  // sampled against a 40x finer generation of the same curve
  let convex = 0;
  for (let i = 1; i < fine.length - 1; i++) {
    const s1 = (fine[i].r - fine[i - 1].r) / (fine[i].x - fine[i - 1].x);
    const s2 = (fine[i + 1].r - fine[i].r) / (fine[i + 1].x - fine[i].x);
    if (s2 > s1) convex++;
  }
  let worst = 0, over = 0, total = 0;
  for (let i = 1; i <= 40; i++) {
    const x = (i / 41) * fine[fine.length - 1].x;
    const a = at(used, x), b = at(fine, x);
    if (a === null || b === null) continue;
    worst = Math.max(worst, Math.abs(a - b)); total++;
    if (a >= b) over++;
  }
  checkTrue("every sample resolves", total === 40, `${total} of 40`);
  check("within 0.05 mm of a 40x finer curve", worst * 1000, 0, 0.05, "mm");
  // r(x) is CONVEX in x — dr/dx increases monotonically from throat to
  // mouth — and a chord across a convex curve lies ABOVE it, so the
  // interpolated radius must be an OVER-estimate at every sample. Asserted
  // because the model comment claims a direction, and the first version of
  // both the comment and this test claimed the opposite from an argument
  // made without checking. Convexity itself is asserted first, so the
  // expected direction is derived here rather than assumed.
  checkTrue("r(x) is convex in x, so a chord must lie above it", convex === fine.length - 2,
    `dr/dx increases at ${convex} of ${fine.length - 2} interior points`);
  checkTrue("and the interpolation always OVER-reads, as it must",
    over === total, `${over} of ${total} samples at or above the fine curve`);
  checkTrue("x beyond the mouth has no answer", at(used, fine[fine.length - 1].x * 1.5) === null,
    "returns null rather than extrapolating");
}

// ── 8. speed of sound ─────────────────────────────────────────────────────
head("Speed of sound");
// 331.3 m/s at 0 C is the standard dry-air figure, and the ideal-gas form
// scales as sqrt(T_absolute). Both endpoints are known independently.
check("331.3 m/s at 0 C", M.speedOfSound(0), 331.3, 1e-12, "m/s");
check("343.2 m/s at 20 C (standard)", M.speedOfSound(20), 343.2, 0.05, "m/s");
{
  // doubling absolute temperature must multiply c by exactly sqrt(2)
  const c1 = M.speedOfSound(-136.575), c2 = M.speedOfSound(0);   // 136.575 K -> 273.15 K
  check("c scales as sqrt(absolute temperature)", c2 / c1, Math.SQRT2, 1e-12, "x");
}

console.log(`\n${fail === 0 ? "PASSED" : "FAILED"} — ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
