# Ginkgo Multicell Horn — immediate tasks

## Done in the 2026-09-01 layout session

- **The tool is now a TWO-PANE layout and the single scrolling column is
  GONE.** Both were built and compared side by side (`ginkgo-cockpit.html`
  carried the candidate); the owner picked the two-pane version, so it was
  promoted into the canonical `ginkgo-horn.html` / `GinkgoHorn.jsx` and the
  comparison page, its mount script and its component were deleted. The
  cockpit URL 404s in production, like the other retired URLs.
  Left pane scrolls: eight numbered stages in design chronology — driver →
  throat partition (throat plan inside it) → coverage & mouth (mouth plan
  inside it) → expansion law → depth & path → path lengthening (the
  path-length chart inside it) → ghost slot for the coped joints → export.
  Right pane is pinned: horn header with solve status, warnings, a tabbed
  viewport (3-D ducts / horizontal section / cell table) and a verdict strip
  scrolling independently (acoustic behaviour · physical form · routing).
  Stacks to one column below ~1020 px.
- **The path-length chart lives with the inputs, not in the pinned pane**
  (owner). Each bar is one cell's developed path against the longest, which
  is exactly what stage 6 equalises; in the pinned pane it said nothing the
  ΔL verdict did not already say.
- **THE FORK DIVERGED WITHIN A DAY, and the diff caught it.** The bow-solver
  session (lobe lock) landed in the classic file while the comparison copy
  sat untouched, so the surviving file was assembled from the CLASSIC head
  (newest logic, lobe lock included) plus the new render layer — not by
  keeping the copy wholesale, which would have silently reverted that
  session's work. Recorded in CLAUDE.md as the lesson: diff the shared half
  before merging a fork, and keep forks short-lived.

Updated by the UI session of 2026-09-01 (Hypex readout audit + mouth
dimensions + duct-preview bug), on top of the 2026-08-31 build session (STEP
export + preview/export decoupling). Read `CLAUDE.md`
first; this file only says **what to do next and why**, not how the thing
works. Every number quoted here is measured, and the measurement is recorded
in `CLAUDE.md` under "Known findings worth not re-deriving".

## Done in the 2026-09-01 UI session — second pass

- **The f_c depth solve is gone from the UI** (owner: "does not return viable
  horns anyway", and the loading limit lands well below the crossover points
  that matter at these sizes). The model keeps `solveDepthForFc` and its
  tests. "Solve axial depth for" now offers minimum ΔL alone.
- **"Mouth area needed" removed** — it is the 1-D reference horn's aperture,
  7.7x the mouth the coverage arcs actually specify. "Mouth you have" was
  restated on its own terms (⌀ equivalent and radius ratio) rather than as a
  fraction of a requirement no longer on screen.

- **"Minimum horn length" re-keyed to the actual mouth** (owner's call,
  option 2 of the three written up last pass) and renamed **"Path needed for
  f_c"**. It now inverts the profile against the cell's own radius ratio
  rather than the 1-D reference horn's aperture: 280 mm for 500 Hz at the
  defaults, against 318–320 mm of path — green, and consistent with the
  437–440 Hz that FLARE CUTOFF prints beside it. Previously it read "short of
  393 mm by 75 mm" in red on that same geometry.
  Verified by round trip against the FORWARD model: re-solving m from (ratio,
  the reported length) returns the target cutoff to 3.4e-16 relative over
  4 T × 3 fc × 18 cells. Verdicts checked across depth 150/200/320/500 and
  targets 500/700 Hz — "clears" and "short" agree with the FLARE CUTOFF range
  in every case.
  The `Cutoff f_c` input therefore stays: it now drives a metric about the
  horn being built, not only the reference figures.

### RESOLVED — the reference-keyed length metric

(This block described `Minimum horn length` / `Path you have` still being
keyed to `hypexReference` and contradicting the FLARE CUTOFF beside them,
and offered three options. The owner picked option 2 and the second-pass
session implemented it — "Path needed for f_c" above is the result. Kept
as one line so the option list is not re-litigated; this section also
appeared twice in this file by paste accident, now deduplicated.)

## Done in the 2026-09-01 UI session

