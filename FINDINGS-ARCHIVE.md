# FINDINGS-ARCHIVE.md

Findings moved out of `CLAUDE.md` on 2026-09-09. **Nothing here was deleted, and
nothing here is retracted** — these are measurements that were made honestly and
are still true of the geometry or the code they were taken on. What they are not
is live: each one is either superseded by a finding that stayed, or it describes
a part of the code that is settled and is not the thing anyone is currently
changing.

**Why they moved at all.** `CLAUDE.md` is loaded in full at the start of every
session in this repo. At 3650 lines it cost roughly 65k tokens of standing
context before anyone had typed anything. That is a real cost and it is paid on
every session, whereas the cost of an archived finding is one `grep` on the rare
occasion it is wanted.

**The rule the split was made under**, and the one to apply if more is ever
moved: a finding stays in `CLAUDE.md` if it is a rule someone could VIOLATE
TODAY, or if it is the record that stops a rejected idea being re-proposed from
memory. It moves here if the thing it describes has been superseded, or if the
code it is about is finished. When in doubt it stays — the standing priority at
the top of `CLAUDE.md` is that the less flattering reading wins, and the less
flattering reading of "is this still live?" is yes.

**So read this file when**: a note in `CLAUDE.md` points at something you cannot
find; you are about to re-measure something that sounds like it has been
measured before; or you are about to touch one of the settled areas below —
the sampling ladder, the STEP writer's numerics, the flow-mode era construction,
or the CAD import/union forensics.

```bash
grep -n -i "<what you are looking for>" FINDINGS-ARCHIVE.md
```

## Index

**Sampling and resolution — the `samples` ladder.** Superseded by
`samples IS NOW 1024` in `CLAUDE.md`. Kept for the convergence tables, which
are the evidence for the current default and were measured once.
  1. The 512 default is 19% optimistic on the graded bow
  2. `samples` is now 512, and only the fold margin moved
  3. Both passage metrics were under-resolved by the old 64-sample default

**Metrics and warnings that were removed from the tool.** The code is gone; the
general lesson in each is already stated more forcefully by the standing
priority at the top of `CLAUDE.md`.
  4. The edge-curvature warning was keyed to a length the model does not contain
  5. A dead ternary pinned the reference horn at 90 deg

**Superseded path knobs.**
  6. (STALE) Bend tightness is pinned at 0.5

**CAD import and union forensics — the superseded members.** The live
conclusions (union one cell at a time, cut after the union, adjacency is the
rule, do not hunt the bad pair, duplicated surface is the binding degeneracy)
all stayed in `CLAUDE.md`. These five are the earlier readings those replaced,
plus one hypothesis that was measured and falsified.
  7. The lofted wall runs past its own throat cap plane
  8. The two ends of the shell are set separately
  9. The first thing that sorts the unions is adjacency (the first, weaker read)
 10. Three blanks failed a plane split at the throat
 11. The exported bodies are topologically exact — the import-healing hypothesis

**Settled numerics and their tests.** Working, tested routines nobody is
rewriting.
 12. A capped duct's volume depends on the cap fill
 13. LU with partial pivoting has two conventions and they do not mix
 14. A 1x1 grid used to crash the equal-area solve

**The pre-biradial, flow-mode era.** The aperture had a single apex radius and
the sections were cut perpendicular to their own centreline. Both were replaced
— by the biradial mouth and by the tangent-following section plane — and these
describe the geometry as it was before.
 15. Path length on the apex-sphere mouth
 16. Station 0 needs no special case now, but it used to
 17. Decoupling vertical from horizontal curvature is a continuum

---

## Sampling and resolution — the `samples` ladder

### 1. The 512-sample default is 19% optimistic on the graded bow
*Archived: superseded by `samples IS NOW 1024`. The convergence table is the
evidence for that raise.*

