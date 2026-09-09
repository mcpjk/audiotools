// Acoustic intent: spread the mouth's boundary transition while holding the
// prescribed cell aperture fixed. These are geometric candidates, not an
// acoustic optimiser: no radiation impedance or diffraction gain is inferred.
const rad = Math.PI / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
const mix = (a, b, u) => add(mul(a, 1 - u), mul(b, u));

// Quintic Hermite, derivatives with respect to normalised profile parameter.
function hermite(p, v0, v1, a0) {
  return p.map((end, axis) => {
    const B = end - v0[axis] - a0[axis] / 2;
    const C = v1[axis] - v0[axis] - a0[axis];
    const D = -a0[axis];
    return [0, v0[axis], a0[axis] / 2, 10 * B - 4 * C + D / 2,
      -15 * B + 7 * C - D, 6 * B - 3 * C + D / 2];
  });
}
const poly = (c, u, order) => c.reduce((s, v, i) => i < order ? s : s + v *
  (order === 0 ? 1 : order === 1 ? i : i * (i - 1)) * u ** (i - order), 0);

// Coordinates: x turns outward, z follows the incoming wall. The ellipse
// fixes endpoint and final tangent. The quintic uses those SAME constraints,
// with measured starting curvature and zero ending curvature.
export function rimProfile({ family = 'spline', width = 35, depth = 35,
  theta = 0, curvature = 0, termination = 'free', endAngle = 150, n = 32 } = {}) {
  if (!['circle', 'ellipse', 'spline'].includes(family)) throw new Error('Unknown rim profile');
  if (![width, depth, theta, curvature, endAngle, n].every(Number.isFinite) || width <= 0 || depth <= 0 || n < 4)
    throw new Error('Rim dimensions must be finite and positive');
  if (!['free', 'baffle'].includes(termination)) throw new Error('Unknown rim termination');
  const end = (termination === 'baffle' ? 90 : endAngle) * rad;
  const turn = end - theta;
  if (turn <= 5 * rad || turn >= 175 * rad) throw new Error('Final direction must turn 5–175° from the incoming wall');
  const a = width, b = family === 'circle' ? width : depth;
  const phi = Math.atan2(b * Math.sin(turn), a * Math.cos(turn));
  const endpoint = [a * (1 - Math.cos(phi)), b * Math.sin(phi)];
  const v0 = [0, b * phi], v1 = [a * Math.sin(phi) * phi, b * Math.cos(phi) * phi];
  const coeff = hermite(endpoint, v0, v1, [curvature * v0[1] ** 2, 0]);
  const at = u => {
    if (family === 'spline') return {
      p: coeff.map(c => poly(c, u, 0)), v: coeff.map(c => poly(c, u, 1)), a: coeff.map(c => poly(c, u, 2)),
    };
    const q = phi * u;
    return { p: [a * (1 - Math.cos(q)), b * Math.sin(q)],
      v: [a * Math.sin(q) * phi, b * Math.cos(q) * phi],
      a: [a * Math.cos(q) * phi ** 2, -b * Math.sin(q) * phi ** 2] };
  };
  const sample = u => {
    const q = at(u), speed = Math.hypot(...q.v);
    if (speed < 1e-6) throw new Error('Rim profile has a stationary point');
    return { ...q, k: (q.v[1] * q.a[0] - q.v[0] * q.a[1]) / speed ** 3,
      psi: theta + Math.atan2(q.v[0], q.v[1]) };
  };
  // Validation always uses 256 intervals; viewport resolution cannot make a
  // folded offset or reversed profile appear safe.
  const fine = Array.from({ length: 257 }, (_, i) => sample(i / 256));
  if (fine.some(q => q.p[0] * Math.cos(theta) + q.p[1] * Math.sin(theta) < -1e-5
    || q.v[0] * Math.cos(theta) + q.v[1] * Math.sin(theta) < -1e-4))
    throw new Error('Profile reverses toward the aperture; change the two scales');
  const maxK = Math.max(...fine.map(q => Math.abs(q.k)));
  return { samples: Array.from({ length: n + 1 }, (_, i) => sample(i / n)),
    fine, endpoint, startK: fine[0].k, endK: fine.at(-1).k,
    radiusMin: maxK > 1e-12 ? 1 / maxK : Infinity,
    joinJump: Math.abs(fine[0].k - curvature), end, family };
}

