// Regenerate a theme's values for src/palette.js.
//
//   node scripts/palette-gen.mjs            # the active washi theme
//   node scripts/palette-gen.mjs --check    # also print contrast for each role
//
// Every value is specified as OKLCH (hue, lightness, chroma) rather than as a
// hex, because lightness is the thing that has to be chosen deliberately:
//
//   · Neutrals are one warm hue with chroma tapering from the paper down to
//     the ink, so the ground is tinted but the type stays near-neutral.
//   · Series lightness is spread from 0.44 to 0.64 on purpose. Separation that
//     survives colour-blindness comes from lightness, not hue — red, green and
//     gold all collapse toward one hue under deuteranopia. The 0.64 ceiling is
//     where a mark stops clearing 3:1 against paper.
//
// After changing anything here, re-run the data-viz palette validator on the
// series values before trusting them.
import { oklchToHex, contrast } from "./oklch.mjs";

const NEUTRAL_HUE = 80; // between tonoko (87) and kobicha (61)

const NEUTRALS = {
  page:         [0.955, 0.012],
  panel:        [0.988, 0.006],
  panelAlt:     [0.945, 0.016],
  border:       [0.875, 0.020],
  borderStrong: [0.795, 0.026],
  inkMuted:     [0.615, 0.028],
  inkDim:       [0.475, 0.030],
  ink:          [0.285, 0.024],
};

// hue, lightness, chroma
const SERIES = {
  series1: [85,  0.635, 0.125], // tonoko gold, deepened for line use
  series2: [252, 0.492, 0.148], // ai indigo
  series3: [203, 0.598, 0.105], // chigusa sage-teal
  series4: [128, 0.506, 0.126], // moss
  series5: [30,  0.437, 0.145], // shu vermilion
  series6: [326, 0.441, 0.142], // edo murasaki
  series7: [346, 0.558, 0.130], // old rose
};
const ACCENT_DIM = [85, 0.520, 0.110];

const out = {};
for (const [k, [L, C]] of Object.entries(NEUTRALS)) out[k] = oklchToHex({ L, C, H: NEUTRAL_HUE });
for (const [k, [H, L, C]] of Object.entries(SERIES)) out[k] = oklchToHex({ L, C, H });
out.accent = out.series1;
out.accentDim = oklchToHex({ L: ACCENT_DIM[1], C: ACCENT_DIM[2], H: ACCENT_DIM[0] });
out.reference = out.ink;

console.log("  washi: {");
for (const k of Object.keys(NEUTRALS)) console.log(`    ${k}: "${out[k]}",`);
console.log("");
for (const k of Object.keys(SERIES)) console.log(`    ${k}: "${out[k]}",`);
for (const k of ["accent", "accentDim", "reference"]) console.log(`    ${k}: "${out[k]}",`);
console.log("  },");

if (process.argv.includes("--check")) {
  console.log("\n// contrast against page / panel:");
  for (const k of [...Object.keys(SERIES), "ink", "inkDim", "inkMuted"]) {
    const a = contrast(out[k], out.page), b = contrast(out[k], out.panel);
    const need = k.startsWith("series") ? 3 : 3;
    console.log(`//   ${k.padEnd(13)} ${a.toFixed(2)}:1 / ${b.toFixed(2)}:1 ${Math.min(a,b) >= need ? "ok" : "LOW"}`);
  }
  console.log("//   series list: " + Object.keys(SERIES).map((k) => out[k]).join(","));
}
