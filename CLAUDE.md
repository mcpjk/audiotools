# CLAUDE.md

Working notes for this repo. Read before changing anything.

## What this is

Six loudspeaker design calculators served as a static multi-page site at
`audiotools.kiiworkshop.com`. Five are linked from the landing page: the CD
Exit Cell Division tool is superseded by the H-Grid Throat Partition and its
card was removed, but the page itself is still in the `input` map and still
builds, so old links keep working. `index.html` therefore has five cards where
`vite.config.js` has six inputs — that mismatch is deliberate. Everything computes client-side — no backend, no
network calls, no analytics, no external libraries beyond React.

Tools are usually iterated **one at a time in separate sessions**. Assume you
are touching one tool and that the others must come out byte-identical.

## Layout

```
index.html                landing page — plain HTML/CSS, no React
horn-calculator.html      → src/horn-main.jsx        → HornCalculator
annular-flh.html          → src/flh-main.jsx         → AnnularFLHCalculator
directivity-match.html    → src/directivity-main.jsx → DirectivityMatch
cd-exit-divider.html      → src/cd-exit-main.jsx     → CDExitCellDivider (unlinked)
aperture-wavefield.html   → src/aperture-main.jsx    → ApertureWavefield
h-grid-throat.html        → src/hgrid-main.jsx       → HGridThroat
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
- **One exception, deliberate**: `HGridThroat.jsx` keeps its physics in
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

## Known findings worth not re-deriving

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
- **Two things must never be tested on the residual alone.** The Schwarz–
  Christoffel inversion converges on its STEP, because its residual has a
  quadrature floor; and the equal-area solve converges on the residual AND the
  remaining move toward the request, because any feasible point stays feasible
  when the request moves — testing feasibility alone silently ignored the new
  slider on every warm start.
