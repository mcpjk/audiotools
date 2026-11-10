// Physics for CavityModes.jsx — a plain module, no React and no colour, so that
// scripts/test-cavity.mjs can import it under node and check it against closed
// forms. See the comment block at the top of CavityModes.jsx for the model,
// its assumptions and the direction of error of each simplification.
//
// It is the arbitrary-shape counterpart of box-modes-model.js. That module
// gets its modes from cosines; this one gets them numerically, from a
// triangle mesh of the air space, and then uses the SAME modal sum for the
// forced response. Everything below is in metres; the STL's own unit is
// converted once, at import.
//
// Pipeline:
//   parseSTL        bytes → triangle soup
//   voxelise        triangles → a regular grid with, per cell, the fraction
//                   that is air and, per cell face, the fraction that is open
//                   ("cut cells"). Partial cells keep curved and slanted walls
//                   second-order accurate instead of staircased.
//   buildOperator   finite-volume Laplacian on that grid: K·p = λ·M·p, with
//                   M = diag(air fraction) and λ = k². Rigid walls are
//                   implicit — a closed face carries no flux.
//   solveModes      shift-invert Lanczos for every mode up to a cut-off,
//                   with conjugate-gradient inner solves. No libraries.
//   staticTail      one more solve: the stiffness of every mode ABOVE the
//                   cut-off, added back so that a modest mode count still
//                   gives the right response well below it.

// ── STL ─────────────────────────────────────────────────────────────────────
// Returns Float64Array, 9 numbers per triangle (three xyz vertices), scaled to
// metres. Binary is detected by its exact length (84 + 50·n); anything else
// is read as ASCII.
export function parseSTL(buf, unitToMetres = 0.001) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + 50 * n === bytes.length) {
      const out = new Float64Array(9 * n);
      for (let t = 0; t < n; t++) {
        const o = 84 + 50 * t + 12;
        for (let q = 0; q < 9; q++) out[9 * t + q] = dv.getFloat32(o + 4 * q, true) * unitToMetres;
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(bytes);
  const nums = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1] * unitToMetres, +m[2] * unitToMetres, +m[3] * unitToMetres);
  if (nums.length === 0 || nums.length % 9) throw new Error("Not a readable STL: no complete triangles found.");
  return Float64Array.from(nums);
}

// Binary STL writer — used by the tests to round-trip analytic shapes through
// the same parser a user's file goes through. Values in metres are written
// as `1 / unitToMetres` units (mm by default).
export function writeSTL(tris, unitToMetres = 0.001) {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + 50 * t;
    for (let q = 0; q < 9; q++) dv.setFloat32(o + 12 + 4 * q, tris[9 * t + q] / unitToMetres, true);
  }
  return buf;
}

export function bounds(tris) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3)
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], tris[i + a]); hi[a] = Math.max(hi[a], tris[i + a]); }
  return { lo, hi };
}

