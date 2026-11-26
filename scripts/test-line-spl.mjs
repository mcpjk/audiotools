// Closed-form test vectors for src/line-spl-model.js. Run: npm run test:line
//
// Same rule as the other suites: every expected value comes from mathematics
// done independently — a point source's inverse-square law, the stationary-
// phase limit of an infinite line, a compact array's far field, a Bessel zero,
// a hand-worked excursion number — never from running the tool and recording
// what it said.
import * as M from "../src/line-spl-model.js";

let pass = 0, fail = 0;
const check = (name, got, want, tol, unit = "") => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(62)} ${got.toFixed(4).padStart(10)} ${unit}  (want ${typeof want === "number" ? want.toFixed(4) : want} ±${tol})`);
};
const checkTrue = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(62)} ${detail}`);
};
const head = (s) => console.log(`\n${s}`);
const c = 343;

head("Piston directivity, 2·J1(x)/x");
check("J1(1) — tabulated 0.4400505857", M.besselJ1(1), 0.4400505857, 1e-8);
check("J1 first zero at x = 3.8317 (first piston null)", M.besselJ1(3.831706), 0, 1e-6);
check("on axis the pattern is 1", M.pistonDir(5, 0), 1, 0);
check("−3 dB point of a piston at ka·sinθ = 1.616", 20 * Math.log10(M.pistonDir(1.616, 1)), -3.01, 0.02, "dB");

head("One driver, no walls: inverse-square law");
{
  const xs = M.linePositions(1, 0.08);
  const o = { W: 3.5, R: 0, c, effDia: 0 };
  check("G at r = 1 m is 0 dB", M.lineGainDb(1000, 0, 1, xs, o), 0, 1e-9, "dB");
  check("G at r = 4 m is −20·log10(4)", M.lineGainDb(1000, 0, 4, xs, o), -20 * Math.log10(4), 1e-9, "dB");
}

head("Compact array, far field: coherent sum gives N/r");
{
  const N = 10, d = 0.05;  // 0.5 m long, λ = 3.43 m at 100 Hz, r = 50 m
  const xs = M.linePositions(N, d);
  const g = M.lineGainDb(100, 0, 50, xs, { W: 100, R: 0, c });
  check("G = 20·log10(N/r)", g, 20 * Math.log10(N / 50), 0.05, "dB");
}

head("Wall-to-wall line: images continue the lattice unbroken");
{
  const N = 42, d = 3.5 / 42;
  const xs = M.linePositions(N, d);
  const img = M.imageSources(xs, 3.5, 1, 4).map((s) => s.x).sort((a, b) => a - b);
  const gaps = img.slice(1).map((x, i) => x - img[i]);
  checkTrue("every gap between neighbouring sources (real or image) is d",
    gaps.every((g) => Math.abs(g - d) < 1e-9), `min ${Math.min(...gaps).toFixed(6)} max ${Math.max(...gaps).toFixed(6)} want ${d.toFixed(6)}`);
}

head("Lossless walls: the line is infinite, stationary phase G = 10·log10(λ/(r·d²))");
{
  const N = 42, d = 3.5 / 42;
  const xs = M.linePositions(N, d);
  const o = { W: 3.5, R: 1, c, effDia: 0 };
  for (const [f, r] of [[300, 4], [1000, 8], [1000, 16], [3000, 16]]) {
    check(`f = ${f} Hz, r = ${r} m`, M.lineGainDb(f, 0, r, xs, o), M.infiniteLineAsymptoteDb(f, r, d, c), 0.3, "dB");
  }
  const g1 = M.lineGainDb(1000, 0, 4, xs, o), g2 = M.lineGainDb(1000, 0, 8, xs, o);
  check("doubling distance costs 3.01 dB, not 6", g2 - g1, -3.01, 0.2, "dB");
  // Below the grating limit the field is uniform across the width; above it,
  // the lattice's grating lobes interfere and it is not.
  const across = (f) => {
    const v = [];
    for (let i = 0; i <= 20; i++) v.push(M.lineGainDb(f, -1.75 + 3.5 * i / 20, 8, xs, o));
    return Math.max(...v) - Math.min(...v);
  };
  const fg = c / d;
  checkTrue("ripple across the width < 0.5 dB at half the grating limit c/d",
    across(fg / 2) < 0.5, `${across(fg / 2).toFixed(3)} dB`);
  checkTrue("ripple across the width > 1 dB at twice the grating limit",
    across(2 * fg) > 1, `${across(2 * fg).toFixed(3)} dB`);
}

head("Excursion limit, worked by hand");
{
  // ρ = 1.2, f = 200 Hz, Sd = 33 cm², Xmax = 1.83 mm:
  // ω² = (2π·200)² = 1.57914e6; ρ·ω²·Sd·Xmax = 1.2·1.57914e6·6.039e-6 = 11.4437
  // ÷ 2π → 1.82132 Pa peak at 1 m → 1.28787 Pa RMS → 96.176 dB
  check("SPL at 1 m, 200 Hz", M.excursionSpl1m(200, 33e-4, 1.83e-3, 1.2), 96.176, 0.01, "dB");
  check("rises 12.04 dB per octave (∝ ω²)",
    M.excursionSpl1m(400, 33e-4, 1.83e-3, 1.2) - M.excursionSpl1m(200, 33e-4, 1.83e-3, 1.2), 12.041, 0.001, "dB");
  const fx = M.excursionThermalCrossover(85.4, 20, 33e-4, 1.83e-3, 1.2);
  check("crossover: excursion SPL equals thermal SPL there",
    M.excursionSpl1m(fx, 33e-4, 1.83e-3, 1.2), M.thermalSpl1m(85.4, 20), 1e-9, "dB");
}

head("Broadband allocation");
{
  // Flat line gain and no waveguide: a pink target needs equal power per band.
  const bands = M.thirdOctaveBands(250, 8000);
  const flat = bands.map(() => -20);
  const b = M.broadband({ bands, gainRef: flat, sens: 85.4, P: 20, Sd: 1, Xmax: 1, rho: 1.2, wg: 0, fWg: 0, tilt: 0, crestDb: 6 });
  check("powers sum to the thermal rating", b.powerTotal, 20, 1e-9, "W");
  check("pink, flat gain: each band gets P / nBands",
    Math.max(...b.powerPerBand) - Math.min(...b.powerPerBand), 0, 1e-12, "W");
  // Gain falling 3 dB/oct (the infinite line's λ term) must be paid for with
  // power rising 3 dB/oct: one octave up, twice the power.
  const tilted = bands.map((f) => -10 * Math.log10(f / 1000));
  const t = M.broadband({ bands, gainRef: tilted, sens: 85.4, P: 20, Sd: 1, Xmax: 1, rho: 1.2, wg: 0, fWg: 0, tilt: 0, crestDb: 6 });
  check("−3 dB/oct gain needs ×2 power per octave", t.powerPerBand[3] / t.powerPerBand[0], 2, 1e-9, "ratio");
  checkTrue("a tiny Xmax makes excursion the limit",
    M.broadband({ bands, gainRef: flat, sens: 85.4, P: 20, Sd: 33e-4, Xmax: 1e-5, rho: 1.2, wg: 0, fWg: 0, tilt: 0, crestDb: 6 }).limit === "excursion");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
