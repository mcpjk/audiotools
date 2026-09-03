# CLAUDE.md

Working notes for this repo. Read before changing anything.

## What this is

Five loudspeaker design calculators served as a static multi-page site at
`audiotools.kiiworkshop.com`. Everything computes client-side — no backend, no
network calls, no analytics, no external libraries beyond React.

The multicell tool has been renamed three times: H-Grid Throat Partition,
then Multicell Horn, then Gingko, now **Ginkgo Multicell Horn** — for the
leaf, a round stem fanning into a broad folded blade. The spelling was
corrected to the botanical "Ginkgo" (Ginkgo biloba) at the owner's request;
the old `gingko-horn.html` URL now 404s in production, the same accepted
fate as `cd-exit-divider.html` below.

A sixth tool, CD Exit Cell Division, was deleted once the multicell tool
superseded it. `cd-exit-divider.html` 404s in production — Workers Assets
defaults `not_found_handling` to none — but `npm run preview` falls back to the
landing page instead, so a 200 there is not the deployed behaviour. If that
link ever needs to live again, the tool is in the history.

Tools are usually iterated **one at a time in separate sessions**. Assume you
are touching one tool and that the others must come out byte-identical.

`NEXT-SESSION.md` carries the current task queue for the Ginkgo tool — what to
build next and the measurement each task rests on. Keep it current; it is the
handover between sessions.

## Layout

```
index.html                landing page — plain HTML/CSS, no React
horn-calculator.html      → src/horn-main.jsx        → HornCalculator
annular-flh.html          → src/flh-main.jsx         → AnnularFLHCalculator
directivity-match.html    → src/directivity-main.jsx → DirectivityMatch
aperture-wavefield.html   → src/aperture-main.jsx    → ApertureWavefield
ginkgo-horn.html          → src/ginkgo-main.jsx      → GinkgoHorn
src/hgrid-model.js        that tool's physics, split out so node can test it
src/palette.js            shared theme tokens — see below
scripts/palette-gen.mjs   regenerates the neutral ramp
scripts/test-hgrid.mjs    test vectors for hgrid-model.js — the build runs these
vite.config.js            the `input` map is what makes this multi-page
wrangler.jsonc            Cloudflare deploy + custom domain
```

Each tool is its own real HTML entry point. There is **no client-side router**,
and that is deliberate: direct links, bookmarks and refreshes work with no
server rewrite rules. Do not introduce one.

**The Ginkgo tool is a TWO-PANE layout**, chosen over the original single
scrolling column after both were built and compared side by side. The left
pane scrolls and carries the inputs as eight numbered stages in design
chronology, each housing its own diagram; the right pane is pinned and
carries the horn — status, warnings, a tabbed viewport and a verdict strip
that scrolls independently. Below ~1020 px the panes stack into one column.
The comparison page `ginkgo-cockpit.html` was DELETED once the choice was
made and now 404s in production, the same accepted fate as the URLs below.

**The duplication taught one lesson worth keeping**: the two files diverged
within a day — a bow-solver change landed in one and not the other, and was
only caught by diffing before the delete. If a tool is ever forked for
comparison again, diff the shared half before merging, and keep the fork
short-lived.

## Commands

```bash
npm install
npm run dev        # localhost:5173
npm run build      # check:palette, then test:hgrid, then vite → dist/
npm run preview    # serve the built output as deployed
npm run test:hgrid # test vectors for the H-grid model, against closed forms
```

## Adding a tool

1. Component in `src/`, with a `export default function`.
2. Mount script in `src/` — copy an existing one, change the two names.
3. Entry HTML at the repo root — copy an existing one, change `<title>` and
   `<script src>`.
4. Register it in **two** places:
   - `vite.config.js` → the `input` map. **A page missing from this map is
     silently not built** — no error, it just never appears.
   - `index.html` → an `<a class="card">` block, or nothing links to it.

## The palette

`src/palette.js` is the master palette and the single source of colour.
**Import it; never redeclare a local `C`; never write a raw hex in a tool.**

```js
import { C } from "./palette.js";
```

`npm run check:palette` enforces all three, and the build runs it first. It
also checks that every entry HTML's inline background and favicon still match
`C.page`. A line that genuinely needs a fixed colour whatever the theme — black
for CAD/SVG export — opts out with a trailing `palette-exempt` comment.

### Role names, not colour names

The palette has two layers: themes hold values, tools consume **roles**.

```
page panel panelAlt      grounds
border borderStrong      rules and outlines
ink inkDim inkMuted      type, three weights
series1..series7         data marks, fixed order
accent accentDim         the one highlight
reference                marker / crosshair lines
```

**New tools should use role names.** `C.amber` pins a tool to a colour;
`C.series1` lets the theme move it. The older tools still use legacy aliases
(`bg`, `surface`, `text`, `amber`, `blue`, …) which map onto the roles, so they
keep working — but do not add more.

The clearest illustration is `C.white`. It means "the reference-line colour",
so on the light theme it resolves to near-black ink, and every tool that draws
a crosshair follows the theme without being edited.

### Switching or changing a theme

```bash
# edit THEME in src/palette.js -> "washi" (light, paper) | "sumi" (warm dark)
npm run theme:sync      # push the new values into the entry HTML files
npm run check:palette   # confirm nothing drifted
```

Every tool follows from the palette import. The entry pages need the sync step
because they carry literal colours: the background and the inline SVG favicon
have to paint before any JS runs, or the page flashes the wrong colour on load.
Each of those values is tagged with the role it holds —
`background:#f4efe7;/*theme:page*/` — which is what lets the sync rewrite them
safely. Verified as a round trip: washi to sumi and back returns every page
byte-identical.

To change values, edit the OKLCH specs in `scripts/palette-gen.mjs` and re-run
it; it prints a block that replaces the theme in `palette.js`. It is written to
reproduce the committed theme exactly, so a diff should show only comments.
Do not hand-edit hexes — that is how a ramp stops being a ramp.

### Why the values are what they are

The active theme comes from a traditional Japanese colour plate — 千草鼠
chigusa-nezumi, 砥粉色 tonoko-iro, 媚茶色 kobicha-iro, 黒色 kuro, on washi paper.

Those four are used as a **hue family, not as literal values**. As printed they
cannot survive as thin marks: against the paper the gold measures 1.70:1 and
the sage 2.91:1, where a plot line needs 3:1. They work in the book because
they are large blocks. Each hue was re-stepped in OKLCH to the lightness its
role needs.

Series lightness is spread from 0.44 to 0.64 deliberately. Separation that
survives colour-blindness comes from lightness, not hue — red, green and gold
all collapse toward one hue under deuteranopia, so they are held apart in
lightness instead. 0.64 is the ceiling where a mark stops clearing 3:1.

There is a standing tension here: muting the colours makes them prettier and
less distinguishable. Muted was tried and pushed the worst pair below the
normal-vision floor, so the slightly more saturated step was kept. If you
retheme, re-run the data-viz palette validator on the series before trusting
them — every combination that can appear together on one chart should pass.

Anything that mixes colour numerically — the Aperture Wavefield canvas colour
map, for instance — must derive its endpoints from `C` rather than hard-coding
RGB. That tool once held the background as raw `(12, 15, 20)` in its pixel
loop, which left the canvas off-theme when the palette changed.

## Component conventions

Match what is already there rather than modernising it:

- Self-contained single files, `import React` plus the palette, nothing else.
- Inline style objects, no CSS modules, no styling library.
- Hand-rolled SVG for all plots — no charting library.
- Physics helpers as plain top-level functions above the component.
- **One exception, deliberate**: `GinkgoHorn.jsx` keeps its physics in
  `src/hgrid-model.js` — a plain module with no React and no colour — so that
  `scripts/test-hgrid.mjs` can import it under node and check it against closed
  forms. Split a tool this way only when it has enough physics AND enough
  independent closed forms to make the tests worth having. Do not split for
  tidiness; the single-file convention is the default for a reason.
- A long comment block at the top of each tool stating the model, its
  assumptions, and the direction of error for each simplification. **Keep this
  current.** If you change the physics, change that block in the same edit.
- Metric units throughout.

## Verifying a change

`vite build` succeeding proves almost nothing here — these tools compile fine
and then fail at runtime, and a wrong coefficient compiles perfectly. Before
claiming a change works:

1. `npm run build`, then `npm run preview`.
2. Load every page and confirm no console errors — a broken component mounts
   an empty `<div id="root">` and the page just looks blank.
3. For a physics change, check the number against a closed form computed
   independently, not against the tool's own output. Vary one input at a time
   and confirm the result moves the way theory says it should.
4. For anything in `src/hgrid-model.js`, `npm run test:hgrid` must pass. It
   checks against closed forms — the exact Neumann modes of a disc and of a
   circular sector, the corner-angle and DOF counts, the evanescent decay
   length — never against the tool's own previous output. **A physics change
   there without a matching change to that script is a change that has not been
   verified.** If a test starts failing, work out which of the two is wrong
   before touching either.

Chromium is available at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
for headless rendering checks.

## Deployment

Push to `main` → Cloudflare builds and deploys automatically. `dist/` and
`node_modules/` are gitignored; Cloudflare regenerates both.

Gotchas that have already bitten once each:

- `NODE_VERSION=22` is set in the Cloudflare dashboard. Vite 8 needs Node
  ≥ 20.19 and the default image can be older.
- `package.json` has `"type": "module"`, so `__dirname` does not exist —
  `vite.config.js` uses `import.meta.url` instead.
- The output directory is **not** a dashboard field on Workers. It comes from
  `assets.directory` in `wrangler.jsonc`. If the Vite output path changes, both
  files change together.
- A Cloudflare **custom domain** creates the DNS record; a **route** does not.
  A route on a hostname with no DNS record fails as "server not found".

## Owner context

Physics-first, changes one variable at a time, wants the mechanism explained
rather than just a recommendation, and wants simplifications and assumptions
stated rather than made silently. Good spatial intuition, not formally trained
in software, and new to git — worth explaining git concepts as they come up
rather than just running commands. Metric units, SGD for costs.

Report findings rather than silently patching things that were not asked about.

## Why the multicell exists at all

**Maximising impedance transformation is a motivating reason for the multicell
construction, not a side effect.** That makes the expansion profile a first
class design variable. The two are connected: a horn's expansion law is a 1-D
plane-wave argument, and above f1 the throat wave is not planar, so the law
stops describing what happens. The partition is what keeps propagation planar
high enough in frequency for the chosen expansion to mean anything.

Where the tool stands now. The Hypex profile is imposed (`profileT`), the
mouth can be stated as coverage angles instead of millimetres (`mouthMode:
"arc"`), the path has independent tangents and a straight run at each end, and
`fc` can be SOLVED FOR rather than read off, by leaving the axial depth free.
Depth can likewise be solved for the dL MINIMUM (`solveDepthForMinDL`) — the
other leg of the pick-two-of-three — and the signed clearance is separable
(`ductClearance`, `computeClearance: false`) so the UI measures it off the
render pass. Per-cell path lengthening (`lengthen`) bows short cells out to
the longest cell's length in swept mode, and the tool previews the exported
duct solids on a hand-rolled canvas (no three.js — the no-external-libraries
rule stands). The physical horn ships as a shell STEP kit — ONE BLANK AND ONE
CUTTER PER CELL, N independent subtractions and no unions (`buildShellSTEP`;
see the shell findings below, and read the evaluated-vs-searched rings finding
before proposing any other shell construction). The canvas shows the AIR ONLY:
a "horn" view was built twice and dropped at the owner's call.

Without a law imposed the schedule is still the emergent by-product it always
was, and that setting is kept so the two can be compared: measured at 6x3, the
local flare dlnA/dx falls from 29 to 6.7 per metre, sqrt(A) is linear in x to
R^2 = 0.9915 against an exponential fit's 0.9583 — close to a CONE, the classic
poorly-loaded case. That is the thing to move off, and the reason the profile
exists.

## Known findings worth not re-deriving

- **THE TOOL'S DEFAULT GEOMETRY CHANGED ON 2026-09-01 (owner's numbers), and
  every measurement in this file predating it was taken on the old one.**
  Exit half-angle 8 -> 16.55 deg, mouth 90x40 deg / 480x213 mm -> 90x0 deg /
  560x250 mm (a VERTICALLY FLAT mouth), axial depth 150 -> 300 mm. The new
  set is better on every metric the tool reports, which is worth knowing
  before reading an old number as a regression — measured at 6x3, T 0.7:
                        old defaults      new defaults
    dL                  64.20 mm          25.52 mm
    fc                  643-913 Hz        457-496 Hz   (spread 41.9% -> 8.4%)
    mouth area          996.8 cm2         1396.0 cm2
    duct overlap        2.96 mm           0.00 mm
  Depth 300 is the owner's round number, NOT the dL optimum, and the gap is
  real rather than negligible: `solveDepthForMinDL` puts this mouth at
  360.8 mm for dL 11.13 mm and fc 403-416 Hz (3.1% spread). Both are
  legitimate — 300 is 60 mm shorter for 14 mm more dL — but quote depth 300
  as a choice, never as the optimum. The exit half-angle does not enter the
  throat partition at all (f1_min 14.74 kHz, 18 cells, unchanged); it sets
  the launch cone only.
- **THE ARCS AND THE SHAPE ORDER MOVED AGAIN ON 2026-09-02 (owner's
  numbers), and the arcs moved FOR THE PRINT, not for the acoustics.**
  arcH 560 -> 555 mm, arcV 250 -> 245 mm, shape order m 2 -> 3. Th_v is 0,
  so arcV is literally the mouth height, and arcH at 90 deg gives a 499.68
  mm chord — 249.84 mm per half if the horn is split on the vertical
  centreline. Both clear a Bambu P1S bed (256 mm) by 6.2 and 11.0 mm, where
  560 x 250 left 3.9 and 6.0. **THE AXIAL DEPTH IS NOT IN THAT ARGUMENT**:
  at 300 mm the horn does not fit the 256 mm cube in any axis-aligned pose,
  so the split still has to be planned — the arcs buy margin on the mouth
  cross-section and nothing more. The acoustic cost of the 5 mm is small and
  in the expected direction, measured at 6x3, T 0.7, depth 300:
                        560x250           555x245
    mouth area          1396.01 cm2       1355.87 cm2
    dL                  25.52 mm          24.08 mm
    fc                  457-496 Hz        457-494 Hz
  **SHAPE ORDER 3 IS NOT A BETTER DEFAULT HORN, and it is worth knowing
  before reading its numbers as an improvement.** m is the Chebyshev order
  of each grid line, so it sets how much SHAPE the sliders can REQUEST — 13
  free parameters against m=2's 10. At the nominal vector the readouts move
  a hair the WRONG way: f1_min 14.735 -> 14.727 kHz, worst aspect 2.510 ->
  2.520, mean aspect 1.830 -> 1.837, because the extra freedom lets the
  equal-area solve land on a different member of the same family rather than
  a better one. What it does buy is a TIGHTER solve — residual 5.4e-13 ->
  3.1e-15, for 37 Gauss-Newton iterations against 30 and ~124 ms either
  way — and the room to ask for a bow the m=2 space cannot express. Both
  measurements verified in node and against the browser's own readouts.
