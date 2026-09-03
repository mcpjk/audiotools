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

## AN IDEA WORTH A SESSION — separation as mutual REPULSION rather than a chain

The owner's suggestion, and it is a better fit to the problem than the current
chain solve. See CLAUDE.md for how `nudge` works today. The chain is 1-D: it
walks each row and each column independently, sums the deficits along it and
displaces each cell by the mean-centred cumulative. That is exact for a 1-D
contact chain and it is why it beat naive pairwise pushes — but the geometry
is not 1-D, so a cell pushed along its row lands somewhere its COLUMN chain
did not account for, and the two fields are simply added.

A repulsion field would instead give every pair a force that grows as its gap
closes, sum the forces per cell as VECTORS, and relax. What it buys:
- diagonal and non-adjacent pairs enter naturally (today only the 27
  orthogonal pairs are chained at all, while the shell audit found blanks
  overlapping two columns apart)
- the row and column fields stop being solved separately and then added
- a gap that is comfortable contributes nothing, so the field concentrates
  where the trouble is without a window having to be placed by hand

What it must not lose, all currently guaranteed and all testable:
- both mirrors (today by construction; a repulsion sum keeps them iff the
  force law is isotropic and the pairs are mirror-complete)
- the two pinned ends (the window is zero there — keep the same windowing)
- dL, which the chain preserves to 0.07 mm today
Start from the measured gap per pair per station, not from centroid distance.

## The queue

In priority order. Each rests on a measurement, named.

### 1. Raise the sampling — `samples` AND the preview stations

**HALF OF THIS LANDED 2026-09-03: the clearance and the separation solve now
build their own map at the EXPORT station count instead of reading the
24-station preview.** That was forced by a returned export whose ducts
interpenetrated 4.9 mm while the readout said +1.14 mm — see the CLAUDE.md
finding. What is left here is `samples` (still 64 over the whole path) and the
preview count itself, which the sliders still run on.

The single highest-value item, and it fixes three metrics at once. `samples`
defaults to 64 over the whole path, so a 65 mm bow feature gets ~13 samples
and its curvature peak is missed.

- `bendFoldMin` reads 3.28 / 2.09 / 1.29 / 1.11 mm at 64 / 128 / 192 / 256
  samples — monotone downward, so **the shipped margin is an upper bound**.
- `fluxContractMax` reads 0.00% at both the preview (24) and export (64)
  station counts against 10.9% at 192.
- The clearance metric misses the near-throat dive at the preview's 24
  stations entirely (+0.520 mm where 48 stations read -0.230), which is
  asserted as a `KNOWN LIMIT` test that will flip when this lands.

Measured cost: **essentially nil**. The map is dominated by `stations`, since
the profile solve runs per station — ~90 ms at samples 64 against ~80 ms at
samples 256, stations 64 both. What makes it a whole session is that it
re-baselines recorded numbers across CLAUDE.md; doing it in one pass costs one
re-baselining instead of three.

Note that `stations` ABOVE `samples` aliases outright: `idx = Math.round(u*M)`
makes consecutive rings share a centreline point and frame. The UI ships 24
(preview) and 64 (export) against samples 64, so it is safe today — but do not
raise `stations` alone.

### 2. Interpolate the station position and frame between samples

Pairs naturally with (1) — same subsystem, same re-baselining. See the map
defect below.

### 3. Decide whether depth 300 stays the default

See the note above. Owner's call, numbers ready.

### 4. The clearance metric reads GROSS outlines; the export carries INSET ones

Offered and declined once, and still open. On the default horn the gross
outlines interpenetrate 0.242 mm while the EXPORTED ones do not interpenetrate
at all — they leave a 0.123 mm wall sliver, and the tool reports +0.568 mm.
The two errors partly cancel, which is why it went unnoticed. So "min gap" is
the gap between the AIR columns, not the printed wall, which is 0.4(1-s) mm
thicker.

## A MAP DEFECT FOUND IN PASSING — station positions are SNAPPED, not interpolated

`mapThroatToMouth` samples each centreline at `samples = 64` internal points
and then places each station by **`idx = Math.round(u * M)`, taking
`C = pts[idx]`** (src/hgrid-model.js, in the swept-section branch). The
station's centre is therefore quantised to the nearest of 64 samples instead
of being interpolated along the centreline.

Consequence, measured: whenever `stations` does not divide 64, the ring
spacing goes irregular. At **48 stations, every third step is exactly 2.00x
its neighbours** — on all 18 cells, at stations 1, 4, 7, ... 46 (origin steps
6.44, 6.62, **13.83**, 7.22 mm). At 24 it is a milder 3,2,3 pattern. At 64
and 32 it is exact. Because the loft interpolates with a UNIFORM
parameterisation, unevenly spaced rings are told they are evenly spaced and
the surface leaves them — this is the same mechanism that made a
non-dividing shell station count run 4.6 mm off its own rings.

**The tool's UI default is 64 stations, which divides exactly, so the
shipped default export is clean.** That is why this has never shown up. It
bites at 48, 40, 36 and any other non-dividing count, and it affects the
DUCTS as well as the shell.

The fix is to interpolate `C` (and the frame) between samples rather than
snapping, which is a small change with a wide blast radius: every duct
moves slightly, and every measurement recorded in CLAUDE.md was taken on the
snapped geometry. It deserves its own session and its own re-verification.
Until then, **use station counts that divide 64**.

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
npm run test:hgrid     # 475 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/ginkgo-horn.html`