// Signed volume by the divergence theorem. Positive for outward-wound
// triangles; the voxeliser does not care about winding, so the magnitude is
// what is reported.
export function meshVolume(tris) {
  let v = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

// ── voxeliser ───────────────────────────────────────────────────────────────
// Every measurement is made with rays parallel to x. A ray at (y, z) crosses
// the surface an even number of times if the mesh is closed; sorted, the
// crossings pair up into air intervals along x. From those intervals:
//   air fraction of a cell   mean, over ns×ns rays through the cell, of the
//                            length of air inside it / h
//   open fraction of an x-face   share of those same rays that are in air at
//                            the face's x
//   open fraction of a y-face    ns rays lying IN the face plane (y = j·h),
//                            mean air length across the face / h; z likewise
// Ray positions carry a tiny irrational offset so that no ray passes exactly
// through a mesh vertex or edge, which would count a crossing twice. A ray
// with an odd crossing count means a hole in the mesh: it is dropped and
// counted, and the count is reported as a watertightness warning.
export function voxelise(tris, h, opts = {}) {
  const ns = opts.ns ?? 4;
  const { lo, hi } = bounds(tris);
  const origin = lo.map((v) => v - h);
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 2;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 2;
  const nCell = nx * ny * nz;
  const id = (i, j, k) => (i * ny + j) * nz + k;
  const V = new Float32Array(nCell), Ax = new Float32Array(nCell), Ay = new Float32Array(nCell), Az = new Float32Array(nCell);

  // bucket triangles by the (j, k) column their yz bounding box touches
  const nT = tris.length / 9;
  const buckets = Array.from({ length: ny * nz }, () => []);
  for (let t = 0; t < nT; t++) {
    const o = 9 * t;
    const y0 = Math.min(tris[o + 1], tris[o + 4], tris[o + 7]), y1 = Math.max(tris[o + 1], tris[o + 4], tris[o + 7]);
    const z0 = Math.min(tris[o + 2], tris[o + 5], tris[o + 8]), z1 = Math.max(tris[o + 2], tris[o + 5], tris[o + 8]);
    const j0 = Math.max(0, Math.floor((y0 - origin[1]) / h) - 1), j1 = Math.min(ny - 1, Math.floor((y1 - origin[1]) / h) + 1);
    const k0 = Math.max(0, Math.floor((z0 - origin[2]) / h) - 1), k1 = Math.min(nz - 1, Math.floor((z1 - origin[2]) / h) + 1);
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) buckets[j * nz + k].push(t);
  }

  const xs = [];
  let badRays = 0, rays = 0;
  // air intervals along x for the ray at (y, z); null if the ray is broken
  const cast = (y, z, bucket) => {
    xs.length = 0;
    for (const t of bucket) {
      const o = 9 * t;
      const ay = tris[o + 1] - y, az = tris[o + 2] - z;
      const by = tris[o + 4] - y, bz = tris[o + 5] - z;
      const cy = tris[o + 7] - y, cz = tris[o + 8] - z;
      // edge functions of the projected triangle about the ray point
      const wa = by * cz - bz * cy, wb = cy * az - cz * ay, wc = ay * bz - az * by;
      if ((wa > 0 && wb > 0 && wc > 0) || (wa < 0 && wb < 0 && wc < 0)) {
        const s = wa + wb + wc;
        xs.push((wa * tris[o] + wb * tris[o + 3] + wc * tris[o + 6]) / s);
      }
    }
    rays++;
    if (xs.length % 2) { badRays++; return null; }
    xs.sort((p, q) => p - q);
    return xs;
  };
  // accumulate interval overlap with cells along x into arr at (j, k), scaled
  const addLengths = (iv, j, k, arr, scale) => {
    for (let p = 0; p < iv.length; p += 2) {
      const a = (iv[p] - origin[0]) / h, b = (iv[p + 1] - origin[0]) / h;
      const ia = Math.max(0, Math.floor(a)), ib = Math.min(nx - 1, Math.floor(b));
      for (let i = ia; i <= ib; i++) {
        const len = Math.min(b, i + 1) - Math.max(a, i);
        if (len > 0) arr[id(i, j, k)] += len * scale;
      }
    }
  };
  const jit1 = 1.2345e-7 * h, jit2 = 2.7183e-7 * h;
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const bucket = buckets[j * nz + k];
    if (bucket.length === 0) continue;
    // volume rays (also give x-face apertures)
    for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) {
      const y = origin[1] + (j + (a + 0.5) / ns) * h + jit1, z = origin[2] + (k + (b + 0.5) / ns) * h + jit2;
      const iv = cast(y, z, bucket);
      if (!iv) continue;
      addLengths(iv, j, k, V, 1 / (ns * ns));
      for (let p = 0; p < iv.length; p += 2) {
        const i0 = Math.ceil((iv[p] - origin[0]) / h), i1 = Math.floor((iv[p + 1] - origin[0]) / h);
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) Ax[id(i, j, k)] += 1 / (ns * ns);
      }
    }
    // y-face rays: in the plane y = j·h (the low face of row j)
    for (let b = 0; b < ns; b++) {
      const y = origin[1] + j * h + jit1, z = origin[2] + (k + (b + 0.5) / ns) * h + jit2;
      const iv = cast(y, z, buckets[j * nz + k]);
      if (iv) addLengths(iv, j, k, Ay, 1 / ns);
    }
    // z-face rays: in the plane z = k·h
    for (let a = 0; a < ns; a++) {
      const y = origin[1] + (j + (a + 0.5) / ns) * h + jit1, z = origin[2] + k * h + jit2;
      const iv = cast(y, z, buckets[j * nz + k]);
      if (iv) addLengths(iv, j, k, Az, 1 / ns);
    }
  }
  for (let q = 0; q < nCell; q++) {
    V[q] = Math.min(1, V[q]); Ax[q] = Math.min(1, Ax[q]); Ay[q] = Math.min(1, Ay[q]); Az[q] = Math.min(1, Az[q]);
  }
  return { nx, ny, nz, h, origin, V, Ax, Ay, Az, badRays, rays };
}

