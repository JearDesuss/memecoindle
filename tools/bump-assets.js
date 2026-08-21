// Stamp a fresh ?v= on every local asset in index.html.
//
// GitHub Pages serves assets with Cache-Control: max-age=600. Without a version
// stamp a returning visitor can get the NEW index.html paired with the OLD
// cached game.js — and since the old script wires up elements the new markup no
// longer has, it throws on the first getElementById and the page renders dead.
// Bumping the stamp gives the assets new URLs, so that pairing is impossible.
//
// Run this before any deploy that changes style.css, game.js, data.js, logos.js
// or lb.js:
//   node tools/bump-assets.js          # stamp with today's date (YYYYMMDD)
//   node tools/bump-assets.js 20260901 # or an explicit stamp
//   node tools/bump-assets.js --check  # exit 1 if the stamp is stale (CI-friendly)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const ASSETS = ["style.css", "data.js", "logos.js", "lb.js", "game.js"];

const args = process.argv.slice(2);
const check = args.includes("--check");
const explicit = args.find((a) => /^\d{8}$/.test(a));

const d = new Date();
const today = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
const stamp = explicit || today;

let html = fs.readFileSync(INDEX, "utf8");
const found = [];
let missing = [];

for (const a of ASSETS) {
  const re = new RegExp('(["\'])' + a.replace(".", "\\.") + '(\\?v=\\d+)?\\1', "g");
  if (!re.test(html)) { missing.push(a); continue; }
  html = html.replace(re, '$1' + a + "?v=" + stamp + "$1");
  found.push(a);
}

if (missing.length) {
  console.error("index.html does not reference: " + missing.join(", "));
  process.exit(1);
}

// newest mtime across the assets — if anything is newer than the stamp, it's stale
const newest = ASSETS.reduce((acc, a) => {
  const m = fs.statSync(path.join(ROOT, a)).mtime;
  return m > acc ? m : acc;
}, new Date(0));
const newestStamp = newest.getFullYear() + String(newest.getMonth() + 1).padStart(2, "0") + String(newest.getDate()).padStart(2, "0");

if (check) {
  const current = (fs.readFileSync(INDEX, "utf8").match(/\?v=(\d+)/) || [])[1];
  if (!current || current < newestStamp) {
    console.error("STALE: index.html stamped ?v=" + (current || "none") +
      " but assets were last touched " + newestStamp + " — run: node tools/bump-assets.js");
    process.exit(1);
  }
  console.log("ok: ?v=" + current + " covers assets last touched " + newestStamp);
  process.exit(0);
}

fs.writeFileSync(INDEX, html);
console.log("stamped ?v=" + stamp + " on " + found.join(", "));
