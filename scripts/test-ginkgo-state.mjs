import assert from 'node:assert/strict';
import test from 'node:test';
import * as G from '../src/hgrid-model.js';
import { canonical, designKey, designStamp, readDesignStamp, convergence } from '../src/ginkgo-state.js';
import { createCompute } from '../src/ginkgo-compute.js';
import { replayDesign } from '../src/ginkgo-replay.js';
import { WorkerLane } from '../src/ginkgo-worker-client.js';

test('canonical state is order-independent, exact, and rejects lossy values', () => {
  assert.equal(designKey({ a: 1, b: [2, 3] }), designKey({ b: [2, 3], a: 1 }));
  assert.notEqual(designKey({ tightThroat: .28 }), designKey({ tightThroat: .28000001 }));
  for (const value of [NaN, Infinity, undefined, () => {}]) assert.throws(() => canonical({ value }));
  const state = { note: 'apostrophe\'s { brace } and "quote"', layout: { params: [1, 2] } };
  assert.equal(readDesignStamp(designStamp(state)).note, state.note);
  assert.throws(() => readDesignStamp('no stamp'));
  assert.throws(() => readDesignStamp('GINKGO_DESIGN_V1={'));
});

test('worker cancellation, out-of-order replies, errors, and recovery', async () => {
  const workers = [];
  const lane = new WorkerLane(() => {
    const w = { terminate() { this.terminated = true; }, postMessage(data) { this.sent = data; } };
    workers.push(w); return w;
  });
  const old = lane.run('map', 'old', {});
  const cancelled = assert.rejects(old, { name: 'AbortError' });
  const current = lane.run('map', 'current', {});
  await cancelled;
  assert.equal(workers[0].terminated, true);
  workers[0].onmessage({ data: { ...workers[0].sent, result: 'obsolete' } });
  workers[1].onmessage({ data: { ...workers[1].sent, result: 'current' } });
  assert.equal(await current, 'current');
  const failed = lane.run('map', 'failed', {});
  const rejected = assert.rejects(failed, /test failure/);
  workers[1].onerror({ message: 'test failure' });
  await rejected;
  const recovered = lane.run('map', 'recovered', {});
  workers[2].onmessage({ data: { ...workers[2].sent, result: 7 } });
  assert.equal(await recovered, 7);
  lane.dispose();
});

test('convergence reports worsening margins and never treats missing metrics as stable', () => {
  const a = { bendFoldMin: 1.44, fluxContractMax: 0, sectionObliqMax: 24.38 };
  assert.equal(convergence(a, { ...a, bendFoldMin: 1.36 }).stable, false);
  assert.equal(convergence(a, { ...a, bendFoldMin: 1.43 }).stable, true);
  assert.equal(convergence(a, { ...a, fluxContractMax: .01 }).stable, false);
  assert.equal(convergence(a, { ...a, bendFoldMin: NaN }).stable, false);
});

