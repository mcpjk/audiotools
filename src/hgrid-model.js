// ═══════════════════════════════════════════════════════════════════════════
// H-GRID THROAT PARTITION — GEOMETRY, EQUALISATION AND ACOUSTIC MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
// This file carries every number the tool reports. It holds no colour and no
// React, deliberately: `scripts/test-hgrid.mjs` imports it directly under node
// and checks it against the spec's test vectors. A physics change here without
// a matching change to that script is a change that has not been verified.
// (The rest of the site keeps its physics inside the component; this tool has
// enough of it, and enough closed forms to check it against, to be worth
// separating.)
//
// ── WHAT IS BEING SOLVED ───────────────────────────────────────────────────
// Partition a circular compression-driver exit into cells of exactly equal
// open area whose connectivity is a rectangular (i,j) grid, so that each
// throat cell can be lofted to one cell of a rectangular mouth grid.
//
// Note "open" area: a cell loses t/2 along every edge it shares with a divider,
// and that is what the solve equalises once the walls have thickness. The
// GEOMETRIC areas still sum to pi R^2 exactly whatever the parameters are.
//
// The partition is an H-GRID: one (i, j) index laid on the disc, with 4
// singular vertices on the rim. A singular vertex is one where the number of
// cells meeting is not 4, and mapping a rectangular index onto a disc cannot
// avoid them — a fact about the disc, not a layout failure. That rectangular
// index is the whole reason this family was chosen: it is what lets each
// throat cell be matched to one mouth cell. (A concentric-ring O-grid has no
// singular vertices and no rectangular index either; it was the comparison
// baseline until 2026-09-03 and is recorded in CLAUDE.md.)
//
// ── GRID LINES ARE THE PRIMITIVE ───────────────────────────────────────────
// A fixed square-to-disc map with adjustable u and v division values offers
// (nc-1)+(nr-1) knobs against nc·nr-1 area constraints. For 6x3 that is a
// tensor-product grid with 4 free parameters against 5 independent constraints
// and it is PROVABLY not equal-area — the tool reports that rather than
// pretending otherwise. So each latitude and longitude line is one continuous
// curve carrying its own low-order Chebyshev coefficients, defined in the
// reference square and pushed through the seed map. A node is just where two
// lines cross; an edge is just the piece of a line between two crossings.
//
// That is far more freedom than two division vectors and far less than free
// nodes, which is the point: the parameters are legible, and there are ten of
// them for a 6x3 rather than ninety.
//
// ── THE STAGES ─────────────────────────────────────────────────────────────
// 1. SEED      a square-to-disc map, carrying the square's boundary onto the
//              circle and its corners to the requested half-angle alpha.
//              Elliptical (closed form) or conformal (Schwarz-Christoffel,
//              f'(z) = (1 - 2z^2 cos2a + z^4)^(-1/2)). Neither gives equal
//              areas. That is expected, and is what stage 2 is for.
// 2. SOLVE     SLIDERS ARE REQUESTS, NOT SETTINGS:
//                  minimise || p - p_requested ||^2_W
//                  subject to area_residuals(p) = 0
//              Requested and achieved are both reported for every parameter.
//              Positions are weighted cheap so they move freely; bows are
//              weighted expensive so the shape request survives wherever the
//              constraint leaves room.
// 3. FEASIBILITY  Unlike free nodes, whole-line curvature CANNOT always reach
//              equal area. When it cannot, the tool says so, names the binding
//              constraint, and shows how far along the request it did get —
//              never a converged-looking but distorted grid.
//
// An area-preserving stream-function flow was the previous mechanism here, and
// the fact it encodes is still true and worth knowing: in 2D a deformation
// preserves area iff its velocity field is divergence-free, and every such
// planar field is the skew gradient of a scalar stream function, v = (dpsi/dy,
// -dpsi/dx). That is why flowing every node along one preserves every cell
// area for ANY psi. With a fast solve on ten parameters it is no longer needed
// to protect the area constraint, and it is not in the build.
//
// ── ASSUMPTIONS AND THE DIRECTION OF THEIR ERROR ───────────────────────────
//  · The per-cell first mode is a flat-rectangle approximation to a curved
//    quadrilateral: f1 = c / (2 max(L_long, L_short)) with each L the mean of
//    an opposing pair of edge arc lengths. Error is O((L/r_curv)^2) and its
//    SIGN IS NOT ESTABLISHED. Strongly curved cells are flagged, not
//    corrected. Where a closed form exists — the full disc, a circular sector
//    — it is used instead, and the cell is labelled with which model ran.
//  · Payne-Weinberger's floor c/(2 d_max) holds only for CONVEX cells. A
//    crescent with a concave inner edge is not convex and the figure is
//    reported as invalid rather than quietly used.
//  · Open-area correction is first order: t/2 along every edge a cell shares
//    with a divider. Corner overlaps (~t^2/4 per junction) are ignored, which
//    makes the reported open area very slightly pessimistic.
//  · Areas are throat-plane, not spherical-wavefront. For a conical exit of
//    half-angle theta the true wavefront area is larger by 2/(1+cos theta) —
//    0.8% at 10 deg, 1.7% at 15 deg. Reported, never applied.
//  · An equal-area map cannot also be conformal unless it is a rigid motion.
//    The residual cell aspect ratios are the mandatory price of the area
//    constraint, not a solver deficiency.
//  · Line shapes are truncated at Chebyshev order 2m, so shapes needing finer
//    structure are simply unreachable. Raising m widens the feasible set and
//    shrinks the correction applied to a request, at the cost of parameters
//    the optimiser must search.
//  · Curvature is applied in PARAMETER space and pushed through the seed map,
//    so the seed still governs cell shape quality: the same bow coefficients
//    give better-shaped cells on the conformal seed than on the elliptical one.
//  · The area solve is exact to quadrature tolerance. The spread readout is the
//    ground truth, never the assumption of equality — total area closes on
//    pi R^2 by construction, but individual cells are equal only to the
//    reported solver tolerance.
//
// ═══════════════════════════════════════════════════════════════════════════

export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const NU = 1.5e-5; // kinematic viscosity of air, m^2/s
export const TV = 1.475; // 1 + (gamma-1)/sqrt(Pr) for air

// Exact Neumann eigenvalues of the full disc, as multiples of c/D: f = j' c/(pi D)
// with j'(1,1) = 1.84118378 and j'(0,1) = 3.83170597. The build spec quotes
// 0.5861435 and 1.2195790; those agree with these to four significant figures
// and give the same 5.76 kHz / 11.99 kHz on a 35.5 mm exit, so the Bessel
// roots are used rather than the rounded constants.
export const DISC_AZIMUTHAL = 1.8411837813406593 / Math.PI; // (1,0) mode
export const DISC_RADIAL = 3.8317059702075123 / Math.PI; // (0,1) mode

export const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);

// ── small linear algebra ───────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const len2 = (a) => Math.hypot(a[0], a[1]);

// Solve A x = b by Gaussian elimination with partial pivoting. A is destroyed.
// Sizes here are at most a few hundred; nothing exotic is needed.
function solveDense(A, b) {
  const n = b.length;
  const M = A.map((r, i) => r.concat([b[i]]));
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-14) return null;
    if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; }
    const piv = M[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / piv;
      if (f === 0) continue;
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// ── Gauss-Legendre nodes on [0,1] ──────────────────────────────────────────
// 8 points: exact for polynomials to degree 15. The area integrand of a
// quadratic Bezier is degree 3, so area is exact; arc length is not a
// polynomial and 8 points is simply very accurate for a curve this smooth.
const GL8_X = [
  0.0198550717512319, 0.1016667612931866, 0.2372337950418355, 0.4082826787521751,
  0.5917173212478249, 0.7627662049581645, 0.8983332387068134, 0.9801449282487681,
];
const GL8_W = [
  0.0506142681451881, 0.1111905172266872, 0.1568533229389436, 0.1813418916891810,
  0.1813418916891810, 0.1568533229389436, 0.1111905172266872, 0.0506142681451881,
];

const modPos = (a, m) => ((a % m) + m) % m;

export function polyCentroid(poly) {
  let A2 = 0, cx = 0, cy = 0;
  for (let a = 0; a < poly.length; a++) {
    const p = poly[a], q = poly[(a + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    A2 += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
  }
  A2 /= 2;
  if (Math.abs(A2) < 1e-12) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * A2), cy / (6 * A2)];
}

export function polyIsConvex(poly) {
  let sign = 0;
  for (let a = 0; a < poly.length; a++) {
    const p = poly[a], q = poly[(a + 1) % poly.length], r = poly[(a + 2) % poly.length];
    const cr = cross2(sub(q, p), sub(r, q));
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function polyDiameter(poly) {
  let d = 0;
  for (let a = 0; a < poly.length; a++)
    for (let b = a + 1; b < poly.length; b++) {
      const dd = Math.hypot(poly[a][0] - poly[b][0], poly[a][1] - poly[b][1]);
      if (dd > d) d = dd;
    }
  return d;
}

export const ellipticalMap = (u, v) => [
  u * Math.sqrt(1 - (v * v) / 2),
  v * Math.sqrt(1 - (u * u) / 2),
];

// ── complex helpers for the Schwarz-Christoffel seed ──
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cSqrt = (a) => {
  const r = Math.hypot(a[0], a[1]);
  if (r === 0) return [0, 0];
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sign(a[1] || 1) * Math.sqrt((r - a[0]) / 2);
  return [re, im];
};

// Q(z) = 1 - 2 z^2 cos2a + z^4 = (1 - z^2 e^{2ia})(1 - z^2 e^{-2ia}).
// Inside the disc each factor has positive real part, so arg Q stays in
// (-pi, pi) and the principal square root is continuous along any ray from 0.
const scQ = (z, cos2a) => {
  const z2 = cMul(z, z), z4 = cMul(z2, z2);
  return [1 - 2 * z2[0] * cos2a + z4[0], -2 * z2[1] * cos2a + z4[1]];
};

// f(z) = integral_0^z dt / sqrt(Q(t)), taken along the straight ray.
// This is the Schwarz-Christoffel map of the unit disc onto a rectangle whose
// four corners are the images of e^{±ia} and -e^{∓ia}: the exponent -1/2 at
// each prevertex is what a right angle asks for.
// The substitution s = 1 - (1-sigma)^2 is there for the endpoint: when z is a
// prevertex the integrand blows up as (1-s)^(-1/2), and this change of
// variable turns that into a constant. Away from a prevertex it costs nothing.
export function scMap(z, alpha, sub = 10) {
  const cos2a = Math.cos(2 * alpha);
  const zr = z[0], zi = z[1];
  let ar = 0, ai = 0;
  for (let k = 0; k < sub; k++)
    for (let q = 0; q < 8; q++) {
      const sg = (k + GL8_X[q]) / sub;
      const om = 1 - sg;
      const s = 1 - om * om;
      const w = (GL8_W[q] / sub) * 2 * om;
      const tr = zr * s, ti = zi * s;
      const t2r = tr * tr - ti * ti, t2i = 2 * tr * ti;
      const t4r = t2r * t2r - t2i * t2i, t4i = 2 * t2r * t2i;
      const qr = 1 - 2 * cos2a * t2r + t4r;
      const qi = -2 * cos2a * t2i + t4i;
      // 1/sqrt(Q) = conj(sqrt(Q)) / |Q|, since |sqrt(Q)|^2 = |Q|
      const mod = Math.hypot(qr, qi);
      const sr = Math.sqrt((mod + qr) / 2);
      const si = (qi < 0 ? -1 : 1) * Math.sqrt(Math.max((mod - qr) / 2, 0));
      const iv = w / mod;
      ar += iv * sr;
      ai -= iv * si;
    }
  return [ar * zr - ai * zi, ar * zi + ai * zr];
}

export function scRect(alpha) {
  return { X: scMap([1, 0], alpha)[0], Y: scMap([0, 1], alpha)[1] };
}

// Corner angle whose conformal rectangle has the requested width/height ratio.
export function scAlphaForAspect(aspect) {
  let lo = 0.5 * D2R, hi = 89.5 * D2R;
  for (let i = 0; i < 60; i++) {
    // X/Y falls monotonically with alpha: a wide rectangle wants a small corner angle
    const m = 0.5 * (lo + hi), r = scRect(m);
    if (r.X / r.Y > aspect) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

// Invert f by Newton. 1/f'(z) = sqrt(Q(z)) in closed form, so each step costs
// one quadrature of f and nothing else.
export function scInvert(w, alpha, guess, sub = 10) {
  const cos2a = Math.cos(2 * alpha);
  let z = guess;
  // Convergence is tested on the STEP, never on the residual. The residual has
  // a quadrature floor it can never get under, so a residual test either runs
  // every call to the iteration cap (if the tolerance is below the floor) or
  // returns a different answer depending on how good the starting guess was
  // (if it is above). Testing the step gives one fixed point, reached in a
  // single iteration from an already-converged warm start.
  for (let it = 0; it < 12; it++) {
    const d = cSub(scMap(z, alpha, sub), w);
    // Above the quadrature floor, so it is actually reachable — and an
    // already-converged warm start returns its cached z untouched, which is
    // what keeps repeated evaluations bit-identical.
    if (Math.hypot(d[0], d[1]) < 1e-12) break;
    const step = cMul(d, cSqrt(scQ(z, cos2a)));
    let nz = cSub(z, step);
    const rr = Math.hypot(nz[0], nz[1]);
    if (rr > 0.999999) nz = [(nz[0] / rr) * 0.999999, (nz[1] / rr) * 0.999999];
    const moved = Math.hypot(nz[0] - z[0], nz[1] - z[1]);
    z = nz;
    if (moved < 1e-14) break;
  }
  return z;
}

export const equalArcAlphaDeg = (nc, nr) => (90 * nr) / (nr + nc);
export function analyseThroat(cells, opts = {}) {
  const { c = 343, R, dividerTotal = 0 } = opts;
  const N = cells.length;
  const areas = cells.map((x) => x.area);
  const opens = cells.map((x) => x.open);
  const openMean = opens.reduce((a, b) => a + b, 0) / N;
  const openTotal = opens.reduce((a, b) => a + b, 0);
  const gross = Math.PI * R * R;

  let f1min = Infinity, f1minCell = null;
  cells.forEach((x) => { if (x.f1 < f1min) { f1min = x.f1; f1minCell = x; } });

  const blockage = 1 - openTotal / gross;
  return {
    cells, N,
    areaMean: areas.reduce((a, b) => a + b, 0) / N,
    areaTotal: areas.reduce((a, b) => a + b, 0),
    openMean, openTotal, gross,
    spread: ((Math.max(...opens) - Math.min(...opens)) / openMean) * 100,
    areaSpread: ((Math.max(...areas) - Math.min(...areas)) / (areas.reduce((a, b) => a + b, 0) / N)) * 100,
    dividerTotal,
    blockage,
    f1min, f1minCell,
    // isodiametric ceiling: cells would have to be circles, and circles do not tile
    f1ceiling: (c * Math.sqrt(N)) / (2 * 2 * R * 1e-3),
    dCeiling: (2 * R) / Math.sqrt(N),
    diaMax: Math.max(...cells.map((x) => x.dia)),
    aspectMax: Math.max(...cells.map((x) => x.aspect)),
    fUndividedAz: (DISC_AZIMUTHAL * c) / (2 * R * 1e-3),
    fUndividedRad: (DISC_RADIAL * c) / (2 * R * 1e-3),
    nonConvex: cells.filter((x) => !x.convex).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THROAT → MOUTH
// ═══════════════════════════════════════════════════════════════════════════
//
// ORDER OF OPERATIONS MATTERS. Choose the aperture surface from the DIRECTIVITY
// requirement — apparent apex position and coverage angle — then equalise path
// lengths TO it, then close the residual with S-bend padding. A surface shaped
// for routing convenience radiates its own curvature error phase-coherently,
// and no EQ removes that. So the surface is an INPUT here and is never derived
// from the paths.
//
// The cell-for-cell mapping needs a rectangular index at BOTH ends, which is
// what the H-grid supplies and why it is the only throat family here.

const v3 = (x, y, z) => [x, y, z];
const a3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const s3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const m3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cr3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm3 = (a) => Math.sqrt(dot3(a, a));
const un3 = (a) => { const n = nrm3(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Aperture surface. Spherical cap about the apex, or an oblate spheroid about
// the same apex with equatorial semi-axis flattened by `flatten` (1 = sphere).
// z(x,y) = -apex + Cz sqrt(1 - (x^2+y^2)/A^2),  Cz = apex + depth, A = flatten*Cz
// ═══════════════════════════════════════════════════════════════════════════
// EXPANSION PROFILE (HYPEX)
// ═══════════════════════════════════════════════════════════════════════════
//
// Same family the horn calculator draws: r(x) = rt (cosh mx + T sinh mx), so
// S(x) = St (cosh mx + T sinh mx)^2. T = 0 is hyperbolic (cosh, zero initial
// flare, largest throat impedance), T = 1 is exponential. The functions are
// generic in x and carry no assumption that the duct is circular, so they
// apply here to an EQUIVALENT RADIUS sqrt(area) — area ratio in, area ratio
// out — which is all a cell of any cross-section needs.
//
// WHY THIS IS ALSO THE GAP MECHANISM. Adjacent cells' centrelines fan apart
// roughly LINEARLY with distance (a radial fan from the virtual apex), while
// this profile grows CONVEXLY. Both are pinned equal at the two ends, because
// the cells tile the disc at the throat and tile the rectangle at the mouth. A
// convex curve pinned to a straight line at two points lies below it between
// them, and that dip is the gap a traditional multicell has. Modelled on the
// real centreline pitch at 6x3: max mid-path gap 7.44 mm at T = 0, 4.90 mm at
// T = 0.7, 4.20 mm at T = 1. So T sets the loading characteristic and the
// separation between ducts with one number; they are not separate features.
// The tool had no gaps before this because it had no expansion law at all —
// its emergent schedule had sqrt(A) linear in x to R^2 = 0.9915, and a
// straight line pinned to a straight line has no dip.
export const hypexR = (x, rt, m, T) => rt * (Math.cosh(m * x) + T * Math.sinh(m * x));

export function hypexLengthForRatio(ratio, m, T) {
  if (!(ratio > 1) || !(m > 0)) return null;
  const a = (1 + T) / 2, bq = -ratio, cq = (1 - T) / 2;
  const disc = bq * bq - 4 * a * cq;
  if (disc < 0) return null;
  const v = (-bq + Math.sqrt(disc)) / (2 * a);
  return v > 0 ? Math.log(v) / m : null;
}

// The inverse a cell actually needs: given the radius ratio it must reach and
// the path length it has, what m gets it there? Solved rather than asked for,
// because (fc, T) and the geometry are over-determined — pick both and the
// profile misses the mouth area, leaving an area step at the aperture. m is
// monotone increasing in the ratio it produces at fixed L and T, so bisection
// is enough, and matches how scAlphaForAspect and the seed continuation
// already solve scalar problems in this file.
export function solveHypexM(ratio, L, T = 1) {
  if (!(ratio > 1) || !(L > 0)) return 0;
  let lo = 1e-12, hi = 1e-3;
  for (let i = 0; i < 200 && hypexR(L, 1, hi, T) < ratio; i++) hi *= 2;
  if (hypexR(L, 1, hi, T) < ratio) return hi;
  // Runs to the full 200 halvings ON PURPOSE — an early exit at ~1e-15
  // relative leaves m a couple of ulps off, which is enough to push the
  // mouth-station scale outside the |k - 1| <= 1e-15 band and break the
  // exact k = 1 landing at both ends that the tests assert.
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (hypexR(L, 1, mid, T) < ratio) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// The flare constant and the cutoff it implies are the same number in two
// units: fc = mc/2pi. But m here is per MILLIMETRE while c is in m/s, so a
// factor of 1000 sits between them, and getting it wrong is a silent 1000x
// error in a readout nobody can catch by eye. Kept as a named pair of exact
// inverses so the conversion is written once and tested once.
export const fcForHypexM = (m, c) => (m * 1000 * c) / TAU;
export const hypexMForFc = (fc, c) => (TAU * fc) / (1000 * c);

// ── THE MOUTH AS A SURFACE, WITH NO APEX ────────────────────────────────────
// The aperture is stated by what it has to deliver — a horizontal arc of
// Th_h over an arc length, and a vertical arc of Th_v over its own arc length
// — and NOT by a shared apex the cells are assumed to radiate from.
//
// Why the apex had to go. It was never a design input; it was an artifact of
// building the mouth as one spherical cap, which forced horizontal and
// vertical curvature to be the same number and made "solid angle at the apex"
// look like a design criterion. It is not one: once each cell's path is
// independently controllable, the cells can be aimed to deliver whatever
// wavefront is wanted, including a cylindrical one. What the mouth owes the
// design is its SHAPE and AREA; what the paths owe it is the wavefront. Tying
// the two together through a common apex confuses a constraint with a
// construction.
//
// The surface is a swept arc: take the horizontal arc as a spine and sweep the
// vertical arc along it in the plane normal to the spine.
//
//   V(a,e) = ( (rH - rV(1-cos e)) sin a,
//              rV sin e,
//              depth - rH(1-cos a) - rV(1-cos e) cos a )
//
// It reduces EXACTLY to the old sphere-about-apex when rH = rV (verified to
// 6e-14 mm), so the spherical case is not lost, only stopped being mandatory.
// rV -> infinity is a vertically flat mouth (cylinder); rH -> infinity is a
// horizontally flat one; both -> infinity is a plane.
//
// Two properties make it a good surface to subdivide:
//   * the two parameter tangents are ORTHOGONAL, with |dV/da| = rH - rV(1-cos e)
//     independent of a and |dV/de| = rV constant. So equal d(azimuth) is
//     exactly equal area horizontally, at any curvature.
//   * the outward normal is (sin a cos e, sin e, cos a cos e), which depends on
//     NEITHER radius. It is simply the direction that angular position points,
//     which is what makes the arrival direction apex-free.
// Vertically the area weight is (1 - rV(1-cos e)/rH), so the cuts are placed at
// equal cumulative area. That one rule reduces to Lambert's equal d(sin elev)
// on the sphere and to equal d(y) on the cylinder.
export function biradialMouth({ thetaH = 90, thetaV = 40, arcH = 480, arcV = 213, depth = 200, nc = 6, nr = 3 }) {
  const aH = (thetaH / 2) * D2R, eH = (thetaV / 2) * D2R;
  const rH = aH > 1e-9 ? arcH / (2 * aH) : Infinity;
  const rV = eH > 1e-9 ? arcV / (2 * eH) : Infinity;
  const sagV = (sv) => (isFinite(rV) ? rV * (1 - Math.cos(sv / rV)) : 0);
  const yOf = (sv) => (isFinite(rV) ? rV * Math.sin(sv / rV) : sv);

  // Vertical cuts at equal AREA. The area weight is 1 - rV(1-cos(sv/rV))/rH,
  // whose integral is closed form, so this is inverted exactly rather than
  // quadratured — a sampled cumulative left ~1e-6 mm of error against the
  // sphere it is supposed to reproduce identically.
  //
  //   F(sv) = sv (1 - rV/rH) + (rV^2/rH) sin(sv/rV),   F' = 1 - sagV/rH
  //
  // At rH = rV this is r sin(e), i.e. exactly Lambert's equal d(sin elev); with
  // either radius infinite the weight is 1 and it is equal d(arc length).
  const Fcum = (sv) => (isFinite(rH) && isFinite(rV)
    ? sv * (1 - rV / rH) + ((rV * rV) / rH) * Math.sin(sv / rV)
    : sv);
  const F0 = Fcum(-arcV / 2), F1 = Fcum(arcV / 2);
  // continuous inverse: v in [0,nr] -> vertical arc position, by bisection on
  // the exact cumulative (monotone while the vertical sagitta stays under rH)
  const svAt = (v) => {
    const target = F0 + ((F1 - F0) * v) / nr;
    let lo = -arcV / 2, hi = arcV / 2;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (Fcum(mid) < target) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const point = (u, v) => {
    const sh = arcH * (u / nc - 0.5), sv = svAt(v);
    const a = isFinite(rH) ? sh / rH : 0;
    const sg = sagV(sv);
    const x = isFinite(rH) ? (rH - sg) * Math.sin(a) : sh;
    const zH = isFinite(rH) ? rH * (1 - Math.cos(a)) : 0;
    return v3(x, yOf(sv), depth - zH - sg * (isFinite(rH) ? Math.cos(a) : 1));
  };
  // the outward normal — angular position only, no radius, no apex
  const normal = (u, v) => {
    const sh = arcH * (u / nc - 0.5), sv = svAt(v);
    const a = isFinite(rH) ? sh / rH : 0;
    const e = isFinite(rV) ? sv / rV : 0;
    return v3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  };
  const P00 = point(0, nr / 2), Pnn = point(nc, nr / 2);
  const Pv0 = point(nc / 2, 0), Pvn = point(nc / 2, nr);
  return {
    rH, rV, thetaH, thetaV, arcH, arcV, depth, point, normal, svAt,
    // chord extents, the planar size a drawing would carry
    width: Math.hypot(Pnn[0] - P00[0], Pnn[1] - P00[1], Pnn[2] - P00[2]),
    height: Math.hypot(Pvn[0] - Pv0[0], Pvn[1] - Pv0[1], Pvn[2] - Pv0[2]),
    // sagitta: how far the rim falls back from the mouth centre on each axis
    sagH: isFinite(rH) ? rH * (1 - Math.cos(aH)) : 0,
    sagV: sagV(arcV / 2),
  };
}

export function apertureSurface({ apex, depth, flatten = 1 }) {
  const Cz = apex + depth;
  const A = flatten * Cz;
  return {
    apex: v3(0, 0, -apex), Cz, A, flatten,
    point(x, y) {
      const q = 1 - (x * x + y * y) / (A * A);
      return v3(x, y, -apex + Cz * Math.sqrt(Math.max(q, 1e-9)));
    },
    // surface normal of  (x^2+y^2)/A^2 + (z+apex)^2/Cz^2 = 1
    normal(P) { return un3(v3((2 * P[0]) / (A * A), (2 * P[1]) / (A * A), (2 * (P[2] + apex)) / (Cz * Cz))); },
    // the wavefront normal a spherical wave from the apparent apex would have
    wavefront(P) { return un3(v3(P[0], P[1], P[2] + apex)); },
  };
}

// Cubic Hermite centreline: leaves the throat along the exit-cone direction,
// arrives along the local wavefront normal. Tangent magnitude `tight` scales
// the chord — smaller is a tighter, more sharply turned duct.
function hermite(P0, T0, P1, T1, s) {
  const s2 = s * s, s3v = s2 * s;
  const h00 = 2 * s3v - 3 * s2 + 1, h10 = s3v - 2 * s2 + s;
  const h01 = -2 * s3v + 3 * s2, h11 = s3v - s2;
  return [
    h00 * P0[0] + h10 * T0[0] + h01 * P1[0] + h11 * T1[0],
    h00 * P0[1] + h10 * T0[1] + h01 * P1[1] + h11 * T1[1],
    h00 * P0[2] + h10 * T0[2] + h01 * P1[2] + h11 * T1[2],
  ];
}

// A trajectory from A to B, launch direction dirA to arrival direction dirB,
// with an explicit straight run of `divergeLen` mm immediately after A. This
// is DIRECTION ONLY: it says where the duct's axis points, nothing about its
// cross-section. Area shaping (the Hypex profile) is layered on top
// separately, starting at s=0, on whatever this trajectory is doing at that
// station — straight, transitioning, or anything later added between them —
// so "distance before the centreline starts curving" and "distance before
// the profile starts expanding" are deliberately two different things.
//
// The one caller (mapThroatToMouth) uses this identically for the reported
// centreline and for every boundary point's own flow, so all of them share
// the same shape of parameterisation and stay mutually consistent the way
// they already do today.
//
// divergeLen is exact PHYSICAL length for every trajectory regardless of its
// own A-to-B distance: for s <= f the point is exactly `A + dirA * (s/f) *
// divergeLen`. Where the straight run ends, `f`, is chosen per trajectory as
// divergeLen / (divergeLen + chord) — the straight run's own length against
// the Hermite's natural length scale (the same chord already used to size
// its tangents) — so a long point path and a short one each still get
// exactly `divergeLen` mm of straight travel, just at different values of
// the shared station fraction `s`. The join is C1: the Hermite's start
// tangent is set to `dirA`, matching the straight run's tangent exactly, so
// a caller finite-differencing across it (as the centreline already does)
// sees a smooth curve, not a kink.
// STRAIGHT + HERMITE + STRAIGHT, with an independent tangent magnitude at each
// end. A cubic Hermite with both endpoints and both end directions fixed has
// exactly two degrees of freedom left — the two tangent magnitudes — and
// scaling them together (one `tight`) spends both on the same thing. Splitting
// them, and adding a straight run at the mouth to mirror the one at the throat,
// is what lets curvature be pushed toward the THROAT, where the section is
// small, and kept out of the MOUTH, where it is large.
//
// The straight runs are the same G1 trick at both ends: the Hermite leaves Ap
// along dirA and arrives at Bp along dirB, so both joins are tangent-continuous
// and no kink is introduced. They also preserve the tiling invariant, because a
// shared boundary point gets the same A, dirA, B and dirB from either cell's
// call, so the whole trajectory is identical for both.
//
// Deliberately NOT a general 3-D spline. Higher order buys shape freedom and
// curvature oscillation in the same purchase, and curvature is the thing being
// controlled here.
export function buildTrajectory(A, dirA, B, dirB, opts = {}) {
  const {
    divergeLen = 0, arriveLen = 0, tight = 0.55,
    tightThroat = tight, tightMouth = tight,
  } = opts;
  const Ap = a3(A, m3(dirA, divergeLen));
  const Bp = s3(B, m3(dirB, arriveLen));
  const chord = nrm3(s3(Bp, Ap)) || 1e-9;
  const T0 = m3(dirA, tightThroat * chord * 3), T1 = m3(dirB, tightMouth * chord * 3);
  // s is split by the three runs' nominal lengths (the Hermite by its chord),
  // exactly as it was when there was only one straight run
  const total = divergeLen + chord + arriveLen;
  const f0 = divergeLen > 1e-9 ? divergeLen / total : 0;
  const f1 = arriveLen > 1e-9 ? (divergeLen + chord) / total : 1;
  return (s) => {
    if (s <= f0) return a3(A, m3(dirA, divergeLen * (f0 > 1e-9 ? s / f0 : 0)));
    if (s >= f1) return a3(Bp, m3(dirB, arriveLen * (f1 < 1 ? (s - f1) / (1 - f1) : 0)));
    return hermite(Ap, T0, Bp, T1, (s - f0) / (f1 - f0));
  };
}

// Rotation-minimising frame by double reflection (Wang et al. 2008). Parallel
// transport with no artificial spin, which is what makes the reported twist
// the duct's own twist rather than the frame's.
function rmfTransport(pts, tans, r0) {
  let r = r0;
  const out = [r];
  for (let i = 0; i < pts.length - 1; i++) {
    const v1 = s3(pts[i + 1], pts[i]);
    const c1 = dot3(v1, v1) || 1e-12;
    let rL = s3(r, m3(v1, (2 * dot3(v1, r)) / c1));
    const tL = s3(tans[i], m3(v1, (2 * dot3(v1, tans[i])) / c1));
    const v2 = s3(tans[i + 1], tL);
    const c2 = dot3(v2, v2) || 1e-12;
    r = un3(s3(rL, m3(v2, (2 * dot3(v2, rL)) / c2)));
    out.push(r);
  }
  return out;
}

export function mapThroatToMouth(throat, opts) {
  const {
    c = 343, mouthW = 200, mouthH = 100, apex = 120, depth = 150, flatten = 1,
    exitHalfAngle = 8, tight = 0.55, fTarget = 20000, t = 0,
    // Which area the expansion law is written on. "open" is the acoustically
    // meaningful one — see the note at the profile block.
    profileArea = "open",
    // THE CENTRELINE SAMPLE COUNT, AND IT IS A SAFETY NUMBER, not a
    // smoothness one. `bendFold` reads the worst curvature over the samples
    // each station stands for, so a bow feature short against `samples` has
    // its peak missed and the reported fold margin comes back OPTIMISTIC.
    // Measured on the shipped throat-fifth bow at stations 64, against the
    // converged value of 2.8529 mm:
    //   samples     64     128     256     512    1024    2048
    //   foldMin   4.455   3.980   3.349   3.034   2.871   2.853  mm
    //   optimistic +56%    +40%    +17%   +6.3%   +0.6%    0.0%
    //   preview    49      46      41      49      68     113   ms
    //   export    119      95      92      98     131     167   ms
    // The cost is FLAT to 512 and only starts rising at 1024, so 512 buys
    // almost all of the accuracy for nothing. The residual +6.3% is a known
    // ONE-SIDED bias — the metric can only be optimistic, never pessimistic —
    // and 1024 is the value to reach for if a fold margin is ever marginal.
    // Nothing else moves: over the same 64 -> 512 step, dL, Lmin, Lmax, mouth
    // area, wallSpread, fc and kMax are unchanged to four digits or better,
    // sectionObliq moves 0.9% and turnMax 2.2%.
    stations = 24, samples = 512, keepGeometry = false,
    // The signed clearance costs ~5x the rest of the mapping put together, so
    // a caller that wants a responsive readout can skip it here and run
    // ductClearance(rows) on its own schedule. Defaults ON: skipping a safety
    // measurement must be a decision, never an accident.
    computeClearance = true,
    divergeLen = 0, arriveLen = 0, profileT = null,
    tightThroat = tight, tightMouth = tight,
    // "rect" is the original: a uniform x/y lattice projected onto the cap.
    // "arc" defines the mouth by COVERAGE instead — see mouthGrid below.
    mouthMode = "rect", thetaH = 90, thetaV = 60, arcH = 480, arcV = 213,
    // "flow" = every boundary point on its own trajectory (neighbours share
    // their boundary exactly). "swept" = sections built per cell in specified
    // planes, which trades that invariant for centreline freedom.
    sectionMode = "flow",
    // ── WHERE THE SECTION PLANE POINTS (swept mode) ─────────────────────────
    // "tangent" keeps the section square to the direction of travel over the
    // whole interior, ramping onto z-hat at the throat and onto the aperture
    // normal at the mouth. That is the plane the expansion law is written on,
    // so it is the plane the sections have to be built in — see the long note
    // at `normalAt`. "bernstein" is the superseded quadratic blend, kept
    // because the tests measure the new construction against it.
    sectionAlign = "tangent",
    // How long the two ramps are, in DUCT WIDTHS of the cell's own long
    // transverse dimension. 1.5 is measured — see the ramp sweep in the tests
    // and the finding in CLAUDE.md — and both ends can be overridden in mm.
    alignWidths = 1.5, alignThroatLen = null, alignMouthLen = null,
    // ── PER-CELL PATH LENGTHENING ──
    // { lobes, dir, tol, ampCap } or null. Each cell whose centreline is
    // shorter than the longest cell's gets a lateral bow solved to close its
    // own deficit — the deficit map decides which cells move, nothing here
    // assumes rows, centres or rims. Swept mode only: in flow mode a shared
    // boundary point cannot follow two different paths, so the feature is
    // structurally unavailable there, not merely unimplemented.
    lengthen = null,
    // ── COPED-JOINT BULGE ───────────────────────────────────────────────────
    // { amp } in mm, or null. Bulges every INTERIOR shared edge of each mouth
    // cell outward into its neighbour with a sine lobe — zero at the corners,
    // so corner-maps-to-corner and the STEP curved-box topology survive — and
    // the swept loft carries the bulge back down the whole path, since the
    // interior sections interpolate the two end rings. Neighbouring ducts
    // then overlap before the mouth and meet at curved knife edges, like
    // coped pipe joints. The bulge lives in (u, v) GRID space, so the
    // outlines stay exactly on the aperture surface and normal arrival is
    // untouched; the mm amplitude is converted per edge through the measured
    // local metric. Mirror-symmetric by construction (one amplitude, sine
    // lobes), which is what keeps the union of the bulged cells equal to the
    // tiled aperture: each lobe lies inside the neighbour, so overlaps are
    // exactly the lobes and union = sum - overlaps = the tiled total.
    // Swept only: in flow mode neighbours share boundary points, and a shared
    // point cannot be given two different bulged targets.
    bulge = null,
    // ── SEPARATION FIELD ────────────────────────────────────────────────────
    // { amps, uStart, uEnd, lobes } or null. amps maps cell id to a lateral
    // displacement — { amp, dx, dy } for an explicit direction or
    // { amp, radial: true } for the cell's own outward ray — applied to the
    // centreline with the same sin^2 window the length-equalising bow uses,
    // but with the amplitude SPECIFIED rather than solved for length. This is
    // the centreline-manipulation lever that moves ducts apart where the
    // clearance is negative; `solveSeparation` chooses the amplitudes.
    // Applied BEFORE the equalising bow, so lengthening (if on) re-equalises
    // the separated paths. Swept only, like every per-cell path feature.
    separate = null,
  } = opts;
  const { nc, nr, R, rectangular = true } = opts;
  // A cell-for-cell mapping needs a rectangular index at BOTH ends. Guarded
  // rather than assumed, so a caller handing in a layout without one gets
  // null instead of a half-built map.
  if (!rectangular || !nc || !nr) return null;
  // Arc mode needs the cap to be a true SPHERE about the apex, or the
  // equal-solid-angle subdivision stops being equal-area and the mouth points
  // stop lying on the surface whose normals are used. flatten is overridden
  // rather than honoured, and reported as flattenEff so the override is
  // visible instead of silent.
  const surf = apertureSurface({ apex, depth, flatten: mouthMode === "arc" ? 1 : flatten });
  // virtual apex of the driver's own exit cone, which sets the launch direction
  const tanE = Math.tan(exitHalfAngle * D2R);
  const zLaunch = tanE > 1e-9 ? -R / tanE : -1e9;

  // ── THE MOUTH GRID ────────────────────────────────────────────────────────
  // Everything mouth-side goes through one function of GRID coordinates
  // (u, v) in [0,nc] x [0,nr], so the two parameterisations differ in one
  // place and nowhere else. Neighbours share an edge in (u, v) exactly, which
  // is what makes their boundary points identical and the sections tile —
  // that property belongs to the parameter space, not to either mode.
  //
  // "rect": a uniform x/y lattice projected onto the aperture cap. This is the
  // original and stays the default, byte-for-byte.
  //
  // "arc": the mouth is stated as COVERAGE — total Thh x Thv about the apex —
  // and the cells subdivide it at EQUAL SOLID ANGLE. On a sphere the area
  // element is dA = r^2 cos(e) da de = r^2 da d(sin e), so stepping azimuth
  // uniformly and sin(elevation) uniformly gives every cell the same solid
  // angle AND the same area, while still tiling exactly. That is the Lambert
  // equal-area arrangement, and it resolves three constraints at once:
  //
  //   equal expansion ratio  -> equal mouth area
  //   equal coverage         -> equal solid angle      } the same constraint,
  //   cell mouths tile the aperture                    } since A = r^2 * Omega
  //
  // What it gives up is equal angular WIDTH per cell: outer rows span more
  // degrees each. That is the right thing to trade, because what gets
  // specified is the TOTAL Thh and Thv, not the per-cell angle. A traditional
  // multicell makes the opposite trade — identical cells aimed on a radial
  // fan, which gets equal area and equal solid angle for free but cannot tile
  // a curved surface, leaving the flat filler webs between cell mouths that
  // are visible on any real multicell horn. Those webs are diffracting
  // discontinuities in the radiating surface; tiling avoids them.
  //
  // The cap must be a SPHERE about the apex for the equal-area argument to
  // hold, so arc mode forces flatten = 1 and reports it rather than honouring
  // a value that would silently break the property it exists to deliver.
  const arc = mouthMode === "arc";
  // The apex-free mouth: shape stated as two independent arcs, arrival
  // direction taken from the surface's own normal rather than from a common
  // radiating point. See biradialMouth for why the apex was an artifact.
  const bi = mouthMode === "biradial"
    ? biradialMouth({ thetaH, thetaV, arcH, arcV, depth, nc, nr }) : null;
  const rCap = apex + depth;
  const aHalf = (thetaH / 2) * D2R, eHalf = (thetaV / 2) * D2R;
  const sinEHalf = Math.sin(eHalf);
  const xs = [], ys = [];
  for (let i = 0; i <= nc; i++) xs.push(-mouthW / 2 + (mouthW * i) / nc);
  for (let j = 0; j <= nr; j++) ys.push(-mouthH / 2 + (mouthH * j) / nr);
  // grid coordinates -> a point on the aperture. u and v are continuous, so
  // mid-edge and mid-cell queries go through the same map as the corners.
  const mouthAt = (u, v) => {
    if (bi) return bi.point(u, v);
    if (!arc) return surf.point(-mouthW / 2 + (mouthW * u) / nc, -mouthH / 2 + (mouthH * v) / nr);
    const a = -aHalf + (2 * aHalf * u) / nc;
    const e = Math.asin(-sinEHalf + (2 * sinEHalf * v) / nr);
    const ce = Math.cos(e);
    return v3(rCap * Math.sin(a) * ce, rCap * Math.sin(e), -apex + rCap * Math.cos(a) * ce);
  };
  // The direction a duct should arrive along. For the biradial mouth this is
  // the surface's OWN normal — the aperture is chosen to be the wavefront, so
  // arriving normal to it is arriving in phase with it, and no apex is needed
  // to say so. For the legacy caps it stays the ray from the virtual apex.
  const mouthNorm = (u, v) => (bi ? bi.normal(u, v) : surf.wavefront(mouthAt(u, v)));
  // planar extent, as a readout: the chord across the cap
  const mouthWEff = bi ? bi.width : arc ? 2 * rCap * Math.sin(aHalf) : mouthW;
  const mouthHEff = bi ? bi.height : arc ? 2 * rCap * sinEHalf : mouthH;

  const lam = (c / fTarget) * 1000; // mm
  const rows = [];
  const pathOpts = { divergeLen, arriveLen, tight, tightThroat, tightMouth };
  const cellEnds = (cellRec) => {
    const P0 = v3(cellRec.centroid[0], cellRec.centroid[1], 0);
    return {
      P0,
      T0dir: un3(s3(P0, v3(0, 0, zLaunch))),
      P1: mouthAt(cellRec.i + 0.5, cellRec.j + 0.5),
      T1dir: mouthNorm(cellRec.i + 0.5, cellRec.j + 0.5),
    };
  };
  const arcLenOf = (P) => {
    let L = 0;
    for (let q = 0; q < P.length - 1; q++) L += nrm3(s3(P[q + 1], P[q]));
    return L;
  };

  // ── PER-CELL PATH LENGTHENING: THE TARGET, AND THE BOW THAT REACHES IT ───
  // The target is the LONGEST cell's base length, because a bow can only add
  // length — a short cell is bowed out to meet the long one, never the other
  // way round. Which cells move is read off the deficit map: on the biradial
  // mouth the ordering flips with depth (rim cells long when shallow, the
  // centre cell when deep), so nothing here may assume rows, centres or rims.
  //
  // The displacement window is sin^2(n·pi·u) along the arc-length fraction u:
  // zero VALUE at both ends, so the throat and mouth rings stay exactly where
  // the tiling put them, and zero SLOPE at both ends, so the launch and
  // arrival directions survive exactly — the mating face and the aim are both
  // built on those. Its added length is n^2 pi^2 a^2 / (4L) to leading order
  // (same closed form as the plain half-sine, and what the tests check), so
  // more lobes buy the same length at 1/n the amplitude — which is the whole
  // game, because amplitude is what eats the clearance between ducts.
  //
  // ── WHERE THE BOW SITS, AND WHICH WAY IT GOES ───────────────────────────
  // SUPPORT. The window spans [u0, u1] of the arc length rather than the
  // whole path. sin^2 has zero value AND zero slope at every multiple of pi,
  // so the path leaves the bowed region straight and whatever lies outside
  // the support is untouched. Two things follow. The straight runs are
  // honoured: divergeLen and arriveLen are excised from the support per cell,
  // because a run the user asked to be STRAIGHT must not be bowed — before
  // this the window ran the whole path and a 40 mm arrival run measured
  // 1.2 mm of bow through it. And the bending becomes placeable: narrowing
  // the support concentrates the turning where you put it.
  // Amplitude for a given added length goes as sqrt(span) and curvature as
  // span^-1.5, so a shorter window is a SMALLER bow that turns harder —
  // measured at 2 lobes, [0,1] needs 16.3 mm at R_min 91 mm while [0,0.35]
  // needs 7.3 mm at R_min 37 mm.
  //
  // DIRECTION. A single world axis bows every cell the same way, which breaks
  // the mirror symmetry the layout has: bow everything +y and the top row is
  // no longer the mirror of the bottom. The two fields kept are per-cell and
  // symmetric, because a symmetric mouth and a symmetric deficit map deserve
  // a symmetric horn:
  //   "radial"  the outward ray from the horn axis through this duct.
  //   "short"   the duct section's SHORT axis, oriented outward. When a duct
  //             of width w turns through angle th, its outer wall runs
  //             w * th longer than its inner wall, and that difference is
  //             phase error straight across the passage. w is the extent
  //             ALONG THE BEND NORMAL, so bending across the section's short
  //             dimension is the cheaper turn — at a 2:1 throat cell it
  //             halves the widening for the same turning. Reported as
  //             `bendWiden` and never assumed.
  // Both are mirror-covariant, so mirrored cells get mirrored bows. A duct
  // sitting exactly ON the axis has no outward direction and no lateral bow
  // can be symmetric for it, so it is left unbowed and its shortfall
  // reported rather than silently breaking the symmetry the mode exists to
  // keep.
  const snake = (() => {
    if (!lengthen || sectionMode !== "swept") return null;
    const {
      lobes = 1, dir = "radial", tol = 0.02, ampCap = 150, targetLen = null,
      uStart = 0, uEnd = 1,
      // ── REGION GRADE (owner's proposal, 2026-09-03) ──────────────────────
      // Widen the bow window with the cell's distance from the horn axis,
      // keeping the window's CENTRE fixed: the innermost cell in a row gets
      // span x (1 - grade), the outermost span x (1 + grade), everything in
      // between interpolated on its own radius.
      // THE POINT IS THE AMPLITUDE ORDERING, NOT THE TIMING. Amplitude for a
      // given added length goes as sqrt(span) (recorded), so a narrow window
      // buys its length with a SMALL displacement and a wide one with a
      // large one. Grading the span therefore makes displacement grow
      // outward while every cell still lands on the same target length — so
      // a row of cells sharing one outward direction EXPANDS instead of
      // translating, and the spacing between them opens.
      // This is NOT the rejected stagger, which shifted the windows so a
      // cell at peak displacement sat beside an undisplaced neighbour. Here
      // the windows stay concentric and only their widths differ, so the
      // cells still move together — which the stagger measurement showed is
      // the property worth keeping.
      // Mirror-safe by construction: the grade is keyed to |radius|, which a
      // mirror does not change, so mirrored cells get identical windows.
      regionGrade = 0,
    } = lengthen;
    // the OUTWARD ray from the horn axis through this duct, at mid-path,
    // where its position off the axis is representative of the whole run.
    // Mirrored cells have mirrored mid-points, so they get exactly mirrored
    // directions — that is what keeps both mirrors.
    const outward = (pts) => {
      const mid = pts[Math.round((pts.length - 1) / 2)];
      const r = Math.hypot(mid[0], mid[1]);
      return r > 1e-6 ? v3(mid[0] / r, mid[1] / r, 0) : null;
    };
    // the bow direction for one cell, from its own base centreline and its
    // own throat section
    // A fixed world axis is NOT symmetric — it keeps the mirror it lies
    // across and breaks the other — so the tool does not offer it. It stays
    // reachable from the model because the straight-path closed-form test
    // needs a direction that works on a cell sitting ON the axis, where no
    // outward ray exists.
    const AXES = { x: v3(1, 0, 0), "-x": v3(-1, 0, 0), y: v3(0, 1, 0), "-y": v3(0, -1, 0) };
    // ── THE ROW AXIS, MEASURED FROM THE CELLS THEMSELVES ───────────────────
    // The row's axis, taken END TO END across the whole row rather than from
    // a cell's immediate neighbours. Derived from the layout rather than
    // assumed from the world axes, so it follows a rotated or irregular grid;
    // taken as a LINE, since only the perpendicular is wanted, so mirrored
    // cells get exactly mirrored answers.
    // END TO END IS THE POINT, and the local difference is measurably worse.
    // The cells tile a DISC, so a row's centroids do not lie on a straight
    // line: the neighbour-to-neighbour direction at a rim cell is tilted by
    // the disc, and a perpendicular taken from it keeps part of the row
    // component the field exists to remove — measured -1.46 mm of worst gap
    // against -0.00 mm for the column line and +0.28 mm for the end-to-end
    // axis, on the same horn. End to end, the two outermost centroids of a
    // row are mirror images of one another on any layout with a vertical
    // mirror, so the axis lands exactly on the row's own direction.
    const rowAxis = new Map();
    {
      const byRow = new Map();
      for (const cc of throat.cells) {
        if (!byRow.has(cc.j)) byRow.set(cc.j, []);
        byRow.get(cc.j).push(cc);
      }
      for (const [j, list] of byRow) {
        list.sort((a, b) => a.i - b.i);
        const a = list[0].centroid, b = list[list.length - 1].centroid;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const n = Math.hypot(dx, dy);
        rowAxis.set(j, n > 1e-9 ? v3(dx / n, dy / n, 0) : null);
      }
    }
    const dirFor = (pts, cellRec) => {
      if (AXES[dir]) return AXES[dir];
      const out = outward(pts);
      if (!out || dir === "radial") return out;
      // ── "crossRow": SPEND THE CLEARANCE THE HORN ACTUALLY HAS ──────────────
      // THE CLEARANCE AROUND A CELL IS NOT ISOTROPIC, and the radial field
      // spends the scarce half of it. A throat cell is tall and narrow — at
      // the tool's defaults about 6 mm across the row against 11 mm across
      // the column — and the expansion profile opens a gap in proportion to
      // the section's extent along the line joining two neighbours, so the
      // row gap opens far more slowly than the column gap. Measured on the
      // unbowed default horn, tightest pair of each kind, signed gap in mm:
      //   station        0      4      8     12     16
      //   row pairs    0.40   0.54   1.21   2.25   3.60
      //   column pairs 0.40   0.91   5.91   9.45  13.31
      // The ratio at station 8 is about 5x. The aspect argument above
      // predicts about 2x on its own, so the centreline fan contributes as
      // well and the two have NOT been decomposed — the ratio is measured,
      // the direction of the effect is understood.
      // WHAT GOES WRONG WITHOUT IT: the outward ray of an OUTER-ROW cell
      // points diagonally, so part of its bow is spent along the row —
      // straight at a corner cell, which is the longest cell in the horn and
      // therefore carries no bow of its own. Nobody moves out of the way.
      // Measured at the shipped defaults that is the whole of the -2.61 mm
      // worst gap, on the four pairs (0,0)-(1,0), (4,0)-(5,0), (0,2)-(1,2)
      // and (4,2)-(5,2), and it is why those four and no others are the
      // deficient ones.
      // This field bows SQUARE TO THE CELL'S OWN ROW instead, oriented
      // outward, so the whole displacement goes into the column gap and none
      // of it along the row. A cell whose outward ray is itself square to
      // that direction — the centre row, which straddles the axis — has no
      // outward sense to pick and falls back to the radial field, which is
      // where the region grade does its work.
      // WHICH LINE THE PERPENDICULAR IS TAKEN FROM MATTERS, and the three
      // candidates measured 1.7 mm apart on the same horn — see the row-axis
      // note above for why end to end is the one that lands on the row.
      // WHY IT IS ALLOWED TO BE CHOSEN ON A PACKING ARGUMENT AT ALL, given
      // the standing priority at the top of CLAUDE.md: the bow exists to add
      // PATH LENGTH, and the length it adds depends on the amplitude and the
      // window span, never on the direction. Measured across the change at
      // the shipped defaults, ONLY the clearance moves:
      //   dL 0.000 both, bow ampMax 21.75 both, bendFoldMin 1.10 both,
      //   sectionObliqMax 24.39 both, wallSpreadMax 14.44 both,
      //   fluxContractMax 0.00% both, worst gap -2.61 -> +0.28 mm.
      // Both options were measured against the acoustic quantities and came
      // back equal, so the wave cannot tell them apart and only the
      // neighbours can. That is the test a construction has to pass before a
      // geometric argument is permitted to settle it.
      // IT IS NOT UNCONDITIONALLY BETTER. On a vertically CURVED mouth the
      // length deficit spreads over the outer ring instead of sitting in one
      // row, and the column gaps are not as generous — the recorded finding
      // that direction cost is geometry-dependent and must be READ still
      // stands. This is a third member of that family, not a replacement for
      // the choice.
      if (dir === "crossRow") {
        const rl = rowAxis.get(cellRec.j);
        if (!rl) return out;
        const cl = v3(-rl[1], rl[0], 0);      // square to the row, in plane
        const sg = dot3(cl, out);
        // square to the outward ray: no outward sense of its own, and any
        // choice would break one of the two mirrors
        if (Math.abs(sg) < 1e-9) return out;
        return sg >= 0 ? cl : m3(cl, -1);
      }
      // "short": the throat section's short axis as a LINE, then oriented
      // outward so the field stays mirror-covariant. iDir is the cell's own
      // u direction and sideLen 0/2 are its extent along it, so the short
      // axis is iDir when the cell is narrow across u and the perpendicular
      // when it is narrow across v.
      const iD = v3(cellRec.iDir[0], cellRec.iDir[1], 0);
      const perp = v3(-iD[1], iD[0], 0);
      const alongI = (cellRec.sideLen[0] + cellRec.sideLen[2]) / 2;
      const alongV = (cellRec.sideLen[1] + cellRec.sideLen[3]) / 2;
      const axis = alongI <= alongV ? iD : perp;
      const sg = dot3(axis, out);
      // a short axis exactly square to the outward ray has no symmetric
      // orientation of its own; fall back to the radial field, which has one
      if (Math.abs(sg) < 1e-9) return out;
      return sg >= 0 ? axis : m3(axis, -1);
    };
    // targetLen overrides the longest-cell rule — a margin above the longest,
    // or a synthetic deficit for the straight-path closed-form test. Note the
    // closed form n^2 pi^2 a^2 / (4L) holds on a STRAIGHT base path only: on
    // a curved one a lateral offset changes length at FIRST order through the
    // kappa.delta term, so the solver bisects on the measured length and the
    // formula is only its seed.
    let target = targetLen ?? 0;
    if (targetLen == null)
      for (const cellRec of throat.cells) {
        const e0 = cellEnds(cellRec);
        const tr = buildTrajectory(e0.P0, e0.T0dir, e0.P1, e0.T1dir, pathOpts);
        const P = [];
        for (let q = 0; q <= samples; q++) P.push(tr(q / samples));
        target = Math.max(target, arcLenOf(P));
      }
    // the radius spread the grade interpolates over, measured on the throat
    // centroids rather than assumed from the grid index — a cell's distance
    // from the axis is what decides which of its neighbours it bows toward
    let radMin = Infinity, radMax = 0;
    for (const cc of throat.cells) {
      const r = Math.hypot(cc.centroid[0], cc.centroid[1]);
      radMin = Math.min(radMin, r); radMax = Math.max(radMax, r);
    }
    const windowFor = (cellRec) => {
      if (!(Math.abs(regionGrade) > 1e-9) || !(radMax - radMin > 1e-9))
        return [uStart, uEnd];
      const r = Math.hypot(cellRec.centroid[0], cellRec.centroid[1]);
      const rank = (r - radMin) / (radMax - radMin);           // 0 in, 1 out
      const mid = 0.5 * (uStart + uEnd), half = 0.5 * (uEnd - uStart);
      // CONCENTRIC: the window's centre is fixed and only its width moves,
      // 1-g at the innermost cell to 1+g at the outermost.
      // TWO OTHER ANCHORINGS WERE BUILT AND MEASURED. Both grew the OUTER
      // window instead of shrinking the inner one, which produces the same
      // ordering by inflating the outer cell's displacement rather than
      // trimming the inner cell's — measured amp 20.5 -> 61.3 mm at grade 3
      // on a 325 mm path, against 20.5 -> 21.7 concentric. They avoid the
      // fold the concentric form can cause, and they are worse everywhere
      // else; the numbers are in CLAUDE.md.
      const k = 1 - regionGrade + 2 * regionGrade * rank;      // 1-g .. 1+g
      return [Math.max(0, mid - half * k), Math.min(1, mid + half * k)];
    };
    return { target, lobes, dir, dirFor, tol, ampCap, uStart, uEnd,
             regionGrade, windowFor };
  })();

  for (const cellRec of throat.cells) {
    const { i, j } = cellRec;
    const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => mouthAt(a, b));
    const mc = mouthAt(i + 0.5, j + 0.5);
    const nSurf = bi ? mouthNorm(i + 0.5, j + 0.5) : surf.normal(mc);
    const nWave = mouthNorm(i + 0.5, j + 0.5);
    const aimErr = Math.acos(Math.min(1, Math.max(-1, dot3(nSurf, nWave)))) * R2D;

    const P0 = v3(cellRec.centroid[0], cellRec.centroid[1], 0);
    const T0dir = un3(s3(P0, v3(0, 0, zLaunch)));
    const P1 = mc;
    const T1dir = nWave; // aim the duct at the apparent apex, not at the surface
    const centreTraj = buildTrajectory(P0, T0dir, P1, T1dir, pathOpts);

    // sample the centreline.
    // STATIONS ABOVE SAMPLES ALIAS OUTRIGHT — `idx = Math.round(u * M)` below
    // makes consecutive rings share a centreline point and frame — so the
    // sample count is never allowed below the station count. Measured on the
    // shipped bow, stations 192: the aliased read (samples 64) reports
    // fluxContract 0.18% and obliquity 35.47 deg against 0.06% and 32.50 for
    // the honest one, i.e. aliasing INVENTS about three quarters of a
    // contraction reading. The guard makes that unreachable rather than
    // documented.
    const M = Math.max(samples, stations), pts = [], tans = [];
    for (let q = 0; q <= M; q++) {
      const s = q / M;
      pts.push(centreTraj(s));
      const e = 1e-5;
      const a = centreTraj(Math.min(1, s + e));
      const b = centreTraj(Math.max(0, s - e));
      tans.push(un3(s3(a, b)));
    }
    let L = 0;
    const sArr = [0];
    for (let q = 0; q < M; q++) { L += nrm3(s3(pts[q + 1], pts[q])); sArr.push(L); }

    // ── apply this cell's separation displacement, if any ──────────────────
    // Same window mathematics as the snake below (sin^2 support, zero value
    // and slope at its ends, straight runs excised), amplitude fixed. Kept as
    // its own block rather than folded into the snake because the two answer
    // different questions: the snake solves an amplitude for LENGTH, this
    // applies a chosen amplitude for CLEARANCE, and they compose — a
    // separated path is just the base path the snake then equalises.
    let sepAmp = 0;
    if (separate && sectionMode === "swept" && separate.amps) {
      const ent = separate.amps[cellRec.id];
      if (ent && ent.amp > 1e-9) {
        let D = null;
        if (ent.radial) {
          const mid = pts[Math.round(M / 2)];
          const rr = Math.hypot(mid[0], mid[1]);
          if (rr > 1e-6) D = v3(mid[0] / rr, mid[1] / rr, 0);
        } else {
          const n = Math.hypot(ent.dx || 0, ent.dy || 0);
          if (n > 1e-9) D = v3(ent.dx / n, ent.dy / n, 0);
        }
        if (D) {
          const L0 = L;
          const sLobes = separate.lobes ?? 1;
          const u0 = Math.max(separate.uStart ?? 0, divergeLen > 0 ? divergeLen / L0 : 0);
          const u1 = Math.min(separate.uEnd ?? 1, arriveLen > 0 ? 1 - arriveLen / L0 : 1);
          const span = u1 - u0;
          if (span > 1e-6) {
            for (let q = 0; q <= M; q++) {
              const u = sArr[q] / L0;
              if (u < u0 || u > u1) continue;
              const w = Math.sin(sLobes * Math.PI * ((u - u0) / span)) ** 2;
              const tq = tans[q];
              let d = s3(D, m3(tq, dot3(D, tq)));
              if (!(nrm3(d) > 1e-6)) continue;
              pts[q] = a3(pts[q], m3(un3(d), ent.amp * w));
            }
            for (let q = 0; q <= M; q++)
              tans[q] = un3(s3(pts[Math.min(M, q + 1)], pts[Math.max(0, q - 1)]));
            L = 0;
            for (let q = 0; q < M; q++) { L += nrm3(s3(pts[q + 1], pts[q])); sArr[q + 1] = L; }
            sepAmp = ent.amp;
          }
        }
      }
    }

    // bow this cell out to the target length, if it is short and snaking is on
    let snakeAmp = 0, snakeShort = 0, snakeOnAxis = false, snakeSpan = 0;
    if (snake && snake.target - L > snake.tol) {
      const L0 = L;
      const deficit = snake.target - L0;
      const D = snake.dirFor(pts, cellRec);
      // a duct on the axis has no outward direction — reported, never bowed
      // in some arbitrary direction that would break the symmetry
      if (!D) { snakeOnAxis = true; snakeShort = deficit; }
      else {
      // lateral direction field: the requested direction with the tangent
      // component removed, so the bow is always square to the path
      const dHat = pts.map((_, k) => {
        const t = tans[k];
        const d = s3(D, m3(t, dot3(D, t)));
        return nrm3(d) > 1e-6 ? un3(d) : v3(0, 0, 0);
      });
      // THE SUPPORT. Requested [uStart, uEnd], with the straight runs cut
      // out of it: a run the user asked to be straight is not a place to put
      // a bow. Both are in arc-length fraction of THIS cell's own path, so a
      // run of a given mm length excises the right amount from every cell
      // whatever its length.
      const [rq0, rq1] = snake.windowFor(cellRec);
      const u0 = Math.max(rq0, divergeLen > 0 ? divergeLen / L0 : 0);
      const u1 = Math.min(rq1, arriveLen > 0 ? 1 - arriveLen / L0 : 1);
      const span = u1 - u0;
      snakeSpan = span;
      // the runs (or the request) have squeezed the support to nothing: there
      // is nowhere left to put a bow, so say so rather than iterating to the
      // amplitude cap against a window that is identically zero
      if (!(span > 1e-6)) { snakeShort = deficit; }
      else {
      const win = sArr.map((s) => {
        const u = s / L0;
        if (u < u0 || u > u1) return 0;
        return Math.sin(snake.lobes * Math.PI * ((u - u0) / span)) ** 2;
      });
      const bowed = (a) => pts.map((p, k) => a3(p, m3(dHat[k], a * win[k])));
      const lenAt = (a) => arcLenOf(bowed(a));
      // closed-form seed a = 2 sqrt(L dL) / (n pi), then bisection on the
      // MEASURED length — the closed form is leading-order, the path is
      // curved, and the solver must land on the real thing
      // closed-form seed on the SPAN the window actually occupies
      let hi = (2 * Math.sqrt(Math.max(span, 1e-6) * L0 * deficit)) / (Math.PI * snake.lobes) * 1.25;
      for (let it = 0; it < 40 && lenAt(hi) < snake.target && hi < snake.ampCap; it++) hi *= 1.4;
      hi = Math.min(hi, snake.ampCap);
      let lo = 0;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        if (lenAt(mid) < snake.target) lo = mid; else hi = mid;
        if (hi - lo < 1e-7) break;
      }
      snakeAmp = (lo + hi) / 2;
      const newPts = bowed(snakeAmp);
      for (let q = 0; q <= M; q++) pts[q] = newPts[q];
      // tangents from the displaced points. The window's slope is zero at the
      // ends, so the end tangents come back as the launch and arrival
      // directions they were.
      for (let q = 0; q <= M; q++)
        tans[q] = un3(s3(pts[Math.min(M, q + 1)], pts[Math.max(0, q - 1)]));
      L = 0;
      for (let q = 0; q < M; q++) { L += nrm3(s3(pts[q + 1], pts[q])); sArr[q + 1] = L; }
      // capped short of the target: reported, never silently absorbed
      snakeShort = Math.max(0, snake.target - L);
      }
      }
    }

    // total turning angle, and where the trailing run stops being straight
    let turn = 0;
    const kappa = [];
    for (let q = 0; q <= M; q++) {
      const qa = Math.max(1, Math.min(M - 1, q));
      const d1 = m3(s3(pts[qa + 1], pts[qa - 1]), M / 2);
      const d2 = m3(a3(s3(pts[qa + 1], pts[qa]), s3(pts[qa - 1], pts[qa])), M * M);
      const k = nrm3(cr3(d1, d2)) / Math.pow(nrm3(d1) || 1e-9, 3);
      kappa.push(k);
    }
    // WHERE the bending happens, not just how much. The arc-length centroid of
    // curvature, as a fraction of the path: 0 is all the turning at the throat,
    // 1 all of it at the mouth. This is the number the path knobs are aimed at
    // — the design wants curvature pushed toward the throat, where the section
    // is small, and kept out of the mouth, where it is large — and without it
    // "reduce curvature where area is large" is not a measurable claim.
    let turnMoment = 0;
    for (let q = 0; q < M; q++) {
      const ds = sArr[q + 1] - sArr[q];
      const km = 0.5 * (kappa[q] + kappa[q + 1]);
      turn += km * ds;
      turnMoment += km * ds * 0.5 * (sArr[q] + sArr[q + 1]);
    }
    const bendCentroid = turn > 1e-12 && L > 1e-9 ? (turnMoment / turn) / L : 0.5;

    // twist: transport the cell's +i direction and compare with the mouth's +x
    const throatI = v3(cellRec.iDir[0], cellRec.iDir[1], 0);
    let r0 = un3(s3(throatI, m3(tans[0], dot3(throatI, tans[0]))));
    if (!(nrm3(r0) > 0.5)) r0 = un3(cr3(tans[0], v3(0, 0, 1)));
    const frames = rmfTransport(pts, tans, r0);
    const rEnd = frames[frames.length - 1];
    const mouthI = un3(s3(mouthAt(i + 1, j + 0.5), mouthAt(i, j + 0.5)));
    const mI = un3(s3(mouthI, m3(tans[M], dot3(mouthI, tans[M]))));
    const sTw = un3(cr3(tans[M], rEnd));
    const twist = Math.atan2(dot3(mI, sTw), dot3(mI, rEnd)) * R2D;

    // ── SECTION GEOMETRY: EVERY BOUNDARY POINT FLOWS ON ITS OWN ─────────────
    // A point's trajectory depends only on where that POINT starts in the
    // throat plane and where it lands on the aperture — never on which cell it
    // belongs to. Two neighbours share their boundary points exactly, so they
    // share the whole boundary at every station and can neither gap nor
    // interpenetrate. That is the entire reason for doing it this way.
    //
    // What this replaced: each cell used to blend its own outline from throat
    // to mouth inside its own rotation-minimising frame, eighteen independent
    // constructions with nothing coupling them. They tiled at the two ends,
    // where both grids tile by construction, and in between they drifted
    // through each other — 2.8 to 5.8 mm deep, about a fifth of every section's
    // boundary points inside the neighbour, from station 1 onward. That made
    // the duct set unrealisable as separate passages and the area schedule
    // optimistic, because it summed cross-sections sharing the same space.
    //
    // A flowed section is NOT planar in general, and should not be: the mouth
    // outline already lies on a curved aperture. Areas are the magnitude of the
    // vector area, which reduces to the planar area when the section is planar.
    const nMs = 16; // 64 points round the outline — coarser under-measures a curved throat cell
    // Interpolated in GRID coordinates, not in x/y. Two neighbours share an
    // edge exactly in (u, v), so they generate identical boundary points there
    // whichever mode is active — the tiling invariant lives in the parameter
    // space, and moving the mouth to arc angles cannot disturb it.
    const mouthUV = [];
    for (let e = 0; e < 4; e++) {
      const quad = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const A = quad[e], B = quad[(e + 1) % 4];
      for (let q = 0; q < nMs; q++) {
        const u = q / nMs;
        mouthUV.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]);
      }
    }
    // The bulge, applied in (u, v) before anything reads mouthUV. The
    // unbulged outline is kept: its area is this cell's share of the UNION,
    // which is what the aperture-total figures must keep reading — summing
    // bulged outlines double-counts every overlap lens.
    const bulgeOn = bulge && sectionMode === "swept" && bulge.amp > 1e-9 ? bulge : null;
    const mouthUVTiled = bulgeOn ? mouthUV.map((p) => p.slice()) : null;
    if (bulgeOn) {
      const sides = [
        { out: [0, -1], interior: j > 0 },
        { out: [1, 0], interior: i + 1 < nc },
        { out: [0, 1], interior: j + 1 < nr },
        { out: [-1, 0], interior: i > 0 },
      ];
      for (let e = 0; e < 4; e++) {
        const sd = sides[e];
        if (!sd.interior) continue;   // a rim edge never bulges — the aperture total is invariant
        // mm per (u, v) unit along the outward direction, measured at the
        // edge midpoint — numeric, so every mouth mode gets its exact metric
        const mid = mouthUV[e * nMs + (nMs >> 1)];
        const h = 1e-3;
        const Pa = mouthAt(mid[0], mid[1]);
        const Pb = mouthAt(mid[0] + sd.out[0] * h, mid[1] + sd.out[1] * h);
        const metric = nrm3(s3(Pb, Pa)) / h;
        // the lobe must stay strictly inside the neighbour or the union
        // identity (and the knife edge) is lost — clamp, and report it
        const du = Math.min(bulgeOn.amp / Math.max(metric, 1e-9), 0.45);
        for (let q = 0; q < nMs; q++) {
          const w = du * Math.sin(Math.PI * (q / nMs));
          mouthUV[e * nMs + q][0] += sd.out[0] * w;
          mouthUV[e * nMs + q][1] += sd.out[1] * w;
        }
      }
    }

    // Corner MUST map to corner. The mouth outline above is laid down a side at
    // a time, nMs points each, so its four corners sit at 0, nMs, 2nMs, 3nMs.
    // Resampling the throat outline round the whole loop by arc length instead
    // puts its corners wherever the side lengths land — for a 2.5:1 cell that
    // is index 22.8 against the mouth's 16 — and a throat CORNER would then
    // flow to the middle of a mouth EDGE. Resample side by side instead.
    const centred = cellRec.poly.map((p) => [p[0] - cellRec.centroid[0], p[1] - cellRec.centroid[1]]);
    const sidesOf = cellSides(centred);
    const throatLocal = sidesOf
      ? sidesOf.flatMap((sd) => resampleOpen(sd, nMs))
      : resamplePoly(centred, mouthUV.length);

    // one Hermite per boundary point, launched down the exit cone and aimed at
    // the apparent apex, exactly as the centreline is
    const traj = throatLocal.map((p, k) => {
      const A = v3(p[0] + cellRec.centroid[0], p[1] + cellRec.centroid[1], 0);
      const B = mouthAt(mouthUV[k][0], mouthUV[k][1]);
      const dirA = un3(s3(A, v3(0, 0, zLaunch)));
      const dirB = mouthNorm(mouthUV[k][0], mouthUV[k][1]);
      return buildTrajectory(A, dirA, B, dirB, pathOpts);
    });

    // vector area of a closed space polygon: half the sum of p_k x p_(k+1)
    const vecArea = (ring) => {
      let ax = 0, ay = 0, az = 0;
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], b = ring[(k + 1) % ring.length];
        ax += a[1] * b[2] - a[2] * b[1];
        ay += a[2] * b[0] - a[0] * b[2];
        az += a[0] * b[1] - a[1] * b[0];
      }
      return [ax / 2, ay / 2, az / 2];
    };

    // ── SECTION CONSTRUCTION: FLOWED, OR SWEPT IN SPECIFIED PLANES ─────────
    // "flow" is the construction described above: every boundary point on its
    // own trajectory, so neighbours share their whole boundary and can neither
    // gap nor interpenetrate. It stays the default.
    //
    // "swept" builds each cell's sections independently, in planes SPECIFIED
    // along its own centreline, and lets the expansion profile drive their
    // scale directly. It gives up the shared-boundary invariant ON PURPOSE:
    // that is what makes centreline manipulation possible, and centreline
    // manipulation is the only mechanism that can lengthen an interior cell's
    // path. The overlap it admits is measured by the SIGNED clearance metric,
    // which was calibrated against the k <= 1 proof while the flow still held.
    //
    // Two things make this different from the construction that failed two
    // sessions ago with 2.8-5.8 mm of undetected interpenetration:
    //
    //  1. THE SECTION PLANE IS SPECIFIED, NOT INHERITED FROM THE TANGENT.
    //     Sweeping perpendicular to the tangent tilts station 0 down the exit
    //     cone — the recorded 6.85 deg, +-0.5 mm bug — and eighteen ducts each
    //     tilted their own way have no common face to seat on the driver. The
    //     section normal is blended z-hat -> tangent -> aperture normal on a
    //     quadratic Bernstein basis, so it is EXACTLY z-hat at s = 0 and
    //     EXACTLY the aperture normal at s = 1.
    //  2. THE TWIST IS IMPOSED AND DISTRIBUTED, NOT MERELY MEASURED. The
    //     rotation-minimising frame does not arrive aligned with the mouth
    //     quad; the residual roll is computed at BOTH ends and interpolated
    //     along the path. Without it the section lands rotated against the
    //     mouth and a throat corner flows to the middle of a mouth edge.
    //
    // Both end rings are reconstructed from their own frames as full 3-D local
    // offsets — including the out-of-plane component, because the mouth
    // outline lies on a curved cap and is not planar. That makes s = 0 the
    // throat polygon exactly and s = 1 the mouth quad exactly, so the driver
    // mating face and the mouth tiling both survive: neighbours still share
    // those two rings point for point. Only the interior is free.
    const rings = [];
    // diagnostics for the imposed twist: the roll applied at each end, and the
    // residual angle left between the rolled axis and the mouth's own +x. The
    // residual is the number that says the roll actually LANDED — end-ring
    // exactness cannot show it, because the rings are rebuilt from their own
    // local coordinates and would come out exact whatever the frame did.
    let sweptRoll = null;
    if (sectionMode !== "swept") {
      for (let q = 0; q <= stations; q++) rings.push(traj.map((tr) => tr(q / stations)));
    } else {
      const throatWorld = throatLocal.map((q) => v3(q[0] + cellRec.centroid[0], q[1] + cellRec.centroid[1], 0));
      const mouthWorld = mouthUV.map((q) => mouthAt(q[0], q[1]));
      const zHat = v3(0, 0, 1);
      // ── WHERE THE SECTION PLANE POINTS, AND WHY IT IS AN ACOUSTIC CHOICE ──
      // A horn's expansion law is a statement about the area the wave passes
      // THROUGH, which is the section normal to the direction of propagation.
      // A section tilted by th relative to travel carries |A| of surface but
      // only |A| cos(th) of passage, so the law lands on the wrong quantity by
      // exactly that factor, and it does so wherever the tilt is — which means
      // the horn stops delivering the schedule it was solved for.
      //
      // Three directions have a claim on the section plane, and each claim is
      // acoustic rather than geometric:
      //   z-hat AT THE THROAT — the driver hands over a planar wavefront on
      //     its own exit face, and that face has to be flat to seat on. The
      //     claim is real but it is LOCAL: the wave stops being plane-parallel
      //     as soon as it has crossed the duct once.
      //   n_surf AT THE MOUTH — the biradial aperture IS the wavefront the
      //     design aims to launch, which is the whole reason the ducts arrive
      //     along its normal. Also local: the duct already arrives along
      //     n_surf, so near the mouth the tangent and n_surf agree anyway.
      //   THE TANGENT EVERYWHERE ELSE — in between, the wave goes where the
      //     duct goes, and the cross-section that matters is square to it.
      //
      // The construction that was here spread the three over the whole path on
      // a quadratic Bernstein basis, so the tangent's weight was 2u(1-u) —
      // never more than 0.5, and under 0.06 at u = 0.03. That is fine while the
      // path is gentle (it measured 2-4 deg of tilt on an unbowed horn) and it
      // fails exactly where a bow puts curvature: measured 53.6 deg of tilt at
      // u = 0.031 with the shipped throat-fifth bow, with the travel direction
      // 56.5 deg off z-hat while the section plane had moved 3.0 deg. The
      // passage then CONTRACTED 27% below its own throat area while the ring
      // areas grew along the law, because the law was being satisfied in a
      // plane the wave was not crossing.
      //
      // So the two end claims are honoured over a RAMP each and the tangent is
      // followed everywhere between. Both ramps use smoothstep, which has zero
      // value and zero slope at each end, so the normal field is C1 and the
      // loft picks up no kink where a ramp begins or ends.
      //
      // The ramp LENGTHS are physical, not parametric: the reorientation
      // happens over a few duct widths, because that is the distance in which
      // the wave crosses the passage and forgets the flat exit. Stated in mm
      // and converted per cell, so the same reasoning holds on any horn size,
      // and floored at two station steps so a coarse preview still renders the
      // ramp smoothly rather than stepping through it.
      // The width used is the cell's LONG transverse dimension — the same one
      // `f1` is keyed on, since it is the slowest crossing and therefore the
      // one that sets how far downstream the exit plane is still felt.
      const wCell = cellRec.Llong > 1e-9
        ? cellRec.Llong : Math.sqrt((4 * Math.max(cellRec.area, 1e-9)) / Math.PI);
      const rampT = alignThroatLen != null ? alignThroatLen : alignWidths * wCell;
      const rampM = alignMouthLen != null ? alignMouthLen : alignWidths * wCell;
      const fracOf = (mm) => Math.min(0.25, Math.max(2 / stations, L > 1e-9 ? mm / L : 0));
      const uT = fracOf(rampT), uM = fracOf(rampM);
      const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      const normalAt = (u, T) => {
        let w0, w1, w2;
        if (sectionAlign === "bernstein") {
          // the superseded construction, kept as the comparison baseline the
          // tests measure the new one against — never as a live default
          w0 = (1 - u) * (1 - u); w1 = 2 * u * (1 - u); w2 = u * u;
        } else {
          w0 = u <= 0 ? 1 : 1 - smooth01(u / uT);
          w2 = u >= 1 ? 1 : smooth01((u - (1 - uM)) / uM);
          w1 = 1 - w0 - w2;
        }
        const n = v3(
          w0 * zHat[0] + w1 * T[0] + w2 * nSurf[0],
          w0 * zHat[1] + w1 * T[1] + w2 * nSurf[1],
          w0 * zHat[2] + w1 * T[2] + w2 * nSurf[2]);
        // the three claims can only cancel if the path doubles back on itself,
        // which is a geometry to report rather than a case to blend through
        return nrm3(n) > 1e-9 ? un3(n) : un3(T);
      };
      // in-plane axis from the transported frame, projected into the section
      const axisAt = (n, r) => {
        let a = s3(r, m3(n, dot3(r, n)));
        if (!(nrm3(a) > 1e-9)) a = s3(v3(1, 0, 0), m3(n, n[0]));
        return un3(a);
      };
      const rollTo = (n, from, to) =>
        Math.atan2(dot3(cr3(from, to), n), dot3(from, to));
      // the residual roll at each end, which is what gets distributed
      const n0 = normalAt(0, tans[0]), n1 = normalAt(1, tans[M]);
      const a0 = axisAt(n0, frames[0]), a1 = axisAt(n1, rEnd);
      const want0 = un3(s3(throatI, m3(n0, dot3(throatI, n0))));
      const want1 = un3(s3(mouthI, m3(n1, dot3(mouthI, n1))));
      const phi0 = rollTo(n0, a0, want0), phi1 = rollTo(n1, a1, want1);
      const rolled = (n, aRaw, phi) =>
        un3(a3(m3(aRaw, Math.cos(phi)), m3(cr3(n, aRaw), Math.sin(phi))));
      const resid = (n, aRaw, phi, want) =>
        Math.abs(Math.atan2(dot3(cr3(rolled(n, aRaw, phi), want), n),
          dot3(rolled(n, aRaw, phi), want))) * R2D;
      sweptRoll = {
        phi0Deg: phi0 * R2D, phi1Deg: phi1 * R2D,
        residThroatDeg: resid(n0, a0, phi0, want0),
        residMouthDeg: resid(n1, a1, phi1, want1),
      };
      const frameAt = (u, idx) => {
        const T = tans[idx], n = normalAt(u, T);
        const aRaw = axisAt(n, frames[idx]);
        // smoothstep so the twist rate is zero at both ends rather than
        // stepping on at the throat, where the mating face has to stay put
        const g = u * u * (3 - 2 * u);
        const phi = phi0 * (1 - g) + phi1 * g;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const uAx = un3(a3(m3(aRaw, cp), m3(cr3(n, aRaw), sp)));
        return { n, u: uAx, v: cr3(n, uAx) };
      };
      // both end rings as 3-D offsets in their own frames. The out-of-plane
      // component is kept, or the curved mouth outline could not be rebuilt.
      const F0 = frameAt(0, 0), F1 = frameAt(1, M);
      const toLocal = (P, C, F) => {
        const d = s3(P, C);
        return [dot3(d, F.u), dot3(d, F.v), dot3(d, F.n)];
      };
      const lo0 = throatWorld.map((P) => toLocal(P, pts[0], F0));
      const lo1 = mouthWorld.map((P) => toLocal(P, pts[M], F1));
      for (let q = 0; q <= stations; q++) {
        const u = q / stations, idx = Math.round(u * M);
        const F = frameAt(u, idx), C = pts[idx];
        const h = u; // shape morphs linearly; the profile sets the area
        rings.push(lo0.map((A, k) => {
          const B = lo1[k];
          const x = A[0] + (B[0] - A[0]) * h;
          const y = A[1] + (B[1] - A[1]) * h;
          const z = A[2] + (B[2] - A[2]) * h;
          return v3(
            C[0] + x * F.u[0] + y * F.v[0] + z * F.n[0],
            C[1] + x * F.u[1] + y * F.v[1] + z * F.n[1],
            C[2] + x * F.u[2] + y * F.v[2] + z * F.n[2]);
        }));
      }
    }

    // ── EXPANSION PROFILE, AND THE GAP IT OPENS ─────────────────────────────
    // The flowed sections tile: neighbours share their boundary exactly, so
    // there is no room between ducts. Scaling each section about its own
    // centroid to the area an expansion law asks for is what makes room —
    // where the profile wants LESS than the tiling configuration has, every
    // cell shrinks inward from the shared wall and a gap opens. It cannot
    // cause overlap, because shrinking only ever moves a boundary away from
    // its neighbour. k > 1 is the failure case and is what the clearance
    // metric below exists to catch.
    //
    // m is SOLVED rather than asked for. (fc, T) and the geometry are
    // over-determined: pick both and the profile misses the cell's mouth area,
    // leaving an area step at the aperture. Solving m so the profile lands
    // exactly on the mouth area at this cell's own path length makes k = 1 at
    // both ends by construction — the throat mating face and the mouth tiling
    // are therefore untouched, whatever T is — and turns fc into a readout of
    // the loading you actually got.
    // ── WHICH AREA THE LAW IS WRITTEN ON ────────────────────────────────────
    // The wave travels through the OPEN passage: the cell outline less the
    // half-divider taken off each shared side. The gross outline is a
    // bookkeeping boundary that includes wall the wave never sees, so a
    // gross-to-gross ratio understates the real expansion and reports fc lower
    // than the horn actually delivers.
    //
    // This is NOT a change of reference constant. The inset is a fixed t/2
    // OFFSET, not a proportion, so scaling a section by k does not scale its
    // open area by k^2 — the target has to be solved for k at each station.
    // At the mouth the taper reaches zero, so open IS gross there and the
    // solve collapses to the closed form, which is what keeps k = 1 exact.
    //
    // Both ends still land on k = 1, which is what keeps the throat mating
    // face and the mouth tiling exact:
    //   station 0 — open(1 x ring) is A_open by definition, and A_open is the
    //               law's own starting value
    //   station L — the inset has tapered to nothing, so open is gross, and m
    //               was solved to put the law exactly on the mouth area
    // Enlarging the outline to give back what the wall takes is the same
    // argument as the shell oversize in `fabrication`, applied per station.
    let profM = null, profFc = null, profScaleMin = 1, profScaleMax = 1;
    let profRatio = null, profK = null, profKMaxAt = 0, profRatioGross = null;
    if (profileT != null) {
      const rimSide = cellRec.rimSide || [false, false, false, false];
      // per-side inset at a station, exactly as ductSections applies it
      const insetAt = (u) => {
        if (!(t > 0)) return null;
        const taper = 1 - u;
        if (taper <= 1e-12) return null;
        const d = rimSide.map((isRim) => (isRim ? 0 : (t / 2) * taper));
        return d.some((v) => v > 0) ? d : null;
      };
      const openArea = (ring, d) => (d ? polyArea3(insetSection3(ring, d)) : nrm3(vecArea(ring)));
      const scaleRing = (ring, k) => {
        const n = ring.length, ctr = [0, 0, 0];
        for (const q of ring) { ctr[0] += q[0] / n; ctr[1] += q[1] / n; ctr[2] += q[2] / n; }
        return ring.map((q) => [
          ctr[0] + (q[0] - ctr[0]) * k,
          ctr[1] + (q[1] - ctr[1]) * k,
          ctr[2] + (q[2] - ctr[2]) * k,
        ]);
      };
      const useOpen = profileArea === "open";
      const d0 = useOpen ? insetAt(0) : null;
      const A0 = useOpen ? openArea(rings[0], d0) : nrm3(vecArea(rings[0]));
      const AL = nrm3(vecArea(rings[stations])); // no dividers left at the mouth
      const ratio = A0 > 1e-12 ? Math.sqrt(AL / A0) : 1;
      profRatio = ratio;
      profRatioGross = Math.sqrt(AL / Math.max(1e-12, nrm3(vecArea(rings[0]))));
      profM = solveHypexM(ratio, L, profileT);
      profFc = fcForHypexM(profM, c);
      // k is kept PER STATION, not just as a range. k > 1 is the one way this
      // construction can push two ducts together, so which stations it happens
      // at is the actionable part — a range says only that it happened.
      profK = new Array(stations + 1).fill(1);
      for (let q = 0; q <= stations; q++) {
        const u = q / stations;
        const want = A0 * hypexR(sArr[Math.round(u * M)], 1, profM, profileT) ** 2;
        const dq = useOpen ? insetAt(u) : null;
        const gross = nrm3(vecArea(rings[q]));
        let k;
        if (!dq) {
          // no wall to give back here, so the k^2 closed form is exact
          k = gross > 1e-12 ? Math.sqrt(want / gross) : 1;
        } else {
          // OPEN AREA IS EXACTLY QUADRATIC IN k, so this is closed form and
          // not an iteration. Scaling a section about its centroid by k
          // scales its area as k^2 and every side length as k, while the
          // inset depth is a FIXED offset and the corner mitres depend only
          // on the angles, which scaling leaves alone. So
          //     open(k) = A k^2 - L k + C
          // and three evaluations determine A, L and C exactly. Verified
          // against direct evaluation at k = 0.85 to 1.5: worst residual
          // 2.4e-12 relative, most of it 3e-14.
          //
          // This replaced a seed-plus-secant that ran up to 24 iterations per
          // station. It used to be affordable because the inset only existed
          // over the first third of the path; once the taper ran the whole
          // way it cost 115 ms of a 184 ms mapping, which is the interactive
          // path. Now it is three evaluations and one guarded polish.
          // The k^2 coefficient is the GROSS area and is already known — at
          // large k the fixed inset is negligible and open(k) -> A k^2 — so
          // only two evaluations are needed for the remaining two unknowns.
          const O = (kk) => openArea(scaleRing(rings[q], kk), dq);
          const h = 0.1;
          const a2 = gross;
          const y1 = O(1), y2 = O(1 + h);
          const b2 = (a2 * (2 * h + h * h) - (y2 - y1)) / h * -1;
          const c2 = y1 - a2 - b2;
          let k0 = null;
          if (a2 > 1e-12) {
            const disc = b2 * b2 - 4 * a2 * (c2 - want);
            if (disc >= 0) {
              const root = (-b2 + Math.sqrt(disc)) / (2 * a2);
              if (root > 1e-6 && isFinite(root)) k0 = root;
            }
          }
          // degenerate section: fall back to the first-order seed rather than
          // returning a scale that was never solved
          if (k0 == null) {
            const dP = Math.max(0, gross - openArea(rings[q], dq));
            k0 = (dP + Math.sqrt(dP * dP + 4 * gross * want)) / (2 * gross);
          }
          // one Newton step against the TRUE area, to absorb the last ulps of
          // the fit and to catch any section the quadratic does not describe
          const f0 = O(k0) - want;
          if (Math.abs(f0) > 1e-12 * want) {
            const slope = 2 * a2 * k0 + b2;
            if (Math.abs(slope) > 1e-12) {
              const kn = k0 - f0 / slope;
              if (kn > 1e-6 && isFinite(kn) && Math.abs(O(kn) - want) < Math.abs(f0)) k0 = kn;
            }
          }
          k = k0;
        }
        profK[q] = k;
        profScaleMin = Math.min(profScaleMin, k);
        if (k > profScaleMax) { profScaleMax = k; profKMaxAt = q; }
        if (Math.abs(k - 1) > 1e-15) rings[q] = scaleRing(rings[q], k);
      }
    }

    // ── HOW MUCH LONGER THE OUTER WALL RUNS THAN THE INNER ─────────────────
    // A duct of width w turning through angle dth puts w * dth more length on
    // its outer wall than its inner one, and that difference is phase error
    // straight across the passage, measured here on the real geometry rather
    // than estimated from one nominal width. (`turnLimitDeg` was that
    // estimate; it read ~100x over budget on every geometry, with or without
    // bows, so it was useless as a threshold and has been removed.)
    // w is the section's extent ALONG THE BEND NORMAL, so it is the width in
    // the plane the duct is actually turning in: bending across a section's
    // short dimension is a cheaper turn than bending across its long one,
    // which is what the "short" bow direction exists to exploit. Integrated
    // over the path and reported in mm, against the lambda/8 budget.
    // `bendFold` rides in the same loop and is the price of squaring the
    // sections to the path. A section swept around a bend of radius R sweeps
    // its inner edge around a SMALLER radius, and once the inner edge reaches
    // the centre of curvature the swept solid turns itself inside out — the
    // torus condition, a > R for a section of inner half-extent a, and exact
    // as a criterion — though the kappa it reads is only as good as the
    // centreline sampling, so the margin comes out an UPPER bound on a bow
    // whose feature is short against `samples`. The old Bernstein blend hid
    // this case by leaving the section oblique, which is not a fix: the solid
    // was legal because the passage was wrong. Reported in mm of clearance,
    // negative meaning folded.
    let bendWiden = 0, bendFold = Infinity, bendFoldAt = 0;
    for (let q = 0; q < stations; q++) {
      const idx = Math.round((q / stations) * M), nx = Math.min(M, idx + 1), pv = Math.max(0, idx - 1);
      const d1 = s3(pts[nx], pts[pv]);
      const d2 = a3(s3(pts[nx], pts[idx]), s3(pts[pv], pts[idx]));
      const t = un3(d1);
      // the component of the second difference square to the path IS the
      // bend normal; a straight stretch has none and contributes nothing
      const nvec = s3(d2, m3(t, dot3(d2, t)));
      if (!(nrm3(nvec) > 1e-12)) continue;
      const nHat = un3(nvec);
      const ring = rings[q];
      let lo = Infinity, hi = -Infinity;
      for (const pt of ring) { const e = dot3(pt, nHat); if (e < lo) lo = e; if (e > hi) hi = e; }
      const dth = 0.5 * (kappa[q === stations ? M : idx] + kappa[nx]) *
        (sArr[Math.min(M, idx + 1)] - sArr[Math.max(0, idx - 1)]) / 2;
      bendWiden += (hi - lo) * dth;
      // nHat points at the centre of curvature, so the ring's largest reach
      // along it, measured from the centreline point the curvature belongs to,
      // is the inner half-extent.
      // The curvature is taken as the WORST over the centreline samples this
      // station stands for, never the value at the station itself: kappa is a
      // property of the path and a bow can put its peak between two stations,
      // where a station-point reading would miss it. On the shipped
      // throat-fifth bow the station-point form read more than TWICE the
      // margin at 24 stations that it read at 64 — it got safer the less you
      // looked. The ring's extent, by contrast, varies slowly, so pairing the
      // worst local curvature with the station's own ring is the conservative
      // reading; it leaves a 7% spread over the same range.
      const half = Math.max(1, Math.round(M / (2 * stations)));
      let kq = 0;
      for (let z = Math.max(0, idx - half); z <= Math.min(M, idx + half); z++)
        kq = Math.max(kq, kappa[z]);
      if (kq > 1e-12) {
        let inner = -Infinity;
        for (const pt of ring) inner = Math.max(inner, dot3(s3(pt, pts[idx]), nHat));
        const margin = 1 / kq - inner;
        if (margin < bendFold) { bendFold = margin; bendFoldAt = q / stations; }
      }
    }
    if (!isFinite(bendFold)) bendFold = Infinity; // a straight duct cannot fold

    // ── THE MEASURED INNER-VS-OUTER WALL DIFFERENCE ────────────────────────
    // bendWiden above INTEGRATES w * dtheta and so counts every turn as a
    // cost. That overstates a reversing bend: a wall fibre that runs short
    // through a left turn runs long through the following right turn, and
    // the two cancel. The honest number is therefore measured, not
    // integrated — walk each boundary index from throat to mouth and take
    // its actual length. In swept mode index k is the SAME material line all
    // the way down the duct, so max minus min over k is exactly how much
    // longer the longest wall fibre is than the shortest. That is the phase
    // error across the passage, and it is what the bow direction is chosen
    // to minimise.
    let wallSpread = 0;
    if (rings.length > 1) {
      const nB = rings[0].length;
      let wLo = Infinity, wHi = -Infinity;
      for (let k = 0; k < nB; k++) {
        let Lk = 0;
        for (let q = 0; q < rings.length - 1; q++) Lk += nrm3(s3(rings[q + 1][k], rings[q][k]));
        if (Lk < wLo) wLo = Lk;
        if (Lk > wHi) wHi = Lk;
      }
      wallSpread = wHi - wLo;
    }

    const sched = [];
    let scDev = 0; // developed length along the SECTION CENTROIDS, not the centreline
    for (let q = 0; q <= stations; q++) {
      const u = q / stations;
      const ring = rings[q];
      const [ax, ay, az] = vecArea(ring);
      const idx = Math.round(u * M);
      // `area` is the section's OWN area. `axial` is its projection on the
      // direction of travel — the flux-carrying cross-section, and the one the
      // duct's volume integrates. The two differ because a flowed section is a
      // level set of the flow, not a perpendicular cut: the gap between them
      // is exactly how oblique the section is, and it is reported rather than
      // hidden by pretending the cut is square to the path.
      const T = tans[idx];
      // WHERE THE SECTION ACTUALLY IS, as distinct from where the centreline
      // is. `origin` is the centreline point; the section's own centre drifts
      // from it — 0.775 mm in rect, 4.466 mm in arc — because the mean of the
      // flowed boundary points is not the flow of the mean, and because the
      // mouth grid's parametric cell centre is not its polygon centroid. The
      // drift is a geometric offset, not quadrature, so it does not shrink
      // with more stations, and attributing a section's AREA to the
      // centreline's position puts the two out of register by that much.
      // `zc` and `sc` are the centroid-derived position axis, and they are
      // what an area schedule must be plotted against.
      const nR = ring.length;
      let cx = 0, cy = 0, cz = 0;
      for (const q of ring) { cx += q[0] / nR; cy += q[1] / nR; cz += q[2] / nR; }
      if (q > 0) {
        const pv = sched[q - 1];
        scDev += Math.hypot(cx - pv.cx, cy - pv.cy, cz - pv.cz);
      }
      sched.push({
        s: u, area: Math.hypot(ax, ay, az),
        axial: Math.abs(ax * T[0] + ay * T[1] + az * T[2]),
        z: pts[idx][2], sLen: sArr[idx],
        cx, cy, cz, zc: cz, sc: scDev,
        // the flowed section, in world coordinates — kept only when something
        // is going to export or draw it
        pts: keepGeometry ? ring : null,
        origin: keepGeometry ? pts[idx] : null,
        centroid: keepGeometry ? [cx, cy, cz] : null,
      });
    }

    // ── THE AREA THE WAVE ACTUALLY CROSSES ─────────────────────────────────
    // `area` is the section's own surface and `axial` its projection on the
    // centreline tangent. Neither is the schedule the expansion law means once
    // the section is allowed to tilt: the flux-carrying cross-section is the
    // projection on the direction the SECTION CENTROID travels, which is the
    // direction the volume integral advances along, and the obliquity is the
    // angle between the section's own normal and that direction.
    //
    // This is the number that has to be monotone, and it is the one no metric
    // in this tool used to report. `wallSpread` cannot see a tilt (it measures
    // fibre lengths BY THE MOUTH, so an excursion that unwinds is free) and
    // `turnMax` is gross turning, which is not the same question. A horn whose
    // ring areas follow the law perfectly can still put a constriction in the
    // passage, and did: measured 27% below the cell's own throat area with the
    // Bernstein blend and the shipped throat-fifth bow.
    let obliqMax = 0, obliqAt = 0, fluxMin = Infinity, fluxContract = 0, contractAt = 0;
    {
      let run = -Infinity;
      for (let q = 0; q <= stations; q++) {
        const a = sched[Math.min(stations, q + 1)], b = sched[Math.max(0, q - 1)];
        const dC = v3(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz);
        if (!(nrm3(dC) > 1e-12)) continue;
        const dHatC = un3(dC);
        const [ax, ay, az] = vecArea(rings[q]);
        const mag = Math.hypot(ax, ay, az);
        const flux = Math.abs(ax * dHatC[0] + ay * dHatC[1] + az * dHatC[2]);
        const ob = Math.acos(Math.min(1, Math.max(0, mag > 1e-12 ? flux / mag : 1))) * R2D;
        if (ob > obliqMax) { obliqMax = ob; obliqAt = q / stations; }
        sched[q].flux = flux;
        sched[q].obliqDeg = ob;
        fluxMin = Math.min(fluxMin, flux);
        // contraction is measured against the RUNNING MAXIMUM, not against the
        // previous station: a passage that opens, closes and reopens has a
        // constriction whether or not any single step is large
        if (flux > run) run = flux;
        else if (run > 1e-12) {
          const d = (run - flux) / run;
          if (d > fluxContract) { fluxContract = d; contractAt = q / stations; }
        }
      }
      if (!isFinite(fluxMin)) fluxMin = 0;
    }

    rows.push({
      id: cellRec.id, label: cellRec.label, i, j,
      // which of the four sides are on the disc RIM (no neighbour, so no
      // divider) — carried so `ductClearance` can rebuild the INSET outline,
      // the air the export actually carries, without needing the cell record
      rimSide: cellRec.rimSide || [false, false, false, false],
      obliqMaxDeg: obliqMax, obliqMaxAt: obliqAt,
      fluxMin, fluxContract, fluxContractAt: contractAt,
      // the passage measured against the cell's OWN throat: below 1 the horn
      // is narrower somewhere than the hole the driver feeds it through
      fluxVsThroat: sched[0].flux > 1e-12 ? fluxMin / sched[0].flux : 1,
      Lpath: L, turnDeg: turn * R2D, twistDeg: twist, aimErrDeg: aimErr,
      mouthCentroid: mc, mouthCorners: corners, mouthNormal: nSurf,
      mouthArea: sched[stations].area,
      // this cell's share of the UNION: the unbulged outline's area. Equal to
      // mouthArea when no bulge is on; under bulge, mouthArea (the bulged
      // outline the expansion law lands on) exceeds it by this cell's lobes.
      mouthAreaTiled: bulgeOn
        ? polyArea3(mouthUVTiled.map((q) => mouthAt(q[0], q[1])))
        : sched[stations].area,
      sched, kappaMax: Math.max(...kappa), bendCentroid, sweptRoll, bendWiden, wallSpread,
      bendFold, bendFoldAt,
      snakeAmp, snakeShort, snakeOnAxis, snakeSpan, sepAmp,
      profRatioGross,
      // profile: m is per mm, fc the cutoff it corresponds to, and the scale
      // range says how far the profile pulled the section in from the tiling
      // configuration — profScaleMin is what opened the gap
      profM, profFc, profScaleMin, profScaleMax, profRatio, profK, profKMaxAt,
    });
  }

  const Ls = rows.map((r) => r.Lpath);
  const Lmax = Math.max(...Ls), Lmin = Math.min(...Ls);
  rows.forEach((r) => { r.pad = Lmax - r.Lpath; });
  const dL = Lmax - Lmin;

  // 3-D station outlines. Nothing to rebuild any more — the flowed points are
  // already in world coordinates, and are shared with the neighbouring cells.
  const sectionAt = (q) => rows.map((r) => {
    const st = r.sched[q];
    if (!st.pts) return null;
    return { id: r.id, label: r.label, pts: st.pts };
  });

  // The summed cross-section schedule that used to be carried here as
  // `sigma` was for one consumer only — the sigma-A(x) CSV, the tool's route
  // into a 1-D simulator — and that export was removed on 2026-09-04 at the
  // owner's call, so this went with it. It was a sum over `sched[q].area`,
  // `axial`, `zc` and `sc`, all of which are still on every row: the
  // distinction worth keeping is that `axial` (the projection on the
  // direction of travel) is the flux-carrying cross-section a 1-D horn
  // schedule means, and it differs from the sections' own `area` by their
  // obliquity — up to 14.5% at 6x3. Rebuilding it is a dozen lines.

  // ── SIGNED CLEARANCE BETWEEN NEIGHBOURING DUCTS ─────────────────────────
  // The measurement itself is ductClearance below; it is separable because it
  // is the expensive part of this mapping and a UI can defer it off the
  // render pass the same way it defers the equal-area solve.
  const clearance = keepGeometry && computeClearance ? ductClearance(rows) : null;

  // ── THE fc SPREAD DECOMPOSED ──────────────────────────────────────────────
  // There is deliberately NO per-cell solid-angle readout here any more. It
  // measured the angle each mouth quad subtends at a chosen reference point,
  // and in an apex-free architecture no point is privileged — worse, past the
  // aperture the mouth radiates as ONE coupled surface (mutual coupling, edge
  // diffraction, mouth size against wavelength), so per-cell solid-angle
  // bookkeeping at a construction point stops predicting the pattern exactly
  // where the pattern starts to exist. This tool computes no radiated field;
  // what the design owes the far field is the aperture shape, area and the
  // wavefront the paths deliver to it, and those are all reported. Removed by
  // owner decision; if a coverage-share diagnostic is ever wanted, measure it
  // in DIRECTION space (area swept on the unit sphere by the cell's surface
  // normals) — that needs no reference point.
  const spreadOf = (a) => {
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    return mean > 0 ? ((Math.max(...a) - Math.min(...a)) / mean) * 100 : 0;
  };

  // THE fc SPREAD IS NOT PATH LENGTH ALONE. A uniform x/y mouth lattice
  // projected onto a curved cap stretches the outer cells — surface area goes
  // as planar area over cos(tilt) — so mouth areas differ even though throat
  // areas are equal to 1e-10. fc therefore moves with BOTH the path length and
  // the cell's own expansion ratio. Freezing one at its mean isolates the
  // other, and the two partially CANCEL: an outer cell has both a longer path
  // and a larger ratio, which push fc in opposite directions, so the full
  // spread comes out below path length alone. Reported rather than asserted
  // away, because "equalising dL equalises fc" is only the dominant term.
  let fcDecomp = null;
  if (profileT != null && rows.length) {
    const ratios = rows.map((r) => r.profRatio), Ls = rows.map((r) => r.Lpath);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const fcOf = (ratio, Lp) => fcForHypexM(solveHypexM(ratio, Lp, profileT), c);
    const full = rows.map((r) => r.profFc);
    fcDecomp = {
      full: spreadOf(full),
      fromLength: spreadOf(Ls.map((Lp) => fcOf(mean(ratios), Lp))),
      fromRatio: spreadOf(ratios.map((rt) => fcOf(rt, mean(Ls)))),
      lo: Math.min(...full), hi: Math.max(...full),
    };
  }

  return {
    clearance,
    profileT, profileArea,
    // the lengthening that was applied, if any: the common target length,
    // the largest bow, and the worst shortfall against the amplitude cap
    lengthen: snake ? {
      target: snake.target, lobes: snake.lobes, dir: snake.dir,
      ampMax: Math.max(...rows.map((r) => r.snakeAmp)),
      cells: rows.reduce((n, r) => n + (r.snakeAmp > 1e-9 ? 1 : 0), 0),
      shortfall: Math.max(...rows.map((r) => r.snakeShort)),
      // ducts sitting on the axis, which a radial bow cannot move symmetrically
      onAxis: rows.reduce((n, r) => n + (r.snakeOnAxis ? 1 : 0), 0),
      // the graded window, reported so the amplitude ORDERING it exists to
      // produce can be read rather than assumed
      regionGrade: snake.regionGrade,
      // null rather than Infinity when nothing is bowed, so a caller that
      // prints these does not have to special-case an empty horn
      ampMin: rows.some((r) => r.snakeAmp > 1e-9)
        ? Math.min(...rows.filter((r) => r.snakeAmp > 1e-9).map((r) => r.snakeAmp)) : null,
      spanMin: rows.some((r) => r.snakeSpan > 1e-9)
        ? Math.min(...rows.filter((r) => r.snakeSpan > 1e-9).map((r) => r.snakeSpan)) : null,
      spanMax: Math.max(0, ...rows.map((r) => r.snakeSpan)),
    } : null,
    separate: separate && sectionMode === "swept" && separate.amps ? {
      ampMax: Math.max(0, ...rows.map((r) => r.sepAmp)),
      cells: rows.reduce((n, r) => n + (r.sepAmp > 1e-9 ? 1 : 0), 0),
    } : null,
    ratioSpreadGross: spreadOf(rows.map((r) => r.profRatioGross || 1)),
    profFcMin: profileT != null ? Math.min(...rows.map((r) => r.profFc)) : null,
    profFcMax: profileT != null ? Math.max(...rows.map((r) => r.profFc)) : null,
    profScaleMin: profileT != null ? Math.min(...rows.map((r) => r.profScaleMin)) : null,
    // THE OVERLAP DETECTOR, and it is exact rather than sampled. Scaling a
    // section about its own centroid by k <= 1 maps it strictly inside itself,
    // so from a configuration that merely tiles, every cell can only move AWAY
    // from its neighbours: overlap is impossible. k > 1 is the profile asking
    // for more area than the tiling configuration has at that station, and is
    // the only way this construction can push two ducts into each other. It is
    // reachable — 1.094 at 8x3 with a 400x200 mouth, apex 60, T = 1 — so it is
    // reported rather than assumed away, and never silently clamped: clamping
    // would keep the geometry legal by quietly abandoning the expansion law
    // the number is there to deliver.
    profScaleMax: profileT != null ? Math.max(...rows.map((r) => r.profScaleMax)) : null,
    rows, surf, xs, ys, Lmax, Lmin, dL, lambda: lam,
    // The BIRADIAL aperture ITSELF — the live object with its own point(),
    // normal() and radii — not the legacy ellipsoid `surf` above and not the
    // `biradial` summary below, which carries figures for the readouts and
    // has no depth or evaluator on it. The shell needs the real surface:
    // anything derived from a mouth ring by an offset leaves the aperture
    // unless it is snapped back onto it.
    mouthSurf: bi,
    dLfrac: dL / lam,
    band: dL <= lam / 8 ? "ok" : dL <= lam / 4 ? "warn" : "bad",
    twistMax: Math.max(...rows.map((r) => Math.abs(r.twistDeg))),
    turnMax: Math.max(...rows.map((r) => r.turnDeg)),
    // the turning cost, integrated: every turn counts, reversals do not cancel
    bendWidenMax: Math.max(...rows.map((r) => r.bendWiden)),
    // the same thing MEASURED on the wall fibres, so reversals do cancel —
    // this is the phase error across the passage and the one to read
    wallSpreadMax: Math.max(...rows.map((r) => r.wallSpread)),
    // ── THE PASSAGE SCHEDULE, WHICH IS THE ACOUSTIC ONE ────────────────────
    // How far the section plane departs from square to travel, the worst
    // contraction of the flux-carrying area anywhere on any duct, and how many
    // ducts contract at all. A horn is coherent when `sectionObliqMax` is
    // small and `fluxContractMax` is zero; the ring areas following the law is
    // a necessary condition and not a sufficient one.
    sectionObliqMax: Math.max(...rows.map((r) => r.obliqMaxDeg)),
    sectionObliqCell: rows.reduce((a, r) => (r.obliqMaxDeg > a.obliqMaxDeg ? r : a), rows[0]).label,
    fluxContractMax: Math.max(...rows.map((r) => r.fluxContract)),
    fluxContractCells: rows.filter((r) => r.fluxContract > 1e-6).length,
    // the narrowest the passage ever gets, as a fraction of that cell's own
    // throat: under 1 the horn is tighter somewhere than the driver's exit
    fluxVsThroatMin: Math.min(...rows.map((r) => r.fluxVsThroat)),
    // how much room the tightest bend has left before the swept section turns
    // itself inside out — mm, negative is a folded solid
    bendFoldMin: Math.min(...rows.map((r) => r.bendFold)),
    bendFoldCell: rows.reduce((a, r) => (r.bendFold < a.bendFold ? r : a), rows[0]).label,
    aimMax: Math.max(...rows.map((r) => r.aimErrDeg)),
    // tangency tolerance ~ lambda / (4 d) with d the cell's mouth width
    aimLimitDeg: (lam / (4 * (mouthWEff / nc))) * R2D,
    stations, sectionAt,
    // the UNION — what radiates, and what the loading limit must key on.
    // Under interior-edge symmetric bulges the union IS the tiled total, so
    // it is summed from the unbulged shares; summing bulged outlines would
    // double-count every overlap lens and silently flatter the loading.
    mouthAreaTotal: rows.reduce((a, r) => a + r.mouthAreaTiled, 0),
    // the naive per-cell SUM, and the double-count the owner asked to see
    mouthAreaSum: rows.reduce((a, r) => a + r.mouthArea, 0),
    bulge: bulge && sectionMode === "swept" && bulge.amp > 1e-9 ? {
      amp: bulge.amp,
      doubleCountPct: (() => {
        const sum = rows.reduce((a, r) => a + r.mouthArea, 0);
        const tot = rows.reduce((a, r) => a + r.mouthAreaTiled, 0);
        return sum > 0 ? ((sum - tot) / sum) * 100 : 0;
      })(),
    } : null,
    mouthMode, thetaH: bi || arc ? thetaH : null, thetaV: bi || arc ? thetaV : null,
    mouthWEff, mouthHEff, flattenEff: arc ? 1 : flatten,
    biradial: bi ? { rH: bi.rH, rV: bi.rV, arcH: bi.arcH, arcV: bi.arcV, sagH: bi.sagH, sagV: bi.sagV } : null,
    bendCentroidMean: rows.reduce((a, r) => a + r.bendCentroid, 0) / rows.length,
    sectionMode,
    sweptRollMax: rows[0].sweptRoll
      ? Math.max(...rows.map((r) => Math.abs(r.sweptRoll.phi1Deg))) : null,
    sweptAimMax: rows[0].sweptRoll
      ? Math.max(...rows.map((r) => Math.max(r.sweptRoll.residThroatDeg, r.sweptRoll.residMouthDeg))) : null,
    // spread of the union shares — the equal-area statement, which symmetric
    // bulges do not disturb. The bulged-outline spread is structurally
    // nonzero (an interior cell bulges 4 edges, an edge cell 3, a corner 2)
    // and is reported separately for the law's bookkeeping.
    mouthAreaSpread: spreadOf(rows.map((r) => r.mouthAreaTiled)),
    mouthAreaSpreadBulged: spreadOf(rows.map((r) => r.mouthArea)),
    ratioSpread: spreadOf(rows.map((r) => r.profRatio || 1)),
    fcDecomp,
  };
}

// ── SIGNED CLEARANCE BETWEEN NEIGHBOURING DUCTS ─────────────────────────────
// With no profile the flowed sections tile, so this is 0 everywhere and says
// so honestly. With a profile it is the gap the expansion law opened, and it
// is the check that the profile has not asked for MORE area than the tiling
// configuration has — the one way scaling can push cells into each other.
// Point-to-segment rather than point-to-point: at 64 samples round a cell,
// point-to-point carries ~0.5 mm of discretisation noise, which is the same
// size as the wall being measured.
//
// WHY IT IS SIGNED. An unsigned distance bottoms out at 0 and cannot tell
// "just touching" from "driven 3 mm through each other" — both read 0,
// because a distance cannot go negative. That was tolerable only while the
// shrink argument held: sections came from one shared flow, so k <= 1 proved
// non-overlap analytically and the metric never had to detect what the proof
// already excluded. Any construction that builds sections independently
// kills that proof, and then overlap has to be MEASURED. So the sign is
// carried: negative is interpenetration and its magnitude is the depth of
// the deepest penetrating point.
//
// The sign has to be evaluated per sampled point, not at the nearest one. A
// point that has been driven deep into a neighbour is FAR from that
// neighbour's boundary, so the minimum unsigned distance is exactly the
// point that says least about penetration. Hence: inside points contribute
// -depth, outside points +distance, and the pair takes the minimum.
//
// Takes the mapping's `rows` (built with keepGeometry, so the section points
// exist). Standalone so a caller can run it off its own schedule — it costs
// ~5x the rest of the mapping, and a UI dragging a slider wants the schedule
// numbers live and this one a beat behind, not everything at 8 fps.
// Options:
//   jointAware — coped joints make overlap near the mouth THE FEATURE, so the
//     defect statistics must not count it. A pair's JOINT RUN is the maximal
//     contiguous run of stations ending at the mouth over which the pair is
//     in contact; its first station is the pair's KNIFE-EDGE station. Overlap
//     inside a joint run is reported as engagement; overlap anywhere else is
//     still the defect it always was. Without a bulge the mouth tiles, so the
//     joint run degenerates to the mouth station alone and every statistic
//     reduces exactly to the un-aware form.
//   thinBand — a gap that is positive but smaller than this is a sliver of
//     wall too thin to print: not merged, not clear. Counted over the defect
//     region only, because inside a joint run the walls are meant to merge.
//   throatFloor — the mirror of the joint walk-back at the OTHER end. The
//     cells tile at the throat exactly as they tile at the mouth, so the
//     first stations are a knife edge too, and judging a minimum gap there
//     asks the ducts for room they have had no path length to open.
//     THE RULE IS THAT THE GAP MUST BE OPENING. A pair's THROAT RUN is the
//     contiguous run from station 0 over which the gap is still below
//     throatFloor AND has not decreased from the station before it. It ends
//     the moment either is false: reaching the floor means the pair has
//     separated and ordinary defect scoring takes over; CLOSING again means
//     the ducts are moving back toward each other, which is a defect at any
//     magnitude and at any station, and the station that closed is scored as
//     one. Its last station is that pair's throat knife-edge station.
//     THIS REPLACED A SYMMETRIC (-throatFloor, +throatFloor) BAND, and the
//     band was too weak in exactly the place it mattered. A gap that dived to
//     -0.49 mm and recovered sat inside a 0.5 mm band and was filed as knife
//     edge, so it never reached `minMid` — the number the separation solver
//     optimises. Measured at the 2026-09-02 defaults, 48 stations: the band
//     reported minMid +0.510 mm while an independent point-in-solid test on
//     the same outlines found 0.258 mm of real interpenetration at u = 0.021.
//     The monotone rule cannot do that: near the throat it demands no
//     absolute clearance at all — only that the wall never gets thinner than
//     it already is — which is the weakest requirement that still refuses to
//     call closing ducts a knife edge.
//     THE TOLERANCE IS FLOAT NOISE, NOT A PHYSICAL SLACK, and that is a
//     measurement rather than a choice: over the sub-floor stretch the worst
//     backward step on a geometry that is genuinely opening is EXACTLY
//     0.0000 mm at both 24 and 48 stations, across T = 0, 0.3, 0.7, 1.0 and
//     the dL-optimal depth. Every backward step observed anywhere was the
//     station-1 dive itself, i.e. the defect the rule exists to catch.
//     BE AWARE OF THE RESOLUTION LIMIT. The dive is a sharp minimum near
//     u = 0.021, so the VERDICT is resolution-independent but the MAGNITUDE
//     is not: at 24 stations the default horn reads -0.002 mm where 48
//     stations and the independent test both read -0.24. The rule fires
//     either way; the number it fires with is a lower bound.
//     Nothing is hidden: `throat.worst` reports the deepest contact found
//     INSIDE the run, exactly as `joint.engageMax` does at the mouth, and
//     `throat.dip` reports the backward step that ENDED the longest run and
//     where. 0 (the default) turns the whole rule off, and every statistic
//     reduces exactly to the form that has no throat boundary at all.
//   outline — WHICH PAIR OF CURVES THE GAP IS MEASURED BETWEEN, and this is
//     the difference between "how close are the cells" and "how thick is the
//     wall". Every cell has two outlines at every station: the GROSS share of
//     the cross-section, boundary to boundary, which neighbours share exactly
//     (they tile); and the INSET outline, gross pulled in by t/2 on each
//     shared side and tapering to nothing at the mouth. The inset one is THE
//     AIR — it is what `ductSections` builds and what the STL and the STEP
//     write — so the material between two ducts IS the inset gap.
//     "gross" is the default because every figure recorded in CLAUDE.md was
//     measured on it; the UI asks for "inset", because the question a
//     designer has is whether a printable wall fits, and that is a question
//     about the air columns. The two differ by t(1-s): 0.4 mm at the throat
//     at the shipped divider, falling to 0 at the mouth, so gross is
//     PESSIMISTIC and most so exactly where the ducts are closest.
//     Needs `t`; with t = 0 the two coincide exactly.
//   floor — the wall you actually want, in mm. Purely a REPORTING input: it
//     does not change a single gap. What it buys is `reach` — the stretch of
//     path over which every neighbouring pair clears it. See the note on
//     `reach` below for why one minimum cannot answer that question.
export function ductClearance(rows, {
  jointAware = false, thinBand = 0, throatFloor = 0,
  outline = "gross", t = 0, floor = 0,
  // ── WHICH TWO CURVES ARE COMPARED, AND IT IS TWO DIFFERENT QUESTIONS ─────
  // "station" pairs ring q of one duct with ring q of the other. A station is
  // a fraction of each duct's OWN arc length, so those two rings are at the
  // same phase of travel and NOT at the same place: measured on the shipped
  // horn, same-index rings of a neighbouring pair sit up to 40 mm apart
  // axially. That is a WAVEFRONT question — at equal phase, how close are
  // these two air columns — and it is the right one when every path is the
  // same length and the ducts run roughly parallel.
  // "solid" asks the question CAD asks: is there material everywhere between
  // these two bodies, and how thin is the thinnest place. Nearest approach
  // between two surfaces has nothing to do with phase, and the two answers
  // separate as soon as the ducts stop running parallel — which is exactly
  // the bow region, and which the REGION GRADE makes worse by design, since
  // it gives adjacent cells windows of different width and so puts them at
  // different points of their own turn at equal fractions of travel.
  // Measured on the shipped default horn, middle-row pair (3,1)-(4,1), whose
  // two windows differ in span by a fifth:
  //   same-station rings            +0.49 mm of wall, reported at station 1
  //   solid                         -0.43 mm, between stations 7 and 9
  //   ray cast into the exported triangles
  //                                 34 wall points inside the neighbour,
  //                                 deepest 0.423 mm
  // The third knows nothing about stations — it asks whether a point of one
  // duct's wall lies inside the other's closed mesh — and it agrees with the
  // second to 7 um, which is a mutual check rather than a tautology, since
  // the two share no code. So the tool was reporting a horn as clear while a
  // CAD subtraction would find the passages overlapping.
  // THE DEFAULT STAYS "station" so every figure recorded in CLAUDE.md still
  // reproduces; the UI and the separation solver ask for "solid", exactly as
  // they already ask for the inset outline.
  // WHAT BOTH MEASURE is the FACETTED duct — rings joined by straight runs,
  // the same solid the STL writes. The STEP's B-spline lofts through those
  // rings and departs from the facets by the loft's own sagitta, order
  // 0.1 mm at the default station step on a duct bending at tens of mm of
  // radius. That is the same approximation the recorded ring-refinement
  // figures already carry, and it is not removed by either method here.
  compare = "station",
  // WHICH PAIRS COUNT AS NEIGHBOURS. The default is the orthogonal grid
  // adjacency this metric has always used, and every recorded number is on
  // it. `[[1,0],[0,1],[1,1],[1,-1]]` adds the diagonals, which the shell
  // audit showed can overlap millimetres deep two columns apart while no
  // metric here was looking at them. Kept as an option rather than a change
  // so the defect statistics stay comparable to everything already measured.
  pairSteps = [[1, 0], [0, 1]],
} = {}) {
  if (!rows.length || !rows[0].sched[0].pts) return null;
  const stations = rows[0].sched.length - 1;
  // neighbouring pairs straight from the (i, j) index — grid adjacency is the
  // same fact whether it is walked from the grid bounds or from the rows
  const byIdx = new Map(rows.map((r) => [`${r.i},${r.j}`, r]));
  const pairs = [];
  for (const A of rows)
    for (const [da, db] of pairSteps) {
      const B = byIdx.get(`${A.i + da},${A.j + db}`);
      if (B) pairs.push([A, B]);
    }
  const pSeg = (P, U, V) => {
    const ux = V[0] - U[0], uy = V[1] - U[1], uz = V[2] - U[2];
    const L2 = ux * ux + uy * uy + uz * uz || 1e-18;
    let k = ((P[0] - U[0]) * ux + (P[1] - U[1]) * uy + (P[2] - U[2]) * uz) / L2;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    return Math.hypot(P[0] - U[0] - ux * k, P[1] - U[1] - uy * k, P[2] - U[2] - uz * k);
  };
  // A flowed section is a level set of the flow, not a plane, so "inside" is
  // taken on its own best-fit plane: Newell normal, an in-plane basis, then
  // an ordinary crossing test. The section is oblique by up to ~15%, which
  // tilts the test plane but cannot change which side of a closed ring a
  // point falls on as long as the ring stays simple — and it does, because
  // it is a level set.
  const frame = (ring) => {
    const n = ring.length;
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < n; k++) {
      const a = ring[k], b = ring[(k + 1) % n];
      cx += a[0] / n; cy += a[1] / n; cz += a[2] / n;
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const nn = Math.hypot(nx, ny, nz) || 1e-18;
    const N = [nx / nn, ny / nn, nz / nn];
    // any vector not parallel to N gives a usable in-plane basis
    const t = Math.abs(N[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let U = [t[1] * N[2] - t[2] * N[1], t[2] * N[0] - t[0] * N[2], t[0] * N[1] - t[1] * N[0]];
    const un = Math.hypot(...U) || 1e-18;
    U = [U[0] / un, U[1] / un, U[2] / un];
    const V = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
    const ctr = [cx, cy, cz];
    const to2 = (P) => {
      const d = [P[0] - ctr[0], P[1] - ctr[1], P[2] - ctr[2]];
      return [d[0] * U[0] + d[1] * U[1] + d[2] * U[2], d[0] * V[0] + d[1] * V[1] + d[2] * V[2]];
    };
    // bounding sphere, so the crossing test can be skipped for the points
    // that cannot possibly be inside. Exact, not an approximation: outside
    // the bounding sphere is outside the ring, always.
    let maxR = 0;
    for (const P of ring) maxR = Math.max(maxR, Math.hypot(P[0] - cx, P[1] - cy, P[2] - cz));
    return { poly: ring.map(to2), to2, ctr, maxR, N };
  };
  const inside2 = (p, poly) => {
    let win = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) &&
          p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] || 1e-18) + a[0]) win = !win;
    }
    return win;
  };
  // signed distance from every sampled point of `from` to the ring `toRing`,
  // reduced to the worst (most negative, else smallest) value
  const signedGap = (from, toRing, fr) => {
    let worst = Infinity;
    for (let k = 0; k < from.length; k += 2) {
      const P = from[k];
      let d = Infinity;
      for (let e = 0; e < toRing.length; e++)
        d = Math.min(d, pSeg(P, toRing[e], toRing[(e + 1) % toRing.length]));
      const near = Math.hypot(P[0] - fr.ctr[0], P[1] - fr.ctr[1], P[2] - fr.ctr[2]) <= fr.maxR;
      const sd = near && inside2(fr.to2(P), fr.poly) ? -d : d;
      if (sd < worst) worst = sd;
    }
    return worst;
  };
  // first pass: every pair's signed gap at every station, kept, because the
  // joint classification needs the runs and the solver needs the per-pair map
  // The ring this measurement is taken on — gross as built, or the inset
  // outline the exports carry. Built exactly as `ductSections` builds it, so
  // "inset" here and the exported solid are the same curve by construction
  // rather than by agreement.
  const ringAt = (row, q) => {
    const st = row.sched[q];
    if (outline !== "inset" || !(t > 0)) return st.pts;
    const taper = 1 - st.s;
    if (taper <= 1e-12) return st.pts;
    const rim = row.rimSide || [false, false, false, false];
    const d = rim.map((isRim) => (isRim ? 0 : (t / 2) * taper));
    return d.some((v) => v > 0) ? insetSection3(st.pts, d) : st.pts;
  };
  // every ring and every ring frame, once. "solid" needs the whole of one
  // duct available while walking the other, so the station loop can no
  // longer build rings as it goes.
  const ringOf = new Map(), frameOf = new Map();
  for (const r of rows) {
    const rr = [], ff = [];
    for (let q = 0; q <= stations; q++) { const g = ringAt(r, q); rr.push(g); ff.push(frame(g)); }
    ringOf.set(r.id, rr); frameOf.set(r.id, ff);
  }
  // ── THE SOLID READ ──────────────────────────────────────────────────────
  // For each sampled point of `from`, find where it sits along the OTHER
  // duct — the station interval whose two section planes it lies between —
  // interpolate that duct's ring there, and measure against it. No point
  // correspondence between the two ducts is assumed, and no station index is
  // shared, so a pair whose nearest approach is between stations of one duct
  // and a quarter of the path along the other is still read correctly.
  // The bracket is the crossing NEAREST the paired station. A duct that
  // turns far enough can put a point between the same two planes twice, and
  // the crossing beside the paired station is the one that belongs to this
  // stretch of the path rather than to a fold further along.
  const solidGap = (from, toRings, toFrames, seed) => {
    let worst = Infinity;
    const h = new Array(stations + 1);
    for (let k = 0; k < from.length; k += 2) {
      const P = from[k];
      for (let q = 0; q <= stations; q++) {
        const f = toFrames[q];
        h[q] = (P[0] - f.ctr[0]) * f.N[0] + (P[1] - f.ctr[1]) * f.N[1] + (P[2] - f.ctr[2]) * f.N[2];
      }
      let q0 = -1, near = Infinity;
      for (let q = 0; q < stations; q++) {
        if (!((h[q] >= 0 && h[q + 1] < 0) || (h[q] <= 0 && h[q + 1] > 0))) continue;
        const d = Math.abs(q - seed);
        if (d < near) { near = d; q0 = q; }
      }
      // no crossing at all: the point is not opposite this duct's body, so
      // it has no wall to measure and must not be scored as clear either
      if (q0 < 0) continue;
      const ra = toRings[q0], rb = toRings[q0 + 1];
      const hd = h[q0] - h[q0 + 1];
      const f = Math.abs(hd) > 1e-12 ? h[q0] / hd : 0;
      const ring = new Array(ra.length);
      for (let e = 0; e < ra.length; e++)
        ring[e] = [ra[e][0] + (rb[e][0] - ra[e][0]) * f,
                   ra[e][1] + (rb[e][1] - ra[e][1]) * f,
                   ra[e][2] + (rb[e][2] - ra[e][2]) * f];
      const fr = frame(ring);
      let d = Infinity;
      for (let e = 0; e < ring.length; e++)
        d = Math.min(d, pSeg(P, ring[e], ring[(e + 1) % ring.length]));
      const inR = Math.hypot(P[0] - fr.ctr[0], P[1] - fr.ctr[1], P[2] - fr.ctr[2]) <= fr.maxR;
      const sd = inR && inside2(fr.to2(P), fr.poly) ? -d : d;
      if (sd < worst) worst = sd;
    }
    return worst;
  };
  const gaps = pairs.map(() => new Array(stations + 1).fill(Infinity));
  for (let q = 0; q <= stations; q++) {
    for (let pi = 0; pi < pairs.length; pi++) {
      const [A, B] = pairs[pi];
      const pa = ringOf.get(A.id)[q], pb = ringOf.get(B.id)[q];
      // both directions: either duct can be the one poking into the other
      gaps[pi][q] = compare === "solid"
        ? Math.min(solidGap(pa, ringOf.get(B.id), frameOf.get(B.id), q),
                   solidGap(pb, ringOf.get(A.id), frameOf.get(A.id), q))
        : Math.min(signedGap(pa, pb, frameOf.get(B.id)[q]),
                   signedGap(pb, pa, frameOf.get(A.id)[q]));
    }
  }
  // each pair's joint run: walk back from the mouth while in contact. With
  // no bulge the tiling puts the mouth station itself at gap 0 and the
  // station before it clear, so the run is just the mouth — which the
  // interior statistics already exclude, and the two forms coincide.
  const contactTol = 1e-6;
  // float noise only — see the throatFloor note above for the measurement
  // that says a genuinely opening pair backs up by exactly 0.0000 mm
  const OPEN_TOL = 1e-6;
  const jointStart = pairs.map((_, pi) => {
    if (!jointAware) return stations;
    let q0 = stations;
    while (q0 > 1 && gaps[pi][q0 - 1] <= contactTol) q0--;
    return q0;
  });
  // ── HOW DEEP THE COPE RUNS, IN MILLIMETRES ──────────────────────────────
  // `jointStart` counts STATIONS, and a station is a different physical
  // distance at every resolution — measured on the shipped bulge, the same
  // horn reported 0 of 27 pairs engaged at 24 stations and 27 of 27 at 48.
  // Worse, the walk above can only move if the station BEFORE the mouth is
  // already in contact, so it never reads the mouth's own gap at all. The
  // cells tile the aperture, so ANY bulge makes the mouth rings overlap by
  // construction — measured exactly 2x the amplitude, since both neighbours
  // bulge into each other — and reporting that as "the pairs do not meet"
  // was simply wrong.
  //
  // What is worth reporting is the DEPTH of the cope: how far back from the
  // aperture the two cells still overlap, in mm of path. The crossing is
  // interpolated between the two bracketing stations, so the answer does not
  // jump with the station count.
  const jointDepth = pairs.map((_, pi) => {
    if (!jointAware) return 0;
    const sAt = (q) => rows[0].sched[q].sLen;
    const gMouth = gaps[pi][stations];
    if (!(gMouth < -contactTol)) return 0;      // not overlapping at the mouth
    let q = stations;
    while (q > 0 && gaps[pi][q - 1] < -contactTol) q--;
    if (q === 0) return sAt(stations) - sAt(0); // overlapping the whole way
    // linear crossing between station q-1 (clear) and q (overlapping)
    const gA = gaps[pi][q - 1], gB = gaps[pi][q];
    const f = gA === gB ? 0 : gA / (gA - gB);
    return sAt(stations) - (sAt(q - 1) + (sAt(q) - sAt(q - 1)) * f);
  });
  // the throat run: walk FORWARD from the throat while the pair is still
  // below the floor AND still opening. Reaching the floor ends it (the pair
  // has separated); closing again ends it too, and the station that closed
  // is left OUTSIDE the run so it scores as the defect it is. Capped one
  // short of the joint so at least one interior station always remains a
  // defect station — a pair that never opens to the floor anywhere is a real
  // finding, and it must surface as a bad gap rather than as an empty defect
  // set.
  let throatSaturated = 0;
  let throatDip = 0, throatDipAt = null;
  const throatEnd = pairs.map((_, pi) => {
    if (!(throatFloor > 0)) return 0;
    let q1 = 0;
    while (q1 + 1 < stations) {
      const g = gaps[pi][q1 + 1];
      if (g >= throatFloor) break;                 // separated: the run is over
      const back = gaps[pi][q1] - g;
      if (back > OPEN_TOL) {                       // closing: a defect, not a knife edge
        if (back > throatDip) { throatDip = back; throatDipAt = q1 + 1; }
        break;
      }
      q1++;
    }
    // leave at least one interior station OUTSIDE both runs, or the defect
    // set is empty and the worst gap comes back Infinity. A floor no part of
    // the pair ever reaches is a real finding — it surfaces as `saturated`
    // plus the best gap the pair actually has, never as a vacuous pass.
    const cap = Math.max(0, Math.min(jointStart[pi], stations) - 2);
    if (q1 > cap) { throatSaturated++; q1 = cap; }
    return q1;
  });
  // second pass: reduce, with each pair's joint run excluded from the defect
  // statistics and folded into the engagement figures instead
  const perStation = [];
  const perCell = new Map(rows.map((r) => [r.id, Infinity]));
  let worst = Infinity, worstAt = 0, worstMid = Infinity, worstMidAt = 1;
  let engageMax = 0, knifeMin = Infinity, knifeMax = -Infinity, engaged = 0, runs = 0;
  let jointDepthMax = 0, jointDepthMin = Infinity;
  let thinCount = 0, thinWorst = Infinity, thinAt = null;
  let throatWorst = 0, throatKnifeMin = Infinity, throatKnifeMax = -Infinity, throatRuns = 0;
  for (let pi = 0; pi < pairs.length; pi++) {
    const [A, B] = pairs[pi];
    // a pair MEETS when its mouth rings overlap — which the tiling makes true
    // for any bulge at all. Counted from the mouth station's own gap, never
    // from how far back the contact reaches.
    if (jointAware && gaps[pi][stations] < -contactTol) {
      engaged++;
      jointDepthMax = Math.max(jointDepthMax, jointDepth[pi]);
      jointDepthMin = Math.min(jointDepthMin, jointDepth[pi]);
      // the deepest overlap inside the cope, scanned back over the whole
      // engaged run — NOT gated on the run spanning a station, or a shallow
      // cope reports zero engagement while its rings visibly overlap
      for (let q = stations; q >= 0 && gaps[pi][q] < -contactTol; q--)
        engageMax = Math.max(engageMax, -gaps[pi][q]);
    }
    if (jointAware && jointStart[pi] < stations) {
      runs++;
      knifeMin = Math.min(knifeMin, jointStart[pi]);
      knifeMax = Math.max(knifeMax, jointStart[pi]);
    }
    if (throatEnd[pi] > 0) {
      throatRuns++;
      throatKnifeMin = Math.min(throatKnifeMin, throatEnd[pi]);
      throatKnifeMax = Math.max(throatKnifeMax, throatEnd[pi]);
      // the deepest contact inside the run — reported, never swallowed
      for (let q = 0; q <= throatEnd[pi]; q++)
        throatWorst = Math.max(throatWorst, -gaps[pi][q]);
    }
    for (let q = 1; q < stations; q++) {
      if (q <= throatEnd[pi]) continue;    // throat knife edge: not a defect
      if (q >= jointStart[pi]) continue;   // joint region: engagement, not defect
      const d = gaps[pi][q];
      perCell.set(A.id, Math.min(perCell.get(A.id), d));
      perCell.set(B.id, Math.min(perCell.get(B.id), d));
      if (d < worstMid) { worstMid = d; worstMidAt = q; }
      if (thinBand > 0 && d > contactTol && d < thinBand) {
        thinCount++;
        if (d < thinWorst) { thinWorst = d; thinAt = q; }
      }
    }
  }
  for (let q = 0; q <= stations; q++) {
    let mn = Infinity;
    for (let pi = 0; pi < pairs.length; pi++) mn = Math.min(mn, gaps[pi][q]);
    perStation.push(mn);
    if (mn < worst) { worst = mn; worstAt = q; }
  }
  // per-station DEFECT minimum, for anything that needs to know WHERE the
  // trouble is with the joint runs already excluded — the separation solver
  // reads this to place its window
  const perStationDefect = [];
  for (let q = 0; q <= stations; q++) {
    let mn = Infinity;
    if (q > 0 && q < stations)
      for (let pi = 0; pi < pairs.length; pi++)
        if (q > throatEnd[pi] && q < jointStart[pi]) mn = Math.min(mn, gaps[pi][q]);
    perStationDefect.push(mn);
  }
  // `min` is pinned at 0 by the two ends WHATEVER the profile does, because
  // the cells tile the disc at the throat and tile the rectangle at the
  // mouth — so it can never signal failure and must not be read as if it
  // could. `minMid` excludes exactly those two stations, and is the number
  // that means something: it is 0 with no profile (the sections tile the
  // whole way) and it is 0 again when the profile has asked for MORE area
  // than the tiling configuration has and pushed two ducts back into
  // contact. Between those it is the gap the expansion law opened.
  // `overlap` is the depth of the worst interpenetration, as a positive
  // number, or 0 when the ducts are merely touching or apart. It is the
  // number that replaces the k <= 1 shrink argument once sections stop
  // coming from one shared flow, and the two must agree while both hold.

  // ── WHERE THE WALL YOU ASKED FOR ACTUALLY FITS ────────────────────────────
  // ONE MINIMUM CANNOT ANSWER THIS, and that is a property of the geometry
  // rather than of the metric. The cells TILE at the throat and TILE again at
  // the mouth, so the wall between two air columns is pinned at both ends by
  // construction: exactly `t` at station 0 (the divider the layout was solved
  // with) and 0 at the aperture. Any floor above `t` is therefore unreachable
  // at both ends of every horn this tool can build, and a single worst-case
  // number over the whole path can only ever report that tiling — it says
  // nothing about the stretch in between, which is the part a designer can
  // actually move.
  // So this reports the RUN: the longest contiguous stretch over which EVERY
  // neighbouring pair clears the floor. Measured on the RAW gap, not the
  // defect-scoped one, because "is there 3 mm of material here" is a
  // structural question and the throat and joint classifications are exactly
  // the two regions where the honest answer is "no, by construction".
  let reach = null;
  if (floor > 0) {
    const sAt = (q) => rows[0].sched[q].sLen;
    let best = null, runs = 0, cur = null;
    for (let q = 0; q <= stations; q++) {
      if (perStation[q] >= floor) {
        if (!cur) { cur = { a: q, b: q }; runs++; } else cur.b = q;
        if (!best || cur.b - cur.a > best.b - best.a) best = { a: cur.a, b: cur.b };
      } else cur = null;
    }
    // the ends are pinned by tiling, so report what they are rather than
    // letting the run's start look like a choice
    let inside = Infinity;
    if (best) for (let q = best.a; q <= best.b; q++) inside = Math.min(inside, perStation[q]);
    const L = sAt(stations) - sAt(0);
    reach = {
      floor, runs,
      from: best ? best.a / stations : null,
      to: best ? best.b / stations : null,
      fromMm: best ? sAt(best.a) - sAt(0) : null,
      toMm: best ? sAt(best.b) - sAt(0) : null,
      lenMm: best ? sAt(best.b) - sAt(best.a) : 0,
      fracPath: best ? (sAt(best.b) - sAt(best.a)) / (L || 1) : 0,
      worstInside: best ? inside : null,
      // what the two tiling ends actually hold, so the run's limits read as
      // construction rather than as a solver result
      atThroat: perStation[0], atMouth: perStation[stations],
      stations,
    };
  }
  return {
    reach,
    perStation, perStationDefect, min: worst, minAt: worstAt,
    minMid: worstMid, minMidAt: worstMidAt,
    overlap: worstMid < 0 ? -worstMid : 0,
    overlapAt: worstMid < 0 ? worstMidAt : null,
    overlapStations: perStationDefect.slice(1, stations).reduce((n, d) => n + (d < -1e-9 ? 1 : 0), 0),
    max: Math.max(...perStation), maxAt: perStation.indexOf(Math.max(...perStation)),
    perCell, pairs: pairs.length,
    // worst DEFECT gap per pair and where — what the separation solver pushes on
    pairWorst: pairs.map(([A, B], pi) => {
      let d = Infinity, at = null;
      for (let q = throatEnd[pi] + 1; q < Math.min(stations, jointStart[pi]); q++)
        if (gaps[pi][q] < d) { d = gaps[pi][q]; at = q; }
      return { a: A.id, b: B.id, gap: d, at };
    }),
    // the throat knife edge, reported exactly as the mouth joint is: how far
    // in the run reaches per pair, and the deepest contact inside it, so the
    // classification can never hide a magnitude
    throat: throatFloor > 0 ? {
      floor: throatFloor, runs: throatRuns, pairs: pairs.length,
      knifeMin: throatRuns ? throatKnifeMin : null,
      knifeMax: throatRuns ? throatKnifeMax : null,
      worst: throatWorst, saturated: throatSaturated, stations,
      // the backward step that ENDED a run, and where — the ducts closing on
      // each other before they ever opened to the floor. null when every run
      // ended by reaching the floor instead, which is the healthy case.
      dip: throatDipAt == null ? null : throatDip, dipAt: throatDipAt,
    } : null,
    joint: jointAware ? {
      engaged, pairs: pairs.length,
      // how deep the cope runs back from the aperture, in mm of path — the
      // resolution-robust form of what `knifeMin` counted in stations
      depthMax: jointDepthMax, depthMin: isFinite(jointDepthMin) ? jointDepthMin : 0,
      // pairs whose overlap survives at least one whole station back; kept
      // because the STEP loft can only represent a cope that spans stations
      runs,
      knifeMin: runs ? knifeMin : null, knifeMax: runs ? knifeMax : null,
      engageMax, stations,
    } : null,
    thin: thinBand > 0 ? {
      band: thinBand, count: thinCount,
      worst: thinCount ? thinWorst : null, at: thinCount ? thinAt : null,
    } : null,
  };
}

// ── THE HONEST RE-READ ──────────────────────────────────────────────────────
// The solve's inner loop measures with `compare` — "station" by default,
// because a solid read costs about 3x and the loop runs it once per round.
// That is a WAVEFRONT metric, and a field it likes can still drive one duct
// into a neighbour it never looked at: measured on the shipped defaults, the
// station read calls the crossRow bow +0.28 mm clear while the solid read
// finds -0.43 mm of real interpenetration in the middle row.
// So when the caller asks for "solid", the state the solve wants to return is
// RE-MEASURED that way against the input measured the same way, and a field
// that does not improve the honest number is not applied. This is the rule
// the chain mode already learned — a solver that cannot improve on its input
// returns its input — restated on the metric that decides the export.
// It costs two extra maps and two extra solid clearances, once per solve, and
// it is skipped entirely at the default so every recorded figure reproduces.
export function solveSeparation(throat, opts, cfg = {}) {
  const r = solveSeparationCore(throat, opts, cfg);
  if (cfg.compare !== "solid" || !r) return r;
  const build = (separate) => mapThroatToMouth(throat, {
    ...opts, separate, keepGeometry: true, computeClearance: false,
  });
  const floor = cfg.floor ?? 0.5;
  const solidOf = (m) => {
    if (!m || !m.rows.length || !m.rows[0].sched[0].pts) return null;
    return ductClearance(m.rows, {
      jointAware: !!m.bulge, throatFloor: floor, floor, compare: "solid",
      pairSteps: cfg.diagonals === false
        ? [[1, 0], [0, 1]] : [[1, 0], [0, 1], [1, 1], [1, -1]],
      outline: cfg.outline ?? "gross", t: opts.t || 0,
    }).minMid;
  };
  const before = solidOf(build(null));
  if (before == null) return r;
  // a solve that returns no field IS the identity, so the honest reading is
  // the input's — still reported, because the number on screen has to be the
  // one the export carries whether or not anything was applied
  if (!r.amps) return { ...r, gapSolidBefore: before, gapSolidAfter: before, solidRefused: false };
  const after = solidOf(build({ amps: r.amps, uStart: r.uStart, uEnd: r.uEnd, lobes: r.lobes }));
  if (after == null) return r;
  const kept = after >= before - 1e-9;
  return {
    ...r,
    gapSolidBefore: before, gapSolidAfter: kept ? after : before,
    solidRefused: !kept,
    ok: kept && after >= floor - (cfg.tol ?? 0.05),
    amps: kept ? r.amps : null,
    reason: kept ? r.reason
      : `the field improved the same-station gap to ${r.gapAfter.toFixed(2)} mm but took the`
        + ` solid gap from ${before.toFixed(2)} to ${after.toFixed(2)} mm, so it was not applied`
        + " — the two ducts' nearest approach is not at equal fractions of travel here",
  };
}

function solveSeparationCore(throat, opts, cfg = {}) {
  // "inset" measures the AIR the export carries; "gross" is the pre-2026-09-04
  // convention every recorded figure in CLAUDE.md was taken on. The default
  // stays gross so those figures still reproduce; the UI asks for inset.
  const { outline = "gross" } = cfg;
  const {
    floor = 0.5, mode = "uniform", maxIter = 16, ampCap = 40, lobes = 1, tol = 0.05,
    // under-relaxation: a full-deficit push overshoots, because every push
    // steals room from the pair behind it — measured oscillating between
    // -5 and -1.3 mm at relax 1 on the very first case tried.
    // "repel" DOES NOT NEED IT, and that is a consequence of the argument
    // below rather than a tuning result: the diffusion under-relaxation
    // exists to damp is Jacobi's, and it comes from answering each pair in
    // ignorance of the others. One joint solve cannot diffuse. Measured on
    // the recorded 6x3/d320 case, relax 0.5 / 0.8 / 1.0 all land on the
    // same gap (+0.273 / +0.290 / +0.267 mm) in 17 / 15 / 10 rounds, so
    // the only thing damping buys is rounds — and the UI's round budget is
    // what decides whether the solve finishes.
    relax = mode === "repel" ? 1 : 0.5,
    // `ridge` is "repel" only: the Tikhonov weight that makes the normal
    // equations positive definite and expresses "move as little as possible"
    // — a cell no constraint touches gets exactly zero rather than an
    // arbitrary null-space vector.
    // `diagonals` PUTS THE DIAGONAL NEIGHBOURS INTO THE SCORE FOR EVERY
    // MODE, and into the force set for the one mode that can push on them.
    // It costs nothing on an unseparated horn — measured identical minMid,
    // minMidAt and thin-band counts at the defaults with and without the
    // bow and at the dL-solved depth, because an ordered grid always has an
    // orthogonal pair closer than any diagonal one — and it is the ONLY
    // thing that sees what a separation field does: the chain's own field
    // slides a duct diagonally, and measured on the shipped bow at 32
    // stations it reports -3.28 mm on the orthogonal pairs while leaving
    // -5.52 mm on the diagonals. So the base numbers do not move and a
    // solver can no longer claim success on a defect it created.
    // `ridge` IS RELATIVE TO THE CONSTRAINT BLOCK'S MEAN DIAGONAL, so it
    // means the same thing whether three pairs are pushing or all 47 — see
    // the note at the solve. Measured on the recorded 6x3/d320 case at
    // floor 0.2, relax 1, 20 rounds:
    //   ridge     0.02    0.05     0.1     0.25     0.5      1
    //   gap     +0.270  +0.267  +0.254   ...     (0.25 and up need more
    //   rounds: 26 at 0.25, and 0.5 and 1 do not finish in 20)
    // and on the shipped-bow default depth — the case this file already
    // records as unfixable — the gap is FLAT in the ridge (-4.31 to -4.32
    // over 0.02 to 0.25, against the chain's -4.81), because there every
    // pair is deficient and the displacement caps out whatever the weight.
    // So the ridge is chosen on the case that can be solved, and 0.05 is
    // the largest value that still finishes inside the UI's 20 rounds with
    // margin.
    ridge = 0.05, diagonals = true,
    // which curves the inner loop compares — see `ductClearance`. The wrapper
    // above re-reads the answer as "solid" whenever the caller asks for it.
    compare = "station",
    // ── THE PATH-LENGTH BUDGET ──────────────────────────────────────────────
    // A separation displacement always makes a duct's path LONGER, and the
    // equalising bow can only ADD length, so a duct the field pushes past the
    // lengthening target is never caught up to and the overshoot survives as
    // dL. Scoring on the gap alone therefore let a solve hand back a horn
    // 19.9 mm worse in path spread and call it an improvement.
    // THE BOUND IS lambda/8 AT THE PARTITION TARGET, which is the same budget
    // `band` and `wallSpreadMax` are already judged against — 2.18 mm at
    // 20 kHz — not a number invented here. It is a bound on the GROWTH, so a
    // horn whose dL is already large (lengthening off) is held to what it
    // has rather than to zero.
    // WHY BOUND IT RATHER THAN RE-TARGET THE BOW: recomputing the target from
    // the separated paths closes dL and pays for it out of the fold margin —
    // measured on the repel field at the defaults, target 315.1 -> 335.0 mm,
    // bow 20.9 -> 34.6 mm, fold +0.11 -> -1.10 mm (a FOLDED duct) and the gap
    // -4.31 -> -7.04 mm. The stale target was acting as a clamp. Bounding the
    // overshoot at source is what makes the clamp unnecessary.
    dLBudget = null,
  } = cfg;
  const build = (separate) => mapThroatToMouth(throat, {
    ...opts, separate, keepGeometry: true, computeClearance: false,
  });
  const base = build(null);
  if (!base || !base.rows.length || !base.rows[0].sched[0].pts)
    return { ok: false, reason: "no geometry to solve on" };
  const jointAware = !!base.bulge;
  // the floor doubles as the THROAT BOUNDARY: the knife-edge run is where the
  // ducts have not yet opened to it, so asking for it there is asking for
  // room the geometry has had no path length to make. One number sets both,
  // which is what keeps "minimum gap" meaning one thing.
  // EVERY MODE IS SCORED ON THE SAME PAIR SET, diagonals included, because a
  // solver that is not scored on a defect will happily create it. Only
  // "repel" can PUSH on a diagonal pair — the chain walk is by row and
  // column and simply ignores the extra pairs — but all three now report
  // what they leave rather than what they were looking at.
  const STEPS = diagonals
    ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  // THE SOLVER SCORES THE SAME CURVES THE READOUT SHOWS, for the same reason
  // it scores the same pair set: stage 8 and the verdict strip must not print
  // two different numbers for one horn. The exports carry the INSET outlines,
  // so that is what a separation solve is solving for.
  const measure = (m) => ductClearance(m.rows, {
    jointAware, throatFloor: floor, pairSteps: STEPS,
    outline, t: opts.t || 0, floor, compare,
  });
  const clBase = measure(base);
  const gapOf = (cl) => cl.minMid;   // defect-scoped signed worst gap
  const gap0 = gapOf(clBase);
  // lambda/8 at the partition target — the same budget `band` and
  // `wallSpreadMax` are judged against, read from the geometry rather than
  // chosen here
  // UNITS: `c` IS METRES PER SECOND EVERYWHERE IN THIS FILE and lengths are
  // mm, so the wavelength conversion is (c / f) * 1000 — the same expression
  // `lam` uses for `band` and `dLfrac`. Writing it as c / (8 f) instead makes
  // the budget 1000x too small: 2.18 UM, which refuses every state a solve
  // could take, and it does it silently because the guard then simply never
  // passes anything. Caught by three unrelated assertions, not by this one.
  const budget = dLBudget != null ? dLBudget
    : ((opts.c ?? 343) / (opts.fTarget || 20000)) * 1000 / 8;
  const dLCap = base.dL + budget;
  // how far the LONGEST separated path runs past the length every other cell
  // is padded up to. Equal to the leftover dL whenever the bow reaches the
  // target on every short cell, which is the normal case; reported either way
  // so the number on screen has a mechanism attached to it.
  const overOf = (m) => (m.lengthen ? Math.max(0, m.Lmax - m.lengthen.target) : 0);
  // a candidate is only allowed to be BEST if it stays inside the budget —
  // the gap is not the only thing a separation field moves
  const affordable = (m) => m.dL <= dLCap + 1e-9;
  let refused = 0;
  if (gap0 >= floor)
    return { ok: true, already: true, mode, gapBefore: gap0, gapAfter: gap0, amps: null, evals: 1 };

  // the window, from where the trouble actually is
  const S = clBase.perStationDefect.length - 1;
  let qa = Infinity, qb = -Infinity;
  clBase.perStationDefect.forEach((d, q) => {
    if (d < floor) { qa = Math.min(qa, q); qb = Math.max(qb, q); }
  });
  const uStart = Math.max(0.02, qa / S - 0.12);
  const uEnd = Math.min(0.98, qb / S + 0.15);

  let evals = 1;
  const trace = [];

  if (mode === "uniform") {
    // one shared radial amplitude, SCANNED rather than bisected: the gap is
    // not monotone in the spread — measured improving to about 2.4 mm of
    // amplitude and then worsening, because near the throat the ducts almost
    // tile, so past a point every duct is pushed into its other neighbours
    // and the bent paths tilt sections into new contacts. So the mode is a
    // coarse log scan for the best amplitude plus one local refinement, and
    // it reports the best it found whether or not that clears the floor —
    // this field simply cannot fix every defect, and "nudge" is the mode
    // that can move ducts individually.
    const ampsFor = (a) => {
      const amps = {};
      for (const cc of throat.cells) amps[cc.id] = { radial: true, amp: a };
      return amps;
    };
    const gapAt = (a) => {
      if (a <= 1e-9) return { g: gap0, m: base, a: 0 };
      evals++;
      const m = build({ amps: ampsFor(a), uStart, uEnd, lobes });
      const g = gapOf(measure(m));
      trace.push({ amp: +a.toFixed(3), gap: +g.toFixed(4) });
      return { g, m, a };
    };
    let bestU = { g: gap0, m: base, a: 0 };
    const scan = [0.5, 1, 2, 4, 8, 16, Math.min(32, ampCap), ampCap];
    for (const a of scan) {
      const r = gapAt(a);
      if (r.g > bestU.g && affordable(r.m)) bestU = r; else if (!affordable(r.m)) refused++;
      if (r.g >= floor && affordable(r.m)) break;
    }
    // golden-ish local refinement around the best scanned amplitude
    let lo = Math.max(0, bestU.a / 2), hi2 = Math.min(ampCap, Math.max(bestU.a * 2, 1));
    for (let it = 0; it < 6; it++) {
      const m1 = lo + (hi2 - lo) * 0.382, m2 = lo + (hi2 - lo) * 0.618;
      const r1 = gapAt(m1), r2 = gapAt(m2);
      if (r1.g > bestU.g && affordable(r1.m)) bestU = r1; else if (!affordable(r1.m)) refused++;
      if (r2.g > bestU.g && affordable(r2.m)) bestU = r2; else if (!affordable(r2.m)) refused++;
      if (r1.g >= r2.g) hi2 = m2; else lo = m1;
    }
    const okU = bestU.g >= floor - tol;
    return {
      ok: okU, mode, amps: bestU.a > 0 ? ampsFor(bestU.a) : null, uStart, uEnd, lobes,
      gapBefore: gap0, gapAfter: bestU.g, ampMax: bestU.a,
      dL: bestU.m.dL, dLBefore: base.dL, evals, trace,
      dLBudget: budget, dLOver: overOf(bestU.m), dLRefused: refused,
      reason: okU ? null
        : `the best one-knob spread (${bestU.a.toFixed(1)} mm) leaves the worst gap at ${bestU.g.toFixed(2)} mm — try "nudge" or "repel"`
          + (refused ? `; ${refused} larger spread(s) were refused for pushing ΔL past the ${budget.toFixed(2)} mm budget` : ""),
    };
  }

  // ── mode "repel" — EVERY PAIR PUSHES, AND THE PUSHES ARE SOLVED TOGETHER ──
  // The owner's proposal, and it answers three structural limits of the chain
  // rather than tuning it. The chain is exact for a 1-D contact problem and
  // that is why it beat naive pairwise pushes — but the geometry is not 1-D:
  //   (1) it walks each ROW and each COLUMN independently and ADDS the two
  //       fields, so a cell pushed along its row lands somewhere its column
  //       chain never accounted for;
  //   (2) only ORTHOGONAL neighbours are chained at all — 27 pairs at 6x3 —
  //       while the shell audit measured non-adjacent blanks overlapping
  //       millimetres deep two columns apart;
  //   (3) a pair's push is taken at that pair's single worst station.
  // Here every deficient pair contributes ONE linear constraint,
  // (x_b - x_a) . e_p = d_p, and the whole set is solved at once as the
  // regularised least-squares
  //     min_x  sum_p ((x_b - x_a).e_p - d_p)^2  +  ridge * |x|^2
  // through the normal equations and the same LU the B-spline writer uses.
  // That removes (1) outright — rows, columns and diagonals are one system,
  // not three added together — and (2) by including the diagonal steps in
  // both the force set and the objective. It does NOT address (3): the field
  // is still one vector per cell times one window, so this can slide a duct
  // but not re-route it. That is the next thing, and it needs a per-station
  // field rather than a per-cell one.
  // WHY LEAST-SQUARES AND NOT A RELAXATION: the diffusion the chain was built
  // to escape is Jacobi's, and it comes from answering each pair in ignorance
  // of the others. Solving the pairs jointly cannot diffuse — it is one solve
  // — so the chain's decomposition is not needed to avoid it. `ridge` both
  // makes the system positive definite (a cell no constraint touches must get
  // exactly zero, not an arbitrary null-space vector) and states the
  // preference for the smallest displacement that clears the floor.
  // MIRROR SYMMETRY IS BY CONSTRUCTION, not by hand: the pair set and the
  // directions e_p are mirror-complete and the regularised system has a
  // unique solution, so a mirror-symmetric problem has a mirror-symmetric
  // answer. It is asserted rather than assumed.
  if (mode === "repel") {
    const ids = throat.cells.map((cc) => cc.id);
    const slot = new Map(ids.map((id, k) => [id, k]));
    const N = ids.length, n2 = 2 * N;
    const span = uEnd - uStart;
    const winAt = (u) => {
      if (u < uStart || u > uEnd) return 0;
      return Math.sin(lobes * Math.PI * ((u - uStart) / span)) ** 2;
    };
    const acc = {};
    for (const id of ids) acc[id] = [0, 0];
    const ampsFromAcc = () => {
      const amps = {};
      for (const id in acc) {
        const n = Math.hypot(acc[id][0], acc[id][1]);
        if (n > 1e-9) amps[id] = { dx: acc[id][0] / n, dy: acc[id][1] / n, amp: n };
      }
      return amps;
    };
    let m = base, cl = clBase, iters = 0;
    let best = { gap: gap0, acc: null, dL: base.dL };
    for (let it = 0; it < maxIter; it++) {
      // one constraint per pair that is under the floor, at that pair's own
      // worst station, divided by the window there so the amplitude asked for
      // delivers the deficit where the deficit is
      const cons = [];
      for (const pw of cl.pairWorst) {
        if (!(pw.gap < floor) || pw.at == null) continue;
        const A = m.rows.find((r) => r.id === pw.a), B = m.rows.find((r) => r.id === pw.b);
        if (!A || !B) continue;
        const ca = A.sched[pw.at].centroid, cb = B.sched[pw.at].centroid;
        const ex = cb[0] - ca[0], ey = cb[1] - ca[1];
        const en = Math.hypot(ex, ey);
        if (!(en > 1e-9)) continue;
        const w = Math.max(winAt(pw.at / (A.sched.length - 1)), 0.33);
        cons.push({ a: slot.get(A.id), b: slot.get(B.id),
                    e: [ex / en, ey / en], d: (floor - pw.gap) / w });
      }
      if (!cons.length) break;
      const Amat = Array.from({ length: n2 }, () => new Array(n2).fill(0));
      const bvec = new Array(n2).fill(0);
      for (const { a, b, e, d } of cons) {
        const idx = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1];
        const sg = [-e[0], -e[1], e[0], e[1]];
        for (let p = 0; p < 4; p++) {
          bvec[idx[p]] += sg[p] * d;
          for (let q = 0; q < 4; q++) Amat[idx[p]][idx[q]] += sg[p] * sg[q];
        }
      }
      // THE RIDGE IS RELATIVE TO THE CONSTRAINT BLOCK, NOT ABSOLUTE. An
      // absolute Tikhonov weight is not scale free here: the constraint
      // block's diagonal grows with how many pairs are pushing, so one
      // number is heavy damping on a horn with a few deficient pairs and
      // almost none on a horn where every pair is deficient. Measured on
      // the recorded 6x3/d320 case (15 of 47 pairs deficient) an absolute
      // ridge of 8 moved 0.45 mm in 12 rounds and the iteration turned
      // round; the same weight on the shipped-bow default (every pair
      // deficient) was the knee. Normalising by the mean diagonal makes the
      // knob mean the same thing on both.
      let dbar = 0;
      for (let i = 0; i < n2; i++) dbar += Amat[i][i];
      dbar = Math.max(dbar / n2, 1e-9);
      for (let i = 0; i < n2; i++) Amat[i][i] += ridge * dbar;
      const lu = luFactor(Amat);
      if (!lu) break;
      const x = luSolve(lu, bvec);
      if (!x) break;
      for (let k = 0; k < N; k++) {
        acc[ids[k]][0] += relax * x[2 * k];
        acc[ids[k]][1] += relax * x[2 * k + 1];
      }
      for (const id in acc) {
        const n = Math.hypot(acc[id][0], acc[id][1]);
        if (n > ampCap) { acc[id][0] *= ampCap / n; acc[id][1] *= ampCap / n; }
      }
      evals++; iters++;
      m = build({ amps: ampsFromAcc(), uStart, uEnd, lobes });
      cl = measure(m);
      trace.push({ iter: iters, gap: +gapOf(cl).toFixed(4), cons: cons.length });
      if (gapOf(cl) > best.gap && affordable(m))
        best = { gap: gapOf(cl), dL: m.dL,
                 acc: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.slice()])) };
      else if (!affordable(m)) refused++;
      if (gapOf(cl) >= floor - tol) break;
    }
    // a solver that cannot improve on its input returns its input — the rule
    // the chain mode learned the hard way, applied here from the start
    // RESTORE ON EITHER TEST, and the second one is why: `best` is now a
    // filtered maximum (affordable states only), so the last iterate can beat
    // it on the gap while being over the budget. Guarding on the gap alone
    // would hand that state back and the budget would be advisory.
    if (best.gap > gapOf(cl) || !affordable(m)) {
      if (best.acc) for (const id in best.acc) acc[id] = best.acc[id];
      else for (const id in acc) acc[id] = [0, 0];
      m = build({ amps: ampsFromAcc(), uStart, uEnd, lobes });
      cl = measure(m);
    }
    const ampsR = ampsFromAcc();
    const gR = gapOf(cl);
    return {
      ok: gR >= floor - tol, mode, amps: Object.keys(ampsR).length ? ampsR : null,
      uStart, uEnd, lobes, gapBefore: gap0, gapAfter: gR,
      ampMax: Math.max(0, ...Object.values(ampsR).map((e) => e.amp)),
      iters, dL: m.dL, dLBefore: base.dL, evals, trace,
      pairs: cl.pairs, diagonals: STEPS.length > 2,
      dLBudget: budget, dLOver: overOf(m), dLRefused: refused,
      reason: gR >= floor - tol ? null
        : `after ${iters} rounds the worst gap is still ${gR.toFixed(2)} mm`      + (refused
        ? `; ${refused} deeper state(s) were refused for pushing ΔL past the ${budget.toFixed(2)} mm budget`
        : ""),
    };
  }

  // mode "nudge" — chain-resolved contact iteration. The measured failure
  // mode of naive pairwise pushes is the CHAIN: a whole row of ducts is
  // over-packed near the throat, so every pair pushes apart, every push
  // steals the next pair's room, and the iteration diffuses outward like
  // Jacobi — measured stuck between -0.6 and -1.9 mm after 16 rounds. A
  // 1-D contact chain has an exact minimal solution: walk the row, add up
  // the deficits, and displace each cell by the mean-centred cumulative sum
  // — the ends move out, the middle barely moves, and every pair opens by
  // exactly its deficit. Rows and columns are chained independently; the
  // cumulative fields are mirror-antisymmetric over mirror-symmetric
  // deficits, so the mirrors survive by construction. The chain is written
  // on the deficits at each pair's own worst station and divided by the
  // window there, then applied with relaxation and re-MEASURED — the chain
  // argument is 1-D and the geometry is not, so the measurement, not the
  // argument, decides convergence.
  const byIJ = new Map(base.rows.map((r) => [`${r.i},${r.j}`, r.id]));
  const dims = base.rows.reduce((d, r) => ({
    nc: Math.max(d.nc, r.i + 1), nr: Math.max(d.nr, r.j + 1),
  }), { nc: 0, nr: 0 });
  const acc = {};
  for (const cc of throat.cells) acc[cc.id] = [0, 0];
  const span = uEnd - uStart;
  const winAt = (u) => {
    if (u < uStart || u > uEnd) return 0;
    return Math.sin(lobes * Math.PI * ((u - uStart) / span)) ** 2;
  };
  const ampsFromAcc = () => {
    const amps = {};
    for (const id in acc) {
      const [x, y] = acc[id];
      const n = Math.hypot(x, y);
      if (n > 1e-9) amps[id] = { dx: x / n, dy: y / n, amp: n };
    }
    return amps;
  };
  let m = base, cl = clBase, iters = 0;
  // the best configuration seen, because the iteration can flip-flop right
  // at the threshold while chasing the last marginal pair — the answer is
  // the best state visited, not the last one
  let best = { gap: gap0, acc: null, dL: base.dL };
  for (let it = 0; it < maxIter; it++) {
    const relaxNow = relax;
    // per-pair deficit and push direction at that pair's own worst station
    const pairInfo = new Map();
    for (const pw of cl.pairWorst) {
      if (!(pw.gap < floor) || pw.at == null) continue;
      const A = m.rows.find((r) => r.id === pw.a), B = m.rows.find((r) => r.id === pw.b);
      const ca = A.sched[pw.at].centroid, cb = B.sched[pw.at].centroid;
      const ex = cb[0] - ca[0], ey = cb[1] - ca[1];
      const en = Math.hypot(ex, ey);
      if (!(en > 1e-9)) continue;
      const S2 = A.sched.length - 1;
      const w = Math.max(winAt(pw.at / S2), 0.33);
      pairInfo.set(`${A.i},${A.j}|${B.i},${B.j}`, {
        deficit: (floor - pw.gap) / w, e: [ex / en, ey / en],
      });
    }
    if (!pairInfo.size) break;
    // chain solve along each row (i-direction) and each column (j-direction)
    // rows: chains of nc cells at fixed j, pairs keyed A=(k,j) B=(k+1,j)
    for (let j = 0; j < dims.nr; j++) {
      const d = [], dirs = [];
      for (let k = 0; k < dims.nc - 1; k++) {
        const info = pairInfo.get(`${k},${j}|${k + 1},${j}`);
        d.push(info ? info.deficit : 0);
        dirs.push(info ? info.e : null);
      }
      if (!d.some((x) => x > 0)) continue;
      const cum = [0];
      for (let k = 0; k < dims.nc - 1; k++) cum.push(cum[k] + d[k]);
      const mean = cum.reduce((a, b) => a + b, 0) / dims.nc;
      for (let k = 0; k < dims.nc; k++) {
        const x = (cum[k] - mean) * relaxNow;
        if (Math.abs(x) < 1e-12) continue;
        const eA = dirs[k - 1] || null, eB = dirs[k] || null;
        let ex = 0, ey = 0;
        if (eA) { ex += eA[0]; ey += eA[1]; }
        if (eB) { ex += eB[0]; ey += eB[1]; }
        const en = Math.hypot(ex, ey);
        if (!(en > 1e-9)) continue;
        const id = byIJ.get(`${k},${j}`);
        acc[id][0] += (ex / en) * x; acc[id][1] += (ey / en) * x;
      }
    }
    // columns: chains of nr cells at fixed i
    for (let i2 = 0; i2 < dims.nc; i2++) {
      const d = [], dirs = [];
      for (let k = 0; k < dims.nr - 1; k++) {
        const info = pairInfo.get(`${i2},${k}|${i2},${k + 1}`);
        d.push(info ? info.deficit : 0);
        dirs.push(info ? info.e : null);
      }
      if (!d.some((x) => x > 0)) continue;
      const cum = [0];
      for (let k = 0; k < dims.nr - 1; k++) cum.push(cum[k] + d[k]);
      const mean = cum.reduce((a, b) => a + b, 0) / dims.nr;
      for (let k = 0; k < dims.nr; k++) {
        const x = (cum[k] - mean) * relaxNow;
        if (Math.abs(x) < 1e-12) continue;
        const eA = dirs[k - 1] || null, eB = dirs[k] || null;
        let ex = 0, ey = 0;
        if (eA) { ex += eA[0]; ey += eA[1]; }
        if (eB) { ex += eB[0]; ey += eB[1]; }
        const en = Math.hypot(ex, ey);
        if (!(en > 1e-9)) continue;
        const id = byIJ.get(`${i2},${k}`);
        acc[id][0] += (ex / en) * x; acc[id][1] += (ey / en) * x;
      }
    }
    for (const id in acc) {
      const n = Math.hypot(acc[id][0], acc[id][1]);
      if (n > ampCap) { acc[id][0] *= ampCap / n; acc[id][1] *= ampCap / n; }
    }
    evals++;
    iters++;
    m = build({ amps: ampsFromAcc(), uStart, uEnd, lobes });
    cl = measure(m);
    const ampNow = Math.max(0, ...Object.values(ampsFromAcc()).map((e) => e.amp));
    trace.push({ iter: iters, gap: +gapOf(cl).toFixed(4), ampMax: +ampNow.toFixed(2) });
    if (gapOf(cl) > best.gap && affordable(m))
      best = { gap: gapOf(cl), acc: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.slice()])), dL: m.dL };
    else if (!affordable(m)) refused++;
    if (gapOf(cl) >= floor - tol && affordable(m)) break;
  }
  // Hand back the BEST configuration, rebuilt if the last step was not it.
  // `best` starts at the UNSEPARATED gap with a null field, so when no
  // iterate ever beats doing nothing the answer is "no displacement" — and
  // that case has to be handled explicitly. Guarding the restore on
  // `best.acc` alone fell through to the LAST iterate instead, which is the
  // one the chain had just driven furthest into trouble: measured on the
  // tool's own default lengthening (throat fifth, 1 lobe) the solver
  // returned a field that took the worst gap from -5.10 mm to -6.80 mm,
  // and the UI applies whatever field comes back, so a failed solve made
  // the horn WORSE. A solver that cannot improve on the input must return
  // the input.
  // same two tests as the repel restore: `best` only ever holds affordable
  // states, so an over-budget last iterate must be discarded even when its
  // gap is better
  if (best.gap > gapOf(cl) || !affordable(m)) {
    if (best.acc) for (const id in best.acc) acc[id] = best.acc[id];
    else for (const id in acc) acc[id] = [0, 0];
    m = build({ amps: ampsFromAcc(), uStart, uEnd, lobes });
    cl = measure(m);
  }
  const amps = ampsFromAcc();
  const ampMax = Math.max(0, ...Object.values(amps).map((e) => e.amp));
  const gA = gapOf(cl);
  return {
    ok: gA >= floor - tol, mode, amps: Object.keys(amps).length ? amps : null, uStart, uEnd, lobes,
    gapBefore: gap0, gapAfter: gA, ampMax, iters, dL: m.dL, dLBefore: base.dL, evals, trace,
    dLBudget: budget, dLOver: overOf(m), dLRefused: refused,
    reason: gA >= floor - tol ? null
      : `after ${iters} rounds the worst gap is still ${gA.toFixed(2)} mm`      + (refused
        ? `; ${refused} deeper state(s) were refused for pushing ΔL past the ${budget.toFixed(2)} mm budget`
        : ""),
  };
}

// ── DEPTH FOR MINIMUM dL ────────────────────────────────────────────────────
// The other leg of the pick-two-of-three {fc, mouth size, dL-optimal depth}.
// The mechanism is geometric: when the mouth's curvature centre lands on the
// throat, the mouth IS a sphere about the throat and every point of it is the
// same distance away, so dL collapses without any path manipulation. That
// happens near depth = mouth radius; measured optima run ~9% deeper because
// the paths curve and so run slightly longer than the chord. Hence the seed
// 1.09 x mean of the finite radii, and a golden section on the REAL dL —
// measured through the forward mapping, never the chord argument — to finish.
//
// The search runs with NO profile imposed: dL is measured on the centrelines,
// which the profile never moves (it scales sections about their own
// centroids), so the optimum is purely geometric and identical at every T —
// measured: best depth and dL agree at T = 0, 0.35, 0.7, 1 and null.
// Skipping the per-cell m solve just makes each evaluation cheaper.
//
// dL is convex in depth with an interior minimum (shallow: rim cells reach
// further; deep: the centre cell does; the flip is the minimum), so golden
// section cannot lose it. The minimum is broad, so tolMm is loose.
export function solveDepthForMinDL(throat, opts, cfg = {}) {
  const { iters = 40, tolMm = 0.5 } = cfg;
  const { thetaH = 90, thetaV = 40, arcH = 480, arcV = 213 } = opts;
  const aH = (thetaH / 2) * D2R, eV = (thetaV / 2) * D2R;
  const radii = [];
  if (aH > 1e-9) radii.push(arcH / (2 * aH));
  if (eV > 1e-9) radii.push(arcV / (2 * eV));
  // both axes flat is a plane: no curvature centre exists to land on the
  // throat, so there is nothing for depth to equalise
  if (!radii.length) return { ok: false, reason: "flat mouth" };
  const seedDepth = 1.09 * (radii.reduce((a, b) => a + b, 0) / radii.length);
  let evals = 0;
  const dLAt = (depth) => {
    evals++;
    const m = mapThroatToMouth(throat, {
      ...opts, depth, profileT: null, keepGeometry: false, computeClearance: false,
    });
    return m ? m.dL : Infinity;
  };
  const gr = (Math.sqrt(5) - 1) / 2;
  const lo0 = Math.max(10, 0.4 * seedDepth), hi0 = 2.2 * seedDepth;
  let lo = lo0, hi = hi0;
  let x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
  let f1 = dLAt(x1), f2 = dLAt(x2);
  if (!isFinite(f1) && !isFinite(f2)) return { ok: false, reason: "no mapping", evals };
  for (let i = 0; i < iters && hi - lo > tolMm; i++) {
    if (f1 <= f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - gr * (hi - lo); f1 = dLAt(x1); }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + gr * (hi - lo); f2 = dLAt(x2); }
  }
  const depth = f1 <= f2 ? x1 : x2;
  return {
    ok: true, depth, dL: Math.min(f1, f2), seed: seedDepth, evals,
    bracket: hi - lo,
    // an answer against the bracket edge means the minimum was not interior
    // here — report it rather than presenting an endpoint as an optimum
    atBound: depth < lo0 * 1.02 || depth > hi0 * 0.98,
  };
}

function resamplePoly(poly, n) {
  const L = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    L.push(L[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const tot = L[L.length - 1];
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (tot * k) / n;
    let i = 0;
    while (i < poly.length - 1 && L[i + 1] < target) i++;
    const u = (target - L[i]) / Math.max(L[i + 1] - L[i], 1e-12);
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

// Resample ONE SIDE — an open polyline from corner to corner — to n points,
// the first at the starting corner and the last one step short of the end, so
// four of these concatenate into a closed loop with the corners at known
// indices. The closed-loop resampler above cannot do this: it walks arc length
// round the whole cell from an arbitrary start, which lands the four corners
// wherever the side lengths happen to put them.
function resampleOpen(pts, n) {
  const L = [0];
  for (let i = 0; i < pts.length - 1; i++)
    L.push(L[i] + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  const tot = L[L.length - 1];
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (tot * k) / n;
    let i = 0;
    while (i < pts.length - 2 && L[i + 1] < target) i++;
    const u = (target - L[i]) / Math.max(L[i + 1] - L[i], 1e-12);
    const a = pts[i], b = pts[i + 1];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

// The four sides of a line-grid cell, as separate corner-to-corner polylines.
// lineGridCells lays the outline down one side at a time with an equal sample
// count each, so the corners sit at exact multiples of poly.length / 4.
// ── THE 1-D HYPEX REFERENCE ─────────────────────────────────────────────────
// What a plain Hypex horn of this throat would need to reach the cutoff you
// asked for. It is the same calculation the standalone horn tool does, run on
// the multicell's ACOUSTIC throat — the summed OPEN area of the cells, not the
// driver's bore, because the dividers are in the way and the wave only sees
// what is left.
//
// The mouth size is set by whichever of two criteria binds:
//
//   LOADING     the mouth must be large enough that the wave stops seeing an
//               impedance step there. The classic statement is a mouth
//               circumference of about one wavelength at cutoff, i.e. a
//               diameter of c / (pi fc).
//   DIRECTIVITY a mouth narrower than about a wavelength across cannot hold
//               a pattern down to cutoff. For a coverage angle Th the mouth
//               dimension wanted is roughly c / (fc sin(Th/2)), so the WIDER
//               the coverage the smaller the mouth it needs — which is why a
//               narrow-coverage horn is the one that ends up large.
//
// Reported as a reference, not imposed: the actual mouth comes from the
// coverage and cap geometry, and this says how far short of the 1-D
// requirement it falls.
export function hypexReference({ throatArea, fc, T = 0.7, c = 343, coverageDeg = 90 }) {
  if (!(throatArea > 0) || !(fc > 0)) return null;
  const rt = Math.sqrt(throatArea / Math.PI);          // equivalent throat radius, mm
  const m = hypexMForFc(fc, c);                        // per mm
  const lam = (c / fc) * 1000;                         // mm
  const diaLoading = lam / Math.PI;
  const half = Math.max(1e-6, Math.sin((coverageDeg / 2) * D2R));
  const diaDirectivity = lam / half;
  const dia = Math.max(diaLoading, diaDirectivity);
  const governedBy = diaDirectivity >= diaLoading ? "directivity" : "loading";
  const areaFor = (d) => Math.PI * (d / 2) ** 2;
  const lenFor = (d) => {
    const ratio = (d / 2) / rt;
    return ratio > 1 ? hypexLengthForRatio(ratio, m, T) : 0;
  };
  return {
    throatArea, rt, m, fc, T, lambda: lam,
    diaLoading, diaDirectivity, dia, governedBy,
    areaLoading: areaFor(diaLoading),
    areaDirectivity: areaFor(diaDirectivity),
    mouthArea: areaFor(dia),
    lenLoading: lenFor(diaLoading),
    lenDirectivity: lenFor(diaDirectivity),
    minLength: lenFor(dia),
    ratio: (dia / 2) / rt,
  };
}

export function cellSides(poly) {
  const n = poly.length / 4;
  if (!Number.isInteger(n)) return null;
  const out = [];
  for (let e = 0; e < 4; e++) {
    const side = [];
    for (let q = 0; q <= n; q++) side.push(poly[(e * n + q) % poly.length]);
    out.push(side);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// FABRICATION
// ═══════════════════════════════════════════════════════════════════════════
// tMin is the thinnest wall the process prints RELIABLY, not the thinnest it
// can be made to produce once. FDM's 0.4 mm is Arachne variable-width on a
// 0.4 mm nozzle, which is a measured result rather than the old single-bead
// 0.8 mm rule. Ra is unchanged by nozzle diameter — on FDM it is set by layer
// height, so a finer nozzle buys wall thickness, not smoothness.
export const PROCESSES = {
  FDM: { label: "FDM", tMin: 0.4, ra: 27.5 },
  MSLA: { label: "MSLA resin", tMin: 0.4, ra: 5 },
};

export function fabrication({ throat, t, R, c, f, process = "FDM" }) {
  const proc = PROCESSES[process] || PROCESSES.FDM;
  const blockage = throat.blockage;
  // the shell has to grow to give back the area the dividers took
  const dShell = (2 * R) / Math.sqrt(Math.max(1 - blockage, 1e-6));
  const deltaV = Math.sqrt((2 * NU) / (TAU * Math.max(f, 1))) * 1000; // mm
  return {
    process: proc, tMin: proc.tMin, tooThin: t < proc.tMin,
    blockage, dShell, oversize: dShell - 2 * R,
    dividerTotal: throat.dividerTotal,
    deltaV, ra: proc.ra / 1000,
    roughRatio: proc.ra / 1000 / deltaV,
    // wide-tube Kirchhoff, smooth wall — a LOWER bound once Ra approaches delta_v
    lossPerMm: (dh) => {
      const a = dh / 2 / 1000;
      if (!(a > 0)) return null;
      return ((TV / (a * c)) * Math.sqrt((NU * TAU * f) / 2)) * 1e-3 * 8.686;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE AND OPTIMISER
// ═══════════════════════════════════════════════════════════════════════════
// One call from the UI. The H-grid runs the line solve; the two comparison
// families run the mesh solve. Both come back as the same throat record.

// The H-grid is the only throat family. The O-grid — concentric rings, no
// singular vertices — was the comparison baseline while the question was
// still "which partition gives the best f1"; it was removed once the answer
// stopped mattering. It never had a rectangular index, so it could never
// reach the mouth mapping at all, and the recorded comparison (6x3 at
// ~14.9 kHz against 1+6+12 at 22.4 kHz) stands in CLAUDE.md without needing
// the code kept alive to reproduce it.
export function buildLayout(o) {
  const {
    R, nc = 6, nr = 3, m = 2, symmetric = true,
    params = null, seed: seedKind = "elliptical", seedObj = null, pStart = null,
    alphaDeg = null, t = 0, c = 343, solveOpts = {},
  } = o;
  const cfg = lineGridConfig({ nc, nr, m, symmetric });
  const pReq = params ? params.slice() : nominalParams(cfg);
  if (alphaDeg != null) pReq[cfg.alphaAt] = alphaDeg * D2R;
  const sol = solveEqualArea(cfg, pReq, { R, seedKind, seed: seedObj, pStart, t, ...solveOpts });
  const cells = lineGridCells(sol.geometry, { c, t });
  const throat = analyseThroat(cells, { c, R, dividerTotal: lineGridDividerLength(sol.geometry) });
  return { cfg, solve: sol, geometry: sol.geometry, throat, seedObj: sol.seed, rectangular: true, nc, nr };
}

// The objective is unchanged — maximise the minimum cell first mode — but the
// search space is now the 7-13 line parameters, so Nelder-Mead is enough. Every
// candidate goes through the equal-area solve first, so f1 is only ever
// evaluated on a grid that already has equal areas.
//
// TWIST is now a reported diagnostic rather than a penalty by default: a
// symmetric whole-line warp generates almost no swirl, so weighting it was
// steering the search against a cost it was not really paying. The weight is
// still exposed for anyone who wants it back.
export function objective(throat, map, w = {}) {
  const {
    aspectTarget = 1.6, wAspect = 0.6, wTwist = 0, wCorrection = 0.5,
    beta = 1.2, correction = 0, infeasible = false,
  } = w;
  const f = throat.cells.map((x) => x.f1 / 1000);
  const fmin = Math.min(...f);
  const soft = fmin - (1 / beta) * Math.log(f.reduce((s, v) => s + Math.exp(-beta * (v - fmin)), 0));
  let asp = 0;
  throat.cells.forEach((x) => { const e = Math.max(0, x.aspect - aspectTarget); asp += e * e; });
  asp /= throat.cells.length;
  const twist = map ? map.twistMax / 10 : 0;
  return {
    J: -soft + wAspect * asp + wTwist * twist + wCorrection * correction + (infeasible ? 50 : 0),
    soft, fmin, aspectPenalty: asp, twistPenalty: twist, correctionPenalty: correction,
  };
}

// Nelder-Mead. Derivative-free, small, and adequate for a smooth objective on
// this many parameters; CMA-ES would be the next step if the landscape turned
// out to be multi-modal, which on these tests it has not.
export function nelderMead(fn, x0, opts = {}) {
  const { maxEval = 400, step = 0.12, tol = 1e-7, onStep = null } = opts;
  const n = x0.length;
  if (!n) return { x: x0, f: fn(x0), evals: 1 };
  let evals = 0;
  const F = (x) => { evals++; return fn(x); };
  const simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += step * (Math.abs(p[i]) > 1e-9 ? Math.abs(p[i]) : 1);
    simplex.push(p);
  }
  let fv = simplex.map(F);
  const order = () => {
    const idx = simplex.map((_, i) => i).sort((a, b) => fv[a] - fv[b]);
    const s2 = idx.map((i) => simplex[i]), f2 = idx.map((i) => fv[i]);
    for (let i = 0; i <= n; i++) { simplex[i] = s2[i]; fv[i] = f2[i]; }
  };
  order();
  while (evals < maxEval) {
    if (Math.abs(fv[n] - fv[0]) < tol * (Math.abs(fv[0]) + tol)) break;
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) cen[k] += simplex[i][k] / n;
    const refl = cen.map((v, k) => v + (v - simplex[n][k]));
    const fr = F(refl);
    if (fr < fv[0]) {
      const exp = cen.map((v, k) => v + 2 * (v - simplex[n][k]));
      const fe = F(exp);
      if (fe < fr) { simplex[n] = exp; fv[n] = fe; } else { simplex[n] = refl; fv[n] = fr; }
    } else if (fr < fv[n - 1]) { simplex[n] = refl; fv[n] = fr; }
    else {
      const con = cen.map((v, k) => v + 0.5 * (simplex[n][k] - v));
      const fc = F(con);
      if (fc < fv[n]) { simplex[n] = con; fv[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k]));
          fv[i] = F(simplex[i]);
        }
      }
    }
    order();
    if (onStep) onStep(evals, fv[0], simplex[0]);
  }
  return { x: simplex[0], f: fv[0], evals };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID LINES AS THE PRIMITIVE
// ═══════════════════════════════════════════════════════════════════════════
//
// Each latitude and longitude line is ONE continuous curve carrying its own
// low-order shape parameters, defined in the reference square and pushed
// through the seed map. Nodes and per-edge control points are gone: a node is
// now just where two lines cross, and an edge is just the piece of a line
// between two crossings.
//
// This is not a tensor-product grid. Each line carries independent
// coefficients, so the composite has far more freedom than two division
// vectors — and far less than free nodes, which is the point. The parameters
// are legible:
//
//     u_i(v) = u0_i + SUM_k a_ik T_2k(v)        longitude line i
//     v_j(u) = v0_j + SUM_k b_jk T_2k(u)        latitude line j
//
//     u0   where the line sits
//     a_1  HOW MUCH the line bows        (the T_2 term)
//     a_2  WHERE the bow concentrates    (the T_4 term) — mid-line vs rim
//     a_3+ finer structure, rarely needed
//
// Only even Chebyshev orders appear under mirror symmetry: odd orders break
// it, and T_0 is a constant already absorbed into u0. T_2k(±1) = 1 for every
// k, so a bow moves the line's rim endpoints as well as its middle — that is
// deliberate, and it is how the rim division adapts.
//
// WHAT THIS COST US. Free nodes could always reach equal area; whole-line
// curvature cannot. The solve can genuinely have no solution, and §feasibility
// below says so rather than returning a converged-looking distorted grid.

// Gauss-Legendre on [0,1], built by Newton on the Legendre roots rather than
// pasted in, so the order is a parameter and not a transcription risk.
function gaussLegendre(n) {
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let t = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 1;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = 0;
      for (let j = 0; j < n; j++) { const p2 = p1; p1 = p0; p0 = ((2 * j + 1) * t * p1 - j * p2) / (j + 1); }
      dp = (n * (t * p0 - p1)) / (t * t - 1);
      const dt = -p0 / dp;
      t += dt;
      if (Math.abs(dt) < 1e-15) break;
    }
    x.push((1 - t) / 2);
    w.push(1 / ((1 - t * t) * dp * dp));
  }
  return { x, w };
}
const GL_CACHE = new Map();
const glRule = (n) => {
  if (!GL_CACHE.has(n)) GL_CACHE.set(n, gaussLegendre(n));
  return GL_CACHE.get(n);
};
const GL32 = glRule(32);

// Chebyshev of the first kind and its derivative, T'_n = n U_(n-1).
export function chebT(n, x) {
  if (n === 0) return 1;
  let a = 1, b = x;
  for (let k = 2; k <= n; k++) { const c = 2 * x * b - a; a = b; b = c; }
  return n === 1 ? x : b;
}
export function chebTd(n, x) {
  if (n === 0) return 0;
  // U_(n-1) by its own recurrence
  let a = 1, b = 2 * x;
  if (n === 1) return 1;
  if (n === 2) return 2 * (2 * x);
  for (let k = 2; k <= n - 1; k++) { const c = 2 * x * b - a; a = b; b = c; }
  return n * b;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED MAPS
// ═══════════════════════════════════════════════════════════════════════════
//
// A seed map Phi carries the reference square onto the disc. It must:
//   · send the square's boundary onto the circle, so line endpoints land on
//     the rim with nothing to enforce;
//   · put the square's four corners at the requested half-angle alpha, which
//     is where the topological singularities end up.
//
// Both maps expose the same three things: the point, its Jacobian, and — for
// boundary points only — an UNWRAPPED rim angle running monotonically from
// -alpha at the (u=1, v=-1) corner all the way round to 2pi-alpha. That angle
// is what makes rim edges exact: a rim edge's area contribution is R^2 dtheta / 2
// with no quadrature at all, so the sum over all cells closes on pi R^2 to
// machine precision no matter how the interior is evaluated.

const SIDE = { R: 0, T: 1, L: 2, B: 3 };

function sideOf(u, v) {
  const e = 1e-12;
  if (u >= 1 - e) return SIDE.R;
  if (v >= 1 - e) return SIDE.T;
  if (u <= -1 + e) return SIDE.L;
  if (v <= -1 + e) return SIDE.B;
  return -1;
}

// ── elliptical grid map, with the corners moved to ±alpha ──────────────────
// The closed-form map puts its own corners at 45 degrees whatever alpha is, so
// the boundary displacement needed to honour alpha is carried inward by a
// transfinite (Coons) blend. Cheap, and a diffeomorphism over the alpha range
// the UI allows.
function ellipticalSeed(R, alpha0) {
  let alpha = alpha0, spanX = Math.PI - 2 * alpha;
  const rimTheta = (side, t) => {
    if (side === SIDE.R) return alpha * t;                       // t = v, -1..1
    if (side === SIDE.T) return alpha + (spanX * (1 - t)) / 2;   // t = u,  1..-1
    if (side === SIDE.L) return Math.PI - alpha * t;             // t = v,  1..-1
    return Math.PI + alpha + (spanX * (1 + t)) / 2;              // t = u, -1..1
  };
  const bnd = (side, t) => {
    const th = rimTheta(side, t);
    return [R * Math.cos(th), R * Math.sin(th)];
  };
  const base = (u, v) => [R * u * Math.sqrt(1 - (v * v) / 2), R * v * Math.sqrt(1 - (u * u) / 2)];
  const baseJac = (u, v) => {
    const su = Math.sqrt(1 - (u * u) / 2), sv = Math.sqrt(1 - (v * v) / 2);
    return [[R * sv, (-R * u * v) / (2 * sv)], [(-R * u * v) / (2 * su), R * su]];
  };
  // d(theta)/dt along each side, from the rim parameterisation above
  const thd = (side) => (side === SIDE.R ? alpha : side === SIDE.T ? -spanX / 2
    : side === SIDE.L ? -alpha : spanX / 2);
  // derivative of the boundary displacement along its own side
  const dispD = (side, t) => {
    const th = rimTheta(side, t), k = thd(side);
    const bd = [-R * k * Math.sin(th), R * k * Math.cos(th)];
    const J = side === SIDE.R ? baseJac(1, t) : side === SIDE.T ? baseJac(t, 1)
      : side === SIDE.L ? baseJac(-1, t) : baseJac(t, -1);
    // along R/L the free coordinate is v, along T/B it is u
    const col = side === SIDE.R || side === SIDE.L ? 1 : 0;
    return [bd[0] - J[0][col], bd[1] - J[1][col]];
  };
  const disp = (side, t) => {
    const p = side === SIDE.R ? base(1, t) : side === SIDE.T ? base(t, 1)
      : side === SIDE.L ? base(-1, t) : base(t, -1);
    const q = bnd(side, t);
    return [q[0] - p[0], q[1] - p[1]];
  };
  // the four corner displacements are constants of alpha, not of (u,v)
  let K00 = disp(SIDE.B, -1), K10 = disp(SIDE.B, 1);
  let K01 = disp(SIDE.T, -1), K11 = disp(SIDE.T, 1);
  const map = (u, v) => {
    const p = base(u, v);
    const a = (u + 1) / 2, b = (v + 1) / 2;
    const dL = disp(SIDE.L, v), dR = disp(SIDE.R, v);
    const dB = disp(SIDE.B, u), dT = disp(SIDE.T, u);
    return [
      p[0] + (1 - a) * dL[0] + a * dR[0] + (1 - b) * dB[0] + b * dT[0]
        - ((1 - a) * (1 - b) * K00[0] + a * (1 - b) * K10[0] + (1 - a) * b * K01[0] + a * b * K11[0]),
      p[1] + (1 - a) * dL[1] + a * dR[1] + (1 - b) * dB[1] + b * dT[1]
        - ((1 - a) * (1 - b) * K00[1] + a * (1 - b) * K10[1] + (1 - a) * b * K01[1] + a * b * K11[1]),
    ];
  };
  // Analytic, not a central difference. A difference quotient is accurate
  // enough for the areas themselves but is NOT sign-symmetric, so mirrored
  // cells came out equal only to 1e-10 — and mirrored cells being equal to the
  // last bit is a property this parameterisation is supposed to guarantee.
  const jac = (u, v) => {
    const a = (u + 1) / 2, b = (v + 1) / 2;
    const B = baseJac(u, v);
    const dL = disp(SIDE.L, v), dR = disp(SIDE.R, v);
    const dB = disp(SIDE.B, u), dT = disp(SIDE.T, u);
    const dLv = dispD(SIDE.L, v), dRv = dispD(SIDE.R, v);
    const dBu = dispD(SIDE.B, u), dTu = dispD(SIDE.T, u);
    const out = [[0, 0], [0, 0]];
    for (let c = 0; c < 2; c++) {
      const bl_u = -0.5 * (1 - b) * K00[c] + 0.5 * (1 - b) * K10[c]
        - 0.5 * b * K01[c] + 0.5 * b * K11[c];
      const bl_v = -0.5 * (1 - a) * K00[c] - 0.5 * a * K10[c]
        + 0.5 * (1 - a) * K01[c] + 0.5 * a * K11[c];
      out[c][0] = B[c][0] + 0.5 * (dR[c] - dL[c]) + (1 - b) * dBu[c] + b * dTu[c] - bl_u;
      out[c][1] = B[c][1] + (1 - a) * dLv[c] + a * dRv[c] + 0.5 * (dT[c] - dB[c]) - bl_v;
    }
    return out;
  };
  const self = {
    kind: "elliptical", R, map, rimTheta, jac,
    get alpha() { return alpha; },
    // alpha is a SOLVE parameter, so the seed has to move with it rather than
    // being rebuilt — rebuilding would throw away the conformal seed's warm
    // start on every iteration
    setAlpha(a) {
      if (a === alpha) return;
      alpha = a; spanX = Math.PI - 2 * alpha;
      K00 = disp(SIDE.B, -1); K10 = disp(SIDE.B, 1);
      K01 = disp(SIDE.T, -1); K11 = disp(SIDE.T, 1);
    },
    mapJac: (u, v) => ({ P: map(u, v), J: jac(u, v) }),
  };
  return self;
}

// ── conformal (Schwarz-Christoffel) ────────────────────────────────────────
// Angle-preserving, so cells start locally square — the best shapes available,
// with the wrong areas, which is what the solve is for. Its corners ARE the
// prevertices, so it honours any alpha exactly with nothing to blend.
//
// Two things make it affordable inside a solver loop. The inverse map is
// holomorphic with dz/dw = sqrt(Q(z)) in closed form, so the Jacobian is one
// extra square root rather than another inversion. And consecutive quadrature
// points along an edge are close together, so each Newton solve warm-starts
// from the last and converges in a step or two.
function conformalSeed(R, alpha0) {
  let alpha = alpha0;
  let rect = scRect(alpha);
  let cos2a = Math.cos(2 * alpha);
  let cTh = [-alpha, alpha, Math.PI - alpha, Math.PI + alpha, TAU - alpha];
  // Rim angle for a boundary point. Bracket by bisection — the map is monotone
  // along each side, so bisection cannot miss, unlike the 2-D Newton, which
  // walks off the disc near a prevertex — then finish with Newton, which has
  // the derivative in closed form:
  //     d/dtheta f(e^{i theta}) = i z / sqrt(Q(z))
  // Sixty bisection steps was the single largest cost in the whole solve; this
  // reaches the same answer in about a fifth of the map evaluations.
  const rimTheta = (side, t) => {
    // Solve only on the positive branch and reflect. f has real coefficients
    // and Q is even, so f(-z) = -f(z) and f(conj z) = conj f(z); mirrored rim
    // points therefore have EXACTLY mirrored angles rather than angles that
    // agree to whatever the iteration happened to converge to. Without this the
    // mirrored cell areas only matched to 2e-11, and mirrored cells matching
    // exactly is a property this parameterisation is meant to guarantee.
    if (t < 0) {
      const th = rimTheta(side, -t);
      if (side === SIDE.R) return -th;
      if (side === SIDE.T) return Math.PI - th;
      if (side === SIDE.L) return TAU - th;
      return 3 * Math.PI - th;
    }
    const seg = side === SIDE.R ? [cTh[0], cTh[1]] : side === SIDE.T ? [cTh[1], cTh[2]]
      : side === SIDE.L ? [cTh[2], cTh[3]] : [cTh[3], cTh[4]];
    // The four corners ARE the prevertices and need no solve. This is not just
    // a saving: the rim contributions telescope to the corner angles alone, so
    // area closure on pi R^2 depends on these being exact and on nothing else.
    if (t >= 1 - 1e-12) return side === SIDE.T || side === SIDE.L ? seg[0] : seg[1];
    if (t <= -1 + 1e-12) return side === SIDE.T || side === SIDE.L ? seg[1] : seg[0];
    const comp = side === SIDE.R || side === SIDE.L ? 1 : 0;
    const want = comp === 1 ? rect.Y * t : rect.X * t;
    const val = (th) => scMap([Math.cos(th), Math.sin(th)], alpha)[comp];
    let lo = seg[0], hi = seg[1];
    const inc = val(hi) > val(lo);
    for (let k = 0; k < 12; k++) {
      const mid = 0.5 * (lo + hi);
      if ((val(mid) < want) === inc) lo = mid; else hi = mid;
    }
    // SAFEGUARDED Newton: a proposal outside the bracket becomes a bisection
    // step rather than an exit. Bailing out instead left the answer at only the
    // bisection's own accuracy — about 6e-5 rad, which is 1e-2 mm² on a rim
    // edge, which is FAR above the equal-area solver's finite-difference step.
    // The Jacobian it computed from that was noise, and a 4x2 grid on the
    // conformal seed simply would not solve.
    let th = 0.5 * (lo + hi);
    for (let k = 0; k < 40; k++) {
      const z = [Math.cos(th), Math.sin(th)];
      const f = scMap(z, alpha)[comp] - want;
      if ((f < 0) === inc) lo = th; else hi = th;
      const q = cSqrt(scQ(z, cos2a));
      const d = cDiv([-z[1], z[0]], q)[comp];
      let nt = Math.abs(d) > 1e-14 ? th - f / d : 0.5 * (lo + hi);
      if (!(nt > lo && nt < hi)) nt = 0.5 * (lo + hi);
      const moved = Math.abs(nt - th);
      th = nt;
      if (moved < 1e-15 || hi - lo < 1e-15) break;
    }
    return th;
  };
  // The quadrature only needs sub = 4 here: the endpoint substitution in scMap
  // exists for the inverse-square-root singularity AT a prevertex, and interior
  // points never sit on one. Measured worst case over the disc is 2.5e-12,
  // against 17.75 mm of radius.
  const SUB = 4;
  const warm = new Map();
  const invert = (u, v, key) => {
    // Same reflection trick as rimTheta, for the same reason: z -> -conj(z)
    // mirrors u, z -> conj(z) mirrors v, both exactly.
    if (u < 0 || v < 0) {
      const z = invert(Math.abs(u), Math.abs(v), key);
      const zv = v < 0 ? [z[0], -z[1]] : z;
      return u < 0 ? [-zv[0], zv[1]] : zv;
    }
    const w = [rect.X * u, rect.Y * v];
    let g = null;
    const prev = key == null ? null : warm.get(key);
    if (prev) {
      // Between solver iterations a quadrature point barely moves, so step the
      // previous answer forward with dz/dw = sqrt(Q) and Newton lands in one.
      const dw = [rect.X * (u - prev.u), rect.Y * (v - prev.v)];
      const step = cMul(cSqrt(scQ(prev.z, cos2a)), dw);
      g = [prev.z[0] + step[0], prev.z[1] + step[1]];
      const r = Math.hypot(g[0], g[1]);
      if (!(r < 0.9999999)) g = [(g[0] / r) * 0.9999999, (g[1] / r) * 0.9999999];
    } else { const e = ellipticalMap(u, v); g = [e[0] * 0.9, e[1] * 0.9]; }
    const z = scInvert(w, alpha, g, SUB);
    if (key != null) warm.set(key, { u, v, z });
    return z;
  };
  const map = (u, v, key) => {
    const s = sideOf(u, v);
    if (s >= 0) {
      const th = rimTheta(s, s === SIDE.R || s === SIDE.L ? v : u);
      return [R * Math.cos(th), R * Math.sin(th)];
    }
    const z = invert(u, v, key);
    return [R * z[0], R * z[1]];
  };
  const jacFromZ = (z) => {
    // the inverse map is holomorphic with dz/dw = sqrt(Q(z)); dw/du = X and
    // dw/dv = iY, so one square root replaces a second inversion
    const q = cSqrt(scQ(z, cos2a));
    const du = cMul([rect.X, 0], q);
    const dv = cMul([0, rect.Y], q);
    return [[R * du[0], R * dv[0]], [R * du[1], R * dv[1]]];
  };
  // One entry point returning both, so a quadrature point is inverted ONCE.
  // Asking map() and jac() separately doubled the Newton solves for nothing.
  const mapJac = (u, v, key) => {
    const s = sideOf(u, v);
    if (s >= 0) {
      const P = map(u, v, key);
      return { P, J: jacFromZ([P[0] / R, P[1] / R]) };
    }
    const z = invert(u, v, key);
    return { P: [R * z[0], R * z[1]], J: jacFromZ(z) };
  };
  return {
    kind: "conformal", R, map, rimTheta, mapJac,
    get alpha() { return alpha; },
    get rect() { return rect; },
    jac: (u, v, key) => mapJac(u, v, key).J,
    resetWarm: () => warm.clear(),
    // The warm cache is deliberately KEPT across an alpha change: alpha moves
    // by very little per solver step, so the previous inverse is still a good
    // starting point and Newton lands in one iteration.
    setAlpha(a) {
      if (a === alpha) return;
      alpha = a;
      rect = scRect(alpha);
      cos2a = Math.cos(2 * alpha);
      cTh = [-alpha, alpha, Math.PI - alpha, Math.PI + alpha, TAU - alpha];
    },
  };
}

export function makeSeed(kind, R, alpha) {
  return kind === "conformal" ? conformalSeed(R, alpha) : ellipticalSeed(R, alpha);
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE GRID — configuration, parameters, geometry
// ═══════════════════════════════════════════════════════════════════════════

// Under both mirrors, longitude line i pairs with nc-i and a line at the
// centre is forced to u == 0; likewise for latitude. So the independent shapes
// are floor((nc-1)/2) and floor((nr-1)/2) — three of them for a 6x3 grid.
export function lineGridConfig({ nc, nr, m = 2, symmetric = true }) {
  const orders = [];
  if (symmetric) for (let k = 1; k <= m; k++) orders.push(2 * k);
  else for (let k = 1; k <= 2 * m; k++) orders.push(k);
  const nLon = symmetric ? Math.floor((nc - 1) / 2) : nc - 1;
  const nLat = symmetric ? Math.floor((nr - 1) / 2) : nr - 1;
  const per = 1 + orders.length;
  const nClasses = symmetric ? Math.ceil(nc / 2) * Math.ceil(nr / 2) : nc * nr;
  return {
    nc, nr, m, symmetric, orders, nLon, nLat, per,
    nParams: (nLon + nLat) * per + 1,
    nClasses,
    nConstraints: Math.max(nClasses - 1, 0),
    spare: (nLon + nLat) * per + 1 - Math.max(nClasses - 1, 0),
    lonAt: 0, latAt: nLon * per, alphaAt: (nLon + nLat) * per,
  };
}

// which shape, and with which sign, a given line index reads
function lonRef(cfg, i) {
  const { nc, symmetric } = cfg;
  if (i === 0) return { fixed: -1 };
  if (i === nc) return { fixed: 1 };
  if (!symmetric) return { shape: i - 1, sign: 1 };
  if (2 * i === nc) return { fixed: 0 };
  return 2 * i < nc ? { shape: i - 1, sign: 1 } : { shape: nc - i - 1, sign: -1 };
}
function latRef(cfg, j) {
  const { nr, symmetric } = cfg;
  if (j === 0) return { fixed: -1 };
  if (j === nr) return { fixed: 1 };
  if (!symmetric) return { shape: j - 1, sign: 1 };
  if (2 * j === nr) return { fixed: 0 };
  return 2 * j < nr ? { shape: j - 1, sign: 1 } : { shape: nr - j - 1, sign: -1 };
}

export function nominalParams(cfg) {
  const p = new Array(cfg.nParams).fill(0);
  for (let s = 0; s < cfg.nLon; s++) p[cfg.lonAt + s * cfg.per] = -1 + (2 * (s + 1)) / cfg.nc;
  for (let s = 0; s < cfg.nLat; s++) p[cfg.latAt + s * cfg.per] = -1 + (2 * (s + 1)) / cfg.nr;
  p[cfg.alphaAt] = equalArcAlphaDeg(cfg.nc, cfg.nr) * D2R;
  return p;
}

// A readable name for every parameter, because the UI has to show requested
// against achieved for each one and "p[4]" is not an answer.
export function paramLabels(cfg) {
  const out = [];
  const bow = (k) => `bow T${cfg.orders[k]}`;
  for (let s = 0; s < cfg.nLon; s++) {
    out.push({ group: `longitude ${s + 1}`, name: "position", kind: "pos", u: true });
    cfg.orders.forEach((o, k) => out.push({ group: `longitude ${s + 1}`, name: bow(k), kind: "bow", order: o }));
  }
  for (let s = 0; s < cfg.nLat; s++) {
    out.push({ group: `latitude ${s + 1}`, name: "position", kind: "pos", u: false });
    cfg.orders.forEach((o, k) => out.push({ group: `latitude ${s + 1}`, name: bow(k), kind: "bow", order: o }));
  }
  out.push({ group: "seed map", name: "corner half-angle α", kind: "alpha" });
  return out;
}

// the diagonal of the norm the solve minimises. Positions are cheap to move so
// the solver spends them first; a bow is the user's actual shape request and is
// held expensive, so it is preserved wherever the constraint leaves room.
export const paramWeights = (cfg) =>
  paramLabels(cfg).map((l) => (l.kind === "pos" ? 0.12 : l.kind === "alpha" ? 0.6 : 1));

const ALPHA_MIN = 5 * D2R, ALPHA_MAX = 85 * D2R;

// ── the lines themselves ───────────────────────────────────────────────────
function lineVal(cfg, p, ref, base, t) {
  if (ref.fixed !== undefined) return ref.fixed;
  const o = base + ref.shape * cfg.per;
  let s = p[o];
  for (let k = 0; k < cfg.orders.length; k++) s += p[o + 1 + k] * chebT(cfg.orders[k], t);
  return ref.sign * s;
}
function lineSlope(cfg, p, ref, base, t) {
  if (ref.fixed !== undefined) return 0;
  const o = base + ref.shape * cfg.per;
  let s = 0;
  for (let k = 0; k < cfg.orders.length; k++) s += p[o + 1 + k] * chebTd(cfg.orders[k], t);
  return ref.sign * s;
}

// `gl` is the quadrature order for the interior edges. It is 32 everywhere the
// numbers are reported — the spec's figure, and far more than the integrand
// needs — and dropped for the OPTIMISER's inner evaluations only, where a few
// hundred solves are being ranked against each other and the winner is then
// re-solved at full order before anything is shown or exported.
export function lineGrid(cfg, p, seed, tWall = 0, gl = 32) {
  const { nc, nr } = cfg;
  const GL = glRule(gl);
  const U = (i, v) => lineVal(cfg, p, lonRef(cfg, i), cfg.lonAt, v);
  const Ud = (i, v) => lineSlope(cfg, p, lonRef(cfg, i), cfg.lonAt, v);
  const V = (j, u) => lineVal(cfg, p, latRef(cfg, j), cfg.latAt, u);
  const Vd = (j, u) => lineSlope(cfg, p, latRef(cfg, j), cfg.latAt, u);

  // A corner is just where two lines cross. Newton on
  //   u - u_i(v) = 0,  v - v_j(u) = 0
  // converges in a handful of steps while the lines are not near-tangent, and
  // near-tangency is exactly what the monotonicity guard rules out.
  const corners = [];
  for (let i = 0; i <= nc; i++) {
    corners.push([]);
    for (let j = 0; j <= nr; j++) {
      const ri = lonRef(cfg, i), rj = latRef(cfg, j);
      const bi = i === 0 ? -1 : i === nc ? 1 : null;
      const bj = j === 0 ? -1 : j === nr ? 1 : null;
      if (bi !== null && bj !== null) { corners[i].push([bi, bj]); continue; }
      if (bi !== null) { corners[i].push([bi, V(j, bi)]); continue; }
      if (bj !== null) { corners[i].push([U(i, bj), bj]); continue; }
      let u = U(i, 0), v = V(j, 0);
      for (let it = 0; it < 40; it++) {
        const f1 = u - U(i, v), f2 = v - V(j, u);
        const a = -Ud(i, v), b = -Vd(j, u);
        const det = 1 - a * b;
        if (Math.abs(det) < 1e-14) break;
        // solve [[1,a],[b,1]] d = -[f1,f2]
        const d0 = (-f1 * 1 - a * -f2) / det;
        const d1 = (1 * -f2 - b * -f1) / det;
        u += d0; v += d1;
        if (Math.abs(d0) + Math.abs(d1) < 1e-15) break;
      }
      corners[i].push([u, v]);
    }
  }

  // ── edge integrals ───────────────────────────────────────────────────────
  // A rim edge is exact: its area contribution is R² dθ / 2 with no quadrature
  // at all. That is what makes the total close on πR² to machine precision for
  // ANY parameter vector — every interior edge is traversed twice with
  // opposite sign and cancels identically, so only the rim survives, and the
  // rim telescopes to a full turn.
  const R = seed.R;
  const rimEdge = (side, tA, tB) => {
    const thA = seed.rimTheta(side, tA), thB = seed.rimTheta(side, tB);
    const dth = thB - thA;
    return { area: 0.5 * R * R * dth, len: R * Math.abs(dth), rim: true, side, tA, tB, thA, thB };
  };
  const curveEdge = (along, idx, tA, tB, key) => {
    // along "u": latitude line idx, u runs tA->tB.  along "v": longitude line.
    const dt = tB - tA;
    let A = 0, L = 0;
    for (let q = 0; q < gl; q++) {
      const s = GL.x[q], w = GL.w[q];
      const t = tA + s * dt;
      let u, v, du, dv;
      if (along === "u") { u = t; v = V(idx, t); du = dt; dv = Vd(idx, t) * dt; }
      else { v = t; u = U(idx, t); dv = dt; du = Ud(idx, t) * dt; }
      const k = key == null ? null : `${key}_${q}`;
      const { P, J } = seed.mapJac(u, v, k);
      const dx = J[0][0] * du + J[0][1] * dv;
      const dy = J[1][0] * du + J[1][1] * dv;
      A += w * (P[0] * dy - P[1] * dx);
      L += w * Math.hypot(dx, dy);
    }
    return { area: 0.5 * A, len: L, rim: false, along, idx, tA, tB };
  };

  const latE = [], lonE = [];
  for (let i = 0; i < nc; i++) {
    latE.push([]);
    for (let j = 0; j <= nr; j++) {
      const uA = corners[i][j][0], uB = corners[i + 1][j][0];
      latE[i].push(j === 0 ? rimEdge(SIDE.B, uA, uB)
        : j === nr ? rimEdge(SIDE.T, uA, uB)
        : curveEdge("u", j, uA, uB, `lat${i}_${j}`));
    }
  }
  for (let i = 0; i <= nc; i++) {
    lonE.push([]);
    for (let j = 0; j < nr; j++) {
      const vA = corners[i][j][1], vB = corners[i][j + 1][1];
      lonE[i].push(i === 0 ? rimEdge(SIDE.L, vA, vB)
        : i === nc ? rimEdge(SIDE.R, vA, vB)
        : curveEdge("v", i, vA, vB, `lon${i}_${j}`));
    }
  }

  const areas = [], opens = [], cells = [];
  for (let i = 0; i < nc; i++)
    for (let j = 0; j < nr; j++) {
      const A = latE[i][j].area + lonE[i + 1][j].area - latE[i][j + 1].area - lonE[i][j].area;
      // Open area is what the air sees: the cell loses t/2 along every edge it
      // shares with a divider. That is what the equal-area solve is asked to
      // equalise once the walls have thickness.
      let dl = 0;
      for (const e of [latE[i][j], lonE[i + 1][j], latE[i][j + 1], lonE[i][j]]) if (!e.rim) dl += e.len;
      areas.push(A);
      opens.push(A - (tWall / 2) * dl);
      cells.push({ i, j, area: A, dividerLen: dl, open: A - (tWall / 2) * dl });
    }
  return { cfg, p, seed, U, Ud, V, Vd, corners, latE, lonE, areas, opens, cells, R, tWall };
}

// ── monotonicity ───────────────────────────────────────────────────────────
// Whole-line curvature cannot always reach equal area, and the way it fails is
// by trying to push one line through another. Phi is a diffeomorphism, so
// checking the order in PARAMETER space is enough to guarantee non-crossing in
// the disc.
export function monotonicity(cfg, p, samples = 64) {
  const U = (i, v) => lineVal(cfg, p, lonRef(cfg, i), cfg.lonAt, v);
  const V = (j, u) => lineVal(cfg, p, latRef(cfg, j), cfg.latAt, u);
  let worst = Infinity, where = null;
  for (let q = 0; q <= samples; q++) {
    const t = -1 + (2 * q) / samples;
    for (let i = 0; i < cfg.nc; i++) {
      const g = U(i + 1, t) - U(i, t);
      if (g < worst) { worst = g; where = { kind: "longitude", between: [i, i + 1], at: t }; }
    }
    for (let j = 0; j < cfg.nr; j++) {
      const g = V(j + 1, t) - V(j, t);
      if (g < worst) { worst = g; where = { kind: "latitude", between: [j, j + 1], at: t }; }
    }
  }
  return { gap: worst, ok: worst > 1e-9, where };
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUAL-AREA SOLVE — sliders are requests, not settings
// ═══════════════════════════════════════════════════════════════════════════
//
//     minimise    || p - p_requested ||²_W
//     subject to  area_residuals(p) = 0
//
// The user asks for a shape; the solver returns the NEAREST shape that has
// equal areas. W weights positions low so they move freely and bows high so
// the actual shape request survives wherever the constraint leaves room. Both
// the request and what was achieved are reported for every parameter — a
// slider the user set is never silently moved.
//
// Solved as an equality-constrained QP per step (Lagrange-Newton / SQP):
//     W(d0 + delta) + Jᵀ lambda = 0,   J delta = -g
//   → lambda = (J W⁻¹ Jᵀ)⁻¹ (g - J d0),  delta = -d0 - W⁻¹ Jᵀ lambda
// with d0 = p - p_requested. The system is 5x5 for a 6x3 grid; nothing here
// needs a real NLP package.

// One residual per distinct cell class, minus one: the areas sum to pi R^2
// identically, so the last class is implied by the others.
function classIndex(cfg) {
  const seen = new Map(), reps = [];
  for (let i = 0; i < cfg.nc; i++)
    for (let j = 0; j < cfg.nr; j++) {
      const key = cfg.symmetric
        ? `${Math.min(i, cfg.nc - 1 - i)},${Math.min(j, cfg.nr - 1 - j)}`
        : `${i},${j}`;
      if (!seen.has(key)) { seen.set(key, reps.length); reps.push({ i, j, key, n: 0 }); }
      reps[seen.get(key)].n++;
    }
  return reps;
}

const clampAlpha = (a) => Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, a));

export function solveEqualArea(cfg, pRequested, opts = {}) {
  const {
    R, seedKind = "elliptical", seed: seedIn = null, pStart = null, t: tWall = 0,
    maxIter = 80, tol = 1e-12, refreshEvery = 8, maxGeom = 900, weights = null,
    continuation = true, continuationSteps = 5, gl = 32,
  } = opts;
  const W = weights || paramWeights(cfg);
  const reps = classIndex(cfg);
  const nCon = Math.max(reps.length - 1, 0);
  const nP = cfg.nParams;
  const Abar = (Math.PI * R * R) / (cfg.nc * cfg.nr);
  const seed = seedIn || makeSeed(seedKind, R, clampAlpha(pRequested[cfg.alphaAt]));

  const pReq = pRequested.slice();
  pReq[cfg.alphaAt] = clampAlpha(pReq[cfg.alphaAt]);

  let geomCalls = 0;
  const geometry = (p) => {
    geomCalls++;
    seed.setAlpha(clampAlpha(p[cfg.alphaAt]));
    return lineGrid(cfg, p, seed, tWall, gl);
  };
  const residuals = (p, g) => {
    const G = g || geometry(p);
    // when the walls have thickness the target is the running mean of the OPEN
    // areas, which moves with the divider lengths; with t = 0 it is exactly
    // pi R^2 / N and the residual is exact
    const mean = tWall
      ? G.opens.reduce((a, b) => a + b, 0) / G.opens.length
      : Abar;
    const r = new Array(nCon);
    for (let k = 0; k < nCon; k++) {
      const rep = reps[k];
      const cell = G.cells[rep.i * cfg.nr + rep.j];
      r[k] = (tWall ? cell.open : cell.area) / mean - 1;
    }
    return r;
  };
  const normInf = (r) => r.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  const norm1 = (r) => r.reduce((a, b) => a + Math.abs(b), 0);

  // A slider can be dragged straight past the point where two lines would
  // cross. Starting the solve there means every trial step is rejected by the
  // monotonicity guard and the answer comes back "infeasible" without a single
  // step having been tried. So the START point is pulled back along the line
  // from the nominal grid until it is monotone, while the TARGET stays the
  // request the user actually made — the solve then lands on the nearest
  // monotone equal-area grid, which is the honest answer to an over-request.
  const reqMono = monotonicity(cfg, pReq);
  // The optimiser moves the request in small steps, so it hands back the
  // previous solution to start from: three iterations instead of ten.
  let p = pStart && monotonicity(cfg, pStart).ok ? pStart.slice() : pReq.slice();
  if (!monotonicity(cfg, p).ok) {
    const nom = nominalParams(cfg);
    nom[cfg.alphaAt] = pReq[cfg.alphaAt];
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      const q = nom.map((v, i) => v + mid * (pReq[i] - v));
      if (monotonicity(cfg, q).ok) lo = mid; else hi = mid;
    }
    p = nom.map((v, i) => v + lo * 0.9 * (pReq[i] - v));
  }
  let G = geometry(p);
  let r = residuals(p, G);

  // `it` must exist before the trivial-case return: finish() reports it, and
  // a 1x1 grid (zero constraints) used to crash on the temporal dead zone here
  let it = 0, mu = 1, sinceJ = 0;

  if (nCon === 0) return finish(true, "trivial");

  const jacobian = (p0, r0) => {
    const J = [];
    for (let k = 0; k < nCon; k++) J.push(new Array(nP).fill(0));
    for (let q = 0; q < nP; q++) {
      const h = 1e-6 * (q === cfg.alphaAt ? 1 : 1);
      const pp = p0.slice();
      pp[q] += h;
      const rr = residuals(pp);
      for (let k = 0; k < nCon; k++) J[k][q] = (rr[k] - r0[k]) / h;
    }
    return J;
  };

  let J = jacobian(p, r);
  const wnorm2 = (d) => d.reduce((a, v, k) => a + W[k] * v * v, 0);
  const objOf = (q) => 0.5 * wnorm2(q.map((v, k) => v - pReq[k]));

  // The best EQUAL-AREA point seen, kept separately. Without it the search can
  // walk off the feasible manifold chasing the request, hit the non-crossing
  // boundary and never get back — which reported layouts as infeasible even
  // when the solve had already stood on a perfectly good answer, and even when
  // it was handed one as its starting point.
  let best = null;
  const remember = () => {
    if (normInf(r) >= 1e-9) return;
    const o = objOf(p);
    if (!best || o < best.obj) best = { p: p.slice(), r: r.slice(), G, obj: o };
  };

  // Shrink a step to the last point that keeps every pair of lines apart, so
  // the iterate can slide ALONG the boundary instead of being pinned against it.
  const clampStep = (t, delta) => {
    const at = (tt) => {
      const q = p.map((v, kk) => v + tt * delta[kk]);
      q[cfg.alphaAt] = clampAlpha(q[cfg.alphaAt]);
      return q;
    };
    // A step may approach the non-crossing boundary but never consume the whole
    // gap: it has to leave a quarter of what it started with. Clamping merely to
    // "still monotone" let the very first Gauss-Newton step land 1e-9 from a
    // crossing, after which every later step was rejected and a layout that a
    // slow walk reaches comfortably came back as infeasible.
    const margin = Math.max(0.25 * monotonicity(cfg, p).gap, 1e-7);
    const okAt = (q) => monotonicity(cfg, q).gap >= margin;
    let pt = at(t);
    if (okAt(pt)) return pt;
    let lo = 0, hi = t;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (okAt(at(mid))) lo = mid; else hi = mid;
    }
    if (lo < 1e-9) return null;
    pt = at(lo);
    return monotonicity(cfg, pt).ok ? pt : null;
  };

  const broyden = (pt, rt) => {
    const dp = pt.map((v, k) => v - p[k]);
    const dpp = dp.reduce((a, v) => a + v * v, 0);
    if (dpp <= 1e-24) return;
    for (let a2 = 0; a2 < nCon; a2++) {
      let jd = 0;
      for (let q = 0; q < nP; q++) jd += J[a2][q] * dp[q];
      const cf = (rt[a2] - r[a2] - jd) / dpp;
      for (let q = 0; q < nP; q++) J[a2][q] += cf * dp[q];
    }
  };

  // Normal-equation solve shared by both phases:
  //   lambda = (J W⁻¹ Jᵀ)⁻¹ rhs
  const solveLambda = (rhs) => {
    const A = [];
    for (let a2 = 0; a2 < nCon; a2++) {
      A.push(new Array(nCon).fill(0));
      for (let cc = 0; cc < nCon; cc++) {
        let sum = 0;
        for (let q = 0; q < nP; q++) sum += (J[a2][q] * J[cc][q]) / W[q];
        A[a2][cc] = sum;
      }
      A[a2][a2] += 1e-13;
    }
    return solveDense(A, rhs);
  };

  // RESTORATION: pure minimum-norm Gauss-Newton back onto the equal-area
  // manifold, with the objective ignored entirely. There is nothing for the
  // step to fight, so it converges where the full SQP stalls. Used both as the
  // opening phase and after every tangential step below.
  const restore = (budget) => {
    for (let k = 0; k < budget && it < maxIter; k++, it++) {
      if (normInf(r) < tol) return true;
      if (sinceJ >= refreshEvery) { J = jacobian(p, r); sinceJ = 0; }
      const lam = solveLambda(r.slice());
      if (!lam) { if (sinceJ === 0) return false; J = jacobian(p, r); sinceJ = 0; continue; }
      const delta = new Array(nP);
      for (let q = 0; q < nP; q++) {
        let jt = 0;
        for (let a2 = 0; a2 < nCon; a2++) jt += J[a2][q] * lam[a2];
        delta[q] = -jt / W[q];
      }
      let stepped = false;
      for (let t = 1; t > 1 / 256; t *= 0.5) {
        const pt = clampStep(t, delta);
        if (!pt) continue;
        const Gt = geometry(pt);
        const rt = residuals(pt, Gt);
        if (!rt.every((v) => isFinite(v)) || norm1(rt) >= norm1(r)) continue;
        broyden(pt, rt);
        p = pt; r = rt; G = Gt; stepped = true; sinceJ++;
        break;
      }
      if (!stepped) {
        if (sinceJ === 0) return normInf(r) < tol;
        J = jacobian(p, r); sinceJ = 0;
      }
      if (geomCalls > maxGeom) break;
    }
    return normInf(r) < tol;
  };

  restore(maxIter);
  remember();

  // ── PHASE 2: move toward the request along the manifold. Full SQP with an
  // exact L1 penalty; judging a step on the residual alone made the two halves
  // of the step fight each other.
  const phase2 = Math.min(maxIter, it + maxIter);
  for (; it < phase2; it++) {
    if (sinceJ >= refreshEvery) { J = jacobian(p, r); sinceJ = 0; }
    const d0 = p.map((v, k) => v - pReq[k]);
    const rhs = new Array(nCon);
    for (let a2 = 0; a2 < nCon; a2++) {
      let jd = 0;
      for (let q = 0; q < nP; q++) jd += J[a2][q] * d0[q];
      rhs[a2] = r[a2] - jd;
    }
    const lam = solveLambda(rhs);
    if (!lam) break;
    const delta = new Array(nP);
    for (let q = 0; q < nP; q++) {
      let jt = 0;
      for (let a2 = 0; a2 < nCon; a2++) jt += J[a2][q] * lam[a2];
      delta[q] = -d0[q] - jt / W[q];
    }
    if (normInf(r) < tol && Math.sqrt(wnorm2(delta)) < 1e-10) break;

    // An exact L1 penalty alone deadlocks here. With the iterate already ON the
    // manifold, r is ~0 while the pull toward the request is large, so the QP
    // multipliers — and with them mu — blow up; every step then has to beat a
    // penalty that no first-order objective gain can pay for, and the solve
    // sits still. Warm-started from the previous slider position it returned
    // that previous answer unchanged, which looks exactly like a working tool.
    //
    // So a step is taken on its own terms and feasibility is RESTORED after it,
    // rather than being priced into one merit.
    mu = Math.min(Math.max(mu, 2 * lam.reduce((a2, v) => Math.max(a2, Math.abs(v)), 0) + 1), 1e4);
    const phi0 = mu * norm1(r) + objOf(p);
    const obj0 = objOf(p);
    let stepped = false;
    for (let t = 1; t > 1 / 256; t *= 0.5) {
      const pt = clampStep(t, delta);
      if (!pt) continue;
      const Gt = geometry(pt);
      const rt = residuals(pt, Gt);
      if (!rt.every((v) => isFinite(v))) continue;
      const objt = objOf(pt);
      const phit = mu * norm1(rt) + objt;
      const merits = phit < phi0 - 1e-10 * t * (Math.abs(phi0) + 1);
      // a tangential move: closer to the request, and near enough to the
      // manifold that restoration can pull it back
      const tangential = objt < obj0 - 1e-14 && normInf(rt) < Math.max(1e-4, 20 * normInf(r));
      if (!merits && !tangential) continue;
      const keepP = p, keepR = r, keepG = G;
      broyden(pt, rt);
      p = pt; r = rt; G = Gt;
      if (normInf(r) >= tol) restore(6);
      if (normInf(r) < 1e-9 && objOf(p) < obj0 - 1e-14) { stepped = true; remember(); break; }
      if (merits && normInf(r) < normInf(keepR) + 1e-12) { stepped = true; remember(); break; }
      p = keepP; r = keepR; G = keepG;   // restoration failed to pay for it
    }
    if (!stepped) {
      if (sinceJ === 0) break;
      J = jacobian(p, r); sinceJ = 0;
    }
    if (geomCalls > maxGeom) break;
  }

  // Never return worse than the best equal-area point actually found.
  if (normInf(r) >= 1e-9 && best) { p = best.p; r = best.r; G = best.G; }

  // CONTINUATION FALLBACK. A single Gauss-Newton step from a cold start can
  // walk straight into the non-crossing boundary and jam there, on requests a
  // slow walk reaches comfortably — 6x3 at m=2 failed on a bow of 0.25 that
  // m=1 solved, which is backwards and was the solver, not the geometry.
  // So when the direct solve fails, the request is approached from the nominal
  // grid in steps, each warm-started from the last. Only on failure, and
  // bounded, so the normal path pays nothing for it.
  // Note this runs even when the REQUEST crosses: the solver is free to move
  // line positions, so a crossing request can still have a non-crossing
  // equal-area answer, and m=1 was already finding those directly.
  if (normInf(r) >= 1e-9 && continuation) {
    const nom = nominalParams(cfg);
    nom[cfg.alphaAt] = pReq[cfg.alphaAt];
    const along = (u) => nom.map((v, i) => v + u * (pReq[i] - v));
    // Intermediate rungs of the walk exist only to carry a warm start forward,
    // so they run at reduced quadrature; the rung that targets the request
    // itself — the one whose answer is returned — runs at full order.
    const trySub = (u, warm, full) => {
      const sub = solveEqualArea(cfg, along(u), {
        R, seed, pStart: warm, t: tWall, maxIter, tol, refreshEvery, maxGeom,
        weights: W, continuation: false, gl: full ? gl : Math.min(gl, 16),
      });
      geomCalls += sub.geomCalls;
      return sub;
    };
    let warm = null, reached = null, reachedU = 0, failedU = 1;
    for (let k = 1; k <= continuationSteps; k++) {
      const u = k / continuationSteps;
      const sub = trySub(u, warm, k === continuationSteps);
      if (!sub.converged) { failedU = u; break; }
      warm = sub.p; reached = sub; reachedU = u;
      if (k === continuationSteps) return { ...sub, geomCalls, viaContinuation: true, reachedFraction: 1 };
    }
    // The walk stopped short. Bisect for how far it CAN go, so the render is a
    // real equal-area grid rather than the degenerate one the direct solve
    // jammed into, and the user is told what fraction of the request was met.
    for (let k = 0; k < 4 && failedU - reachedU > 0.03; k++) {
      const mid = (reachedU + failedU) / 2;
      const sub = trySub(mid, warm, true);
      if (sub.converged) { warm = sub.p; reached = sub; reachedU = mid; } else failedU = mid;
    }
    if (reached) {
      p = reached.p; G = reached.geometry; r = residuals(p, G);
      return { ...finish(false, null), geomCalls, reachedFraction: reachedU };
    }
  }

  return finish(normInf(r) < 1e-9, null);

  function finish(ok, why) {
    const mono = monotonicity(cfg, p);
    const corr = Math.sqrt(p.reduce((s, v, k) => s + W[k] * (v - pReq[k]) ** 2, 0));
    let reason = null;
    const nameOf = (w) => `${w.kind === "longitude" ? "u" : "v"}${w.between[0]} and ${w.kind === "longitude" ? "u" : "v"}${w.between[1]}`;
    if (!ok) {
      if (nP < nCon)
        reason = `Only ${nP} free parameters against ${nCon} independent area constraints — this parameterisation cannot be equal-area at all. Raise the shape order m.`;
      else if (!reqMono.ok)
        reason = `The requested shape itself crosses: lines ${nameOf(reqMono.where)} would meet at ${reqMono.where.at.toFixed(3)}. Shown is the furthest equal-area grid along the way to that request. Ease the bow.`;
      else if (mono.gap < 5e-3)
        reason = `Lines ${nameOf(mono.where)} are touching at ${mono.where.at.toFixed(3)} (gap ${mono.gap.toExponential(2)}) — the monotonicity limit is binding, so no equal-area grid exists for this corner angle and bow request.`;
      else
        reason = `The bow request cannot be met with equal areas at m = ${cfg.m}: ${cfg.spare} spare parameter(s) is not enough shape freedom here. Raise m, or ease the request.`;
    }
    return {
      p, pRequested: pReq, geometry: G, seed, converged: ok, why, reason,
      residual: normInf(r), iters: it, geomCalls,
      correction: corr,
      delta: p.map((v, k) => v - pReq[k]),
      monotone: mono, requestMonotone: reqMono, nConstraints: nCon,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE GRID → CELL RECORDS
// ═══════════════════════════════════════════════════════════════════════════
// The same record the mesh families produce, so the acoustic model, the mouth
// mapping, the fabrication figures and every export are shared and none of
// them know which representation they came from.

function edgeSample(lg, e, n) {
  const out = [];
  if (e.rim) {
    for (let q = 0; q <= n; q++) {
      const th = e.thA + ((e.thB - e.thA) * q) / n;
      out.push([lg.R * Math.cos(th), lg.R * Math.sin(th)]);
    }
    return out;
  }
  for (let q = 0; q <= n; q++) {
    const t = e.tA + ((e.tB - e.tA) * q) / n;
    const u = e.along === "u" ? t : lg.U(e.idx, t);
    const v = e.along === "u" ? lg.V(e.idx, t) : t;
    out.push(lg.seed.map(u, v));
  }
  return out;
}

export function lineGridCells(lg, opts = {}) {
  const { c = 343, t = 0, per = 16 } = opts;
  const { cfg, latE, lonE } = lg;
  const out = [];
  for (let i = 0; i < cfg.nc; i++)
    for (let j = 0; j < cfg.nr; j++) {
      const sides = [
        { e: latE[i][j], rev: false },
        { e: lonE[i + 1][j], rev: false },
        { e: latE[i][j + 1], rev: true },
        { e: lonE[i][j], rev: true },
      ];
      const poly = [];
      for (const { e, rev } of sides) {
        const P = edgeSample(lg, e, per);
        const walk = rev ? P.slice().reverse() : P;
        for (let q = 0; q < walk.length - 1; q++) poly.push(walk[q]);
      }
      const sideLen = sides.map(({ e }) => e.len);
      let dividerLen = 0;
      for (const { e } of sides) if (!e.rim) dividerLen += e.len;
      const area = lg.areas[i * cfg.nr + j];
      const open = t ? area - (t / 2) * dividerLen : area;
      // opposing pairs: 0/2 run along u (the cell's width), 1/3 along v (its height)
      const La = (sideLen[0] + sideLen[2]) / 2;
      const Lb = (sideLen[1] + sideLen[3]) / 2;
      const Llong = Math.max(La, Lb), Lshort = Math.min(La, Lb);

      const midOf = (k) => {
        const { e, rev } = sides[k];
        const P = edgeSample(lg, e, 2);
        return rev ? P[1] : P[1];
      };
      const m1 = midOf(1), m3 = midOf(3);
      const dirLen = Math.hypot(m1[0] - m3[0], m1[1] - m3[1]) || 1;
      const convex = polyIsConvex(poly);
      const dia = polyDiameter(poly);
      out.push({
        id: i * cfg.nr + j, label: `${i + 1},${j + 1}`, kind: "quad", i, j,
        poly, area, open, dividerLen,
        // per side, in the same order as poly's four runs: true where the side
        // is the disc rim, which carries no divider and must not be inset
        rimSide: sides.map(({ e }) => !!e.rim),
        centroid: polyCentroid(poly),
        iDir: [(m1[0] - m3[0]) / dirLen, (m1[1] - m3[1]) / dirLen],
        sideLen, Llong, Lshort,
        aspect: Lshort > 1e-9 ? Llong / Lshort : Infinity,
        dia, convex,
        pwFloor: convex ? c / (2 * dia * 1e-3) : null,
        // The first cross mode of the cell, as a flat rectangle of its long
        // dimension. It IS an estimate — the sides are curved — and it was
        // once paired with a `curvatureSensitive` flag testing minCurvR
        // against the cell's SHORT dimension. That flag was removed because
        // it was keyed to a length the model does not contain: f1 uses
        // Llong, so the shape error goes as (Llong/r_curv)^2, and the flag
        // ranked the cells backwards — it fired on the four corner cells at
        // 0.31 while eight cells at 0.45-0.52 went unflagged. `f1model`
        // already says this is an estimate; a mis-keyed flag on top of it
        // only nagged.
        f1: c / (2 * Math.max(Llong, 1e-9) * 1e-3),
        f1model: "curved quad, flat-rectangle estimate",
      });
    }
  return out;
}

export function lineGridDividerLength(lg) {
  const { cfg, latE, lonE } = lg;
  let L = 0;
  for (let i = 0; i < cfg.nc; i++)
    for (let j = 1; j < cfg.nr; j++) L += latE[i][j].len;
  for (let i = 1; i < cfg.nc; i++)
    for (let j = 0; j < cfg.nr; j++) L += lonE[i][j].len;
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLID EXPORT — DUCT MESHES
// ═══════════════════════════════════════════════════════════════════════════
//
// WHAT THIS EMITS, AND WHY IT IS DUCTS AND NOT A DIVIDER WEB
// Adjacent cells tile the disc at the throat and tile the rectangle at the
// mouth, but each is blended and routed to its own mouth cell independently,
// so in between they PULL APART — measured at 6x3, up to 7.5 mm at mid-path,
// about one cell width, never overlapping. There is therefore no wall of
// thickness t to model beyond the throat: the material between two ducts is a
// wedge that thickens downstream. So this emits the N ducts, and the divider
// web is whatever is left when they are subtracted from a blank. The blank
// needs an outer horn wall between throat and mouth, which this tool does not
// model and must not invent — that is the horn profile calculator's job.
//
// THE INSET
// A cell outline is the grid-line CENTRELINE, so two neighbours share one
// curve. Lofting those directly and subtracting would leave no divider at all.
// Each section is therefore inset by t/2 along its divider sides only, leaving
// the rim untouched, which puts exactly t of material between two neighbours
// at the throat. The inset tapers LINEARLY to zero at the mouth.
//
// It used to taper out at an adjustable `dividerEndFrac` instead, and that
// parameter was removed because it described something the geometry does not
// have. The cells tile at the throat and tile again at the mouth, but the
// expansion profile pulls the ducts APART in between — measured 11 mm at
// mid-path — so there is no shared wall for a divider to end at, and the
// parameter was insetting for a wall that was not there. Its whole geometric
// scope was 0.2 mm at t = 0.4, which is why moving it appeared to do nothing.
// A linear taper needs no such station: it is full at the throat where the
// ducts genuinely tile, and zero at the mouth where they tile again and must
// not be inset or the mouth stops tiling.
//
// The acoustic numbers are untouched by any of this. sched[].area stays the
// geometric centreline area it always was; the inset lives only in the export.

// Offset a closed polygon inward by a distance that may differ side to side.
// The outline is K equal runs of n points with corners at multiples of n, so a
// corner is where two offset lines have to be MITRED rather than displaced —
// displacing each side along its own normal would leave the corner open.
export function insetPolygon(poly, dPerSide) {
  const N = poly.length, K = dPerSide.length, n = N / K;
  if (!Number.isInteger(n)) return null;
  let A2 = 0;
  for (let k = 0; k < N; k++) {
    const a = poly[k], b = poly[(k + 1) % N];
    A2 += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = A2 >= 0 ? 1 : -1; // +1 when the outline runs counter-clockwise
  // segment k joins point k to k+1 and belongs to side floor(k / n)
  const lineOf = (k) => {
    const a = poly[k % N], b = poly[(k + 1) % N];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const L = Math.hypot(tx, ty) || 1e-12;
    tx /= L; ty /= L;
    const d = dPerSide[Math.floor((k % N) / n)];
    return { px: a[0] - ty * sgn * d, py: a[1] + tx * sgn * d, tx, ty };
  };
  const out = [];
  for (let k = 0; k < N; k++) {
    const L1 = lineOf((k - 1 + N) % N), L2 = lineOf(k);
    const den = L1.tx * L2.ty - L1.ty * L2.tx;
    if (Math.abs(den) < 1e-7) {
      // the two segments are collinear: no corner to mitre, displace instead
      const d = dPerSide[Math.floor(k / n)];
      out.push([poly[k][0] - L2.ty * sgn * d, poly[k][1] + L2.tx * sgn * d]);
    } else {
      const u = ((L2.px - L1.px) * L2.ty - (L2.py - L1.py) * L2.tx) / den;
      out.push([L1.px + L1.tx * u, L1.py + L1.ty * u]);
    }
  }
  return out;
}

// Inset a flowed section. It is a space polygon, so the offset is done in its
// own best-fit plane and each point keeps whatever off-plane offset it had.
// The inset bites hardest near the throat, where sections are still nearly
// flat, so the plane is a close fit exactly where it matters most.
export function insetSection3(pts, dPerSide) {
  const n = pts.length;
  const o = [0, 0, 0];
  for (const p of pts) { o[0] += p[0] / n; o[1] += p[1] / n; o[2] += p[2] / n; }
  let ax = 0, ay = 0, az = 0;
  for (let k = 0; k < n; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    ax += (a[1] - o[1]) * (b[2] - o[2]) - (a[2] - o[2]) * (b[1] - o[1]);
    ay += (a[2] - o[2]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[2] - o[2]);
    az += (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }
  const nl = Math.hypot(ax, ay, az) || 1;
  const N = [ax / nl, ay / nl, az / nl];
  let e1 = [pts[0][0] - o[0], pts[0][1] - o[1], pts[0][2] - o[2]];
  const dp = e1[0] * N[0] + e1[1] * N[1] + e1[2] * N[2];
  e1 = [e1[0] - dp * N[0], e1[1] - dp * N[1], e1[2] - dp * N[2]];
  const e1l = Math.hypot(...e1) || 1;
  e1 = e1.map((x) => x / e1l);
  const e2 = [N[1] * e1[2] - N[2] * e1[1], N[2] * e1[0] - N[0] * e1[2], N[0] * e1[1] - N[1] * e1[0]];
  const flat = [], off = [];
  for (const p of pts) {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    flat.push([d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]]);
    off.push(d[0] * N[0] + d[1] * N[1] + d[2] * N[2]);
  }
  const ins = insetPolygon(flat, dPerSide);
  if (!ins) return pts;
  return ins.map((q, k) => [
    o[0] + q[0] * e1[0] + q[1] * e2[0] + off[k] * N[0],
    o[1] + q[0] * e1[1] + q[1] * e2[1] + off[k] * N[1],
    o[2] + q[0] * e1[2] + q[1] * e2[2] + off[k] * N[2],
  ]);
}

// Magnitude of the vector area of a closed space polygon; the planar area when
// the polygon happens to be planar.
export function polyArea3(pts) {
  let ax = 0, ay = 0, az = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    ax += a[1] * b[2] - a[2] * b[1];
    ay += a[2] * b[0] - a[0] * b[2];
    az += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(ax, ay, az) / 2;
}

export function ductSections(cellRec, row, { t = 0 } = {}) {
  const Q = row.sched.length - 1;
  const rim = cellRec.rimSide || [false, false, false, false];
  const out = [];
  for (let q = 0; q <= Q; q++) {
    const st = row.sched[q];
    if (!st.pts) return null;
    // full t/2 at the throat, tapering linearly to nothing at the mouth
    const taper = 1 - st.s;
    const d = rim.map((isRim) => (isRim ? 0 : (t / 2) * taper));
    const pts = d.some((v) => v > 0) ? insetSection3(st.pts, d) : st.pts;
    out.push({ s: st.s, area: polyArea3(pts), pts, origin: st.origin });
  }
  return out;
}

// ── THE APERTURE AS A SURFACE THE SHELL CAN BE SNAPPED TO ──────────────────
//
// The duct mouth rings lie on the biradial aperture EXACTLY (measured 1e-13
// mm) because they are built from its own parameters. Anything derived from
// them by an offset does not: the offset happens in the ring's best-fit
// plane, so it leaves the curved surface by the local slope times the offset
// distance, and every cell fits its own plane so no two derived rings agree.
// That is what put a 1.14 mm mismatched lip around each cell's mouth.
//
// The surface is a graph over (x, y) throughout its usable domain, and the
// inversion is CLOSED FORM rather than a search:
//
//   y  = rV sin e                      ->  e = asin(y / rV)
//   sg = rV (1 - cos e)                    the vertical sagitta at that e
//   x  = (rH - sg) sin a               ->  a = asin(x / (rH - sg))
//   z  = depth - rH (1 - cos a) - sg cos a
//
// so snapping moves a point in z alone and lands it on the surface to
// round-off. Either radius may be infinite (a flat axis), which drops the
// corresponding term. A point outside the domain (|sin| > 1) is returned
// UNCHANGED and flagged, never clamped: clamping would silently fold
// geometry onto the rim.
export function apertureFrame(surf) {
  const { rH, rV, depth } = surf;
  const fH = isFinite(rH), fV = isFinite(rV);
  const at = (a, e) => {
    const sg = fV ? rV * (1 - Math.cos(e)) : 0;
    return [
      fH ? (rH - sg) * Math.sin(a) : a,
      fV ? rV * Math.sin(e) : e,
      depth - (fH ? rH * (1 - Math.cos(a)) : 0) - sg * (fH ? Math.cos(a) : 1),
    ];
  };
  const param = (P) => {
    let e = P[1], ok = true;
    if (fV) {
      const s = P[1] / rV;
      if (Math.abs(s) > 1) ok = false; else e = Math.asin(s);
    }
    const sg = fV && ok ? rV * (1 - Math.cos(e)) : 0;
    let a = P[0];
    if (fH) {
      const den = rH - sg;
      const s = Math.abs(den) > 1e-12 ? P[0] / den : 2;
      if (Math.abs(s) > 1) ok = false; else a = Math.asin(s);
    }
    return { a, e, ok };
  };
  const snap = (P) => {
    const { a, e, ok } = param(P);
    return ok ? at(a, e) : [P[0], P[1], P[2]];
  };
  // How far a point sits off the surface, measured along z. 0 means on it.
  const deviation = (P) => {
    const { ok } = param(P);
    return ok ? P[2] - snap(P)[2] : NaN;
  };
  return { at, param, snap, deviation };
}

// A cap whose BOUNDARY is the given ring and whose INTERIOR lies on the
// aperture surface. A Coons blend of the ring in 3-D would not: it
// interpolates linearly between opposite boundary curves, and a chord across
// a curved cap falls behind the surface — order 1 mm even a few millimetres
// in from the rim on this aperture, which is exactly the band the mouth face
// survives in after the passages are cut out. Blending in the surface's OWN
// (a, e) parameters instead and then evaluating the surface puts every
// interior point on it by construction, while reproducing the boundary
// exactly because a transfinite blend always does.
//
// Returns an (n+1) x (n+1) data grid indexed [i][j]: i along side 0, j along
// side 1, which is the indexing ductBrep's cap net uses.
export function apertureCapGrid(ring, ap) {
  const N = ring.length, n = N / 4;
  if (!Number.isInteger(n)) return null;
  const par = ring.map(ap.param);
  if (par.some((p) => !p.ok)) return null;
  const bot = [], top = [], left = [], right = [];
  for (let i = 0; i <= n; i++) {
    bot.push(par[i % N]);                  // side 0
    top.push(par[(3 * n - i + N) % N]);    // side 2, reversed
  }
  for (let j = 0; j <= n; j++) {
    right.push(par[(n + j) % N]);          // side 1
    left.push(par[(4 * n - j) % N]);       // side 3, reversed
  }
  const grid = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, row = [];
    for (let j = 0; j <= n; j++) {
      const v = j / n;
      const a = (1 - v) * bot[i].a + v * top[i].a + (1 - u) * left[j].a + u * right[j].a
        - ((1 - u) * (1 - v) * bot[0].a + u * (1 - v) * bot[n].a
           + u * v * top[n].a + (1 - u) * v * top[0].a);
      const e = (1 - v) * bot[i].e + v * top[i].e + (1 - u) * left[j].e + u * right[j].e
        - ((1 - u) * (1 - v) * bot[0].e + u * (1 - v) * bot[n].e
           + u * v * top[n].e + (1 - u) * v * top[0].e);
      row.push(ap.at(a, e));
    }
    grid.push(row);
  }
  return grid;
}

// ── HORN SHELL — one blank and one cutter per cell ─────────────────────────
//
// The duct sections above are the AIR — the open passage the wave travels
// through. The physical horn is the material around that air, and the export
// gives it per cell: a BLANK is that cell's own duct rings pushed OUTWARD by
// the wall on every side, and a CUTTER is the duct extended past both end
// faces. The CAD work is eighteen independent SUBTRACTIONS, cutter i out of
// blank i, and what comes back is eighteen cell shells of exactly `wall`
// thickness all round. No unions, and nothing that has to be searched for.
//
// WHY THIS AND NOT A ONE-PIECE BODY. Three constructions have now been
// built and measured, and the two that produced an outer skin for the whole
// horn both came out with visible surface texture while the ducts, written
// by the same loft through the same writer, came out clean. The difference
// is not the loft and not the station count:
//
//   A RING THAT IS EVALUATED FROM A SMOOTH MAP WITH FIXED POINT
//   CORRESPONDENCE LOFTS CLEANLY. A RING THAT IS DERIVED PER STATION BY A
//   DISCRETE SEARCH DOES NOT.
//
// A duct ring, and a blank ring, are the same map sampled at each station:
// vertex k is the same material line the whole way down, and the only thing
// that changes between stations is where that line has got to. The rejected
// skins were found by search — a raster distance field traced by marching
// squares, and a CONVEX HULL of the duct points offset with rounds. Both
// decide something discrete at every station (which pixels are inside,
// which points are on the hull), that decision changes abruptly along the
// path, and the arc-length resample that follows slides every vertex to a
// different feature. The cubic loft then interpolates a set of points whose
// positions AND correspondence jitter by a few tenths of a millimetre, and
// a few tenths of a millimetre at a 5 mm spacing is exactly the scale of a
// visible crease. It is not a resolution problem and it does not refine
// away: the noise is uncorrelated station to station, so a finer raster or
// more stations changes the texture without removing it.
//
// The corollary is the rule for anything added here later: build a solid
// from rings the model can EVALUATE, never from rings a search returns.
//
// A BLANK is the duct's own station rings offset outward by `wall` on all
// four sides, through the same mitred-offset machinery as the divider inset
// run with the opposite sign. Constant on every side is deliberate: it makes
// the wall exactly `wall` measured from the passage wherever you cut, and it
// removes the throat-rim EARS the earlier scheme threw (it offset rim sides
// by `wall` and shared sides by `wall - t/2`, and a mitre between two
// different offsets lands off both lines — 0.73 mm of overshoot at every
// cell junction, one of the owner's first CAD reports). Adjacent blanks
// therefore interpenetrate wherever the ducts run closer than 2·wall, which
// is most of the throat half of the horn; that is reported, not hidden, by
// `shellOverlap`, and it is what a multicell horn's shared walls ARE.
//
// A CUTTER is the duct sections EXTENDED a few mm past both end faces —
// standard CAD practice for a boolean tool. Without the extension the
// cutter's end cap and the blank's end cap are two different fills of
// nearly the same ring (the cap-fill ambiguity finding), and subtracting
// one from the other leaves a membrane over the passage wherever the
// blank's fill lies in front. The throat extension is exact: the ring is
// planar in z = 0, so its vector-area normal is exactly -z and the
// prepended ring is planar in z = -ext. The mouth extension follows the
// mouth ring's own vector-area normal.
// AN EXTENSION HAS TWO CONSTRAINTS PULLING OPPOSITE WAYS, and both are
// ratios or sags rather than round numbers.
// (1) It must exceed the CAP-FILL SAG it is there to punch through — how far
// the Coons fill of an end ring falls behind the face the blank presents
// there. That is a per-cell cap and it is small: measured over all 18 cells,
// 1.2e-13 mm at the tool's own vertically flat mouth (its aperture is a
// cylinder, and a Coons patch on a ruled surface is exact), 0.018 mm at 90x40
// and 0.038 mm at 90x60. At the THROAT it is exactly zero — both the duct's
// ring and the blank's are planar in z = 0, so both fills are that plane —
// which is why the cutter is not extended there at all.
// (2) It must exceed about 0.4 of a STATION STEP, or the uniformly
// parameterised loft overshoots BACKWARDS through the very cap it was meant
// to close (see `shellCapOvershoot`, and the measurement in `buildShellSTEP`).
// A fixed millimetre value cannot satisfy (2) at every station count, so the
// cutter's mouth extension is sized from the step; the BLANK's stays at 3 mm
// because it runs at the shell's own coarser count.
//
// Both end faces are shared exactly with the duct's: the throat ring is
// planar in z = 0 so the blank's is too, and the mouth ring is SNAPPED to
// the aperture surface, so after the subtraction every cell's mouth face
// lies on the one analytic surface the user's coverage arcs define.
// Two adjacent cells share a grid line, so on the sides they do NOT share,
// both blanks offset the SAME curve outward by the SAME distance — the
// identical surface, computed twice, over a band exactly 2·wall wide. In
// swept mode each cell fits its own plane, so the two copies land 0.4 um to
// 50 um apart: measured 5-6.5 mm of arc per pair inside 10 um, 172 mm inside
// 50 um, over 27 pairs. A kernel's linear tolerance is around 1 um, so that
// is not a shape it can resolve — and it is invisible at any zoom, which is
// why the owner could not find it.
// A `jitter` — a per-parity wall offset that broke the tie — was built for
// exactly this and REMOVED on 2026-09-04 at the owner's call, on their CAD
// evidence: it took the near-copy arc to 0 and changed no boolean outcome
// they could observe, while the finding that DID sort the unions is
// adjacency (8 of 8 non-adjacent pairs succeeding, 2 of 13 orthogonal). It
// was measuring a real degeneracy that is not the binding one.
// `shellCoincidence` still measures the arc and the export still prints it,
// so nothing is hidden — the number now simply stands as a reported property
// of the kit (~148 mm inside 50 um at the defaults) rather than as a knob.
// A five-phase index that is guaranteed to DIFFER between any two
// orthogonally adjacent cells (7 and 3 are both non-zero mod 5), used to
// stagger the end-cap planes of the extended blanks. Two-phase parity is not
// enough there: it would put half the caps on one plane and half on another,
// and coplanar overlapping caps are the thing being removed.
export function cellPhase5(label) {
  const [col, row] = String(label).split(",").map(Number);
  return Number.isFinite(col) && Number.isFinite(row) ? ((col * 7 + row * 3) % 5 + 5) % 5 : 0;
}

// The stations a shell is built on: `stations` of them, evenly spaced over
// the map's own, both ends always kept. Fewer stations is fewer knots in the
// loft's v direction, and surface-surface intersection of two nearly
// parallel high-knot NURBS is where a kernel spends its conditioning budget:
// 48 map stations put 51 control points in v on every wall face, 24 put 27.
// The rings that ARE kept are the map's own, so the wall stays exact there.
// FEWER KNOTS IS A MORE ROBUST BOOLEAN. Every wall face carries stations + 3
// control points in v, and surface-surface intersection of two nearly
// parallel high-knot NURBS is where a kernel spends its conditioning budget.
// Halving is close to free: measured on a 64-station map, taking every
// second ring moves the loft 0.105 mm, every fourth 0.414 mm, every eighth
// 1.707 mm — monotone, and all of it at the mouth where the sections open
// fastest.
//
// The count is snapped to a DIVISOR of the map's own, because the loft
// interpolates with a UNIFORM parameterisation: unevenly spaced rings are
// then told they are evenly spaced, and the surface leaves them. Measured at
// 32 of 48 — gaps alternating 1 and 2 — the loft ran 4.6 mm from the very
// rings it was built through, while every divisor lands them to 0.
function stationIndices(Q, stations) {
  if (!stations || stations >= Q) return Array.from({ length: Q + 1 }, (_, q) => q);
  let step = Math.max(1, Math.round(Q / Math.max(3, stations)));
  while (step < Q && Q % step !== 0) step++;
  const out = [];
  for (let q = 0; q <= Q; q += step) out.push(q);
  if (out[out.length - 1] !== Q) out.push(Q);
  return out;
}

export function shellSections(cellRec, row, { t = 0, wall = 3, surf = null, stations = null, snapMouth = true } = {}) {
  const duct = ductSections(cellRec, row, { t });
  if (!duct) return null;
  const Q = duct.length - 1;
  const ap = surf ? apertureFrame(surf) : null;
  const d = [-wall, -wall, -wall, -wall];
  const out = [];
  for (const q of stationIndices(Q, stations)) {
    let pts = insetSection3(duct[q].pts, d);
    // THE MOUTH RING BELONGS TO THE APERTURE SURFACE, NOT TO A BEST-FIT PLANE.
    // insetSection3 offsets in the ring's own best-fit plane and keeps each
    // point's off-plane component, so a point that moves 3 mm sideways stays
    // at the height the ORIGINAL point had — and the aperture is curved, so
    // that height is wrong by the surface's local slope times the offset.
    // Measured 1.14 mm at the tool's defaults, in eighteen different
    // directions because every cell fits its own plane: the lip around each
    // cell's mouth left the aperture and no two lips agreed. Snapping puts
    // every mouth ring back on the one analytic surface.
    //
    // The snap moves ONLY the last ring, so it leaves a one-ring
    // discontinuity in the family for the loft to absorb. When the blank is
    // EXTENDED the mouth face is cut by the mouth trim solid instead, so the
    // snap has nothing to do: `snapMouth` turns it off, and the ring family
    // runs smooth all the way to the end of the loft.
    if (ap && snapMouth && q === Q) pts = pts.map(ap.snap);
    out.push({ s: duct[q].s, area: polyArea3(pts), pts, origin: duct[q].origin });
  }
  return out;
}

// Where adjacent blanks interpenetrate, and by how much. Blanks are the
// ducts grown by the wall on every side, so two of them overlap wherever
// their ducts run closer than 2·wall — near the throat, where the ducts
// tile, and again at the mouth. That is not a defect: it is the shared wall
// between two cells, and the cutters carve the passages back out of it. It
// is measured and reported so the number is visible rather than assumed.
export function shellOverlap(throat, map, { t = 0, wall = 3 } = {}) {
  const seg = (p, A, B) => {
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-12;
    let u = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(p[0] - A[0] - ab[0] * u, p[1] - A[1] - ab[1] * u, p[2] - A[2] - ab[2] * u);
  };
  const gap = (P, Q) => {
    let m = Infinity;
    for (const p of P) for (let k = 0; k < Q.length; k++) m = Math.min(m, seg(p, Q[k], Q[(k + 1) % Q.length]));
    for (const q of Q) for (let k = 0; k < P.length; k++) m = Math.min(m, seg(q, P[k], P[(k + 1) % P.length]));
    return m;
  };
  const byLabel = new Map();
  for (const c of throat.cells) {
    const row = map.rows.find((r) => r.id === c.id);
    if (!row) return null;
    const d = ductSections(c, row, { t });
    if (!d) return null;
    byLabel.set(c.label, d);
  }
  const S = byLabel.values().next().value.length;
  let pairs = 0, touching = 0, apartMin = Infinity, apartAt = null, deepest = 0, deepestAt = null;
  const stationsTouching = new Array(S).fill(0);
  for (const c of throat.cells) {
    const [col, rw] = c.label.split(",").map(Number);
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const nb = `${col + dc},${rw + dr}`;
      if (!byLabel.has(nb)) continue;
      pairs++;
      const A = byLabel.get(c.label), B = byLabel.get(nb);
      let anyTouch = false;
      for (let q = 0; q < S; q++) {
        const g = gap(A[q].pts, B[q].pts) - 2 * wall;   // blank-to-blank, signed
        if (g < 0) { anyTouch = true; stationsTouching[q]++; if (-g > deepest) { deepest = -g; deepestAt = { pair: `${c.label}-${nb}`, q }; } }
        else if (g < apartMin) { apartMin = g; apartAt = { pair: `${c.label}-${nb}`, q }; }
      }
      if (anyTouch) touching++;
    }
  }
  const fracTouching = stationsTouching.filter((n) => n > 0).length / S;
  return { pairs, touching, deepest, deepestAt, apartMin, apartAt, fracTouching, stationsTouching, S };
}

// Extend a duct's sections past both end faces by translating a copy of each
// end ring along that ring's own outward vector-area normal. The added
// volume is exactly |A_vec|·ext per end — a translated ring spans a prism —
// which is what the test asserts.
// `ends` selects which end is extended. The two are separable because the two
// ends are not the same problem: the mouth trim cuts on the APERTURE SURFACE
// itself, a curved face the blanks cross transversally, while the throat trim
// cuts on the PLANE z = 0 — and a plane cut at z = 0 is exactly the operation
// the owner measured failing on individual blanks. Turning the throat
// extension off makes that face by the loft's own end ring instead, which is
// planar in z = 0 by construction, at the price of the coplanar overlapping
// throat caps the extension was introduced to remove.
export function extendSections(sections, ext = 3, { throat = true, mouth = true } = {}) {
  if (!throat && !mouth) return sections;
  const Q = sections.length - 1;
  const cen = (pts) => {
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
    return c;
  };
  const ringNormal = (pts, toward) => {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      ax += a[1] * b[2] - a[2] * b[1];
      ay += a[2] * b[0] - a[0] * b[2];
      az += a[0] * b[1] - a[1] * b[0];
    }
    const L = Math.hypot(ax, ay, az) || 1;
    let n = [ax / L, ay / L, az / L];
    if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  };
  const c0 = cen(sections[0].pts), c1 = cen(sections[1].pts);
  const cQ = cen(sections[Q].pts), cQ1 = cen(sections[Q - 1].pts);
  const nT = ringNormal(sections[0].pts, [c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2]]);
  const nM = ringNormal(sections[Q].pts, [cQ[0] - cQ1[0], cQ[1] - cQ1[1], cQ[2] - cQ1[2]]);
  const shift = (pts, n) => pts.map((p) => [p[0] + n[0] * ext, p[1] + n[1] * ext, p[2] + n[2] * ext]);
  const clone = (sec, n) => ({ s: sec.s, area: sec.area, pts: shift(sec.pts, n), origin: sec.origin });
  return [
    ...(throat ? [clone(sections[0], nT)] : []),
    ...sections,
    ...(mouth ? [clone(sections[Q], nM)] : []),
  ];
}

// Signed volume of a closed triangle soup, by the divergence theorem. Positive
// when every facet winds counter-clockwise seen from outside.
export function meshVolume(verts, tris) {
  let V = 0;
  for (const [a, b, c] of tris) {
    const A = verts[a], B = verts[b], C = verts[c];
    V += (A[0] * (B[1] * C[2] - C[1] * B[2])
        - A[1] * (B[0] * C[2] - C[0] * B[2])
        + A[2] * (B[0] * C[1] - C[0] * B[1])) / 6;
  }
  return V;
}

// Every edge of a closed orientable surface is walked exactly twice, once in
// each direction. Anything else is a hole, a duplicated facet or a flipped one.
export function meshManifold(tris) {
  const use = new Map();
  for (const [a, b, c] of tris)
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      const dir = p < q ? 1 : -1;
      const e = use.get(key) || { n: 0, net: 0 };
      e.n += 1; e.net += dir;
      use.set(key, e);
    }
  let bad = 0, wrong = 0;
  for (const e of use.values()) { if (e.n !== 2) bad++; else if (e.net !== 0) wrong++; }
  return { edges: use.size, notPaired: bad, notOpposed: wrong, ok: bad === 0 && wrong === 0 };
}

// One duct as a closed triangle mesh: a quad strip up the wall, a fan across
// each end. The fan is only valid if the section is star-shaped about its own
// centroid, which is checked rather than assumed — most cells here are NOT
// convex, so this is a real question and not a formality.
export function ductMesh(sections) {
  const Q = sections.length - 1, N = sections[0].pts.length;
  const verts = [];
  for (const sec of sections) for (const p of sec.pts) verts.push(p);
  const centroidOf = (pts) => {
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
    return c;
  };
  const c0 = verts.push(centroidOf(sections[0].pts)) - 1;
  const cQ = verts.push(centroidOf(sections[Q].pts)) - 1;
  const at = (q, k) => q * N + (k % N);
  const tris = [];
  for (let q = 0; q < Q; q++)
    for (let k = 0; k < N; k++) {
      tris.push([at(q, k), at(q, k + 1), at(q + 1, k + 1)]);
      tris.push([at(q, k), at(q + 1, k + 1), at(q + 1, k)]);
    }
  for (let k = 0; k < N; k++) tris.push([c0, at(0, k + 1), at(0, k)]);
  for (let k = 0; k < N; k++) tris.push([cQ, at(Q, k), at(Q, k + 1)]);
  // orientation is decided by measurement, not by assuming the winding of the
  // transported frame — flip the whole soup if it came out inside-out
  if (meshVolume(verts, tris) < 0) for (const tr of tris) { const s = tr[1]; tr[1] = tr[2]; tr[2] = s; }
  return { verts, tris };
}

// Is the end cap's fan legitimate? Every fan triangle must wind the same way
// about the section's own plane; a mixed sign means the centroid sees the
// outline from outside somewhere and the fan folds over itself.
export function fanIsValid(pts) {
  const n = pts.length;
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
  let ref = null, worst = Infinity;
  for (let k = 0; k < n; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    const u = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
    const v = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (!ref) { const L = Math.hypot(...cr) || 1; ref = cr.map((x) => x / L); }
    const d = cr[0] * ref[0] + cr[1] * ref[1] + cr[2] * ref[2];
    worst = Math.min(worst, d);
  }
  return { ok: worst > 0, worst };
}

// Binary STL. One solid per duct is not a thing STL can express — the format
// is a bare triangle soup — so the ducts are concatenated and a slicer splits
// them by connectivity. The header records what they are.
export function buildSTL(meshes, note = "") {
  let n = 0;
  for (const m of meshes) n += m.tris.length;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = new Uint8Array(buf, 0, 80);
  const txt = `h-grid throat partition${note ? " " + note : ""}`;
  for (let i = 0; i < Math.min(79, txt.length); i++) head[i] = txt.charCodeAt(i) & 0x7f;
  dv.setUint32(80, n, true);
  let o = 84;
  for (const m of meshes)
    for (const [a, b, c] of m.tris) {
      const A = m.verts[a], B = m.verts[b], C = m.verts[c];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      const L = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / L, true); dv.setFloat32(o + 4, ny / L, true); dv.setFloat32(o + 8, nz / L, true);
      o += 12;
      for (const P of [A, B, C]) {
        dv.setFloat32(o, P[0], true); dv.setFloat32(o + 4, P[1], true); dv.setFloat32(o + 8, P[2], true);
        o += 12;
      }
      dv.setUint16(o, 0, true); o += 2;
    }
  return buf;
}

// Every duct, meshed and checked.
export function ductSolids(throat, map, opts = {}) {
  if (!map) return null;
  const out = [];
  const sel = opts.only || null;
  for (const cellRec of throat.cells) {
    if (sel && !sel.includes(cellRec.label)) continue;
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const sections = ductSections(cellRec, row, opts);
    if (!sections) return null;
    const mesh = ductMesh(sections);
    out.push({
      id: cellRec.id, label: cellRec.label, sections, ...mesh,
      volume: meshVolume(mesh.verts, mesh.tris),
      manifold: meshManifold(mesh.tris),
    });
  }
  return out;
}

function findSpan(knots, deg, nCtrl, t) {
  if (t >= knots[nCtrl]) return nCtrl - 1;
  let lo = deg, hi = nCtrl;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t < knots[mid]) hi = mid; else lo = mid;
  }
  return lo;
}

// Piegl & Tiller A2.3: values and derivatives of the deg+1 nonzero basis
// functions at t. Returns ders[k][j], k = derivative order, j = 0..deg.
function dersBasisFuns(span, t, deg, nDer, knots) {
  const ndu = Array.from({ length: deg + 1 }, () => new Array(deg + 1).fill(0));
  const left = new Array(deg + 1).fill(0), right = new Array(deg + 1).fill(0);
  ndu[0][0] = 1;
  for (let j = 1; j <= deg; j++) {
    left[j] = t - knots[span + 1 - j];
    right[j] = knots[span + j] - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      ndu[j][r] = right[r + 1] + left[j - r];
      const temp = ndu[r][j - 1] / ndu[j][r];
      ndu[r][j] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    ndu[j][j] = saved;
  }
  const ders = Array.from({ length: nDer + 1 }, () => new Array(deg + 1).fill(0));
  for (let j = 0; j <= deg; j++) ders[0][j] = ndu[j][deg];
  const a = [new Array(deg + 1).fill(0), new Array(deg + 1).fill(0)];
  for (let r = 0; r <= deg; r++) {
    let s1 = 0, s2 = 1;
    a[0][0] = 1;
    for (let k = 1; k <= nDer; k++) {
      let d = 0;
      const rk = r - k, pk = deg - k;
      if (r >= k) { a[s2][0] = a[s1][0] / ndu[pk + 1][rk]; d = a[s2][0] * ndu[rk][pk]; }
      const j1 = rk >= -1 ? 1 : -rk;
      const j2 = r - 1 <= pk ? k - 1 : deg - r;
      for (let j = j1; j <= j2; j++) {
        a[s2][j] = (a[s1][j] - a[s1][j - 1]) / ndu[pk + 1][rk + j];
        d += a[s2][j] * ndu[rk + j][pk];
      }
      if (r <= pk) { a[s2][k] = -a[s1][k - 1] / ndu[pk + 1][r]; d += a[s2][k] * ndu[r][pk]; }
      ders[k][r] = d;
      const tmp = s1; s1 = s2; s2 = tmp;
    }
  }
  let f = deg;
  for (let k = 1; k <= nDer; k++) {
    for (let j = 0; j <= deg; j++) ders[k][j] *= f;
    f *= deg - k;
  }
  return ders;
}

// Clamped knot vector for interpolating m+1 uniformly spaced data points with
// a cubic: interior knots at the interior data parameters, m+3 control points.
function interpKnots(m) {
  const k = [0, 0, 0, 0];
  for (let q = 1; q < m; q++) k.push(q / m);
  k.push(1, 1, 1, 1);
  return k;
}

// LU factorisation with partial pivoting, kept so one matrix can solve many
// right-hand sides — every row of a net uses the same collocation matrix.
function luFactor(A) {
  const n = A.length;
  const M = A.map((r) => r.slice());
  const piv = new Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-13) return null;
    if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; }
    piv[k] = p;
    for (let i = k + 1; i < n; i++) {
      M[i][k] /= M[k][k];
      for (let j = k + 1; j < n; j++) M[i][j] -= M[i][k] * M[k][j];
    }
  }
  return { M, piv, n };
}
function luSolve(lu, b) {
  const { M, piv, n } = lu;
  const x = b.slice();
  // The factorisation swaps FULL rows, prior multiplier columns included, so
  // the whole permutation must be applied to the right-hand side BEFORE any
  // substitution. Interleaving swap and update — the other classic
  // convention — silently corrupts the solve when a later pivot moves a row
  // whose multiplier was already used.
  for (let k = 0; k < n; k++)
    if (piv[k] !== k) { const t = x[piv[k]]; x[piv[k]] = x[k]; x[k] = t; }
  for (let k = 0; k < n; k++)
    for (let i = k + 1; i < n; i++) x[i] -= M[i][k] * x[k];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// The collocation matrix for cubic interpolation of m+1 uniform data points
// with natural end conditions (zero second derivative at both ends). Rows:
// C(t_0) = D_0, C''(t_0) = 0, C(t_1)..C(t_{m-1}), C''(t_m) = 0, C(t_m) = D_m
// — so the right-hand side is the data with a zero inserted second and
// second-to-last.
function interpSystem(m) {
  const knots = interpKnots(m), n = m + 3, deg = 3;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const rowAt = (row, t, der) => {
    const span = findSpan(knots, deg, n, t);
    const d = dersBasisFuns(span, t, deg, der, knots);
    for (let j = 0; j <= deg; j++) A[row][span - deg + j] = d[der][j];
  };
  rowAt(0, 0, 0);
  rowAt(1, 0, 2);
  for (let q = 1; q < m; q++) rowAt(1 + q, q / m, 0);
  rowAt(n - 2, 1, 2);
  rowAt(n - 1, 1, 0);
  return { knots, lu: luFactor(A) };
}

// Interpolate one coordinate of m+1 data values; ends are pinned to the data
// exactly afterwards so pivoting round-off can never leave a shared corner a
// few ulps off between two independently solved patches.
function interpSolve(sys, data) {
  const m = data.length - 1;
  const rhs = [data[0], 0];
  for (let q = 1; q < m; q++) rhs.push(data[q]);
  rhs.push(0, data[m]);
  const x = luSolve(sys.lu, rhs);
  x[0] = data[0];
  x[x.length - 1] = data[m];
  return x;
}
const interpSolve3 = (sys, pts) => {
  const xs = interpSolve(sys, pts.map((p) => p[0]));
  const ys = interpSolve(sys, pts.map((p) => p[1]));
  const zs = interpSolve(sys, pts.map((p) => p[2]));
  return xs.map((x, i) => [x, ys[i], zs[i]]);
};

// The collocation matrix depends only on the point count, so it is factored
// once per count and reused across every side of every duct.
const interpCache = new Map();
const interpSystemCached = (m) => {
  let s = interpCache.get(m);
  if (!s) { s = interpSystem(m); interpCache.set(m, s); }
  return s;
};

// Evaluate a B-spline surface given its control net (net[i][j], i along u).
export function evalBsplineSurf(net, uKnots, vKnots, u, v) {
  const deg = 3, nu = net.length, nv = net[0].length;
  const su = findSpan(uKnots, deg, nu, u), sv = findSpan(vKnots, deg, nv, v);
  const Nu = dersBasisFuns(su, u, deg, 0, uKnots)[0];
  const Nv = dersBasisFuns(sv, v, deg, 0, vKnots)[0];
  const P = [0, 0, 0];
  for (let i = 0; i <= deg; i++)
    for (let j = 0; j <= deg; j++) {
      const w = Nu[i] * Nv[j], q = net[su - deg + i][sv - deg + j];
      P[0] += w * q[0]; P[1] += w * q[1]; P[2] += w * q[2];
    }
  return P;
}

// Greville abscissae of a cubic knot vector — the coefficients that express
// the linear function t in the B-spline basis, which is what lets the Coons
// patch's bilinear blend be written exactly as a control net.
const greville = (knots, n) =>
  Array.from({ length: n }, (_, i) => (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3);

// ── the B-rep of one duct ──────────────────────────────────────────────────
// Interpolates the sampled rings into four wall patches split at the section
// corners, plus two Coons caps. Returns control nets and knot vectors with
// the sharing structure explicit: corner columns appear once and both
// adjacent walls reference them.
export function ductBrep(sections, { capMouthPts = null } = {}) {
  const S = sections.length;            // stations, incl. both ends
  const N = sections[0].pts.length;     // points around the ring
  if (N % 4 !== 0) return null;
  const n = N / 4;                      // points per side, corner to corner-1
  const mU = n, mV = S - 1;
  const sysU = interpSystemCached(mU), sysV = interpSystemCached(mV);
  if (!sysU.lu || !sysV.lu) return null;
  const nu = mU + 3, nv = mV + 3;

  // u-interpolation per side per station: 4 x S rows of nu control points
  const rowsU = Array.from({ length: 4 }, () => new Array(S));
  for (let s = 0; s < 4; s++)
    for (let q = 0; q < S; q++) {
      const data = [];
      for (let i = 0; i <= n; i++) data.push(sections[q].pts[(s * n + i) % N]);
      rowsU[s][q] = interpSolve3(sysU, data);
    }

  // v-interpolation. Corner columns are solved ONCE and shared by both
  // adjacent walls — that identity is what makes the seam exact.
  const cornerCols = Array.from({ length: 4 }, (_, s) =>
    interpSolve3(sysV, Array.from({ length: S }, (_, q) => rowsU[s][q][0])));
  const walls = Array.from({ length: 4 }, (_, s) => {
    const net = new Array(nu);
    net[0] = cornerCols[s];
    net[nu - 1] = cornerCols[(s + 1) % 4];
    for (let i = 1; i < nu - 1; i++)
      net[i] = interpSolve3(sysV, Array.from({ length: S }, (_, q) => rowsU[s][q][i]));
    return net;
  });

  // Coons caps from the four wall end rows. B0..B3 run head-to-tail round the
  // ring; the quad wants B2 and B3 reversed, and the reversal is exact
  // because the clamped uniform knot vector is symmetric.
  const coonsCap = (j) => {
    const B = walls.map((net) => net.map((col) => col[j]));   // 4 boundary curves, ring order
    const B0 = B[0], B1 = B[1], B2 = B[2].slice().reverse(), B3 = B[3].slice().reverse();
    const g = greville(sysU.knots, nu);
    const Q00 = B0[0], Q10 = B0[nu - 1], Q11 = B2[nu - 1], Q01 = B2[0];
    const net = Array.from({ length: nu }, (_, i) =>
      Array.from({ length: nu }, (_, jj) => {
        const gi = g[i], gj = g[jj];
        return [0, 1, 2].map((c) =>
          (1 - gj) * B0[i][c] + gj * B2[i][c] + (1 - gi) * B3[jj][c] + gi * B1[jj][c]
          - ((1 - gi) * (1 - gj) * Q00[c] + gi * (1 - gj) * Q10[c]
             + gi * gj * Q11[c] + (1 - gi) * gj * Q01[c]));
      }));
    // pin the boundaries to the exact input curves — the blend already lands
    // there analytically; this removes the last round-off
    for (let i = 0; i < nu; i++) { net[i][0] = B0[i]; net[i][nu - 1] = B2[i]; }
    for (let jj = 0; jj < nu; jj++) { net[0][jj] = B3[jj]; net[nu - 1][jj] = B1[jj]; }
    return net;
  };

  // A cap built by interpolating a DATA GRID rather than blending the
  // boundary. Its boundary control points come out identical to the walls'
  // end rows — the same data through the same clamped system gives the same
  // control points — and are then pinned outright, so the seam is shared by
  // identity exactly as the Coons cap's is.
  const gridCap = (data, j) => {
    const rowsC = [];
    for (let jj = 0; jj <= n; jj++)
      rowsC.push(interpSolve3(sysU, Array.from({ length: n + 1 }, (_, i) => data[i][jj])));
    const net = Array.from({ length: nu }, (_, i) =>
      interpSolve3(sysU, Array.from({ length: n + 1 }, (_, jj) => rowsC[jj][i])));
    const B = walls.map((netW) => netW.map((col) => col[j]));
    const B0 = B[0], B1 = B[1], B2 = B[2].slice().reverse(), B3 = B[3].slice().reverse();
    for (let i = 0; i < nu; i++) { net[i][0] = B0[i]; net[i][nu - 1] = B2[i]; }
    for (let jj = 0; jj < nu; jj++) { net[0][jj] = B3[jj]; net[nu - 1][jj] = B1[jj]; }
    return net;
  };

  return {
    n, S, nu, nv,
    uKnots: sysU.knots, vKnots: sysV.knots,
    walls, cornerCols,
    capThroat: coonsCap(0),
    capMouth: capMouthPts ? gridCap(capMouthPts, nv - 1) : coonsCap(nv - 1),
  };
}

// Largest distance between the interpolated wall surfaces and the sampled
// ring points they were built from — the number that says the B-rep IS the
// sampled geometry and not a smoothed cousin of it.
export function brepResidual(brep, sections) {
  const { n, S, walls, uKnots, vKnots } = brep;
  let worst = 0;
  for (let s = 0; s < 4; s++)
    for (let q = 0; q < S; q++)
      for (let i = 0; i <= n; i++) {
        const P = evalBsplineSurf(walls[s], uKnots, vKnots, i / n, q / (S - 1));
        const D = sections[q].pts[(s * n + i) % (4 * n)];
        const d = Math.hypot(P[0] - D[0], P[1] - D[1], P[2] - D[2]);
        if (d > worst) worst = d;
      }
  return worst;
}

// Divergence-theorem volume of the B-rep, by tessellating each face on a
// parameter grid. Each face's orientation is MEASURED against its outward
// direction — the caps' natural u x v normals both point the same axial way
// (both nets are built in ring order), so assuming a winding would get
// exactly one of them wrong whichever way the ring runs.
//
// caps: "coons" closes with the emitted Coons cap surfaces — the volume of
// the solid as written to the file. "fan" closes with the same centroid fans
// ductMesh uses, which makes the number directly comparable to the mesh
// volume: the walls are then the only thing that differs, and the two must
// agree to chord error. The difference between the two modes IS the cap-fill
// ambiguity on a curved mouth ring — the ring lies on the curved aperture,
// so what surface spans it is a choice, and the enclosed volume moves with
// the choice (measured 0.8-5% of a duct depending on mouth curvature).
export function brepVolume(brep, sections, du = 12, dv = 48, caps = "coons") {
  const { uKnots, vKnots, walls, capThroat, capMouth } = brep;
  const S = sections.length;
  const centroid = (q) => {
    const c = [0, 0, 0], P = sections[q].pts;
    for (const p of P) { c[0] += p[0] / P.length; c[1] += p[1] / P.length; c[2] += p[2] / P.length; }
    return c;
  };
  const c0 = centroid(0), c1 = centroid(1), cQ = centroid(S - 1), cQ1 = centroid(S - 2);
  const cMid = centroid(Math.floor(S / 2));
  let V = 0;
  const addFace = (net, uk, vk, gu, gv, outward) => {
    const P = evalBsplineSurf(net, uk, vk, 0.5, 0.5);
    const e = 1e-4;
    const Pu = evalBsplineSurf(net, uk, vk, 0.5 + e, 0.5);
    const Pv = evalBsplineSurf(net, uk, vk, 0.5, 0.5 + e);
    const nrm = [
      (Pu[1] - P[1]) * (Pv[2] - P[2]) - (Pu[2] - P[2]) * (Pv[1] - P[1]),
      (Pu[2] - P[2]) * (Pv[0] - P[0]) - (Pu[0] - P[0]) * (Pv[2] - P[2]),
      (Pu[0] - P[0]) * (Pv[1] - P[1]) - (Pu[1] - P[1]) * (Pv[0] - P[0]),
    ];
    const out = outward || [P[0] - cMid[0], P[1] - cMid[1], P[2] - cMid[2]];
    const sgn = nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] >= 0 ? 1 : -1;
    const grid = [];
    for (let i = 0; i <= gu; i++) {
      const row = [];
      for (let j = 0; j <= gv; j++) row.push(evalBsplineSurf(net, uk, vk, i / gu, j / gv));
      grid.push(row);
    }
    for (let i = 0; i < gu; i++)
      for (let j = 0; j < gv; j++) {
        const A = grid[i][j], B = grid[i + 1][j], C = grid[i + 1][j + 1], D = grid[i][j + 1];
        for (const [Pa, Qa, Ra] of [[A, B, C], [A, C, D]])
          V += sgn * (Pa[0] * (Qa[1] * Ra[2] - Ra[1] * Qa[2])
              - Pa[1] * (Qa[0] * Ra[2] - Ra[0] * Qa[2])
              + Pa[2] * (Qa[0] * Ra[1] - Ra[0] * Qa[1])) / 6;
      }
  };
  const addFan = (pts, outward) => {
    const n = pts.length, ctr = [0, 0, 0];
    for (const p of pts) { ctr[0] += p[0] / n; ctr[1] += p[1] / n; ctr[2] += p[2] / n; }
    let F = 0;
    for (let k = 0; k < n; k++) {
      const A = pts[k], B = pts[(k + 1) % n];
      F += (ctr[0] * (A[1] * B[2] - B[1] * A[2])
          - ctr[1] * (A[0] * B[2] - B[0] * A[2])
          + ctr[2] * (A[0] * B[1] - B[0] * A[1])) / 6;
    }
    // orient by the fan's own vector area against the outward direction
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < n; k++) {
      const A = pts[k], B = pts[(k + 1) % n];
      ax += A[1] * B[2] - A[2] * B[1]; ay += A[2] * B[0] - A[0] * B[2]; az += A[0] * B[1] - A[1] * B[0];
    }
    const sgn = ax * outward[0] + ay * outward[1] + az * outward[2] >= 0 ? 1 : -1;
    V += sgn * F;
  };
  for (const w of walls) addFace(w, uKnots, vKnots, du, dv, null);
  const outT = [c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2]];
  const outM = [cQ[0] - cQ1[0], cQ[1] - cQ1[1], cQ[2] - cQ1[2]];
  if (caps === "fan") {
    addFan(sections[0].pts, outT);
    addFan(sections[S - 1].pts, outM);
  } else {
    addFace(capThroat, uKnots, uKnots, du, du, outT);
    addFace(capMouth, uKnots, uKnots, du, du, outM);
  }
  return Math.abs(V);
}

// WHICH WAY THE SHELL FACES, DECIDED ONCE FOR THE WHOLE SOLID.
//
// The topology fixes the faces' orientations RELATIVE to each other: the four
// walls share one state, the mouth cap goes with them, and the throat cap is
// opposite (their natural u x v normals both point the same axial way, so one
// of the two always has to be flipped — the cap-orientation finding). Only the
// overall sense is free, and it is one bit for the solid.
//
// It used to be measured per face, against the ray from a mid-station centroid
// to the patch centre. That is a proxy for "outward", and on a duct it is a
// good one. On the HORN BODY it is wrong: the skin flares so hard that
// mid-path it runs outward almost faster than it runs forward — measured
// dv = (232, 0, -41) at the side wall, so the surface is nearly perpendicular
// to the axis and its true outward normal is nearly -z while the radial ray
// says +x. Two of the four walls then read the proxy backwards, their loops
// were reversed and the others' were not, and the shared vertical edges came
// out used twice in the SAME direction: an invalid shell that the edge-pairing
// check caught.
//
// Integrating the divergence theorem over the whole shell replaces six guesses
// with one measurement that cannot disagree with itself: positive means the
// assumed sense already points outward.
export function brepShellOrientation(brep, gu = 6, gv = 18) {
  const { uKnots, vKnots, walls, capThroat, capMouth } = brep;
  let V = 0;
  const addFace = (net, uk, vk, nu2, nv2, sgn) => {
    const grid = [];
    for (let i = 0; i <= nu2; i++) {
      const row = [];
      for (let j = 0; j <= nv2; j++) row.push(evalBsplineSurf(net, uk, vk, i / nu2, j / nv2));
      grid.push(row);
    }
    for (let i = 0; i < nu2; i++)
      for (let j = 0; j < nv2; j++) {
        const A = grid[i][j], B = grid[i + 1][j], C = grid[i + 1][j + 1], D = grid[i][j + 1];
        for (const [P, Q, Rr] of [[A, B, C], [A, C, D]])
          V += sgn * (P[0] * (Q[1] * Rr[2] - Rr[1] * Q[2])
            - P[1] * (Q[0] * Rr[2] - Rr[0] * Q[2])
            + P[2] * (Q[0] * Rr[1] - Rr[0] * Q[1])) / 6;
      }
  };
  for (const w of walls) addFace(w, uKnots, vKnots, gu, gv, 1);
  addFace(capMouth, uKnots, uKnots, gu, gu, 1);
  addFace(capThroat, uKnots, uKnots, gu, gu, -1);
  return { outward: V >= 0, volume: V };
}

// ── the AP214 writer ───────────────────────────────────────────────────────
// A STEP real must carry a decimal point, and exponents are uppercase.
function stepReal(x) {
  if (!isFinite(x)) return "0.";
  if (Math.abs(x) < 1e-12) return "0.";
  let s = String(Number(x.toPrecision(12)));
  if (s.includes("e") || s.includes("E")) {
    const [m, e] = s.toLowerCase().split("e");
    return (m.includes(".") ? m : m + ".") + "E" + e;
  }
  return s.includes(".") ? s : s + ".";
}

// Emit one file: every solid in solidsSpec as a MANIFOLD_SOLID_BREP in a
// single ADVANCED_BREP_SHAPE_REPRESENTATION, so CAD imports one part with one
// body per solid. Each spec is { label, sections, capZ }: capZ is the plane
// the solid's throat cap is expected to sit in (checked, not assumed), or
// null to skip that check. Returns { text, checks } — the checks are computed
// on the same structures that were emitted, not re-derived. buildSTEP and
// buildShellSTEP below are the two callers.
// A STEP string literal is delimited by apostrophes, so an apostrophe INSIDE
// one has to be doubled, and a backslash doubled too (it introduces the
// control directives). Every shell kit shipped before 2026-09-03 wrote its
// recipe with bare quotes — "union the 6 'shell blank' solids" — which makes
// the FILE_DESCRIPTION a syntax error: the reader sees a string, then the bare
// keywords `shell blank`, then another string. The DATA section was always
// well-formed, so what a lenient importer did with it is unknown; a strict one
// is entitled to reject the file. Every string that reaches the writer now
// goes through here.
// Non-ASCII is folded too: a STEP string is ISO 8859-1 with \X2\ escapes for
// anything above it, and the recipes carry an em dash. Folding is simpler than
// encoding and loses nothing a CAD reader cares about.
const stepStr = (v) => String(v ?? "")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/[^\x20-\x7e]/g, "?")
  .replace(/\\/g, "\\\\")
  .replace(/'/g, "''");

function stepEmit({ name, desc, fileDesc, params, solidsSpec, folders = true }) {
  const E = [];
  let nid = 0;
  const add = (txt) => { E.push(`#${++nid}=${txt};`); return nid; };
  const pt = (p) => add(`CARTESIAN_POINT('',(${stepReal(p[0])},${stepReal(p[1])},${stepReal(p[2])}))`);

  // header / context boilerplate
  const appCtx = add(`APPLICATION_CONTEXT('automotive design')`);
  add(`APPLICATION_PROTOCOL_DEFINITION('draft international standard','automotive_design',1998,#${appCtx})`);
  const prodCtx = add(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const pdCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const uLen = add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const uAng = add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const uSol = add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-4),#${uLen},'distance_accuracy_value','')`);
  const geoCtx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${uLen},#${uAng},#${uSol}))REPRESENTATION_CONTEXT('',''))`);
  // A fresh identity placement per representation. Sharing one across several
  // representations is legal and common, but an assembly's ITEM_DEFINED_
  // TRANSFORMATION names the parent's and the child's placements as two
  // distinct arguments, and a reader that follows the reference back to a
  // shared entity has no way to tell whose frame it is.
  const mkPlace = () => {
    const o = pt([0, 0, 0]);
    const d1 = add(`DIRECTION('',(0.,0.,1.))`);
    const d2 = add(`DIRECTION('',(1.,0.,0.))`);
    return add(`AXIS2_PLACEMENT_3D('',#${o},#${d1},#${d2})`);
  };
  const place = mkPlace();
  // One PRODUCT per node of the product tree — the root, each folder, and
  // each leaf that carries geometry. The flat case builds exactly one.
  const mkNode = (pname, pdesc) => {
    const p = add(`PRODUCT('${stepStr(pname)}','${stepStr(pdesc ?? pname)}','',(#${prodCtx}))`);
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${p}))`);
    const f = add(`PRODUCT_DEFINITION_FORMATION('','',#${p})`);
    const d = add(`PRODUCT_DEFINITION('design','',#${f},#${pdCtx})`);
    return { pd: d, pds: add(`PRODUCT_DEFINITION_SHAPE('','',#${d})`) };
  };

  const knotTxt = (knots) => {
    const vals = [], mult = [];
    for (const k of knots) {
      if (vals.length && Math.abs(k - vals[vals.length - 1]) < 1e-15) mult[mult.length - 1]++;
      else { vals.push(k); mult.push(1); }
    }
    return { m: `(${mult.join(",")})`, v: `(${vals.map(stepReal).join(",")})` };
  };
  const curveEnt = (ids, knots) => {
    const { m, v } = knotTxt(knots);
    return add(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${ids.map((i) => "#" + i).join(",")}),.UNSPECIFIED.,.F.,.F.,${m},${v},.UNSPECIFIED.)`);
  };
  const surfEnt = (idNet, uKnots, vKnots) => {
    const ku = knotTxt(uKnots), kv = knotTxt(vKnots);
    const rows = idNet.map((col) => `(${col.map((i) => "#" + i).join(",")})`).join(",");
    return add(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,(${rows}),.UNSPECIFIED.,.F.,.F.,.F.,${ku.m},${kv.m},${ku.v},${kv.v},.UNSPECIFIED.)`);
  };

  const solids = [];
  const checks = { ducts: 0, residual: 0, edgePairing: true, capPlanarZ: 0, volumes: [] };

  for (const spec of solidsSpec) {
    const sections = spec.sections;
    const brep = ductBrep(sections, { capMouthPts: spec.capMouthPts || null });
    if (!brep) return null;
    const { nu, nv, uKnots, vKnots, walls, cornerCols, capThroat, capMouth } = brep;
    checks.ducts++;
    checks.residual = Math.max(checks.residual, brepResidual(brep, sections));
    if (spec.capZ != null)
      for (const col of capThroat) for (const p of col) checks.capPlanarZ = Math.max(checks.capPlanarZ, Math.abs(p[2] - spec.capZ));
    const dm = ductMesh(sections);
    checks.volumes.push({ brep: brepVolume(brep, sections), mesh: Math.abs(meshVolume(dm.verts, dm.tris)) });

    // point entities, with the sharing structure explicit: corner columns
    // once, wall interiors once, cap interiors once
    const cornerIds = cornerCols.map((col) => col.map(pt));
    const wallIds = walls.map((net, s) => net.map((col, i) =>
      i === 0 ? cornerIds[s] : i === nu - 1 ? cornerIds[(s + 1) % 4] : col.map(pt)));
    // Cap id nets. The boundary rows and columns reference the wall patches'
    // own end-row point ids — that identity, not a tolerance, is what makes
    // the cap watertight against the walls. Row i = 0 is B3 (side 3
    // reversed), row i = nu-1 is B1 (side 1), column jj = 0 is B0 (side 0),
    // column jj = nu-1 is B2 (side 2 reversed). Only the interior is new.
    const capIds = (net, j) => net.map((col, i) => {
      if (i === 0) return wallIds[3].slice().reverse().map((c) => c[j]);
      if (i === nu - 1) return wallIds[1].map((c) => c[j]);
      return col.map((p, jj) =>
        jj === 0 ? wallIds[0][i][j] : jj === nu - 1 ? wallIds[2][nu - 1 - i][j] : pt(p));
    });
    const capThroatIds = capIds(capThroat, 0);
    const capMouthIds = capIds(capMouth, nv - 1);

    // vertices: the 8 ring corners
    const vThroat = cornerIds.map((c) => add(`VERTEX_POINT('',#${c[0]})`));
    const vMouth = cornerIds.map((c) => add(`VERTEX_POINT('',#${c[nv - 1]})`));

    // the 12 edges. Vertical edges run throat -> mouth along a corner column;
    // end edges run corner s -> corner s+1 along a wall's end row.
    const edges = [];
    const mkEdge = (v1, v2, ids, knots) =>
      edges.push({ id: add(`EDGE_CURVE('',#${v1},#${v2},#${curveEnt(ids, knots)},.T.)`), uses: [] }) - 1;
    const eVert = [], eThroat = [], eMouth = [];
    for (let s = 0; s < 4; s++) eVert.push(mkEdge(vThroat[s], vMouth[s], cornerIds[s], vKnots));
    for (let s = 0; s < 4; s++)
      eThroat.push(mkEdge(vThroat[s], vThroat[(s + 1) % 4], wallIds[s].map((c) => c[0]), uKnots));
    for (let s = 0; s < 4; s++)
      eMouth.push(mkEdge(vMouth[s], vMouth[(s + 1) % 4], wallIds[s].map((c) => c[nv - 1]), uKnots));

    // ORIENTATION IS ONE DECISION FOR THE SOLID, NOT SIX. The relative senses
    // are fixed by the topology — four walls together, the mouth cap with
    // them, the throat cap opposite — and brepShellOrientation settles the
    // remaining bit by integrating the divergence theorem over the whole
    // shell. Measuring each face separately against a radial "outward" proxy
    // is what produced an invalid body shell; see the note on that function.
    const shellOut = brepShellOrientation(brep).outward;

    // one face from a whole patch: the flag and the loop direction move
    // together, so the loop is always CCW about the FACE normal
    const faceFrom = (net, uk, vk, loop, kind) => {
      const same = kind === "throat" ? !shellOut : shellOut;
      const useLoop = same ? loop : loop.slice().reverse().map(([e, f]) => [e, !f]);
      for (const [e, f] of useLoop) edges[e].uses.push(f);
      const oes = useLoop.map(([e, f]) => add(`ORIENTED_EDGE('',*,*,#${edges[e].id},${f ? ".T." : ".F."})`));
      const el = add(`EDGE_LOOP('',(${oes.map((i) => "#" + i).join(",")}))`);
      const fb = add(`FACE_OUTER_BOUND('',#${el},.T.)`);
      const su = surfEnt(net === capThroat ? capThroatIds : net === capMouth ? capMouthIds : wallIds[walls.indexOf(net)], uk, vk);
      return add(`ADVANCED_FACE('',(#${fb}),#${su},${same ? ".T." : ".F."})`);
    };

    const faces = [];
    for (let s = 0; s < 4; s++)
      faces.push(faceFrom(walls[s], uKnots, vKnots,
        [[eThroat[s], true], [eVert[(s + 1) % 4], true], [eMouth[s], false], [eVert[s], false]], "wall"));
    faces.push(faceFrom(capThroat, uKnots, uKnots,
      [[eThroat[0], true], [eThroat[1], true], [eThroat[2], true], [eThroat[3], true]], "throat"));
    faces.push(faceFrom(capMouth, uKnots, uKnots,
      [[eMouth[0], true], [eMouth[1], true], [eMouth[2], true], [eMouth[3], true]], "mouth"));

    // every edge must be used exactly twice, once each way
    for (const e of edges)
      if (e.uses.length !== 2 || e.uses[0] === e.uses[1]) checks.edgePairing = false;

    const shell = add(`CLOSED_SHELL('',(${faces.map((i) => "#" + i).join(",")}))`);
    solids.push({
      id: add(`MANIFOLD_SOLID_BREP('${stepStr(spec.label)}',#${shell})`),
      label: spec.label,
      group: spec.group || null,
    });
  }

  // ── THE PRODUCT TREE ──────────────────────────────────────────────────────
  //
  // A kit is one file carrying two kinds of solid that are used in opposite
  // senses — the blanks are the material, the cutters are what is removed
  // from it — and one flat list of 36 bodies makes the reader sort them by
  // reading names. A STEP ASSEMBLY says it structurally: a root PRODUCT with
  // NEXT_ASSEMBLY_USAGE_OCCURRENCE children, which every CAD importer shows
  // as a folder tree. The tree is a NAMING and GROUPING device only: every
  // occurrence carries the identity transform, so each solid sits at exactly
  // the coordinates it would have had in the flat file. Nothing moves.
  //
  // Emitted only when the specs actually name more than one folder; a single
  // group is not worth a level of nesting, and buildSTEP (ducts alone) still
  // ships the flat single-PRODUCT form it always has.
  const names = [];
  for (const s of solids) if (s.group && !names.includes(s.group)) names.push(s.group);
  const grouped = folders && names.length > 1 && solids.every((s) => s.group);
  const bind = (node, rep) => add(`SHAPE_DEFINITION_REPRESENTATION(#${node.pds},#${rep})`);
  // parent contains child, with no transform between their frames
  const contain = (parent, child, occ, nm) => {
    const nauo = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('${occ}','${stepStr(nm)}','',#${parent.node.pd},#${child.node.pd},$)`);
    const pdsN = add(`PRODUCT_DEFINITION_SHAPE('','',#${nauo})`);
    const idt = add(`ITEM_DEFINED_TRANSFORMATION('','',#${parent.place},#${child.place})`);
    const rr = add(`(REPRESENTATION_RELATIONSHIP('','',#${child.rep},#${parent.rep})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idt})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${rr},#${pdsN})`);
  };
  const tree = { folders: 0, parts: 0 };
  if (!grouped) {
    const root = mkNode(name, desc);
    bind(root, add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${place},${solids.map((s) => "#" + s.id).join(",")}),#${geoCtx})`));
    tree.parts = 1;
  } else {
    const root = { node: mkNode(name, desc), place };
    root.rep = add(`SHAPE_REPRESENTATION('',(#${root.place}),#${geoCtx})`);
    bind(root.node, root.rep);
    let occ = 0;
    for (const gname of names) {
      const members = solids.filter((s) => s.group === gname);
      const folder = { node: mkNode(gname, `${name} ${gname}`), place: mkPlace() };
      folder.rep = add(`SHAPE_REPRESENTATION('',(#${folder.place}),#${geoCtx})`);
      bind(folder.node, folder.rep);
      contain(root, folder, ++occ, gname);
      tree.folders++;
      for (const m of members) {
        const leaf = { node: mkNode(m.label, m.label), place: mkPlace() };
        leaf.rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${leaf.place},#${m.id}),#${geoCtx})`);
        bind(leaf.node, leaf.rep);
        contain(folder, leaf, ++occ, m.label);
        tree.parts++;
      }
    }
  }
  checks.tree = tree;

  const stamp = new Date().toISOString().slice(0, 19);
  const text = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${[fileDesc, params].filter(Boolean).map((x) => `'${stepStr(x)}'`).join(",")}),'2;1');`,
    `FILE_NAME('${stepStr(name)}.step','${stamp}',(''),(''),'audiotools ginkgo','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    "ENDSEC;",
    "DATA;",
    ...E,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
  return { text, checks };
}

// The air: every duct as one solid. What this file has always emitted.
export function buildSTEP(throat, map, { t = 0, only = null, params = null, name = "ginkgo_ducts" } = {}) {
  if (!map) return null;
  const solidsSpec = [];
  for (const cellRec of throat.cells) {
    if (only && !only.includes(cellRec.label)) continue;
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const sections = ductSections(cellRec, row, { t });
    if (!sections) return null;
    solidsSpec.push({ label: `duct ${cellRec.label}`, sections, capZ: 0 });
  }
  return stepEmit({
    name, solidsSpec, params,
    desc: "ginkgo multicell horn ducts",
    fileDesc: "ginkgo multicell horn ducts, lofted B-spline solids",
  });
}

// The narrowest width of each throat cell, as a rotating caliper on its own
// outline. This is the number `wall` has to be read against: at the throat the
// cells TILE, so a blank pushes `wall` into its neighbour's territory across
// the whole shared face, and when 2·wall exceeds a cell's width the blanks on
// either side of it reach past each other — two solids that share no edge at
// all end up sharing material. Measured at the defaults: cells 4.47-7.25 mm
// wide against 2·wall = 7.0 mm, and the blanks then stack SIX deep at the
// throat. It is the FACE offset that does this, not the corner mitre: clamping
// every mitre to a full round left the stack at 6 and the non-adjacent sharing
// at 29 pairs of 153, while dropping the wall moved both at once (stack
// 6/5/4 and non-adjacent 29/18/2 at wall 3/2.5/2, zero at 1.5).
// Measured on the DUCT ring when a map is given — that is the outline the
// blank is actually offset from — and on the layout polygon otherwise.
export function throatCellWidth(throat, map = null, { t = 0 } = {}) {
  const per = [];
  for (const c of throat.cells) {
    let poly = c.poly;
    if (map) {
      const row = map.rows.find((r) => r.id === c.id);
      const d = row && ductSections(c, row, { t });
      if (d) poly = d[0].pts;
    }
    if (!poly || poly.length < 3) continue;
    let w = Infinity;
    for (let a = 0; a < 180; a += 1) {
      const ux = Math.cos((a * Math.PI) / 180), uy = Math.sin((a * Math.PI) / 180);
      let lo = Infinity, hi = -Infinity;
      for (const p of poly) { const s = p[0] * ux + p[1] * uy; if (s < lo) lo = s; if (s > hi) hi = s; }
      if (hi - lo < w) w = hi - lo;
    }
    per.push({ label: c.label, w });
  }
  if (!per.length) return null;
  const ws = per.map((x) => x.w);
  const min = Math.min(...ws);
  return { min, max: Math.max(...ws), per, narrowest: per.find((x) => x.w === min).label };
}

// Does the lofted WALL run past its own throat cap plane?
//
// `extendSections` prepends ONE ring at distance `ext`, and `ductBrep`
// interpolates with a UNIFORM parameterisation — so a short first gap followed
// by a full station step is told the two are equal, and the cubic overshoots
// backwards. The blank's wall then pokes through the flat cap that is supposed
// to close it: a self-intersecting solid, which no residual, edge-pairing or
// integrity check can see. Measured against the station step on a 6x3 at
// 32 shell stations (step 11.5 mm), sweeping ext:
//   ext/step   0.09    0.17    0.26    0.43   0.69   0.96
//   overshoot  0.94    0.40    0.033   0.000  0.000  0.000  mm
// so the threshold is around 0.4 of a station step, and the shipped default
// (ext 3 with the five-phase stagger, 3.0 to 7.8 mm) straddles it — the two
// phase-0 cells sit at 0.26 and DO overshoot. Reported, not clamped: raising
// `ext` or lowering `stations` both fix it, and which one the owner wants is
// not this function's call.
export function shellCapOvershoot(throat, map, { t = 0, wall = 3, stations = 32, ext = 3, samples = 24 } = {}) {
  if (!map) return null;
  let worst = 0, at = null, minRatio = Infinity, stepSum = 0, nStep = 0;
  for (const cellRec of throat.cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const blank = shellSections(cellRec, row, { t, wall, surf: map.mouthSurf, stations, snapMouth: false });
    if (!blank) return null;
    let tot = 0;
    for (let q = 1; q < blank.length; q++) {
      let d = 0;
      const A = blank[q - 1].pts, B = blank[q].pts;
      for (let k = 0; k < A.length; k++) d += Math.hypot(B[k][0] - A[k][0], B[k][1] - A[k][1], B[k][2] - A[k][2]) / A.length;
      tot += d;
    }
    const step = tot / Math.max(1, blank.length - 1);
    stepSum += step; nStep++;
    const e = ext * (1 + 0.4 * cellPhase5(cellRec.label));
    minRatio = Math.min(minRatio, e / step);
    const sec = extendSections(blank, e, { throat: true, mouth: true });
    const br = ductBrep(sec);
    if (!br) continue;
    const z0 = sec[0].pts[0][2];
    let zmin = Infinity;
    for (let j = 0; j <= samples; j++) {
      const v = (0.06 * j) / samples;
      for (const w of br.walls) for (let i = 0; i < br.n; i++)
        zmin = Math.min(zmin, evalBsplineSurf(w, br.uKnots, br.vKnots, i / br.n, v)[2]);
    }
    if (z0 - zmin > worst) { worst = z0 - zmin; at = cellRec.label; }
  }
  return { worst, at, minRatio, step: nStep ? stepSum / nStep : 0 };
}

// ---------------------------------------------------------------------------
// SYMMETRY REGIONS
//
// The horn is mirror-symmetric about x = 0 and about y = 0, so a half or a
// quarter carries the whole design and the CAD work on it is a quarter of the
// booleans. Both mirrors are properties of the BUILT geometry rather than of
// the intent, though — a bow whose direction is a world axis breaks one of
// them by construction (measured 20.5 mm on the y mirror for dir "y", against
// 5.6e-11 mm for "radial") — so `mirrorSymmetry` measures the residual and the
// caller is expected to show it beside the region rather than assume it.
//
// A cell is assigned by its THROAT centroid. A cell whose centroid sits ON a
// plane is its OWN mirror image: it is INCLUDED in the region and reported
// separately as `onPlane`, because mirroring the region in CAD would otherwise
// drop a second copy of it exactly on the first. An odd row or column count is
// exactly when that happens — 6x3 splits cleanly left/right and straddles
// top/bottom, with the middle row on the plane.
export function symmetryRegion(throat, { xSide = 0, ySide = 0, tol = 1e-6 } = {}) {
  const keep = [], onPlane = [];
  for (const c of throat.cells) {
    const g = c.centroid || [0, 0];
    const onX = Math.abs(g[0]) <= tol, onY = Math.abs(g[1]) <= tol;
    if (xSide && !onX && Math.sign(g[0]) !== Math.sign(xSide)) continue;
    if (ySide && !onY && Math.sign(g[1]) !== Math.sign(ySide)) continue;
    keep.push(c.label);
    if ((xSide && onX) || (ySide && onY)) onPlane.push(c.label);
  }
  return { labels: keep, onPlane, xSide, ySide, tol, dropped: throat.cells.length - keep.length };
}

// How well the built ducts actually mirror, per axis, in millimetres.
//
// Point CORRESPONDENCE is not assumed: a mirror reverses a ring's orientation,
// so index k of one cell is not index k of its partner. Each mirrored point is
// measured against the partner's ring as a POLYLINE, which is a one-sided
// Hausdorff distance and needs no index map. A cell that is its own partner
// (centroid on the plane) is measured against itself mirrored, which is the
// check that matters for the cells a region export cannot split.
export function mirrorSymmetry(throat, map, { t = 0, every = 2 } = {}) {
  if (!map) return null;
  const secs = new Map(), ctr = new Map();
  for (const c of throat.cells) {
    const row = map.rows.find((r) => r.id === c.id);
    if (!row) return null;
    const d = ductSections(c, row, { t });
    if (!d) return null;
    secs.set(c.label, d);
    ctr.set(c.label, c.centroid || [0, 0]);
  }
  const seg = (p, A, B) => {
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-12;
    let u = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(p[0] - A[0] - ab[0] * u, p[1] - A[1] - ab[1] * u, p[2] - A[2] - ab[2] * u);
  };
  const toRing = (p, P) => {
    let m = Infinity;
    for (let k = 0; k < P.length; k++) m = Math.min(m, seg(p, P[k], P[(k + 1) % P.length]));
    return m;
  };
  const out = {};
  for (const [axis, ax] of [["x", 0], ["y", 1]]) {
    let worst = 0, at = null, paired = 0, unpaired = 0;
    for (const c of throat.cells) {
      const g = ctr.get(c.label);
      // the partner is the cell whose centroid is this one's mirror image
      let best = null, bd = Infinity;
      for (const o of throat.cells) {
        const h = ctr.get(o.label);
        const dx = (ax === 0 ? -g[0] : g[0]) - h[0], dy = (ax === 1 ? -g[1] : g[1]) - h[1];
        const d = Math.hypot(dx, dy);
        if (d < bd) { bd = d; best = o.label; }
      }
      if (!best || bd > 1e-3) { unpaired++; continue; }
      paired++;
      const A = secs.get(c.label), B = secs.get(best);
      for (let q = 0; q < A.length; q += every) {
        for (const p of A[q].pts) {
          const m = [p[0], p[1], p[2]];
          m[ax] = -m[ax];
          const d = toRing(m, B[q].pts);
          if (d > worst) { worst = d; at = { cell: c.label, partner: best, q }; }
        }
      }
    }
    out[axis] = { worst, at, paired, unpaired };
  }
  return out;
}

// The material, in two forms.
//
// ONE BLANK AND ONE CUTTER PER CELL. Two recipes, and which one is emitted
// depends on whether the blanks are extended past their end faces:
//
//   plain (extend 0): N independent subtractions, cutter i out of blank i,
//     giving N separate cell shells. Nothing is unioned, so nothing can fail
//     — but the shells are separate parts.
//   extended (the default): the blanks run past both end faces and two TRIM
//     solids come with them. UNION the N blanks, SUBTRACT the two trims,
//     SUBTRACT the N cutters. The union no longer touches either end plane,
//     which is where 54 of the measured degeneracies lived (27 coplanar
//     throat caps, 27 co-surface mouth caps), and the two cuts that restore
//     those faces exactly are subtractions.
//
// The union of PLAIN blanks is ill-posed and is not offered: adjacent blanks
// overlap near both ends and stand apart mid-path, so every neighbouring pair
// passes through exact tangential contact twice (measured, all 27 pairs, at
// u = 0.056-0.125, u ~ 0.30 and u = 0.970-0.976), and they carry near-copies
// of each other's faces besides. `stations` is what makes the extended union
// tractable; see its comment above.
export function buildShellSTEP(throat, map, {
  t = 0, wall = 3, ext = 3, cutterExt = 1, extend = true, stations = 32,
  extendThroat = null, extendMouth = null, trimThroat = null, trimMouth = null,
  only = null, xSide = 0, ySide = 0, params = null, folders = true,
  name = "ginkgo_horn_shell",
} = {}) {
  if (!map) return null;
  // THE TWO ENDS ARE SEPARABLE, and they are not the same problem. `extend`
  // still sets both at once; the four per-end flags override it.
  //   MOUTH: the trim's cutting face is the APERTURE ITSELF, a curved surface
  //     the blanks cross transversally. It has never been reported failing.
  //   THROAT: the trim's cutting face is the PLANE z = 0 — and a plane split
  //     at z = 0 is exactly the operation the owner measured failing on
  //     individual blanks. Turning the throat extension off makes that face by
  //     the loft's own end ring, which is planar in z = 0 by construction, and
  //     asks the kernel for no cut there at all. The price is the coplanar
  //     overlapping throat caps (27 of 27 adjacent pairs) that the extension
  //     was introduced to remove.
  // A trim with no extension behind it would cut into the real body, so it is
  // refused rather than shipped: `trims` reports what was actually emitted.
  const eT = extendThroat === null ? extend : !!extendThroat;
  const eM = extendMouth === null ? extend : !!extendMouth;
  const tT = (trimThroat === null ? eT : !!trimThroat) && eT;
  const tM = (trimMouth === null ? eM : !!trimMouth) && eM;
  const surf = map.mouthSurf || null;
  const ap = surf ? apertureFrame(surf) : null;
  const capOf = (sections) => (ap ? apertureCapGrid(sections[sections.length - 1].pts, ap) : null);
  // `only` is the two-cell test and ships no trims; a symmetry REGION is a
  // real export and keeps them, sized from the whole horn so the trims of a
  // half and of the full kit are the same two solids.
  const region = (xSide || ySide) && !only ? symmetryRegion(throat, { xSide, ySide }) : null;
  const sel = only || (region ? region.labels : null);
  const cells = sel ? throat.cells.filter((c) => sel.includes(c.label)) : throat.cells;
  if (!cells.length) return null;
  const solidsSpec = [];
  let cutterExtUsed = 0;
  for (const cellRec of cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const duct = ductSections(cellRec, row, { t });
    // the mouth ring is snapped onto the aperture only when the trim is not
    // the thing that makes that face
    const blank = shellSections(cellRec, row, { t, wall, surf, stations, snapMouth: !eM });
    if (!duct || !blank) return null;
    // staggered per cell so no two adjacent blanks end on the same plane
    const e = ext * (1 + 0.4 * cellPhase5(cellRec.label));
    const sections = eT || eM ? extendSections(blank, e, { throat: eT, mouth: eM }) : blank;
    solidsSpec.push({
      label: `shell blank ${cellRec.label}`,
      group: "shell blanks",
      sections,
      capZ: eT ? -e : 0,
      ...(eM ? {} : { capMouthPts: capOf(blank) }),
    });
    // THE CUTTER IS NOT EXTENDED AT THE THROAT AT ALL, and that is a physical
    // argument rather than a saving.
    //
    // WHAT AN EXTENSION IS FOR is punching through a cap the blank fills
    // differently from the duct — the MEMBRANE case. At the throat there is
    // no such difference to punch: the duct's throat ring and the blank's are
    // both planar in z = 0 (the blank is an offset of a planar ring in its own
    // best-fit plane, which is that plane), and a Coons blend of boundary
    // curves that all lie in one plane lies in that plane. Measured over all
    // 18 cells, worst |z| off z = 0: duct cap 0.00e+0 mm, blank cap 0.00e+0.
    // The two fills are the same plane, so the subtraction has nothing to
    // reach past and an extension buys exactly nothing there.
    //
    // WHAT IT COSTS IS A FOLDED WALL. `extendSections` prepends ONE ring and
    // `ductBrep` interpolates with a UNIFORM parameterisation, so a short
    // first gap followed by a full station step is told the two are equal and
    // the cubic overshoots BACKWARDS through the cap it was meant to close —
    // the mechanism already recorded for the blank, which bites the cutter far
    // harder because the cutter runs at the MAP's station count, not the
    // shell's. Measured at 6x3, 64 stations (duct step 4.87 mm), as the
    // distance the wall travels back OUT while the parameter walks IN:
    //   ext         0.5     1.0     1.5     2.0     3.0  mm
    //   ext/step   0.101   0.202   0.302   0.403   0.605
    //   throat     0.418   0.154   0.000   0.000   0.000  mm
    //   mouth      0.428   0.161   0.002   0.000   0.000  mm
    // So the threshold is the same ~0.4 of a station step as the blank's, and
    // a 1 mm extension sits well inside it at both ends. Owner-reported from
    // CAD: the cutter's side walls fold back on themselves before reaching the
    // extended face, and putting the cutter IN PLANE with the blank at the
    // throat took a subtraction from failing to succeeding.
    //
    // AT THE MOUTH THE MEMBRANE IS REAL — the aperture is curved, so the
    // duct's Coons cap does sag behind it (0.018 mm at 90x40, 0.038 at 90x60)
    // — so that end keeps an extension. It is sized FROM THE STATION STEP
    // rather than fixed in mm, because the threshold is a ratio: a fixed
    // 1 mm is 0.20 of a step at 64 export stations and 0.10 at 32, so any
    // constant that clears the fold at one count folds at another.
    // `cutterExt` is therefore the MINIMUM protrusion (the sag it must clear),
    // and half a station step is the floor that keeps the loft monotone.
    let stepSum = 0;
    for (let q = 1; q < duct.length; q++) {
      const A = duct[q - 1].pts, B = duct[q].pts;
      let d = 0;
      for (let k = 0; k < A.length; k++)
        d += Math.hypot(B[k][0] - A[k][0], B[k][1] - A[k][1], B[k][2] - A[k][2]) / A.length;
      stepSum += d;
    }
    const cutE = Math.max(cutterExt, 0.5 * (stepSum / Math.max(1, duct.length - 1)));
    cutterExtUsed = Math.max(cutterExtUsed, cutE);
    solidsSpec.push({
      label: `duct cutter ${cellRec.label}`,
      group: "duct cutters",
      sections: extendSections(duct, cutE, { throat: false, mouth: true }),
      capZ: 0,
    });
  }
  const n = cells.length;
  const trims = [];
  if (!only && (tT || tM)) {
    if (tT) {
      const tr = throatTrimSections(throat, map, { t, wall, ext: ext * 3, per: 8 });
      if (!tr) return null;
      solidsSpec.push({ label: "throat trim", group: "trim solids", sections: tr, capZ: tr[0].pts[0][2] });
      trims.push("throat trim");
    }
    if (tM) {
      const mo = mouthTrimSections(throat, map, { t, wall, ext: ext * 3, per: 8 });
      if (!mo) return null;
      solidsSpec.push({ label: "mouth trim", group: "trim solids", sections: mo, capMouthPts: capOf(mo) });
      trims.push("mouth trim");
    }
  }
  const ends = eT && eM ? "both end faces" : eT ? "the throat face" : eM ? "the mouth face" : null;
  const cutBack = trims.length ? `subtract ${trims.map((x) => `'${x}'`).join(" and ")}, then ` : "";
  const recipe = ends
    ? (only
      ? `union the ${n} blanks (they are extended past ${ends}; a full export ships the trim solid(s) that cut them back)`
      : `union the ${n} 'shell blank' solids (extended past ${ends}), then ${cutBack}subtract the ${n} 'duct cutter' solids`)
    : `subtract each 'duct cutter' from the 'shell blank' of the same cell — ${n} independent subtractions, no unions`;
  const out = stepEmit({
    name, solidsSpec, folders,
    params: params ? `ginkgo settings: ${params}` : `ginkgo shell settings: t=${t} wall=${wall} ext=${ext} cutterExtMouth=${+cutterExtUsed.toFixed(3)} cutterExtThroat=0 extendThroat=${eT} extendMouth=${eM} trimThroat=${tT} trimMouth=${tM} stations=${stations} xSide=${xSide} ySide=${ySide}`,
    desc: "ginkgo multicell horn shell: one blank and one cutter per cell",
    fileDesc: `ginkgo multicell horn shell kit: ${recipe}${
      folders ? "; the solids are filed into folders by role, each named for its cell, all at the identity transform" : ""}`,
  });
  if (out) {
    out.mode = eT || eM ? "extended" : "cells";
    out.cells = n;
    out.trims = trims.length;
    out.trimNames = trims;
    out.ends = { throat: eT, mouth: eM };
    // the cutter's mouth extension actually used — it is the larger of the
    // requested minimum and half a station step, so it is not `cutterExt`
    out.cutterExtMouth = cutterExtUsed;
    out.region = region;
    // how the file is organised for the reader: how many folders the product
    // tree carries and how many named parts sit inside them
    out.tree = out.checks.tree;
  }
  return out;
}

// How much of one blank's surface runs as a near-copy of its neighbour's.
// Two adjacent cells share a grid line, so on their other sides both blanks
// offset the SAME curve by the SAME distance: the identical surface computed
// twice, differing only by the two cells' best-fit planes. Measured without
// 37 mm of arc inside 10 um and 172 mm inside 50 um over 27 pairs, with the
// two surfaces closing to 0.4 um. A kernel's linear tolerance is around
// 1 um, so that is not a shape it can resolve, and it is invisible at any
// zoom — which is why it has to be MEASURED and reported rather than looked
// for. The per-parity `jitter` that used to remove it was withdrawn on the
// owner's CAD evidence (it changed no boolean outcome), so this is now a
// standing property of every kit rather than a knob's readout. Sampled every
// `every` stations to stay cheap enough to run on every export.
export function shellCoincidence(throat, map, { t = 0, wall = 3, stations = null, eps = 0.05, every = 4 } = {}) {
  const surf = map.mouthSurf || null;
  const B = new Map();
  for (const c of throat.cells) {
    const row = map.rows.find((r) => r.id === c.id);
    if (!row) return null;
    const b = shellSections(c, row, { t, wall, surf, stations, snapMouth: false });
    if (!b) return null;
    B.set(c.label, b);
  }
  const seg = (p, A, Bb) => {
    const ab = [Bb[0] - A[0], Bb[1] - A[1], Bb[2] - A[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-12;
    let u = ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / L2;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(p[0] - A[0] - ab[0] * u, p[1] - A[1] - ab[1] * u, p[2] - A[2] - ab[2] * u);
  };
  const toPoly = (p, P) => { let m = Infinity; for (let k = 0; k < P.length; k++) m = Math.min(m, seg(p, P[k], P[(k + 1) % P.length])); return m; };
  const S = B.get(throat.cells[0].label).length;
  let arc = 0, worst = 0, pairs = 0;
  for (const c of throat.cells) {
    const [col, rw] = c.label.split(",").map(Number);
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const nb = `${col + dc},${rw + dr}`;
      if (!B.has(nb)) continue;
      pairs++;
      const A = B.get(c.label), D = B.get(nb);
      for (let q = 0; q < S; q += every) {
        const P = A[q].pts, Q = D[q].pts;
        let L = 0;
        for (let k = 0; k < P.length; k++) {
          const a = P[k], b = P[(k + 1) % P.length];
          if (toPoly(a, Q) < eps && toPoly(b, Q) < eps) L += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        }
        arc += L; worst = Math.max(worst, L);
      }
    }
  }
  return { arc, worst, pairs, eps, sampled: Math.ceil(S / every) };
}

// ── THE TRIM SOLIDS ────────────────────────────────────────────────────────
//
// Every blank's throat ring is planar in z = 0 and every mouth ring lies on
// the one aperture, so adjacent blanks meet with COPLANAR and CO-SURFACE
// OVERLAPPING end caps — measured 27 of 27 pairs at each end. Both are
// properties the owner asked for and both are boolean-hostile. The fix is
// not to give them up: build the blanks running PAST both ends, union them
// where nothing is coincident, and cut the two end faces afterwards with a
// subtraction — the operation that has never failed in the owner's CAD.
//
// The extension is a PREPENDED RING, not a face offset. That distinction is
// measured: offsetting a blank's throat face by +1 mm succeeded in CAD and
// +2 mm failed, because a face offset EXTRAPOLATES the four wall surfaces
// past their parameter range and re-intersects them, and the corner identity
// (adjacent walls sharing control-point columns) holds only INSIDE the
// domain. `extendSections` adds real geometry to the loft instead, which is
// why the cutters have never failed. Never ask CAD to offset our faces.
//
// The extension length is staggered per cell on the five-phase index, so the
// extended caps do not simply move the coplanar problem from z = 0 to
// z = -ext: any two orthogonally adjacent cells end on different planes.

// A slab occupying everything below the throat plane, to cut the extended
// blanks back to z = 0 exactly. Four stations so the loft's v-interpolation
// is well posed; a rectangle wide enough to clear the throat end of the horn.
export function throatTrimSections(throat, map, { t = 0, wall = 3, ext = 3, per = 8, pad = 10 } = {}) {
  let rMax = 0;
  for (const cellRec of throat.cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const d = ductSections(cellRec, row, { t });
    if (!d) return null;
    for (const p of d[0].pts) rMax = Math.max(rMax, Math.hypot(p[0], p[1]));
  }
  const h = rMax + wall + pad;
  const ring = (z) => {
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const out = [];
    for (let sd = 0; sd < 4; sd++) {
      const a = corners[sd], b = corners[(sd + 1) % 4];
      for (let k = 0; k < per; k++) out.push([a[0] + ((b[0] - a[0]) * k) / per, a[1] + ((b[1] - a[1]) * k) / per, z]);
    }
    return out;
  };
  const z0 = -(ext + pad);
  const out = [];
  for (let i = 0; i <= 3; i++) {
    const z = z0 + ((0 - z0) * i) / 3, pts = ring(z);
    out.push({ s: i / 3, area: polyArea3(pts), pts, origin: [0, 0, z] });
  }
  return out;
}

// A slab occupying everything beyond the aperture, to cut the extended
// blanks back onto the aperture surface exactly. Its far face is the
// aperture patch translated in +z; its near face is the aperture patch
// ITSELF, emitted through `apertureCapGrid` so the cut lands on the analytic
// surface rather than on a chord across it. The parametric domain is taken
// from where the blanks actually reach, plus a margin.
export function mouthTrimSections(throat, map, { t = 0, wall = 3, ext = 3, per = 8, pad = 12, thick = 40 } = {}) {
  const surf = map.mouthSurf;
  if (!surf) return null;
  const ap = apertureFrame(surf);
  let aMax = 0, eMax = 0;
  for (const cellRec of throat.cells) {
    const row = map.rows.find((r) => r.id === cellRec.id);
    if (!row) continue;
    const b = shellSections(cellRec, row, { t, wall, surf, snapMouth: false });
    if (!b) return null;
    for (const p of b[b.length - 1].pts) {
      const pr = ap.param(p);
      if (!pr.ok) return null;
      aMax = Math.max(aMax, Math.abs(pr.a)); eMax = Math.max(eMax, Math.abs(pr.e));
    }
  }
  // the margin is angular where the axis is curved and linear where it is
  // flat (an infinite radius makes the parameter the coordinate itself)
  const fH = isFinite(surf.rH), fV = isFinite(surf.rV);
  const dA = fH ? (wall + ext + pad) / surf.rH : wall + ext + pad;
  const dE = fV ? (wall + ext + pad) / surf.rV : wall + ext + pad;
  const A = aMax + dA, E = eMax + dE;
  const corners = [[-A, -E], [A, -E], [A, E], [-A, E]];
  const ring = (dz) => {
    const out = [];
    for (let sd = 0; sd < 4; sd++) {
      const c0 = corners[sd], c1 = corners[(sd + 1) % 4];
      for (let k = 0; k < per; k++) {
        const u = k / per;
        const P = ap.at(c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u);
        out.push([P[0], P[1], P[2] + dz]);
      }
    }
    return out;
  };
  // ordered FAR first so the aperture patch is the last section, which is
  // the one stepEmit caps with capMouthPts
  const out = [];
  for (let i = 0; i <= 3; i++) {
    const dz = thick * (1 - i / 3), pts = ring(dz);
    out.push({ s: i / 3, area: polyArea3(pts), pts, origin: [0, 0, dz] });
  }
  return out;
}

export function stepIntegrity(text) {
  const defined = new Set();
  for (const m of text.matchAll(/^#(\d+)=/gm)) defined.add(m[1]);
  let missing = 0, refs = 0;
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (!line.startsWith("#") || eq < 0) continue;
    for (const m of line.slice(eq).matchAll(/#(\d+)/g)) {
      refs++;
      if (!defined.has(m[1])) missing++;
    }
  }
  return { entities: defined.size, refs, missing, ok: missing === 0 };
}
