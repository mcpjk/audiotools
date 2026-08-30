# Gingko Multicell Horn — immediate tasks

Written at the end of the session that renamed the tool. Read `CLAUDE.md`
first; this file only says **what to do next and why**, not how the thing
works. Every number quoted here is measured, and the measurement is recorded
in `CLAUDE.md` under "Known findings worth not re-deriving".

## Where the tool stands

Built and tested (298 checks in `scripts/test-hgrid.mjs`, all against closed
forms):

- Equal-area throat partition — H-grid, O-grid, butterfly.
- **Biradial mouth**, apex-free. Stated as two independent arcs: a coverage
  angle and an arc length per axis. `Th_v = 0` gives a vertically flat mouth.
- **Hypex expansion imposed** (`profileT`), written on the OPEN passage, with
  `m` solved per cell so `k = 1` at both ends. `fc` is a readout, or an input
  via `solveDepthForFc`.
- **Swept sections** (`sectionMode: "swept"`) — each cell's sections built
  around its own centreline, which is what makes per-cell path manipulation
  structurally possible. Flow mode is still the default.
- Signed clearance (`clearance.overlap`), volume identity with a tested
  convergence rate, solid/STL/DXF/CSV export.

Decisions the owner has made and that should not be relitigated:

- Expansion law keys on **open** area, not gross.
- **T = 0.7** default. Hypex 1-D reference stays **advisory**.
- Mouth is stated by **coverage angles and arc lengths**, per axis,
  independently. No apex input.
- Interpenetration in swept mode is **knowingly deferred** — it has not come
  up in a real design yet.
- `arcV` and `arcH` stay under the user's control even when that costs dL.

## Task 1 — centre-row lengthening by snaking (the main build)

**Why now.** Path-length spread dL is the dominant term in the fc spread, and
it is the one thing the geometry cannot fix once the mouth shape is chosen by
coverage. Axial depth removes it when the mouth is curved on both axes
(dL 2.0 mm at the optimum) but *not* when the user wants a vertically flat
mouth, which is a legitimate CD geometry the owner wants available.

**What makes it tractable.** With `Th_v = 0` the deficit is not scattered —
it lands almost entirely on the middle row and is nearly constant along it:

```
Th_v 0 (FLAT)   dL 13.0 mm
  row 0:  0.0 0.3 1.0 1.0 0.3 0.0
  row 1: 13.0 11.5 11.5 11.5 11.5 13.0     <- four identical, two rim +1.5
  row 2:  0.0 0.3 1.0 1.0 0.3 0.0
```

So one snake profile, tessellated across the row, covers four of the six cells
exactly and the rim pair with a scaled version. That is a much smaller build
than a general per-cell equaliser.

**Where it goes.** Swept mode only — this is exactly what swept sections
unlocked. In flow mode a boundary point is shared by two neighbours, so it
cannot follow one cell's lengthened path and the other's unlengthened one; the
feature is not merely unimplemented there, it is unavailable.

**Suggested shape of the work.**

1. Add a per-cell centreline offset: a lateral displacement applied along the
   centreline, zero at both ends, with amplitude and one or two lobes. A
   half-cosine in the arc-length parameter is enough to start with — the
   deficit is 11.5 mm over a ~420 mm path, well under one lobe's capacity.
2. Solve the amplitude per cell so its path length hits the target (the
   longest cell's length, or the row mean). One scalar per cell, monotone in
   amplitude, so bisection is sufficient.
3. Measure, do not assert: report achieved dL after snaking, and report the
   clearance (`clearance.overlap` and `clearance.minMid`) alongside it. Room
   exists at the dL-optimal depth — widest half-gap measured 9.2–12.1 mm — but
   the flat-mouth case has not been measured for room and must be.
4. Test against a closed form: a sinusoidal perturbation of amplitude `a` and
   half-wavelength `L` lengthens a straight path by `(pi^2 a^2)/(4 L)` to
   leading order. Check the solver's achieved length against that, not against
   the tool's own previous output.

**The trap to avoid.** Do not reach for a general 3-D spline. Higher order
buys shape freedom and curvature oscillation in the same purchase, and
curvature is the thing being controlled.

## Task 2 — surface the fc spread in the UI

The tool currently reports one `fc`. It is only one number when dL is small.
Measured at 90x40, matched radii, T 0.7:

```
depth 200:  dL 81.3 mm   fc 539-753 Hz   spread 39.8%
depth 425:  dL  2.0 mm   fc 361-363 Hz   spread  0.5%
```

Report the range and the `fcDecomp` split (path length vs area ratio) rather
than a single figure, and warn when the spread exceeds some fraction — a few
percent is the natural line, since that is where the horn stops having one
cutoff.

## Task 3 — a depth solver for the dL optimum

`solveDepthForFc` exists; the dL optimum does not have a solver, only the seed
`depth ~ 1.09 x mean(rH, rV)` and a hand-run golden section. Wire the search
in as a button ("depth for minimum dL") next to the fc solve, and state the
over-determination plainly in the UI: **you may pick any two of {fc, mouth
size, dL-optimal depth}**, never all three.

## Task 4 — retire flow mode (owner asked, deferred as non-blocking)

The owner asked to remove flow mode in favour of swept. It is still the
default because the shared-boundary invariant is what the tiling tests measure
and swept mode gives that up on purpose. Do this only after Task 1, and keep
flow mode reachable from the model (not the UI) so the tests that measure
6.6e-10 mm tiling keep running.

## Task 5 — housekeeping

- `src/hgrid-model.js` keeps its name deliberately: it is the *grid* model,
  not the tool. Do not rename it to match the Gingko name.
- The long comment block at the top of `src/GingkoHorn.jsx` and the model
  notes in `src/hgrid-model.js` are part of the deliverable. If the physics
  changes, they change in the same edit.

## How to verify anything here

`vite build` succeeding proves almost nothing — a wrong coefficient compiles
perfectly.

```bash
npm run test:hgrid     # 298 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/gingko-horn.html`
