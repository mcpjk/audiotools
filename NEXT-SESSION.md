# Gingko Multicell Horn — immediate tasks

Updated by the review-and-consolidation session. Read `CLAUDE.md` first; this
file only says **what to do next and why**, not how the thing works. Every
number quoted here is measured, and the measurement is recorded in `CLAUDE.md`
under "Known findings worth not re-deriving".

## Where the tool stands

Built and tested (306 checks in `scripts/test-hgrid.mjs`, all against closed
forms):

- Equal-area throat partition — H-grid, O-grid, butterfly.
- **Biradial mouth**, apex-free. Stated as two independent arcs: a coverage
  angle and an arc length per axis. `Th_v = 0` gives a vertically flat mouth.
- **Hypex expansion imposed** (`profileT`), written on the OPEN passage, with
  `m` solved per cell so `k = 1` at both ends. `fc` is a readout, or an input
  via `solveDepthForFc`.
- **Depth solvable for the dL minimum** (`solveDepthForMinDL`): golden section
  on the real dL through the forward model, seeded at 1.09 x mean radius.
  Verified against the recorded 425 mm optimum at 90x40, 600 mm arc. The UI
  states the pick-two-of-three: {fc, mouth size, dL-optimal depth}.
- **Swept sections** (`sectionMode: "swept"`) — each cell's sections built
  around its own centreline, which is what makes per-cell path manipulation
  structurally possible. The UI offers swept only; flow remains the model
  default so the 6.6e-10 mm tiling tests keep measuring it.
- Signed clearance (`clearance.overlap`), now SEPARABLE as `ductClearance` —
  it costs ~5x the rest of the mapping (~80 against ~19 ms at 6x3), so the UI
  computes the mapping live and defers the clearance a beat, same pattern as
  the equal-area solve. `computeClearance: false` skips it in the model;
  defaults stay ON.
- Volume identity with a tested convergence rate, solid/STL/DXF/CSV export.
- One mapping options object (`mapOpts`) feeds the live map and BOTH depth
  solvers. The fc solver used to assemble its own copy with `arcH`/`arcV`
  missing and silently solved the default 480x213 mouth — measured 17 Hz off
  at a 600 mm arc. Fixed; do not let a solver build its own opts again.

Decisions the owner has made and that should not be relitigated:

- Expansion law keys on **open** area, not gross.
- **T = 0.7** default. Hypex 1-D reference stays **advisory**.
- Mouth is stated by **coverage angles and arc lengths**, per axis,
  independently. No apex input.
- Interpenetration in swept mode is **knowingly deferred** — it has not come
  up in a real design yet.
- `arcV` and `arcH` stay under the user's control even when that costs dL.
- **Path lengthening must be a flexible per-cell mechanism**, not a
  centre-row special case (owner, review session). See Task 1.
- **BOTH depth solvers stay** — fc and min-dL are the two legs of the
  pick-two-of-three and each solve is a useful reference point.
- **The omega readouts are DELETED, completely** (owner). Per-cell solid
  angle at a reference point describes the construction up to the aperture;
  past it the mouth radiates as one coupled surface (mutual coupling, edge
  diffraction, mouth size against wavelength), so the number stops
  predicting the horn + free-air system exactly where the pattern starts to
  exist. If a coverage-share diagnostic is ever wanted, measure it in
  DIRECTION space (area swept on the unit sphere by the cell's surface
  normals) — no reference point needed. Do not resurrect apex-referenced
  solid angle.
- **Every depth solve resets `divergeLen`/`arriveLen` to the 0/0 reference
  state** and the sliders stay adjustable afterwards — a solve is a
  repeatable reference point, the runs are the experiment on top of it. The
  owner's working direction is arrival run long, divergence run short.

## Task 1 — flexible per-cell path lengthening (the main build)

**Why.** Path-length spread dL is the dominant term in the fc spread, and the
geometry alone cannot always remove it: depth removes it when both mouth axes
curve, but not for a vertically flat mouth, and the owner wants lengthening
available wherever the deficit lands.

**Which cells need it is NOT fixed.** On the biradial mouth the ordering
flips with depth — rim cells are the long ones when shallow, the centre cell
when deep (`CLAUDE.md`, "AXIAL DEPTH IS THE DOMINANT dL LEVER"). The old
"centre cell is always shortest" claim holds only for the legacy apex-sphere
mouth and is marked superseded. So build the general mechanism:

1. Per-cell centreline offset: a lateral displacement along the centreline,
   zero at both ends, one amplitude per cell (half-cosine in arc length is
   enough to start — the measured deficits, 11.5 mm over ~420 mm, are well
   under one lobe's capacity).
2. Solve each cell's amplitude so its path length hits the target — the
   longest cell's length, since lengthening can only add. Cells already at
   the target get amplitude 0. Monotone in amplitude, so bisection.
3. The deficit map decides which cells snake; nothing in the mechanism may
   assume rows, centres, or rims.
4. Swept mode only — in flow mode a shared boundary point cannot follow two
   different paths; the feature is structurally unavailable there, not
   merely unimplemented.
5. Measure, do not assert: report achieved dL and the clearance
   (`overlap`, `minMid`) together. For the solver's inner loop use a cheap
   estimate (the snaking cell against its own neighbours only) and run the
   full `ductClearance` once at the end — the full metric is ~80 ms and an
   amplitude bisection would otherwise pay it per step.
6. Test against the closed form: a sinusoidal perturbation of amplitude `a`
   over length `L` adds `(pi^2 a^2)/(4 L)` to leading order. Check the
   solver's achieved length against that, never against the tool's own
   previous output.

**The trap to avoid.** Do not reach for a general 3-D spline. Higher order
buys shape freedom and curvature oscillation in the same purchase, and
curvature is the thing being controlled.

## Done since the last handover

- Task 2 (surface the fc spread): the UI shows the fc range, the
  length/ratio decomposition, and now warns past a 3% spread. Done.
- Task 3 (dL depth solver): `solveDepthForMinDL` + "solve min ΔL" button.
  Done.
- Task 4 (retire flow mode from the UI): was already true — the component
  hardcodes `sectionMode: "swept"`; the model keeps flow as the tested
  baseline. Nothing left to do.
- Housekeeping: clearance extracted and deferred; shared `mapOpts`; dead 2-D
  helpers removed; duplicated scaling inline replaced with `scaleRing`;
  stale solver readouts cleared on input changes. NOTE: `solveHypexM` runs
  its full 200 bisections ON PURPOSE — an early exit at ~1e-15 relative
  leaves m a couple of ulps off and breaks the exact k = 1 landing the tests
  assert. It is commented in place; do not "optimise" it again.

## Task 5 — housekeeping that remains

- `src/hgrid-model.js` keeps its name deliberately: it is the *grid* model,
  not the tool. Do not rename it to match the Gingko name.
- The long comment block at the top of `src/GingkoHorn.jsx` and the model
  notes in `src/hgrid-model.js` are part of the deliverable. If the physics
  changes, they change in the same edit.

## How to verify anything here

`vite build` succeeding proves almost nothing — a wrong coefficient compiles
perfectly.

```bash
npm run test:hgrid     # 306 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/gingko-horn.html`
