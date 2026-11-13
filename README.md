# audiotools

Loudspeaker design calculators, served as a static multi-page site.

Live under: `macapeh.com/audio/design/` (see **Deployment** below)

| Tool | Page | What it does |
|---|---|---|
| Horn Profile Calculator | `horn-calculator.html` | Hypex-family horn profiles, S(x) = St·(cosh(mx) + T·sinh(mx))² |
| Annular FLH Calculator | `annular-flh.html` | Wall-primitive sectional area tool for square annular folded horns |
| Directivity Match | `directivity-match.html` | Horn ↔ cone crossover: −6 dB coverage and DI step through crossover |
| Aperture Wavefield | `aperture-wavefield.html` | Curved-mouth aperture arrays: wavefield, polars, beamwidth vs frequency by direct summation |
| Box Modes | `box-modes.html` | Standing-wave pressure inside a rectangular box, re the lumped value — where a port entrance sees the modes that couple to the driver |

**The two Ginkgo tools moved to their own repo on 2026-09-09**, served at
`macapeh.com/audio/design/multicell/`
(repo [`mcpjk/ginkgoMulticell`](https://github.com/mcpjk/ginkgoMulticell)),
taking their full history with them. The redirect stubs they left here were
removed on 2026-11-13, when the old hostname was retired.

`src/palette.js` is the one file the repos share. Its master is in the hub
(`mcpjk/macapeh.com`, `public/_site/palette.js`, served at
`macapeh.com/_site/palette.js`); this repo and ginkgoMulticell carry copies, so
a palette change goes into the master first and is then copied into both.

Everything computes client-side. No backend, no network calls, no analytics,
no external libraries beyond React itself.

## Architecture

Each tool is **its own real HTML entry point** — there is no client-side
router. That is the whole reason direct links, bookmarks, and browser refreshes
work without any server rewrite rules. A router would need the host to rewrite
every unknown path back to `index.html`; real files need nothing.

```
index.html                local index for dev and tests — never served; the hub renders the public one
horn-calculator.html      entry → src/horn-main.jsx       → HornCalculator
annular-flh.html          entry → src/flh-main.jsx        → AnnularFLHCalculator
directivity-match.html    entry → src/directivity-main.jsx → DirectivityMatch
aperture-wavefield.html   entry → src/aperture-main.jsx    → ApertureWavefield
box-modes.html            entry → src/box-modes-main.jsx   → BoxModes
src/
  HornCalculator.jsx        the component — self-contained, imports react + palette
  AnnularFLHCalculator.jsx
  DirectivityMatch.jsx
  ApertureWavefield.jsx
  palette.js                shared theme tokens, imported by every tool
                            ALSO in the ginkgoMulticell repo — keep in step
  horn-main.jsx             three-line mount script
  flh-main.jsx
  directivity-main.jsx
scripts/palette-gen.mjs   regenerates the neutral ramp
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

### Where it is served

This Worker has no hostname of its own. The public site is `macapeh.com`,
served by the hub Worker `macapeh-site` (its own repo), which mounts each page
here under `macapeh.com/audio/design/<tool>/` through a Cloudflare **service
binding** named `AUDIOTOOLS`, stripping the prefix before forwarding. So the
build must keep `base: "./"` in `vite.config.js`: every asset path is
relative and resolves under whatever prefix the hub uses. Moving a tool to
another path is an edit to the hub's `src/site.js`, not to this repo.

```
/audio/design/horn-profile/        -> horn-calculator
/audio/design/annular-flh/         -> annular-flh
/audio/design/directivity-match/   -> directivity-match
/audio/design/aperture-wavefield/  -> aperture-wavefield
/audio/design/box-modes/           -> box-modes
/audio/design/cavity-modes/        -> cavity-modes
```

The old home, `audiotools.kiiworkshop.com`, was retired on 2026-11-13 with no
redirect: the hostname is detached and its DNS record gone. The
`workers.dev` URL still serves this Worker directly, which isolates "did the
build work" from "did the hub work".

Note the distinction, because the two sit next to each other in the dashboard:
a **custom domain** creates the DNS record and makes the hostname resolve; a
plain **route** only attaches a Worker to a URL pattern, and assumes a record
already exists. A route on a hostname with no DNS record produces a "server
not found" error, not a Worker error.

### Ginkgo calculation and export checks

Layout changes and long solves run in cancellable workers. A lightweight preview
updates during editing; after 350 ms without an edit, diagnostic calculations use
the export station count and refine centreline samples from 1024 to at least 2048
(up to 8192). The UI reports whether fold margin, passage contraction and section
tilt stabilise. Clearance and exports reuse the checked map. These are sampled
duct checks, not validation of the continuous STEP loft in a CAD kernel.

Exact canonical design keys include all geometry inputs and achieved grid
coefficients. Changes invalidate dependent separation solutions and pending
exports. STEP files carry `GINKGO_DESIGN_V1` JSON with requested layout, achieved
coefficients, mapping and fabrication/export settings, effective resolution and
a SHA-256 revision of the geometry source. `readDesignStamp` and `replayDesign`
reconstruct the achieved geometry without rerunning the layout solver; use the
matching model revision for historical files. STL remains a mesh-only format.

The UI uses interpolated station positions, path distances and re-orthogonalised
frames. The model's default snapped mode remains available for historical
measurements. The STEP loft (`ductBrep`) is parameterised uniformly along the
path; `vParam: "chord"` is kept as a measured comparison baseline (it
straightens the sacrificial extension and bulges the mouth — see CLAUDE.md),
and every STEP file stamps `loft=` in its settings string.

`npm run build` runs palette, numerical and worker/provenance regression checks.
`npm run test:ui` runs Playwright interaction tests against the built site
(install Chromium with `npx playwright install chromium` first). CI runs both,
including page rendering, stale-layout export prevention, separation invalidation,
solve cancellation and downloaded STEP settings.

