# Ginkgo Multicell Horn — the task queue

This file is the handover: what to build next and the measurement each
task rests on. It is NOT a changelog — findings live in CLAUDE.md and
history lives in git. Keep it short enough to read in full.

## THE STANDING PRIORITY (read the top of CLAUDE.md before anything here)

A coherent horn built on acoustic principles is the point. Geometric
decisions in this tool are acoustic decisions and have to be argued and
measured that way. The section-plane finding is the worked example of what
happens otherwise: a construction chosen for construction reasons satisfied
every number the tool reported while the passage the wave crosses contracted
27% below its own throat.

## Shipped 2026-09-04 — a trimming pass, and one measurement that mattered

Owner's edits. Every number is a CLAUDE.md finding.

- **Four export formats removed** — DXF, JSON, per-cell CSV, ΣA(x) CSV — and
  `sigma`, `cellParity` and every `jitter` argument with them. Only the three
  exports that carry a SOLID remain. **The ΣA(x) CSV was the only route into
  a 1-D simulator (Hornresp / ABEC)**; `sched[q].axial` is still on every row
  if that handoff is ever wanted back.
- **The wall jitter is gone**, on the owner's CAD evidence rather than on a
  number here. It did what it claimed (near-copy arc 148 → 0 mm) but never
  changed a boolean outcome, and adjacency is what actually sorts the unions.
  `shellCoincidence` still measures the arc on every export — 148.2 mm at the
  defaults — so the degeneracy is reported, not hidden.
- **The throat end is pinned PLAIN**; only the mouth keeps extend/trim/plain.
  The recipe is now one trim, not two, and the 27/27 coplanar throat caps come
  back as the accepted trade.
- **The cutter is FLUSH at the throat and sized from the station step at the
  mouth.** It went to a fixed 1 mm first, on the cap-fill sag alone, and the
  owner found in CAD that the side walls folded back before reaching it. The
  fold threshold is a RATIO (~0.4 of a station step), so no constant is safe:
  1 mm is 0.20 of a step at 64 export stations and folded 0.15 mm at the
  throat and 0.16 at the mouth. The throat extension was never buying anything
  either — both cap fills there are the plane z = 0 exactly — so it is gone,
  which also puts the cutter in plane with the blank, a change the owner has
  measured taking a subtraction from failing to succeeding.
- **Bow region presets replaced by ±0.01 / ±0.05 steppers**, and the default
  moved to [0.02, 0.22] grade 0.15. All four presets started at u = 0, the one
  case measured to drive the ducts through each other.
- **Defaults**: bow region [0.02, 0.22], region grade 0.20, min gap 1.5 mm,
  export region the -x -y quarter.
- **The shell kit ships as a STEP assembly** — blanks, cutters and trims in
  separate folders, each body named for its cell. Every occurrence carries the
  identity transform and the geometry is the flat file's point for point (both
  asserted). `tree: flat` in stage 9 is the fallback if an importer mishandles
  it; the duct export is unchanged.

**The one number worth acting on**: at the new bow default the fold margin is
**1.10 mm displayed and 0.87 mm converged** at grade 0.20 (1.77 / 1.47 at the
0.15 it replaced), down from 2.99 at the old [0, 0.20] grade 0 — the grade buys its
47% better clearance (−7.44 → −3.97 mm) by narrowing the inner cells' windows,
and a narrower window is a steeper turn. It is not folded, but it is the
thinnest margin any shipped default has carried. Moving the region start to
u ≥ 0.10, or going to the dL-optimal depth, is what gives it back.

**And the comparison that has not changed**: [0.30, 0.95] measures −0.050 mm,
bit-identical to the unbowed horn, at 12.61 mm of fold margin and dL exactly 0.
A window off the throat is still free; [0.02, 0.22] is still a deliberate
purchase of acoustic placement for ~3.9 mm of interpenetration.

## Shipped 2026-09-03 — orientation only

Every measurement is a CLAUDE.md finding and the commits carry the rest.
Nothing here is a task.

- Duct separation moved to stage 8, and a `solveSeparation` bug fixed: a
  failed solve returned a field WORSE than no separation and the UI applied it.
- The throat run rule became **"the gap must be opening"**, replacing the
  symmetric band that filed a −0.49 mm dive as a knife edge.
