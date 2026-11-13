# Crossover Scope

A learning page, served at `macapeh.com/audio/learn/crossover-scope/` (hub
`TOOLS` entry, `page: "crossover-scope"`). It shows one crossover four ways:
level, group delay or phase, phasors at a probe frequency, and an
FFT-simulated waveform, for Butterworth, Linkwitz-Riley, Bessel and
linear-phase filters with optional polarity inversion and path delays.

## Files

```
../../crossover-scope.html  entry page; must stay at the repo ROOT (see below)
main.js                     drawing, wiring, palette → CSS variables
markup.js                   static markup, mounted into #root by main.js
crossover-scope.css         layout; colours and fonts only as var()
model.js                    physics: prototypes, delay, polarity, FFT sim
../../scripts/test-crossover.mjs  closed-form checks; the build runs them
```

## Decisions worth knowing

- **Plain DOM + canvas, not React.** It arrived as a finished standalone page
  (2026-11-13). Porting four canvas plots to React/SVG would have rewritten
  working code for consistency alone. This is the one deliberate departure
  from the repo's "React component, inline styles, SVG plots" convention.
- **The entry HTML lives at the repo root, not in this folder.** Vite's
  `base: "./"` makes a nested page reference `../assets/…`, and the hub mounts
  each page at its own path, so that `../` would climb out of the tool's
  prefix and 404. Source can live here; the entry page cannot.
- **Colour roles:** LP `series1`, HP `series2`, probe `series3`, sum `ink`
  (heavier line), input `inkMuted` dashed, grid `border`/`borderStrong`.
  The original page had its own light/dark colour sets; the site has one theme
  chosen in `palette.js`, so the page follows that and no longer switches with
  the OS dark mode.
- **Back link is `../`.** The hub mounts the page one level under its
  section, so `../` is `/audio/learn/`. `./index.html` does not work: the hub
  redirects any `…/index.html` to its own directory, i.e. the tool itself.
- **No webfont.** The original loaded IBM Plex from Google Fonts, a network
  request the site does not make. It uses `C.sans` / `C.mono`.
- **model.js was ported unchanged.** At the port, a script compared its
  responses, group delays and simulated waveforms against the original page's
  code over every family, order, polarity and signal: maximum difference 0.

## Verifying

`npm run test:crossover` (about 0.2 s). It checks textbook closed forms, not
the tool's own output: Butterworth −3 dB and |H|² at every order, LR −6 dB and
all-pass sum (inverted HP for LR2/LR6), the LR2 null at fc, BW1 summing to a
wire, LR4 DC group delay 2√2/ωc, tabulated Bessel −3 dB frequencies,
pure-delay phase, FFT round trip, the BW1 analytic step response and energy
preservation through the LR4 all-pass.

When it first ran, one check failed and the test was at fault: a sampled
step's band-limited edge sits half a sample before its first 1, which is worth
0.006 at 2 ms after the step.
