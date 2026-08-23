// Push the active theme into the entry HTML files.
// Run: npm run theme:sync   (after changing THEME in src/palette.js)
//
// Entry pages carry literal colours because both the background and the inline
// SVG favicon must paint before any JS runs — waiting for React would flash the
// wrong colour on load. So the values are duplicated, and written mechanically.
//
// Each themed value is tagged with the role it holds:
//
//     background:#f4efe7;/*theme:page*/
//
// which is what makes this safe. An earlier version replaced every
// `background:` it found and quietly flattened the landing page's cards into
// the page colour, because nothing recorded which value meant what.
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { C } from "../src/palette.js";

let changed = 0, tags = 0;
for (const f of readdirSync(".").filter((f) => f.endsWith(".html"))) {
  const before = readFileSync(f, "utf8");
  let after = before.replace(
    /#[0-9a-fA-F]{6}(\s*;?\s*)\/\*theme:([a-zA-Z]+)\*\//g,
    (m, sep, token) => {
      tags++;
      if (!(token in C)) throw new Error(`${f}: unknown theme token "${token}"`);
      return `${C[token]}${sep}/*theme:${token}*/`;
    }
  );
  // the favicon's ground is the page colour, url-encoded inside a data URI
  after = after.replace(/%23[0-9a-fA-F]{6}/g, `%23${C.page.replace("#", "")}`);
  if (after !== before) { writeFileSync(f, after); changed++; console.log(`  updated ${f}`); }
}
console.log(changed ? `synced ${tags} tagged values across ${changed} page(s)` : `already in sync (${tags} tagged values)`);