- **(SUPERSEDED by the raise above; kept for the measurement.) THE 512-SAMPLE
  DEFAULT IS 19% OPTIMISTIC ON THE GRADED BOW, THREE TIMES
  ITS ERROR ON THE BOW IT WAS CALIBRATED FOR — and the fold margin is a
  `samples` measurement, NOT a `stations` one.** The convergence table below
  was taken on the [0, 0.20] grade 0 bow, and 512 was chosen there. The
  2026-09-04 default is [0.02, 0.22] with grade 0.15, and the grade NARROWS
  the inner cells' windows — a narrower window is a steeper turn, a sharper
  curvature peak, and a peak needs more samples to resolve. Measured at
  stations 64, against samples 4096:
    samples             512      1024     2048     4096
    NEW bow g0.15      1.7732   1.5522   1.4964   1.4912  mm
    error             +18.9%    +4.1%    +0.4%     0.0%
    OLD bow g0         2.9930   2.8269   2.8085   2.8027  mm
    error              +6.8%    +0.9%    +0.2%     0.0%
  So **the 1.77 mm the tool reports on the shipped default is really about
  1.49 mm.** Still positive, still not folded — but 16% thinner than displayed,
  on the default that already carries the thinnest fold margin ever shipped.
  The bias is ONE-SIDED (the metric can only be optimistic), so this is a
  floor moving down, never up. samples 1024 costs a measured 68 ms preview /
  131 ms export against 512's 49/98, which is the cheapest fix available.
  **AND THE STATION COUNT IS A RED HERRING HERE, which cost a wrong entry in
  NEXT-SESSION.md before it was caught.** `bendFoldMin` reads 1.6122 at
  stations 24 and 48 and 1.7732 at 32, 64 and 128, which looks exactly like
  the snapping — 24 and 48 do not divide 512, 32 and 64 do. It is not.
  **The discriminating test is one line: re-measure at samples 480**, where
  24, 32 and 48 all divide and 64 does not. The pairing does not move —
  24 and 48 still agree (1.6648), 32 and 64 still agree (1.8344). Divisibility
  flipped for three of the four counts and the grouping was unchanged, so
  snapping is falsified.
  What it actually is: the margin can only be evaluated WHERE A RING EXISTS,
  and each station charges itself with the worst curvature over the samples it
  stands for (`half = round(M / 2·stations)`, which NARROWS as stations rise).
  The bow's curvature peak sits between stations, and the two grid families
  land either side of it — 24/48 report it at u = 0.16667, 32/64/128 at
  u = 0.15625. Both are stations near a peak neither owns. The station count
  therefore shifts WHICH near-miss is reported; only `samples` changes how
  well the peak itself is resolved.
  **The general lesson: a pattern that looks like a known bug is not evidence
  of that bug.** Divisibility was a real mechanism in this file, it fitted the
  numbers, and it was wrong here. One cheap counter-test beat the pattern
  match.

### 2. `samples` is now 512, and only one number moved — the fold margin
*Archived: superseded twice over (512 -> 1024). Two live properties were
carried forward into the 1024 finding: the `M = max(samples, stations)` clamp,
and that the 10.9% contraction figure this file once carried was an aliasing
artifact.*

