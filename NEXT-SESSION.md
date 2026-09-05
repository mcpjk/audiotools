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
A per-STATION field is the next step and is a bigger build — see queue item 0.

## Shipped 2026-09-04 (second pass) — duct separation

Two of the three findings from the separation exploration. The third is
queue item 0.

- **`dir: "crossRow"` is the new default bow direction.** The clearance around
  a cell is not isotropic — the row gap opens about 5x slower than the column
  gap — and the radial field spends the scarce half. Bowing square to the
  cell's own row instead takes the worst gap from **−2.61 mm to +0.28 mm**
  with ΔL, bow amplitude, fold margin, obliquity, wall spread and passage
  contraction **identical to 1e-9**, because direction cannot change the
  length a bow adds. `radial` is kept and is still the better field on a
  vertically curved mouth.
- **`compare: "solid"` is the honest clearance, and the UI now uses it.** A
  station is a fraction of each duct's OWN arc length, so ring q of one duct
  and ring q of its neighbour are at the same phase of travel and not at the
  same place. Measured on the shipped bow, the middle-row pair (3,1)-(4,1)
  reads **+0.49 mm of wall by station and −0.43 mm of real interpenetration
  by solid**, the latter confirmed to 7 µm by an independent ray cast into the
  exported triangles. The model default stays `"station"` so every recorded
  figure reproduces.
- **The separation solve re-reads its answer.** Its inner loop still scores by
  station (a solid read costs ~3x and runs once per round), but the returned
  state is re-measured as a solid against the input measured the same way, and
  a field that does not improve the honest number is **not applied**.

**The number to know**: with `crossRow` on, the shipped horn's worst gap is
**−0.43 mm**, not the +0.28 the station read shows, and it is in the MIDDLE
ROW rather than at the corners. That is what queue item 0 has to fix.

## Shipped 2026-09-05 — seeing it, not just scoring it

The 3-D viewport now shows WHERE the trouble is. Full finding in CLAUDE.md.

- **Selectable colour mode.** The first cross mode is a layout-phase readout;
  `duct clearance` paints each wall vertex by its own gap to the nearest
  neighbour.
- **Per-vertex paint, defect-scoped.** Raw gaps mark 18 of 18 ducts and carry
  no information, because the cells tile at both ends. Scoped, 4 of 18 stay
  solid on the shipped horn and they are the right four.
- **Contact markers.** Length is the gap, direction is the way out. The
  shipped horn's intersections run along the row; radial's ran across it.
- **Ghosting and framing.** Ducts not in trouble drop to 0.07 alpha, and
  `frame the worst contact` pans as well as zooms — every defect sits inside
  station 10 of 64, at the small end of the horn.

**Deliberately not built**: the gap profile strip and the pair-by-station map.
The owner's call — a strip gives a location without an identity, and the 3-D
view answers "where, and which way" directly. The map remains the only display
that can show four pairs failing TOGETHER, which is worth remembering if a
pattern across pairs ever needs reading.

## Shipped 2026-09-05 (second pass) — the section's shape morph

Owner's observation on a returned export, chased to a cause. Full finding in
CLAUDE.md.

- **The section's shape was morphing on a different clock from its size.**
  The swept loft blended the throat outline into the mouth outline linearly in
  ARC LENGTH while the Hypex profile expands the AREA convexly, so the section
  squared up in the first tenth of the path with the passage barely open.
  A throat cell is tall and narrow and a mouth cell is square, so squaring up
  early grows the section ALONG THE ROW — which is what a row neighbour's
  clearance is made of.
- **`shapeMorph: "radius"` puts both on one clock** — the section is h of the
  way from throat shape to mouth shape exactly when the passage is h of the
  way from throat size to mouth size, on the law's own equivalent radius √A.
  UI default; the model default stays `"length"`, asserted bit for bit, so
  every recorded figure reproduces.
- **The expansion law cannot see it**: profM, profRatio and profFc identical
  to the LAST BIT on every cell, ΔL and mouth area unmoved, flux contraction
  0.00%, both end rings bit-identical. Only the neighbours can tell them
  apart, which is the bar `crossRow` had to clear.

**The numbers**, tool defaults, 96 stations, inset outlines, solid compare:
worst gap **0.326 → 1.524 mm** unbowed with the throat dip gone, and
**−0.508 → +0.220 mm** with the shipped bow — a change of SIGN, not a margin.
Fold margin 1.10 → 1.59 mm on the bowed default, which was the thinnest any
shipped default carried. `k` goes from dipping to 0.483 (a ring 4.3× too large
in area, then shrunk) to 0.965–1.000.