// ── the operator ────────────────────────────────────────────────────────────
// Cells with air fraction below vMin are dropped: they hold almost no mass
// and only slow the solver. Only the largest connected air region is kept —
// a sealed sub-chamber elsewhere in the file would otherwise add its own
// zero-frequency mode and confuse the lumped reference. Its volume is
// reported so it does not vanish silently.
//
// K is stored face by face: K·x = Σ_faces w·(x_i − x_j) on i and the
// opposite on j, with w = open fraction / h². M = air fraction, per cell.
export function buildOperator(vox, opts = {}) {
  const vMin = opts.vMin ?? 0.02;
  const { nx, ny, nz, h, V, Ax, Ay, Az } = vox;
  const nCell = nx * ny * nz;
  const id = (i, j, k) => (i * ny + j) * nz + k;
  // connected components over open faces
  const comp = new Int32Array(nCell).fill(-1);
  const sizes = [];
  const stack = new Int32Array(nCell);
  for (let s = 0; s < nCell; s++) {
    if (comp[s] >= 0 || V[s] < vMin) continue;
    const label = sizes.length; let vol = 0, top = 0;
    stack[top++] = s; comp[s] = label;
    while (top) {
      const q = stack[--top]; vol += V[q];
      const k = q % nz, j = ((q - k) / nz) % ny, i = (q - k - j * nz) / (ny * nz);
      const nb = [];
      if (i > 0 && Ax[q] > 0) nb.push(q - ny * nz);
      if (i < nx - 1 && Ax[q + ny * nz] > 0) nb.push(q + ny * nz);
      if (j > 0 && Ay[q] > 0) nb.push(q - nz);
      if (j < ny - 1 && Ay[q + nz] > 0) nb.push(q + nz);
      if (k > 0 && Az[q] > 0) nb.push(q - 1);
      if (k < nz - 1 && Az[q + 1] > 0) nb.push(q + 1);
      for (const r of nb) if (comp[r] < 0 && V[r] >= vMin) { comp[r] = label; stack[top++] = r; }
    }
    sizes.push(vol);
  }
  let keep = 0;
  for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[keep]) keep = c;
  const dropped = sizes.filter((_, c) => c !== keep).reduce((a, b) => a + b, 0) * h ** 3;

  const index = new Int32Array(nCell).fill(-1);
  const cells = [];
  for (let q = 0; q < nCell; q++) if (comp[q] === keep) { index[q] = cells.length; cells.push(q); }
  const N = cells.length;
  const mass = new Float64Array(N);
  for (let n = 0; n < N; n++) mass[n] = V[cells[n]];
  const fi = [], fj = [], fw = [];
  const ih2 = 1 / (h * h);
  for (let n = 0; n < N; n++) {
    const q = cells[n];
    const k = q % nz, j = ((q - k) / nz) % ny, i = (q - k - j * nz) / (ny * nz);
    // each face once: the high-side neighbour, whose LOW face it is
    if (i < nx - 1) { const r = index[q + ny * nz]; if (r >= 0 && Ax[q + ny * nz] > 0) { fi.push(n); fj.push(r); fw.push(Ax[q + ny * nz] * ih2); } }
    if (j < ny - 1) { const r = index[q + nz]; if (r >= 0 && Ay[q + nz] > 0) { fi.push(n); fj.push(r); fw.push(Ay[q + nz] * ih2); } }
    if (k < nz - 1) { const r = index[q + 1]; if (r >= 0 && Az[q + 1] > 0) { fi.push(n); fj.push(r); fw.push(Az[q + 1] * ih2); } }
  }
  const diag = new Float64Array(N);
  for (let f = 0; f < fw.length; f++) { diag[fi[f]] += fw[f]; diag[fj[f]] += fw[f]; }
  let Vf = 0; for (let n = 0; n < N; n++) Vf += mass[n];
  return {
    N, cells, index, mass, diag, Vf, volume: Vf * h ** 3, droppedVolume: dropped,
    fi: Int32Array.from(fi), fj: Int32Array.from(fj), fw: Float64Array.from(fw),
    grid: { nx, ny, nz, h, origin: vox.origin },
  };
}

// y = (K + σM)·x
function applyShifted(op, x, y, sigma) {
  const { N, fi, fj, fw, diag, mass } = op;
  for (let n = 0; n < N; n++) y[n] = (diag[n] + sigma * mass[n]) * x[n];
  for (let f = 0; f < fw.length; f++) {
    const i = fi[f], j = fj[f], w = fw[f];
    y[i] -= w * x[j]; y[j] -= w * x[i];
  }
}