- **The Hypex section's two readouts were AUDITED and are arithmetically
  right**, verified against an independent re-solve rather than against the
  tool's own output — see the two new CLAUDE.md findings for what each one
  actually measures and where its convention flatters. FLARE CUTOFF and
  LOADING LIMIT are unchanged.
- **A real bug in the same card was FIXED**: `hypexReference` was called with
  `coverageDeg: mouthMode === "arc" ? thetaH : 90`, and `mouthMode` has been
  the constant `"biradial"` since the apex went away — so the ternary was dead
  and the reference horn was pinned at 90 deg whatever Θh said. "Mouth area
  needed", "Minimum horn length", `governedBy` and the ⌀ figures in the prose
  all rode on it. Now reads `thetaH`; measured in the browser at the default
  throat, fc 500, T 0.7: 15308 cm² / 432 mm at Θh 60, 7654 / 393 at 90, 5103 /
  371 at 120, against a flat 7654 / 393 before.
- **Mouth chord is DIMENSIONED ON THE DRAWING** rather than printed beside it
  — witness ticks, dimension line, figure above it, in the drafting
  convention — and the sagitta readouts are gone (the curvature they measured
  is carried exactly by the STEP export). The `chord` and `sagitta` fields
  stay in the JSON export; only the on-screen text went.
- **The duct-solids preview reverted to the opening geometry on the first
  mouse touch.** Fixed — see the new CLAUDE.md finding. The test that proves
  it is a ZERO-pixel drag: the view is untouched, so the only thing that can
  move the image is which geometry the redraw reaches for. Against the
  unfixed build the canvas hash returned exactly to the opening hash; against
  the fix it stays on the current one.
- **Bow-region presets reworked**: "divider region" removed (it named a
  station that no longer exists — the inset tapers to zero at the mouth),
  replaced by throat third / quarter / fifth alongside throat half. Measured
  at 6x3, 90x40, arc 480x213, 1 lobe, radial:

        depth 425      amplitude   wallSpread   overlap
        throat half      46.8 mm     17.44 mm    0.73 mm
        throat third     33.6        15.79       4.04
        throat quarter   28.5        15.19       3.83
        throat fifth     25.6        15.16       3.82

  Tighter is a smaller bow AND less wall spread, and it costs clearance —
  because all four are anchored at the throat, which is exactly where the gap
  profile is already negative. The card's own prose says this; the numbers
  now back it. At depth 150 wallSpread saturates at 35.04 mm for third,
  quarter and fifth alike while amplitude keeps falling (51.7 / 47.4 / 45.1),
  so at a depth far from the ΔL optimum the metric stops discriminating —
  read amplitude and overlap there.

## Done in the 2026-09-01 bow-solver session

- **The bow solver no longer chooses the lobe count by default.** "lobes
  locked at N" holds the count you set and searches direction x region around
  it; one click frees it to try both. Left free it lands on 2 lobes almost
  everywhere, because it ranks on wallSpread and wallSpread is a
  fibre-length-at-the-mouth measure that cannot see a reversal happening in
  the wide part of the passage. The measured cost of the lock is recorded in
  `CLAUDE.md` under the enumeration finding (5.37 mm against 4.42 mm of wall
  spread at 6x3, 90x40, depth 320, with half the bow amplitude).
  **If this is worth pursuing**, the honest fix is a second ranked quantity
  that charges a bend by the local section width — bendWiden is the obvious
  candidate and is recorded as misleading on its own, so it would have to be
  a constraint or a weighted pair, not a replacement objective.

## Done in the 2026-08-31 build session

