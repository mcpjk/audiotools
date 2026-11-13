// Crossover Scope — the physics, with no DOM and no colour, so that
// scripts/test-crossover.mjs can check it under node against closed forms.
//
// MODEL
//   Analog prototypes normalised to fc = 1, evaluated on s = jf/fc.
//   - Butterworth n:   poles on the unit circle, H_LP = Π(−p)/(s−p).
//                      H_HP(s) = H_LP(1/s) (the standard LP→HP transform).
//   - Linkwitz-Riley 2k: H = (H_BW,k)², both sides squared.
//   - Bessel n:        H = θn(0)/θn(s), θn the reverse Bessel polynomial,
//                      frequency-scaled so |H| = −3 dB at fc. HP by s → 1/s.
//   - Linear-phase:    |H_LP| = |H_LR|, ∠H = 0, H_HP = 1 − H_LP. Drawn
//                      zero-phase: a real FIR adds a bulk delay of half its
//                      length (not shown) and is acausal here by construction.
//   Path delays multiply each side by exp(−jωτ). Polarity inversion negates HP.
//
// ASSUMPTIONS AND DIRECTION OF ERROR
//   - Ideal electrical filters into ideal, flat, coincident drivers: no
//     driver roll-off, no acoustic offset beyond the delay sliders. A real
//     system's sum differs by whatever the drivers add.
//   - Group delay is a central difference of phase over ±0.1 % of f. Error is
//     O(δ²); invisible at plot resolution.
//   - Waveforms are an exact frequency-domain multiply at 16 kHz, N = 32768
//     (2.048 s window). The FFT is circular, so a response longer than the
//     window would wrap; nothing here rings that long. The square wave is
//     band-limited to 4 kHz and snapped to a bin, so its frequency differs
//     from the probe by up to 0.25 Hz.
//   - The Bessel scaling is a 90-step bisection for the −3 dB point: exact to
//     machine precision for practical purposes.

export const Cx = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  abs: (a) => Math.hypot(a[0], a[1]),
  arg: (a) => Math.atan2(a[1], a[0]),
  expj: (t) => [Math.cos(t), Math.sin(t)],
  scale: (a, k) => [a[0] * k, a[1] * k],
};
const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };

/* ---------- analog prototypes (normalised to fc = 1) ---------- */
export function bwPoles(n) {
  const p = [];
  for (let k = 1; k <= n; k++) { const t = Math.PI * (2 * k + n - 1) / (2 * n); p.push([Math.cos(t), Math.sin(t)]); }
  return p;
}
function poleLP(P, s) {
  let h = [1, 0];
  for (const p of P) h = Cx.mul(h, Cx.div([-p[0], -p[1]], [s[0] - p[0], s[1] - p[1]]));
  return h;
}
const besselCache = {};
function besselLP(n) {
  if (besselCache[n]) return besselCache[n];
  const a = []; for (let k = 0; k <= n; k++) a.push(fact(2 * n - k) / (Math.pow(2, n - k) * fact(k) * fact(n - k)));
  const raw = (s) => { let p = [a[n], 0]; for (let k = n - 1; k >= 0; k--) p = Cx.add(Cx.mul(p, s), [a[k], 0]); return Cx.div([a[0], 0], p); };
  let lo = 0.01, hi = 50;
  for (let i = 0; i < 90; i++) { const m = Math.sqrt(lo * hi); if (Cx.abs(raw([0, m])) > Math.SQRT1_2) lo = m; else hi = m; }
  const w3 = Math.sqrt(lo * hi);
  const f = (s) => raw(Cx.scale(s, w3));
  besselCache[n] = f; return f;
}
const inv = (s) => Cx.div([1, 0], s);

export const ORDERS = { BW: [1, 2, 3, 4, 5, 6, 7, 8], LR: [2, 4, 6, 8], BE: [1, 2, 3, 4, 5, 6, 7, 8], LIN: [2, 4, 8] };

export function buildModel(type, order) {
  if (type === "BW") { const P = bwPoles(order); return { lp: (s) => poleLP(P, s), hp: (s) => poleLP(P, inv(s)) }; }
  if (type === "LR") { const P = bwPoles(order / 2); return { lp: (s) => { const h = poleLP(P, s); return Cx.mul(h, h); }, hp: (s) => { const h = poleLP(P, inv(s)); return Cx.mul(h, h); } }; }
  if (type === "BE") { const f = besselLP(order); return { lp: f, hp: (s) => f(inv(s)) }; }
  const P = bwPoles(order / 2);
  return { lp: (s) => { const m = Cx.abs(poleLP(P, s)); return [m * m, 0]; }, hp: (s) => { const m = Cx.abs(poleLP(P, s)); return [1 - m * m, 0]; } };
}