// Jacobi-preconditioned conjugate gradient on (K + σM)·x = b. σ > 0 keeps it
// positive definite. With σ = 0 the system is singular (a rigid box has a
// zero-frequency mode); it is still solvable for a right-hand side that sums
// to zero, and the solution is returned with its M-weighted mean removed.
export function solveShifted(op, b, sigma, tol = 1e-10, maxIt = 20000, x0 = null) {
  const { N, diag, mass } = op;
  const x = x0 ? Float64Array.from(x0) : new Float64Array(N);
  const r = new Float64Array(N), z = new Float64Array(N), p = new Float64Array(N), q = new Float64Array(N);
  const pre = new Float64Array(N);
  for (let n = 0; n < N; n++) pre[n] = 1 / (diag[n] + sigma * mass[n] || 1);
  applyShifted(op, x, q, sigma);
  let bn = 0;
  for (let n = 0; n < N; n++) { r[n] = b[n] - q[n]; bn += b[n] * b[n]; }
  bn = Math.sqrt(bn) || 1;
  let rz = 0;
  for (let n = 0; n < N; n++) { z[n] = pre[n] * r[n]; p[n] = z[n]; rz += r[n] * z[n]; }
  let it = 0;
  for (; it < maxIt; it++) {
    applyShifted(op, p, q, sigma);
    let pq = 0; for (let n = 0; n < N; n++) pq += p[n] * q[n];
    const alpha = rz / pq;
    let rr = 0;
    for (let n = 0; n < N; n++) { x[n] += alpha * p[n]; r[n] -= alpha * q[n]; rr += r[n] * r[n]; }
    if (Math.sqrt(rr) < tol * bn) break;
    let rz2 = 0;
    for (let n = 0; n < N; n++) { z[n] = pre[n] * r[n]; rz2 += r[n] * z[n]; }
    const beta = rz2 / rz; rz = rz2;
    for (let n = 0; n < N; n++) p[n] = z[n] + beta * p[n];
  }
  if (sigma === 0) {
    let s = 0, m = 0;
    for (let n = 0; n < N; n++) { s += mass[n] * x[n]; m += mass[n]; }
    for (let n = 0; n < N; n++) x[n] -= s / m;
  }
  return { x, iterations: it };
}

// ── symmetric tridiagonal eigensolver (implicit QL, after EISPACK tql2) ─────
// d: diagonal (n), e: sub-diagonal (n, e[0] unused). Returns eigenvalues and
// the eigenvector matrix Z (column-major in a flat array: Z[i + n·j] is
// component i of vector j).
export function tridiagEig(dIn, eIn) {
  const n = dIn.length;
  const d = Float64Array.from(dIn), e = new Float64Array(n);
  for (let i = 1; i < n; i++) e[i - 1] = eIn[i];
  const Z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) Z[i + n * i] = 1;
  for (let l = 0; l < n; l++) {
    let iter = 0, m;
    do {
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= 1e-15 * dd) break;
      }
      if (m !== l) {
        if (iter++ > 60) throw new Error("tridiagEig: no convergence");
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1, c = 1, p = 0, i;
        for (i = m - 1; i >= l; i--) {
          let f = s * e[i]; const b = c * e[i];
          r = Math.hypot(f, g); e[i + 1] = r;
          if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
          s = f / r; c = g / r;
          g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b;
          p = s * r; d[i + 1] = g + p; g = c * r - b;
          for (let k = 0; k < n; k++) {
            f = Z[k + n * (i + 1)];
            Z[k + n * (i + 1)] = s * Z[k + n * i] + c * f;
            Z[k + n * i] = c * Z[k + n * i] - s * f;
          }
        }
        if (r === 0 && i >= l) continue;
        d[l] -= p; e[l] = g; e[m] = 0;
      }
    } while (m !== l);
  }
  return { values: d, Z };
}

