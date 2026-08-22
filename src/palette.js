// ─────────────────────────────────────────────────────────────────────────────
// SHARED PALETTE — single source of truth for every tool on the site.
//
// Import this rather than redeclaring a local `C`. Each tool used to carry its
// own copy, which is how three tools end up three slightly different shades of
// the same theme.
//
// HOW THE NEUTRALS WERE DERIVED
//   The original ramp was a blue-tinted grey: every neutral sat at OKLCH hue
//   260-268 with chroma 0.012-0.036. To warm it, each neutral was converted to
//   OKLCH, its LIGHTNESS LEFT UNTOUCHED, and only the hue rotated to 45 with
//   chroma scaled by 0.6.
//
//   Holding L fixed is the point: every contrast ratio in the UI is preserved.
//   Measured before and after, text on bg moved 14.20:1 -> 14.15:1, textDim on
//   surface 4.68 -> 4.64, textMuted on surface 2.50 -> 2.49. So the theme got
//   warmer without any text getting harder to read.
//
//   Hue 45 rather than the amber accent's own hue (70): far enough away that
//   amber still reads as an accent against the ground instead of merging into
//   it. Chroma 0.6x because 1.0x renders visibly rusty — at full chroma the
//   amber focus ring on an input starts blending into the surface behind it.
//
// CHANGING THE THEME
//   Adjust the two numbers in scripts/palette-gen.mjs and re-run it; it prints
//   a fresh block to paste in below. Do not hand-edit individual hexes — that
//   is how a ramp stops being a ramp.
//
// ACCENTS are deliberately unchanged from the original design. They are
// validated to clear 3:1 against the surface below. Two known weaknesses,
// both pre-dating the warm theme: violet/blue are near-indistinguishable
// under deuteranopia (OKLab dE 1.3), and green/amber under protanopia
// (dE 2.3). Both are mitigated by direct labels and dash patterns rather
// than by colour alone.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  // neutrals — warm ramp, hue 45
  bg: "#140d0a",
  surface: "#231711",
  surfaceAlt: "#2e1c13",
  border: "#3c2c25",
  borderLight: "#524038",
  textMuted: "#65564f",
  textDim: "#8e817c",
  text: "#e1dcda",

  // accents — unchanged
  amber: "#e8a040",
  amberDim: "#c08030",
  blue: "#4a9ade",
  cyan: "#50c8c8",
  magenta: "#d060a0",
  green: "#48b858",
  red: "#e05050",
  violet: "#9a7adb",
  white: "#e8e8e8",

  mono: "'SF Mono','Cascadia Code','Fira Code','Consolas',monospace",
  sans: "-apple-system,'Segoe UI','Helvetica Neue',sans-serif",
};

export default C;
