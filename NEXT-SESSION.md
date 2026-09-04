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

## Shipped 2026-09-03 (three sessions, newest last)

Orientation only — every measurement is a CLAUDE.md finding, and the commits
carry the rest. Nothing here is a task.

- **Duct separation moved to stage 8**, after the coped joints, and a
  `solveSeparation` nudge bug fixed: a failed solve returned a field WORSE
  than no separation and the UI applied it.
- **The throat run rule became "the gap must be opening"**, replacing the
  symmetric band that filed a -0.49 mm dive as a knife edge.
- **The section planes now follow the tangent** (`sectionAlign`), with two
  metrics that can see the passage: `fluxContractMax` / `sectionObliqMax` /
  `fluxVsThroatMin`, and `bendFoldMin` (the torus condition — the only
  witness to a folded duct, since a folded one still meshes closed and passes
  every cap check).
- **`samples` raised 64 -> 512** and `stations` can no longer exceed it. Only
  ONE number in CLAUDE.md moved — the fold margin, which was 56% optimistic —
  and the file's recorded 10.9% passage contraction turned out to be an
  ALIASING artifact of reading stations 192 against samples 64.
- **Mutual repulsion built** (`solveSeparation` mode `"repel"`, the owner's
  proposal): every deficient pair as one linear constraint, all solved
  together as a regularised least-squares. What it actually bought was the
  DIAGONALS — the chain's own field slides ducts into diagonal neighbours and
  nothing was scoring that (measured -3.28 mm reported against -5.52 mm left).
  All three modes are now scored on the diagonals, which costs nothing on an
  unseparated horn.
- **The housekeeping pass**: the O-grid family and its whole mesh machinery
  deleted (~1130 lines), along with `solveBow`, `solveDepthForFc`,
  `shellSolids`, `buildSolidsSTEP`, `polyArea2`, `hypexFlareRate` and five
  test sections. The mis-keyed edge-curvature warning removed. The coped-joint
  metric rebuilt to measure cope DEPTH in mm rather than contact in stations.
  Default arcH 555 -> 500 mm.

**The one thing from that pass that is a decision, not a done deal**: arcH 500
moved the dL optimum to 319.5 mm, so the shipped depth of 300 is now nearly on
it. Going the last 19.5 mm takes dL 14.60 -> 11.93 mm, the throat-fifth bow's
fold margin 4.45 -> 5.82 mm and its passage contraction 5.57% -> 2.78%.
Whether the round 300 is worth those is the owner's call — the numbers are now
small enough that it may not be.

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

## SHIPPED — the graded bow region (owner's proposal)

`lengthen.regionGrade`, off by default, grade 0 bit-identical. The window
widens with the cell's distance from the axis, centre fixed, so displacement
grows outward while every cell still lands on the same target length: a row
sharing one outward direction EXPANDS instead of translating. The mechanism
is confirmed (middle-row amplitude 20.5/20.0/19.5 flat at grade 0 against
14.5/19.4/22.1 at 0.6, dL exactly 0 throughout, both mirrors at 5.7e-11).

**What it is worth is 13–21% of the damage a throat-anchored bow does**, it
is non-monotone, and it spends fold margin at shallow depths. Moving the bow
region to u ≥ 0.10 recovers essentially all of that damage instead, for
nothing. So the grade is for when you want the bow AT the throat on acoustic
grounds and are knowingly paying for it — not a lever to turn up. Full
numbers, and the two rejected anchorings, in CLAUDE.md.

## SHIPPED, and what it did NOT fix — separation as mutual repulsion

Built this session. Full numbers in CLAUDE.md; the short version is that the
win was the diagonals and the scoring, not the search. On the one case in the
comparison set that can actually be separated the two modes land within
0.024 mm of each other, repulsion getting there in 10 rounds against 14 with
less displacement and less dL. On the cases that cannot be separated they
trade, and neither reaching the floor is the signal to move the DEPTH.

Two things it deliberately did not do, both still open:

- **The field is one vector per cell times one window**, so it can slide a
  duct but not re-route it. The chain's third structural limit — a pair's
  push taken at that pair's single worst station — is untouched. A
  per-STATION field is the next step and is a bigger build: the amplitude
  becomes a profile, the windowing stops being a window, and the mirror and
  end-pinning guarantees have to be re-established per station.
