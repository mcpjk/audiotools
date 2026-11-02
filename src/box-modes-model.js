// Physics for BoxModes.jsx — a plain module, no React and no colour, so that
// scripts/test-box-modes.mjs can import it under node and check it against
// closed forms. See the comment block at the top of BoxModes.jsx for the
// model, its assumptions and the direction of error of each simplification.
//
// Coordinates, metres, origin at the inside front-bottom-left corner:
//   x  width   0 … W   left → right, seen from the front
//   y  length  0 … L   bottom → top
//   z  depth   0 … D   front baffle → back wall
//
// A complex number is a two-element array [re, im]. Time convention e^{jωt}.

export const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);
export const airDensity = (tC) => 101325 / (287.05 * (273.15 + tC));

// ── modes of a rigid-walled rectangular cavity ──────────────────────────────
// f(l,m,n) = (c/2)·sqrt((l/W)² + (m/L)² + (n/D)²)
// ψ(l,m,n) = cos(lπx/W)·cos(mπy/L)·cos(nπz/D)
// Volume average of ψ² is Π(1/ε) with ε = 1 for a zero index and 2 otherwise,
// so V/Λ = ε_l·ε_m·ε_n — 1 for the uniform mode, 2 axial, 4 tangential,
// 8 oblique. That factor is `weight` below.
export function modeFrequency(l, m, n, dims, c) {
  const { W, L, D } = dims;
  return (c / 2) * Math.sqrt((l / W) ** 2 + (m / L) ** 2 + (n / D) ** 2);
}

export function modeType(l, m, n) {
  const k = (l > 0) + (m > 0) + (n > 0);
  return ["uniform", "axial", "tangential", "oblique"][k];
}

// Every mode up to fMax, sorted by frequency. The (0,0,0) mode is included —
// it is the box behaving as a lumped compliance, and the low-frequency limit
// of the whole sum.
export function listModes(dims, c, fMax) {
  const { W, L, D } = dims;
  const lMax = Math.floor((2 * fMax * W) / c);
  const mMax = Math.floor((2 * fMax * L) / c);
  const nMax = Math.floor((2 * fMax * D) / c);
  const out = [];
  for (let l = 0; l <= lMax; l++)
    for (let m = 0; m <= mMax; m++)
      for (let n = 0; n <= nMax; n++) {
        const f = modeFrequency(l, m, n, dims, c);
        if (f > fMax) continue;
        out.push({ l, m, n, f, k: (2 * Math.PI * f) / c,
          weight: (l > 0 ? 2 : 1) * (m > 0 ? 2 : 1) * (n > 0 ? 2 : 1),
          type: modeType(l, m, n) });
      }
  out.sort((a, b) => a.f - b.f);
  return out;
}

export function psi(mode, p, dims) {
  return Math.cos((mode.l * Math.PI * p[0]) / dims.W)
    * Math.cos((mode.m * Math.PI * p[1]) / dims.L)
    * Math.cos((mode.n * Math.PI * p[2]) / dims.D);
}

// Area-weighted mean of ψ over a set of sample points — how a finite source or
// receiver sees a mode. A point gives the local value; a cone or a port mouth
// spanning half a wavelength averages a mode's positive and negative lobes
// toward zero. A point may carry a weight as `p.w` (the area it stands for);
// unweighted points count as 1.
//
// Sampling limit: a set of points only resolves modes with fewer lobes across
// the aperture than it has samples across it. Beyond that the higher modes
// ALIAS back in with spurious weight — test-box-modes.mjs §4 shows it on a
// sampled face. The component keeps its mode cut-off well inside that limit.
export function avgPsi(mode, pts, dims) {
  let s = 0, wSum = 0;
  for (const p of pts) { const w = p.w ?? 1; s += w * psi(mode, p, dims); wSum += w; }
  return s / wSum;
}

// ── sample sets for the two apertures ───────────────────────────────────────
// Faces are named by where they sit. The driver mounts on one; its centre is
// given by the two in-plane coordinates and the third is pinned to the face.
export const FACES = {
  front: { axis: 2, at: "min" }, back: { axis: 2, at: "max" },
  left: { axis: 0, at: "min" }, right: { axis: 0, at: "max" },
  bottom: { axis: 1, at: "min" }, top: { axis: 1, at: "max" },
};
const extent = (dims, axis) => [dims.W, dims.L, dims.D][axis];