// ── modes ───────────────────────────────────────────────────────────────────
// Lanczos on the shift-inverted operator (K + σM)⁻¹M, in the M inner product.
// Its eigenvalues θ = 1/(λ + σ) are largest for the lowest modes, which is
// the end Lanczos finds first. Basis vectors are kept (in single precision,
// to halve memory) and fully re-orthogonalised, twice, every step — without
// that, converged modes reappear as spurious copies.
//
// σ trades inner against outer work: a larger σ makes each CG solve cheaper
// (K + σM is better conditioned) but squeezes the wanted θ together so that
// Lanczos needs more steps. σ = λcut/4 was the fastest in the tests.
//
// Returns modes sorted by frequency with M-normalised shapes φ (φᵀMφ = 1).
export function solveModes(op, kCut, opts = {}) {
  const { N, mass } = op;
  const lamCut = kCut * kCut;
  const sigma = opts.sigma ?? lamCut / 4;
  const tol = opts.tol ?? 1e-8;
  const maxSteps = Math.min(opts.maxSteps ?? 3000, N);
  const onProgress = opts.onProgress ?? (() => {});
  const thetaCut = 1 / (lamCut + sigma);

  const Q = [];
  const alpha = [], beta = [0];
  let q = new Float64Array(N);
  // start vector: smooth and pseudo-random, so it touches every mode
  let s0 = 0.123;
  for (let n = 0; n < N; n++) { s0 = (s0 * 9301 + 0.49297) % 1; q[n] = s0 - 0.5; }
  const mnorm = (v) => { let s = 0; for (let n = 0; n < N; n++) s += mass[n] * v[n] * v[n]; return Math.sqrt(s); };
  let nq = mnorm(q); for (let n = 0; n < N; n++) q[n] /= nq;
  let qPrev = null;
  const rhs = new Float64Array(N);
  let cgIts = 0, done = false, step = 0, eig = null;
  let guess = null;
  for (step = 0; step < maxSteps; step++) {
    Q.push(Float32Array.from(q));
    for (let n = 0; n < N; n++) rhs[n] = mass[n] * q[n];
    const sol = solveShifted(op, rhs, sigma, opts.cgTol ?? 1e-10, 20000, guess);
    cgIts += sol.iterations;
    const w = sol.x;
    let a = 0; for (let n = 0; n < N; n++) a += mass[n] * q[n] * w[n];
    alpha.push(a);
    for (let n = 0; n < N; n++) w[n] -= a * q[n] + (qPrev ? beta[step] * qPrev[n] : 0);
    for (let pass = 0; pass < 2; pass++)
      for (const v of Q) {
        let dot = 0; for (let n = 0; n < N; n++) dot += mass[n] * v[n] * w[n];
        for (let n = 0; n < N; n++) w[n] -= dot * v[n];
      }
    const b = mnorm(w);
    // test convergence every 10 steps, and whenever the Krylov space closes
    if ((step + 1) % 10 === 0 || b < 1e-12 || step === maxSteps - 1) {
      eig = tridiagEig(Float64Array.from(alpha), Float64Array.from(beta));
      const m = alpha.length;
      let wanted = 0, conv = 0;
      for (let i = 0; i < m; i++) {
        const th = eig.values[i];
        if (th < thetaCut) continue;
        wanted++;
        if (Math.abs(b * eig.Z[(m - 1) + m * i]) <= tol * Math.abs(th)) conv++;
      }
      // done when every Ritz value above the cut has converged AND the
      // largest unconverged one is safely below it — a mode just under the
      // cut-off has had time to appear
      let topUnconv = 0;
      for (let i = 0; i < m; i++) {
        const th = eig.values[i];
        if (Math.abs(b * eig.Z[(m - 1) + m * i]) > tol * Math.abs(th)) topUnconv = Math.max(topUnconv, th);
      }
      onProgress({ step: step + 1, wanted, converged: conv, cgIterations: cgIts });
      if ((wanted > 0 && conv === wanted && topUnconv < 0.9 * thetaCut) || b < 1e-12) { done = true; beta.push(b); break; }
    }
    beta.push(b);
    qPrev = Q[Q.length - 1];
    guess = null;
    const qn = new Float64Array(N); for (let n = 0; n < N; n++) qn[n] = w[n] / b;
    q = qn;
  }
  const m = alpha.length;
  if (!eig || eig.values.length !== m) eig = tridiagEig(Float64Array.from(alpha), Float64Array.from(beta.slice(0, m)));
  const picks = [];
  for (let i = 0; i < m; i++) if (eig.values[i] >= thetaCut) picks.push(i);
  picks.sort((i, j) => eig.values[j] - eig.values[i]);
  const modes = picks.map((i) => {
    const phi = new Float32Array(N);
    for (let j = 0; j < m; j++) {
      const c = eig.Z[j + m * i];
      if (c === 0) continue;
      const v = Q[j];
      for (let n = 0; n < N; n++) phi[n] += c * v[n];
    }
    const lam = Math.max(0, 1 / eig.values[i] - sigma);
    return { lambda: lam, k: Math.sqrt(lam), phi };
  });
  return { modes, converged: done, steps: m, cgIterations: cgIts, sigma };
}

// ── turning numerical modes into the box-modes vocabulary ──────────────────
// box-modes-model.js writes a mode as ψ with peak ±1 and weight V/Λ (1, 2, 4,
// 8 for a rectangle). The same convention here: ψ = φ/max|φ|, and
// weight = Vf·max|φ|² because φ is M-normalised (Σ M φ² = 1). The uniform
// mode comes out as ψ ≡ 1, weight 1, exactly as in the rectangular tool,
// and is flagged rather than recognised by its weight.
export function normaliseModes(op, modes, c) {
  return modes.map((m, i) => {
    let peak = 0;
    for (let n = 0; n < op.N; n++) peak = Math.max(peak, Math.abs(m.phi[n]));
    const psi = new Float32Array(op.N);
    for (let n = 0; n < op.N; n++) psi[n] = m.phi[n] / peak;
    return { f: (m.k * c) / (2 * Math.PI), k: m.k, weight: op.Vf * peak * peak, psi, uniform: i === 0 && m.lambda * op.grid.h ** 2 < 1e-6 };
  });
}

// ── apertures: which cells a cone or a port mouth sees ──────────────────────
// A functional is { idx: Int32Array, w: Float64Array } with Σw = 1; the
// average of a field over it is Σ w·field[idx].
export function cellAt(op, p) {
  const { nx, ny, nz, h, origin } = op.grid;
  const i = Math.floor((p[0] - origin[0]) / h), j = Math.floor((p[1] - origin[1]) / h), k = Math.floor((p[2] - origin[2]) / h);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
  return op.index[(i * ny + j) * nz + k];
}

