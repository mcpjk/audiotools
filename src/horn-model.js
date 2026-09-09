// Horn profile physics for HornCalculator.jsx.
//
// Split out of the component on 2026-09-09 for one reason: so `node` can
// import it and check it against CLOSED FORMS. It has no React, no palette
// and no DOM, and it must stay that way — `scripts/test-horn.mjs` imports it
// under plain node, and any UI import here breaks that.
//
// THE MODEL, and the direction of error for each simplification:
//
//   * The Hypex family r(x) = rt*(cosh(mx) + T*sinh(mx)) is a 1-D
//     PLANE-WAVE construction. It says nothing about what the wavefront
//     actually looks like inside the horn, and above the frequency where
//     the throat wave stops being planar the law stops describing what
//     happens. Everything below inherits that.
//   * T is the family parameter: T = 0 is catenoidal/hyperbolic (pure
//     cosh), T = 1 is exponential. Values between interpolate. T > 1 is
//     not refused here but leaves the family's usual interpretation.
//   * f_c = mc/2pi is the FLARE CUTOFF and nothing else — it is a
//     statement about how fast the passage expands, NOT about whether the
//     mouth is big enough to load at that frequency, and NOT about whether
//     it holds pattern there. At wide coverage those three disagree by an
//     order of magnitude. Do not merge them into one "cutoff".
//   * speedOfSound uses the ideal-gas form 331.3*sqrt(1 + t/273.15). It
//     ignores humidity (which raises c by ~0.3% at 100% RH, 20 C) and
//     dispersion. Both are small against the geometry tolerances here and
//     both make the true c slightly HIGHER, so f_c is very slightly
//     under-reported.
//   * The tractrix is generated parametrically and then LINEARLY
//     interpolated onto the x grid by tractrixAtX. r(x) is CONVEX in x
//     (dr/dx increases monotonically from throat to mouth), and a chord
//     across a convex curve lies ABOVE it, so the interpolated radius is
//     slightly OVER the true one, by O(h^2) in the sample spacing.
//     Measured 0.0029 mm at the shipped nPts = 500 against a 40x finer
//     generation. Negligible at these sizes; not exact. The direction is
//     asserted in scripts/test-horn.mjs — an earlier version of this
//     comment said UNDER, from an argument made without checking.
//
// Lengths are METRES inside this module unless a name says otherwise.

export const speedOfSound = (tempC) => 331.3 * Math.sqrt(1 + tempC / 273.15);

// Hypex family: r(x) = rt * (cosh(mx) + T*sinh(mx))
// T=0 → hyperbolic (cosh), T=1 → exponential
export const hypexR = (x, rt, m, T) => {
  const mx = m * x;
  return rt * (Math.cosh(mx) + T * Math.sinh(mx));
};

export const hypexDrDx = (x, rt, m, T) => {
  const mx = m * x;
  return rt * m * (Math.sinh(mx) + T * Math.cosh(mx));
};

// Flare rate: (1/S)(dS/dx)
export const hypexFlareRate = (x, m, T) => {
  const mx = m * x;
  const num = Math.sinh(mx) + T * Math.cosh(mx);
  const den = Math.cosh(mx) + T * Math.sinh(mx);
  if (Math.abs(den) < 1e-15) return 0;
  return 2 * m * num / den;
};

// Solve for horn length given target radius ratio R = r_mouth / r_throat
// From: cosh(mL) + T*sinh(mL) = R
// Quadratic in v = e^(mL): (1+T)/2 * v² - R*v + (1-T)/2 = 0
export const hypexLengthForRatio = (R, m, T) => {
  if (R <= 1) return 0;
  const a = (1 + T) / 2;
  const b = -R;
  const c_coef = (1 - T) / 2;
  const disc = b * b - 4 * a * c_coef;
  if (disc < 0) return null;
  const v = (-b + Math.sqrt(disc)) / (2 * a);
  if (v <= 0) return null;
  return Math.log(v) / m;
};

// Tractrix profile: parametric via angle parameter t
// r(t) = Rm * sin(t),  x measured from throat
export const tractrixPoints = (rt_m, Rm, nPts = 500) => {
  if (rt_m >= Rm) return [];
  const t0 = Math.asin(rt_m / Rm);
  const pts = [];
  for (let i = 0; i <= nPts; i++) {
    const t = t0 + (Math.PI / 2 - t0) * (i / nPts);
    const r = Rm * Math.sin(t);
    // x runs from 0 AT THE THROAT to the full tractrix length at the mouth.
    // This bracket was negated until 2026-09-09, which put every x at or
    // below zero and decreasing: the SHAPE was a correct tractrix either way
    // (tangent length to the axis measures Rm exactly under both signs), but
    // the curve was traversed mouth-to-throat, so `tractrixAtX` returned null
    // for every positive x and the reported length came out negative.
    const x =
      Rm *
      (Math.cos(t) -
        Math.cos(t0) +
        Math.log(Math.tan(t / 2)) -
        Math.log(Math.tan(t0 / 2)));
    pts.push({ x, r });
  }
  return pts;
};

// Interpolate tractrix points to regular x grid
export const tractrixAtX = (tractPts, x_m) => {
  if (!tractPts.length) return null;
  for (let i = 1; i < tractPts.length; i++) {
    if (tractPts[i].x >= x_m) {
      const frac =
        (x_m - tractPts[i - 1].x) / (tractPts[i].x - tractPts[i - 1].x);
      return tractPts[i - 1].r + frac * (tractPts[i].r - tractPts[i - 1].r);
    }
  }
  return null;
};
