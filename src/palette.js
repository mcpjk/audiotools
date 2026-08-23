// ─────────────────────────────────────────────────────────────────────────────
// MASTER PALETTE — the single source of colour for every tool on the site.
//
// Import it; never redeclare a local `C`, and never write a raw hex inside a
// tool. `npm run check:palette` fails the build if you do.
//
//   import { C } from "./palette.js";
//
// ── TWO LAYERS ──────────────────────────────────────────────────────────────
// 1. THEMES below hold the actual values.
// 2. Tools consume ROLE names — what a colour is FOR, not what it looks like.
//
//      page panel panelAlt        grounds
//      border borderStrong        rules and outlines
//      ink inkDim inkMuted        type, in three weights
//      series1..series7           data marks, in a fixed order
//      accent                     the one highlight colour
//
// Legacy names (bg, surface, text, amber, blue, …) are kept as aliases so the
// existing tools keep working unchanged. NEW TOOLS SHOULD USE THE ROLE NAMES.
// Writing `C.amber` locks a tool to a colour; writing `C.series1` lets the
// theme move it. Note what that buys: `C.white` means "the reference-line
// colour", so on a light theme it is correctly near-black, and every tool that
// draws a marker line follows the theme without being touched.
//
// ── SWITCHING THEME ─────────────────────────────────────────────────────────
// Change THEME below. That is the whole operation — five tools follow.
//
// ── HOW THE ACTIVE THEME WAS BUILT ──────────────────────────────────────────
// "washi" comes from a traditional Japanese colour plate: 千草鼠 chigusa-nezumi
// (artemisia green), 砥粉色 tonoko-iro (gold ochre), 媚茶色 kobicha-iro (raw
// umber), 黒色 kuro, on washi paper.
//
// Those four are used as a HUE FAMILY, not as literal values, because as
// printed they cannot survive as thin marks: measured against the paper the
// gold is 1.70:1 and the sage 2.91:1, where a plot line needs 3:1. They work
// in the book because they are large blocks. So each hue was re-stepped in
// OKLCH to the lightness its role actually needs.
//
// Series lightness is spread deliberately from 0.44 to 0.64 rather than being
// chosen for looks. Separation that survives colour-blindness comes from
// lightness, not hue: red, green and gold all collapse toward the same hue
// under deuteranopia, so they are held apart in lightness instead. The ceiling
// is 0.64 — lighter than that stops clearing 3:1 on paper.
//
// Every per-tool combination that can actually appear on one chart passes the
// lightness band, chroma floor, CVD separation and normal-vision checks. Only
// the artificial all-seven-at-once case falls short, and no tool draws that.
//
// Regenerate with:  node scripts/palette-gen.mjs
// Verify with:      npm run check:palette
// ─────────────────────────────────────────────────────────────────────────────

export const THEME = "washi"; // "washi" (light, paper) | "sumi" (warm dark)

const THEMES = {
  // ── washi · sumi ink on paper ──────────────────────────────────────────
  washi: {
    page: "#f4efe7",
    panel: "#fdfbf7",
    panelAlt: "#f3ece1",
    border: "#ddd5c8",
    borderStrong: "#c5bbaa",
    inkMuted: "#8e8372",
    inkDim: "#655b49",
    ink: "#30291d",

    series1: "#ad8314", // tonoko gold, deepened
    series2: "#0061b1", // ai indigo
    series3: "#00919b", // chigusa sage-teal
    series4: "#50720e", // moss
    series5: "#91251a", // shu vermilion
    series6: "#79307c", // edo murasaki
    series7: "#a85184", // old rose
    accent: "#ad8314",
    accentDim: "#866300",
    reference: "#30291d", // marker / reference lines — ink on paper
  },

  // ── sumi · the previous warm dark theme, kept switchable ───────────────
  sumi: {
    page: "#140d0a",
    panel: "#231711",
    panelAlt: "#2e1c13",
    border: "#3c2c25",
    borderStrong: "#524038",
    inkMuted: "#65564f",
    inkDim: "#8e817c",
    ink: "#e1dcda",

    series1: "#e8a040",
    series2: "#4a9ade",
    series3: "#50c8c8",
    series4: "#48b858",
    series5: "#e05050",
    series6: "#9a7adb",
    series7: "#d060a0",
    accent: "#e8a040",
    accentDim: "#c08030",
    reference: "#e8e8e8",
  },
};

const t = THEMES[THEME];

export const C = {
  ...t,

  // ── legacy aliases — existing tools use these ──
  bg: t.page,
  surface: t.panel,
  surfaceAlt: t.panelAlt,
  borderLight: t.borderStrong,
  text: t.ink,
  textDim: t.inkDim,
  textMuted: t.inkMuted,

  amber: t.series1,
  amberDim: t.accentDim,
  blue: t.series2,
  cyan: t.series3,
  green: t.series4,
  red: t.series5,
  violet: t.series6,
  magenta: t.series7,
  white: t.reference,

  mono: "'SF Mono','Cascadia Code','Fira Code','Consolas',monospace",
  sans: "-apple-system,'Segoe UI','Helvetica Neue',sans-serif",
};

// Ordered list, for a tool that needs to assign marks by index rather than by
// name. Assign in order and never cycle: an eighth series is a sign the chart
// needs splitting, not another colour.
export const SERIES = [t.series1, t.series2, t.series3, t.series4, t.series5, t.series6, t.series7];

export default C;
