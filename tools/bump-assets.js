// Stamp a fresh ?v= on every local asset in index.html.
//
// GitHub Pages serves assets with Cache-Control: max-age=600. Without a version
// stamp a returning visitor can get the NEW index.html paired with the OLD
// cached game.js — and since the old script wires up elements the new markup no
// longer has, it throws on the first getElementById and the page renders dead.
// Bumping the stamp gives the assets new URLs, so that pairing is impossible.
//
// Run this before any deploy that changes the page's CSS, scripts, or hero art:
//   node tools/bump-assets.js          # stamp with a hash of the asset contents
//   node tools/bump-assets.js --check  # exit 1 if the stamp is stale (CI-friendly)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const ASSETS = [
  "style.css",
  "data.js",
  "logos.js",
  "lb.js",
  "share.js",
  "game.js",
  "img/memedle-mascot-horizon-v2.webp",
];

const args = process.argv.slice(2);
const check = args.includes("--check");
const explicit = args.find((a) => /^[0-9a-f]{8}$/.test(a));

// Content hash, not a date. A date stamp collides on same-day edits, which
// silently serves stale CSS/JS — the exact failure this tool exists to prevent.
function stampFor() {
  const h = crypto.createHash("sha1");
  for (const a of ASSETS) h.update(fs.readFileSync(path.join(ROOT, a)));
  return h.digest("hex").slice(0, 8);
}
const stamp = explicit || stampFor();

let html = fs.readFileSync(INDEX, "utf8");
const found = [], missing = [];
for (const a of ASSETS) {
  const re = new RegExp("([\"'])" + a.replace(/\./g, "\\.") + "(\\?v=[0-9a-z]+)?\\1", "g");
  if (!re.test(html)) { missing.push(a); continue; }
  html = html.replace(re, "$1" + a + "?v=" + stamp + "$1");
  found.push(a);
}
if (missing.length) {
  console.error("index.html does not reference: " + missing.join(", "));
  process.exit(1);
}

if (check) {
  // Every occurrence, not the first: the first match is the preload <link>,
  // so a non-global regex passes clean while game.js sits on a stale stamp.
  const seen = [...fs.readFileSync(INDEX, "utf8").matchAll(/\?v=([0-9a-z]+)/g)].map((m) => m[1]);
  const stale = seen.filter((v) => v !== stamp);
  if (!seen.length || stale.length) {
    console.error("STALE: index.html carries ?v=" + [...new Set(seen)].join(", ") +
      " but the assets hash to " + stamp + " — run: node tools/bump-assets.js");
    process.exit(1);
  }
  console.log("ok: ?v=" + stamp + " matches the current asset contents");
  process.exit(0);
}

fs.writeFileSync(INDEX, html);
console.log("stamped ?v=" + stamp + " on " + found.join(", "));
