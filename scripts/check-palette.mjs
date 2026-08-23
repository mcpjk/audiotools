// Guard the master palette. Run: npm run check:palette  (the build runs it first)
//
// Conventions are not enforcement. Two tools have already arrived carrying
// their own copy of the palette, and one had the background hard-coded as raw
// RGB inside a pixel loop, so a retheme silently missed it.
//
// A line that legitimately needs a fixed colour whatever the theme — black for
// CAD/SVG export — opts out with a trailing `palette-exempt` comment.
import { readFileSync, readdirSync } from "fs";
import { C } from "../src/palette.js";

const problems = [];
const note = (file, line, msg) => problems.push(`${file}${line ? ":" + line : ""}  ${msg}`);

// ── 1. tool sources must not carry raw colour values ──
for (const f of readdirSync("src").filter((f) => f.endsWith(".jsx"))) {
  readFileSync(`src/${f}`, "utf8").split("\n").forEach((ln, i) => {
    if (ln.includes("palette-exempt")) return;
    const hex = ln.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
    if (hex) note(f, i + 1, `raw colour ${hex.join(", ")} — use a token from palette.js`);
    if (/\brgba?\(\s*\d/.test(ln)) note(f, i + 1, "raw rgb() — derive from a palette token instead");
    if (/^const C = \{/.test(ln)) note(f, i + 1, "local palette declared — import { C } from './palette.js'");
  });
}

// ── 2. every tagged value in an entry page must equal its token ──
let tagged = 0;
for (const f of readdirSync(".").filter((f) => f.endsWith(".html"))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(#[0-9a-fA-F]{6})\s*;?\s*\/\*theme:([a-zA-Z]+)\*\//g)) {
    tagged++;
    const [, hex, token] = m;
    if (!(token in C)) note(f, 0, `unknown theme token "${token}"`);
    else if (hex.toLowerCase() !== C[token].toLowerCase())
      note(f, 0, `${token} is ${hex}, palette says ${C[token]} — run npm run theme:sync`);
  }
  // any untagged literal in an entry page is drift waiting to happen
  const untagged = [...src.matchAll(/#[0-9a-fA-F]{6}/g)]
    .filter((m) => !/\/\*theme:/.test(src.slice(m.index, m.index + 40)));
  if (untagged.length) note(f, 0, `${untagged.length} untagged colour literal(s) — tag with /*theme:token*/`);

  const fav = src.match(/%23([0-9a-fA-F]{6})/);
  if (fav && `#${fav[1]}`.toLowerCase() !== C.page.toLowerCase())
    note(f, 0, `favicon ground #${fav[1]} != C.page ${C.page} — run npm run theme:sync`);
}

if (problems.length) {
  console.error(`\npalette check FAILED — ${problems.length} problem(s):\n`);
  problems.forEach((p) => console.error("  " + p));
  console.error("\nColour belongs in src/palette.js. See CLAUDE.md.\n");
  process.exit(1);
}
console.log(`palette check passed — ${tagged} tagged page values consistent with theme "${C.page}"`);