- Section planes now follow the tangent (`sectionAlign`), with metrics that
  can see the passage: `fluxContractMax`, `sectionObliqMax`, and `bendFoldMin`
  — the only witness to a folded duct, since a folded one still meshes closed.
- `samples` raised 64 → 512, and `stations` can no longer exceed it. Only the
  fold margin moved (it was 56% optimistic); the recorded 10.9% passage
  contraction turned out to be an ALIASING artifact.
- Mutual repulsion built (`solveSeparation` mode `"repel"`). What it bought
  was the DIAGONALS — the chain slides ducts into diagonal neighbours and
  nothing scored that. All three modes now score on them.
- The separation solve got a **path-length budget**: a candidate can only
  become the best state if ΔL stays within λ/8 of where it started.
  Re-targeting the bow instead was measured first and folds the duct.
- The **graded bow region** (`lengthen.regionGrade`) built, grade 0
  bit-identical. Worth 13–21% of the damage a throat-anchored bow does, and
  it spends fold margin to get it.
- Housekeeping: the O-grid family and its mesh machinery deleted (~1130
  lines), with `solveBow`, `solveDepthForFc`, `shellSolids`,
  `buildSolidsSTEP`, `polyArea2`, `hypexFlareRate` and five test sections.
  Default arcH 555 → 500 mm.

**Still a decision, not a done deal**: arcH 500 moved the dL optimum to
319.5 mm, so the shipped depth of 300 is nearly on it. The last 19.5 mm takes
ΔL 14.60 → 11.93 mm and the bow's fold margin 4.45 → 5.82 mm. Owner's call.

**One thing repulsion deliberately did not do, still open**: the field is one
vector per cell times one window, so it can SLIDE a duct but not re-route it.
A per-STATION field is the next step and is a bigger build — the amplitude
becomes a profile, the windowing stops being a window, and the mirror and
end-pinning guarantees have to be re-established per station.

## Explored and REJECTED, so it is not re-proposed

