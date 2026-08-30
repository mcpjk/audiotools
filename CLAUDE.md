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
rule stands).

Without a law imposed the schedule is still the emergent by-product it always
was, and that setting is kept so the two can be compared: measured at 6x3, the
local flare dlnA/dx falls from 29 to 6.7 per metre, sqrt(A) is linear in x to
R^2 = 0.9915 against an exponential fit's 0.9583 — close to a CONE, the classic
poorly-loaded case. That is the thing to move off, and the reason the profile
exists.

## Known findings worth not re-deriving

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
  the axis, where they are already closest.
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
