import * as G from './model.js';
import { convergence, designStamp } from './state.js';

const PAIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
// Only evaluators are omitted. Numeric arrays, Maps, and Infinity survive the
// structured-clone transport unchanged. Exports use the full map in this worker.
const mapView = ({ sectionAt, mouthSurf, surf, ...map }) => map;
const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : String(v);

export function createCompute() {
  let seedCache = null, previous = null, checked = null;
  const layout = input => {
    const seedKey = `${input.seed}/${input.R}/${input.nc}/${input.nr}/${input.m}/${input.symmetric}`;
    if (seedCache?.key !== seedKey) {
      seedCache = { key: seedKey, seed: G.makeSeed(input.seed, input.R, input.params[input.alphaAt]) };
      previous = null;
    }
    const out = G.buildLayout({ ...input, seedObj: seedCache.seed, pStart: previous });
    previous = out.solve.p?.slice();
    const { geometry, seed, ...solve } = out.solve;
    return { throat: out.throat, solve, rectangular: out.rectangular,
      singular: [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]) => out.seedObj.map(u, v)) };
  };
  const diagnose = (key, { throat, options, floor }) => {
    if (checked?.key === key) return checked;
    const build = samples => G.mapThroatToMouth(throat, {
      ...options, samples, keepGeometry: true, computeClearance: false,
    });
    let samples = options.samples || 1024, map = build(samples), change;
    const compared = [samples];
    do {
      const next = build(samples * 2);
      change = convergence(map, next);
      samples *= 2; compared.push(samples); map = next;
    } while (!change.stable && samples < 8192);
    const value = G.ductClearance(map.rows, {
      jointAware: !!map.bulge, thinBand: floor, throatFloor: floor,
      pairSteps: PAIRS, outline: 'inset', t: options.t, floor,
      compare: 'solid', perVertex: true, contacts: true,
    });
    checked = { key, map, value, samples, compared, change,
      overrun: G.insetOverrun(throat, map, { t: options.t }) };
    return checked;
  };
  return function compute(type, key, payload) {
    if (type === 'layout') return layout(payload);
    if (type === 'map') return mapView(G.mapThroatToMouth(payload.throat, payload.options));
    if (type === 'diagnostics') {
      const r = diagnose(key, payload);
      return { ...r, map: mapView(r.map) };
    }
    if (type === 'flare') {
      // Build the independent rim from the same resolution as export.
      // Evaluators remain inside the worker; only rings and a report cross.
      const map = G.mapThroatToMouth(payload.throat, payload.options);
      const fc = G.rimCollar(payload.throat, map, {
        ...payload.flare, t: payload.options.t, c: payload.options.c, n: 16, every: 2,
      });
      return fc ? { report: fc.report, solids: fc.solids.map(s => ({ label: s.label, rings: s.sections.map(sec => sec.pts) })) } : null;
    }
    if (type === 'depth') return G.solveDepthForMinDL(payload.throat, payload.options);
    if (type === 'tangent') return G.solveTightForMinDL(payload.throat, payload.options);
    if (type === 'separation') return G.solveSeparation(payload.throat, payload.options, payload.config);
    if (type === 'optimise') {
      const { input, options, weights, maxEval, pStart } = payload;
      const cfg = G.lineGridConfig(input);
      const seed = G.makeSeed(input.seed, input.R, input.params[cfg.alphaAt]);
      let warm = pStart, evals = 0;
      const start = performance.now();
      const evalAt = x => {
        const q = x.slice();
        q[cfg.alphaAt] = Math.min(85 * G.D2R, Math.max(5 * G.D2R, q[cfg.alphaAt]));
        const sol = G.solveEqualArea(cfg, q, {
          R: input.R, seed, pStart: warm, t: input.t,
          tol: 1e-9, maxIter: 40, maxGeom: 240, gl: 10, continuation: false,
        });
        evals++;
        if (sol.converged) warm = sol.p;
        const th = G.analyseThroat(G.lineGridCells(sol.geometry, { c: input.c, t: input.t, per: 8 }),
          { c: input.c, R: input.R, dividerTotal: G.lineGridDividerLength(sol.geometry) });
        const map = weights.wTwist > 0 ? G.mapThroatToMouth(th, {
          // 8 of 16, not 6: a coarse proxy inside the search, but a count that
          // DIVIDES its own sample count, so the objective is not read off
          // quantised station positions.
          ...options, samples: 16, stations: 8, keepGeometry: false, computeClearance: false,
        }) : null;
        return G.objective(th, map, { ...weights, correction: sol.correction, infeasible: !sol.converged }).J;
      };
      const r = G.nelderMead(evalAt, input.params.slice(), { maxEval, step: 0.06 });
      r.x[cfg.alphaAt] = Math.min(85 * G.D2R, Math.max(5 * G.D2R, r.x[cfg.alphaAt]));
      return { ...r, evals, ms: performance.now() - start };
    }
    if (type === 'export') {
      const { throat, options, state, format, name, only, shell } = payload;
      const check = diagnose(key, payload);
      const map = check.map;
      const params = designStamp({ ...state,
        mapping: { ...options, samples: check.samples, stations: map.stations },
        verification: { samples: check.compared, ...check.change },
        // Cell loft matches the original; rim derivatives use chord parameters.
        loft: 'uniform',
        rimLoft: { section: 'quintic', perimeter: 'chord' },
      });
      const suffix = ` · checked at ${map.stations} stations / ${check.samples} samples; ${check.change.stable ? 'diagnostics stable under refinement' : 'diagnostics NOT converged at sample limit'} · sampled ducts, not a CAD solid-validity certificate`;
      if (format === 'stl') {
        const solids = G.ductSolids(throat, map, { t: options.t, only });
        if (!solids) throw new Error('No geometry to export');
        return { buffer: G.buildSTL(solids, name), ok: true, msg: `${solids.length} duct meshes${suffix}` };
      }
      let r, note;
      if (format === 'ducts') {
        r = G.buildSTEP(throat, map, { t: options.t, only, params, name });
        note = `${r?.checks.ducts} duct solids`;
      } else {
        // `only` means the two-cell diagnostic kit in the model and suppresses
        // trims. Shell regions must use xSide/ySide so the trim solids survive.
        let labels = null;
        if (format === 'pair') {
          const adjacent = (a, b) => (b.i === a.i + 1 && b.j === a.j) || (b.i === a.i && b.j === a.j + 1);
          const a = throat.cells.find(a => throat.cells.some(b => adjacent(a, b)));
          const b = a && throat.cells.find(b => adjacent(a, b));
          labels = a && b ? [a.label, b.label] : null;
          if (!labels) throw new Error('No adjacent pair to export');
        }
        r = G.buildShellSTEP(throat, map, { ...shell, t: options.t, only: labels, params, name });
        if (!r) throw new Error('No geometry to export');
        const co = G.shellCoincidence(throat, map, { t: options.t, wall: shell.wall, stations: shell.stations });
        const overlap = G.shellOverlap(throat, map, { t: options.t, wall: shell.wall });
        const width = G.throatCellWidth(throat, map, { t: options.t });
        const mirror = r.region ? G.mirrorSymmetry(throat, map, { t: options.t }) : null;
        const axes = [shell.xSide && 'x', shell.ySide && 'y'].filter(Boolean);
        const worst = mirror && axes.length ? Math.max(...axes.map(a => mirror[a].worst)) : 0;
        const recipe = r.mode === 'cells' ? 'subtract each cutter from its matching blank'
          : `union blanks, ${r.trimNames.length ? `subtract ${r.trimNames.join(' and ')}, ` : ''}subtract cutters`;
        note = `${r.cells} blanks + ${r.cells} cutters + ${r.trims || 0} trims — ${recipe}`
          + (r.flarePieces ? ` + ${r.flarePieces} rim piece${r.flarePieces > 1 ? 's' : ''} (root on the aperture; union onto the rim or print apart)` : '')
          + (r.flare && !r.flare.ok ? ` · RIM REFUSED: ${r.flare.why}` : '')
          + ` · cutter extension ${fmt(r.cutterExtMouth, 2)} mm at mouth; flush throat`
          + ` · near-copy arc ${fmt(co.arc)} mm · blank overlap ${fmt(overlap.deepest)} mm`
          + ` · narrowest throat ${fmt(width.min, 2)} mm vs ${fmt(2 * shell.wall)} mm across two walls`
          + (2 * shell.wall > width.min ? ' — non-neighbour blanks can overlap' : '')
          + ` · divider inset ${fmt(check.overrun.shrinkMax, 3)} of a sample step`
          + (check.overrun.reversed ? `; ${check.overrun.reversed} segments clamped` : '')
          + (r.region ? ` · mirror error ${worst.toExponential(1)} mm${worst > 1e-3 ? ' — MIRROR BROKEN' : ''}`
            + (r.region.onPlane.length ? `; do not duplicate on-plane cells ${r.region.onPlane.join(' ')}` : '') : '');
      }
      if (!r) throw new Error('No geometry to export');
      const integrity = G.stepIntegrity(r.text);
      const ok = integrity.ok && r.checks.edgePairing && r.checks.residual < 1e-6;
      return { text: ok ? r.text : null, ok, msg: `${note} · ${integrity.entities} entities · residual ${r.checks.residual.toExponential(1)} mm · ${ok ? 'self-checks pass' : 'SELF-CHECK FAILED — file not written'}${suffix}` };
    }
    throw new Error(`Unknown calculation: ${type}`);
  };
}