// nearest air cell within `reach` metres, searching outward shell by shell
export function nearestCell(op, p, reach) {
  const { h } = op.grid;
  const direct = cellAt(op, p);
  if (direct >= 0) return direct;
  const steps = Math.ceil(reach / h);
  let best = -1, bestD = Infinity;
  for (let a = -steps; a <= steps; a++) for (let b = -steps; b <= steps; b++) for (let c = -steps; c <= steps; c++) {
    const q = [p[0] + a * h, p[1] + b * h, p[2] + c * h];
    const n = cellAt(op, q);
    const d = a * a + b * b + c * c;
    if (n >= 0 && d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// Closest point on triangle abc to p (Ericson, Real-Time Collision
// Detection §5.1.5). Returns the squared distance.
function triDist2(p, t, T, out = null) {
  const a = [T[t], T[t + 1], T[t + 2]], b = [T[t + 3], T[t + 4], T[t + 5]], c = [T[t + 6], T[t + 7], T[t + 8]];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (u, s, v) => [u[0] + s * v[0], u[1] + s * v[1], u[2] + s * v[2]];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) q = b;
    else if (d6 >= 0 && d5 <= d6) q = c;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) q = at(a, d1 / (d1 - d3), ab);
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = at(a, d2 / (d2 - d6), ac);
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) q = at(b, (d4 - d3) / ((d4 - d3) + (d5 - d6)), sub(c, b));
    else {
      const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
      q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
    }
  }
  if (out) { out[0] = q[0]; out[1] = q[1]; out[2] = q[2]; }
  const d = sub(p, q);
  return dot(d, d);
}

// Wall normal near p, pointing INTO the air: the area-weighted normal of
// every triangle within `radius` of p. STL winding is not trusted: each
// triangle is flipped to agree with the running sum, and the final sign is
// chosen by which side of the wall has air.
export function wallNormal(op, tris, p, radius) {
  const nrm = [0, 0, 0];
  let best = Infinity, bestT = -1;
  for (let t = 0; t < tris.length; t += 9) {
    const d2 = triDist2(p, t, tris);
    if (d2 < best) { best = d2; bestT = t; }
  }
  const use = [];
  for (let t = 0; t < tris.length; t += 9) if (t === bestT || triDist2(p, t, tris) <= radius * radius) use.push(t);
  // seed the orientation with the nearest triangle
  use.sort((x, y) => (x === bestT ? -1 : y === bestT ? 1 : 0));
  for (const t of use) {
    const ux = tris[t + 3] - tris[t], uy = tris[t + 4] - tris[t + 1], uz = tris[t + 5] - tris[t + 2];
    const vx = tris[t + 6] - tris[t], vy = tris[t + 7] - tris[t + 1], vz = tris[t + 8] - tris[t + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nrm[0] + ny * nrm[1] + nz * nrm[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nrm[0] += nx; nrm[1] += ny; nrm[2] += nz;
  }
  const L = Math.hypot(...nrm);
  if (L === 0) return null;
  const n = nrm.map((v) => v / L);
  const step = 1.5 * op.grid.h;
  const inside = (s) => cellAt(op, [p[0] + s * n[0], p[1] + s * n[1], p[2] + s * n[2]]) >= 0;
  return inside(step) || !inside(-step) ? n : n.map((v) => -v);
}

// the nearest point on the mesh to p, and its distance, metres
export function closestWallPoint(tris, p) {
  let best = Infinity;
  const q = [0, 0, 0], point = [0, 0, 0];
  for (let t = 0; t < tris.length; t += 9) {
    const d2 = triDist2(p, t, tris, q);
    if (d2 < best) { best = d2; point[0] = q[0]; point[1] = q[1]; point[2] = q[2]; }
  }
  return { point, distance: Math.sqrt(best) };
}

// A prism: polygon `profile` of [z, y] points (metres) in the side view,
// extruded across x from 0 to W. Used for the built-in demo — a box with a
// slanted back, which no rectangular model can represent.
export function prismMesh(profile, W) {
  const out = [];
  const n = profile.length;
  const P = (x, i) => [x, profile[i][1], profile[i][0]];
  for (let i = 1; i < n - 1; i++) { // fan-triangulate the two end caps (convex profile)
    out.push(...P(0, 0), ...P(0, i + 1), ...P(0, i));
    out.push(...P(W, 0), ...P(W, i), ...P(W, i + 1));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(...P(0, i), ...P(0, j), ...P(W, j), ...P(0, i), ...P(W, j), ...P(W, i));
  }
  return Float64Array.from(out);
}

// Area-weighted disc of radius `radius` centred on p in the plane normal to
// n, sampled on the same ring layout as box-modes-model.js discPoints. Each
// sample is pushed `inset` into the air along n and lands on the nearest air
// cell. Duplicate cells merge their weights.
export function discFunctional(op, p, n, radius, opts = {}) {
  const rings = opts.rings ?? 8;
  const inset = opts.inset ?? 0.5 * op.grid.h;
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const acc = new Map();
  const put = (du, dv, w) => {
    splat(op, [0, 1, 2].map((i) => p[i] + du * u[i] + dv * v[i] + inset * n[i]), w, acc);
  };
  const d = radius / (rings + 0.5);
  put(0, 0, (Math.PI * d * d) / 4);
  for (let i = 1; i <= rings; i++) {
    const r = d * Math.sqrt(i * i + 0.25), nPts = 6 * i, w = (2 * Math.PI * i * d * d) / nPts;
    for (let j = 0; j < nPts; j++) {
      const ang = (2 * Math.PI * (j + 0.5 * (i % 2))) / nPts;
      put(r * Math.cos(ang), r * Math.sin(ang), w);
    }
  }
  return toFunctional(acc);
}

// a × b rectangle centred on p, normal to axis `normalAxis` (0, 1, 2)
export function rectFunctional(op, p, a, b, normalAxis, N = 7) {
  const [u, v] = [0, 1, 2].filter((x) => x !== normalAxis);
  const acc = new Map();
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const q = [...p];
    q[u] += a * ((i + 0.5) / N - 0.5); q[v] += b * ((j + 0.5) / N - 0.5);
    splat(op, q, 1, acc);
  }
  return toFunctional(acc);
}

// Spread weight w at point q over the (up to) eight air-cell centres around
// it, trilinearly — a field read through this is second-order accurate in
// h. Taking the nearest cell instead is first-order: on a 12.5 mm grid it
// put one mode's coupling 3.5% off, which the closed-form test caught.
// Corners of the stencil that fall in solid are dropped and the rest
// renormalised; with none left, the nearest air cell takes it all.
function splat(op, q, w, acc) {
  const { nx, ny, nz, h, origin } = op.grid;
  const fx = (q[0] - origin[0]) / h - 0.5, fy = (q[1] - origin[1]) / h - 0.5, fz = (q[2] - origin[2]) / h - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
  const tx = fx - i0, ty = fy - j0, tz = fz - k0;
  const parts = [];
  let sum = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const i = i0 + a, j = j0 + b, k = k0 + c;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    const n = op.index[(i * ny + j) * nz + k];
    const wt = (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz);
    if (n < 0 || wt === 0) continue;
    parts.push([n, wt]); sum += wt;
  }
  if (sum === 0) {
    const n = nearestCell(op, q, 2 * h);
    if (n >= 0) acc.set(n, (acc.get(n) ?? 0) + w);
    return;
  }
  for (const [n, wt] of parts) acc.set(n, (acc.get(n) ?? 0) + (w * wt) / sum);
}