- **`samples` IS NOW 512, AND ONLY ONE NUMBER IN THIS FILE MOVED — THE FOLD
  MARGIN. The re-baselining was far narrower than expected.** (The 512 choice
  is calibrated on the OLD bow; see the finding above for what it costs on the
  graded default.) Raising the
  centreline sample count from 64 to 512 at stations 64, over all 18 cells:
    dL, Lmin, Lmax, mouth area, wallSpread, fc, kMax   unchanged to 4+ digits
    sectionObliqMax                                    -0.9%
    turnMax                                            +2.2%
    clearance minMid (shipped bow)      -7.319 -> -7.498 mm  (less flattering)
    bendFoldMin      (shipped bow)       4.454 -> 3.034 mm   -31.9%
  So the sampling was never distorting the horn; it was mis-reading ONE
  metric, and in the optimistic direction. Convergence and cost, on the
  then-shipped throat-fifth [0, 0.2] bow:
    samples     64     128     256     512    1024    2048
    foldMin   4.455   3.980   3.349   3.034   2.871   2.853  mm
    error      +56%    +40%    +17%   +6.3%   +0.6%    0.0%
    preview     49      46      41      49      68     113   ms
    export     119      95      92      98     131     167   ms
  **The cost is FLAT to 512** and only starts rising at 1024, so 512 takes
  the error from 56% to 6.3% for nothing. The residual is a known ONE-SIDED
  bias — the metric can only be optimistic — and 1024 is what to reach for if
  a fold margin is ever marginal.
  **`stations` CAN NO LONGER EXCEED `samples`**: the map takes
  `M = max(samples, stations)`, so the documented aliasing trap is now
  unreachable rather than merely written down. Measured on the shipped bow at
  stations 192, the aliased read (samples 64) reports fluxContract 0.18% and
  obliquity 35.47 deg against 0.06% and 32.50 for the honest one — aliasing
  invents about three quarters of a contraction reading.
  **THE 10.9% CONTRACTION FIGURE THIS FILE CARRIED WAS AN ALIASING ARTIFACT.**
  It was measured at stations 192 against samples 64. At the current defaults
  `fluxContractMax` reads 0.01-0.18% at every resolution tried, aliased or
  not, so it is NOT the metric the sampling raise was needed for. `bendFold`
  was, and is.
  **TWO REAL THINGS THE FINER SAMPLING REVEALED**, both about the throat-fifth
  bow and both in the less flattering direction:
  (1) the interior obliquity of a throat-start bow was under-read about
  TENFOLD — 0.81 -> 7.78 deg at the shipped arcH 500, 1.04 -> 10.52 at the
  superseded 555 — and at 555 that BREAKS the obliquity bound (10.52 deg of
  tilt against 9.51 of ring curvature) where at 500 it still holds;
  (2) at arcH 555 the same bow's fold margin is **0.86 mm** at honest
  sampling, i.e. that horn was within a millimetre of a duct turning inside
  out. At arcH 500 it is 3.03 mm. One more reason the arc moved.
  The one cost is the TEST SUITE, which builds hundreds of maps and now takes
  minutes rather than seconds. Tests that do not care about the fold margin
  can pass `samples` explicitly; most of them do not need to.
### 3. Both passage metrics were under-resolved by the old 64-sample default
*Archived: already marked superseded in place; the raise it asked for
shipped.*

- **BOTH PASSAGE METRICS WERE UNDER-RESOLVED BY THE OLD 64-SAMPLE DEFAULT.**
  (Superseded by the finding above, which fixed it; kept for the measurement.) `samples` defaults to 64 over
  the whole path, so a 65 mm bow feature gets ~13 samples and its curvature
  peak is missed. Measured on the shipped bow: `bendFoldMin` reads 3.28 /
  2.09 / 1.29 / 1.11 mm at 64 / 128 / 192 / 256 samples — monotone downward,
  so **the reported margin is an upper bound** — and `fluxContractMax` reads
  0.00% at both the preview (24) and export (64) station counts against 10.9%
  at 192. Raising `samples` is nearly FREE (measured: the map cost is
  dominated by `stations`, since the profile solve runs per station — ~90 ms
  at stations 64/samples 64 against ~80 ms at stations 64/samples 256), so this
  is worth doing properly. It was not done here because it re-baselines
  recorded numbers across the whole file and deserves its own pass.
  Note also that `stations` ABOVE `samples` aliases outright: `idx =
  Math.round(u * M)` makes consecutive rings share a centreline point and
  frame. The UI ships stations 24 (preview) and 64 (export) against
  samples 64, so it is safe today, but do not raise `stations` alone.

---

## Metrics and warnings removed from the tool

### 4. The edge-curvature warning was keyed to a length the model does not contain
*Archived: `minCurvR`, `curvatureSensitive`, `curvatureFlagged` and
`edgeMinRadius` were all removed on 2026-09-03. The lesson — a metric has to
measure the quantity in the model it is judging — is the standing priority at
the top of `CLAUDE.md`, stated there with the section-plane case behind it.*

