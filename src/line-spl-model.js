// Physics for LineArraySPL.jsx — a plain module, no React and no colour, so
// that scripts/test-line-spl.mjs can import it under node and check it against
// closed forms. The model, its assumptions and the direction of error of each
// simplification are in the comment block at the top of LineArraySPL.jsx.
//
// Geometry, metres. The line runs along x, across the room's width, centred on
// x = 0, with the side walls at x = ±W/2. A listener sits at lateral position
// x and perpendicular distance r from the line (r = √(along-room² + drop²)).
// Each driver's axis is normal to the line, pointing at the listener plane.
//
// "Line gain" G is the pressure sum of all drivers (and their wall images)
// relative to ONE driver at 1 m, in dB. So SPL(r) = SPL₁ₘ(one driver) + G.
// One driver alone, no walls, on axis: G = −20·log10(r).
//
// A complex number is [re, im]. Time convention e^{jωt}, spreading e^{−jkR}/R.

export const P_REF = 20e-6;
export const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);
export const airDensity = (tC) => 101325 / (287.05 * (273.15 + tC));

// ── piston directivity ──────────────────────────────────────────────────────
// Bessel J1 by its integral form, J1(x) = (1/π)∫₀^π cos(τ − x·sin τ) dτ.
// Midpoint rule; 96 panels keeps |error| < 1e-9 for x ≤ 40, far past where
// the pattern matters here.
export function besselJ1(x) {
  const n = 96;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * Math.PI;
    s += Math.cos(t - x * Math.sin(t));
  }
  return s / n;
}
// Rigid circular piston in a baffle: D(θ) = 2·J1(ka·sinθ)/(ka·sinθ).
export function pistonDir(ka, sinTheta) {
  const x = ka * sinTheta;
  if (Math.abs(x) < 1e-6) return 1;
  return (2 * besselJ1(x)) / x;
}

// ── the line and its images in the side walls ───────────────────────────────
// N drivers at pitch d, centred: x_n = −(N−1)d/2 + n·d. With N·d = W the end
// drivers sit d/2 from each wall, so mirror images continue the lattice
// unbroken (test-line-spl.mjs checks this). `rows` = 2 models an offset double
// row feeding one slot: 2N drivers at pitch d/2 along the width (the rows'
// small separation along the room is ignored).
export function linePositions(N, d, rows = 1) {
  const n = N * rows, p = d / rows, out = [];
  for (let i = 0; i < n; i++) out.push(-((n - 1) * p) / 2 + i * p);
  return out;
}

// Image of order k across walls at ±W/2: x_k = (−1)^k·x + k·W, amplitude R^|k|.
// K is chosen per evaluation (see imageOrder). The outer half of the image
// orders is cosine-tapered to zero: a hard truncation of a lossless (R = 1)
// image sum leaves a ripple of the size of the last term, while a smooth
// window converges on the stationary-phase value, which sits at the centre
// where the window is 1. For R < 1 the taper only trims terms already small.
export function imageSources(xs, W, R, K) {
  const out = [];
  for (let k = -K; k <= K; k++) {
    const a = Math.abs(k);
    const amp = (a === 0 ? 1 : R ** a);
    if (amp < 1e-6) continue;
    const h = K / 2;
    const w = a <= h ? 1 : 0.5 * (1 + Math.cos((Math.PI * (a - h)) / (K - h)));
    if (w <= 0) continue;
    const sgn = a % 2 === 0 ? 1 : -1;
    for (const x of xs) out.push({ x: sgn * x + k * W, a: amp * w });
  }
  return out;
}

// Image orders needed: enough to span many Fresnel zones (√(λr)) either side of
// the listener, so the windowed sum has converged. Capped for speed; with any
// wall loss the far images are negligible long before the cap.
export function imageOrder(W, lambda, r, R) {
  if (R <= 0) return 0;
  const span = 30 * Math.sqrt(lambda * r) + 2 * W;
  let K = Math.ceil(span / W);
  if (R < 1) K = Math.min(K, Math.ceil(Math.log(1e-4) / Math.log(R)) + 2);
  return Math.max(4, Math.min(K, 400));
}

// Pressure sum at (x, r) relative to one driver's on-axis pressure at 1 m.
// opts: { W, R, c, effDia (m, 0 = omni) }.
export function lineSum(f, xl, r, xs, opts) {
  const { W, R, c, effDia = 0 } = opts;
  const k = (2 * Math.PI * f) / c;
  const lambda = c / f;
  const K = imageOrder(W, lambda, r, R);
  const src = imageSources(xs, W, R, K);
  const ka = k * (effDia / 2);
  let re = 0, im = 0;
  for (const s of src) {
    const dx = xl - s.x;
    const Rd = Math.sqrt(dx * dx + r * r);
    const D = ka > 0 ? pistonDir(ka, Math.abs(dx) / Rd) : 1;
    const amp = (s.a * D) / Rd;
    re += amp * Math.cos(-k * Rd);
    im += amp * Math.sin(-k * Rd);
  }
  return [re, im];
}

export const dB = (z) => 10 * Math.log10(Math.max(z[0] * z[0] + z[1] * z[1], 1e-30));

