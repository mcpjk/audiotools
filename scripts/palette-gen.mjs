// Regenerate the neutral ramp in src/palette.js.
//
//   node scripts/palette-gen.mjs [hue] [chromaScale]
//   node scripts/palette-gen.mjs 45 0.6      <- the current theme
//   node scripts/palette-gen.mjs 260 1.0     <- back to the original cool ramp
//
// Rotates the ORIGINAL cool ramp to a new hue, holding each step's OKLCH
// lightness fixed so every contrast ratio in the UI is preserved. Prints the
// block to paste into src/palette.js, plus the contrast ratios so a change can
// be checked rather than eyeballed.
import { hexToOklch, oklchToHex, contrast } from "./oklch.mjs";

// The original blue-tinted ramp this project started from. Kept as the source
// so repeated regeneration never compounds rounding error.
const BASE = {
  bg: "#0c0f14", surface: "#151a23", surfaceAlt: "#1a2030", border: "#2a3040",
  borderLight: "#3a4558", textMuted: "#4e5a6e", textDim: "#7a8598", text: "#d8dee8",
};

// Warmth should read on the large dark areas and fade toward the text, so the
// type stays near-neutral instead of turning orange.
const BOOST = {
  bg: 1.9, surface: 1.9, surfaceAlt: 1.7, border: 1.5,
  borderLight: 1.3, textMuted: 1.1, textDim: 0.9, text: 0.7,
};

const hue = Number(process.argv[2] ?? 45);
const scale = Number(process.argv[3] ?? 0.6);

const out = {};
for (const [k, v] of Object.entries(BASE)) {
  const o = hexToOklch(v);
  out[k] = oklchToHex({ L: o.L, C: o.C * BOOST[k] * scale, H: hue });
}

console.log(`// neutrals — hue ${hue}, chroma x${scale}`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: "${v}",`);

const pair = (a, b) => `${contrast(out[a], out[b]).toFixed(2)}:1 (was ${contrast(BASE[a], BASE[b]).toFixed(2)}:1)`;
console.log("\n// contrast, new vs original:");
console.log("//   text on bg        ", pair("text", "bg"));
console.log("//   text on surface   ", pair("text", "surface"));
console.log("//   textDim on surface", pair("textDim", "surface"));
console.log("//   textMuted on surf ", pair("textMuted", "surface"));