- **THE EDGE-CURVATURE WARNING WAS KEYED TO A LENGTH THE MODEL DOES NOT
  CONTAIN, and it ranked the cells BACKWARDS.** It flagged
  `minCurvR < 2 * Lshort` and warned that the flat-rectangle f1 estimate errs
  as O((L/r)^2) — but f1 is `c / (2 * Llong)`, so the error goes as
  (Llong/r)^2, and Lshort appears nowhere in it. Measured at the defaults:
    flagged     1,1 1,3 6,1 6,3   at (Llong/r)^2 = 0.31
    NOT flagged 2,1 2,3 5,1 5,3   at             0.52
    NOT flagged 3,1 3,3 4,1 4,3   at             0.45
  — the eight cells with the LARGEST claimed error all went unflagged while
  the four it fired on ranked ninth to twelfth. It also only fired at all at
  shape order 3 (0 of 18 at m = 2), because what it was reading there is the
  interior grid lines bending to R ~ 15.4 mm near the corners against the
  disc's own 17.75 mm rim — not a pathology, just the extra freedom m = 3
  spends near the corner. Removed entirely on 2026-09-03 (owner's call) along
  with `minCurvR`, `curvatureSensitive`, `curvatureFlagged`, `edgeMinRadius`
  and two CSV columns. `f1model` already labels the estimate an estimate.
  **The general lesson is the one at the top of this file**: a metric has to
  measure the quantity in the model it is judging, or it will fire
  confidently on the wrong things — and a warning nobody can act on is worse
  than no warning, because it trains the reader to ignore the warning strip.

### 5. A dead ternary pinned the reference horn at 90 deg
*Archived: fixed, and `hypexReference` has not moved since. The durable half
is one line, and it is worth remembering when a mode is next retired: removing
a mode leaves its ternaries behind as branches that always take one side, and
the compiler cannot see it — grep for the removed mode's name.*

- **A DEAD TERNARY PINNED THE REFERENCE HORN AT 90 DEG.** `hypexReference`
  was called with `coverageDeg: mouthMode === "arc" ? thetaH : 90`, written
  while "arc" was a live mouth mode. `mouthMode` has been the constant
  `"biradial"` since the apex was removed, so the condition was permanently
  false and Th_h never reached the reference. It fed diaDirectivity =
  lambda/sin(Th/2) and through it "Mouth area needed", "Minimum horn
  length", `governedBy` and the two diameters quoted in the card's prose.
  Measured at the default throat, fc 500, T 0.7: Th_h 60 wants 15308 cm² over
  432 mm and was shown 7654 cm² over 393 mm — 2x under; Th_h 120 wants 5103
  and was shown the same 7654 — 1.5x over. Fixed to read `thetaH`. **The
  general lesson is that removing a mode leaves its ternaries behind as
  branches that always take one side**, and the compiler cannot see it —
  grep for the other removed mode names when one is retired.
---

## Superseded path knobs

### 6. (STALE) Bend tightness is pinned at 0.5
*Archived: already marked stale in place. Superseded by `THE THROAT TANGENT IS
NOW SOLVED (solveTightForMinDL)`, which is in `CLAUDE.md` and which found that
the pinned 0.5 was correct for a depth the tool is not using.*

- **(STALE — see above.) BEND TIGHTNESS IS PINNED AT 0.5, and the minimum is NOT the safe end.**
  The two Hermite tangent magnitudes are the cubic's only remaining freedom
  and the measured optimum barely moves: wallSpread bottoms at 0.45-0.55 on
  every well-posed geometry (curved 90x40 d425: 5.63 mm at 0.55; narrow
  60x40 d500: 3.46 mm at 0.45) and is flat between them. The slider was
  removed at the owner's request, but NOT set to its old minimum: 0.25
  measures 8.50 mm of wall spread against 5.63 and 12.7 mm of dL against
  2.4, because the tangents also decide where each cell's path length lands.
  Above 0.8 it collapses — 1.0 gives a 1 mm minimum radius, 20 mm of wall
  spread and 17 mm of duct overlap; 1.2 gives 517 deg of turning. On
  badly-posed geometries (flat mouth, shallow depth) the whole curve is flat
  and something else dominates. If it is ever worth per-geometry accuracy,
  SOLVE it like depth; the model keeps the parameter.
---

## CAD import and union forensics — the superseded members

### 7. The lofted wall runs past its own throat cap plane
*Archived: the mechanism is restated twice in `CLAUDE.md` on live geometry —
in the cutter-fold finding (the same ~0.4-of-a-station-step threshold,
measured at both ends) and in the uniform-loft finding. `shellCapOvershoot` is
no longer computed on an export, because the shipped throat is plain and has
no extension ring.*

- **THE LOFTED WALL RUNS PAST ITS OWN THROAT CAP PLANE, and that is a
  SELF-INTERSECTING SOLID no self-check in the file can see.** `extendSections`
  prepends ONE ring at distance `ext`, and `ductBrep` interpolates with a
  UNIFORM parameterisation, so a short first gap followed by a full station
  step is told the two are equal and the cubic overshoots BACKWARDS. The wall
  then pokes through the flat cap meant to close it. Residual, edge pairing and
  referential integrity all pass regardless — none of them tests
  self-intersection. **This is the same mechanism already recorded for the
  station count** (32 of 48, gaps alternating 1 and 2, ran 4.6 mm off its own
  rings); it was simply never applied to the extension, which violates it far
  harder. Measured at 6x3, 32 shell stations, mean station step 11.5 mm:
    ext/step   0.09    0.17    0.26    0.43   0.69   0.96
    overshoot  0.94    0.40    0.033   0.000  0.000  0.000  mm
  **The threshold is about 0.4 of a station step, and the shipped default
  straddles it**: ext 3 with the five-phase stagger gives 3.0 to 7.8 mm, i.e.
  0.26 to 0.68 of a step, so the two phase-0 cells overshoot and the rest do
  not. On the test geometry (step 13.3 mm) the worst is **0.6625 mm**.
  `shellCapOvershoot` measures it on every export, names the cell and prints
  the ratio; it is REPORTED, never clamped, because raising `ext` and lowering
  `stations` both fix it and which one is wanted is the owner's call. A PLAIN
  throat has no extension ring at all, so its wall stops exactly at its end
  ring — measured 0.
  **It does NOT explain the split failures**: the two cells that overshoot on
  the owner's export are the two that SPLIT SUCCESSFULLY. It is a real defect
  found while looking for that one, not the answer to it.
### 8. The two ends of the shell are set separately
*Archived: the argument it makes — the mouth trim cuts on the aperture surface
and has never failed, a throat trim would cut on the plane z = 0 which is the
operation measured failing — is carried in the live `TWO SWITCHES MAKE THE
UNION TRACTABLE` finding, which is also where the shipped recipe is stated.
`extendThroat` / `trimThroat` and their tests are still in the model.*

- **THE TWO ENDS OF THE SHELL ARE SET SEPARATELY (`extendThroat` /
  `extendMouth`, `trimThroat` / `trimMouth`), because they are not the same
  problem.** The MOUTH trim cuts on the APERTURE SURFACE itself, a curved face
  the blanks cross transversally, and it has never been reported failing. The
  THROAT trim cuts on the PLANE z = 0 — which is exactly the operation the
  owner measured failing as a plane SPLIT on individual blanks, so subtracting
  it asks the kernel for the operation already known to fail. A plain throat
  makes that face from the loft's own end ring, planar in z = 0 to 0 by
  construction, and asks for no cut there at all; the price is the coplanar
  overlapping throat caps (27 of 27 adjacent pairs) coming back. A trim with no
  extension behind it would cut into the real body and is REFUSED, not shipped.
### 9. The first thing that sorts the unions is adjacency (the first, weaker read)
*Archived: superseded by `ADJACENCY IS THE RULE FOR THE UNIONS`, which
aggregates this export with the next one (8 of 8 non-adjacent succeeding, 2 of
13 orthogonal). Kept for the kernel's own words on the tangency — one union
returned "resulting body non-manifold" rather than failing, which is the only
direct confirmation of that mechanism from the kernel rather than from our own
measurements.*

- **THE FIRST THING THAT SORTS THE UNIONS IS ADJACENCY, and it took a second
  export to show up.** On the owner's second quarter (6 cells, x- y-, wall 3,
  deeper than the first), 13 pair unions:
    NON-ADJACENT (no shared edge)   4 of 4 succeeded
    ORTHOGONAL neighbours           2 of 6 succeeded (3 failed, 1 non-manifold)
    DIAGONAL neighbours             1 of 3 succeeded
  On the FIRST export nothing sorted them at all, so this is a change in the
  geometry rather than a rule that was always there. 13 points, so treat the
  split as suggestive rather than established.
  **ONE UNION RETURNED "resulting body non-manifold" RATHER THAN FAILING, and
  that is the kernel naming the tangency in its own words.** A union of two
  solids is non-manifold when they meet along a curve or at a point without
  volumetric overlap there — exactly the tangential-contact crossing every
  adjacent pair in this kit has. It is the first direct confirmation of that
  mechanism from the kernel rather than from our own measurements.