- **Staggering the bow across a row** (owner's proposal): built, measured on
  three geometries, worse on every one, in both senses. Cells in a row bow the
  SAME way by construction, so moving together preserves their spacing and
  de-synchronising them destroys it. Reverted. Full numbers in CLAUDE.md.
- **A bang-bang (constant-curvature) bow window**: would cut the peak
  curvature ~19% against sin^2 but buys a curvature discontinuity at each
  junction. Trade recorded in CLAUDE.md, not built.
- **Growing the OUTER bow window instead of shrinking the inner one** (the
  "widen" and "tail" anchorings of the region grade): same amplitude
  ordering, no fold risk, marginally better gap — but it buys that by
  inflating the outer cell's displacement to 61 mm on a 325 mm path. Dropped
  in favour of the concentric form. Numbers in CLAUDE.md.

## The queue

In priority order. Each rests on a measurement, named.

### DEPTH 300 IS SETTLED — do not re-propose the move

Asked and answered 2026-09-04. **300 stays, and it is deliberate: it is the
reference the "solve depth for ΔL" button is read against.** The owner always
initiates that solve manually, so a default already sitting on the optimum
would leave the button with nothing to say. The measurements below are what it
reports, not a case for changing the default.

Five separate routes have now pointed at 319.5 mm and been declined for this
reason. **The sixth should not be written.** What the numbers are for is
reading the button's output: same bow, same grade, sweeping only depth —

| depth | ΔL | bow amp | foldMin | worst gap |
|---|---|---|---|---|
| 300 (shipped) | 0.00 | 21.3 | 1.77 | −3.967 |
| 319.5 (ΔL optimum) | 0.00 | 21.0 | 4.51 | −0.169 |
| 357 | 0.00 | 26.1 | 4.94 | +1.517 |

The live consequence to keep in view: **at the shipped default the fold margin
is 1.77 mm**, the thinnest any shipped default has carried. Not folded, and the
owner's call — but read `bendFoldMin` in the verdict strip before committing a
print.

### 0. SOLVE OR RE-PIN `tightThroat` — the largest free improvement on the shipped horn

Measured 2026-09-04 on the current defaults (region grade 0.20, samples 2048,
stations 64, inset outlines, diagonals in, floor 1.5 mm), and it contradicts
the standing CLAUDE.md finding, which was taken on the old curved mouth at
depth 425 and judged on `wallSpread` before `bendFold` existed.

At depth 300 with the shipped bow, moving `tightThroat` 0.5 -> 0.25:

| | 0.5 (shipped) | 0.25 |
|---|---|---|
| fold margin | **0.898 mm** | **2.106** |
| wall gap | **-2.639 mm** | **+0.049** |
| wallSpread | 14.37 mm | 12.70 |
| obliquity | 24.3 deg | 18.4 |
| 1.5 mm reach | 77% | 85% |
| dL | 0.000 | 0.009 |

Every metric improves and the interpenetration crosses zero. Ends stay exact
(station 0 at 0.0e+0, mouth on the aperture to 5.7e-14). The fold margin it
more than doubles is the 0.898 mm the grade-0.20 default carries, which is the
thinnest any shipped default has had.

**It is compensating for depth 300 being off its optimum**, which is the real
finding: at 319.5 and 357 the shipped 0.5 is the better value on both fold and
gap. Depth 300 is settled for UI reasons, so `tightThroat` is the lever that
pays for it — and it is currently pinned at the value that suits a depth we
are not using.

Three options, in order of what they cost:
1. **Re-pin at 0.25.** One line. Wrong if the depth ever moves.
2. **Make it adjustable again** — it was a slider once.
3. **Solve it, like depth.** The right value tracks the depth, and the depth
   solve is a button the owner presses. This is what the old finding's own
   closing line proposed.

Do NOT fold it into the region-grade solve: the grade sets each cell's window
width, `tight` sets the base centreline for all cells. Lumping them hides
which is doing the work — and the grade moves this knob's usable window, so a
joint solve would be searching a space whose shape it cannot report.

The plateau is 0.20-0.25 at the shipped grade 0.20 (it was 0.18-0.28 at grade
0.15), with a cliff at 0.28 (gap +0.049 -> -0.491). Read it; do not
extrapolate.

### 1. Raise the PREVIEW station count

**The `samples` half landed 2026-09-03** (64 -> 512, and `stations` can no
longer exceed `samples`). What is left is the preview count itself: the
sliders and the 3-D view run on 24 stations while the exports and the
clearance solve build at 64.

**First, what does NOT depend on it**, measured at the defaults with the
shipped bow — ΔL, Lmin, Lmax, mouth area, f_c and turn are IDENTICAL at 24,
32, 48 and 64, because they come from `samples` rather than from the ring
count. wallSpread moves 0.32%. So every number you drag a slider against is
already exact, which is worth knowing before budgeting a session here.

**Two things do move.** Measured at the defaults with the shipped bow:

| stations | 24 | 32 | 48 | 64 | 128 | 256 |
|---|---|---|---|---|---|---|
| sectionObliqMax (deg) | 40.91 | 34.52 | 26.14 | 20.67 | 20.98 | 21.36 |
| bendFoldMin (mm) | 1.6122 | 1.7732 | 1.6122 | 1.7732 | 1.7732 | 1.7096 |

- **Obliquity is genuine under-resolution**: monotone, converged by 64. So the
  export is right and **the 24-station preview reads the section tilt nearly
  TWICE as bad as it is** — pessimistic, where the clearance is optimistic.
- **THE FOLD MARGIN IS NOT A STATION PROBLEM AT ALL** — see the finding it now
  carries in CLAUDE.md. An earlier version of this section attributed the
  24/48-vs-32/64 pairing to station SNAPPING and told the reader to use counts
  that divide 512. **That was wrong and the test that would have caught it is
  one line**: at samples 480, where 24/32/48 all divide and 64 does not, the
  pairing does not move at all. The station count is a weak effect here; the
  binding resolution is `samples`.

And the live cost of the preview count: on the current default bow the
clearance would read **−2.11 mm at 24 stations against −3.97 at 64**. The
readout already dodges this by building its own 64-station map, so what is
still exposed is the 3-D preview — the picture the horn is judged by is a
coarser horn than the one exported.

### 2. Chord-length parameterisation in `ductBrep` — the root cause of three symptoms

**This is the item to reach for next.** `ductBrep` interpolates its loft with a
UNIFORM parameterisation: it assumes every station ring is the same distance
from the next and never measures. Where the rings really are evenly spaced that
is right. Where they are not, the spline is told a short gap is a full one, so
it delivers a full pitch of curvature into a fraction of the distance —
overshooting past the end ring and coming back. The wall then pokes through the
cap meant to close it, and **no self-check in the file can see it**: residual,
edge pairing and referential integrity all pass, because none of them tests a
surface against itself.

Three recorded symptoms, one bug:

1. **The cutter extension** — a 1 mm prepend against 4.87 mm station steps
   folded the wall 0.15 mm at the throat and 0.16 at the mouth (2026-09-04,
   found in CAD). Worked around by sizing the mouth extension from the step.
2. **A non-dividing shell station count** — 32 rings from a 48-ring map gives
   gaps alternating 1 and 2, and the loft ran **4.6 mm** off its own rings.
   Worked around by snapping the count to a divisor.
3. **The station snapping** (the map defect below) — rings land on 21/22-sample
   gaps and are told they are equal. (Note this is NOT what moves the fold
   margin; see item 1.)

The fix is to measure the real distance between consecutive rings and hand it
to the spline. It **subsumes item 3 and the divisor rule**, and it frees the
cutter's mouth extension to go back to the ~1 mm the cap-fill sag actually
needs.

Why it has not been done yet: it changes the interpolation on every surface in
every STEP export by a small amount, so **every recorded STEP measurement in
CLAUDE.md re-baselines**. Its own session, with its own verification pass.

### 3. Interpolate the station position and frame between samples

Pairs with (2) — same root cause, and (2) is the more general fix. The
`samples` raise already took the irregularity from 2.4x to 1.15x, so this is
no longer urgent on its own. See the map defect below.

## A MAP DEFECT FOUND IN PASSING — station positions are SNAPPED, not interpolated

`mapThroatToMouth` samples each centreline at `samples` internal points and
then places each station by **`idx = Math.round(u * M)`, taking
`C = pts[idx]`** (src/hgrid-model.js, in the swept-section branch). The
station's centre is therefore quantised to the nearest sample instead of
being interpolated along the centreline.

**THE `samples` RAISE HAS ALREADY TAKEN MOST OF THE STING OUT OF THIS**, which
is worth knowing before budgeting a session for it. The quantum is one sample,
so 8x the samples is 1/8 the error. Worst ratio between ADJACENT station steps
on the default horn, samples 64 -> 512:

| stations | 64 | 512 |
|---|---|---|
| 24 | 1.626 | 1.147 |
| 32 | 1.071 | 1.071 |
| 40 | 2.105 | 1.143 |
| 48 | **2.443** | 1.150 |
| 64 | 1.243 | 1.243 |

32 and 64 divide both sample counts and do not move — their 1.07 and 1.24 are
the horn's own path curvature, not snapping. What was a step 2.4x its
neighbour at 48 stations is now 1.15x. Because the loft interpolates with a
UNIFORM parameterisation, unevenly spaced rings are still told they are evenly
spaced — the same mechanism that made a non-dividing shell station count run
4.6 mm off its own rings — so interpolating is still the right fix, it is just
no longer urgent.

The fix is to interpolate `C` (and the frame) between samples rather than
snapping, which is a small change with a wide blast radius: every duct
moves slightly, and every measurement recorded in CLAUDE.md was taken on the
snapped geometry. It deserves its own session and its own re-verification.
Until then, station counts that divide 512 (32 and 64 among them) are exact,
and everything else is now within about 15%.

## THE SHELL: WHAT FAILED, AND THE RULE THAT COMES OUT OF IT

Read this before proposing any shell construction. Three were built and
measured in one day; two were rejected on sight for surface texture, and
they failed for the SAME reason even though they look unrelated:

| construction | how its rings were found | outcome |
|---|---|---|
| per-cell blanks | duct rings offset by the wall — EVALUATED | clean; this is what ships |
| one wrapped body (`hornBodySections`) | raster distance field, marching-squares iso-line, arc-length resample — SEARCHED | rippled, rejected |
| blocks + tubes + webs (`bandedShell`) | blocks = convex hull of duct points — SEARCHED; tubes = offset duct rings — EVALUATED | blocks rippled, tubes clean, rejected |

**The rule: a solid must be lofted through rings the model can EVALUATE from
a smooth map with fixed point correspondence, never through rings a discrete
search returns.** A search decides something combinatorial at each station
(which pixels are inside, which points are on the hull); that decision jumps
along the path, the arc-length resample then slides every vertex onto a
different feature, and the cubic loft turns a few tenths of a millimetre of
uncorrelated jitter into visible creases. It does NOT refine away. The
banded render is the proof in one picture: tubes smooth, blocks rippled.

Corollaries worth keeping:
- If a shape genuinely needs a search (a union outline, a morphological
  closing), that is a **kernel's** job. This tool should hand CAD exact
  solids and let it do the offsetting and merging it is built for.
- Measuring well is not the same as being right. The wrapped body passed
  every number the tool could compute (min wall 2.92 mm, spline within
  0.12 mm of the loft, ends exact) and was still wrong. When a construction
  is new, get a render in front of the owner before polishing the metrics.
- Three CAD round trips were spent on constructions the owner had already
  described. "Rewind to the thing that was closest" was the right call and
  should have come sooner.

## Task E — mouth flare / rim roundover (owner proposal, ASSESSED — geometry deliberately not chosen yet)

The owner asks (maybe) for a flare around the combined mouth aperture,
against edge diffraction at the outer rim. **Assessment: the idea is
valid — rim termination treatment is standard practice, and the mechanism
is real — but its benefit is set almost entirely by the SIZE of the
roundover relative to wavelength, and this tool computes no radiated
field, so it can state geometry and the sizing rule, never verify the
acoustic result. Validation is ABEC/BEM territory.**

- Mechanism: the rim is an abrupt impedance discontinuity. Part of the
  wave reflects back down the horn (throat-impedance and response ripple)
  and the edge re-radiates (diffraction) — pattern and response
  irregularity concentrated where the mouth is small in wavelengths.
  Rounding spreads the discontinuity over the roundover's arc.
- Sizing rule of thumb: benefit starts roughly where the roundover radius
  is ~λ/4 and grows from there — f ≳ c/(4r). r = 20 mm helps above
  ~4.3 kHz, 50 mm above ~1.7 kHz, 200 mm above ~430 Hz. A cosmetic radius
  does nothing at the frequencies where this horn's ripple lives; a
  useful one at low frequency is a large piece of geometry. (Literature
  to consult, not verified here: Kolbrek & Dunker's mouth-termination
  chapter; Geddes' waveguide mouth radius; the Le Cléac'h 180° roll-back.)
- **The cheapest correct path already exists as of this session**: the
  shell kit's boolean result carries the mouth's outer rim as a real
  B-rep edge, and a CAD fillet on that edge IS the roundover — sizable,
  variable, no tool geometry needed. Build in-tool flare geometry only if
  the owner wants it parametric in the tool or bigger than a fillet can
  express (an exponential lip, a 180° roll-back) — that would be a rim
  extension surface grown off the blank rim sides, a bounded build.
- Also worth deciding first: freestanding vs in-baffle mounting changes
  the rim termination as much as a small roundover does.

## Task C — per-cell bow choice (deferred by the owner)

Not needed yet. Revisit when wavefront manipulation beyond dL equalisation
is wanted — that is what it really buys: once each centreline is
independently targetable you can specify a DELIBERATE per-cell path length
and shape or steer the wavefront, rather than only flattening it.

The whole-horn enumeration `solveBow` used to do this — direction x lobes x
region, each candidate built and measured — was deleted on 2026-09-03 because
it ranked on wallSpread, which cannot see mid-path incoherence (CLAUDE.md
records what it measured). A per-cell version would need a metric that can:
`fluxContractMax` and `bendFoldMin` now exist and both see what wallSpread
could not, so the search is worth rebuilding on those rather than restoring
the old one.
It must choose per SYMMETRY CLASS (`classIndex` in the equal-area solve), not
per cell, or it destroys the mirror symmetry the directions exist to preserve.
Derive each class's region from its OWN gap profile rather than a preset
list — on the curved mouth the recorded winning region [0.3, 0.95] is exactly
where the gap profile says the room is.

The same lever still fixes the standing swept-mode interpenetration the
PROFILE causes, independent of bows: spreading centrelines apart where k
approaches 1.

**The trap to avoid** stands: no general 3-D spline. Higher order buys shape
freedom and curvature oscillation in the same purchase, and curvature is the
thing being controlled.

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
npm run test:hgrid     # ~490 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/ginkgo-horn.html`
