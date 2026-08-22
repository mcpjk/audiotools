# audiotools

Loudspeaker design calculators, served as a static multi-page site.

Live at: `audiotools.kiiworkshop.com` (see **Deployment** below)

| Tool | Page | What it does |
|---|---|---|
| Horn Profile Calculator | `horn-calculator.html` | Hypex-family horn profiles, S(x) = St·(cosh(mx) + T·sinh(mx))² |
| Annular FLH Calculator | `annular-flh.html` | Wall-primitive sectional area tool for square annular folded horns |
| Directivity Match | `directivity-match.html` | Horn ↔ cone crossover: −6 dB coverage and DI step through crossover |

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
src/
  HornCalculator.jsx        the component — self-contained, imports only react
  AnnularFLHCalculator.jsx
  DirectivityMatch.jsx
  horn-main.jsx             three-line mount script
  flh-main.jsx
  directivity-main.jsx
vite.config.js            the `input` map is what makes this multi-page
```

`base: "./"` in the Vite config keeps asset paths relative, so the built site
works from any directory, not just a domain root.

## Working on it

```bash
npm install     # once, after cloning
npm run dev     # local preview with hot reload, http://localhost:5173
npm run build   # produce dist/
npm run preview # serve the built dist/ exactly as it will be deployed
```

`dist/` and `node_modules/` are deliberately **not** committed — Cloudflare
regenerates both on every deploy. Build output in a repo goes stale and
produces meaningless diffs.

## Adding a new tool

Four small edits, no other files involved:

1. Drop the component in `src/`, e.g. `src/MulticellHorn.jsx`.
   It needs a `export default function ...`.
2. Add `src/multicell-main.jsx` — copy any existing mount script and change the
   two names.
3. Add `multicell.html` at the repo root — copy an existing entry HTML, change
   the `<title>` and the `<script src>`.
4. Register it in **two** places:
   - `vite.config.js` → one line in the `input` map. **A page not listed here
     will not be built**, and the omission is silent.
   - `index.html` → one `<a class="card">` block so it is reachable.

Then `npm run build` to confirm it compiles, and push.

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