- **T IS THE ONLY KNOB THAT CHANGES THE MIDDLE OF THE HORN, and it does not
  touch either end, the path, or the mouth.** Measured at 6x3, 90x40, arc
  480x213, depth 320, T = 0 / 0.5 / 1: Lmin 317.888464, Lmax 320.023368, dL
  2.134904, mouth 996.769 cm² — IDENTICAL to six decimals at every T. Both
  ends are pinned by construction (the cells tile at the throat and tile at
  the mouth, so k = 1 there whatever T is) and the centreline comes from
  depth, so T's whole job is the SHAPE of the area schedule in between.
  Three consequences, all measured at depth 320:
  1. **It sets the flare constant, so it sets the reported f_c** — 529-532 Hz
     at T = 0 falling monotonically to 409-412 Hz at T = 1, a 23% span on an
     unchanged body. cosh(mx) + T·sinh(mx) grows faster at higher T, so it
     reaches the same ratio with a smaller m.
  2. **It sets how the area is distributed along the path.** A(u)/A_throat at
     the half-way station is 5.77 at T = 0 against 10.55 at T = 1 — i.e. only
     4.3% of the total expansion is delivered by mid-path at T = 0, against
     8.7% at T = 1. Low T holds the passage narrow and then opens hard.
  3. **It sets the duct interpenetration, and that is the multicell-specific
     part**: overlap 0.325 mm at T = 0, 0.901 at 0.4, 2.034 at 0.7, 2.518 at
     T = 1 — an 8x span, monotone. Adjacent centrelines fan apart nearly
     linearly while the profile grows convexly, and both are pinned equal at
     the ends, so the convex curve lies BELOW the fan line in between; lower T
     dips further and buys clearance. **T is therefore the cheapest lever on
     interpenetration, and it is the same number as the loading choice — the
     two cannot be separated.**
  What T does NOT move: wallSpread is flat across the range (5.03 / 4.77 /
  5.08 mm at T = 0 / 0.7 / 1, a shallow minimum near 0.7), so bend phase
  error is not a reason to pick a T. And `kMax` reads EXACTLY 1.00000 at
  every T while the geometry measures 0.3-2.5 mm of real overlap — the
  documented swept-mode trap, restated here because a T sweep is exactly
  where someone would reach for k.