- **Task B — STEP export — is BUILT** (`buildSTEP` in the model, "STEP ·
  B-spline solids" button in the export card). One AP214 file, 18
  MANIFOLD_SOLID_BREP solids; each duct is 4 lofted B-spline wall faces split
  at the section corners plus 2 Coons caps, interpolated through every
  sampled ring point (residual 1e-13), watertight by shared entities (seams
  exactly 0). 13 new checks in the test suite (350 total), including the
  fan-capped volume identity that isolates the cap-fill ambiguity — see the
  three new CLAUDE.md findings (STEP topology, cap-fill volume, LU pivoting
  conventions).
  **What remains is OWNER VALIDATION IN CAD** — nothing here can open STEP.
  Ask them to check, in this order: the file imports at all and yields 18
  separate bodies; the driver mating faces sit flat and coplanar; a fillet
  and a boolean each succeed on one duct; and mass-properties volume against
  the tool's number (expect the cap-fill difference recorded in CLAUDE.md).
  Expect one or two round trips; the writer's entity boilerplate is the
  usual first thing a picky importer complains about.
- **Preview/export resolution decoupled** (plan item 3): the live map is
  pinned at 24 stations (~60 ms per slider tick against ~136 at 64), and
  every export builds a fresh full-resolution map at the "export stations"
  setting when its button is pressed. The clearance and the 3-D preview ride
  the preview map, so they got cheaper too. Headline readouts (path lengths,
  dL, fc) come from the centreline `samples` setting and did not move.
- **Task A decision recorded** (owner): mouth area under convex cell edges is
  the UNION — no double-counting of overlaps — and the UI must also report
  the double-counted area as a percentage against the naive per-cell SUM.
  See the note added to Task A below for the geometric identity that makes
  this cheap.

## Run-through result (2026-08-31, earlier session)

The whole tool was walked end to end and is healthy:

- 337 closed-form checks passed as of that session (350 now, with the STEP
  checks); `npm run build` (palette check included) is clean; all five tool
  pages plus the landing page mount in headless Chromium with no console
  errors.
- Interactive costs re-measured and consistent with the recorded figures:
  mapping 136 ms at 64 stations (51 ms at 16), deferred clearance 534 ms,
  3-D preview solids 20 ms — the deferral pattern is doing its job.
- Housekeeping done in this session:
  - **`turnLimitDeg` removed** from model and UI, with its `wallWidthAt`
    input. It was already recorded as "useless as a threshold" and measured
    89x over at the tool's own defaults, yet it still drove a warning banner,
    a red metric and red table cells that could never go green — permanent
    red that buried the real warnings. `turnMax` stays informational;
    **`wallSpreadMax` is now a standing metric** (against λ/8), since it is
    the recorded number to judge bends by and was previously only visible
    with lengthening on.
  - Dead code removed: the unused `Slider` component in `GinkgoHorn.jsx` and
    the never-referenced `constraintCount` export in the model.
- Housekeeping looked at and deliberately NOT done: many model exports are
  only used internally (over-exported, not dead) — de-exporting is churn with
  no behaviour change, skip it. (The preview/export resolution decoupling was
  conditional then; the owner approved it and it is now done.)

## Where the tool stands

Built and tested (350 checks in `scripts/test-hgrid.mjs`, all against closed
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
- Volume identity with a tested convergence rate; STL, STEP (AP214
  B-spline solids), DXF and CSV export.
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
  centre-row special case (owner). Built; see Task C for what remains.
- **Bend tightness is FIXED at 0.5, not exposed and not minimised.** The
  owner asked for the slider gone; the measurement says the minimum would
  have been a bad place to pin it. See CLAUDE.md.
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

## The plan, in order

1. **Task A — convex mouth-cell edges** (below). The owner's stated next
   direction; they will drive it. It is also the prerequisite for restoring
   the evanescent-run/recombination analysis, so it unblocks physics, not
   just geometry. The union-vs-sum question is now SETTLED (union, with the
   double-counted percentage reported) — see the decision note in Task A.
2. **Task B — STEP export: owner validation round trips.** The writer is
   built and self-checked; what remains is real CAD feedback. When Task A
   lands, the exporter must carry the coped-joint geometry too — the
   knife-edge intersection curves become real edges, which is a topology
   change to the curved-box B-rep, not just new surface data.
3. **Task C — per-cell bow choice** (below). Stays deferred until wavefront
   manipulation beyond dL equalisation is wanted.

(The preview/export resolution decoupling that was item 3 here is done —
see "Done in the 2026-08-31 build session".)

## Task A — convex mouth-cell edges, for coped knife-edge joints

**Owner's stated intent (confirmed):** bulge each mouth cell's edges
outward so neighbouring ducts overlap before the mouth, and the ducts then
meet at CURVED KNIFE EDGES — like coped or mitred pipe joints — rather than
running separately to a blunt termination. This is the owner's next
direction and they will drive it in a new session.

Read the `dividerEndFrac` finding in CLAUDE.md first: it is the same
subject. Today the ducts do not share a wall anywhere except at the two
ends, because the expansion profile pulls them apart through the middle.
That is exactly what this task changes. The divider-end parameter was
REMOVED for precisely this reason, and with it the evanescent-run analysis
(`f1End`, `decayLen`, `runNeeded`, `straightAvail`), whose premise was a
station where the dividers stop. **Restore that analysis as part of this
task** — once ducts meet there is a real wall, a real station at which it
ends, and the recombination question becomes answerable again.

What to settle before touching geometry, because it breaks the invariant
everything downstream rests on: convex mouth cells NO LONGER TILE. The
mouth grid is currently a strict partition — cells share edges exactly,
areas sum to the aperture, and both `mouthAreaTotal` and each cell's
expansion ratio depend on that. Overlapping cells double-count, so decide
first what "mouth area" means: the UNION (what radiates) or the SUM (what
the expansion law targets per cell). The law reads the per-cell figure, so
it needs the honest one. The owner has acknowledged this disrupts the
expansion maths and wants to work through it deliberately.

**DECIDED (owner, 2026-08-31): the mouth area is the UNION**, and the UI
must also report the double-counted area — sum minus union — as a
percentage of the sum, so the size of the overlap bookkeeping is always
visible rather than silently absorbed.

A geometric identity makes this cheaper than it looks, and it is worth
holding onto while building: **as long as every bulge crosses only an
INTERIOR shared edge (never the aperture rim), the union of the bulged
cells is EXACTLY the original tiled aperture.** Cell A's bulge past a
shared edge lies inside neighbour B's original territory, so it is already
covered by B's outline — each pairwise overlap lens is precisely A's lobe
plus B's lobe, and union = sum − overlaps = the tiled total. Consequences:
`mouthAreaTotal`, the loading limit and the pattern limits DO NOT CHANGE
under Task A; the total radiating aperture is invariant. What changes is
per-cell accounting. And for MIRROR-SYMMETRIC bulges the exchange across
each edge cancels pairwise, so each cell's share of the union equals its
original tiled area — meaning the expansion law can keep targeting the
tiled per-cell area it targets today, with the bulge a pure joint-geometry
feature on top. The reported percentage (sum vs union) then measures how
much outline area the coped joints double-count, which is exactly the
number the owner asked to see. Verify the identity numerically once the
bulges exist (union via sampling or clipping vs the tiled total), and
treat any residual as a bug in the bulge construction — a bulge crossing
the rim, or an asymmetric exchange.

**DECIDED (owner, 2026-09-01): the bulge is applied to the MOUTH TILES and
each throat cell lofts to its bulged outline** — the whole-path alternative,
not a last-few-stations blend. The owner named both; the whole-path form
was chosen and it is also the one this architecture can express: the
profile SCALES the flowed/swept sections between two end outlines, it does
not reshape them, so a station-local bulge would need a second
station-dependent outline-blend mechanism — the same family as the
reframing constructions that caused the 2.8-5.8 mm interpenetration, and
the same mistake as `dividerEndFrac`: a station-based feature whose station
the geometry does not define. Under the whole-path form the knife-edge
station EMERGES (it is where neighbouring sections first touch) instead of
being imposed. Note one refinement to the intuition: `m` is re-solved per
cell against the bulged ratio, so the extra expansion is redistributed over
the whole path by the Hypex shape — k = 1 still lands at both ends, on the
bulged outline — and the "virtual reduction near the mouth" exists ONLY in
the union bookkeeping: no per-cell schedule ever decreases, the SUM of
sections simply overstates the physical union passage past the first knife
edge.

**Construction constraints (so the invariants survive):** bulge each shared
INTERIOR edge in (u,v) parameter space of the aperture — the outlines stay
on the biradial surface, so normal arrival and `aimErr = 0` survive — with
zero displacement at the corners (corner-maps-to-corner and the STEP
curved-box topology both survive) and mirror-symmetric amplitudes (the
union identity above needs the symmetric exchange). Rim edges never bulge.
The mouth rings then share only their CORNERS with neighbours, not their
edge points — the mouth-tiling test (2.6e-14 mm point-sharing today)
becomes a corners-plus-overlap test, which is a test-suite change to make
deliberately, not a regression to be "fixed".

**READOUT IMPACT AUDIT (2026-09-01, against the current UI).** Everything
below `throat` that reads per-cell mouth area moves; group them before
reordering the UI:

*Move, and should (they describe the duct now being built):*
- `profRatio`, `profM`, `profFc` → FLARE CUTOFF range, the fc spread +
  `fcDecomp` + its 3% warning, hover fc, table fc/k columns, CSV columns.
  Direction: bulge RAISES the ratio, so fc reads HIGHER. Estimated shift
  ~beta / (2 ln rho) with beta the per-cell double-count fraction and rho
  the radius ratio — order 1% of fc per 5% of bulge at the default rho ~10
  — so the double-count percentage readout doubles as the fc-shift
  predictor. MEASURE it when built; do not trust this estimate past its
  order of magnitude.
- "Path needed for f_c" (`pathNeeded`) — keyed to `profRatio`, so it asks
  for slightly more length under bulge. Same order as fc.
- `fcDecomp` gains a third term: the bulged-area share differs BY CELL
  CLASS (an interior cell bulges 4 edges, an edge cell 3, a corner cell 2),
  so a "from bulge" component appears next to length and ratio, and the
  "equal-area horn = equal-fc horn at the dL optimum" identity picks up a
  bulge-sized residual. Either decompose it or expect the spread warning to
  fire and mislead.
- `mouthAreaSpread` — spread of bulged outline areas is structurally
  nonzero for the same lobes-per-cell reason. Decide what it reports:
  union-shares (stays ~0, proves equal output share — recommended headline)
  with the bulged-outline spread beside it (it is what the law consumes).

*Must NOT move (aperture-total figures — compute them on the UNION, which
equals the tiled total under the identity above):*
- `mouthAreaTotal` is today a SUM over `r.mouthArea`; under bulge that
  double-counts. Keep it the tiled/union total. Riding on it: "Mouth you
  have", LOADING LIMIT (dEq), the JSON export figure. If left as a sum,
  loading would silently read better than reality.
- PATTERN HOLDS DOWN TO (per-axis chords) — unchanged, bulges are interior.
- dL, path lengths, the depth solve — aim targets are cell centres and
  symmetric bulges leave centroids ~unchanged; verify once, then expect
  these readouts still.

*Change MEANING and need re-scoping (the big one):*
- `clearance.overlap` currently means "defect". Under bulge, overlap past
  the knife-edge station is THE FEATURE. Split the measurement at the
  per-pair knife-edge station (first touch, already detectable with the
  clearance machinery's per-pair distances): before it, overlap keeps its
  red warning; after it, it becomes "joint engagement", reported not
  warned. THREE consumers need the split: the interpenetration warning, the
  narrowest-gap warning, and `solveBow`'s overlap-floor constraint — left
  unscoped, every bow candidate fails its floor the moment bulge is on.
- The divider inset taper (full at throat -> zero at mouth) keys on "the
  mouth tiles". With bulge the walls end at each edge's knife-edge station:
  taper to zero THERE, per edge. This is exactly the station whose absence
  removed `dividerEndFrac` — it exists again, so restore the evanescent-run
  analysis (`f1End`, `decayLen`, `runNeeded`, `straightAvail`) keyed to it.
- ΣA(x) CSV — the summed schedule overstates the union passage past the
  first knife edge. Add a union (or overlap-corrected) column there, or the
  Hornresp/ABEC hand-off silently inherits the double-count.

*New readouts Task A owes the UI:*
- double-counted area as % of sum (the owner's ask), per cell and total;
- knife-edge station per neighbour pair (and earliest overall);
- wall-end station per edge + the restored recombination analysis;
- joint engagement depth (intended overlap), separate from defect overlap.

**UI RE-ORDERING PROPOSAL** (for the owner to approve in the Task A
session): the bulge amplitude control and the double-count % belong in the
MOUTH card — bulge is a property of the mouth tiles, and the % sits beside
the per-cell spread it complicates. The Hypex card keeps FLARE CUTOFF /
LOADING LIMIT unchanged in position, with the fc figures now computed on
the bulged geometry and the double-count % echoed there as the fc-shift
context. The "Per-cell realisation" block splits in two: "duct separation"
(pre-joint clearance, keeps its warnings) and a new "coped joints" block
(knife-edge stations, engagement depth, wall-end stations, evanescent-run
analysis) — the joint block sits AFTER separation because it only exists
once the ducts meet. Exports gain the union column in ΣA and keep per-duct
solids as-is: interpenetrating duct solids are exactly what CAD wants,
because a boolean union of them PRODUCES the coped knife edges.

## Task B — STEP export

**BUILT in the 2026-08-31 session — see "Done" at the top.** What follows is
the original brief, kept because it states the purpose the validation round
trips must serve. The self-checks it asked for all exist and run in the
test suite; the remaining work is acting on the owner's CAD feedback.

**Owner's stated purpose:** the STEP files are to be MANIPULATED downstream
— adding features, and introducing joints so the horn can be 3D printed in
parts and assembled. That purpose settles the fidelity question: faceted
STEP is not good enough, because you cannot reliably fillet, offset or cut
joints into a shell of 150k planar facets. The target is lofted B-spline
surfaces with proper solid topology, which a CAD kernel can boolean and
feature cleanly.

The ducts are already a stack of section rings, which is exactly the input
a skinned B-spline surface wants, so the data is the right shape. The work
is a hand-written AP214 writer (no libraries) emitting
B_SPLINE_SURFACE_WITH_KNOTS per duct wall plus capped, correctly oriented
CLOSED_SHELL topology.

**The owner will hand-validate the files**, which removes the main risk —
nothing in this environment can open STEP. Still build the self-checks
first: referential integrity of the entity graph (every referenced ID
exists, every edge used exactly twice with opposite orientation) and reuse
of the existing manifold and divergence-theorem volume checks on the
topology being emitted. Expect one or two round trips on real CAD feedback.

## Task C — per-cell bow choice (deferred by the owner)

Not needed yet. Revisit when wavefront manipulation beyond dL equalisation
is wanted — that is what it really buys: once each centreline is
independently targetable you can specify a DELIBERATE per-cell path length
and shape or steer the wavefront, rather than only flattening it.

`solveBow` already enumerates direction x lobes x region for the whole horn.
The per-cell version must choose per SYMMETRY CLASS (`classIndex` in the
equal-area solve), not per cell, or it destroys the mirror symmetry the
directions exist to preserve. Derive each class's region from its OWN gap
profile rather than a preset list — on the curved mouth the winning region
[0.3, 0.95] is exactly where the gap profile says the room is.

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
- **Bend tightness pinned at 0.5** and its sliders removed (owner). The
  measured optimum is 0.45-0.55 everywhere well-posed; the old minimum of
  0.25 would have cost 8.50 mm of wall spread against 5.63 and 12.7 mm of
  dL against 2.4.
- **`dividerEndFrac` removed** (owner) along with the evanescent-run
  analysis that depended on it. The inset now tapers linearly to zero at
  the mouth; both end conditions stay exact.
- **The open-area scale solve is now closed form** — open(k) is exactly
  quadratic in k, so two evaluations and a quadratic formula replace a
  24-step secant.
- **Defaults at the owner's call**: stations 16 -> 64 (bend structure was
  visibly faceted at 16; costs ~101 ms in the render pass and ~496 ms for
  the deferred clearance at 6x3), lobes 1 or 2 with 1 the default, bow
  region default [0, 0.5] with only "throat half" and "divider region"
  offered.

## Known cost — RESOLVED (2026-08-31)

At stations 64 the render-pass mapping was ~142 ms at 6x3 — ~7 fps on a
slider drag. The recorded fix is now built: the live map is pinned at
24 stations (~60 ms) and every export rebuilds at the "export stations"
setting on its own click. Kept here because the numbers are the reference
if the preview count ever needs revisiting — 16 was visibly faceted through
a bend, which is why the preview sits at 24, not 16.
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
npm run test:hgrid     # 350 closed-form checks; a physics change without a
                       # matching change here is a change that is not verified
npm run build          # runs check:palette then test:hgrid, then vite
npm run preview        # then load every page and confirm no console errors
```

Chromium for headless checks:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox
--virtual-time-budget=6000 --dump-dom http://localhost:4173/ginkgo-horn.html`