**What it costs, and it is real**: the transverse-mode cutoff along the path.
c/(2·L_long) falls **7–11 % over u = 0.05–0.30**; both ends are pinned so the
horn's WORST f₁ does not move. `area` (the same rule on r²) buys ~0.1 mm more
clearance for twice that loss and takes k to 1.83 — kept in the model as the
measured alternative, not offered in the UI.

**What it does NOT fix, and this is the next thing to look at**: the mid-path
pinch has a second cause. `crossRow` falls back to the radial field for the
MIDDLE ROW — a middle-row cell's outward ray is already along the row, so
there is no cross-row sense to pick — and on a vertically flat mouth the whole
length deficit lives in that row. So the cells needing the most bow are exactly
the ones `crossRow` cannot help, and their bows run straight along the row:
measured, the two central middle-row cells swing ±11 mm laterally through the
[0.02, 0.22] window and the pinch is where that swing returns. The morph
raises the floor under it; it does not remove it.

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

### 0. THE PER-STATION SEPARATION FIELD

**The measurement it rests on**: the field is one vector per cell times one
sin² window, so a duct can be slid bodily but not re-routed. The contact sits
near u = 0.05 and the window's peak near u = 0.16, so at the contact the
window delivers about **a tenth** of the amplitude. Winning 3 mm of clearance
where the ducts touch therefore costs nearly **30 mm** of excursion at
mid-path — and that excursion is what creates the next contact and eats the
fold margin. Measured: the chain reached a positive gap only by displacing the
four corner cells **27 mm** at a cost of **14.3 mm of ΔL**; repulsion
oscillated between −2.8 and −9.7 mm and never beat doing nothing, even with
the length budget lifted. **This is not a tuning failure, it is the
parameterisation**, which is why no amount of ridge or relaxation work has
moved it.

**The shape of the build** — a bead chain per centreline, one bead per
station, three constraints projected in turn until they settle:

1. **Contact.** Where a bead's duct is within the floor of a neighbour, push
   both apart along the line of nearest approach, AT THE CONTACT rather than
   at a window peak. This is the owner's "solids push each other out of the
   way", and the floor is the field radius. **Ramp it**: half the divider
   thickness at the throat, where the cells genuinely share a wall, rising to
   the target wall once the expansion has opened room. **On PATH LENGTH from
   the throat**, because the profile that opens the room is itself written on
   path length; in the first fifth, where the ramp lives, the ducts are still
   nearly axial so the candidates barely differ.
2. **Length.** Beads keep their spacing and the chain keeps its total, pinned
   at the throat centroid and the mouth cell centre. This is the owner's rope,
   and it replaces the present two-pass arrangement where separation moves the
   path and a second solve re-bows it. It also removes the stale-target
   finding at source rather than by budget.
3. **Curvature.** Resist direction change between consecutive segments. This
   is the restoring force the owner asked about, **and it is the acoustic
   term, not a smoothness preference**: bend radius against duct half-width IS
   the fold condition, and bend angle times passage width IS the wall-spread
   phase error judged against λ/8. Without it a contact-only solve puts a
   sharp kink exactly at the contact, which is the cheapest way to satisfy the
   constraint and the worst thing for the wave. It is also what keeps the
   chain smooth enough to LOFT — see the evaluated-vs-searched rings finding,
   which is the reason this term is load-bearing for the export.

**Score it on `compare: "solid"`**, which is why that landed first. A solver
scored on the station read will report success while leaving the middle-row
defect it cannot see.

**Two limits to design around, both measured.** The field's resolution is the
station count, and the trouble sits at stations 1–3 of 64, so it must solve at
export resolution and not on the preview. And feasibility is not guaranteed —
far from the ΔL optimum there is genuinely no room, and it must say so rather
than thrash, which the existing best-state and budget discipline already does.

**Prior art worth reading before writing it** (stated from memory, not checked
against the papers): Position-Based Dynamics and XPBD are literally the three
constraints above; Discrete Elastic Rods adds the bending energy; Repulsive
Curves (Yu, Schumacher, Crane) is the closest published match — a tangent-point
energy over all point pairs, parameterisation-independent, with length and
endpoint constraints — its weakness here being variable tube radius, which
this horn has (4.6 to 30 mm along the path). Gonzalez and Maddocks' global
radius of curvature is the metric worth stealing: it reads local bending and
mutual approach in one parameter-free number.

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