- **THE `f_c` DEPTH SOLVE WAS REMOVED FROM THE UI (owner's call), and the
  reason is structural rather than a solver defect.** On the biradial mouth
  the aperture is fixed by the coverage arcs, so depth moves NEITHER the
  mouth area NOR the expansion ratio — verified: radius ratio 10.548288 at
  depth 80, 333, 600 and 1100 alike, mouth 996.77 cm² throughout. Depth buys
  path length and nothing else. So "solve depth for f_c" is only "how long
  must the body be", and it answers with a horn away from the dL optimum by
  construction: 275.8 mm for f_c 500 against 320.0 mm for minimum dL at the
  defaults. The owner also reports the loading limit landing well below the
  crossover points that matter at these sizes, so the target was never the
  binding criterion in practice. `solveDepthForFc` SURVIVES IN THE MODEL with
  its tests — it is the documented inverse of the profile and the thing to
  reach for if the mouth ever becomes a free variable; it is the UI
  affordance that was misleading.
- **THE 1-D REFERENCE AND THE COVERAGE-SPECIFIED APERTURE ARE TWO DIFFERENT
  HORNS, and every metric that compared the built geometry against the
  reference misled in the same direction.** `hypexReference` sizes its mouth
  by max(lambda/pi, lambda/sin(Th/2)) — at 90 deg and 500 Hz, 7654 cm²
  against the 997 cm² the coverage arcs specify, 7.7x. Two metrics rode on
  it. "Mouth area needed" was REMOVED. "Minimum horn length" was the length
  to that mouth, and with its companion "Path you have" it read flatly
  CONTRADICTORY: at depth 320 the card printed "short of 393 mm by 75 mm" in
  red while FLARE CUTOFF two rows down printed 437-440 Hz, already better
  than the 500 Hz asked for.
  **It is now RE-KEYED to the mouth being built** and renamed "Path needed
  for f_c": fc and T give m, and (m, T, the cell's OWN radius ratio) give the
  length that cell needs, via `hypexLengthForRatio` — the same equation
  `solveHypexM` solves for m, read for L. Measured at the defaults: 280 mm
  for 500 Hz against 318-320 mm of path, cleared by 38 mm, green, and
  consistent with the 437-440 Hz beside it. The round trip is EXACT — solving
  m back from (ratio, the reported length) returns the target to 3.4e-16
  relative over 4 T x 3 fc x 18 cells, checked against the forward model and
  not against the metric's own bookkeeping.
  It is computed PER CELL AND PAIRED PER CELL, because each cell solves its
  own ratio and the cell with the shortest path need not be the one needing
  least. The effect is small here (38.3 vs 38.4 mm against an unpaired
  Lmin-vs-min comparison, since the ratios spread only 0.12%) but it costs
  nothing and it is the comparison that is actually meant.
  What still reads from the reference: the equivalent throat radius, the
  target's flare constant, and the two diameters quoted in the prose — all
  labelled reference figures, none of them a verdict on the built geometry.

- **THE FLARE CUTOFF AND THE LOADING LIMIT READOUTS ARE ARITHMETICALLY
  CORRECT, and each carries a convention worth knowing before quoting it.**
  Audited against an independent re-solve, never against the tool's own
  output. FLARE CUTOFF prints `profFcMin-profFcMax`, the per-cell fc =
  m·c/2pi with m the bisection root of hypexR(L,1,m,T) = ratio: re-solving
  cell 0 from its own (ratio, L) reproduced the reported fc to every printed
  digit at both depth 150 and 425, and hypexR(L) returned the ratio to 6
  decimals. It reads WIDE at a shallow depth — 643-913 Hz at depth
  150, 42% spread — and that is the recorded equal-area cost, not an error:
  the same geometry at depth 425 reads 329-342 Hz, 0.5% spread, because dL
  collapses there. **A wide fc range is a signal to move depth, not a bug.**
  LOADING LIMIT is c/(pi·dEq) with dEq the equivalent diameter of
  `mouthAreaTotal` — and `mouthAreaTotal` is the SUMMED CELL AREA ON THE
  CURVED CAP, not the projected aperture. So the criterion is stated on a
  surface larger than the hole the wave leaves through, and it always
  flatters: measured 996.8 cm² of surface against a 901.9 cm² chord
  rectangle at 90x40 (1.105x), giving 312 Hz where the projection gives 328;
  at 120x90 it is 1.192x, 173 Hz against 189. Two further conventions ride
  in it: it is an equivalent-AREA circle, so a genuinely rectangular mouth's
  own perimeter says something else again (1281.7 mm -> 272 Hz at the
  defaults), and dEq has no per-axis form at all, which is why PATTERN is
  reported separately per axis. All of this is the standard 1-D convention
  and matches the horn tool; it is recorded because "312 Hz" is otherwise
  read as a property of the aperture rather than of the cap.
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
- **A HANDLER BOUND ONCE CANNOT CLOSE OVER RENDER STATE, and in `DuctPreview`
  that silently reverted the 3-D preview to the geometry it opened with.**
  The pointer listeners are attached in a `useEffect` with no deps —
  deliberately, since rebinding them on every geometry change would drop a
  drag in progress — so they captured the FIRST render's `requestDraw`, which
  captured the first render's `draw`, which closed over the first `geom`. The
  preview tracked the sliders correctly right up until it was touched, and
  then the first drag or scroll repainted the ORIGINAL horn and every later
  frame stayed there. Fixed with a `drawRef` updated in a bare effect
  (declared BEFORE the `[geom]` effect, so it is current when that one
  fires), and `requestDraw` calling `drawRef.current()`.
  **The test is a ZERO-pixel drag**: mousedown, mousemove with dx = dy = 0,
  mouseup. The view is untouched, so the only thing that can move the image
  is which geometry the redraw reached for, and a canvas-pixel hash then
  decides it outright. Verified in both directions — against the unfixed
  build the hash returned to exactly the opening hash, against the fix it
  stayed on the current one, and a real 40x12 drag still moved it. A test
  that dragged by a real distance could not have told the two apart.

- **BEND TIGHTNESS IS PINNED AT 0.5, and the minimum is NOT the safe end.**
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
- **`dividerEndFrac` IS GONE, and the reason is that the geometry has no such
  station.** The parameter tapered a t/2 inset from the throat to an
  adjustable fraction of the path. It was removed because it described a
  shared wall that does not exist: the cells tile at the throat and tile
  again at the mouth, but the expansion profile pulls the ducts APART in
  between, so there is nothing for a divider to end at. Measured before
  removal at 6x3, 90x40, depth 425: sweeping it 0.05 -> 1.0 moved the worst
  exported vertex 0.213 mm and changed duct volume by 0.003%, because its
  whole geometric scope was the 0.2 mm inset — which is why moving the
  slider appeared to do nothing. At dividerEndFrac 0.6 it was insetting a
  0.4 mm divider between ducts measured 10.98 mm apart.
  **The inset now tapers LINEARLY from full at the throat to zero at the
  mouth**, which needs no station and keeps both ends exact: full wall where
  the ducts genuinely tile, none where they tile again and must not be
  inset or the mouth stops tiling. k = 1 at both ends measures 0 and 2e-16.
  The evanescent-run analysis (`f1End`, `decayLen`, `runNeeded`,
  `straightAvail`) went with it — its whole premise was a station where the
  dividers stop, and with the taper running to the mouth the check could
  never fire. **Restore it when ducts are made to MEET** (the convex-edge
  work), because then there is a real wall and a real station.
  **Cost**: the open-area solve now runs at every station rather than the
  first third, so the render-pass mapping went 101 -> 142 ms at 6x3 with 64
  stations. Two thirds of that was clawed back by making the solve closed
  form — see the next finding.
- **THE OPEN-AREA SCALE SOLVE IS CLOSED FORM, because open(k) is EXACTLY
  quadratic in k.** Scaling a section about its centroid by k scales its
  area as k^2 and every side length as k, while the inset depth is a FIXED
  offset and the corner mitres depend only on angles, which scaling does not
  change. So open(k) = A k^2 - L k + C exactly, and A is the gross vector
  area — already known, since at large k the fixed inset is negligible. Two
  evaluations therefore determine L and C, and the root is a quadratic
  formula. Verified against direct evaluation over k = 0.85 to 1.5: worst
  residual 2.4e-12 relative, most of it 3e-14. This replaced a seed plus up
  to 24 secant steps per station, which cost 115 ms of a 184 ms mapping once
  the taper ran the full path.
- **f_c IS THE FLARE CONSTANT AND NOTHING ELSE, and this reads as a
  contradiction until it is spelled out.** The tool solves m from (area
  ratio, path length) and reports f_c = mc/2pi: how fast the passage
  expands. Whether the mouth is big enough to LOAD there, and whether it is
  big enough to hold the PATTERN there, are two further questions with their
  own answers, and at wide coverage they disagree with f_c by an order of
  magnitude. Measured at 500 Hz, 90 deg, the fc-solved horn: mouth 997 cm2,
  flare cutoff 500 Hz, loading limit (circumference = lambda) 312 Hz — so
  loading is comfortable — but pattern control (lambda/sin(Th/2)) only down
  to 1385 Hz, because 90 deg at 500 Hz wants 7653 cm2 and there is 997.
  All three are now printed SEPARATELY, and deliberately not together: flare
  and loading in the Hypex card, PATTERN PER AXIS beside the arcs that set it
  (each axis holds its own angle over its own chord, so they are two numbers
  — measured 1142 Hz horizontal against 4890 Hz vertical at 90x40 with a
  432 x 209 mm chord). Merging them into one "cutoff" is the trap. A horn can honestly
  have a 500 Hz flare cutoff, load below it, and lose 90 deg control above
  1 kHz; that is the behaviour of a small-mouthed horn, not an inconsistency.
  Note the direction of the directivity term: WIDER coverage needs a SMALLER
  mouth, so it is the narrow-pattern horn that comes out enormous.

- **PER-CELL LENGTHENING IS BUILT (`lengthen`), and its closed form is
  straight-path only.** Each cell shorter than the longest is bowed laterally
  with a sin^2(n pi u) window — zero value AND zero slope at both ends, so the
  mouth rings move 3e-14 mm and station 0 stays in the throat plane. The
  leading-order added length is n^2 pi^2 a^2 / (4L) and it MISLEADS on a
  curved centreline: a lateral offset there changes length at FIRST order
  through the kappa.delta term (measured 18-45% off), so the solver bisects on
  the MEASURED length and the formula is only its seed; the closed-form test
  runs on a 1x1 grid whose single cell is straight to 2e-15 deg. Equalising dL
  this way equalised fc 0.594% -> 0.044% at 90x40, depth 425 — the mechanism
  does what the theory said. Amplitude scales as 1/n lobes for the same
  length, and amplitude is what eats clearance (11.4 mm of bow at 2 lobes
  measured 2.05 mm of overlap on that case): raise lobes before accepting a
  bigger bow, and read the clearance after every change. Flow mode refuses
  the feature — a shared boundary point cannot follow two paths.
- **The BOW DIRECTION decides whether the horn stays symmetric, and "radial"
  is the field that keeps both mirrors.** A single world axis bows every duct
  the same way: it keeps the mirror it lies across and BREAKS the other —
  measured 5e-11 mm on the x mirror and 20.5 mm on the y mirror for dir "y".
  `dir: "radial"` gives each duct the outward ray from the horn axis through
  its own mid-path point, so mirrored cells get mirrored bows and both
  mirrors hold at 5.6e-11 mm. A duct sitting exactly ON the axis (odd x odd
  grids, e.g. 5x3) has no radial direction — NO lateral bow can be symmetric
  for it — so it is left unbowed and counted in `lengthen.onAxis` with its
  shortfall, never skewed in an arbitrary direction.
  **Which direction costs less clearance is geometry-dependent and must be
  read, not assumed.** On the curved mouth (90x40, depth 425) radial-out
  HALVES the overlap: 1.09 mm against 2.05 mm for "+y". On a VERTICALLY FLAT
  mouth it is the other way — 8.9 mm against 4.1 mm — because there the
  deficit sits in the middle row, whose outward ray points ALONG the row, so
  those ducts bow straight into their left and right neighbours while "+y"
  carries them clear of the row entirely. Radial-in is worse than both
  everywhere tried (5.6 mm on the curved case): it walks every duct toward
  the axis, where they are already closest. Radial-in and the four world
  axes were REMOVED from the tool at the owner's request; the axes survive in
  the model because the straight-path closed-form test needs a direction that
  works on a cell sitting ON the axis, where no outward ray exists.
- **THE BOW REGION IS A SUPPORT, AND THE STRAIGHT RUNS ARE CUT OUT OF IT.**
  The window spans [uStart, uEnd] of arc length rather than the whole path;
  sin^2 has zero value AND zero slope at both ends of its support, so
  everything outside is untouched to 1e-9 mm. divergeLen and arriveLen are
  excised per cell, because a run the user asked to be STRAIGHT is not a
  place to put a bow — before this the window ran the whole path and a 40 mm
  arrival run measured 1.19-1.41 mm of bow through it.
  **A NARROWER REGION IS A SMALLER BOW, not a bigger one**, which is the
  opposite of the intuition: amplitude goes as sqrt(span) and curvature as
  span^-1.5, so shrinking the window makes the same displacement steeper and
  it buys length faster. Measured at 2 lobes, 90x40 depth 425: [0,1] needs
  16.3 mm at R_min 91 mm, [0,0.35] needs 7.3 mm at R_min 37 mm.
  **Where the room is, though, is NOT at the throat.** Signed duct gap by
  station at 6x3, T 0.7, depth 425: -0.00 at u=0, -1.98 at u=0.13 (the
  profile's own interpenetration), crossing to positive only past u~0.31,
  peaking at 16.6 mm at u~0.78, back to 0 at the mouth. So the acoustically
  attractive place to bend (narrow duct, dividers still present) is exactly
  where the clearance budget is already negative.
- **BENDING ACROSS THE SECTION'S SHORT AXIS IS THE CHEAPER TURN, and
  `bendWiden` is what measures it.** A duct of width w turning through angle
  th puts w*th more length on its outer wall than its inner one, and that is
  phase error straight across the passage. w is the extent along the BEND
  NORMAL, so the direction of the bow decides which dimension pays.
  `dir: "short"` takes the throat section's short axis as a LINE and orients
  it outward, keeping mirror-covariance. Measured at 6x3, 1 lobe, 90x40 depth
  425: bendWiden 29.1 mm against radial's 37.1 mm, for the same dL. It buys
  that with clearance — 16.6 mm of overlap against radial's 1.27 mm on that
  case — so the two are offered together and both numbers are shown.
  Both supersede `turnLimitDeg`, which estimates from one nominal width and
  reads ~100x over budget with or without bows, making it useless as a
  threshold. It is now REMOVED, with its `wallWidthAt` input: measured 89x
  over at the tool's own defaults, so the warning keyed on it could never go
  green and only buried the real warnings. `turnMax` stays as an
  informational figure and `wallSpreadMax` is a standing metric in the UI,
  judged against lambda/8. Between the two bow metrics, read `wallSpread` —
  see the lobe finding below for why `bendWiden` misleads.
- **MORE LOBES IS BETTER ON EVERY COUNT, and the integrated metric said the
  opposite.** This bullet previously claimed the reverse on the strength of
  `bendWiden`; that was wrong and the correction is the point. `bendWiden`
  integrates |w dtheta|, so it charges for every turn — but a REVERSING bend
  does not cost that: a wall fibre running short through the first half runs
  long through the second and the error cancels. `wallSpread` measures the
  fibres themselves (each boundary index is the same material line down the
  duct in swept mode, so max minus min over the index IS the inner-vs-outer
  difference) and it ranks the lobe count the other way round. Measured at
  6x3, radial, 90x40 depth 425:
    lobes        1      2      3      4
    wallSpread  23.2    8.7    7.0    6.4  mm   <- the truth
    bendWiden   37.1   40.2   48.3   ...  mm   <- misleading, do not optimise on it
    amplitude   82.5   16.3    9.6    6.6  mm
  So more lobes is less phase error AND less amplitude AND better clearance,
  all at once. Two is the knee; three buys little. The window is sin^2, which
  never goes negative, so n lobes is n humps on the SAME side of the path
  touching the centreline between them — NOT a sine wave and not an S-bend.
  The cancellation comes from each hump reversing its own curvature.
  **Read `wallSpread`, never `bendWiden`, when judging a bow.** bendWiden is
  kept only as the gross-turning figure and is tested as such.
- **`solveBow` IS GONE FROM THE UI (owner's call, 2026-09-02), and the
  reason is the RANKING METRIC rather than the search.** The solve ranks
  candidates on wallSpread, and wallSpread is the length each wall fibre has
  run BY THE MOUTH — so a bow that distorts the wavefront mid-path and
  unwinds it before the aperture scores as though nothing happened. The
  consequence is systematic, not occasional: the solver reads the wide,
  expanded end of the passage as free real estate and puts the bow there
  (the recorded winner is region [0.3, 0.95]), which is exactly where a
  displacement moves the most air, and the wallSpread it buys back does not
  price that. The owner reports going with `throat fifth` almost every time.
  The `lobes locked` toggle existed ONLY to fence the same blind spot on the
  lobe count, so it went with the solve; the lobe buttons themselves stay.
  **`solveBow` SURVIVES IN THE MODEL with its two tests**, like
  `solveDepthForFc` and the world-axis bow directions before it — it is the
  documented enumeration of the trade, and the thing to reach for if a metric
  ever exists that can see mid-path coherence rather than its integral. The
  two bullets below record what it measured and stay accurate.
- **THE BOW IS SOLVED BY ENUMERATION (`solveBow`), because the options are
  few and neither quantity has a cheap surrogate.** direction x lobes x
  region, each candidate BUILT and measured, ranked on wallSpread, with the
  clearance (the expensive half) measured only on the survivors and an
  overlap floor as the constraint. Measured at 6x3, 90x40 depth 425, floor
  2 mm: the winner is short-axis / 3 lobes / region [0.3, 0.95] at
  wallSpread 4.75 mm and overlap 1.98 mm, and the candidate with the very
  lowest wallSpread (short / 2 / [0, 0.7], 4.50 mm) is REJECTED at 4.54 mm
  of overlap. Note the winning region is "where the room is" — the gap
  profile predicted exactly that.
  **THE LOBE COUNT WAS HELD OUT OF THE SOLVE (`lobes locked`, now removed
  with the solve), and that was a deliberate refusal to optimise on
  wallSpread alone.** Left free
  the solver returns 2 lobes on essentially every geometry, because
  wallSpread prefers more lobes — but wallSpread is the length each wall
  fibre has run BY THE MOUTH, so a reversal cancels in that total whether or
  not the wavefront recovered in between, and the extra hump sits further
  down the passage where the section is wider. The count is therefore the
  owner's, and the solver searches direction x region around it. The lock
  costs about a fifth of the wallSpread and buys back HALF the amplitude:
  measured at 6x3, 90x40, arc 480, depth 320 (the dL optimum there), same
  winning direction and region both ways — short axis / [0.3, 0.95] — at
  wallSpread 5.37 mm / amplitude 13.8 mm locked to 1 lobe against 4.42 mm /
  7.0 mm free at 2, with overlap 1.92 mm either way. Verified identical in
  node and in the browser. Note that at depth 150 — far from the dL optimum,
  and the tool's default until 2026-09-01 — NO candidate qualifies, locked or
  free: every one overlaps 10-22 mm against the 2 mm floor. Solve the depth
  first; the bow is a correction to apply after depth has done what it can.
- **COLUMN PARITY decides where the dividers sit, not how well the horn
  works.** Even n_cols forces a longitude line to u = 0, so a divider runs
  down the vertical centreline of the throat — through the exit's
  highest-intensity region — and no cell centroid is at the origin. Odd
  n_cols has no line there and a cell straddles the centreline instead.
  f1_min barely notices: 14.56 / 14.73 / 14.69 / 14.80 kHz at 5 / 6 / 7 / 8
  columns, consistent with the rows-not-columns finding. Worst ASPECT does
  notice, and it favours FEWER columns: 2.16 / 2.51 / 2.96 / 3.32 over the
  same series.
  The bow ambiguity the parity is meant to solve needs odd n_cols AND odd
  n_rows — that is the only combination putting a cell centroid exactly on
  the axis. An even ROW count removes it just as well: 5x4 has no on-axis
  cell and the best worst-aspect of any grid tried (1.75).
- **THE CONFORMAL SEED DOES NOT RELIABLY BEAT THE ELLIPTICAL ONE, and it is
  ~11x slower.** It improves the MEAN aspect (1.723 against 1.830 at 6x3) but
  f1_min is set by the WORST cell, and there it can lose: measured f1_min
  elliptical vs conformal, 6x3 14.73 vs 13.93, 8x3 14.80 vs 12.99, but 6x4
  19.01 vs 19.28 and 4x3 14.62 vs 14.92. So it wins on squarer grids and
  loses on the wide ones, and 119 ms against 1372 ms for the solve. Try both;
  do not assume conformal is the better seed.
- **THE STEP EXPORT IS A CURVED BOX PER DUCT, watertight by shared entities,
  and its surfaces INTERPOLATE the sampled rings.** Every section ring is 4
  equal runs of n points with the cell's real corners at the run boundaries,
  so each duct is 4 lofted B-spline wall faces split exactly at the corners
  plus 2 Coons-patch caps — 6 faces, 12 edges, 8 vertices. Adjacent faces
  reference the SAME control-point entities along their seams (corner columns
  solved once, cap boundary rows taken from the wall end rows), so seams
  measure exactly 0, not a tolerance. Global cubic interpolation (natural
  ends, one LU per direction reused across all solves) puts the surface
  through every sampled point to 1e-13 — control-points-as-data was rejected
  because its smoothing bias is not obviously small against 0.2 mm walls.
  Face orientation is MEASURED at the patch centre, never assumed: the two
  caps' natural u x v normals point the same axial way, so any assumed
  winding gets exactly one of them wrong.
- **A RING THAT IS EVALUATED FROM A SMOOTH MAP WITH FIXED POINT
  CORRESPONDENCE LOFTS CLEANLY; A RING THAT IS DERIVED PER STATION BY A
  DISCRETE SEARCH DOES NOT. This is the most expensive lesson in the file —
  three constructions, four CAD round trips, two rejected on sight.** The
  ducts have never had surface texture. Two attempts to give the horn a
  single outer skin both did, and they were written by the SAME loft through
  the SAME writer at the same station count, so neither the loft nor the
  resolution is the cause. What separates them:
    - a duct ring, and a per-cell BLANK ring, are one smooth map sampled at
      each station. Vertex k is the same material line the whole way down;
      between stations only its position changes, smoothly.
    - the rejected skins were FOUND by search. The wrapped body traced an
      iso-line of a raster distance field (marching squares, 0.2-0.6 mm
      pixels); the banded blocks took the CONVEX HULL of the duct points and
      offset it. Both decide something discrete at every station — which
      pixels are inside, which points are on the hull — that decision changes
      abruptly along the path, and the arc-length resample that follows then
      slides every vertex onto a different feature.
  The cubic loft interpolates points whose POSITIONS and whose CORRESPONDENCE
  both jitter by a few tenths of a millimetre, and a few tenths at ~5 mm
  spacing is exactly the scale of a visible crease. **It does not refine
  away**: the noise is uncorrelated station to station, so a finer raster or
  more stations changes the texture without removing it. The owner's own
  render of the banded kit is the cleanest evidence — the TUBES (evaluated
  offsets of duct rings) are smooth and the BLOCK (convex hull) is rippled,
  in one file.
  **The rule for anything built here later: a solid must be lofted through
  rings the model can EVALUATE, never through rings a search returns.** If a
  shape genuinely needs a search — a union outline, a morphological closing —
  that is a kernel's job, not this tool's.
- **WHAT ACTUALLY BREAKS THE UNION OF THE BLANKS IS DUPLICATED SURFACE, NOT
  THE TANGENCY CROSSINGS — and the owner could not have seen it.** The
  tangency finding below is real but is one mechanism among several, and on
  the throat region it is not the dominant one. Audited on the shipped
  export at the defaults, wall 3, with the default bow:
    - **NEAR-COPY LATERAL FACES.** Two adjacent cells share a grid line, so
      on the sides they do NOT share, both blanks offset the SAME curve by
      the SAME distance — the identical surface computed twice, over a band
      exactly 2·wall wide. In swept mode each cell fits its own best-fit
      plane, so the two copies land **0.4 um to 50 um apart**: measured
      5-6.5 mm of arc per pair inside 10 um, 148-172 mm total inside 50 um
      over 27 pairs, closing to 0.43 um at worst. A kernel's linear
      tolerance is around 1 um. That is not a shape it can resolve, and it
      is invisible at any zoom.
    - **COPLANAR OVERLAPPING END CAPS, 27 of 27 pairs at EACH end.** Every
      throat ring is planar in z = 0 and every mouth ring lies on the one
      aperture — both properties the owner asked for, both boolean-hostile.
    - Up to **5 blanks covering one point** near the throat (the H-grid's
      4-way nodes plus the wall), and 7.28 mm mitre spikes at the sharpest
      corners.
    - RULED OUT by the same audit: self-intersecting rings (0), near-
      degenerate patches (smallest station step 3.47 mm), and blank fold —
      margin +4.6 mm, with R_curv down to 11 mm near the throat, so **the
      blank folds somewhere above wall ~7.6 mm on this geometry.**
  This explains the owner's three observations better than tangency does.
  WHY THE THROAT: that is where the cells tile and share grid lines. WHY
  SOMETIMES: whether a stretch falls inside or outside tolerance shifts with
  every parameter. WHY SUBTRACTION NEVER FAILS: a subtraction never has to
  decide whether two faces are the same face.
  **CUT AFTER THE UNION, NEVER BEFORE.** Cutting all N blanks at a common
  plane and then unioning the pieces adds N coplanar OVERLAPPING cut faces
  on top of everything above — the owner made the region harder by isolating
  it.
- **NEVER ASK CAD TO OFFSET ONE OF OUR FACES; ASK THE TOOL TO BUILD THE
  EXTENSION.** Offsetting a blank's throat face by +1 mm succeeded in the
  owner's CAD and +2 mm failed. A face offset EXTRAPOLATES the four wall
  surfaces past their parameter range and re-intersects them, and the corner
  identity — adjacent walls sharing control-point columns — holds only
  INSIDE the domain, so the corner has to be healed and the discrepancy
  grows with distance. `extendSections` prepends a REAL ring instead, so the
  extension is part of the loft. That is why the cutters have never failed.
- **THREE SWITCHES MAKE THE UNION TRACTABLE, and each is justified by the
  number it moves.** All three leave the passages untouched — the cutters
  are unchanged — and all three are measured on every export.
  (1) `jitter` (default 0.5 mm): cells of opposite grid parity get different
  walls, so no face is ever a near-copy of another. Orthogonal neighbours
  always differ in parity, so the guarantee is structural. Measured
  near-copy arc inside 50 um: **148 mm at jitter 0, 1.8 mm at 0.2, 0 at
  0.4 and above**. WHICH value is clean is geometry-dependent (0.3 measured
  85 mm on one map where 0.1 measured 17), so `shellCoincidence` MEASURES it
  on every export and the note says to raise the jitter if anything is left.
  The jitter only ever ADDS, so `wall` stays the minimum.
  (2) `extend` (default on): the blanks run past both end faces, staggered
  per cell on a five-phase index that is guaranteed to differ between
  orthogonal neighbours, and two TRIM solids come with them — a slab below
  z = 0, and a slab beyond the aperture whose cutting face is the aperture
  ITSELF through `apertureCapGrid`, not a chord across it. Coplanar
  overlapping throat caps go **27/27 to 0/27**. The recipe becomes: union
  the N blanks, subtract both trims, subtract the N cutters — so the union
  never touches an end plane and the two faces that must be exact are made
  by subtraction. `snapMouth` is off when extending: the trim makes that
  face, so the one-ring snap discontinuity is not needed.
  (3) `stations` (default 32): the shell gets its own count, subsampled from
  the map's. Every wall face carries stations + 3 control points in v, and
  SSI of two nearly parallel high-knot NURBS is where a kernel spends its
  conditioning budget. Halving is nearly free — measured **0.105 mm** of
  departure from the full-station loft, 0.414 mm at a quarter, 1.707 mm at
  an eighth, monotone. The count is snapped to a DIVISOR of the map's,
  because the loft interpolates with a UNIFORM parameterisation: at 32 of 48
  (gaps alternating 1 and 2) it ran 4.6 mm from the very rings it was built
  through.
  A `two-cell test` export emits ONE orthogonally adjacent pair under the
  same settings — the smallest thing that can fail, two solids instead of
  38, and the repro to reach for before exporting a full kit.
  **What none of this removes is the tangency crossings**: every pair still
  passes from overlap to clearance twice, and that is inherent to per-cell
  blanks at any wall under half the widest duct gap.
- **UNION THE BLANKS ONE CELL AT A TIME, AND CUT ONLY AFTER THE UNION. Both
  halves are the owner's CAD results, and the second one overturned a
  hypothesis of mine that the numbers had not supported.** Three experiments
  on the shipped 18-cell kit, in order: (1) split at 100 mm THEN union pairs —
  4 of 27 pairs failed, and `cutdiag` found those four indistinguishable from
  the other 23 on crossing z, rate, gap at the cut and near-copy arc, i.e. my
  tangency reading did not survive the data; (2) the same pairs UNCUT — both
  union fine, so **the cut was the cause**, exactly as predicted by the
  coplanar-cut-face argument; (3) uncut, three row-runs of three cells each
  unioned fine and **unioning the three merged bodies failed**. Incremental
  one-cell-at-a-time unions then worked.
  The one metric that separates every result is **how many blanks cover the
  same volume at the throat**, measured on a 0.2 mm grid over the throat
  plane: any orthogonal pair 2, a row-run of three 3 (0.0 mm2 covered 4 deep),
  rows 1+2 together **6** (64 mm2 covered 4 or more deep), all three rows 6
  (128 mm2). Everything at 3 or less succeeded; the 6 failed. Six overlapping
  solids is 15 mutual surface-surface intersections to resolve in one small
  region.
  **WHY SIX AND NOT FOUR: 2xWALL EXCEEDS THE THROAT CELL WIDTH. It is the FACE
  offset, not the corner mitre, and the mitre reading in the first version of
  this bullet was wrong.** A grid node joins four cells, so four is the
  structural floor. Six needs a blank to reach clean across a cell, and the
  face offset alone does it: at the throat the cells TILE, so each blank pushes
  `wall` into its neighbour across the whole shared face, and the two blanks on
  either side of a narrow cell then meet inside it. Measured: throat cells
  4.47-7.25 mm wide (duct rings, `throatCellWidth`) against 2·wall + jitter =
  6.5 mm. Sweeping the wall moves both numbers together —
    wall           3.0   2.5   2.0   1.5   1.0
    throat stack     6     5     4     4     4
    area >=4 deep  309   226   133    69    26  mm2
    NON-adjacent    29    18     2     0     0  pairs of 153
  — and the closed form predicts the crossing exactly: 2·wall + jitter is
  6.50 / 5.50 / 4.50 / 3.50 mm against a narrowest cell of 4.47, so the last
  clear wall is between 2.0 and 1.5, which is where the measurement puts it.
  **CLAMPING THE MITRE WAS TESTED AND IS NOT THE FIX**: a full round (clamp to
  1.0x wall, the tightest a corner can be without thinning the face) left the
  stack at 6 on the tool's defaults and took it 6 -> 5 on the test geometry,
  with 24 of 28 non-adjacent pairs still sharing — while halving the wall
  removed all of them. A previous session recommended the cap as the highest-
  value fix; that recommendation was withdrawn on this measurement, and the
  suite now asserts the negative so it cannot be re-proposed by memory.
- **THE PAIR THAT FAILS IS NOT PREDICTABLE FROM THE PAIR'S GEOMETRY, and that
  is the result that ends the pair-hunting.** On the owner's own quarter export
  (6 cells, x- y-, wall 3, jitter 0.5, ext 3 — parameters read back OUT of the
  STEP: the throat cap z per blank reproduced `cellPhase5` exactly), 13 pair
  unions gave 5 failures and 8 successes. The blanks' own B-spline surfaces
  were evaluated from the shipped file — no assumption about UI settings — and
  every candidate discriminator came out flat:
    - overlap depth: FAILED 4.80-6.57 mm, ok 1.40-6.88 mm
    - surface points inside the neighbour: FAILED 71-642, ok 18-524
    - separate contact runs along the path: FAILED 1-4, ok 1-4
    - knife-edge fraction (inside by < 0.1 mm): FAILED 1.2-50.5%, ok 0-58.2%
    - closest approach: 0.000-0.038 mm on EVERY pair, failed and ok alike
  Two pairs are near-twins and land on opposite sides: 1,1-2,2 FAILED at
  overlap 5.05 mm / 200 points / 4 runs / 50.5% knife, while 2,1-3,2 SUCCEEDED
  at 5.09 / 194 / 3 / 58.2%. Likewise 1,2-2,1 succeeded and 2,2-3,1 failed at
  92 vs 71 points and 4.61 vs 4.80 mm. **Every pair in that file overlaps
  millimetres deep AND touches within 40 um somewhere**, so the whole
  configuration sits on the kernel's tolerance boundary and which side a pair
  lands on is not readable from its shape. Do not look for the bad pair; change
  the geometry class. Note also 1,1-3,2 — two columns apart, no shared edge —
  overlapping 4.62 mm over 40 mm of path, which is the reaching above, measured
  on the shipped file rather than in the model.
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
- **ADJACENCY IS THE RULE FOR THE UNIONS, and the second export made it
  clean.** On the owner's third quarter (settings read from the header: 6x3,
  m 2, arcs 555x245, depth 357, T 0.7, divergeLen 2, **bulge 4**, radial 1-lobe
  bow, wall 3, jitter 0.5, 32 shell stations), 15 pair unions:
    NON-ADJACENT (no shared edge)   4 of 4 succeeded
    ORTHOGONAL neighbours           0 of 7 succeeded (6 failed, 1 non-manifold)
    DIAGONAL neighbours             1 of 4 succeeded
  Across the two exports that is **8 of 8 non-adjacent succeeding and 2 of 13
  orthogonal**. So the union fails when and only when the blanks are
  neighbours — when they share a grid line and therefore pass through the
  tangential contact this file has recorded from the start. The pair-hunting
  finding above stands (WHICH adjacent pair fails is not readable from its
  shape); WHETHER a pair can fail is now clear.
  **The split-failing SET is not stable across exports** — {2,1 3,1 3,2} on one
  and {1,2 3,1} on the next — so it is not a fixed property of a cell either.
  Audited on the reproduced geometry and RULED OUT as the cause: ring
  self-intersection at any station (0), concave radius under the wall (min
  26 mm against a 3 mm wall), min caliper (10.6-14.9 mm), and a 3-D check for
  a genuine fold (closest non-neighbour boundary approach 2-7 um, at the mitre
  corners, and worst on a cell that SUCCEEDS).
- **EVERY SHELL STEP SHIPPED BEFORE 2026-09-03 HAD A MALFORMED HEADER, and it
  was found while trying to recover an export's settings.** A STEP string
  literal is delimited by apostrophes, so an apostrophe inside one must be
  DOUBLED. The shell recipe read `union the 6 'shell blank' solids, then
  subtract 'throat trim' ...` with bare quotes, so a reader tokenising
  FILE_DESCRIPTION sees a string, then the bare keywords `shell blank`, then
  another string — a syntax error in the parameter list. The DATA section was
  always well-formed and every geometric check passed, so **this is a
  conformance defect with no measured link to the boolean failures**; a lenient
  importer skips it, a strict one is entitled to reject the file. Fixed with
  `stepStr`, which doubles apostrophes and backslashes and folds non-ASCII (the
  plain-mode recipe carried an em dash, also outside a STEP string's charset).
  The test is a real TOKENISER over the header, not a substring search.
  **AND EVERY EXPORT NOW CARRIES THE SETTINGS THAT MADE IT**, as a second
  FILE_DESCRIPTION string: grid, R, t, seed, coverage, arcs, depth, T, section
  mode, path knobs, bow/bulge/separate, wall, jitter, stations, region. A
  session was spent inferring wall, ext and the extension phases back out of an
  export's geometry, and depth and the arcs could not be recovered at all —
  which is why a per-body failure the owner reported could not be reproduced
  here. Read the header first on any file that comes back from CAD.
- **IMPORT-TIME HEALING IS RULED OUT.** The owner re-imported the same kit with
  Simplify Geometry, Advanced Healing, Healing (HOOPS) and Accurate Edge
  Computation all OFF, and again with Shapr3D's standard "quality" defaults:
  **identical results both ways**, on the throat-plane splits and on the
  unions. The hypothesis in the finding below was wrong. Turning them off is
  still right on the argument that there is nothing to repair, but it changes
  nothing, so it is not the lever.
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
- **THREE BLANKS FAILED A PLANE SPLIT AT THE THROAT (2,1 / 3,1 / 3,2 of six),
  and that is a ONE-BODY operation.** No second solid, no shared surface, no
  tangency: whatever it is, it is a property of the single blank, and it
  survives every import setting. It does NOT predict the union failures — 2,1
  and 3,1 both fail the split yet union with each other successfully, while 3,1
  and 3,2 both fail the split and their union fails too. Not reproducible here
  yet, because that export predates the settings stamp; the throat plane itself
  is a clean cut in the file as shipped (below).
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
- **A HALF OR A QUARTER CAN BE EXPORTED (`xSide` / `ySide`), and the one thing
  that does NOT survive mirroring is the wall jitter.** `symmetryRegion`
  selects cells by THROAT CENTROID, and a cell whose centroid sits ON a plane
  is its own mirror image: it is exported WHOLE and reported as `onPlane`, so
  it is never duplicated when the region is mirrored back. An odd row or
  column count is exactly when that happens — 6x3 splits clean left/right
  (9 + 9, none on the plane) and straddles top/bottom (12 cells, 6 of them the
  middle row, in BOTH halves), so a quarter is 6 cells of which 3 are shared.
  `mirrorSymmetry` MEASURES the mirror the region rests on rather than
  assuming it, because a world-axis bow breaks one outright: 2.2e-9 mm on both
  axes at the defaults and with radial or short-axis bows, 15-54 mm on the y
  axis with `dir: "y"`. The measurement pairs cells by mirrored centroid and
  compares each mirrored point against the partner's ring as a POLYLINE, so no
  index correspondence is assumed — a mirror reverses ring orientation.
  **DO NOT MIRROR A SHELL HALF AND UNION IT TO ITSELF.** `jitter` is keyed to
  grid PARITY, so a mirrored copy carries the same wall as the cell it now
  sits beside and the near-copy surface the jitter exists to break comes
  straight back at the seam. No label-based parity can fix this — the mirrored
  solid is the same cell, so it carries the same number by construction.
  Export the opposite side instead; the passages are mirror images either way
  and only the blanks' walls differ.
- **THE HORN SHELL IS EXPORTED AS ONE BLANK AND ONE CUTTER PER CELL, and the
  CAD work is N independent SUBTRACTIONS with no unions at all.** A blank is
  that cell's duct rings offset outward by `wall` on all four sides through
  the mitred-offset machinery; a cutter is the duct extended past both end
  faces. Constant on every side is deliberate and replaced an earlier split
  (rim sides `wall`, shared sides `wall - t/2`) that existed only to make a
  union safe: a mitre between two DIFFERENT offsets lands on neither line and
  threw 0.73 mm ears at every cell junction, one of the owner's first CAD
  reports. Measured at the defaults, wall 3, 48 stations, over all 18 cells
  and all stations: the wall is **exactly 3.000 mm** on every face (max
  0.35 um over, which is the polyline's own mitre at a 0.9 deg turn between
  samples), mouth rings on the aperture to 0, throat rings planar in z = 0 to
  0, 36 solids, 12.3 MB. Two figures are NOT the wall and must not be read as
  it: a mitred corner reaches wall/sin(half-angle) — 7.28 mm at the sharpest
  cell corner, 1.03 mm beyond R + wall at the throat rim, which is what a
  mitre IS — and the mouth lip measures 2.74 mm because it is snapped onto
  the curved aperture, the one ring that is not exactly `wall`.
  **THE UNION OF THE BLANKS IS ILL-POSED AND IS NO LONGER OFFERED.** Adjacent
  blanks overlap near both ends (the ducts tile there) and stand apart
  mid-path, so every neighbouring pair passes through EXACT TANGENTIAL
  CONTACT twice: measured, all 27 pairs at the defaults, the column pairs at
  u = 0.056-0.125, the row pairs near u = 0.30, everything again at
  u = 0.970-0.976 — and the default bow moves the row crossings to
  u = 0.28-0.34 and HALVES their rate, which is more degenerate. Near-parallel
  surfaces meeting along a curve is the case a kernel fails on; Parasolid is
  the strongest of them and it fails on this. `shellOverlap` reports where the
  blanks share material (27/27 pairs, 35% of stations, deepest exactly 2·wall
  at the mouth where the ducts tile). Merging the cell shells into one horn is
  a modelling decision to take in CAD on solids whose faces are all exact.
  **TWO CONSTRUCTIONS WERE BUILT, MEASURED AND DELETED. Do not rebuild them
  without reading the paragraph above.**
  (1) `hornBodySections` — ONE body whose skin was a rolling ball over the
  ducts: flow-level-set sheets, per-duct sleeves grown by the wall, a
  morphological closing on a raster distance field, iso-line traced and
  resampled by arc length plus turning. It measured well on every number the
  tool could compute (min 3-D outer wall 2.92 mm plain, 2.74 with the default
  bow, spline within 0.12 mm of the loft, throat and mouth exact) and the
  owner rejected it on sight for surface texture. The numbers were real; they
  simply did not measure the thing that mattered.
  (2) `bandedShell` — blocks where the ducts tile, tubes where they clear
  2·wall + 2 mm, webs between neighbouring tubes, all joins transversal by
  construction. The tubes and the union-safety were right; the BLOCKS carried
  the same texture for the same reason (convex hull), and the webs were not
  what the owner meant by webs (they wanted subtractive slot cutters to open
  the inter-cell gaps, not additive plates). The band arithmetic
  (`shellBands`), the tube construction and the transversal-overlap
  discipline are worth reaching for again IF a merged body is ever wanted;
  the block is not.
- **A SHELL'S FACE ORIENTATION IS ONE DECISION FOR THE SOLID, NOT SIX, and
  the per-face proxy silently produced an invalid body.** The topology fixes
  the senses relative to each other — four walls together, mouth cap with
  them, throat cap opposite (their natural u x v normals both point the same
  axial way, so one always flips) — leaving one free bit. That bit used to be
  measured per face against the ray from a mid-station centroid to the patch
  centre. On a duct that proxy is good. On the HORN BODY it is WRONG: the
  skin flares so hard that mid-path it runs outward faster than forward —
  measured dv = (232, 0, -41) at the side wall, so the surface is nearly
  perpendicular to the axis and its true outward normal is nearly -z while
  the radial ray says +x. Two of the four walls read it backwards, their
  loops were reversed and the others' were not, and the shared vertical edges
  came out used twice in the SAME direction. `brepShellOrientation` now
  integrates the divergence theorem over the whole shell and returns one
  sign, which cannot disagree with itself; the edge-pairing check is what
  caught the old failure and what proves the new one.
- **ANYTHING DERIVED FROM A MOUTH RING BY AN OFFSET LEAVES THE APERTURE
  SURFACE, and it has to be snapped back.** The duct mouth rings lie on the
  biradial aperture to 1e-13 because they are built from its own parameters.
  The shell's are not: `insetSection3` offsets in the ring's own BEST-FIT
  PLANE and keeps each point's off-plane component, so a point moved 3 mm
  sideways keeps the height the original point had, and the aperture is
  curved — measured 1.14 mm off, in eighteen different directions because
  every cell fits its own plane. That was the owner's "the mouth is not
  coplanar" report. `apertureFrame` inverts the surface in CLOSED FORM
  (e = asin(y/rV), then a = asin(x/(rH - rV(1-cos e))), then z follows), so
  snapping moves a point in z alone and lands it exactly; a point outside the
  domain is returned UNCHANGED and flagged, never clamped. Two consequences
  worth keeping: the throat face of the body is polished to the EXACT circle
  R + wall (the mitred offset of a sampled circle is 0.02 mm outside it, and
  per-cell blanks mitring a rim side against a shared side threw a 0.73 mm
  ear at every junction — the owner's second report); and the mouth CAP
  cannot be a Coons blend, because a chord across a curved cap falls behind
  the surface — measured 5.6 mm at the body's mouth. `apertureCapGrid`
  blends in the surface's own (a, e) instead and evaluates, so the cap
  interior lies on the aperture to 6e-14 while reproducing the ring exactly.
  After the boolean, every solid's mouth face is therefore ON one analytic
  surface, which is what makes the mouth read as one continuous face.
- **TWO EXACT IDENTITIES PIN THE BLANK-AND-CUTTER CONSTRUCTION, and both are
  tested as closed forms.** The mitred offset is exactly invertible (out then
  in returns every line, measured 1e-14 at the throat, where the outset
  segments lie ON the offset lines), and a ring translated along its own unit
  vector-area normal spans a prism of exactly |A_vec|·ext whatever caps it, so
  the cutter extension's added volume is ext·(|A_throat|+|A_mouth|) to 1e-9
  relative — and the throat ring's vector-area normal is exactly −z (planar
  ring), so the cutter's throat cap is exactly planar in z = −ext. The
  extension is not optional: without it the blank's cap and the duct's cap are
  two different fills of nearly the same ring (the cap-fill finding below) and
  the subtraction leaves a MEMBRANE over the passage wherever the blank's fill
  lies in front; the default 3 mm clears the ~1 mm sag difference.
  **THE 3-D VIEWPORT NO LONGER DRAWS THE SHELL** (owner's call, 2026-09-02).
  A "horn — shell blanks" option was built alongside the kit and removed one
  session later as adding nothing for a designer: a blank is an INTERMEDIATE
  the CAD boolean consumes, not a form anyone judges a horn by, and its
  outline is the duct's own outline pushed out by one number — so the view
  showed the duct picture again, slightly fatter, and could never show the
  thing that matters (the boolean result, which needs a kernel).
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
- **LU WITH PARTIAL PIVOTING HAS TWO CONVENTIONS AND THEY DO NOT MIX.** Swap
  full rows during factorisation (multiplier columns included) and you must
  apply the whole permutation to the right-hand side BEFORE substitution;
  swap only columns >= k and you must interleave swap-and-update. Mixing
  them (full-row swaps + interleaved solve) corrupts the solve whenever a
  later pivot moves a row whose multiplier was already used — measured 6.0
  absolute error on a random 11x11, and 105 mm of surface residual before
  the fix. The residual check caught it; a fixed-tolerance "looks close"
  check would not have, because small systems often pivot trivially.
- **THE COPED-JOINT BULGE IS BUILT, and the union identity held to 4e-16.**
  `bulge: { amp }` bows every INTERIOR mouth-cell edge into its neighbour
  with a sine lobe in (u,v) space — zero at the corners, mm converted per
  edge through the measured local metric, clamped to 0.45 of a cell pitch —
  and the swept loft carries it down the whole path, so ducts overlap
  toward the mouth and meet at knife edges. Measured at 6x3, 90x40, depth
  320, amp 5: `mouthAreaTotal` (the union, summed from unbulged shares)
  invariant to 4.4e-16 relative; the per-cell sum double-counts 11.28%; the
  interior-cell excess matches the (2/pi)·a·E sine-lobe closed form to 4%;
  corners and throat ring at exactly 0; both mirrors at 8e-11 mm2. fc rises
  2.19% against the beta/(2 ln rho) estimate's 2.27% — the law lands on the
  bulged outline (fc re-derives through the closed-form solver to 1e-9 once
  the throat open area is measured on the RING, not taken from the layout's
  2-D bookkeeping — the two differ at discretisation level). Flow mode
  ignores the bulge entirely: a shared boundary point cannot take two
  targets. STL stays manifold and STEP valid, because the corners survive.
- **OVERLAP INSIDE A JOINT RUN IS ENGAGEMENT, NOT A DEFECT, and the split
  is computed, not assumed.** `ductClearance(rows, { jointAware })` walks
  each pair back from the mouth: the maximal contiguous contact run ending
  at the mouth is that pair's JOINT; its first station is the knife edge;
  everything else stays defect. Without a bulge the run degenerates to the
  mouth station alone and every statistic reduces EXACTLY to the old form
  (verified to 1e-12). Measured at amp 5: all 27 pairs engaged, knife at
  stations 30-31 of 32, 10 mm of engagement — while the defect overlap
  reads 2.06 mm against 2.03 unbulged, i.e. the pre-existing swept-mode
  interpenetration is still reported and the joint is not. The RAW overlap
  would have read 4.75 mm and pointed at the wrong station. `thinBand`
  rides in the same pass: a defect gap in (0, band) is a wall sliver too
  thin to print — 17 pair-stations under 1 mm at the 320-depth defaults.
- **THE DEFECT METRIC HAS A MEASURED MOUTH BOUNDARY AND NO THROAT ONE, and
  at the 2026-09-01 defaults that is what the separation solve is actually
  chasing.** `ductClearance` excludes only station 0 and the last station
  outright; on the mouth side `jointAware` additionally walks back the
  contiguous contact run and calls it engagement, so the mouth knife edge is
  COMPUTED per pair. There is no mirror of that at the throat, where the
  cells also tile by construction. Measured at 6x3, 90x0, 560x250, depth
  300, T 0.7, no bow, no separation — defect gap by station:
    u      0.000  0.042  0.083  0.167  0.250  0.500  0.750  0.958  1.000
    gap    (end)  -0.002 +0.046 +1.768 +3.828 13.647 21.518 +9.249 (end)
  End rings measure -4.4e-12 and -3.2e-14 mm, i.e. exact tiling. So
  `minMid` is -0.002 mm AT STATION 1 — the throat knife edge bleeding one
  station in at 24 stations, not a defect — and a 0.5 mm floor therefore
  fires on it. Both modes then move material to "fix" it: uniform reaches
  +0.556 mm but costs dL 25.52 -> 22.49, nudge reaches +0.455 for dL 25.52
  -> 25.47. **Excluding station 1 would not by itself settle it** — station
  2 reads +0.046 mm, still under any usable floor, because the ducts have
  not had path length to open yet. The boundary wanted is "where the ducts
  have separated", not a fixed station count.
- **THE THROAT BOUNDARY IS THE GAP HAVING TO BE OPENING (`throatFloor`).**
  A pair's THROAT RUN is the contiguous run from station 0 over which the
  gap is still BELOW the floor AND has not decreased from the station
  before it. Either failure ends it: reaching the floor means the pair has
  separated and ordinary defect scoring takes over; CLOSING again means the
  ducts are moving back toward each other, which is a defect at any
  magnitude and at any station, and the station that closed is scored as
  one. Near the throat this asks for NO absolute clearance at all — only
  that the wall never gets thinner than it already is — which is the
  weakest requirement that still refuses to call closing ducts a joint.
  **IT REPLACED A SYMMETRIC (-floor, +floor) BAND, and the band was too weak
  in exactly the place it mattered** (owner's proposal, 2026-09-03). A gap
  that dived to -0.49 mm and recovered sat inside a 0.5 mm band and was
  filed as knife edge, so it never reached `minMid` — the number the
  separation solver optimises. Measured at the 2026-09-02 defaults, 48
  stations: the band reported minMid +0.510 mm while an independent
  point-in-solid test on the same outlines found 0.258 mm of real
  interpenetration at u = 0.021.
  **THE FLOOR NO LONGER DECIDES WHETHER A DIVE IS FORGIVEN, only how far the
  knife-edge run reaches**, and that is the behavioural change to know.
  Under the band, raising the floor widened it and hid more; under the
  monotone rule the defect reads the SAME at every floor the UI can ask
  for — measured -0.0015 mm at floors 0.1 / 0.5 / 1 / 2 / 5 while the knife
  reach grows 1 -> 6 stations.
  **THE TOLERANCE IS FLOAT NOISE (1e-6 mm), NOT A PHYSICAL SLACK, and that
  is a measurement rather than a taste**: over the sub-floor stretch the
  worst backward step on a geometry that is genuinely opening is EXACTLY
  0.0000 mm at both 24 and 48 stations, across T = 0, 0.3, 0.7, 1.0 and the
  dL-optimal depth. Every backward step observed anywhere was the station-1
  dive itself. Do not soften it into a fraction of the floor; there is
  nothing measured to justify one.
  It still does its ORIGINAL job wherever the pair really is just opening
  from the tiling: at T 0.3 it lifts minMid 0.3231 -> 0.6229 mm over 6 of 27
  pairs and reports `throat.dip === null`. `throat.dip` / `dipAt` report the
  backward step that ended a run, so the closing is named rather than merely
  scored, and the UI carries a warning keyed on it (with the two generic
  clearance warnings gated off when the dip is what they are both seeing —
  otherwise one fact arrived three times).
  **SATURATION IS NOW STRUCTURALLY HARD TO REACH**, because the cells tile at
  the MOUTH too, so every pair closes again somewhere and the run terminates
  on its own. The cap (one station short of the joint) is still what
  guarantees it and still fires at coarse resolutions — 19 of 27 pairs at 4
  stations with a 40 mm floor — and the invariant that matters (a floor the
  horn never reaches must never pass vacuously) is asserted at both.
  **THE "WOBBLE" IS NOT A WOBBLE — IT IS REAL INTERPENETRATION THAT 24
  STATIONS CANNOT SEE, and this bullet said otherwise for two sessions.**
  The station-dependent readings (-0.002 / -0.122 / -0.241 / -0.122 mm at
  24 / 32 / 48 / 64) were read as sampled noise about zero. They are not.
  The gap has a SHARP MINIMUM near u = 0.021, and a station grid finds it
  only if a station lands there: 48, 96 and 192 stations all contain
  u = 1/48 and all read exactly -0.2422 mm; 64 straddles it (1/64 = 0.0156,
  2/64 = 0.0313) and reads -0.125; 24 (u = 0, 0.042, ...) misses it entirely
  and reads -0.002. So it is a RESOLUTION failure, not noise, and the live
  UI at 24 stations under-reports it by about 100x.
  Confirmed against an INDEPENDENT test — point-in-closed-mesh by jittered
  ray casting on the triangles the STL writes, with a closed-form
  point-triangle distance, both unit-tested against a cube — which finds
  0.2577 mm of penetration on the same gross outlines at 48 stations, and
  `ductClearance` with its ring stride set to 1 returns -0.2577. The two
  agree to four decimals, which is a mutual check rather than a tautology:
  one measures ring-to-ring at a station, the other a point against the
  lofted solid.
  Refining the RING moves it the same way and less: 32 / 64 / 128 / 192
  points round the outline read -0.211 / -0.242 / -0.258 / -0.263, so the
  hardcoded `nMs = 16` (64 points) and `signedGap`'s `k += 2` stride cost
  about 0.03 mm between them. **Stations are the binding resolution, 48 is
  enough, and the ring is not the problem.** Cost of the move, measured:
  map + clearance 235 ms at 24 stations against 353 ms at 48.
  Two guards, both tested. The run is capped two stations short of the joint
  so the defect set can never be EMPTY — a floor of 40 mm on this horn would
  otherwise return minMid = Infinity and read as "clear"; it now reports the
  best gap it has (9.25 mm) with `throat.saturated` at 27/27 pairs, and the
  UI warns. And `throat.worst` reports the deepest contact found INSIDE the
  run, exactly as `joint.engageMax` does at the mouth, so the classification
  can never hide a magnitude. `throatFloor: 0` is the default and reproduces
  the boundary-less form to the last bit, every statistic and the whole
  per-station profile — asserted, because every other clearance test in the
  suite is written against that form.
- **`ductClearance` MEASURES THE GROSS OUTLINES; THE EXPORT CARRIES THE
  INSET ONES, so the reported gap is NOT the printed wall.** It reads
  `row.sched[q].pts`, while `ductSections` — what the STL and STEP write —
  insets each shared side by (t/2)(1-s). Two neighbours therefore have
  0.4(1-s) mm MORE room in the exported solid than the metric says, which
  near the throat is the whole story. Measured on the 2026-09-02 default
  horn at 48 stations: the gross outlines interpenetrate 0.242 mm at
  u = 0.021, and the inset outlines DO NOT interpenetrate at all — the
  independent point-in-solid test on the exported mesh finds nothing. What
  they leave instead is a 0.123 mm WALL SLIVER there, and the tool reports
  +0.568 mm. So the number on screen is wrong in two directions that partly
  cancel: gross understates the wall by the inset, and the throat rule hides
  the dip. Neither the sign nor the magnitude of "min gap" can be quoted as
  a printable wall thickness today.
- **THE SEPARATION SOLVER IS A CONTACT-CHAIN ITERATION, because pairwise
  pushes diffuse and one shared knob is non-monotone.** Three measured
  facts drove the design. (1) Uniform radial spread improves the worst gap
  only to about -1.5 mm at ~2 mm of amplitude and then WORSENS it —
  monotonically to -7.4 mm at 40 — because near the throat the ducts almost
  tile: past a point every duct is pushed into its other neighbours and the
  bent paths tilt sections into new contacts. So "uniform" is a SCAN for
  the best single amplitude, and it says when that knob cannot fix the
  geometry. (2) Naive per-pair half-deficit pushes oscillate between -5 and
  -1.3 mm and stall near -0.6 after 16 rounds: a whole row is over-packed,
  every push steals the next pair's room, and the iteration diffuses like
  Jacobi. (3) The chain has an exact answer: walk each row/column, sum the
  deficits, displace each cell by the mean-centred cumulative — ends move
  out, middle barely moves, every pair opens by its deficit. Chain-resolved
  `solveSeparation` mode "nudge" took the recorded 6x3/90x40/d320/T0.7
  interpenetration from -1.92 mm to +0.16 mm in 15 rounds (~5 s at 24
  stations) with dL PRESERVED (2.13 -> 2.06), mirrors at 3e-11, ends
  pinned at 5e-14, and lengthening re-equalising on top to dL 0.006. It
  returns the BEST state visited, not the last — the iteration flip-flops
  at the threshold — **and for two sessions it did NOT, in the one case that
  matters most.** `best` starts at the UNSEPARATED gap with a null field,
  and the restore was guarded on that field being non-null, so when no
  iterate ever beat doing nothing the function fell through and handed back
  the LAST iterate — the one the contact chain had just driven furthest into
  trouble. The UI applies whatever field comes back, so a failed solve made
  the horn WORSE: measured on the tool's own default geometry with the
  default lengthening (throat fifth, 1 lobe), nudge took the worst gap from
  -5.10 mm to -6.80 mm while reporting `ok: false`. Fixed — a solver that
  cannot improve on its input returns its input — and `gapAfter >=
  gapBefore` is now asserted for BOTH modes on that exact case, together
  with an independent rebuild of the returned field. Annealing the
  relaxation was tried and REMOVED
  (0.85/iter decays too fast; measured +0.29 un-annealed against +0.04).
  Higher floors saturate honestly: floor 1.0 reaches +0.73 at the 40 mm
  amplitude cap with dL 10.6 — the throat region genuinely runs out of
  room, and the report says so instead of pretending.
- **THE THROAT-FIFTH BOW BREAKS THROUGH AT THE DEFAULT DEPTH AND NOT AT THE
  dL-SOLVED ONE, and the depth is the whole difference.** An earlier version
  of this bullet said the throat fifth was unmanufacturable full stop; that
  was measured at depth 300 only and the owner was right to doubt it. Depth
  300 is the tool's DEFAULT, not the dL optimum, so it leaves dL 24.08 mm to
  correct and the bow has to be enormous. `solveDepthForMinDL` puts this
  mouth at 357.2 mm for dL 10.82, and there the same bow is less than half
  the correction. Measured, EXPORTED (inset) outlines, throat fifth / 1 lobe
  / radial:
    depth  dL before  bow amp   worst gap   merged stations
    300    24.08 mm   28.3 mm   -4.78 mm    6 of 47
    340    12.97      20.8      -3.21       5
    350    10.99      20.1      -2.38       3
    357    10.82      20.1      +0.29       0
    370    12.67      21.9      +0.24       0
  The independent point-in-solid test agrees at both ends: 4.437 mm of real
  interpenetration at depth 300, NONE anywhere at 357.
  **It is not amplitude alone** — depth 370 carries a BIGGER bow (21.9 mm)
  and stays clear — so do not read this as an amplitude budget. And the
  crossing is NOT a clean threshold: sampled at 2 mm steps the gap reads
  -0.47 / +0.29 / -0.24 / +0.19 mm at depth 356 / 357 / 358 / 360, i.e. it
  hovers about zero and flips sign. Near the optimum the honest statement is
  that the interpenetration collapses from ~4.8 mm to a few TENTHS of a
  millimetre, at which scale the resolution limits recorded above (24
  stations under-reads a sharp near-throat dip) are the same size as the
  answer.
  What survives from the original bullet: the gap profile IS negative or
  near zero until about u = 0.31 and only peaks near u = 0.78, so the throat
  fifth is still the tightest place to put a bow, and at depth 300 neither
  separation mode can fix what it does — uniform reaches -2.39 mm at 30.8 mm
  of spread, nudge cannot improve on the input at all, and both report
  `ok: false`. The lesson is the one already recorded for `solveBow`: SOLVE
  THE DEPTH FIRST and the bow becomes a small correction rather than a
  fight. Stage 5's own hint says exactly that, and this is the measurement
  behind it.
- **A 1x1 grid used to crash the equal-area solve.** Zero constraints took
  the trivial-return path through `finish()` before `let it` was initialised
  — a temporal dead zone, not physics. Fixed; the 1x1 straight cell is now
  itself a regression test and the closed-form testbed above.

- **H-grid f₁ is set by rows, not columns.** The binding cell's long dimension
  runs in the row direction, so adding columns only narrows every cell — raising
  its aspect ratio — while f₁_min barely moves. 6×3 and 8×3 land within a few
  percent of each other despite a third more cells; 6×3 → 6×4 → 6×5 goes
  14.9 → 20.0 → 24.6 kHz. The build spec's hand estimates said the opposite and
  flagged themselves as order-of-magnitude only; they are wrong in direction.
- **The equal-arc corner angle is rarely the best one.** For 8×3 it is 24.5°
  and the optimum is near 37.5°. Treat it as the seed it is.
- **An equal-area H-grid does not beat a comparable O-grid on f₁_min.** 6×3 at
  ~14.9 kHz against 1+6+12 at 22.4 kHz. The H-grid earns its place through the
  mouth mapping, not through the throat number.
- **The line-parameter solve needs the request walked up to it.** A cold
  Gauss-Newton step from an ambitious slider setting drives straight into the
  non-crossing boundary and jams, so `solveEqualArea` falls back to approaching
  the request from the nominal grid in steps. Before that fallback existed, m=2
  reported a bow of 0.25 infeasible while m=1 solved it — more shape freedom
  failing where less succeeded, which is always the solver and never the
  geometry. If a layout ever comes back infeasible, check that first.
- **The H-grid solve is deferred, so the inputs run ahead of the layout.**
  `buildLayout` is too slow to sit in the render pass — nothing could paint,
  not even a "solving" mark — so it runs in a timeout and the previous layout
  stays on screen meanwhile. Everything downstream of `throat` therefore has to
  read `shown` (the input the layout on screen was built FROM), never the live
  state. Reading live `nc` handed the mouth mapping 18 throat cells and a
  5-column grid to place them in, and the render died on the sixth column's
  undefined corners — a blank page, not a glitch. Only *shrinking* the grid
  crashes; growing it silently mismatches instead, which is worse.
- **Sections are FLOWED per boundary point, and that is what makes them tile.**
  A point's trajectory depends only on where that point starts in the throat
  plane and where it lands on the aperture — never on which cell owns it. Since
  neighbours share their boundary points exactly, they share the whole boundary
  at every station: measured worst mismatch 6.6e-10 mm over all pairs and all
  stations, and the wall between two inset ducts comes out at exactly t x taper
  with min = mean = max across every pair. Do not go back to blending each
  cell's outline in its own transported frame. That is what it did before, and
  eighteen independent constructions with nothing coupling them drifted through
  each other 2.8-5.8 mm deep, about a fifth of every section's boundary points
  inside the neighbour, from station 1 onward — invisible on screen, fatal to
  any solid export, and it made the area schedule up to ~30% optimistic because
  it summed cross-sections sharing the same space.
- **PHASE D IS BUILT, and the interpenetration it admits is DELIBERATE.** Read
  this before "fixing" it. `sectionMode: "swept"` builds each cell's sections
  independently in planes specified along its own centreline; `"flow"` is the
  original shared-boundary construction and remains the DEFAULT. The invariant
  *"neighbours share their whole boundary at every station"* still holds and is
  still tested — in flow mode, where it measures 6.6e-10 mm. Swept mode gives
  it up ON PURPOSE, and what replaced it is a pair of narrower tests: the two
  END rings are still shared exactly (3e-15 mm at the throat, 2.6e-14 at the
  mouth), and the interior is bounded by the SIGNED clearance rather than
  asserted to be zero. This is NOT the 2.8-5.8 mm bug from two sessions ago
  returning. That failure was fatal because it was invisible and unfixable;
  both halves have changed. Phase A measures the depth, and the profile already
  moves sections inward — 14.24 mm of overlap with no law falls to 1.03 mm at
  T = 0.3, arc 90x60.
  **`k <= 1` NO LONGER PROVES NON-OVERLAP in swept mode, and this is the trap.**
  k is an area ratio the profile computes against the tiling configuration; it
  knows nothing about where a swept section actually sits. Measured: kMax reads
  exactly 1.00000 — "cannot overlap" — while the geometry measures 0.359 mm
  (rect) and 1.034 mm (arc) of real penetration. The shrink argument holds only
  for flowed sections. Read `clearance.overlap`, never k, in swept mode.
  Two obstacles named in the plan are both addressed. The section plane is
  SPECIFIED, not inherited from the tangent — blended z-hat -> tangent ->
  aperture normal on a quadratic Bernstein basis — so station 0 is the throat
  polygon in the throat plane to 4e-15 mm and the 6.85 deg / +-0.5 mm mating
  face bug cannot recur. And the twist is IMPOSED and distributed, not merely
  measured: the residual roll is computed at both ends and interpolated on a
  smoothstep, 31.5 deg (rect) and 37.0 deg (arc) of roll applied, landing the
  section axis on the mouth's own +x to 8e-15 deg. End-ring exactness cannot
  show that the roll landed — the rings are rebuilt from their own local
  coordinates and come out exact whatever the frame did — so the residual after
  the roll is reported separately as `sweptAimMax` and that is what the test
  reads.
  What is NOT done is resolving the overlap. The profile is the only lever on
  it today; centreline manipulation is the stronger one and is the next build.
- **AXIAL DEPTH IS THE DOMINANT dL LEVER, and the optimum is closed form.**
  This supersedes the note below, which was measured on the old apex-sphere
  mouth. On the BIRADIAL mouth the path-length ordering DOES flip with depth —
  centre shortest when shallow, rim shortest when deep — so there is a depth in
  between where every cell is equidistant. Measured at 90x40 deg, 600 mm
  horizontal arc: dL falls 118 -> 81 -> 31 -> **2.04 mm at depth 425**, i.e.
  from 54x the lambda/8 budget to 0.95x, with NO path manipulation at all.
  The mechanism is simple: when the mouth's curvature centre lands on the
  throat, the mouth IS a sphere about the throat and every point on it is the
  same distance away. So the seed is **depth ~ 1.09 x mean(rH, rV)**, the 1.09
  because paths curve and so run slightly longer than the chord (measured
  factor 1.00-1.14 across geometries). A short 1-D search refines it.
  It generalises: dL at the optimum measured 1.3-3.2 mm across 90x40, 90x25,
  120x40, 60x40 and arcs from 480 to 700 mm, against 38-121 mm at depth 200.
  **It is completely independent of T** — best depth 425 and dL 2.04 at
  T = 0, 0.35, 0.7 and 1.0 alike — so it is purely geometric and can be solved
  once, before any loading decision.
  **The aspect ratio is NOT free under it.** Both radii have to land together,
  so dL is lowest near arcH/arcV ~ Th_h/Th_v and rises steeply away: at 90x40,
  2.4 mm at matched radii, 9.2 mm at aspect 1.4; worst cases 16-18 mm. The
  minimum is broad, so near enough is enough, but it is a real constraint on
  any scheme that wants aspect ratio as a free input.
  Room to snake SURVIVES the optimum (widest half-gap 9.2-12.1 mm at depth
  425), and dL there is small enough that a single half-wave would cover it.
  Swept-mode interpenetration is NOT fixed by this and stays independent:
  0 mm at T=0, 0.98 at T=0.35, 1.97 at T=0.7.
- **Enforcing the law by making mouth area an OUTPUT over-determines the
  geometry — pick two of three.** The proposal was: coverage angles stay
  inputs, mouth AREA comes from the Hypex law, only aspect ratio is user-set.
  It cannot also have depth free for dL, because the dL optimum ties depth to
  the mouth radius while the law ties mouth area to path length (hence depth).
  Together they pin everything and fc falls out. So the choosable set is any
  TWO of {fc, mouth size, dL-optimal depth}.
  The clean formulation that results: inputs are Th_h, Th_v, aspect ratio and
  ONE of {mouth size, fc}; depth is derived from the dL optimum; the other of
  {size, fc} is derived from the law. Measured design curve at 90x40, T 0.7,
  MATCHED radii (arcV = arcH x Th_v/Th_h, the dL-optimal aspect), depth found
  by golden section on dL — mouth size alone sets the cutoff:
    arcH  200 300 400 500 600 700 900 1100 mm
    fc    818 604 487 412 360 320 265  227 Hz
    dL    1.7 1.9 2.1 2.2 2.4 2.6 2.9  3.3 mm
  (An earlier table here read 665..239 Hz at aspect 2.14 with a coarser depth
  search. Same curve, different aspect rule; these are the matched-radii
  numbers and they supersede it.)
  fc has a CEILING under this rule, and it is a real turning point rather than
  an asymptote. Shrinking the mouth shortens the horn, which raises fc — but
  the dL rule ties depth to the mouth radius, so the throat-to-mouth area
  RATIO shrinks with it, and below a certain size the collapsing ratio takes
  more flare rate away than the shortening puts back. Measured at 90x40,
  matched radii, T 0.7:
    arcH   60   65   70   75   80   85   90   95  100  120 mm
    ratio 1.32 1.43 1.54 1.65 1.76 1.87 1.98 2.09 2.20 2.64
    fc     309 1218 1321 1390 1434 1462 1429 1378 1329 1202 Hz
  so the peak is ~1462 Hz near arcH 85, where the ratio is ~1.87. Below about
  arcH 45 the ratio passes 1 and there is no expansion left at all.
  A peak MUST exist, and the exponential case says why in closed form. Scale
  the whole horn by a factor: the mouth radius scales, so the radius ratio rho
  scales with it, and the dL rule scales the length L with it too. For T = 1,
  rho = exp(mL), so m = ln(rho)/L — a logarithm over a linear term. It rises,
  turns over and falls, with the turning point at rho = e for exactly
  proportional scaling. Measured it lands at rho ~ 2.2 rather than 2.718,
  because L is not quite proportional to the mouth radius. Lower T needs more
  m for the same ratio, so the peak moves to a smaller mouth and a higher
  cutoff: measured 1087 Hz at rho 2.20 (T=1), 1273 Hz at rho 2.20 (T=0.7),
  2076 Hz at rho 1.76 (T=0).
  **Do not quote the ceiling to three figures.** The dL-optimal depth search is
  shallow and slack at small mouths, and two golden-section brackets that
  agree everywhere else give 1462 Hz at arcH 85 and 1273 Hz at arcH 100 for the
  same T. The peak's location also moves with coverage and with the aspect
  rule. Treat ~1.3-1.5 kHz as the ORDER of the ceiling at 90x40 and T = 0.7.
  One tension dissolves at the optimum and is worth knowing: with a shared fc
  the law wants cells with LONGER paths to have LARGER mouth areas, which
  fights the equal-area subdivision. When path lengths are equalised the two
  agree exactly, so equalising dL is also what makes equal-area cells and
  equal-fc cells the same design.
- **The fc SPREAD is what equal-area subdivision costs, and depth pays it
  off.** The mouth is cut into 18 EQUAL-AREA cells, so each cell solves its
  own m to land on that area over its own path length, and cells with
  different path lengths end up with different cutoffs. The alternative rule —
  one shared m for the whole horn, mouth areas left to differ — buys a single
  cutoff at the price of unequal output per cell. The two rules are not a
  standing choice, because the spread closes with dL: measured at 90x40,
  matched radii, T 0.7,
    depth 200:  dL 81.3 mm   fc 539-753 Hz   spread 39.8%
    depth 300:  dL 31.4 mm   fc 462-510 Hz   spread 10.4%
    depth 425:  dL  2.0 mm   fc 361-363 Hz   spread  0.5%
  At the dL optimum the equal-area horn IS the equal-fc horn to within half a
  percent, so there is nothing left to trade and no reason to build the
  law-determined subdivision as a second mode. Away from the optimum it is
  worth reporting the spread rather than quoting one fc.
- **A vertically flat mouth puts the whole deficit in ONE ROW, which is what
  makes snaking tractable.** With Th_v = 0 the mouth is a horizontal-only arc,
  so the middle row sits closest to the throat and needs the length back.
  Measured at 6x3, 90 deg horizontal, per-cell shortfall against the longest
  cell, in mm:
    Th_v 40 (curved)  dL 2.0 mm    row 0:  1.6 1.6 2.0 2.0 1.6 1.6
                                   row 1:  1.5 0.0 0.0 0.0 0.0 1.5
                                   row 2:  1.6 1.6 2.0 2.0 1.6 1.6
    Th_v  0 (FLAT)    dL 13.0 mm   row 0:  0.0 0.3 1.0 1.0 0.3 0.0
                                   row 1: 13.0 11.5 11.5 11.5 11.5 13.0
                                   row 2:  0.0 0.3 1.0 1.0 0.3 0.0
  The flat case costs 6.5x the dL, but it asks for it as a nearly CONSTANT
  11.5 mm along the middle row — 4 of the 6 identical, the two rim cells 1.5 mm
  more. A single snake profile tessellated across the row would cover it,
  which is a far smaller build than a general per-cell equaliser. The curved
  case, by contrast, spreads its (much smaller) deficit over the outer ring.
  **THAT ONE-ROW STRUCTURE IS A PROPERTY OF THE dL OPTIMUM, NOT OF THE FLAT
  MOUTH**, and it is worth knowing before counting on the tessellated-snake
  build. Re-measured at 6x3, Th_h 90, Th_v 0, arcH 560, arcV 250 — the
  tool's defaults from 2026-09-01 — the deficit is one row ONLY at that
  mouth's own optimum:
    depth 360.8 (its dL optimum, dL 11.1 mm)  row 1: 11.1 9.5 9.3 9.3 9.5 11.1
                                              rows 0,2: 0.0 0.0 0.3 0.3 0.0 0.0
    depth 300 (the default, dL 25.5 mm)       row 1: 12.8 20.7 25.5 25.5 20.7 12.8
                                              rows 0,2: 0.0 9.5 14.9 14.9 9.5 0.0
  Away from the optimum the horizontal ordering has not yet collapsed, so
  the deficit is 2-D and every cell but the four corners needs some: a
  single row-wise profile would not cover it. Same lesson as the fc spread —
  solve the depth first and the correction problem gets structurally
  simpler, not merely smaller.
- **Path length on the APEX-SPHERE mouth: the centre cell is always shortest.**
  SUPERSEDED for the biradial mouth by the note above — on that surface the
  ordering does flip with depth. Kept because it is still true of the legacy
  apex-based modes. It was worth checking whether depth could flip the ordering
  so rim cells became the ones needing correction — it cannot. On a cap centred
  at the apex every mouth point is at radius r from it, so the distance from
  the throat to a point at angle th, sqrt(apex^2 + r^2 - 2 apex r cos th), is
  minimised at th = 0 for any r. Measured: centre minus corner stays negative
  at every depth 40-700 mm and every apex 60-300 mm (-66, -55, -51, -55, -67 at
  apex 120). So path-length correction is ALWAYS centre-cell lengthening, never
  rim, which is a narrower problem than a general equaliser — and it needs room
  exactly where there is least, since the interior cells are boxed in on four
  sides. Measured at arc 90x60: cells 3,2 and 4,2 need 52.1 mm and have 0.350
  mm of gap; the corner cells need 0.0 mm and have 0.614 mm, monotonically
  inverse across all 18.
  dL IS convex in depth with an interior minimum near 1.7-1.9x apex, so the
  optimisation intuition is real, but it is weak: 16% at apex 120, 3% at apex
  60 and 200. The dominant term is horn SIZE, and at 90 deg coverage the trade
  is unforgiving — a 500 Hz horn needs a ~650 mm mouth and lands at dL = 53.5
  mm against a lambda/8 budget of 2.14 mm at 20 kHz, i.e. 25x over. Narrowing
  the vertical coverage barely helps (18.1 -> 16.2 mm going 60 to 25 deg). So
  dL cannot be brought into budget by depth, apex or coverage at 90 deg, and
  some centre-cell lengthening mechanism is required rather than optional.
- **`sched[].origin` is the CENTRELINE point, not the section's centre, in
  BOTH construction modes.** They drift 0.775 mm in rect and 4.466 mm in arc,
  because the mean of the flowed boundary points is not the flow of the mean,
  and because the mouth grid's parametric cell centre is not its polygon
  centroid. It was predicted that swept sections would remove this by
  construction; they do NOT — measured identical in both modes, since the
  offset comes from the mouth grid rather than the loft. `sched[].centroid`
  (with `zc` / `sc` as its position axis) is the section's own centre, and the
  SigmaA CSV is now plotted against it, so each summed area is attributed to
  the position of the sections that produced it. `origin` is kept because it
  is the centreline point and `ductSections` passes it through; exported
  SOLIDS never depended on it, since the inset works on the polygon itself.
- **The volume identity is `INT A_vec . dr` and all three parts matter.** The
  VECTOR area, the SECTION CENTROID displacement, and the trapezoid rule. Get
  the first two right and the residual is pure quadrature and falls as O(h^2):
  measured 0.333 -> 0.085% (rect), 0.711 -> 0.176% (arc), 0.725 -> 0.208%
  (arc swept) doubling 16 to 32 stations, i.e. 3.5-4.1x each. Get either wrong
  and it hits a geometric floor no refinement clears — the old form, scalar
  area x tangent obliquity x CENTRELINE step, goes 2.298 -> 1.699%, only 1.4x
  for a 2x refinement. **Test the convergence RATE, not a fixed tolerance**: a
  1% bound at 16 stations passed the stalling form for three sessions. Note
  `axial` is still the right scalar to REPORT — it is the flux-carrying
  cross-section — it is just not what to multiply by a step length, because it
  projects on the tangent while the volume advances along the centroid step.
- **A flowed section is not planar, and its area is not its cross-section.** It
  is a level set of the flow, not a cut square to the path, so it runs oblique
  — up to 14.5% at 6x3. `sched[].area` is the section's own area; `axial` is its
  projection on the direction of travel. **`axial` is the one that integrates
  to the duct volume and the one a 1-D horn schedule means**, and it is what
  the SigmaA CSV's `flux_area` column and equivalent diameter now use. Testing
  a volume against `area` instead of `axial` fails by ~5%, which is the
  obliquity, not an error.
- **Station 0 needs no special case now, but it used to.** Under the flow the
  section at s = 0 IS the throat outline in the throat plane, so the driver
  mating face is flat by construction. Before the flow, every station was cut
  perpendicular to its own centreline, and at the throat that already points
  down the exit cone: station 0 came out tilted by up to 6.85 deg, straddling
  z = +-0.5 mm, with no common face across the eighteen ducts to seat on.
- **Per-cell path manipulation is IMPOSSIBLE in flow mode, and that is what
  swept sections unlocked.** Under the flow every boundary point runs its own
  trajectory from its throat position to its mouth position, and neighbours
  SHARE those points exactly — that is what makes the ducts tile. A shared
  point cannot follow cell A's lengthened path and cell B's unlengthened one at
  the same time, so per-cell path length is not merely unimplemented, it is
  structurally unavailable. In swept mode each cell's sections are built around
  its own centreline, so moving that centreline moves only that cell. Phase D
  therefore did not build centre-cell lengthening; it removed the blocker. The
  price is the interpenetration swept mode admits, which is why the signed
  clearance had to land before it and not after.
- **Radial launch EXPANDS cells; it does not separate them. Those are two
  different mechanisms and the tool currently only has the first.**
  `buildTrajectory`'s straight run moves each boundary point along `dirA`, the
  ray from the virtual apex through that point, so the cell grows as a pure
  radial fan: measured cell 3,2 goes 56.20 -> 84.14 mm2 over 28.2 mm of
  straight run, against a closed-form fan prediction of
  ((126.3+28.2)/126.3)^2 = 1.4965 versus 1.497 measured. But a divider-shared
  point is identical for both neighbours, so it gets the identical ray from
  either cell's call and the shared wall stays exactly shared — mismatch
  ~7e-10 mm at every divergeLen from 0 to 30 mm. **The cells expand INTO
  contact, not apart.**
  Gaps between ducts — what a conventional multicell has, and what gives
  snaking room for independent path lengths — need a separate DETACHMENT
  mechanism. The only thing currently holding two ducts apart is the t/2
  divider inset, and it runs the wrong way for that purpose: it tapers to
  ZERO at dividerEndFrac (measured gap 0.40 -> 0.26 -> 0.11 -> 0.00, then
  0.00 to the mouth), so past the divider region the tool MERGES ducts rather
  than separating them. A clearance metric between neighbouring ducts is
  therefore wanted — just keyed to the detachment/gap parameter and the snake
  amplitude, never to divergeLen, which cannot move it.
- **The expansion profile and the gaps between ducts are ONE mechanism.**
  Adjacent centrelines fan apart roughly LINEARLY (a radial fan from the
  virtual apex) while a Hypex profile grows CONVEXLY, and both are pinned equal
  at the two ends because the cells tile the disc at the throat and tile the
  rectangle at the mouth. A convex curve pinned to a straight line at two
  points lies below it in between, and that dip is the gap. Measured at 6x3:
  widest duct gap 7.99 mm at T=0, 5.46 mm at T=0.7, 4.72 mm at T=1 — so **T
  sets the loading characteristic and the duct separation with one number**,
  but only up to the crossing described in the next note.
  The tool had no gaps before the profile existed for exactly this reason: its
  emergent schedule had sqrt(A) linear in x to R^2 = 0.9915, and a straight
  line pinned to a straight line has no dip. Do not build "gaps" as a separate
  feature with its own parameter.
- **The WIDEST duct gap is the one number that cannot see the failure; read
  the narrowest.** Those 7.99 / 5.46 / 4.72 mm figures are maxima over the
  stations, and they keep rising confidently while the ducts are already
  touching somewhere else. At the default 6x3, 200x100, apex 120 the narrowest
  mid-path gap runs 0.535 mm at T=0, 0.294 at T=0.3, 0.103 at T=0.6, and
  **reaches 0 at T = 0.792** — the same T at which kMax crosses 1. Past that
  the top of the slider is not "smaller gaps", it is contact and then
  interpenetration. The crossing is nearly independent of the grid (0.789 at
  8x3, 0.793 at 6x4) and moves a long way with the mouth (T = 0.651 at
  400x200, 0.674 at 300x150): a bigger mouth is a bigger expansion ratio, so
  the profile overshoots the tiling area sooner. Verified in the browser as
  well as in node — at 400x200 the UI puts the crossing between T = 0.65 and
  T = 0.8, against the bisected 0.651.
  Note that `clearance.min` is **structurally** 0 for any profile, because the
  cells tile at both ends by construction, so it can never signal anything;
  `clearance.minMid` excludes exactly those two stations and is the one to
  read. The two detectors are independent — k is an area ratio the profile
  computes, minMid is a sampled point-to-segment distance between 18 real duct
  outlines — and they agree on the boundary, which is a check rather than a
  tautology. Overlap reads as a gap of 0 and never as a negative number, since
  a distance cannot go negative; k is what says how deep the overlap goes.
- **The profile is applied by SCALING the flowed section about its centroid,
  not by rebuilding it in a frame.** Reframing past a detach station is exactly
  the architecture that caused the 2.8-5.8 mm interpenetration. Scaling keeps
  the flowed construction supplying shape, position and orientation, and
  scales the vector area by exactly k^2 even though the section is not planar.
- **`m` is solved, never asked for; `k <= 1` is an exact overlap detector.**
  (fc, T) and the geometry are over-determined — pick both and the profile
  misses the cell's mouth area, leaving an area step at the aperture. Solving m
  so the profile lands on the mouth area at that cell's own path length makes
  k = 1 at BOTH ends, so the throat mating face and the mouth tiling survive
  any T, and fc becomes a readout.
- **Cells do NOT all have the same expansion ratio, and fc does not differ
  through path length alone.** This bullet used to claim they did. A uniform
  x/y mouth lattice projected onto a curved cap stretches the outer cells —
  surface area goes as planar area over cos(tilt) — so the mouth areas are not
  equal even though the throat areas are. Measured at 6x3, t=0, 200x100, apex
  120, depth 150, flatten 1: throat area spread 1.4e-10% (the solve is exact),
  but mouth area 5.71%, solid angle 5.75%, path length 5.10%. On a more curved
  cap it is not a small-parameter curiosity: flatten 0.55 takes mouth area to
  52.6% and solid angle to 70.2%.
  Be careful which ratio is meant. The AREA ratio spreads 5.74%; the RADIUS
  ratio sqrt(A_m/A_t) spreads 2.87%, because the square root halves it, and the
  radius ratio is the one `profRatio` holds and the one `solveHypexM` consumes.
  The DIRECTION of the old claim survives. Freezing one variable at its mean
  decomposes the fc spread: at T=0, 780-811 Hz, full spread 3.93%, path length
  alone 5.07%, area ratio alone 1.34%; at T=1, 540-559 Hz, 3.45% / 5.07% /
  1.89%. Path length dominates by about 3x, and the two terms partially
  CANCEL — an outer cell has both a longer path and a larger ratio, which push
  fc in opposite directions — so the full spread is smaller than path length
  alone would give. Equalising dL is therefore the dominant lever on fc, not
  the only one, and the residual is to be reported as this decomposition
  rather than asserted to be zero.
  This was never a correctness bug: the profile already solves m per cell from
  that cell's own ratio and own L, so unequal ratios are absorbed and show up
  only as spread in fc.
  Scaling by k <= 1 maps a section strictly inside itself, so from a merely
  tiling configuration every cell can only move AWAY from its neighbours and
  overlap is impossible; k > 1 is the only way this construction can push two
  ducts together. It IS reachable (1.094 at 8x3, 400x200 mouth, apex 60, T=1),
  and verified by ray cast: at kMax = 1.00000 mid-path interpenetration is
  exactly 0, at kMax = 1.018 it appears at precisely the stations where k > 1.
  Reported, never clamped — clamping would keep the geometry legal by quietly
  abandoning the expansion law the number exists to deliver.
- **The clearance metric is SIGNED, and that is what replaces the k <= 1
  argument.** An unsigned distance bottoms out at 0 and cannot tell "just
  touching" from "driven 3 mm through": both read 0, because a distance cannot
  go negative. That was survivable only while sections came from one shared
  flow, where k <= 1 PROVED non-overlap and the metric never had to detect what
  the proof already excluded. `clearance.overlap` is now the depth of the worst
  interpenetration, and it was calibrated against that proof while both still
  hold: at 6x3 default, every T up to 0.79 has kMax <= 1 and measures overlap
  EXACTLY 0, and past the crossing it measures 0.004 mm at T=0.80, 0.118 at
  0.90, 0.226 at 1.00. Any construction that builds sections independently
  kills the k argument, so this measurement is the prerequisite for one — build
  it before, not after. Note the sign is taken per SAMPLED POINT, not at the
  nearest one: a point driven deep into a neighbour is FAR from that
  neighbour's boundary, so the minimum unsigned distance is exactly the point
  that says least about penetration.
- **THE MOUTH HAS NO APEX, and that was an architectural correction, not a
  feature.** The aperture is stated by what it must deliver — a horizontal arc
  of Th_h over its own arc length, a vertical arc of Th_v over its own — and
  the two radii are INDEPENDENT (`mouthMode: "biradial"`, `arcH` / `arcV`).
  Th = 0 on an axis makes that axis flat, so a vertically straight-sided mouth
  is just Th_v = 0.
  The apex was never a design input; it was an artifact of building the mouth
  as one spherical cap, and it forced both curvatures to be the same number.
  Worse, it made "equal solid angle at the apex" look like a design criterion.
  It is not one: once each cell's path is independently aimed, the cells can
  deliver whatever wavefront is wanted, so partitioning by angle at a common
  point measures the CONSTRUCTION rather than the horn. What the mouth owes the
  design is its shape and area; what the paths owe it is the wavefront.
  The surface is a swept arc — the vertical arc swept along the horizontal one
  in the plane normal to it:
    V(a,e) = ((rH - rV(1-cos e)) sin a, rV sin e,
              depth - rH(1-cos a) - rV(1-cos e) cos a)
  It reduces EXACTLY to the old sphere-about-apex when rH = rV (verified
  8e-14 mm), so nothing from the arc-mode era is lost. Two properties earn it:
  the parameter tangents are ORTHOGONAL with |dV/da| = rH - rV(1-cos e)
  independent of a, so equal d(azimuth) is exactly equal area horizontally at
  any curvature; and the outward normal is (sin a cos e, sin e, cos a cos e),
  which depends on NEITHER radius — it is simply the direction that angular
  position points, and that is what makes the arrival direction apex-free.
  Ducts now arrive along that normal, so `aimErr` is 0 by construction: the
  aperture IS the arrival target.
  Vertical cuts sit at equal cumulative area, inverted from the CLOSED FORM
  F(sv) = sv(1 - rV/rH) + (rV^2/rH) sin(sv/rV), not quadratured — a 2000-sample
  cumulative left 1.5e-6 mm of error against the sphere it must reproduce
  identically. F reduces to r sin(e) at rH = rV (Lambert) and to sv when either
  radius is infinite (equal d(arc length)).
  `mouthMode` "rect" and "arc" survive in the model as the comparison baselines
  the tests measure against; the tool offers only biradial.
- **Decoupling vertical from horizontal curvature is a CONTINUUM,- **Decoupling vertical from horizontal curvature is a CONTINUUM, and the one
  thing it trades is equal solid angle.** The aperture is an ellipsoid of
  REVOLUTION today — `(x^2+y^2)/A^2 + (z+apex)^2/Cz^2 = 1` with a single A — so
  horizontal and vertical radii are locked identical and `flatten` scales both
  together. A vertically-flat mouth (cylinder: horizontal arc, vertical
  straight) is a legitimate CD-horn geometry and is NOT currently reachable.
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
- **The path has four knobs, not one, and `bendCentroid` is what measures
  them.** A cubic Hermite with both endpoints and both end directions fixed
  has exactly two free scalars — the tangent magnitudes — and one `tight`
  spent both on the same thing. They are now separable, plus a straight run at
  EACH end (`divergeLen` at the throat, `arriveLen` at the mouth), which is the
  same G1 trick twice. `bendCentroid` is the arc-length centroid of curvature
  as a fraction of the path, 0 = all turning at the throat: without it "reduce
  curvature where the area is large" is not a measurable claim. Measured at
  6x3: tightMouth 0.3 -> 0.9 moves it 0.555 -> 0.372 (bend toward the throat,
  which is what you want), tightThroat 0.3 -> 0.9 moves it 0.361 -> 0.625 (the
  opposite lever), arriveLen 0 -> 45 moves it 0.480 -> 0.341. Past about 1.2 a
  tangent overshoots into a loop — tightMouth 1.4 gives 317 degrees of total
  turning. All of it still tiles to ~1.6e-10 mm; these are still flowed
  sections. Do NOT reach for a general 3-D spline: higher order buys shape
  freedom and curvature oscillation in the same purchase, and curvature is the
  thing being controlled.
- **`fc` is an input now, by solving for DEPTH.** `solveDepthForFc` inverts the
  profile: fc and T give m, m gives the length each cell needs, and the axial
  depth is bisected to deliver it. Monotonicity is not obvious — deeper is a
  longer path AND a bigger mouth, which push m opposite ways — but the length
  term wins across the whole usable range (arc 90x60, T=1: fc falls 1203 -> 278
  Hz as depth goes 60 -> 650 mm), so bisection suffices. Round-tripped through
  the FORWARD model, not the solver's own bookkeeping: 4e-7 relative. Cosh
  needs more length than exponential for the same cutoff (380.7 / 323.0 / 280.4
  mm at T = 0 / 0.5 / 1 for 500 Hz). Unreachable targets are REPORTED with the
  bound they hit — 20 Hz floors at 86 Hz, 8000 Hz ceilings at 1819 Hz — never
  clamped and presented as a solution.
- **The expansion law is written on the OPEN passage, and that is a physics
  decision, not bookkeeping.** The wave travels through the open area — the
  cell outline less the half-divider on each shared side — while the gross
  outline includes wall the wave never sees. Keying on gross understates the
  expansion and reports fc low: measured at arc 90x40, ratio 9.012 -> 9.327 at
  t = 0.4 (+3.50%) and 9.162 -> 9.843 at t = 0.8 (+7.43%), with fc following
  733 -> 742 and 738 -> 758 Hz. `profileArea` defaults to `"open"`; `"gross"`
  is kept for comparison.
  The payoff is that the equal-area solve equalises OPEN area to 1e-10, so
  keying the law on it makes the throat reference identical across cells and
  the ratio spread collapses — 2.640% -> 0.122% at t = 0.4, 5.513% -> 0.483%
  at t = 0.8, taking the ratio's share of the fc spread from 1.015% to 0.046%
  and 2.114% to 0.179%. Gross can never do that: a rim cell has fewer dividers,
  so for equal open area it needs LESS gross area, and gross spreads 5.21% /
  10.86% at t = 0.4 / 0.8 by construction.
  **It is NOT a change of reference constant.** The inset is a fixed t/2
  OFFSET, not a proportion, so scaling a section by k does not scale its open
  area by k^2, and the scale has to be SOLVED per station inside the divider
  region (quadratic seed, then secant on the true inset area; converges to
  1e-12 relative). Physically that solve enlarges the outline to give back what
  the wall takes — the same argument as the shell oversize in `fabrication`,
  applied station by station. Both ends still land on k = 1 exactly, which is
  what keeps the throat mating face and the mouth tiling intact: at station 0
  the open area IS the law's starting value, and at the mouth the inset has
  tapered to nothing so open is gross.
  **`t` must be passed INTO `mapThroatToMouth`, not only into `buildLayout`.**
  With t = 0 in the map, open and gross coincide and every open-area assertion
  passes vacuously. That is exactly how this path went untested when first
  written — 259 checks passed against a feature that was inert — so the tests
  now pass `t` explicitly and a t = 0 case asserts the two conventions
  coincide, to prove the comparison is not a mode against itself.
- **Two things must never be tested on the residual alone.** The Schwarz–
  Christoffel inversion converges on its STEP, because its residual has a
  quadrature floor; and the equal-area solve converges on the residual AND the
  remaining move toward the request, because any feasible point stays feasible
  when the request moves — testing feasibility alone silently ignored the new
  slider on every warm start.