// Area-weighted disc. Annulus i spans (i ± ½)·Δ with Δ = a/(rings + ½), and
// carries 6i points at the radius whose square is the annulus's mean r²,
// Δ·sqrt(i² + ¼); each point is weighted by its share of the annulus area,
// and a centre point stands for the inner disc of radius Δ/2. (An earlier
// version used equal-AREA annuli with 6i points each and no weights, which
// over-weighted the rim and made the cone act ~30% larger in mean r² — the
// test caught it.) Points falling outside the box are clamped onto the face —
// a cone bigger than the face is the user's problem, and clamping keeps the
// average finite rather than wrong-signed.
export function discPoints(centre, radius, face, dims, rings = 6) {
  const { axis, at } = FACES[face];
  const [u, v] = [0, 1, 2].filter((a) => a !== axis);
  const pts = [];
  const put = (du, dv, w) => {
    const p = [...centre];
    p[axis] = at === "min" ? 0 : extent(dims, axis);
    p[u] = Math.min(Math.max(centre[u] + du, 0), extent(dims, u));
    p[v] = Math.min(Math.max(centre[v] + dv, 0), extent(dims, v));
    p.w = w;
    pts.push(p);
  };
  const d = radius / (rings + 0.5);
  put(0, 0, Math.PI * d * d / 4);
  for (let i = 1; i <= rings; i++) {
    const r = d * Math.sqrt(i * i + 0.25);
    const nPts = 6 * i;
    const w = (2 * Math.PI * i * d * d) / nPts;
    for (let j = 0; j < nPts; j++) {
      const a = (2 * Math.PI * (j + 0.5 * (i % 2))) / nPts;
      put(r * Math.cos(a), r * Math.sin(a), w);
    }
  }
  return pts;
}

// Rectangle of size a × b centred on `centre`, lying in the plane normal to
// `normalAxis` (0 = x, 1 = y, 2 = z). Midpoint rule, N × N.
export function rectPoints(centre, a, b, normalAxis, dims, N = 5) {
  const [u, v] = [0, 1, 2].filter((x) => x !== normalAxis);
  const pts = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const p = [...centre];
      p[u] = Math.min(Math.max(centre[u] + a * ((i + 0.5) / N - 0.5), 0), extent(dims, u));
      p[v] = Math.min(Math.max(centre[v] + b * ((j + 0.5) / N - 0.5), 0), extent(dims, v));
      pts.push(p);
    }
  return pts;
}

// ── the forced response ─────────────────────────────────────────────────────
// A volume-velocity source Q at the driver drives p = Σ A_n ψ_n with
//   A_n = jωρQ·ψ̄_n(src) / (Λ_n·(k_n² − k² + j·k·k_n/Q_n))
// Dividing by the lumped-compliance pressure p₀ = ρc²Q/(jωV) gives
//   R = p/p₀ = 1 + Σ_{n≥1} (−k²·weight_n)·ψ̄_s·ψ̄_r / (k_n² − k² + j·k·k_n/Q)
// The n = 0 term is exactly 1: at low frequency the box is a spring and the
// pressure is the same everywhere. R is what this tool reports — how much
// more (or less) pressure a point sees than the lumped model predicts.
//
// `pairs` is a list of { mode, s, r }: the mode and its averaged shape at the
// source and receiver. Precompute it once per geometry; frequency sweeps then
// cost one complex division per mode per frequency.
export function ratio(f, pairs, c, Q) {
  const k = (2 * Math.PI * f) / c;
  const k2 = k * k;
  let re = 0, im = 0;
  for (const { mode, s, r } of pairs) {
    if (mode.weight === 1) { re += s * r; continue; } // uniform mode, exactly 1
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

// RMS of |R| over a fractional-octave band — for when the frequency you care
// about (a port pipe mode, say) is only known to within a few percent.
export function bandRatioDb(fc, pairs, c, Q, octaves = 1 / 3, n = 9) {
  if (!(octaves > 0)) return dB(ratio(fc, pairs, c, Q));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f = fc * 2 ** (octaves * ((i + 0.5) / n - 0.5));
    const m = mag(ratio(f, pairs, c, Q));
    s += m * m;
  }
  return 10 * Math.log10(Math.max(s / n, 1e-24));
}

// Exact 1D reference, used only by the test: a piston filling the whole x = 0
// face of a rigid duct of length W, closed at x = W. With u = Q/S,
//   p(x) = −jρc·u·cos(k(W−x)) / sin(kW)
// and as a ratio to the lumped p₀ = ρc²Q/(jωV) = −j·ρc·u/(kW):
//   R(x) = kW·cos(k(W−x)) / sin(kW)            (real)
export function ductRatio1D(f, x, W, c) {
  const k = (2 * Math.PI * f) / c;
  return (k * W * Math.cos(k * (W - x))) / Math.sin(k * W);
}