### 10. Three blanks failed a plane split at the throat
*Archived: an unreproducible report on an export that predates the settings
stamp, and a plane split at the throat is not part of the shipped recipe (cut
after the union, and the throat is plain). If it recurs on a stamped export it
is worth reopening — the point that survives is that it is a ONE-BODY
operation and so cannot be a pair-interaction effect.*

- **THREE BLANKS FAILED A PLANE SPLIT AT THE THROAT (2,1 / 3,1 / 3,2 of six),
  and that is a ONE-BODY operation.** No second solid, no shared surface, no
  tangency: whatever it is, it is a property of the single blank, and it
  survives every import setting. It does NOT predict the union failures — 2,1
  and 3,1 both fail the split yet union with each other successfully, while 3,1
  and 3,2 both fail the split and their union fails too. Not reproducible here
  yet, because that export predates the settings stamp; the throat plane itself
  is a clean cut in the file as shipped (below).
### 11. The exported bodies are topologically exact — the import-healing hypothesis
*Archived: the hypothesis was tested and falsified — see `IMPORT-TIME HEALING
IS RULED OUT` in `CLAUDE.md`, where the owner re-imported the same kit with
every healing option off and got identical results. The AUDIT stands and is
carried forward as one line in that finding: every solid is the minimal 6-face
topology, F - E + V = 2, every edge shared by control point rather than by
tolerance. The per-option reasoning below is kept because it is a map of what
an importer's dialog will do to this file.*

