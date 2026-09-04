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
- **Defaults**: bow region [0.02, 0.22], region grade 0.15, min gap 1.5 mm.

**The one number worth acting on**: at the new bow default the fold margin is
**1.77 mm**, down from 2.99 at the old [0, 0.20] grade 0 — the grade buys its
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

### 0. The new bow default carries a 1.77 mm fold margin — read it before shipping a print

Shipped 2026-09-04 at the owner's numbers, [0.02, 0.22] grade 0.15. It is a
47% improvement on the [0, 0.20] grade 0 it replaced (worst gap −7.44 →
−3.97 mm) and the grade is doing most of that, exactly as the graded-region
finding predicts. The price is the fold margin: 2.99 → 1.77 mm, because a
narrowed window is a steeper turn. Not folded, but thinner than any shipped
default has been.

**THE DEPTH FIXES BOTH AT ONCE, AND THIS IS THE STRONGEST CASE THE FILE HAS
CARRIED FOR MOVING IT.** Same bow, same grade, sweeping only the axial depth,
64 stations, diagonals included:

| depth | ΔL | bow amp | foldMin | worst gap | contraction |
|---|---|---|---|---|---|
| 300 (shipped) | 0.00 | 21.3 | **1.77** | **−3.967** | 0.00% |
| 310 | 0.00 | 21.2 | 3.07 | −2.665 | 0.00% |
| 319.5 (dL optimum) | 0.00 | 21.0 | **4.51** | **−0.169** | 0.00% |
| 330 | 0.00 | 22.4 | 5.10 | −0.004 | 0.00% |
| 357 | 0.00 | 26.1 | 4.94 | **+1.517** | 0.00% |

At the dL optimum the fold margin is back to 4.51 mm and the interpenetration
collapses from 3.97 mm to 0.17 — with the bow the owner wants, in the window
the owner wants, at zero cost in ΔL. By depth 330 the gap is −0.004 mm, and by
357 it CLEARS the new 1.5 mm floor outright. Moving the bow region instead is
not the cheaper fix here: [0.10, 0.30] measures −2.40 mm but takes the fold
margin to 0.30 mm, worse than doing nothing.

Same conclusion the file has reached three times by different routes: **solve
the depth first and the bow becomes a small correction.** The only argument
for 300 was that it is a round number. Owner's call — task 3 below is the same
decision, and this is a fourth measurement pointing at it.

### 1. Raise the PREVIEW station count

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

### 2. Interpolate the station position and frame between samples

Pairs naturally with (1) — same subsystem. See the map defect below, which
the `samples` raise has already taken from a 2.4x irregularity to 1.15x.

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
