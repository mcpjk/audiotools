// Closed-form checks for src/crossover-scope/model.js. Run: npm run test:crossover
//
// Every expected value here comes from textbook filter theory, never from the
// tool's own output:
//   Butterworth  |H_LP|² = 1/(1+(f/fc)^2n), so −3.01 dB at fc for every order
//   Linkwitz-Riley  −6.02 dB at fc, and LP+HP is all-pass (|sum| = 1 at every
//                frequency) — with the HP inverted for LR2 and LR6
//   BW1          LP + HP = 1/(1+s) + s/(1+s) = 1 exactly; step response of the
//                LP is 1 − exp(−ωc·t)
//   LR4          group delay at DC = 2·√2/ωc (twice a BW2's √2/ωc)
//   Bessel       DC group delay × ω(−3 dB) equals the tabulated −3 dB
//                frequency of the delay-normalised Bessel filter:
//                n=2 1.36165, n=3 1.75567, n=4 2.11391
//   Linear-phase LP + HP = 1 exactly, both real
//   Delay τ      adds −360·f·τ degrees of phase and exactly τ of group delay
import { Cx, buildModel, respAt, gdAt, simulate, fft, FS, N, T0 } from "../src/crossover-scope/model.js";

let fails = 0, passes = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) passes++; else { fails++; console.error(`FAIL ${name}: got ${got}, want ${want} (±${tol})`); }
}
const P = (o = {}) => ({ fc: 100, dLP: 0, dHP: 0, inv: false, ...o });
const dB = (z) => 20 * Math.log10(Cx.abs(z));
const deg = (z) => Cx.arg(z) * 180 / Math.PI;
const wrap = (d) => ((d + 180) % 360 + 360) % 360 - 180;
const freqs = [5, 20, 50, 80, 100, 125, 200, 500, 2000];

// ── Butterworth magnitude, every order ──
for (let n = 1; n <= 8; n++) {
  const M = buildModel("BW", n);
  check(`BW${n} LP at fc`, dB(respAt(M, P(), 100).lp), -10 * Math.log10(2), 1e-9);
  check(`BW${n} HP at fc`, dB(respAt(M, P(), 100).hp), -10 * Math.log10(2), 1e-9);
  for (const f of freqs) {
    const r = respAt(M, P(), f), x = f / 100;
    check(`BW${n} |LP|² at ${f}`, Cx.abs(r.lp) ** 2, 1 / (1 + x ** (2 * n)), 1e-12);
    check(`BW${n} |HP|² at ${f}`, Cx.abs(r.hp) ** 2, 1 / (1 + x ** (-2 * n)), 1e-12);
  }
}

// ── BW1 sums to a wire ──
{
  const M = buildModel("BW", 1);
  for (const f of freqs) { const s = respAt(M, P(), f).sum; check(`BW1 sum re at ${f}`, s[0], 1, 1e-12); check(`BW1 sum im at ${f}`, s[1], 0, 1e-12); }
}

// ── Linkwitz-Riley: −6 dB, in phase at fc, all-pass sum ──
for (const n of [2, 4, 6, 8]) {
  const M = buildModel("LR", n), inv = (n / 2) % 2 === 1;
  const r = respAt(M, P({ inv }), 100);
  check(`LR${n} LP at fc`, dB(r.lp), -20 * Math.log10(2), 1e-9);
  check(`LR${n} LP/HP phase difference at fc`, wrap(deg(r.hp) - deg(r.lp)), 0, 1e-6);
  for (const f of freqs) check(`LR${n} |sum| at ${f}`, Cx.abs(respAt(M, P({ inv }), f).sum), 1, 1e-12);
}
// LR2 un-inverted has a true null at fc: (1 + s²)/(1 + s)² = 0 at s = j
check("LR2 null at fc without inversion", Cx.abs(respAt(buildModel("LR", 2), P(), 100).sum), 0, 1e-12);