// point probe: the functional of a single point
export function pointFunctional(op, p) {
  const acc = new Map();
  splat(op, p, 1, acc);
  return toFunctional(acc);
}

function toFunctional(acc) {
  const idx = Int32Array.from(acc.keys()), w = Float64Array.from(acc.values());
  const s = w.reduce((x, y) => x + y, 0) || 1;
  for (let i = 0; i < w.length; i++) w[i] /= s;
  return { idx, w };
}

export function average(fn, field) {
  let s = 0;
  for (let i = 0; i < fn.idx.length; i++) s += fn.w[i] * field[fn.idx[i]];
  return s;
}

// ── the tail: every mode above the cut-off ──────────────────────────────────
// Well below its own resonance a mode's term in the sum is
//   −k²·w·ψ̄s·ψ̄r / (k_n² − k²)  =  −k²·w·ψ̄s·ψ̄r · (1/k_n² + k²/k_n⁴ + …)
// with no resonance in it. Summed over every mode above the cut-off, the
// first two orders are two numbers per receiver,
//   T1(r) = Σ_{n>cut} w ψ̄s ψ̄r / k_n²      (a spring)
//   T2(r) = Σ_{n>cut} w ψ̄s ψ̄r / k_n⁴      (its first dynamic correction)
// The sums over ALL modes are what two static solves give exactly — the
// pseudo-inverse of K applied once and twice to the source — so the tail is
// "all modes, statically" minus "the modes kept, statically". Both are
// fields, so they serve every receiver at once.
//
// Measured on the analytic box (scripts/test-cavity.mjs): with modes to 1.5×
// the frequency read, T1 alone roughly halves the error of plain truncation;
// T1 + T2 removes most of what is left. The neglected next order is
// (f/f_cut)⁴ relative — 20% of the tail's own size at f = f_cut/1.5.
//
// In M-normalised form Σ_{n≥1} φ_n(s)·φ_n(r)/λ_n = (K⁺ s)(r); the box-modes
// weight is folded in by multiplying by Vf.
export function staticFields(op, src) {
  const { N, mass, Vf } = op;
  const b = new Float64Array(N);
  for (let i = 0; i < src.idx.length; i++) b[src.idx[i]] += src.w[i];
  // remove the uniform component, b − M·1·(Σb)/Vf, or a closed box has no
  // static solution
  for (let n = 0; n < N; n++) b[n] -= mass[n] / Vf;
  const z1 = solveShifted(op, b, 0, 1e-10, 50000).x;
  const b2 = new Float64Array(N);
  for (let n = 0; n < N; n++) b2[n] = mass[n] * z1[n]; // already M-mean zero
  const z2 = solveShifted(op, b2, 0, 1e-10, 50000).x;
  for (let n = 0; n < N; n++) { z1[n] *= Vf; z2[n] *= Vf; }
  return { z1, z2 }; // Σ_{n≥1} w ψ_n(s) ψ_n(·) / k_n² and / k_n⁴, every mode
}

