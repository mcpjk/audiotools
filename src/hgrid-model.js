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
// ── WHY NOT A TENSOR-PRODUCT GRID ──────────────────────────────────────────
// A fixed square-to-disc map with adjustable u and v division values offers
// (nc-1)+(nr-1) knobs against nc·nr-1 area constraints. For 6x3 that is 7
// knobs for 17 constraints and is not solvable in general. Grid lines have to
// bend individually, so the grid is stored as free nodes and per-edge shape,
// not as two division vectors.
//
// ── THE THREE STAGES ───────────────────────────────────────────────────────
// 1. SEED      a square-to-disc map. Elliptical (closed form) or conformal
//              (Schwarz-Christoffel, f'(z) = (1 - 2z^2 cos2a + z^4)^(-1/2)).
//              Neither gives equal areas. That is expected.
// 2. EQUALISE  damped Gauss-Newton on the node DOF against the area
//              residuals, with a Tikhonov pull back toward the seed. Exact to
//              solver tolerance; the achieved spread is always reported rather
//              than asserted.
// 3. EXPLORE   area-preserving flows. In 2D a deformation preserves area iff
//              its velocity field is divergence-free, and every divergence-
//              free planar field is the skew gradient of a stream function:
//                  v = ( dpsi/dy , -dpsi/dx )
//              so flowing every node and control point along such a field
//              preserves EVERY cell area, for any psi. The curvature knobs
//              therefore cannot break stage 2.
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
//  · Stage 3 is exact in the continuum. Discretised, each edge is refitted
//    from its flowed endpoints and flowed midpoint, so the drift is the
//    difference between that quadratic and the true image curve. Measured,
//    reported, and cleaned up by one Gauss-Newton correction.
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

export function finalizeMesh(mesh, { bulge = false } = {}) {
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
  const ringDof = [];
  [...ringNodes.keys()].sort((a, b) => a - b).forEach((k) => {
    ringDof.push(dof.length);
    dof.push({ t: "ring", i: k, nodes: ringNodes.get(k) });
  });
  mesh.nInteriorEdges = 0;
  mesh.edges.forEach((e, i) => {
    if (e.arc) return;
    mesh.nInteriorEdges++;
    if (bulge) { dof.push({ t: "bx", i }); dof.push({ t: "by", i }); }
  });
  mesh.dof = dof;
  mesh.bulgeOn = bulge;

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
  let acc = [0, 0];
  for (let k = 0; k < sub; k++)
    for (let q = 0; q < 8; q++) {
      const sg = (k + GL8_X[q]) / sub;
      const s = 1 - (1 - sg) * (1 - sg);
      const w = (GL8_W[q] / sub) * 2 * (1 - sg);
      const t = [z[0] * s, z[1] * s];
      acc = cAdd(acc, cMul([w, 0], cDiv([1, 0], cSqrt(scQ(t, cos2a)))));
    }
  return cMul(acc, z);
}

