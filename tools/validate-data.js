// The ritual from docs/DATA.md, as a script, so "the list is still valid" is a
// command rather than a memory. Run after every edit to data.js.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
eval(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "logos.js"), "utf8"));

let fails = 0;
const fail = (msg, list) => {
  fails++;
  console.log("FAIL  " + msg + (list && list.length ? "\n        " + list.join(", ") : ""));
};
const ok = (msg) => console.log("ok    " + msg);

const dupe = (key, norm) => {
  const seen = {}, bad = [];
  COINS.forEach((c) => {
    const k = norm(c[key]);
    if (seen[k]) bad.push(c[key]);
    seen[k] = 1;
  });
  return bad;
};
const dn = dupe("n", (s) => String(s).toLowerCase());
const dt = dupe("t", (s) => String(s).toUpperCase());
dn.length ? fail("duplicate display names", dn) : ok("display names unique");
dt.length ? fail("duplicate tickers", dt) : ok("tickers unique");

const badChain = COINS.filter((c) => CHAINS.indexOf(c.c) < 0);
badChain.length ? fail("chain not in CHAINS", badChain.map((c) => c.t + "=" + c.c)) : ok("every chain is in CHAINS");

const emptyChain = CHAINS.filter((ch) => !COINS.some((c) => c.c === ch));
emptyChain.length
  ? fail("CHAINS lists a chain no coin uses (stale enum)", emptyChain)
  : ok("every chain in CHAINS has at least one coin");

const badCat = COINS.filter((c) => CATS.indexOf(c.g) < 0);
badCat.length ? fail("type not in CATS", badCat.map((c) => c.t + "=" + c.g)) : ok("every type is in CATS");

const noFam = CATS.filter((g) => !CAT_FAMILY[g]);
noFam.length ? fail("CATS entry with no CAT_FAMILY (two unmapped types would grade YELLOW)", noFam) : ok("every type has a family");

const badYear = COINS.filter((c) => !(c.y >= 2013 && c.y <= 2026));
badYear.length ? fail("launch year out of range", badYear.map((c) => c.t + "=" + c.y)) : ok("launch years in range");

const badNum = COINS.filter((c) => !(isFinite(c.m) && c.m > 0 && isFinite(c.cm) && c.cm >= 0));
badNum.length ? fail("non-finite or negative cap", badNum.map((c) => c.t)) : ok("all caps finite and positive");

const inverted = COINS.filter((c) => c.cm > c.m);
inverted.length ? fail("current cap above all-time peak", inverted.map((c) => c.t + " " + c.cm + ">" + c.m)) : ok("no coin trades above its own peak");

const noLogo = COINS.filter((c) => !LOGOS[c.t] || !fs.existsSync(path.join(ROOT, LOGOS[c.t])));
noLogo.length ? fail("no logo file — Blur is unplayable on that day", noLogo.map((c) => c.t)) : ok("every coin has a logo file on disk");

const orphanLogo = Object.keys(LOGOS).filter((t) => !COINS.some((c) => c.t === t));
orphanLogo.length ? console.log("note  " + orphanLogo.length + " logo entries for coins no longer in the list: " + orphanLogo.join(", ")) : ok("no orphan logo entries");

const STRIDE = 61;
COINS.length % STRIDE === 0
  ? fail("COINS.length is a multiple of the stride " + STRIDE + " — the collision walk cannot reach every slot")
  : ok("COINS.length=" + COINS.length + ", length%" + STRIDE + "=" + (COINS.length % STRIDE));

const slugs = {}, dupSlug = [];
COINS.forEach((c) => { if (c.w) { if (slugs[c.w]) dupSlug.push(c.w); slugs[c.w] = 1; } });
dupSlug.length ? fail("duplicate wiki slugs", dupSlug) : ok("wiki slugs unique");

const longLore = COINS.filter((c) => c.l.length > 200);
longLore.length ? console.log("note  lore over 200 chars: " + longLore.map((c) => c.t + "(" + c.l.length + ")").join(", ")) : ok("every lore line under 200 chars");

console.log("\n" + COINS.length + " coins · " + (fails ? fails + " CHECKS FAILED" : "all checks passed"));
process.exit(fails ? 1 : 0);
