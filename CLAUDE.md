# CLAUDE.md

Working notes for this repo. Read before changing anything.

## What this is

Five loudspeaker design calculators served as a static multi-page site at
`audiotools.kiiworkshop.com`. Everything computes client-side — no backend, no
network calls, no analytics, no external libraries beyond React.

Tools are usually iterated **one at a time in separate sessions**. Assume you
are touching one tool and that the others must come out byte-identical.

## Layout

```
index.html                landing page — plain HTML/CSS, no React
horn-calculator.html      → src/horn-main.jsx        → HornCalculator
annular-flh.html          → src/flh-main.jsx         → AnnularFLHCalculator
directivity-match.html    → src/directivity-main.jsx → DirectivityMatch
cd-exit-divider.html      → src/cd-exit-main.jsx     → CDExitCellDivider
aperture-wavefield.html   → src/aperture-main.jsx    → ApertureWavefield
src/palette.js            shared theme tokens — see below
scripts/palette-gen.mjs   regenerates the neutral ramp
vite.config.js            the `input` map is what makes this multi-page
wrangler.jsonc            Cloudflare deploy + custom domain
```

Each tool is its own real HTML entry point. There is **no client-side router**,
and that is deliberate: direct links, bookmarks and refreshes work with no
server rewrite rules. Do not introduce one.

## Commands

```bash
npm install
npm run dev      # localhost:5173
npm run build    # → dist/
npm run preview  # serve the built output as deployed
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

`src/palette.js` is the single source of truth. **Import it; never redeclare a
local `C`.** All three tools used to carry their own copy, which is exactly how
three tools drift into three shades of the same theme.

```js
import { C } from "./palette.js";
```

The neutrals are a warm ramp at OKLCH hue 45. They were derived from the
original cool ramp by rotating hue only and **holding lightness fixed**, so
every contrast ratio was preserved (text on bg 14.20:1 → 14.15:1). If you
change the theme, do it the same way:

```bash
node scripts/palette-gen.mjs 45 0.6    # hue, chroma scale
```

It prints a fresh block plus before/after contrast ratios. Paste the block into
`src/palette.js`. Do not hand-edit individual hexes — that is how a ramp stops
being a ramp. The background also appears in each entry HTML's inline `<style>`
and in the favicon data URI, so those need the same value.

Anything that mixes colour numerically — the Aperture Wavefield canvas colour
map, for instance — must derive its endpoints from `C` rather than hard-coding
RGB. That tool originally held the old background as raw `(12, 15, 20)` in its
pixel loop, which left the canvas off-theme when the palette changed.

Accent colours (amber, blue, cyan, green, red, violet, magenta) are the
original design and should not be changed without asking. Two known
colour-vision weaknesses, both pre-existing: violet/blue are nearly identical
under deuteranopia, green/amber under protanopia. Both are currently mitigated
by direct labels and dash patterns rather than colour alone — preserve that if
you touch the plots.

## Component conventions

Match what is already there rather than modernising it:

- Self-contained single files, `import React` plus the palette, nothing else.
- Inline style objects, no CSS modules, no styling library.
- Hand-rolled SVG for all plots — no charting library.
- Physics helpers as plain top-level functions above the component.
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