function strip(q, cfg, ap, n) {
  const profile = rimProfile({ ...cfg, theta: q.theta, curvature: q.curvature, n });
  if (profile.radiusMin <= 1.5 * cfg.wall)
    throw new Error(`Minimum profile radius ${profile.radiusMin.toFixed(2)} mm is too small for the ${cfg.wall} mm wall`);
  const ct = Math.cos(q.theta), st = Math.sin(q.theta);
  const lift = ([x, z]) => add(q.P, add(mul(q.o, x * ct + z * st), mul(q.n, z * ct - x * st)));
  const inner = profile.samples.map(s => lift(s.p));
  const back = profile.samples.map((s, i) => {
    const normal = add(mul(q.o, Math.cos(s.psi)), mul(q.n, -Math.sin(s.psi)));
    const P = add(inner[i], mul(normal, cfg.wall));
    // Seat the back root on the exact aperture, blending that fabrication
    // correction away. Only the air-facing profile is curvature-controlled.
    const root = ap.snap(add(q.P, mul(q.o, cfg.wall / ct)));
    const base = add(q.P, mul(add(mul(q.o, ct), mul(q.n, -st)), cfg.wall));
    const u = Math.min(1, i / n / .25), blend = 1 - u * u * (3 - 2 * u);
    return add(P, mul(sub(root, base), blend));
  });
  const pts = [];
  for (let j = 0; j < n; j++) pts.push(inner[j]);
  for (let j = 0; j < n; j++) pts.push(mix(inner[n], back[n], j / n));
  for (let j = 0; j < n; j++) pts.push(back[n - j]);
  for (let j = 0; j < n; j++) pts.push(ap.snap(mix(back[0], inner[0], j / n)));
  if (pts.some(p => p.some(v => !Number.isFinite(v)))) throw new Error('Non-finite rim geometry');
  const direction = ([x,z]) => add(mul(q.o, x * ct + z * st), mul(q.n, z * ct - x * st));
  const first = profile.samples[0], last = profile.samples.at(-1);
  return { pts, origin: q.P, profile, rimBoundary: [first.v, first.a, last.v, last.a].map(direction) };
}