// Rectangle half-width and half-height of that image. f(1) is real, f(i) is
// imaginary; the aspect X/Y is fixed by alpha alone, which is exactly why the
// conformally natural corner angle for a given mouth aspect is NOT the
// equal-arc value.
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
export function scInvert(w, alpha, guess) {
  const cos2a = Math.cos(2 * alpha);
  let z = guess;
  for (let it = 0; it < 40; it++) {
    const d = cSub(scMap(z, alpha), w);
    if (Math.hypot(d[0], d[1]) < 1e-12) break;
    const step = cMul(d, cSqrt(scQ(z, cos2a)));
    let nz = cSub(z, step);
    const r = Math.hypot(nz[0], nz[1]);
    if (r > 0.999999) nz = [(nz[0] / r) * 0.999999, (nz[1] / r) * 0.999999];
    z = nz;
  }
  return z;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAMILY 1 — H-GRID
// ═══════════════════════════════════════════════════════════════════════════
//
// One (i,j) index over the whole disc. The four square corners land on the rim
// and become the singular vertices, where three cells meet instead of four.
//
// CORNER PLACEMENT. Equal rim arc per cell edge gives
//     alpha = 90 * n_rows / (n_rows + n_cols)
// so 6x3 -> 30 deg and 6x6 -> 45 deg. That is a SEED, not a derivation: the
// conformally natural corner angle is set by the Schwarz-Christoffel elliptic
// modulus for the mouth's aspect ratio (scAlphaForAspect above) and is not in
// general the equal-arc value. The optimiser is free to move it.

export const equalArcAlphaDeg = (nc, nr) => (90 * nr) / (nr + nc);

// Rim angle of boundary index (i,j), walking the square boundary
// counterclockwise from the (nc,0) corner at -alpha.
function hgridRimTheta(i, j, nc, nr, alpha) {
  const spanX = Math.PI - 2 * alpha; // arc carried by the top and bottom edges
  if (i === nc) return -alpha + (2 * alpha * j) / nr;
  if (j === nr) return alpha + (spanX * (nc - i)) / nc;
  if (i === 0) return Math.PI - alpha + (2 * alpha * (nr - j)) / nr;
  return Math.PI + alpha + (spanX * i) / nc; // j === 0
}

export function buildHGrid({ R, nc, nr, alphaDeg, seed = "elliptical", bulge = false }) {
  const alpha = alphaDeg * D2R;
  const mesh = makeMesh(R);
  mesh.family = "hgrid";
  mesh.nc = nc; mesh.nr = nr; mesh.alphaDeg = alphaDeg; mesh.seedKind = seed;
  const onRim = (i, j) => i === 0 || i === nc || j === 0 || j === nr;
  const key = (i, j) => `n${i}_${j}`;

  // ── interior seed positions ──
  const P = [];
  if (seed === "conformal") {
    // Uniform grid in the conformal rectangle, pulled back to the disc. The
    // cells start locally square — the best shapes available — and with the
    // wrong areas, which is what stage 2 is for. Note the rim division comes
    // from the map, not from the equal-arc rule.
    const rect = scRect(alpha);
    // Boundary points are found by BISECTION ON THE RIM ANGLE, not by the 2-D
    // Newton: on |z| = 1 the map is monotone along each rim segment, so
    // bisection cannot miss, whereas Newton walks off the disc near a
    // prevertex — it was returning 20.8 deg for a corner that belongs at
    // 18 deg. The four corners need no solve at all: they ARE the prevertices.
    const rimSolve = (thA, thB, want, comp) => {
      let lo = thA, hi = thB;
      const val = (th) => scMap([Math.cos(th), Math.sin(th)], alpha)[comp];
      const inc = val(thB) > val(thA);
      for (let k = 0; k < 80; k++) {
        const mid = 0.5 * (lo + hi);
        if ((val(mid) < want) === inc) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    };
    const cTh = [-alpha, alpha, Math.PI - alpha, Math.PI + alpha, TAU - alpha];
    for (let i = 0; i <= nc; i++) {
      P.push([]);
      for (let j = 0; j <= nr; j++) {
        const u = -1 + (2 * i) / nc, v = -1 + (2 * j) / nr;
        const w = [rect.X * u, rect.Y * v];
        const corner = (i === 0 || i === nc) && (j === 0 || j === nr);
        let z;
        if (corner) {
          const k = i === nc ? (j === 0 ? 0 : 1) : j === nr ? 2 : 3;
          z = [Math.cos(cTh[k]), Math.sin(cTh[k])];
        } else if (i === nc) z = polar(rimSolve(cTh[0], cTh[1], w[1], 1));
        else if (j === nr) z = polar(rimSolve(cTh[1], cTh[2], w[0], 0));
        else if (i === 0) z = polar(rimSolve(cTh[2], cTh[3], w[1], 1));
        else if (j === 0) z = polar(rimSolve(cTh[3], cTh[4], w[0], 0));
        else {
          const g = ellipticalMap(u, v);
          z = scInvert(w, alpha, [g[0] * 0.9, g[1] * 0.9]);
        }
        P[i].push([z[0] * R, z[1] * R]);
      }
    }
  } else {
    for (let i = 0; i <= nc; i++) {
      P.push([]);
      for (let j = 0; j <= nr; j++) {
        const g = ellipticalMap(-1 + (2 * i) / nc, -1 + (2 * j) / nr);
        P[i].push([g[0] * R, g[1] * R]);
      }
    }
    // The elliptical map puts its corners at 45 degrees whatever alpha is, and
    // divides the rim unevenly. Impose the wanted rim, then carry the boundary
    // displacement inward with a transfinite (Coons) blend so the interior
    // follows instead of shearing away from it.
    const dsp = (i, j) => {
      const th = hgridRimTheta(i, j, nc, nr, alpha);
      return [R * Math.cos(th) - P[i][j][0], R * Math.sin(th) - P[i][j][1]];
    };
    const D = [];
    for (let i = 0; i <= nc; i++) {
      D.push([]);
      for (let j = 0; j <= nr; j++) D[i].push(onRim(i, j) ? dsp(i, j) : null);
    }
    for (let i = 1; i < nc; i++)
      for (let j = 1; j < nr; j++) {
        const a = i / nc, b = j / nr;
        const c1 = mul(D[0][j], 1 - a), c2 = mul(D[nc][j], a);
        const c3 = mul(D[i][0], 1 - b), c4 = mul(D[i][nr], b);
        const k1 = mul(D[0][0], (1 - a) * (1 - b)), k2 = mul(D[nc][0], a * (1 - b));
        const k3 = mul(D[0][nr], (1 - a) * b), k4 = mul(D[nc][nr], a * b);
        const d = sub(add(add(c1, c2), add(c3, c4)), add(add(k1, k2), add(k3, k4)));
        P[i][j] = add(P[i][j], d);
      }
  }

  // ── nodes ──
  for (let i = 0; i <= nc; i++)
    for (let j = 0; j <= nr; j++) {
      if (onRim(i, j)) {
        const th = seed === "conformal"
          ? Math.atan2(P[i][j][1], P[i][j][0])
          : hgridRimTheta(i, j, nc, nr, alpha);
        addNode(mesh, key(i, j), { kind: "rim", th, gi: i, gj: j });
      } else {
        addNode(mesh, key(i, j), { kind: "free", x: P[i][j][0], y: P[i][j][1], gi: i, gj: j });
      }
    }

  // ── edges ──
  // u-edges run along i, v-edges along j. On the rim they become circular
  // arcs; the stored sign records which way round the circle a->b goes.
  const U = [], V = [];
  for (let i = 0; i < nc; i++) {
    U.push([]);
    for (let j = 0; j <= nr; j++) {
      const isRim = j === 0 || j === nr;
      U[i].push(addEdge(mesh, key(i, j), key(i + 1, j),
        isRim ? { arc: { r: R, sign: j === 0 ? 1 : -1 }, rim: true } : {}));
    }
  }
  for (let i = 0; i <= nc; i++) {
    V.push([]);
    for (let j = 0; j < nr; j++) {
      const isRim = i === 0 || i === nc;
      V[i].push(addEdge(mesh, key(i, j), key(i, j + 1),
        isRim ? { arc: { r: R, sign: i === nc ? 1 : -1 }, rim: true } : {}));
    }
  }

  // ── cells, counterclockwise: +i, +j, -i, -j ──
  const rev = (h) => ({ e: h.e, rev: !h.rev });
  for (let i = 0; i < nc; i++)
    for (let j = 0; j < nr; j++)
      addCell(mesh, [[U[i][j]], [V[i + 1][j]], [rev(U[i][j + 1])], [rev(V[i][j])]],
        { kind: "quad", i, j, label: `${i + 1},${j + 1}` });

  mesh.singular = [key(0, 0), key(nc, 0), key(nc, nr), key(0, nr)].map((k) => mesh.nodeKey.get(k));
  return finalizeMesh(mesh, { bulge });
}

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

export function buildButterfly({ R, m, p, alphaDeg = 45, coreFrac = 0.42, bulge = false }) {
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
  return finalizeMesh(mesh, { bulge });
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
// STAGE 3 — AREA-PRESERVING STREAM-FUNCTION FLOW
// ═══════════════════════════════════════════════════════════════════════════
//
//     psi(x,y) = (1 - r^2)^2 * g(x,y)          r^2 = (x^2 + y^2) / R^2
//     v = ( dpsi/dy , -dpsi/dx )
//
// The (1-r^2)^2 factor makes psi and grad(psi) both vanish on the rim, so the
// rim outline AND the rim division points are held fixed by construction —
// only the interior moves. Divergence-free means every cell area is preserved
// for ANY g, so no curvature knob can undo stage 2.
//
// SYMMETRY. Mirror symmetry about the horizontal axis needs psi odd in y;
// about the vertical axis, odd in x. Requiring both restricts g to monomials
// with both exponents odd, which roughly halves the search space and makes an
// asymmetric result impossible.

export function psiBasis(symmetry = "both", degree = 6) {
  const out = [];
  for (let a = 0; a <= degree; a++)
    for (let b = 0; a + b <= degree; b++) {
      if (symmetry === "both" && !(a % 2 === 1 && b % 2 === 1)) continue;
      if (symmetry === "horizontal" && b % 2 !== 1) continue;
      out.push([a, b]);
    }
  return out;
}

// The named sliders are directions in that coefficient space, not a separate
// mechanism — which is what guarantees they cannot change a cell area either.
export const KNOBS = {
  row_bow: { terms: [[[1, 1], 1]], label: "row bow" },
  radial_bias: { terms: [[[3, 1], 1], [[1, 3], 1]], label: "radial bias" },
  col_splay: { terms: [[[3, 1], 1], [[1, 3], -1]], label: "column splay" },
  swirl: { terms: [[[0, 0], 1]], label: "swirl", needs: "none" },
};

export function knobsToCoeffs(knobs, basis) {
  const c = new Array(basis.length).fill(0);
  const idx = new Map(basis.map(([a, b], i) => [`${a},${b}`, i]));
  for (const [name, val] of Object.entries(knobs)) {
    if (!val || !KNOBS[name]) continue;
    for (const [[a, b], w] of KNOBS[name].terms) {
      const i = idx.get(`${a},${b}`);
      if (i !== undefined) c[i] += val * w;
    }
  }
  return c;
}

// v at a point, in mm per unit time. Positions scale by R so a coefficient of
// order 1 moves the interior by order R over the unit-time flow.
export function psiVelocity(x, y, R, basis, coef) {
  const xi = x / R, eta = y / R;
  const rho2 = xi * xi + eta * eta;
  const w = 1 - rho2;
  const w2 = w * w;
  let dxi = 0, deta = 0;
  for (let k = 0; k < basis.length; k++) {
    const c = coef[k];
    if (!c) continue;
    const [a, b] = basis[k];
    const xa = Math.pow(xi, a), yb = Math.pow(eta, b);
    const m = xa * yb;
    dxi += c * (-4 * xi * w * m + (a ? w2 * a * Math.pow(xi, a - 1) * yb : 0));
    deta += c * (-4 * eta * w * m + (b ? w2 * b * xa * Math.pow(eta, b - 1) : 0));
  }
  return [R * deta, -R * dxi];
}

function rk4(pt, R, basis, coef, steps, span = 1) {
  const h = span / steps;
  let p = pt;
  for (let s = 0; s < steps; s++) {
    const k1 = psiVelocity(p[0], p[1], R, basis, coef);
    const k2 = psiVelocity(p[0] + (h / 2) * k1[0], p[1] + (h / 2) * k1[1], R, basis, coef);
    const k3 = psiVelocity(p[0] + (h / 2) * k2[0], p[1] + (h / 2) * k2[1], R, basis, coef);
    const k4 = psiVelocity(p[0] + h * k3[0], p[1] + h * k3[1], R, basis, coef);
    p = [
      p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ];
  }
  return p;
}

// Flow every node and every control point.
//
// The flow itself is exactly area-preserving — verified directly against a
// dense polygon, to 1e-7%. The only inexact step is the EDGE SHAPE: the image
// of a quadratic Bezier under a nonlinear flow is not a quadratic Bezier, so
// it has to be refitted, and a naive refit leaks over 1% on the corner cells.
//
// Note that refitting through the flowed parametric midpoint cannot be
// improved by flowing in stages: the refit puts that material point back at
// t = 0.5, so a staged flow tracks the same three points and returns the
// identical curve, bit for bit. The leak has to be closed a different way.
//
// So each edge is given the area integral of its TRUE image curve, obtained by
// flowing a dense sample of the edge and Richardson-extrapolating the polygon
// rule. The quadratic's own Green's-theorem integral is affine in the control
// point, so one linear solve along the chord normal makes them agree. Every
// interior edge is shared by exactly two cells with opposite orientation and
// every rim arc is its own exact image, so matching each edge integral makes
// every CELL area exact — which is what lets the curvature knobs be knobs
// rather than another thing to re-solve.
export const canFlow = (mesh) =>
  mesh.bulgeOn || mesh.nodes.some((n) => n.kind === "free");

export function flowMesh(mesh, basis, coef, steps = 24, ns = 16) {
  if (!coef.some((v) => v) || !canFlow(mesh)) return;
  const R = mesh.R;
  const F = (p, n) => rk4(p, R, basis, coef, n);

  // true image area integral of each interior edge, before anything moves
  const NS = ns; // 2*NS+1 samples, Richardson over NS and 2*NS
  const Itrue = mesh.edges.map((e, i) => {
    // Only edges that CARRY a control point may be reshaped. Without this the
    // flow bent the O-grid's radial dividers, which have no curvature DOF, and
    // its two ring radii could not undo the damage — 52% area spread from a
    // slider that is supposed to be exactly area-preserving.
    if (e.arc || !mesh.bulgeOn) return null;
    const P = edgeBez(mesh, i);
    const pts = [];
    for (let q = 0; q <= 2 * NS; q++) pts.push(F(bezAt(P, q / (2 * NS)), steps));
    const polyInt = (stride) => {
      let s = 0;
      for (let q = 0; q + stride <= 2 * NS; q += stride) {
        const a = pts[q], b = pts[q + stride];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return s / 2;
    };
    const coarse = polyInt(2), fine = polyInt(1);
    return (4 * fine - coarse) / 3;
  });

  const mids = mesh.edges.map((e, i) => (e.arc ? null : bezAt(edgeBez(mesh, i), 0.5)));
  mesh.nodes.forEach((n) => {
    if (n.kind !== "free") return;
    const p = F([n.x, n.y], steps);
    n.x = p[0]; n.y = p[1];
  });
  invalidateAll(mesh);
  if (!mesh.bulgeOn) return;
  mesh.edges.forEach((e, i) => {
    if (e.arc) return;
    const M = F(mids[i], steps);
    const P0 = nodeXY(mesh, e.a), P2 = nodeXY(mesh, e.b);
    e.bulge = [2 * M[0] - P0[0] - P2[0], 2 * M[1] - P0[1] - P2[1]];
    // dI/dP1 = (1/3)(dy, -dx) for the chord d = P2 - P0, so a shift of the
    // control point along the chord normal moves the integral by |d|/3 per
    // unit, and the residual closes in one step.
    const dx = P2[0] - P0[0], dy = P2[1] - P0[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) return;
    mesh.eValid[i] = 0;
    const sNeed = (3 * (Itrue[i] - edgeAreaInt(mesh, i))) / L;
    e.bulge = [e.bulge[0] + (sNeed * dy) / L, e.bulge[1] - (sNeed * dx) / L];
    mesh.eValid[i] = 0;
  });
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
  return {
    id: ci, label: cell.label, kind: cell.kind, i: cell.i, j: cell.j,
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

export function analyseThroat(mesh, opts = {}) {
  const { c = 343, t = 0, R = mesh.R } = opts;
  const cells = mesh.cells.map((_, ci) => cellRecord(mesh, ci, { c, t }));
  const N = cells.length;
  const areas = cells.map((x) => x.area);
  const opens = cells.map((x) => x.open);
  const openMean = opens.reduce((a, b) => a + b, 0) / N;
  const openTotal = opens.reduce((a, b) => a + b, 0);
  const gross = Math.PI * R * R;

  // total divider centreline length in the throat plane — every interior edge
  // once, not once per adjoining cell
  let dividerTotal = 0;
  mesh.edges.forEach((e, i) => { if (!e.rim) dividerTotal += edgeLength(mesh, i); });

  let f1min = Infinity, f1minCell = null;
  cells.forEach((x) => { if (x.f1 < f1min) { f1min = x.f1; f1minCell = x; } });

  // isodiametric ceiling: cells would have to be circles, and circles do not tile
  const dCeiling = (2 * R) / Math.sqrt(N);
  return {
    cells, N,
    areaMean: areas.reduce((a, b) => a + b, 0) / N,
    openMean, openTotal, gross,
    spread: ((Math.max(...opens) - Math.min(...opens)) / openMean) * 100,
    dividerTotal,
    blockage: 1 - openTotal / gross,
    shellOversize: 2 * R / Math.sqrt(Math.max(1 - (1 - openTotal / gross), 1e-6)),
    f1min, f1minCell,
    f1ceiling: (c * Math.sqrt(N)) / (2 * 2 * R * 1e-3), // c sqrt(N) / (2 D)
    dCeiling,
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

export function mapThroatToMouth(mesh, throat, opts) {
  const {
    c = 343, mouthW = 200, mouthH = 100, apex = 120, depth = 150, flatten = 1,
    exitHalfAngle = 8, tight = 0.55, fTarget = 20000, dividerEndFrac = 0.35,
    stations = 24, wallWidthAt = 10, samples = 64, keepGeometry = false,
  } = opts;
  if (mesh.family !== "hgrid") return null;
  const nc = mesh.nc, nr = mesh.nr, R = mesh.R;
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
    const iDirT = un3(v3(
      cellRec.poly.length ? cellRec.sideLen[1] * 0 + 1 : 1, 0, 0));
    const throatI = un3(s3(
      v3(...midOfSide(mesh, cellRec.id, 1), 0), v3(...midOfSide(mesh, cellRec.id, 3), 0)));
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

    // cross-section area schedule, interpolating the throat and mouth outlines
    // in the transported frame — the loft Shapr3D would build.
    // (frames[] above is the rotation-minimising frame this rides on.)
    const mouthPoly = [];
    const CX = (xs[i] + xs[i + 1]) / 2, CY = (ys[j] + ys[j + 1]) / 2;
    const nMs = 16; // 64 points round the outline — coarser under-measures a curved throat cell
    for (let e = 0; e < 4; e++) {
      const A = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]][e];
      const B = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]][(e + 1) % 4];
      for (let q = 0; q < nMs; q++) {
        const u = q / nMs;
        mouthPoly.push([A[0] + (B[0] - A[0]) * u - CX, A[1] + (B[1] - A[1]) * u - CY]);
      }
    }
    const throatPoly = resamplePoly(cellRec.poly.map((p) => [p[0] - cellRec.centroid[0], p[1] - cellRec.centroid[1]]), mouthPoly.length);
    const sched = [];
    for (let q = 0; q <= stations; q++) {
      const u = q / stations;
      const blended = throatPoly.map((p, k) => [
        p[0] + (mouthPoly[k][0] - p[0]) * u,
        p[1] + (mouthPoly[k][1] - p[1]) * u,
      ]);
      let A2 = 0;
      for (let k = 0; k < blended.length; k++) {
        const a = blended[k], b = blended[(k + 1) % blended.length];
        A2 += a[0] * b[1] - b[0] * a[1];
      }
      const idx = Math.round(u * M);
      sched.push({
        s: u, area: Math.abs(A2) / 2, z: pts[idx][2], sLen: sArr[idx],
        // the loft cross-section, in the cell's own transported frame — kept
        // only when something is going to export or draw it
        local: keepGeometry ? blended : null,
        origin: keepGeometry ? pts[idx] : null,
        u: keepGeometry ? frames[idx] : null,
        v: keepGeometry ? cr3(tans[idx], frames[idx]) : null,
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

  // 3-D station outlines, rebuilt from the stored local sections
  const sectionAt = (q) => rows.map((r) => {
    const st = r.sched[q];
    if (!st.local) return null;
    return {
      id: r.id, label: r.label,
      pts: st.local.map((p) => [
        st.origin[0] + p[0] * st.u[0] + p[1] * st.v[0],
        st.origin[1] + p[0] * st.u[1] + p[1] * st.v[1],
        st.origin[2] + p[0] * st.u[2] + p[1] * st.v[2],
      ]),
    };
  });

  // sum of cross-sections at each station, for a Hornresp / ABEC handoff
  const sigma = [];
  for (let q = 0; q <= stations; q++) {
    let A = 0, z = 0, sl = 0;
    rows.forEach((r) => { A += r.sched[q].area; z += r.sched[q].z; sl += r.sched[q].sLen; });
    sigma.push({ s: q / stations, area: A, zMean: z / rows.length, sMean: sl / rows.length });
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
  const side = mesh.cells[ci].sides[k];
  if (!side.length) return polyCentroid(cellPolygon(mesh, ci, 6));
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

// ═══════════════════════════════════════════════════════════════════════════
// FABRICATION
// ═══════════════════════════════════════════════════════════════════════════
export const PROCESSES = {
  FDM: { label: "FDM", tMin: 0.8, ra: 27.5 },
  MSLA: { label: "MSLA resin", tMin: 0.4, ra: 5 },
};

export function fabrication({ throat, t, R, c, f, process = "FDM", knifeEdge = 0 }) {
  const proc = PROCESSES[process] || PROCESSES.FDM;
  const blockage = throat.blockage;
  // the shell has to grow to give back the area the dividers took
  const dShell = (2 * R) / Math.sqrt(Math.max(1 - blockage, 1e-6));
  const deltaV = Math.sqrt((2 * NU) / (TAU * Math.max(f, 1))) * 1000; // mm
  // knife-edge taper: the trailing edge thins from t to zero over this length
  const taperLen = knifeEdge;
  return {
    process: proc, tMin: proc.tMin, tooThin: t < proc.tMin,
    blockage, dShell, oversize: dShell - 2 * R,
    dividerTotal: throat.dividerTotal,
    deltaV, ra: proc.ra / 1000,
    roughRatio: proc.ra / 1000 / deltaV,
    taperLen,
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
//
// Objective: maximise the minimum cell first mode, max min f1. Because stage 3
// satisfies the area constraint by construction, this is an UNCONSTRAINED
// search over the stream-function coefficients plus the corner angle, which is
// why a derivative-free method on 10-20 parameters is enough. The softmin
//     -1/beta log sum exp(-beta f1_i)
// smooths the min-max so the simplex is not walking on a kink.

// Move every rim division point when the corner angle moves, by the piecewise
// linear map that carries the four old corners onto the four new ones.
export function remapAlpha(mesh, aOld, aNew) {
  const co = [-aOld, aOld, Math.PI - aOld, Math.PI + aOld, TAU - aOld];
  const cn = [-aNew, aNew, Math.PI - aNew, Math.PI + aNew, TAU - aNew];
  mesh.nodes.forEach((n) => {
    if (n.kind !== "rim") return;
    let k = 0;
    while (k < 3 && n.th > co[k + 1]) k++;
    const u = (n.th - co[k]) / (co[k + 1] - co[k]);
    n.th = cn[k] + u * (cn[k + 1] - cn[k]);
  });
  invalidateAll(mesh);
  mesh.alphaDeg = (aNew * R2D);
}

// SEEDING, ROBUSTLY.
//
// The elliptical map puts its own corners at 45 degrees, so seeding it
// straight at a small alpha shears the whole grid and the solve stalls — 8x3
// at the equal-arc 24.5 deg used to end at 42% spread. Walking alpha down from
// 45 in small steps, re-solving each time, keeps every step inside a good
// basin.
//
// The conformal seed needs none of that — its corners ARE the prevertices — but
// it has the opposite weakness: its cells start locally square, so on a grid
// whose index aspect is far from the rectangle's own aspect they start VERY
// unequal in area (300%+ on a 12x3), and no continuation rescues it. Seeding
// it at its "conformally natural" alpha is worse still, not better. So when it
// does not converge the tool falls back to the elliptical path and SAYS SO,
// rather than quietly reporting a layout whose areas are not equal.
function seedElliptical({ R, nc, nr, alphaDeg, bulge }, t, equalIters) {
  const nat = 45;
  if (Math.abs(alphaDeg - nat) < 8) {
    const mesh = buildHGrid({ R, nc, nr, alphaDeg, seed: "elliptical", bulge });
    return { mesh, eq: equaliseAreasStaged(mesh, { t, iters: equalIters }) };
  }
  const mesh = buildHGrid({ R, nc, nr, alphaDeg: nat, seed: "elliptical", bulge });
  let eq = equaliseAreas(mesh, { t, iters: equalIters });
  const steps = Math.max(2, Math.ceil(Math.abs(alphaDeg - nat) / 5));
  for (let k = 1; k <= steps; k++) {
    remapAlpha(mesh, (nat + ((alphaDeg - nat) * (k - 1)) / steps) * D2R,
      (nat + ((alphaDeg - nat) * k) / steps) * D2R);
    eq = equaliseAreas(mesh, { t, iters: Math.max(14, equalIters >> 1) });
  }
  if (eq.spread > 1e-7) eq = equaliseAreasStaged(mesh, { t, iters: equalIters });
  mesh.alphaDeg = alphaDeg;
  return { mesh, eq };
}

function seedHGridSolved(o, t, equalIters) {
  const { R, nc, nr, alphaDeg, seed, bulge } = o;
  if (seed !== "conformal") return seedElliptical(o, t, equalIters);
  const mesh = buildHGrid({ R, nc, nr, alphaDeg, seed: "conformal", bulge });
  const eq = equaliseAreasStaged(mesh, { t, iters: equalIters, stages: 6 });
  if (eq.spread < 1e-7) return { mesh, eq };
  const fb = seedElliptical(o, t, equalIters);
  return {
    ...fb, seedUsed: "elliptical",
    fallback: `The conformal seed did not reach equal areas at ${alphaDeg.toFixed(1)}° (best ${eq.spread.toFixed(1)}% spread) — its cells start locally square, which on this index aspect makes them start very unequal in area. Fell back to the elliptical seed.`,
  };
}

export function buildLayout(o) {
  const {
    family = "hgrid", R, nc = 6, nr = 3, alphaDeg, seed = "elliptical", bulge = true,
    rings = [1, 6, 12], hubR = 0, rotDeg = 0, m: bm = 2, p: bp = 2, coreFrac = 0.42,
    basis = null, coef = null, t = 0, c = 343,
    equalIters = 40, flowSteps = 24, correct = true, quality = 1,
  } = o;

  let mesh, eq1, seedDOF, fallback = null;
  if (family === "ogrid") {
    mesh = buildOGrid({ R, hubR, rings, rotDeg });
    seedDOF = getDOF(mesh);
    eq1 = equaliseAreas(mesh, { t, iters: equalIters });
  } else if (family === "butterfly") {
    mesh = buildButterfly({ R, m: bm, p: bp, alphaDeg: alphaDeg ?? 45, coreFrac, bulge });
    seedDOF = getDOF(mesh);
    eq1 = equaliseAreasStaged(mesh, { t, iters: equalIters });
  } else {
    const a = alphaDeg ?? equalArcAlphaDeg(nc, nr);
    const r = seedHGridSolved({ R, nc, nr, alphaDeg: a, seed, bulge }, t, equalIters);
    mesh = r.mesh; eq1 = r.eq; fallback = r.fallback || null;
    seedDOF = getDOF(mesh);
  }
  let drift = null, driftOpen = null;
  if (basis && coef && coef.some((v) => v) && mesh.dof.length) {
    // The divergence-free property is a statement about GEOMETRIC area. Open
    // area is geometric area minus t/2 per shared edge, and the flow does move
    // edge lengths, so open area legitimately shifts and is corrected after.
    const before = mesh.cells.map((_, i) => cellArea(mesh, i));
    const beforeOpen = mesh.cells.map((_, i) => cellOpenArea(mesh, i, t));
    flowMesh(mesh, basis, coef, flowSteps, quality >= 1 ? 16 : 6);
    const after = mesh.cells.map((_, i) => cellArea(mesh, i));
    const afterOpen = mesh.cells.map((_, i) => cellOpenArea(mesh, i, t));
    drift = Math.max(...after.map((v, i) => Math.abs(v - before[i]) / before[i])) * 100;
    driftOpen = Math.max(...afterOpen.map((v, i) => Math.abs(v - beforeOpen[i]) / beforeOpen[i])) * 100;
    if (correct) equaliseAreas(mesh, { t, iters: Math.max(8, quality * 10), tikhonov: 0 });
  }
  const now = getDOF(mesh);
  const scl = mesh.dof.map((d) => dofScale(mesh, d));
  const disp = mesh.dof.length
    ? Math.sqrt(now.reduce((s, v, k) => s + ((v - seedDOF[k]) / scl[k]) ** 2, 0) / mesh.dof.length)
    : 0;
  return { mesh, seedSpread: eq1.spread, driftPct: drift, driftOpenPct: driftOpen, seedDisp: disp, fallback };
}

// A deep copy, so the optimiser can flow the same equalised base hundreds of
// times without paying for the base solve each round. `sides` and `dividerEdges`
// are read-only index lists and are shared.
export function cloneMesh(src) {
  const m = {
    ...src,
    nodes: src.nodes.map((n) => ({ ...n })),
    edges: src.edges.map((e) => ({ ...e, bulge: e.bulge.slice() })),
    cells: src.cells.map((cl) => ({ ...cl })),
    ringR: src.ringR ? src.ringR.slice() : undefined,
    eA: Float64Array.from(src.eA),
    eL: Float64Array.from(src.eL),
    eValid: Uint8Array.from(src.eValid),
  };
  return m;
}

export function objective(mesh, throat, map, w) {
  const { aspectTarget = 1.6, wAspect = 0.6, wTwist = 0.5, wSeed = 0.4, beta = 1.2, seedDisp = 0 } = w;
  const f = throat.cells.map((x) => x.f1 / 1000);
  const fmin = Math.min(...f);
  const soft = fmin - (1 / beta) * Math.log(f.reduce((s, v) => s + Math.exp(-beta * (v - fmin)), 0));
  let asp = 0;
  throat.cells.forEach((x) => { const e = Math.max(0, x.aspect - aspectTarget); asp += e * e; });
  asp /= throat.cells.length;
  const twist = map ? map.twistMax / 10 : 0;
  return {
    J: -soft + wAspect * asp + wTwist * twist + wSeed * 10 * seedDisp,
    soft, fmin, aspectPenalty: asp, twistPenalty: twist, seedPenalty: seedDisp,
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
