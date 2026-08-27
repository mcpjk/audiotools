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
// Three topologies, all reduced to the same cell record so everything
// downstream is family-agnostic:
//
//   ogrid      concentric rings          no singular vertices
//   hgrid      one (i,j) index on the disc   4 singular vertices, on the rim
//   butterfly  square core + 4 fan blocks    4 singular vertices, at the core
//
// A singular vertex is one where the number of cells meeting is not 4. Mapping
// a rectangular index onto a disc cannot avoid them — this is a fact about the
// disc, not a layout failure.
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
const v2 = (x, y) => [x, y];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
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

// ═══════════════════════════════════════════════════════════════════════════
// BESSEL — for the closed-form disc and circular-sector modes
// ═══════════════════════════════════════════════════════════════════════════
// Needed because a pie-slice cell is one of the few shapes whose first mode is
// known exactly, and the exact answer is the one the spec's test vectors quote
// (any pure-sector layout with N >= 6 caps at the disc's radial mode, because
// a radial cut lies along a nodal line of that mode and cannot remove it).

function gammaLn(z) {
  // Lanczos, g = 7, n = 9. Good to ~15 significant figures for z > 0.
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
  z -= 1;
  let x = g[0];
  for (let i = 1; i < 9; i++) x += g[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// J_nu(x) by the ascending series. Argument here never exceeds ~25 (the first
// stationary point of J_nu sits near nu + 0.81 nu^(1/3)), where the series
// still holds 10+ digits in double precision.
export function besselJ(nu, x) {
  if (x === 0) return nu === 0 ? 1 : 0;
  let sum = 0;
  const half = x / 2;
  for (let k = 0; k < 200; k++) {
    const lt = (2 * k + nu) * Math.log(half) - gammaLn(k + 1) - gammaLn(k + nu + 1);
    const term = (k % 2 ? -1 : 1) * Math.exp(lt);
    sum += term;
    if (k > nu + 5 && Math.abs(term) < 1e-18 * Math.max(Math.abs(sum), 1e-30)) break;
  }
  return sum;
}

// dJ_nu/dx = (J_(nu-1) - J_(nu+1)) / 2
export const besselJp = (nu, x) => 0.5 * (besselJ(nu - 1, x) - besselJ(nu + 1, x));

// First positive root of J'_nu. McMahon-style start, then bisection — robust
// beats fast here, this is called a handful of times per layout.
export function besselJPrimeZero(nu) {
  if (nu === 0) return 3.8317059702075123;
  if (Math.abs(nu - 1) < 1e-12) return 1.8411837813406593;
  const guess = nu + 0.8086165 * Math.cbrt(nu) + 0.072490 / Math.cbrt(nu);
  let lo = Math.max(nu * 0.9, 1e-6), hi = guess * 1.6 + 2;
  // walk out from just above nu, where J'_nu is positive, to the first sign change
  let a = nu > 0 ? nu + 1e-6 : 1e-6;
  let fa = besselJp(nu, a);
  const step = Math.max(0.02, guess / 200);
  for (let x = a + step; x < hi; x += step) {
    const fx = besselJp(nu, x);
    if (fa * fx <= 0) { lo = x - step; hi = x; break; }
    fa = fx;
  }
  for (let i = 0; i < 100; i++) {
    const m = 0.5 * (lo + hi);
    if (besselJp(nu, lo) * besselJp(nu, m) <= 0) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESH — nodes, edges, cells
// ═══════════════════════════════════════════════════════════════════════════
//
// node  { key, kind, x, y, th }
//         kind "free"  → x,y are two DOF
//         kind "rim"   → th is one DOF, position is R(cos th, sin th)
//         kind "fixed" → no DOF (the analytic O-grid)
//
// edge  { a, b, arc, bulge }
//         arc { r, sign } → a circular arc of radius r about the origin;
//                           sign +1 means a→b runs counterclockwise.
//         otherwise      → a quadratic Bezier whose control point is the
//                          chord midpoint plus `bulge` (two DOF). bulge = 0
//                          is exactly the straight segment, so a straight-edge
//                          layout is the same code path with the knobs at zero.
//
// cell  { sides: [side0..side3], kind, ... }  where a side is a list of
//         { e, rev } — a list, not a single edge, because an O-grid ring cell's
//         outer boundary is cut into pieces by the next ring's radial dividers
//         while remaining one arc geometrically. Opposing sides are 0/2 and
//         1/3, which is what the first-mode model consumes.

const modPos = (a, m) => ((a % m) + m) % m;
const polar = (th) => [Math.cos(th), Math.sin(th)];

export function makeMesh(R) {
  return { R, nodes: [], edges: [], cells: [], nodeKey: new Map(), edgeKey: new Map() };
}

export function addNode(mesh, key, spec) {
  if (mesh.nodeKey.has(key)) return mesh.nodeKey.get(key);
  const i = mesh.nodes.length;
  mesh.nodes.push({ key, ...spec });
  mesh.nodeKey.set(key, i);
  return i;
}

// Returns { e, rev } so a caller can walk a boundary without caring which
// direction the edge was first created in.
export function addEdge(mesh, ka, kb, spec = {}) {
  const a = mesh.nodeKey.get(ka), b = mesh.nodeKey.get(kb);
  // An arc's key carries its own midpoint. Two points on a circle bound TWO
  // distinct arcs, and keying on the node pair alone silently merged them —
  // the second came back reversed, so a cell bounded by both reported zero
  // area while the layout still summed to the disc. The midpoint also keeps a
  // genuinely shared arc shared, which is what dividerTotal counts on.
  let k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (spec.arc) {
    const A = nodeXY(mesh, a), B = nodeXY(mesh, b);
    const t0 = Math.atan2(A[1], A[0]), t1 = Math.atan2(B[1], B[0]);
    const d = spec.arc.sign > 0 ? modPos(t1 - t0, TAU) : -modPos(t0 - t1, TAU);
    k += `|arc@${modPos(t0 + d / 2, TAU).toFixed(6)}`;
  }
  if (mesh.edgeKey.has(k)) {
    const ei = mesh.edgeKey.get(k);
    return { e: ei, rev: mesh.edges[ei].a !== a };
  }
  const ei = mesh.edges.length;
  mesh.edges.push({ a, b, arc: spec.arc || null, bulge: [0, 0], rim: !!spec.rim });
  mesh.edgeKey.set(k, ei);
  return { e: ei, rev: false };
}

export function nodeXY(mesh, i) {
  const n = mesh.nodes[i];
  if (n.kind === "rim") return [mesh.R * Math.cos(n.th), mesh.R * Math.sin(n.th)];
  // A ring node carries no freedom of its own: every node on ring k shares one
  // radius, so the O-grid keeps its ring structure while still being able to
  // equalise OPEN area — which it cannot do with fixed radii, because rings at
  // different radii lose different amounts to the same wall thickness.
  if (n.kind === "ring") {
    const r = mesh.ringR[n.ringIdx];
    return [r * Math.cos(n.th), r * Math.sin(n.th)];
  }
  return [n.x, n.y];
}

// Signed sweep of an arc edge, a→b, honouring the stored direction.
function arcSweep(mesh, ei) {
  const e = mesh.edges[ei];
  const A = nodeXY(mesh, e.a), B = nodeXY(mesh, e.b);
  const t0 = Math.atan2(A[1], A[0]), t1 = Math.atan2(B[1], B[0]);
  const d = e.arc.sign > 0 ? modPos(t1 - t0, TAU) : -modPos(t0 - t1, TAU);
  const r = e.arc.ringIdx != null ? mesh.ringR[e.arc.ringIdx] : e.arc.r;
  return { t0, dth: d, r };
}

// Quadratic Bezier control points of a non-arc edge.
export function edgeBez(mesh, ei) {
  const e = mesh.edges[ei];
  const P0 = nodeXY(mesh, e.a), P2 = nodeXY(mesh, e.b);
  const P1 = [(P0[0] + P2[0]) / 2 + e.bulge[0], (P0[1] + P2[1]) / 2 + e.bulge[1]];
  return [P0, P1, P2];
}

const bezAt = (P, t) => {
  const u = 1 - t;
  return [
    u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0],
    u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1],
  ];
};
const bezD = (P, t) => [
  2 * ((1 - t) * (P[1][0] - P[0][0]) + t * (P[2][0] - P[1][0])),
  2 * ((1 - t) * (P[1][1] - P[0][1]) + t * (P[2][1] - P[1][1])),
];

// Green's theorem contribution of one edge, traversed a→b:
//   (1/2) integral (x dy - y dx)
// Exact for both edge types: R^2 dth/2 for an arc, and a degree-3 polynomial
// in t for a quadratic Bezier, which GL8 integrates exactly.
// Edge integrals are cached and invalidated per DOF. The equal-area solve
// perturbs one DOF at a time to build its Jacobian, and only the two-to-four
// edges touching that DOF actually change; without the cache the solve
// re-integrates the whole cell boundary for every column and the tool goes
// from crisp to sluggish on a slider drag.
export function edgeAreaInt(mesh, ei) {
  if (mesh.eValid[ei] & 1) return mesh.eA[ei];
  const v = edgeAreaIntRaw(mesh, ei);
  mesh.eA[ei] = v; mesh.eValid[ei] |= 1;
  return v;
}

export function edgeLength(mesh, ei) {
  if (mesh.eValid[ei] & 2) return mesh.eL[ei];
  const v = edgeLengthRaw(mesh, ei);
  mesh.eL[ei] = v; mesh.eValid[ei] |= 2;
  return v;
}

function edgeAreaIntRaw(mesh, ei) {
  const e = mesh.edges[ei];
  if (e.arc) { const { dth, r } = arcSweep(mesh, ei); return 0.5 * r * r * dth; }
  const P = edgeBez(mesh, ei);
  let s = 0;
  for (let q = 0; q < 8; q++) {
    const t = GL8_X[q], p = bezAt(P, t), d = bezD(P, t);
    s += GL8_W[q] * (p[0] * d[1] - p[1] * d[0]);
  }
  return 0.5 * s;
}

function edgeLengthRaw(mesh, ei) {
  const e = mesh.edges[ei];
  if (e.arc) { const { dth, r } = arcSweep(mesh, ei); return r * Math.abs(dth); }
  const P = edgeBez(mesh, ei);
  let s = 0;
  for (let q = 0; q < 8; q++) s += GL8_W[q] * len2(bezD(P, GL8_X[q]));
  return s;
}

export function edgePoint(mesh, ei, s) {
  const e = mesh.edges[ei];
  if (e.arc) {
    const { t0, dth, r } = arcSweep(mesh, ei);
    const th = t0 + s * dth;
    return [r * Math.cos(th), r * Math.sin(th)];
  }
  return bezAt(edgeBez(mesh, ei), s);
}

// Smallest radius of curvature along an edge. A straight edge returns
// Infinity; an arc returns its own radius.
export function edgeMinCurvR(mesh, ei) {
  const e = mesh.edges[ei];
  if (e.arc) return arcSweep(mesh, ei).r;
  const P = edgeBez(mesh, ei);
  const D2 = [2 * (P[0][0] - 2 * P[1][0] + P[2][0]), 2 * (P[0][1] - 2 * P[1][1] + P[2][1])];
  let best = Infinity;
  for (let q = 0; q <= 8; q++) {
    const d = bezD(P, q / 8);
    const k = Math.abs(cross2(d, D2)) / Math.pow(len2(d), 3);
    if (k > 1e-12) best = Math.min(best, 1 / k);
  }
  return best;
}

// ── cells ──────────────────────────────────────────────────────────────────
export function addCell(mesh, sides, spec) {
  mesh.cells.push({ sides, ...spec });
  return mesh.cells.length - 1;
}

export function cellArea(mesh, ci) {
  const cell = mesh.cells[ci];
  let A = 0;
  for (const side of cell.sides)
    for (const { e, rev } of side) A += (rev ? -1 : 1) * edgeAreaInt(mesh, e);
  return A;
}

export function sideLength(mesh, side) {
  let L = 0;
  for (const { e } of side) L += edgeLength(mesh, e);
  return L;
}

export function cellPolygon(mesh, ci, per = 10) {
  const cell = mesh.cells[ci];
  const pts = [];
  for (const side of cell.sides)
    for (const { e, rev } of side)
      for (let q = 0; q < per; q++) {
        const s = q / per;
        pts.push(edgePoint(mesh, e, rev ? 1 - s : s));
      }
  return pts;
}

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

// ═══════════════════════════════════════════════════════════════════════════
// DEGREES OF FREEDOM
// ═══════════════════════════════════════════════════════════════════════════
// Interior node → 2 (free in the plane). Rim node → 1 (arc parameter on the
// circle; the rim outline itself is never a variable). Interior edge → 2 more
// when curvature is enabled, being the control-point offset from the chord
// midpoint.
//
// For a 6x3 H-grid with straight edges that is 10 interior nodes x 2 plus 18
// rim nodes x 1 = 38 DOF, against 18 cells minus one dependent total = 17
// independent area constraints. Residual 21. Turning on per-edge curvature
// adds 27 interior edges x 2 = 54, for 92. This count is the honest answer to
// "how much curvature freedom is there", so the tool prints it.

// The two comparison families are solved on node positions and ring radii only.
// Per-edge control points are gone with the stream-function flow they existed to
// carry: the H-grid gets its curvature from the line coefficients now, and an
// O-grid ring divider is a cone of revolution, not a free curve. Edges keep a
// `bulge` field, always zero, so one quadratic-Bezier code path still serves
// both straight segments and anything a future family needs.
export function finalizeMesh(mesh) {
  const dof = [];
  const ringNodes = new Map();
  mesh.nodes.forEach((n, i) => {
    if (n.kind === "free") { dof.push({ t: "x", i }); dof.push({ t: "y", i }); }
    else if (n.kind === "rim") dof.push({ t: "th", i });
    else if (n.kind === "ring") {
      if (!ringNodes.has(n.ringIdx)) ringNodes.set(n.ringIdx, []);
      ringNodes.get(n.ringIdx).push(i);
    }
  });
  [...ringNodes.keys()].sort((a, b) => a - b).forEach((k) => {
    dof.push({ t: "ring", i: k, nodes: ringNodes.get(k) });
  });
  mesh.nInteriorEdges = 0;
  mesh.edges.forEach((e) => { if (!e.arc) mesh.nInteriorEdges++; });
  mesh.dof = dof;

  // which cells each node / edge touches, so a finite-difference column only
  // recomputes the cells that can actually move
  const nodeCells = mesh.nodes.map(() => new Set());
  const edgeCells = mesh.edges.map(() => new Set());
  mesh.cells.forEach((cell, ci) => {
    for (const side of cell.sides)
      for (const { e } of side) {
        edgeCells[e].add(ci);
        nodeCells[mesh.edges[e].a].add(ci);
        nodeCells[mesh.edges[e].b].add(ci);
      }
  });
  mesh.dofCells = dof.map((d) => {
    if (d.t === "bx" || d.t === "by") return [...edgeCells[d.i]];
    if (d.t === "ring") {
      const s2 = new Set();
      d.nodes.forEach((ni) => nodeCells[ni].forEach((ci) => s2.add(ci)));
      return [...s2];
    }
    return [...nodeCells[d.i]];
  });

  mesh.eA = new Float64Array(mesh.edges.length);
  mesh.eL = new Float64Array(mesh.edges.length);
  mesh.eValid = new Uint8Array(mesh.edges.length);
  const nodeEdges = mesh.nodes.map(() => []);
  mesh.edges.forEach((e, i) => { nodeEdges[e.a].push(i); nodeEdges[e.b].push(i); });
  mesh.dofEdges = dof.map((d) => {
    if (d.t === "bx" || d.t === "by") return [d.i];
    if (d.t === "ring") {
      const s2 = new Set();
      d.nodes.forEach((ni) => nodeEdges[ni].forEach((e) => s2.add(e)));
      return [...s2];
    }
    return nodeEdges[d.i];
  });

  // rim nodes in counterclockwise order, for the non-crossing test
  mesh.rimOrder = mesh.nodes
    .map((n, i) => (n.kind === "rim" ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => mesh.nodes[a].th - mesh.nodes[b].th);

  // per-cell list of the edges that are dividers rather than the exit wall
  mesh.cells.forEach((cell) => {
    const ds = [];
    for (const side of cell.sides)
      for (const { e } of side) if (!mesh.edges[e].rim) ds.push(e);
    cell.dividerEdges = ds;
  });
  return mesh;
}

export function getDOF(mesh) {
  return mesh.dof.map((d) => {
    if (d.t === "x") return mesh.nodes[d.i].x;
    if (d.t === "y") return mesh.nodes[d.i].y;
    if (d.t === "th") return mesh.nodes[d.i].th;
    if (d.t === "ring") return mesh.ringR[d.i];
    if (d.t === "bx") return mesh.edges[d.i].bulge[0];
    return mesh.edges[d.i].bulge[1];
  });
}

export const invalidateAll = (mesh) => mesh.eValid.fill(0);

// Set one DOF and invalidate only what it can have changed.
export function setDOF1(mesh, k, val) {
  const d = mesh.dof[k];
  if (d.t === "x") mesh.nodes[d.i].x = val;
  else if (d.t === "y") mesh.nodes[d.i].y = val;
  else if (d.t === "th") mesh.nodes[d.i].th = val;
  else if (d.t === "ring") mesh.ringR[d.i] = val;
  else if (d.t === "bx") mesh.edges[d.i].bulge[0] = val;
  else mesh.edges[d.i].bulge[1] = val;
  for (const e of mesh.dofEdges[k]) mesh.eValid[e] = 0;
}

export function setDOF(mesh, v) {
  invalidateAll(mesh);
  mesh.dof.forEach((d, k) => {
    if (d.t === "x") mesh.nodes[d.i].x = v[k];
    else if (d.t === "y") mesh.nodes[d.i].y = v[k];
    else if (d.t === "th") mesh.nodes[d.i].th = v[k];
    else if (d.t === "ring") mesh.ringR[d.i] = v[k];
    else if (d.t === "bx") mesh.edges[d.i].bulge[0] = v[k];
    else mesh.edges[d.i].bulge[1] = v[k];
  });
}

export const dofCount = (mesh) => mesh.dof.length;
export const constraintCount = (mesh) => Math.max(mesh.cells.length - 1, 0);

// ═══════════════════════════════════════════════════════════════════════════
// SQUARE-TO-DISC SEEDS
// ═══════════════════════════════════════════════════════════════════════════

// Elliptical grid map. Closed form, cheap, sends the square boundary exactly
// onto the circle — but its own corners land at 45 degrees whatever alpha is,
// and its rim division is not equal-arc. The corner placement is imposed
// afterwards by a transfinite (Coons) blend of the boundary displacement.
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
// ═══════════════════════════════════════════════════════════════════════════
// FAMILY 2 — O-GRID
// ═══════════════════════════════════════════════════════════════════════════
//
// Concentric rings, ring j carrying n_j equal angular cells. No singular
// vertices, but no rectangular index either — it is here as the reference the
// H-grid has to beat, computed analytically (equal geometric area by
// construction), so it carries no DOF and takes no part in the solve.

export function buildOGrid({ R, hubR = 0, rings, rotDeg = 0 }) {
  const rot = rotDeg * D2R;
  const N = rings.reduce((a, b) => a + b, 0);
  const k = rings.length;
  const radii = [hubR];
  let cum = 0;
  for (let j = 0; j < k; j++) {
    cum += rings[j];
    radii.push(Math.sqrt(hubR * hubR + (cum / N) * (R * R - hubR * hubR)));
  }
  radii[k] = R;

  const mesh = makeMesh(R);
  mesh.family = "ogrid";
  mesh.rings = rings; mesh.hubR = hubR;
  // ringR[j] is the radius of circle j. Interior circles get one DOF each; the
  // hub and the wall are pinned.
  mesh.ringR = radii.slice();
  Object.defineProperty(mesh, "radii", { get() { return mesh.ringR; }, enumerable: true });

  // Every circle carries the union of the divider angles of the ring inside it
  // and the ring outside it, so an arc is split exactly where a divider lands.
  const angsOn = [];
  for (let j = 0; j <= k; j++) {
    const s = new Set();
    const push = (n) => { for (let i = 0; i < n; i++) s.add(modPos(rot + (TAU * i) / n, TAU)); };
    if (j > 0 && rings[j - 1] > 1) push(rings[j - 1]);
    if (j < k && rings[j] > 1) push(rings[j]);
    // A circle with no divider landing on it still has to exist as geometry.
    // Without this a full annulus (rings like 1+1+6) or a single undivided ring
    // produced a circle carrying no nodes at all, so the cell it bounds lost a
    // side and its area came out wrong while the total still closed.
    if (s.size < 2 && j > 0) push(2);
    angsOn.push([...s].sort((a, b) => a - b));
  }

  const nk = (j, a) => `c${j}_${a.toFixed(9)}`;
  const movable = (j) => j > 0 && j < k;
  const nodeAt = (j, a) => {
    const th = modPos(a, TAU), r = radii[j];
    return addNode(mesh, nk(j, th), movable(j)
      ? { kind: "ring", ringIdx: j, th }
      : { kind: "fixed", x: r * Math.cos(th), y: r * Math.sin(th) });
  };
  const originKey = "origin";

  // arcs of circle j between two angles, split at every node on that circle
  const arcSide = (j, a0, a1) => {
    const list = angsOn[j];
    const out = [];
    if (!list.length) return out;
    const start = modPos(a0, TAU);
    let cur = start;
    const total = modPos(a1 - a0, TAU) || TAU;
    let acc = 0, guard = 0;
    while (acc < total - 1e-9 && guard++ < 512) {
      let next = null, best = Infinity;
      for (const a of list) {
        const d = modPos(a - cur, TAU);
        if (d > 1e-9 && d < best) { best = d; next = a; }
      }
      if (next === null) break;
      if (acc + best > total + 1e-9) best = total - acc, next = modPos(cur + best, TAU);
      nodeAt(j, cur); nodeAt(j, next);
      out.push(addEdge(mesh, nk(j, modPos(cur, TAU)), nk(j, modPos(next, TAU)),
        { arc: { r: radii[j], ringIdx: movable(j) ? j : null, sign: 1 }, rim: j === k }));
      acc += best; cur = modPos(next, TAU);
    }
    return out;
  };

  const rev = (h) => ({ e: h.e, rev: !h.rev });
  let id = 0;
  for (let j = 0; j < k; j++) {
    const n = rings[j];
    const dphi = TAU / n;
    if (j === 0 && n === 1 && hubR === 0) {
      // the central cell is a disc, not a quadrilateral
      addCell(mesh, [arcSide(1, rot, rot)], { kind: "disc", ringIdx: 1, i: 0, j: 0, label: `${++id}` });
      continue;
    }
    for (let i = 0; i < n; i++) {
      const a0 = rot + dphi * i, a1 = a0 + dphi;
      const outer = arcSide(j + 1, a0, a1);
      const inner = radii[j] > 0 ? arcSide(j, a0, a1) : [];
      let rad0, rad1;
      if (n === 1 && j > 0) {
        // a full annulus has no radial divider at all
        addCell(mesh, [[], outer, [], inner.map(rev).reverse()], {
          kind: "quad", ring: j, i, j: 0, label: `${++id}`,
        });
        continue;
      }
      if (radii[j] > 0) {
        nodeAt(j, a0); nodeAt(j, a1); nodeAt(j + 1, a0); nodeAt(j + 1, a1);
        rad0 = addEdge(mesh, nk(j, modPos(a0, TAU)), nk(j + 1, modPos(a0, TAU)), {});
        rad1 = addEdge(mesh, nk(j, modPos(a1, TAU)), nk(j + 1, modPos(a1, TAU)), {});
      } else {
        addNode(mesh, originKey, { kind: "fixed", x: 0, y: 0 });
        nodeAt(j + 1, a0); nodeAt(j + 1, a1);
        rad0 = addEdge(mesh, originKey, nk(j + 1, modPos(a0, TAU)), {});
        rad1 = addEdge(mesh, originKey, nk(j + 1, modPos(a1, TAU)), {});
      }
      // counterclockwise: out along a0, round the outer arc, back along a1,
      // then back round the inner arc
      addCell(mesh, [[rad0], outer, [rev(rad1)], inner.map(rev).reverse()], {
        kind: radii[j] > 0 ? "quad" : "sector",
        sectorRing: j + 1, sectorBeta: dphi,
        ring: j, i, j: 0, label: `${++id}`,
      });
    }
  }
  mesh.singular = [];
  return finalizeMesh(mesh, { bulge: false });
}

// ═══════════════════════════════════════════════════════════════════════════
// FAMILY 3 — BUTTERFLY
// ═══════════════════════════════════════════════════════════════════════════
//
// An m x m square core with four m x p fan blocks reaching the rim. The four
// singular vertices are the core corners, where three cells meet. N = m^2 + 4mp.
// Trades the H-grid's rim singularities — which sit right where the cells are
// most distorted — for interior ones in a region that is already well behaved.

export function buildButterfly({ R, m, p, alphaDeg = 45, coreFrac = 0.42 }) {
  const alpha = alphaDeg * D2R;
  const mesh = makeMesh(R);
  mesh.family = "butterfly";
  mesh.m = m; mesh.p = p; mesh.alphaDeg = alphaDeg;
  const cornerTh = [-alpha, alpha, Math.PI - alpha, Math.PI + alpha];
  const ax = coreFrac * R * Math.cos(alpha), ay = coreFrac * R * Math.sin(alpha);

  const coreKey = (ci, cj) => `k${ci}_${cj}`;
  const corePos = (ci, cj) => [ax * (-1 + (2 * ci) / m), ay * (-1 + (2 * cj) / m)];
  for (let ci = 0; ci <= m; ci++)
    for (let cj = 0; cj <= m; cj++) {
      const pos = corePos(ci, cj);
      addNode(mesh, coreKey(ci, cj), { kind: "free", x: pos[0], y: pos[1] });
    }

  // fan f, inner index q along the core side it sits on
  const fanCore = (f, q) => (f === 0 ? [m, q] : f === 1 ? [m - q, m] : f === 2 ? [0, m - q] : [q, 0]);
  const rimTh = (f, q) => {
    const t0 = cornerTh[f], t1 = cornerTh[(f + 1) % 4] + (f === 3 ? TAU : 0);
    return t0 + ((t1 - t0) * q) / m;
  };
  const fanKey = (f, k, q) => {
    if (k === 0) { const [ci, cj] = fanCore(f, q); return coreKey(ci, cj); }
    if (k === p) return q === 0 ? `RC${f}` : q === m ? `RC${(f + 1) % 4}` : `RM${f}_${q}`;
    if (q === 0) return `D${f}_${k}`;
    if (q === m) return `D${(f + 1) % 4}_${k}`;
    return `F${f}_${k}_${q}`;
  };

  for (let f = 0; f < 4; f++)
    for (let k = 1; k <= p; k++)
      for (let q = 0; q <= m; q++) {
        const kk = fanKey(f, k, q);
        if (mesh.nodeKey.has(kk)) continue;
        const th = rimTh(f, q);
        const rimPt = [R * Math.cos(th), R * Math.sin(th)];
        // theta is kept unwrapped, running -alpha .. 2pi-alpha around the rim,
        // so the ordering test in the solver can just compare neighbours
        if (k === p) { addNode(mesh, kk, { kind: "rim", th }); continue; }
        const [ci, cj] = fanCore(f, q);
        const inner = corePos(ci, cj);
        const s = k / p;
        addNode(mesh, kk, { kind: "free", x: inner[0] + (rimPt[0] - inner[0]) * s, y: inner[1] + (rimPt[1] - inner[1]) * s });
      }

  const rev = (h) => ({ e: h.e, rev: !h.rev });
  const cu = [], cv = [];
  for (let ci = 0; ci < m; ci++) { cu.push([]); for (let cj = 0; cj <= m; cj++) cu[ci].push(addEdge(mesh, coreKey(ci, cj), coreKey(ci + 1, cj), {})); }
  for (let ci = 0; ci <= m; ci++) { cv.push([]); for (let cj = 0; cj < m; cj++) cv[ci].push(addEdge(mesh, coreKey(ci, cj), coreKey(ci, cj + 1), {})); }
  let id = 0;
  for (let ci = 0; ci < m; ci++)
    for (let cj = 0; cj < m; cj++)
      addCell(mesh, [[cu[ci][cj]], [cv[ci + 1][cj]], [rev(cu[ci][cj + 1])], [rev(cv[ci][cj])]],
        { kind: "quad", block: "core", i: ci, j: cj, label: `C${++id}` });

  for (let f = 0; f < 4; f++) {
    const qE = [], kE = [];
    for (let k = 0; k <= p; k++) {
      qE.push([]);
      for (let q = 0; q < m; q++)
        qE[k].push(addEdge(mesh, fanKey(f, k, q), fanKey(f, k, q + 1),
          k === p ? { arc: { r: R, sign: 1 }, rim: true } : {}));
    }
    for (let k = 0; k < p; k++) {
      kE.push([]);
      for (let q = 0; q <= m; q++) kE[k].push(addEdge(mesh, fanKey(f, k, q), fanKey(f, k + 1, q), {}));
    }
    // counterclockwise: outward along q, round in +q, back in, then -q
    for (let k = 0; k < p; k++)
      for (let q = 0; q < m; q++)
        addCell(mesh, [[kE[k][q]], [qE[k + 1][q]], [rev(kE[k][q + 1])], [rev(qE[k][q])]],
          { kind: "quad", block: `fan${f}`, i: k, j: q, label: `F${f}${k + 1}${q + 1}` });
  }
  mesh.singular = [0, 1, 2, 3].map((f) => {
    const [ci, cj] = f === 0 ? [m, 0] : f === 1 ? [m, m] : f === 2 ? [0, m] : [0, 0];
    return mesh.nodeKey.get(coreKey(ci, cj));
  });
  return finalizeMesh(mesh);
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2 — EQUALISE
// ═══════════════════════════════════════════════════════════════════════════
//
// Damped Gauss-Newton (Levenberg-Marquardt) on the node DOF against the area
// residuals, with a Tikhonov block pulling back toward the seed so the solver
// cannot wander into a contorted-but-technically-valid layout.
//
// Moser's construction and semi-discrete optimal transport are the textbook
// routes to the same place, and both are worth knowing about: Moser solves
// Laplacian(phi) = rho - 1 with Neumann data and flows along grad(phi)/(1 +
// t(rho-1)), giving exact equal areas at minimal L2 displacement from the
// seed; Aurenhammer-Hoffmann-Aronov guarantees a unique power diagram for any
// prescribed positive areas. Both need a background discretisation this tool
// does not otherwise carry, and for a grid this regular the direct Newton
// solve lands in the same place, so it is what the reported numbers come from.
//
// The achieved spread is always reported. Equality is a solver result here,
// not a property of the construction, and saying otherwise would hide the
// integrator's error.

export function cellOpenArea(mesh, ci, t) {
  const A = cellArea(mesh, ci);
  if (!t) return A;
  let P = 0;
  for (const e of mesh.cells[ci].dividerEdges) P += edgeLength(mesh, e);
  return A - (t / 2) * P;
}

const dofScale = (mesh, d) => (d.t === "th" ? 1 : mesh.R);


function areasVec(mesh, t) {
  return mesh.cells.map((_, ci) => cellOpenArea(mesh, ci, t));
}

function rimOrderOK(mesh, gapMin) {
  const o = mesh.rimOrder;
  if (o.length < 2) return true;
  for (let k = 0; k < o.length; k++) {
    const a = mesh.nodes[o[k]].th;
    const b = mesh.nodes[o[(k + 1) % o.length]].th + (k === o.length - 1 ? TAU : 0);
    if (b - a < gapMin) return false;
  }
  return true;
}

export function equaliseAreas(mesh, opts = {}) {
  const { t = 0, iters = 40, tikhonov = 0.02, tol = 1e-11, polish = true, w = null } = opts;
  const N = mesh.cells.length;
  if (!mesh.dof.length || N < 2) return { spread: areaSpread(mesh, t), iters: 0 };
  // Two phases. The first is anchored to the seed so the solver takes the
  // nearest equal-area layout rather than any equal-area layout; the second
  // drops the anchor and drives the residual the rest of the way down, which
  // is what makes "unchanged to solver tolerance" mean 1e-9 and not 1e-4.
  const a = lmEqualise(mesh, t, iters, tikhonov, tol, w);
  if (!polish) return a;
  const b = lmEqualise(mesh, t, 12, 0, tol, w);
  return { spread: b.spread, iters: a.iters + b.iters, cost: b.cost };
}

function lmEqualise(mesh, t, iters, tikhonov, tol, w = null) {
  const N = mesh.cells.length;
  const nd = mesh.dof.length;
  const x0 = getDOF(mesh);
  const scale = mesh.dof.map((d) => dofScale(mesh, d));
  // Only a non-crossing floor. It was once 15% of the mean rim gap, which
  // silently PINNED the solve on layouts whose corner cells genuinely have to
  // be slim (8x3 at the equal-arc 24.5 deg stalled at 37% spread against it).
  // A layout that needs a sliver should produce a sliver and be judged on its
  // f1, not be quietly refused an equal-area solution.
  const gapMin = (0.004 * TAU) / Math.max(mesh.rimOrder.length, 1);
  let x = x0.slice();

  const wt = w || new Array(N).fill(1);
  const cost = (A, xv) => {
    const mean = A.reduce((a, b) => a + b, 0) / N;
    if (!(mean > 0)) return Infinity;
    let s = 0;
    for (let i = 0; i < N; i++) { const r = A[i] / (mean * wt[i]) - 1; s += r * r; }
    for (let k = 0; k < nd; k++) { const r = (tikhonov * (xv[k] - x0[k])) / scale[k]; s += r * r; }
    return s;
  };

  let A = areasVec(mesh, t);
  let f = cost(A, x);
  let lam = 1e-3;
  let it = 0;

  for (; it < iters; it++) {
    const mean = A.reduce((a, b) => a + b, 0) / N;
    if (!(mean > 0)) break;
    const r = new Array(N + nd);
    for (let i = 0; i < N; i++) r[i] = A[i] / (mean * wt[i]) - 1;
    for (let k = 0; k < nd; k++) r[N + k] = (tikhonov * (x[k] - x0[k])) / scale[k];
    if (r.slice(0, N).every((v) => Math.abs(v) < tol)) break;

    // Jacobian, column by column. Only the cells a DOF actually touches are
    // recomputed; the mean is held at its current value for the column, which
    // is exact whenever the divider thickness is zero and a good enough
    // approximation for Gauss-Newton when it is not.
    const J = [];
    for (let i = 0; i < N + nd; i++) J.push(new Float64Array(nd));
    for (let k = 0; k < nd; k++) {
      const h = 1e-6 * scale[k];
      const touched = mesh.dofCells[k];
      const save = x[k];
      setDOF1(mesh, k, save + h);
      const up = touched.map((ci) => cellOpenArea(mesh, ci, t));
      setDOF1(mesh, k, save - h);
      const dn = touched.map((ci) => cellOpenArea(mesh, ci, t));
      setDOF1(mesh, k, save);
      touched.forEach((ci, q) => { J[ci][k] = (up[q] - dn[q]) / (2 * h * mean * wt[ci]); });
      J[N + k][k] = tikhonov / scale[k];
    }

    // normal equations with the LM damping on the diagonal
    let stepped = false;
    for (let trial = 0; trial < 8 && !stepped; trial++) {
      const H = [], g = new Array(nd).fill(0);
      for (let a = 0; a < nd; a++) H.push(new Array(nd).fill(0));
      for (let i = 0; i < N + nd; i++) {
        const Ji = J[i], ri = r[i];
        for (let a = 0; a < nd; a++) {
          if (Ji[a] === 0) continue;
          g[a] += Ji[a] * ri;
          for (let b = a; b < nd; b++) if (Ji[b] !== 0) H[a][b] += Ji[a] * Ji[b];
        }
      }
      for (let a = 0; a < nd; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
      for (let a = 0; a < nd; a++) H[a][a] += lam * (1 + H[a][a]);
      const d = solveDense(H, g.map((v) => -v));
      if (!d) { lam *= 10; continue; }
      const xn = x.map((v, k) => v + d[k]);
      setDOF(mesh, xn);
      const An = areasVec(mesh, t);
      const ok = An.every((v) => v > 0) && rimOrderOK(mesh, gapMin);
      const fn = ok ? cost(An, xn) : Infinity;
      if (fn < f) { x = xn; A = An; f = fn; lam = Math.max(lam * 0.4, 1e-9); stepped = true; }
      else { setDOF(mesh, x); lam *= 6; }
    }
    if (!stepped) break;
  }
  setDOF(mesh, x);
  return { spread: areaSpread(mesh, t), iters: it, cost: f };
}

// Homotopy on the TARGET areas, used only when the direct solve stalls.
//
// The direct solve reaches 1e-12 on most layouts and is much cheaper, so it is
// tried first. When it does not — a conformal seed on a wide grid starts with
// locally square cells and therefore VERY unequal areas, and the first Newton
// step has nowhere good to go — the seed is restored and the targets are
// walked from the seed's own area distribution to uniform. Every step is then
// a small move away from a state that is already solved.
export function equaliseAreasStaged(mesh, opts = {}) {
  const { t = 0, iters = 40, tikhonov = 0.02, stages = 8, tol = 1e-7 } = opts;
  if (!mesh.dof.length || mesh.cells.length < 2) return { spread: areaSpread(mesh, t), iters: 0 };
  const x0 = getDOF(mesh);
  const direct = equaliseAreas(mesh, { t, iters, tikhonov });
  if (direct.spread < tol) return direct;

  setDOF(mesh, x0);
  const N = mesh.cells.length;
  const A0 = mesh.cells.map((_, i) => cellOpenArea(mesh, i, t));
  const mean0 = A0.reduce((x, y) => x + y, 0) / N;
  let res = direct, used = direct.iters;
  for (let k = 1; k <= stages; k++) {
    const u = k / stages;
    const w = A0.map((A) => ((1 - u) * A + u * mean0) / mean0);
    res = equaliseAreas(mesh, { t, iters, tikhonov: tikhonov * (1 - u), polish: false, w });
    used += res.iters;
  }
  res = equaliseAreas(mesh, { t, iters, tikhonov: 0 });
  used += res.iters;
  // if the walk still did not land it, the direct attempt was no worse
  if (res.spread > direct.spread) { setDOF(mesh, x0); return equaliseAreas(mesh, { t, iters, tikhonov }); }
  return { spread: res.spread, iters: used, staged: true };
}

export function areaSpread(mesh, t = 0) {
  const A = areasVec(mesh, t);
  const mean = A.reduce((a, b) => a + b, 0) / A.length;
  return ((Math.max(...A) - Math.min(...A)) / mean) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-CELL ACOUSTICS
// ═══════════════════════════════════════════════════════════════════════════
//
// PRIMARY — curved quadrilateral, generalising the unrolled-rectangle estimate:
//     L_long  = mean arc length of the two "long-direction" opposing edges
//     L_short = mean arc length of the two connecting edges
//     f1     ~= c / (2 max(L_long, L_short))
// This is an APPROXIMATION, not a result. Its error is O((L/r_curv)^2) and the
// SIGN IS NOT ESTABLISHED, so cells whose edge curvature is strong relative to
// their own size are flagged for verification in ABEC rather than corrected.
//
// Where a closed form exists it is used instead, and the cell says which model
// ran:
//   · full disc      f1 = j'(1,1) c / (pi D)
//   · circular sector of angle beta and radius a
//                    f1 = min( j'(pi/beta, 1), j'(0,1) ) c / (2 pi a)
// The sector case is why a pure-sector layout saturates: for beta <= 60 deg
// the azimuthal branch has already passed the radial one, so f1 is pinned at
// the disc's own (0,1) mode — a radial cut lies along a nodal line of that
// mode and cannot remove it. No number of extra radial cuts helps.
//
// SECONDARY — Payne-Weinberger's floor c/(2 d_max), reported only for convex
// cells. A crescent with a concave inner edge is not convex and gets no bound.

export function cellRecord(mesh, ci, opts = {}) {
  const { c = 343, t = 0, samplesPerEdge = 14 } = opts;
  const cell = mesh.cells[ci];
  const poly = cellPolygon(mesh, ci, samplesPerEdge);
  const area = cellArea(mesh, ci);
  const sideLen = cell.sides.map((sd) => sideLength(mesh, sd));
  let dividerLen = 0;
  for (const e of cell.dividerEdges) dividerLen += edgeLength(mesh, e);
  const open = t ? area - (t / 2) * dividerLen : area;

  let minCurvR = Infinity;
  for (const side of cell.sides)
    for (const { e } of side) minCurvR = Math.min(minCurvR, edgeMinCurvR(mesh, e));

  const La = sideLen.length >= 3 ? (sideLen[0] + sideLen[2]) / 2 : sideLen[0] || 0;
  const Lb = sideLen.length >= 4 ? (sideLen[1] + sideLen[3]) / 2 : sideLen[1] || 0;
  const Llong = Math.max(La, Lb), Lshort = Math.min(La, Lb);

  let f1, f1model;
  if (cell.kind === "disc") {
    const discR = cell.ringIdx != null ? mesh.ringR[cell.ringIdx] : cell.discR;
    f1 = (DISC_AZIMUTHAL * c) / (2 * discR * 1e-3);
    f1model = "disc (1,0), exact";
  } else if (cell.kind === "sector") {
    const nu = Math.PI / cell.sectorBeta;
    const jp = Math.min(besselJPrimeZero(nu), besselJPrimeZero(0));
    const secR = cell.sectorRing != null ? mesh.ringR[cell.sectorRing] : cell.sectorR;
    f1 = (jp * c) / (TAU * secR * 1e-3);
    f1model = jp === besselJPrimeZero(0) ? "sector, radial cap (exact)" : "sector azimuthal (exact)";
  } else {
    f1 = c / (2 * Math.max(Llong, 1e-9) * 1e-3);
    f1model = "curved quad, flat-rectangle estimate";
  }

  const convex = polyIsConvex(poly);
  const dia = polyDiameter(poly);
  const m1 = midOfSide(mesh, ci, 1), m3 = midOfSide(mesh, ci, 3);
  const dl = Math.hypot(m1[0] - m3[0], m1[1] - m3[1]);
  return {
    id: ci, label: cell.label, kind: cell.kind, i: cell.i, j: cell.j,
    iDir: dl > 1e-9 ? [(m1[0] - m3[0]) / dl, (m1[1] - m3[1]) / dl] : [1, 0],
    block: cell.block, ring: cell.ring,
    poly, area, open, dividerLen,
    centroid: polyCentroid(poly),
    sideLen, Llong, Lshort,
    aspect: Lshort > 1e-9 ? Llong / Lshort : Infinity,
    dia, convex,
    pwFloor: convex ? c / (2 * dia * 1e-3) : null,
    minCurvR,
    curvatureSensitive: minCurvR < 2 * Lshort,
    f1, f1model,
  };
}

// Every cell record from every representation lands here, and nothing below
// this point knows whether the layout came from grid lines or from a mesh.
export function meshCells(mesh, opts = {}) {
  return mesh.cells.map((_, ci) => cellRecord(mesh, ci, opts));
}

export function meshDividerLength(mesh) {
  let L = 0;
  mesh.edges.forEach((e, i) => { if (!e.rim) L += edgeLength(mesh, i); });
  return L;
}

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
    curvatureFlagged: cells.filter((x) => x.curvatureSensitive).length,
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
// The cell-for-cell mapping needs a rectangular index at both ends, which only
// the H-grid has. An O-grid or butterfly throat has no cell-for-cell match to
// a rectangular mouth grid — that is a property of their topology, not a gap
// in the tool — so this section runs for the H-grid only.

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
    exitHalfAngle = 8, tight = 0.55, fTarget = 20000, dividerEndFrac = 0.35,
    stations = 24, wallWidthAt = 10, samples = 64, keepGeometry = false,
  } = opts;
  const { nc, nr, R, rectangular = true } = opts;
  // A cell-for-cell mapping needs a rectangular index at BOTH ends, which only
  // the H-grid has. An O-grid or butterfly throat has no such match — that is a
  // property of its topology, not a gap in the tool.
  if (!rectangular || !nc || !nr) return null;
  const surf = apertureSurface({ apex, depth, flatten });
  // virtual apex of the driver's own exit cone, which sets the launch direction
  const tanE = Math.tan(exitHalfAngle * D2R);
  const zLaunch = tanE > 1e-9 ? -R / tanE : -1e9;

  const xs = [], ys = [];
  for (let i = 0; i <= nc; i++) xs.push(-mouthW / 2 + (mouthW * i) / nc);
  for (let j = 0; j <= nr; j++) ys.push(-mouthH / 2 + (mouthH * j) / nr);

  const lam = (c / fTarget) * 1000; // mm
  const rows = [];

  for (const cellRec of throat.cells) {
    const { i, j } = cellRec;
    const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => surf.point(xs[a], ys[b]));
    const mc = surf.point((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
    const nSurf = surf.normal(mc);
    const nWave = surf.wavefront(mc);
    const aimErr = Math.acos(Math.min(1, Math.max(-1, dot3(nSurf, nWave)))) * R2D;

    const P0 = v3(cellRec.centroid[0], cellRec.centroid[1], 0);
    const T0dir = un3(s3(P0, v3(0, 0, zLaunch)));
    const P1 = mc;
    const T1dir = nWave; // aim the duct at the apparent apex, not at the surface
    const chord = nrm3(s3(P1, P0));
    const T0 = m3(T0dir, tight * chord * 3), T1 = m3(T1dir, tight * chord * 3);

    // sample the centreline
    const M = samples, pts = [], tans = [];
    for (let q = 0; q <= M; q++) {
      const s = q / M;
      pts.push(hermite(P0, T0, P1, T1, s));
      const e = 1e-5;
      const a = hermite(P0, T0, P1, T1, Math.min(1, s + e));
      const b = hermite(P0, T0, P1, T1, Math.max(0, s - e));
      tans.push(un3(s3(a, b)));
    }
    let L = 0;
    const sArr = [0];
    for (let q = 0; q < M; q++) { L += nrm3(s3(pts[q + 1], pts[q])); sArr.push(L); }

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
    for (let q = 0; q < M; q++) turn += 0.5 * (kappa[q] + kappa[q + 1]) * (sArr[q + 1] - sArr[q]);

    // twist: transport the cell's +i direction and compare with the mouth's +x
    const throatI = v3(cellRec.iDir[0], cellRec.iDir[1], 0);
    let r0 = un3(s3(throatI, m3(tans[0], dot3(throatI, tans[0]))));
    if (!(nrm3(r0) > 0.5)) r0 = un3(cr3(tans[0], v3(0, 0, 1)));
    const frames = rmfTransport(pts, tans, r0);
    const rEnd = frames[frames.length - 1];
    const mouthI = un3(s3(
      surf.point(xs[i + 1], (ys[j] + ys[j + 1]) / 2),
      surf.point(xs[i], (ys[j] + ys[j + 1]) / 2)));
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
    const mouthXY = [];
    for (let e = 0; e < 4; e++) {
      const A = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]][e];
      const B = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]][(e + 1) % 4];
      for (let q = 0; q < nMs; q++) {
        const u = q / nMs;
        mouthXY.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]);
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
      : resamplePoly(centred, mouthXY.length);

    // one Hermite per boundary point, launched down the exit cone and aimed at
    // the apparent apex, exactly as the centreline is
    const traj = throatLocal.map((p, k) => {
      const A = v3(p[0] + cellRec.centroid[0], p[1] + cellRec.centroid[1], 0);
      const B = surf.point(mouthXY[k][0], mouthXY[k][1]);
      const ch = nrm3(s3(B, A));
      return {
        A, B,
        TA: m3(un3(s3(A, v3(0, 0, zLaunch))), tight * ch * 3),
        TB: m3(surf.wavefront(B), tight * ch * 3),
      };
    });

    const sched = [];
    for (let q = 0; q <= stations; q++) {
      const u = q / stations;
      const ring = traj.map((tr) => hermite(tr.A, tr.TA, tr.B, tr.TB, u));
      // vector area of a closed space polygon: half the sum of p_k x p_(k+1)
      let ax = 0, ay = 0, az = 0;
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], b = ring[(k + 1) % ring.length];
        ax += a[1] * b[2] - a[2] * b[1];
        ay += a[2] * b[0] - a[0] * b[2];
        az += a[0] * b[1] - a[1] * b[0];
      }
      const idx = Math.round(u * M);
      // `area` is the section's OWN area. `axial` is its projection on the
      // direction of travel — the flux-carrying cross-section, and the one the
      // duct's volume integrates. The two differ because a flowed section is a
      // level set of the flow, not a perpendicular cut: the gap between them
      // is exactly how oblique the section is, and it is reported rather than
      // hidden by pretending the cut is square to the path.
      const T = tans[idx];
      sched.push({
        s: u, area: Math.hypot(ax, ay, az) / 2,
        axial: Math.abs(ax * T[0] + ay * T[1] + az * T[2]) / 2,
        z: pts[idx][2], sLen: sArr[idx],
        // the flowed section, in world coordinates — kept only when something
        // is going to export or draw it
        pts: keepGeometry ? ring : null,
        origin: keepGeometry ? pts[idx] : null,
      });
    }

    // first mode where the dividers stop, and the evanescent run it needs
    const endIdx = Math.max(0, Math.min(stations, Math.round(dividerEndFrac * stations)));
    const at = sched[endIdx];
    const scaleEnd = Math.sqrt(at.area / Math.max(cellRec.area, 1e-9));
    const f1End = cellRec.f1 / Math.max(scaleEnd, 1e-9);
    let decay = null, runNeeded = null;
    if (f1End > fTarget) {
      const alphaEv = ((TAU / c) * Math.sqrt(f1End * f1End - fTarget * fTarget));
      decay = 1000 / alphaEv; // mm
      runNeeded = 3 * decay;
    }
    // trailing length over which the centreline is effectively straight
    let straightAvail = 0;
    for (let q = M - 1; q >= 0; q--) {
      const rc = kappa[q] > 1e-12 ? 1 / kappa[q] : Infinity;
      if (rc < 20 * Math.max(cellRec.Lshort, 1e-6)) break;
      straightAvail += sArr[q + 1] - sArr[q];
    }

    rows.push({
      id: cellRec.id, label: cellRec.label, i, j,
      Lpath: L, turnDeg: turn * R2D, twistDeg: twist, aimErrDeg: aimErr,
      mouthCentroid: mc, mouthCorners: corners, mouthNormal: nSurf,
      mouthArea: sched[stations].area,
      f1End, decayLen: decay, runNeeded, straightAvail,
      sched, kappaMax: Math.max(...kappa),
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

  // sum of cross-sections at each station, for a Hornresp / ABEC handoff
  // Both areas are carried. `area` is the sum of the sections' own areas;
  // `axial` is the sum of their projections on the direction of travel, which
  // is the flux-carrying cross-section and therefore the one a 1-D horn area
  // schedule means. They differ by the sections' obliquity — up to 14.5% at
  // 6x3 — so which one is handed to Hornresp is not a detail.
  const sigma = [];
  for (let q = 0; q <= stations; q++) {
    let A = 0, Ax = 0, z = 0, sl = 0;
    rows.forEach((r) => {
      A += r.sched[q].area; Ax += r.sched[q].axial;
      z += r.sched[q].z; sl += r.sched[q].sLen;
    });
    sigma.push({ s: q / stations, area: A, axial: Ax, zMean: z / rows.length, sMean: sl / rows.length });
  }

  const turnLimitDeg = ((lam / 8) / wallWidthAt) * R2D;
  return {
    rows, surf, xs, ys, Lmax, Lmin, dL, lambda: lam,
    dLfrac: dL / lam,
    band: dL <= lam / 8 ? "ok" : dL <= lam / 4 ? "warn" : "bad",
    twistMax: Math.max(...rows.map((r) => Math.abs(r.twistDeg))),
    turnMax: Math.max(...rows.map((r) => r.turnDeg)),
    aimMax: Math.max(...rows.map((r) => r.aimErrDeg)),
    turnLimitDeg,
    // tangency tolerance ~ lambda / (4 d) with d the cell's mouth width
    aimLimitDeg: (lam / (4 * (mouthW / nc))) * R2D,
    sigma, stations, sectionAt,
    mouthAreaTotal: rows.reduce((a, r) => a + r.mouthArea, 0),
  };
}

function midOfSide(mesh, ci, k) {
  // A disc cell has a single side and a sector cell has empty ones, so this has
  // to cope with the side simply not being there.
  const side = mesh.cells[ci].sides[k];
  if (!side || !side.length) return polyCentroid(cellPolygon(mesh, ci, 6));
  const { e, rev } = side[Math.floor(side.length / 2)];
  return edgePoint(mesh, e, rev ? 0.5 : 0.5);
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
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
// One call from the UI. The H-grid runs the line solve; the two comparison
// families run the mesh solve. Both come back as the same throat record.

export function buildLayout(o) {
  const {
    family = "hgrid", R, nc = 6, nr = 3, m = 2, symmetric = true,
    params = null, seed: seedKind = "elliptical", seedObj = null, pStart = null,
    rings = [1, 6, 12], hubR = 0, rotDeg = 0, bm = 2, bp = 2, coreFrac = 0.42,
    alphaDeg = null, t = 0, c = 343, solveOpts = {},
  } = o;

  if (family === "hgrid") {
    const cfg = lineGridConfig({ nc, nr, m, symmetric });
    const pReq = params ? params.slice() : nominalParams(cfg);
    if (alphaDeg != null) pReq[cfg.alphaAt] = alphaDeg * D2R;
    const sol = solveEqualArea(cfg, pReq, { R, seedKind, seed: seedObj, pStart, t, ...solveOpts });
    const cells = lineGridCells(sol.geometry, { c, t });
    const throat = analyseThroat(cells, { c, R, dividerTotal: lineGridDividerLength(sol.geometry) });
    return { family, cfg, solve: sol, geometry: sol.geometry, throat, seedObj: sol.seed, rectangular: true, nc, nr };
  }

  const mesh = family === "ogrid"
    ? buildOGrid({ R, hubR, rings, rotDeg })
    : buildButterfly({ R, m: bm, p: bp, alphaDeg: alphaDeg ?? 45, coreFrac });
  const eq = equaliseAreasStaged(mesh, { t, iters: 50 });
  const cells = meshCells(mesh, { c, t });
  const throat = analyseThroat(cells, { c, R, dividerTotal: meshDividerLength(mesh) });
  return { family, mesh, solve: { converged: eq.spread < 1e-6, residual: eq.spread / 100, reason: null }, throat, rectangular: false };
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
      // equalise once the walls have thickness, exactly as the O-grid does.
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
  let it = 0, mu = 1, sinceJ = 0;
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

// Curvature from the circumradius of three consecutive samples: robust, and it
// does not need the second derivative of a composed map.
function edgeMinRadius(lg, e, n = 12) {
  if (e.rim) return lg.R;
  const P = edgeSample(lg, e, n);
  let best = Infinity;
  for (let q = 1; q < P.length - 1; q++) {
    const A = P[q - 1], B = P[q], C = P[q + 1];
    const a = Math.hypot(B[0] - C[0], B[1] - C[1]);
    const b = Math.hypot(A[0] - C[0], A[1] - C[1]);
    const cc = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const ar = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
    if (ar < 1e-14) continue;
    best = Math.min(best, (a * b * cc) / (4 * ar));
  }
  return best;
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
      const minCurvR = Math.min(...sides.map(({ e }) => edgeMinRadius(lg, e)));

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
        minCurvR,
        curvatureSensitive: minCurvR < 2 * Lshort,
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
// at the throat. The inset TAPERS to zero at dividerEndFrac, because that is
// where the dividers physically stop: holding it further would shrink the duct
// below its own area schedule for a wall that is not there.
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
// The inset only bites between the throat and dividerEndFrac, where sections
// are still nearly flat, so the plane is a close fit exactly where it matters.
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

export function polyArea2(poly) {
  let A2 = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    A2 += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(A2) / 2;
}

// The inset 3-D sections of one duct, throat to mouth.
//
// Station 0 needs no special case any more. Under the flowed construction the
// section at s = 0 IS the throat outline, in the throat plane, because every
// boundary point starts there — so the mating face against the driver is flat
// by construction and neighbours meet along exactly one shared curve. Before
// the flow, station 0 was cut perpendicular to each duct's own centreline,
// which at the throat already points down the exit cone: the section came out
// tilted by up to 6.85 deg, straddling z = +-0.5 mm, and eighteen ducts each
// tilted their own way had no common face to seat on at all.
export function ductSections(cellRec, row, { t = 0, dividerEndFrac = 0.35 } = {}) {
  const Q = row.sched.length - 1;
  const rim = cellRec.rimSide || [false, false, false, false];
  const out = [];
  for (let q = 0; q <= Q; q++) {
    const st = row.sched[q];
    if (!st.pts) return null;
    // full t/2 at the throat, gone by the station where the dividers end
    const taper = dividerEndFrac > 1e-9 ? Math.max(0, 1 - st.s / dividerEndFrac) : 0;
    const d = rim.map((isRim) => (isRim ? 0 : (t / 2) * taper));
    const pts = d.some((v) => v > 0) ? insetSection3(st.pts, d) : st.pts;
    out.push({ s: st.s, area: polyArea3(pts), pts, origin: st.origin });
  }
  return out;
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
  for (const cellRec of throat.cells) {
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