export function createRim(field, options = {}) {
  const cfg = { enabled: true, family: 'spline', width: 35, depth: 35, wall: 3,
    termination: 'free', endAngle: 150, n: 16, every: 2, xSide: 0, ySide: 0, ...options };
  const report = { on: !!cfg.enabled, ok: true, why: null, family: cfg.family,
    kinkMax: field.kinkMax / rad, pieces: 0, joinJump: 0, radiusMin: Infinity, profiles: [] };
  if (!cfg.enabled) return { solids: [], report };
  try {
    if (!Number.isFinite(cfg.wall) || cfg.wall <= 0) throw new Error('Shell wall must be positive');
    const solids = [], bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    const decimate = list => list.filter((q, i) => i % cfg.every === 0 || i === list.length - 1);
    const section = (q, n) => {
      const s = strip(q, cfg, field.ap, n);
      report.joinJump = Math.max(report.joinJump, s.profile.joinJump);
      report.radiusMin = Math.min(report.radiusMin, s.profile.radiusMin);
      return s;
    };
    const piece = (stations, label, quadrant, kind) => {
      if (stations.length < 2) throw new Error('Incomplete exterior rim boundary');
      // Check every incoming station, independent of drawing/export decimation.
      for (const q of stations) {
        const s = section(q, 48);
        for (const p of s.pts) for (let k = 0; k < 3; k++) {
          bounds[0][k] = Math.min(bounds[0][k], p[k]); bounds[1][k] = Math.max(bounds[1][k], p[k]);
        }
      }
      if ((cfg.xSide && quadrant[0] !== Math.sign(cfg.xSide)) || (cfg.ySide && quadrant[1] !== Math.sign(cfg.ySide))) return;
      const selected = kind === 'corner' ? stations : decimate(stations);
      const sections = selected.map((q, i) => ({ ...section(q, cfg.n), s: i / (selected.length - 1) }));
      // Keep evaluator/diagnostic objects outside the STEP surface API.
      solids.push({ label, group: 'experimental rim', quadrant, kind,
        sections: sections.map(({ pts, origin, s, rimBoundary }) => ({ pts, origin, s, rimBoundary })) });
    };
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      let h = field.edges[sx > 0 ? 'right' : 'left'].filter(q => q.e * sy >= -1e-6);
      let v = field.edges[sy > 0 ? 'top' : 'bottom'].filter(q => q.a * sx >= -1e-6);
      if (sy < 0) h = h.slice().reverse();
      if (sx > 0) v = v.slice().reverse();
      if (!h.length || !v.length) throw new Error('Missing exterior aperture edges');
      const A = h.at(-1), B = v[0];
      if (Math.hypot(...sub(A.P, B.P)) > 1e-5) throw new Error('Aperture corner is disconnected');
      // An explicit corner patch with exact shared side sections. The sharp
      // inner corner is a retained pole, not claimed to be a G2 surface there.
      const corner = Array.from({ length: 17 }, (_, i) => {
        if (i === 0) return A;
        if (i === 16) return B;
        const u = i / 16, a = u * Math.PI / 2;
        const o = unit(add(mul(A.o, Math.cos(a)), mul(B.o, Math.sin(a))));
        const d = unit(mix(A.d, B.d, u));
        return { P: A.P, o, n: A.n, theta: Math.atan2(dot(d, o), dot(d, A.n)),
          curvature: A.curvature + (B.curvature - A.curvature) * u };
      });
      const label = `rim ${sx > 0 ? '+x' : '-x'}${sy > 0 ? '+y' : '-y'}`;
      piece(h, label + ' side H', [sx, sy], 'side');
      piece(corner, label + ' corner', [sx, sy], 'corner');
      piece(v, label + ' side V', [sx, sy], 'side');
    }
    // Share one transverse derivative field across each side/corner join.
    // Equal positions alone leave a normal kink after independent lofting.
    // The air-face root is a retained corner pole, so its derivative is zero.
    const stepLength = (a,b) => Math.sqrt(a.pts.reduce((sum,p,i) => sum + dot(sub(p,b.pts[i]),sub(p,b.pts[i])),0)/a.pts.length);
    const length = sections => sections.slice(1).reduce((sum,s,i)=>sum+stepLength(s,sections[i]),0);
    for(let i=0;i<solids.length;i+=3) for(let j=0;j<2;j++) {
      const a=solids[i+j].sections,b=solids[i+j+1].sections;
      const root=a.at(-1),before=a.at(-2),after=b[1];
      const da=stepLength(root,before),db=stepLength(after,b[0]);
      const shared=root.pts.map((p,k)=>k===0 ? [0,0,0] :
        mul(add(mul(sub(p,before.pts[k]),1/da),mul(sub(after.pts[k],p),1/db)),.5));
      a.at(-1).rimVEnd=shared.map(d=>mul(d,length(a)));
      b[0].rimVStart=shared.map(d=>mul(d,length(b)));
    }
    report.pieces = solids.length;
    report.size = sub(bounds[1], bounds[0]);
    const representative = field.edges.right[Math.floor(field.edges.right.length / 2)];
    const curves = ['circle', 'ellipse', 'spline'].map(family => {
      try { return { family, pts: rimProfile({ ...cfg, family, theta: representative.theta,
        curvature: representative.curvature, n: 64 }).samples.map(s => s.p) }; }
      catch { return { family, pts: [] }; }
    });
    const span = Math.max(1, ...curves.flatMap(c => c.pts.flatMap(p => p.map(Math.abs))));
    report.profiles = curves.map(c => ({ family: c.family, path: c.pts.map((p, i) =>
      `${i ? 'L' : 'M'}${(p[0] / span * 65 + 20).toFixed(3)},${(65 - p[1] / span * 65).toFixed(3)}`).join(' ') }));
    return { solids, report };
  } catch (error) {
    return { solids: [], report: { ...report, ok: false, why: error.message } };
  }
}
