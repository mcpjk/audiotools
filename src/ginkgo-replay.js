import * as G from './hgrid-model.js';
import { canonical, DESIGN_SCHEMA } from './ginkgo-state.js';

// Rebuild the achieved grid directly. Re-running the nearest-request solver
// would discard the very coefficients saved to reproduce a returned CAD file.
export function replayDesign(state) {
  canonical(state); // reject undefined/non-finite or non-JSON state
  if (state.schema !== DESIGN_SCHEMA) throw new Error('Unsupported design schema');
  const input = state.layout;
  const cfg = G.lineGridConfig(input);
  if (state.achieved.length !== cfg.nParams) throw new Error('Grid coefficient count does not match topology');
  const seed = G.makeSeed(input.seed, input.R, state.achieved[cfg.alphaAt]);
  const grid = G.lineGrid(cfg, state.achieved, seed, input.t);
  const throat = G.analyseThroat(G.lineGridCells(grid, { c: input.c, t: input.t }),
    { c: input.c, R: input.R, dividerTotal: G.lineGridDividerLength(grid) });
  const map = G.mapThroatToMouth(throat, { ...state.mapping, keepGeometry: true, computeClearance: false });
  return { throat, map };
}
