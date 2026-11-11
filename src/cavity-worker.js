// Background worker for CavityModes.jsx. The eigen-solve takes seconds to
// minutes; run on the page's own thread it would freeze the page for that
// long. The worker holds the full operator; the page gets back only what it
// draws with — the mode shapes and the cell index.
import * as X from "./cavity-model.js";

let op = null;

self.onmessage = ({ data }) => {
  try {
    if (data.type === "solve") {
      const t0 = Date.now();
      const vox = X.voxelise(data.tris, data.h);
      op = X.buildOperator(vox);
      self.postMessage({ type: "grid", N: op.N, volume: op.volume, droppedVolume: op.droppedVolume,
        badRays: vox.badRays, rays: vox.rays, cellsTotal: vox.nx * vox.ny * vox.nz });
      const r = X.solveModes(op, data.kCut, { cgTol: 1e-9,
        onProgress: (p) => self.postMessage({ type: "progress", ...p, seconds: (Date.now() - t0) / 1000 }) });
      const modes = X.normaliseModes(op, r.modes, 1).map(({ k, weight, uniform, psi }) => ({ k, weight, uniform, psi }));
      const index = op.index.slice();
      const mass = op.mass.slice();
      self.postMessage({ type: "modes", converged: r.converged, steps: r.steps, seconds: (Date.now() - t0) / 1000,
        op: { N: op.N, index, mass, Vf: op.Vf, volume: op.volume, grid: op.grid }, modes },
        [index.buffer, mass.buffer, ...modes.map((m) => m.psi.buffer)]);
    } else if (data.type === "static" && op) {
      const { z1, z2 } = X.staticFields(op, data.src);
      const a = Float32Array.from(z1), b = Float32Array.from(z2);
      self.postMessage({ type: "static", id: data.id, z1: a, z2: b }, [a.buffer, b.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: "error", message: String(e && e.message || e) });
  }
};
