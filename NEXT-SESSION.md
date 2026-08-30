# Ginkgo Multicell Horn — immediate tasks

Updated by the review-and-consolidation session. Read `CLAUDE.md` first; this
file only says **what to do next and why**, not how the thing works. Every
number quoted here is measured, and the measurement is recorded in `CLAUDE.md`
under "Known findings worth not re-deriving".

## Where the tool stands

Built and tested (336 checks in `scripts/test-hgrid.mjs`, all against closed
forms):

- Equal-area throat partition — H-grid, plus the O-grid as the equal-N
  comparison at the throat.
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

## Task A — convex mouth-cell edges, to merge ducts early

Owner's direction. The idea: bulge each mouth cell's edges outward so
neighbouring ducts begin to overlap BEFORE the mouth, and the wall left
between them terminates as a thin edge rather than a blunt land. (The
owner's sentence describing the goal was cut off mid-way — confirm the
intent before building.)

What to think about first, because it touches the invariant everything
downstream rests on: convex mouth cells NO LONGER TILE. Today the mouth
grid is a partition — cells share edges exactly, areas sum to the aperture,
and `mouthAreaTotal` and the per-cell expansion ratio both depend on that.
Overlapping mouth cells double-count area, so before any geometry changes,
decide what "mouth area" means: the union (what radiates) or the sum (what
the profile targets). The expansion law reads the per-cell figure, so it
needs the honest one.

The physical prize is real though — the blunt divider trailing edge is a
diffracting discontinuity, and `dividerEndFrac` currently tapers the WALL
to nothing while leaving the two ducts merely touching. Merging them
earlier, with a knife edge, is a better termination.

## Task B — STEP export

Owner's direction. See the session notes: the ducts are already a stack of
section rings, which is exactly the input a lofted B-spline surface wants,
so the data is the right shape. The work is a hand-written AP214 writer
(no libraries) emitting B_SPLINE_SURFACE_WITH_KNOTS per duct wall plus
capped, oriented CLOSED_SHELL topology. The real risk is that nothing in
this environment can open a STEP file to check it, so plan the validation
strategy — referential integrity of the entity graph, reuse of the existing
manifold and volume checks — before writing the emitter.

## Task C — per-cell bow choice (deferred by the owner)

Not needed yet; revisit when wavefront manipulation beyond dL equalisation
is wanted.

`solveBow` now enumerates direction x lobes x region for the WHOLE horn,
builds and measures every candidate, ranks on `wallSpread` and applies the
overlap floor as a constraint. What it does not do is choose PER CELL.

That is the next increment, and the reason it was not done here is that a
per-cell direction has to keep mirror pairs mirrored or it destroys the
symmetry the directions exist to preserve. Shape of the work: pick the
direction and region per SYMMETRY CLASS rather than per cell (the classes
are already computed — `classIndex` in the equal-area solve), so mirrored
cells move together by construction. Objective and constraint are unchanged.

Worth knowing before starting: the winning region on the curved mouth is
[0.3, 0.95] — "where the room is" — and the gap profile predicts it, so a
per-cell version should probably derive each cell's region from its OWN gap
profile rather than searching a fixed preset list.

The same lever still fixes the standing swept-mode interpenetration the
PROFILE causes, independent of bows: spreading centrelines apart where k
approaches 1.

**The trap to avoid** stands: no general 3-D spline. Higher order buys shape
freedom and curvature oscillation in the same purchase, and curvature is the
thing being controlled.

## Done since the last handover

- Renamed to **Ginkgo** (the botanical spelling), URL and all. The old
  `gingko-horn.html` 404s in production, accepted like `cd-exit-divider`.
- **Per-cell path lengthening** (`lengthen`): sin^2(n pi u) bows, amplitude
  bisected on measured length, longest cell untouched, end rings frozen to
  3e-14 mm, fc spread collapses with dL. UI block in the path card; bow
  amplitudes in the table and CSV.