- **THE EXPORTED BODIES ARE TOPOLOGICALLY EXACT, SO AN IMPORTER'S HEALING AND
  SIMPLIFY OPTIONS CAN ONLY SUBTRACT. Turn them OFF; there is nothing to
  repair.** Audited on the owner's shipped quarter, all 14 solids:
  F - E + V = 6 - 12 + 8 = **2** on every one, **every edge used exactly once
  in each direction**, 12 distinct curves for 12 edges, 6 loops for 6 faces —
  and every one of the 24 edge uses on a blank is a `B_SPLINE_CURVE_WITH_KNOTS`
  **whose control points ARE control points of the adjoining face's own
  surface**. So each edge lies on both surfaces by SHARED ENTITY, not by
  tolerance, and there are no tolerant edges to replace.
  Shapr3D's import dialog defaults five of these ON. Against this file:
    · **Simplify Geometry** — says outright it "might change the model's
      shape". The blanks are already the minimal 6-face topology, so it has no
      redundancy to remove and can only alter the surfaces.
    · **Advanced Healing (Parasolid Bodyshop Repair)** — "recalculate all
      edges based on face intersections". This DISCARDS our exact shared-
      control-point edges and re-derives each from a surface-surface
      intersection, and the mitred corners are exactly where two nearly
      parallel NURBS meet at a shallow angle. The most fragile operation
      available, applied to all 12 edges of every blank.
    · **Healing (HOOPS)** — adjusts topological tolerances and "eliminates
      sliver faces"; near a sharp cell corner the wall face is genuinely
      narrow and is not a sliver to remove.
    · **Accurate Edge Computation** — same family: rectifies problems that the
      audit says are not there.
    · **Sewing** — a closed shell with paired edges needs no sewing, but the
      importer may rely on it to form solids at all; leave it ON.
  **This is also the best explanation on offer for the per-body
  unpredictability**: whether healing damaged a given body is decided at
  IMPORT, per solid, so it is invisible in the geometry we ship and it would
  make one blank fail every operation it takes part in. The owner reports some
  blanks failing a plane SPLIT at the throat — a one-body operation with no
  union involved — which cannot be a pair-interaction effect at all.
  **The throat plane itself is a clean cut in the file as shipped**: the z = 0
  crossing sits at the SAME v to 5e-14 across every u on every wall (it is an
  exact iso-curve, since the throat ring is planar in z = 0), with |dz/dv| >=
  294 mm per unit v, and no v-line crosses z = 0 more than once. So a failing
  split is not a wiggling wall.