test('worker snapshots and STEP metadata replay the actual non-default geometry', () => {
  const compute = createCompute();
  const cfg = G.lineGridConfig({ nc: 6, nr: 3, m: 3, symmetric: true });
  const input = { R: 17.75, nc: 6, nr: 3, m: 3, symmetric: true, t: .4, c: G.speedOfSound(30),
    seed: 'elliptical', params: G.nominalParams(cfg), alphaAt: cfg.alphaAt };
  input.params[cfg.lonAt + 1] = .012;
  const layout = compute('layout', 'layout', input);
  structuredClone(layout); // Functions in a worker reply would break the UI.
  const separate = { amps: { 0: { amp: 0.1, dx: 1, dy: 0 } }, uStart: .2, uEnd: .8, lobes: 1, mode: 'nudge' };
  const options = { c: input.c, nc: 6, nr: 3, R: input.R, rectangular: true, t: input.t,
    depth: 300, exitHalfAngle: 16.55, tight: .5, tightThroat: .28, tightMouth: .5,
    mouthMode: 'biradial', thetaH: 90, thetaV: 0, arcH: 500, arcV: 245,
    profileT: .7, profileArea: 'open', sectionMode: 'swept', shapeMorph: 'radius',
    stations: 48, samples: 1024, stationSampling: 'interpolated', separate, lengthen: null, divergeLen: 2, arriveLen: 1,
    keepGeometry: true, computeClearance: false };
  const key = designKey({ input, options, floor: 1.5 });
  const payload = { throat: layout.throat, options, floor: 1.5 };
  structuredClone(compute('map', key, payload));
  const checked = compute('diagnostics', key, payload);
  structuredClone(checked);
  assert.equal(checked.map.stations, options.stations);
  assert.ok(checked.samples >= 2048);
  assert.equal(checked.map.separate.cells, 1, 'the saved displacement is actually applied');
  const cached = compute('diagnostics', key, payload);
  assert.equal(checked.map.rows, cached.map.rows, 'reuses the checked map');
  const state = { layout: input, achieved: layout.solve.p, separation: separate };
  const result = compute('export', key, { ...payload, state, format: 'ducts', name: 'replay-test', only: ['1,1'] });
  assert.equal(result.ok, true);
  const restored = readDesignStamp(result.text);
  assert.equal(restored.mapping.tightThroat, .28);
  assert.deepEqual(restored.mapping.separate, separate);
  assert.deepEqual(restored.achieved, layout.solve.p);
  assert.equal(restored.mapping.samples, checked.samples);
  const replay = replayDesign(restored);
  let worst = 0;
  for (let i = 0; i < replay.map.rows.length; i++)
    for (let q = 0; q < replay.map.rows[i].sched.length; q++)
      for (let k = 0; k < replay.map.rows[i].sched[q].pts.length; k++)
        worst = Math.max(worst, Math.hypot(...replay.map.rows[i].sched[q].pts[k]
          .map((v, axis) => v - checked.map.rows[i].sched[q].pts[k][axis])));
  assert.ok(worst < 1e-8, `replayed vertices differ by ${worst} mm`);
  const shell = compute('export', key, { ...payload, state, format: 'shell', name: 'shell-replay',
    only: ['1,1'], shell: { wall: 3, stations: 16, extendThroat: false, trimThroat: false,
      extendMouth: true, trimMouth: true, folders: true, xSide: -1, ySide: -1 } });
  assert.equal(shell.ok, true);
  assert.match(shell.msg, /6 blanks \+ 6 cutters \+ 1 trims/, 'region exports keep their trim solids');
  assert.deepEqual(readDesignStamp(shell.text).achieved, layout.solve.p);
});

test('station interpolation preserves endpoints, the expansion clock and dividing-count geometry', () => {
  assert.equal(G.interpolateSample([0, 10, 20], .25), 5);
  const points = [[0, 0, 0], [2, 4, 6], [4, 8, 12]];
  assert.deepEqual(G.interpolateSample(points, .25), [1, 2, 3]);
  assert.equal(G.interpolateSample(points, 1), points[2]);
  const throat = G.buildLayout({ R: 17.75, nc: 6, nr: 3, m: 3, t: .4, c: 349 }).throat;
  const opts = { R: 17.75, nc: 6, nr: 3, c: 349, t: .4, depth: 300, exitHalfAngle: 16.55,
    mouthMode: 'biradial', thetaH: 90, thetaV: 0, arcH: 500, arcV: 245, tight: .5,
    profileT: .7, profileArea: 'open', shapeMorph: 'radius', sectionMode: 'swept',
    samples: 128, keepGeometry: true, computeClearance: false };
  const snapped = G.mapThroatToMouth(throat, { ...opts, stations: 64 });
  const exact = G.mapThroatToMouth(throat, { ...opts, stations: 64, stationSampling: 'interpolated' });
  assert.deepEqual(exact.rows, snapped.rows, 'dividing station counts stay bit-identical');
  const dense = G.mapThroatToMouth(throat, { ...opts, stations: 128 });
  const fraction = G.mapThroatToMouth(throat, { ...opts, stations: 48, stationSampling: 'interpolated' });
  for (let i = 0; i < fraction.rows.length; i++) {
    const row = fraction.rows[i], ref = dense.rows[i];
    assert.deepEqual(row.sched[0].pts, ref.sched[0].pts);
    assert.deepEqual(row.sched[48].pts, ref.sched[128].pts);
    const sections = G.ductSections(throat.cells[i], row, { t: .4 });
    const a0 = G.polyArea3(sections[0].pts);
    for (let q = 1; q < 48; q++) {
      assert.deepEqual(row.sched[q].origin, G.interpolateSample(ref.sched.map(s => s.origin), q / 48));
      assert.equal(row.sched[q].sLen, G.interpolateSample(ref.sched.map(s => s.sLen), q / 48));
      const want = a0 * G.hypexR(row.sched[q].sLen, 1, row.profM, opts.profileT) ** 2;
      assert.ok(Math.abs(G.polyArea3(sections[q].pts) / want - 1) < 1e-8, 'open area follows its interpolated path-length clock');
    }
  }
});
