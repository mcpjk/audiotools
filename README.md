# audiotools

Loudspeaker design calculators, served as a static multi-page site.

Live at: `audiotools.kiiworkshop.com` (see **Deployment** below)

| Tool | Page | What it does |
|---|---|---|
| Horn Profile Calculator | `horn-calculator.html` | Hypex-family horn profiles, S(x) = St·(cosh(mx) + T·sinh(mx))² |
| Annular FLH Calculator | `annular-flh.html` | Wall-primitive sectional area tool for square annular folded horns |
| Directivity Match | `directivity-match.html` | Horn ↔ cone crossover: −6 dB coverage and DI step through crossover |
| CD Exit Cell Division | `cd-exit-divider.html` | Equal open-area partition of a compression driver exit; layout chosen to raise the HOM-free limit — **superseded, unlinked from the landing page** |
| Aperture Wavefield | `aperture-wavefield.html` | Curved-mouth aperture arrays: wavefield, polars, beamwidth vs frequency by direct summation |
| H-Grid Throat Partition | `h-grid-throat.html` | Equal-area row-and-column partition of a CD exit, per-line curvature control, lofted cell-for-cell to a rectangular mouth |

Everything computes client-side. No backend, no network calls, no analytics,
no external libraries beyond React itself.

## Architecture

Each tool is **its own real HTML entry point** — there is no client-side
router. That is the whole reason direct links, bookmarks, and browser refreshes
work without any server rewrite rules. A router would need the host to rewrite
every unknown path back to `index.html`; real files need nothing.

```
index.html                landing page — plain HTML/CSS, no React
horn-calculator.html      entry → src/horn-main.jsx       → HornCalculator
annular-flh.html          entry → src/flh-main.jsx        → AnnularFLHCalculator
directivity-match.html    entry → src/directivity-main.jsx → DirectivityMatch
cd-exit-divider.html      entry → src/cd-exit-main.jsx     → CDExitCellDivider (unlinked)
aperture-wavefield.html   entry → src/aperture-main.jsx    → ApertureWavefield
h-grid-throat.html        entry → src/hgrid-main.jsx       → HGridThroat
src/
  HornCalculator.jsx        the component — self-contained, imports react + palette
  AnnularFLHCalculator.jsx
  DirectivityMatch.jsx
  CDExitCellDivider.jsx
  ApertureWavefield.jsx
  HGridThroat.jsx           the one tool split in two — see below
  hgrid-model.js            its geometry, solver and acoustics; no React, no colour
  palette.js                shared theme tokens, imported by every tool
  horn-main.jsx             three-line mount script
  flh-main.jsx
  directivity-main.jsx
scripts/palette-gen.mjs   regenerates the neutral ramp
scripts/test-hgrid.mjs    test vectors for the H-grid model, run by the build
vite.config.js            the `input` map is what makes this multi-page
wrangler.jsonc            Cloudflare deploy config and custom domain
```

### Grid lines as the primitive

The H-grid tool represents its partition as **lines, not nodes**. Each latitude
and longitude line is one continuous curve carrying a few Chebyshev shape
coefficients in a reference square, pushed through a square-to-disc seed map; a
node is just where two lines cross. That is far more freedom than two division
vectors — a tensor-product grid has 4 parameters against 5 independent area
constraints at 6×3 and provably cannot be equal-area — and far less than free
nodes, which is the point: the coefficients are legible (where the line sits,
how much it bows, where the bow concentrates) and there are ten of them rather
than ninety.

Sliders are **requests, not settings**. Moving one states a wish; the solver
returns the nearest parameter vector that still has equal areas, and the tool
shows requested against achieved for every parameter. Unlike free nodes,
whole-line curvature cannot always reach equal area — when it cannot, the tool
says so, names the binding constraint, and shows how far along the request it
did get.

### The one tool that is two files

Every other tool is a single self-contained component. The H-grid throat
partition keeps its geometry, its equal-area solver and its acoustic model in
`src/hgrid-model.js`, which imports nothing — no React, no palette. That is so
`npm run test:hgrid` can load it under plain node and check it against closed
forms: the exact Neumann modes of a disc and of a circular sector, area closure
on πR² for any parameter vector, mirrored cells agreeing to machine precision,
the evanescent decay length, and the corner-angle and DOF counts. The build runs
those tests before Vite.

The reason is the one in **Verifying a change** in `CLAUDE.md`: for this kind of
tool `vite build` succeeding proves almost nothing. A wrong coefficient compiles
perfectly. Splitting the file is what makes the numbers checkable.

## Theme

Light, warm — sumi ink on washi paper. All colour lives in `src/palette.js`;
the tools import it rather than each carrying a copy, and `npm run check:palette`
(which the build runs first) fails if a tool contains a raw hex or a page's
background drifts from the palette.

Two themes ship. To switch, change one line in `src/palette.js` and sync:

```js
export const THEME = "washi";   // light, paper  (active)
export const THEME = "sumi";    // warm dark     (the previous theme)
```

```bash
npm run theme:sync      # push the values into the entry HTML files
```

The sync step exists because each entry page carries a literal background and
favicon colour — both must paint before any JS runs, or the page flashes the
wrong colour on load. Those values are tagged with the role they hold, so they
can be rewritten mechanically.

The active theme is drawn from a traditional Japanese colour plate — 千草鼠
chigusa-nezumi, 砥粉色 tonoko-iro, 媚茶色 kobicha-iro, 黒色 kuro. Those are used
as a hue family rather than literal values: as printed, the gold sits at 1.70:1
against the paper and the sage at 2.91:1, where a plot line needs 3:1. They
work in a book because they are large blocks, not thin marks. Each hue was
re-stepped in OKLCH to the lightness its role actually needs.

To adjust, edit the OKLCH specs in `scripts/palette-gen.mjs` and re-run it — it
prints a block that replaces the theme wholesale, and reproduces the committed
values exactly, so a diff shows only comments.

## Deployment

GitHub → **Cloudflare Workers** (static assets), automatic on every push to `main`.

Cloudflare builds the site in a disposable container and serves `dist/` straight
from its edge. There is no server-side code: `wrangler.jsonc` declares an
assets-only Worker with no `main` entry point.

Dashboard settings:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- `NODE_VERSION` environment variable: `22` — Vite 8 requires Node ≥ 20.19, and
  Cloudflare's default image can be older. Without this the build fails in a way
  that looks like a dependency error but is just an old interpreter.

The output directory is **not** a dashboard field here, unlike Cloudflare Pages.
It comes from `assets.directory` in `wrangler.jsonc`. If the Vite output
location ever changes, both files have to change together.

A failed build does not overwrite the live version, and previous deployments can
be rolled back from the dashboard.

### Custom domain

`audiotools.kiiworkshop.com`, declared as a `custom_domain` route in
`wrangler.jsonc` so the binding lives in version control rather than only in
the dashboard. kiiworkshop.com is already a Cloudflare zone, so Cloudflare
creates the DNS record and provisions the certificate itself — nothing to edit
by hand at a registrar.

Note the distinction, because the two sit next to each other in the dashboard
and only one of them works here: a **custom domain** creates the DNS record and
makes the hostname resolve; a plain **route** only attaches the Worker to a URL
pattern, and assumes a record already exists. A route on a hostname with no DNS
record produces a "server not found" error, not a Worker error.

A subdomain rather than the apex, so the tools deploy independently of whatever
serves kiiworkshop.com itself. Note that Workers custom domains only attach to
zones on Cloudflare's nameservers; an external CNAME cannot point at a Worker.