- **No mode accounts for dL when it picks its answer** — see the queue.

## The queue

In priority order. Each rests on a measurement, named.

### 1. The lengthening TARGET does not see the separation field — a real defect

Found while answering a question about whether separation preserves path
length. `mapThroatToMouth` applies the separation displacement to each
centreline FIRST and then runs the equalising bow on the separated path,
which is right and is what the comment says. But the bow's TARGET — the one
length every cell is padded up to — is computed in its own loop over the BARE
trajectories (`src/hgrid-model.js`, the `snake` IIFE) and never sees the
field. So a cell the separation pushes PAST the old target has nothing
brought up to it, and the leftover spread is exactly that overshoot.

Measured at the defaults with the throat-fifth bow, and the identity is exact
in both modes:

| | target | lengths after | ΔL | Lmax − target |
|---|---|---|---|---|
| no separation | 315.10 | 315.10 – 315.10 | 0.000 | — |
| repel | 315.10 (stale) | 315.10 – 335.00 | 19.901 | 19.901 |
| nudge | 315.10 (stale) | 315.10 – 316.01 | 0.910 | 0.910 |

It is not repel-specific: whichever mode displaces more overshoots more. Fix
is to take the target from the separated paths — cheap, but it is geometry in
the model, so it needs its own test and a re-measure of the head-to-head
table in CLAUDE.md. **Do this before the item below**, which it partly
subsumes: most of the "separation costs ΔL" trade is this bug.

### 2. What a FAILED separation solve should return

All three modes return the best GAP they visited, with no account of dL. On a
horn with no room that state can carry tens of millimetres of extra path
spread, and it is applied to the geometry the moment the solve returns.
Measured at 20 rounds, both modes on the same 47 pairs:

- the tool's defaults with the throat-fifth bow: repulsion buys 1.7 mm more
  gap than the chain for **19 mm more dL**
- at the dL-solved depth 357: the chain buys 0.5 mm more gap for **20.8 mm
  more dL**

Same flaw from both sides. It only bites where the floor cannot be met, which
is exactly where the honest answer is that there is no room — so one option is
to return the INPUT whenever the floor is unreachable, and another is to
report both states and let the owner apply either. A lexicographic rule (best
gap, ties inside `tol` broken on dL) was checked against these numbers and
changes nothing: the differences are 30x the tolerance. **This is a decision,
not a bug hunt** — what to trade is the owner's call, which is why nothing was
invented here.

Note also that `ampCap` is 40 mm and both modes hit it on the hard cases. A
40 mm displacement on a horn whose throat cells are 4.5-7.3 mm wide is not a
correction, and the cap is what permits the dL above.

### 3. Raise the PREVIEW station count

**The `samples` half of this landed 2026-09-03** (64 -> 512, and `stations`
can no longer exceed `samples`, so the aliasing trap is unreachable rather
than documented). What is left is the preview count itself — the sliders still
run on 24 stations while the exports and the clearance solve build at 64.

The measurement behind it: the near-throat gap has a SHARP minimum near
u = 0.021 and a station grid finds it only if a station lands there. 48, 96
and 192 stations all contain u = 1/48 and all read exactly -0.2422 mm; 64
straddles it; 24 misses it. The clearance readout and the separation solve
already build their own 64-station map, so what remains is the geometry the
sliders and the 3-D preview show.

### 4. Interpolate the station position and frame between samples

Pairs naturally with (3) — same subsystem. See the map defect below, which
the `samples` raise has already taken from a 2.4x irregularity to 1.15x.

### 5. Decide whether depth 300 stays the default

See the note above. Owner's call, numbers ready.

### 6. The clearance metric reads GROSS outlines; the export carries INSET ones

Offered and declined once, and still open. On the default horn the gross
outlines interpenetrate 0.242 mm while the EXPORTED ones do not interpenetrate
at all — they leave a 0.123 mm wall sliver, and the tool reports +0.568 mm.
The two errors partly cancel, which is why it went unnoticed. So "min gap" is
the gap between the AIR columns, not the printed wall, which is 0.4(1-s) mm
thicker.

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