export function lineGainDb(f, xl, r, xs, opts) {
  return dB(lineSum(f, xl, r, xs, opts));
}

// Band-power average of the gain over a fractional-octave band, from `n`
// log-spaced points: smooths the single-frequency interference ripple the way
// a measurement in bands would.
export function bandGainDb(fc, frac, xl, r, xs, opts, n = 5) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f = fc * 2 ** (frac * ((i + 0.5) / n - 0.5));
    s += 10 ** (lineGainDb(f, xl, r, xs, opts) / 10);
  }
  return 10 * Math.log10(s / n);
}

// Infinite continuous line, stationary phase: |Σ| ≈ (1/d)·√(λ/r).
// G = 10·log10(λ/(r·d²)). Valid for d < λ (no grating) and r ≫ λ.
export const infiniteLineAsymptoteDb = (f, r, d, c) => 10 * Math.log10(c / f / (r * d * d));

// ── one driver's limits, SPL at 1 m on its own axis, half-space ──────────────
// Thermal: sensitivity (1 W / 1 m, infinite baffle) + 10·log10(P).
// Excursion: a baffled piston radiates p = ρ·ω²·Sd·x/(2π·r) at r, above its
// system resonance (mass-controlled). With x = Xmax (peak) at r = 1 m:
//   SPL_x = 20·log10( ρ·ω²·Sd·Xmax / (2π·√2·p_ref) ).  Rises 12 dB/octave.
export const thermalSpl1m = (sens, P) => sens + 10 * Math.log10(P);
export function excursionSpl1m(f, Sd, Xmax, rho) {
  const w = 2 * Math.PI * f;
  return 20 * Math.log10((rho * w * w * Sd * Xmax) / (2 * Math.PI * Math.SQRT2 * P_REF));
}
// Frequency at which the two limits are equal.
export function excursionThermalCrossover(sens, P, Sd, Xmax, rho) {
  const L0 = excursionSpl1m(1000, Sd, Xmax, rho);
  return 1000 * 10 ** ((thermalSpl1m(sens, P) - L0) / 40);
}

// Waveguide gain: 0 below fOn/2, full above fOn, linear in log-f between.
export function waveguideDb(f, gainDb, fOn) {
  if (gainDb === 0 || fOn <= 0) return 0;
  if (f >= fOn) return gainDb;
  if (f <= fOn / 2) return 0;
  return gainDb * Math.log2(f / (fOn / 2));
}

export const thirdOctaveBands = (fLo, fHi) => {
  const out = [];
  for (let i = -30; i <= 20; i++) {
    const f = 1000 * 2 ** (i / 3);
    if (f >= fLo * 0.99 && f <= fHi * 1.01) out.push(f);
  }
  return out;
};

// ── broadband programme ─────────────────────────────────────────────────────
// The system is EQ'd so the acoustic band levels at the reference distance
// follow the programme (pink + `tilt` dB/oct). Working back through the line
// gain and the waveguide gain gives each band's per-driver 1 m level, then
// its electrical power (from sensitivity) and its cone excursion. The overall
// level is raised until either the summed electrical power reaches the driver's
// continuous rating, or the summed RMS excursion times the crest factor
// reaches Xmax — whichever comes first.
//
// gains: array over bands of { fc, G: {rKey: dB} } (line gains, band-averaged)
// Returns per-band per-driver levels and the limiting factor.
export function broadband({ bands, gainRef, sens, P, Sd, Xmax, rho, wg, fWg, tilt, crestDb }) {
  // relative target shape, L0 = 0
  const shape = bands.map((fc) => tilt * Math.log2(fc / 1000));
  // per-driver 1 m level needed for L0 = 0 at the reference distance
  const s1 = bands.map((fc, i) => shape[i] - gainRef[i] - waveguideDb(fc, wg, fWg));
  const pw = s1.map((L) => 10 ** ((L - sens) / 10));
  const sumP = pw.reduce((a, b) => a + b, 0);
  const xRms = Math.sqrt(s1.reduce((a, L, i) => {
    const w = 2 * Math.PI * bands[i];
    const p = P_REF * 10 ** (L / 20);
    const x = (p * 2 * Math.PI) / (rho * w * w * Sd);
    return a + x * x;
  }, 0));
  const L0thermal = 10 * Math.log10(P / sumP);
  const L0exc = 20 * Math.log10(Xmax / (xRms * 10 ** (crestDb / 20)));
  const L0 = Math.min(L0thermal, L0exc);
  const limit = L0thermal <= L0exc ? "thermal" : "excursion";
  const perDriver1m = s1.map((L) => L + L0);
  const powerPerBand = pw.map((p) => p * 10 ** (L0 / 10));
  return {
    L0, limit, perDriver1m, powerPerBand,
    powerTotal: powerPerBand.reduce((a, b) => a + b, 0),
    excursionPeak: xRms * 10 ** (L0 / 20) * 10 ** (crestDb / 20),
    marginDb: Math.abs(L0thermal - L0exc),
  };
}

// Sum band levels (dB) as power.
export const powerSumDb = (levels) => 10 * Math.log10(levels.reduce((a, L) => a + 10 ** (L / 10), 0));