---

## Settled numerics and their tests

### 12. A capped duct's volume depends on the cap fill
*Archived: the STL and STEP writers are settled and the test is passing. Read
it before chasing a brep-vs-mesh volume difference — it is measuring the cap
choice, not an error.*

- **A CAPPED DUCT'S VOLUME DEPENDS ON THE CAP FILL, and that explains the
  whole brep-vs-STL volume difference.** The mouth ring is NON-PLANAR in
  every mouth mode — rect included, its ring spans ~1.7 mm of z — so the
  surface spanning it is a choice: the STL fans to the ring centroid, the
  STEP fills with a Coons patch, and the enclosed volume moves 0.8-5% of a
  duct with that choice (5% on a wide biradial cell). The walls are NOT part
  of the difference: closing the B-spline walls with the SAME fans the mesh
  uses agrees with the mesh volume to 0.097% worst-case over 18 ducts. The
  test asserts the fan-capped identity tightly and bounds the Coons-vs-fan
  difference by ring area x ring normal-spread; do not chase the raw
  brep-vs-mesh percentage, it is measuring the cap choice.
### 13. LU with partial pivoting has two conventions and they do not mix
*Archived: the solver behind the B-spline writer works, is residual-checked,
and is not being rewritten.*

- **LU WITH PARTIAL PIVOTING HAS TWO CONVENTIONS AND THEY DO NOT MIX.** Swap
  full rows during factorisation (multiplier columns included) and you must
  apply the whole permutation to the right-hand side BEFORE substitution;
  swap only columns >= k and you must interleave swap-and-update. Mixing
  them (full-row swaps + interleaved solve) corrupts the solve whenever a
  later pivot moves a row whose multiplier was already used — measured 6.0
  absolute error on a random 11x11, and 105 mm of surface residual before
  the fix. The residual check caught it; a fixed-tolerance "looks close"
  check would not have, because small systems often pivot trivially.
### 14. A 1x1 grid used to crash the equal-area solve
*Archived: fixed, and the 1x1 straight cell is now a regression test and the
closed-form testbed for the bow's curvature.*

- **A 1x1 grid used to crash the equal-area solve.** Zero constraints took
  the trivial-return path through `finish()` before `let it` was initialised
  — a temporal dead zone, not physics. Fixed; the 1x1 straight cell is now
  itself a regression test and the closed-form testbed above.

---

## The pre-biradial, flow-mode era