// Precompute what a sweep needs for one source and one receiver: pairs
// { mode, s, r } and the two tail constants.
export function couple(modes, src, rcv, statics) {
  const pairs = modes.map((mode) => ({ mode, s: average(src, mode.psi), r: average(rcv, mode.psi) }));
  let k1 = 0, k2 = 0;
  for (const p of pairs) {
    if (p.mode.uniform || !(p.mode.k > 0)) continue;
    const g = p.mode.weight * p.s * p.r, kk = p.mode.k * p.mode.k;
    k1 += g / kk; k2 += g / (kk * kk);
  }
  const t1 = statics ? average(rcv, statics.z1) - k1 : 0;
  const t2 = statics ? average(rcv, statics.z2) - k2 : 0;
  return { pairs, t1, t2 };
}

// R = p/p₀ — the same quantity as box-modes-model.js ratio() — plus the tail:
//   R = 1 + Σ_kept (−k²·w)·ψ̄s·ψ̄r/(k_n² − k² + j·k·k_n/Q) − k²·(T1 + k²·T2)
export function ratio(f, coupling, c, Q) {
  const { pairs, t1 = 0, t2 = 0 } = coupling;
  const k = (2 * Math.PI * f) / c, k2 = k * k;
  let re = -k2 * (t1 + k2 * t2), im = 0;
  for (const { mode, s, r } of pairs) {
    if (mode.uniform) { re += s * r; continue; }
    const num = -k2 * mode.weight * s * r;
    const dr = mode.k * mode.k - k2;
    const di = Q > 0 && isFinite(Q) ? (k * mode.k) / Q : 0;
    const den = dr * dr + di * di;
    if (den === 0) return [Infinity, 0];
    re += (num * dr) / den;
    im += (-num * di) / den;
  }
  return [re, im];
}

export const mag = (z) => Math.hypot(z[0], z[1]);
export const dB = (z) => 20 * Math.log10(Math.max(mag(z), 1e-12));

// Weyl's asymptotic mode count for a volume V with wall area S:
//   N(f) ≈ 4πVf³/(3c³) + πSf²/(4c²)
// Used to size the job before it starts, and by the tests.
export const weylCount = (V, S, f, c) => (4 * Math.PI * V * f ** 3) / (3 * c ** 3) + (Math.PI * S * f * f) / (4 * c * c);

export function meshArea(tris) {
  let s = 0;
  for (let t = 0; t < tris.length; t += 9) {
    const ux = tris[t + 3] - tris[t], uy = tris[t + 4] - tris[t + 1], uz = tris[t + 5] - tris[t + 2];
    const vx = tris[t + 6] - tris[t], vy = tris[t + 7] - tris[t + 1], vz = tris[t + 8] - tris[t + 2];
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
}

// ── analytic shapes, as meshes — for the tests and the demo ────────────────
// Box W × L × D with one corner at the origin, optionally rotated by `rot`
// radians about the z axis through its centre.
export function boxMesh(W, L, D, rot = 0) {
  const c = [W / 2, L / 2, D / 2];
  const P = (x, y, z) => {
    const dx = x - c[0], dy = y - c[1];
    return [c[0] + dx * Math.cos(rot) - dy * Math.sin(rot), c[1] + dx * Math.sin(rot) + dy * Math.cos(rot), z];
  };
  const v = [P(0, 0, 0), P(W, 0, 0), P(W, L, 0), P(0, L, 0), P(0, 0, D), P(W, 0, D), P(W, L, D), P(0, L, D)];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return Float64Array.from(f.flatMap((t) => t.flatMap((i) => v[i])));
}

// Closed cylinder, radius a, height H along z, base at z = 0, axis at (a, a)
export function cylinderMesh(a, H, seg = 256) {
  const out = [];
  const pt = (i, z) => [a + a * Math.cos((2 * Math.PI * i) / seg), a + a * Math.sin((2 * Math.PI * i) / seg), z];
  for (let i = 0; i < seg; i++) {
    const p0 = pt(i, 0), p1 = pt(i + 1, 0), q0 = pt(i, H), q1 = pt(i + 1, H);
    out.push(...p0, ...p1, ...q1, ...p0, ...q1, ...q0);
    out.push(a, a, 0, ...p1, ...p0);
    out.push(a, a, H, ...q0, ...q1);
  }
  return Float64Array.from(out);
}