// p = { fc, dLP, dHP (ms), inv }. invOverride, if given, replaces p.inv.
export function respAt(M, p, f, invOverride) {
  const Om = Math.max(f, 1e-6) / p.fc, s = [0, Om];
  let lp = M.lp(s), hp = M.hp(s);
  const w = 2 * Math.PI * f;
  if (p.dLP) lp = Cx.mul(lp, Cx.expj(-w * p.dLP / 1000));
  if (p.dHP) hp = Cx.mul(hp, Cx.expj(-w * p.dHP / 1000));
  const iv = invOverride === undefined ? p.inv : invOverride;
  if (iv) hp = Cx.scale(hp, -1);
  return { lp, hp, sum: Cx.add(lp, hp) };
}
// group delay in seconds, −dφ/dω by central difference
export function gdAt(M, p, f, key) {
  const d = f * 1e-3;
  const a = respAt(M, p, f + d)[key], b = respAt(M, p, f - d)[key];
  const r = Cx.div(a, b);
  return -Cx.arg(r) / (2 * Math.PI * 2 * d);
}

/* ---------- FFT simulation ---------- */
export const FS = 16000, N = 32768, T = N / FS, T0 = 0.5;
const LOGN = Math.round(Math.log2(N));
const rev = new Uint32Array(N);
for (let i = 0; i < N; i++) { let r = 0, x = i; for (let b = 0; b < LOGN; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = Math.sin(2 * Math.PI * i / N); }
export function fft(re, im, inverse) {
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cosT[k], wi = inverse ? sinT[k] : -sinT[k];
        const a = i + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverse) { for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; } }
}

let sigCache = { key: null };
// sp = { signal: "burst"|"square"|"step", fsel, cycles }
export function buildSignal(sp) {
  const key = sp.signal + "|" + sp.fsel.toFixed(3) + "|" + sp.cycles;
  if (sigCache.key === key) return sigCache;
  const x = new Float64Array(N); let info = {};
  if (sp.signal === "burst") {
    const f = sp.fsel, L = sp.cycles / f, i0 = Math.round(T0 * FS), n = Math.round(L * FS);
    for (let i = 0; i < n; i++) { const t = i / FS; x[i0 + i] = (0.5 - 0.5 * Math.cos(2 * Math.PI * t / L)) * Math.sin(2 * Math.PI * f * t); }
    info = { dur: L };
  } else if (sp.signal === "step") {
    const i0 = Math.round(T0 * FS), n = Math.round(1.0 * FS);
    for (let i = 0; i < n; i++) x[i0 + i] = 1;
    info = { dur: 0 };
  } else {
    const m = Math.max(1, Math.round(sp.fsel * T)), fa = m / T;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 1; k * m < N / 2 && k * fa <= 4000; k += 2) { const A = 4 / (Math.PI * k), b = k * m; im[b] = -A * N / 2; im[N - b] = A * N / 2; }
    fft(re, im, true); x.set(re);
    info = { fa };
  }
  const Xr = Float64Array.from(x), Xi = new Float64Array(N); fft(Xr, Xi, false);
  sigCache = { key, x, Xr, Xi, info };
  return sigCache;
}
export const lastSignalInfo = () => sigCache.info;

// Filter the signal through both paths: X(f)·H(f), conjugate-symmetric, inverse FFT.
export function simulate(M, p, sp) {
  const sg = buildSignal(sp), half = N / 2;
  const lr = new Float64Array(N), li = new Float64Array(N), hr = new Float64Array(N), hi = new Float64Array(N);
  for (let k = 0; k <= half; k++) {
    const f = k * FS / N, r = respAt(M, p, f);
    const a = sg.Xr[k], b = sg.Xi[k];
    lr[k] = a * r.lp[0] - b * r.lp[1]; li[k] = a * r.lp[1] + b * r.lp[0];
    hr[k] = a * r.hp[0] - b * r.hp[1]; hi[k] = a * r.hp[1] + b * r.hp[0];
    if (k > 0 && k < half) {
      const j = N - k, c = sg.Xr[j], d = sg.Xi[j];
      lr[j] = c * r.lp[0] + d * r.lp[1]; li[j] = -c * r.lp[1] + d * r.lp[0];
      hr[j] = c * r.hp[0] + d * r.hp[1]; hi[j] = -c * r.hp[1] + d * r.hp[0];
    }
  }
  fft(lr, li, true); fft(hr, hi, true);
  const sum = new Float64Array(N); for (let i = 0; i < N; i++) sum[i] = lr[i] + hr[i];
  return { x: sg.x, lp: lr, hp: hr, sum, info: sg.info };
}