// ── LR4 group delay at DC ──
{
  const M = buildModel("LR", 4), wc = 2 * Math.PI * 100;
  check("LR4 LP group delay at DC", gdAt(M, P(), 0.05, "lp"), 2 * Math.SQRT2 / wc, 1e-6 * 2 * Math.SQRT2 / wc * 10);
  check("LR4 sum group delay at DC", gdAt(M, P(), 0.05, "sum"), 2 * Math.SQRT2 / wc, 1e-5 * 2 * Math.SQRT2 / wc);
}

// ── Bessel: −3 dB at fc, DC delay matches tabulated ω(−3 dB) ──
for (const [n, w3] of [[2, 1.36165], [3, 1.75567], [4, 2.11391]]) {
  const M = buildModel("BE", n);
  check(`Bessel${n} LP at fc`, dB(respAt(M, P(), 100).lp), -10 * Math.log10(2), 1e-9);
  check(`Bessel${n} DC delay × ωc`, gdAt(M, P(), 0.05, "lp") * 2 * Math.PI * 100, w3, 5e-5);
}

// ── Linear-phase: real, complementary ──
for (const n of [2, 4, 8]) {
  const M = buildModel("LIN", n);
  check(`LIN${n} LP at fc`, dB(respAt(M, P(), 100).lp), -20 * Math.log10(2), 1e-9);
  for (const f of freqs) {
    const r = respAt(M, P(), f);
    check(`LIN${n} sum at ${f}`, r.sum[0], 1, 1e-12); check(`LIN${n} LP imag at ${f}`, r.lp[1], 0, 0);
  }
}

// ── pure delay and polarity ──
{
  const M = buildModel("LR", 4), tau = 8.7;
  for (const f of [30, 100, 300]) {
    const a = respAt(M, P(), f), b = respAt(M, P({ dLP: tau }), f);
    check(`delay phase at ${f}`, wrap(deg(b.lp) - deg(a.lp)), wrap(-360 * f * tau / 1000), 1e-6);
    check(`delay gd at ${f}`, gdAt(M, P({ dLP: tau }), f, "lp") - gdAt(M, P(), f, "lp"), tau / 1000, 1e-9);
    const c = respAt(M, P({ inv: true }), f);
    check(`inversion re at ${f}`, c.hp[0], -a.hp[0], 1e-15);
  }
}

// ── FFT: round trip, and a cosine lands in its bin with weight N/2 ──
{
  const re = new Float64Array(N), im = new Float64Array(N), k0 = 1234;
  for (let i = 0; i < N; i++) re[i] = Math.cos(2 * Math.PI * k0 * i / N);
  const orig = Float64Array.from(re);
  fft(re, im, false);
  check("FFT cosine bin", re[k0], N / 2, 1e-6); check("FFT cosine elsewhere", Math.abs(re[k0 + 7]), 0, 1e-6);
  fft(re, im, true);
  let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(re[i] - orig[i]));
  check("FFT round trip", err, 0, 1e-12);
}

// ── simulation: BW1 step response, BW1 sum = input, LR4 sum preserves energy ──
{
  const M = buildModel("BW", 1), p = P(), sim = simulate(M, p, { signal: "step", fsel: 100, cycles: 4 });
  const wc = 2 * Math.PI * 100;
  for (const ms of [2, 5, 10, 20]) {
    const i = Math.round((T0 + ms / 1000) * FS);
    // A sampled step's band-limited edge sits half a sample before its first
    // 1, so the continuous-time origin is at −Ts/2 (worth 0.006 at 2 ms).
    check(`BW1 LP step at ${ms} ms`, sim.lp[i], 1 - Math.exp(-wc * (ms / 1000 + 0.5 / FS)), 3e-4);
  }
  let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(sim.sum[i] - sim.x[i]));
  check("BW1 simulated sum equals input", err, 0, 1e-9);

  const M4 = buildModel("LR", 4), s4 = simulate(M4, p, { signal: "burst", fsel: 100, cycles: 4 });
  let ex = 0, es = 0; for (let i = 0; i < N; i++) { ex += s4.x[i] ** 2; es += s4.sum[i] ** 2; }
  check("LR4 all-pass sum keeps burst energy", es / ex, 1, 1e-9);
}

console.log(`crossover model: ${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
