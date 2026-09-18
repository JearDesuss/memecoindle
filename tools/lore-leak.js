// Render every Lore card the way the game does and fail if any card still
// prints its own coin's name (or ticker, or a name word) in the clear.
//   node tools/lore-leak.js
// The redaction is extracted from game.js at run time rather than copied, so
// this can never drift from what players actually see.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
eval(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"));

const src = fs.readFileSync(path.join(ROOT, "game.js"), "utf8");
const from = src.indexOf("  var STOP = {");
const to = src.indexOf("  // ──────────────── state ────────────────", from);
if (from < 0 || to < 0) { console.error("could not find the redaction code in game.js"); process.exit(2); }
eval(src.slice(from, to));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let leaks = 0;
for (const coin of COINS) {
  const parts = loreParts(coin);
  const shown = parts.filter((_, i) => i % 2 === 0).join(" ");   // the unredacted pieces
  const names = [coin.n, coin.t]
    .concat(coin.n.split(/[\s\-']+/).filter((w) => w.length >= 3 && !STOP[w.toLowerCase()]))
    .concat(coin.a || []);
  const hit = names.find((n) => n && new RegExp("\\b" + esc(n) + "\\b", "i").test(shown));
  if (hit) { leaks++; console.log(`LEAK  $${coin.t}  "${hit}" shows in: ${shown.slice(0, 110)}`); }
}
console.log(leaks ? `\n${leaks} card(s) leak their answer` : `all ${COINS.length} lore cards redact their own name`);
process.exit(leaks ? 1 : 0);