- **Symmetric bow direction** (`dir: "radial"` / `"-radial"`): each duct bows
  along its own outward ray from the axis, so both mirrors survive at
  5.6e-11 mm where a world axis breaks one at 20.5 mm. On-axis ducts are
  reported (`lengthen.onAxis`), never skewed.
- **UI layout**: the horizontal section and the 3-D duct preview sit side by
  side directly under the throat and mouth plans, and BOTH depth solves are
  one control group in the section card — they spend the same knob.
- **Bow region** [uStart, uEnd] with the straight runs excised per cell, so
  `arriveLen` is finally honoured (it was bowed 1.2-1.4 mm through before).
- **Short-axis bow direction** and the `bendWiden` metric that justifies it.
- **The fc depth solve now reports the horn it built** — mouth area,
  expansion ratio, duct length, dL against budget, and how far it landed from
  the dL optimum. It was returning physically silly horns for a structural
  reason, not a solver fault: on the biradial mouth the aperture is fixed by
  the coverage arcs, so depth moves ONLY path length. Asking for a cutoff is
  asking how long the horn must be, and a high cutoff answers with a very
  short body under a full-size mouth (fc 900 Hz -> 85 mm depth, 1560 cm2
  mouth, dL 177 mm, per-cell fc 551-1534 Hz). Kept, with the consequence
  visible.
- **Removed at the owner's request**: radial-in, the four world-axis bow
  directions, and the butterfly family. Lobes are offered as 1 or 2 with 1
  the default — the measured metric prefers 2, but three-plus humps read as
  a corrugation and are not commercially acceptable, so the default is a
  deliberate trade. See the correction in CLAUDE.md.
- **`wallSpread`**, the measured inner-vs-outer wall difference, replaces
  `bendWiden` as the number to judge a bow by. It overturned the lobe
  finding: bendWiden ranks 1 lobe best, the fibres say 2-3 by a factor of
  nearly 3.
- **`solveBow`**: enumerate direction x lobes x region, measure each, take
  the lowest wall spread inside an overlap floor. Winner on the curved
  mouth: short axis / 3 lobes / [0.3, 0.95] when 3 is allowed; the UI
  searches only the offered 1 and 2.
- **The three limits are printed SEPARATELY** — flare cutoff and loading in
  the Hypex card, pattern PER AXIS beside the arcs that set it. f_c is the
  flare constant and reads as contradicting the "mouth area needed" figure
  when it is not.
- **Defaults at the owner's call**: stations 16 -> 64 (bend structure was
  visibly faceted at 16; costs ~101 ms in the render pass and ~496 ms for
  the deferred clearance at 6x3), lobes 1 or 2 with 1 the default, bow
  region default [0, 0.5] with only "throat half" and "divider region"
  offered.

## Known cost worth watching

At stations 64 the render-pass mapping is ~101 ms at 6x3 (it was ~19 ms at
16 with no bows). That is ~10 fps on a slider drag. If it starts to grate,
the fix is to decouple PREVIEW resolution from EXPORT resolution — build the
live map at 16-24 stations and re-run at the export setting only when the
STL/DXF/STEP button is pressed. Not done yet because the deferred clearance
already keeps the worst cost off the interactive path.
- **3-D duct preview**: the exported solids (inset and all) on a hand-rolled
  canvas — orthographic, painter's sort, two-sided lambert, palette-derived
  shading. Deferred off the render pass like the clearance. No three.js;
  the no-external-libraries rule stands.
- Fixed a 1x1-grid crash in `solveEqualArea` (temporal dead zone on the
  zero-constraint path).
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
  not the tool. Do not rename it to match the Ginkgo name.
- The long comment block at the top of `src/GinkgoHorn.jsx` and the model
  notes in `src/hgrid-model.js` are part of the deliverable. If the physics
  changes, they change in the same edit.

## How to verify anything here

`vite build` succeeding proves almost nothing — a wrong coefficient compiles
perfectly.

```bash
npm run test:hgrid     # 336 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/ginkgo-horn.html`