### 15. Path length on the apex-sphere mouth
*Archived: already marked superseded in place. On the biradial mouth the
ordering DOES flip with depth, which is the whole of `AXIAL DEPTH IS THE
DOMINANT dL LEVER` in `CLAUDE.md`.*

- **Path length on the APEX-SPHERE mouth: the centre cell is always shortest.**
  SUPERSEDED for the biradial mouth by the dL-optimum note above, where the
  ordering DOES flip with depth. Kept only because it explains why the
  correction problem looked harder than it is: on a cap centred at the apex
  every mouth point is at radius r from it, so the distance to a point at
  angle th is minimised at th = 0 for any r, and no depth or apex can flip it
  (measured centre-minus-corner negative at every depth 40-700 mm and every
  apex 60-300 mm). Correction was therefore always centre-cell lengthening,
  needing room exactly where there is least. The biradial mouth removed that
  constraint entirely.

### 16. Station 0 needs no special case now, but it used to
*Archived: superseded by `THE SECTION PLANE NOW FOLLOWS THE TANGENT`, which
pins z-hat at the throat over a measured ramp and reports the residual
station-0 obliquity as the flat driver face read against the launch ray.*

- **Station 0 needs no special case now, but it used to.** Under the flow the
  section at s = 0 IS the throat outline in the throat plane, so the driver
  mating face is flat by construction. Before the flow, every station was cut
  perpendicular to its own centreline, and at the throat that already points
  down the exit cone: station 0 came out tilted by up to 6.85 deg, straddling
  z = +-0.5 mm, with no common face across the eighteen ducts to seat on.
### 17. Decoupling vertical from horizontal curvature is a continuum
*Archived: written when the aperture was still an ellipsoid of revolution with
a single radius. The biradial mouth superseded it and made the vertically flat
case reachable directly. What survives, and is why equal solid angle is not a
criterion anywhere in the tool: equal AREA survives the whole curvature range
and equal SOLID ANGLE is what degrades, up to 7.9% at the flat end — about
0.33 dB of vertical non-uniformity, an order-of-magnitude figure since this
tool computes no radiated pattern.*

- **Decoupling vertical from horizontal curvature is a CONTINUUM, and the one
  thing it trades is equal solid angle.** (Written when the aperture was still
  an ellipsoid of REVOLUTION with a single radius; the biradial mouth above
  superseded that and made the vertically-flat case reachable. The measured
  trade below is what survives and is why equal solid angle was dropped as a
  criterion.)
  Measured at 6x3, Th_h 90 deg, vertical arc 213 mm, with equal-AREA vertical
  subdivision enforced at every curvature — one rule covers the family, since
  equal cumulative area reduces to Lambert's equal d(sin elev) at the sphere
  and to equal d(y) at the cylinder:
    kappa 1.00 (sphere) area 0.081%, solid angle 0.090%, dL 29.9 mm
    kappa 0.50          area 0.021%, solid angle 3.358%, dL 33.7 mm
    kappa 0.00 (flat)   area 0.000%, solid angle 7.873%, dL 37.5 mm
  So equal area SURVIVES the whole range — the cylinder is exactly equal-area,
  better than the sphere's 0.081% which is only chord discretisation — and what
  degrades is equal solid angle. Per row at kappa 0: bottom 0.0562, middle
  0.0608, top 0.0562 sr, so the middle row owns ~8% more of the pattern for the
  same area. The cause is geometric: on a cylinder the outer rows sit at
  sqrt(r^2+y^2) from the apex rather than r, and their surface is oblique to
  the line of sight; on a sphere both terms vanish, which is exactly why the
  spherical cap gets equal area and equal solid angle simultaneously.
  Equal output per cell into unequal solid angle is roughly 0.33 dB of vertical
  non-uniformity — an order-of-magnitude figure, not a prediction, since this
  tool computes no radiated pattern and real vertical control is dominated by
  mouth height and edge diffraction. dL degrades smoothly with curvature, so
  there is no cliff to avoid, only a trade to price.
