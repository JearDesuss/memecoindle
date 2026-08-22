// Re-fetch the coin logos at the highest resolution the source actually holds.
//
// The original fetch took CoinGecko's `large` thumbnail (a fixed 250px) and
// tools/resize-logos.js then downscaled it to 160px WebP. But Blur mode opens
// at scale 1.55 on a 150px frame and settles at 1.13 — ~170px CSS, ~340px on a
// 2x screen — so the reveal was drawing a 160px image into a 340px box and
// looked soft exactly when the player is staring hardest at it.
//
// CoinGecko keeps the uploader's file under /original/ (200-640px depending on
// the coin), so swapping that one path segment recovers whatever real
// resolution exists. Anything already larger than what we hold is kept.
//
// Resolved URLs are cached in tools/.logo-src.json so re-runs skip the
// rate-limited search step.
//   node tools/refetch-logos.js            # resolve + download
//   node tools/refetch-logos.js --cached   # only use already-resolved URLs
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
eval(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"));       // -> COINS
eval(fs.readFileSync(path.join(ROOT, "logos.js"), "utf8"));      // -> LOGOS
const IMG = path.join(ROOT, "img");
const HIRES = path.join(ROOT, "img", "_hires");
const CACHE_FILE = path.join(__dirname, ".logo-src.json");
const CACHED_ONLY = process.argv.includes("--cached");
const UA = "memecoindle-logo-fetch/2.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};

function dims(b) {
  if (b.slice(1, 4).toString() === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") {
    const t = b.slice(12, 16).toString();
    if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === "VP8L") { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 8) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function resolve(coin) {
  if (cache[coin.t]) return cache[coin.t];
  if (CACHED_ONLY) return null;
  for (const q of [coin.n, coin.t]) {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(q), { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      await sleep(2400);
      const hits = (j.coins || []).filter((h) => h.large && !/missing_/.test(h.large));
      const hit = hits.find((h) => norm(h.symbol) === norm(coin.t)) || hits.find((h) => norm(h.name) === norm(coin.n));
      if (hit) { cache[coin.t] = hit.large; fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1)); return hit.large; }
    } catch (e) {
      if (/429/.test(e.message)) await sleep(30000); else await sleep(2400);
    }
  }
  return null;
}

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < 400) throw new Error("too small");
  return b;
}

async function main() {
  fs.mkdirSync(HIRES, { recursive: true });
  let upgraded = 0, kept = 0, missing = 0;
  for (const coin of COINS) {
    if (!LOGOS[coin.t]) { missing++; continue; }
    const have = path.join(IMG, coin.t + ".png");
    const haveDims = fs.existsSync(have) ? dims(fs.readFileSync(have)) : null;
    const large = await resolve(coin);
    if (!large) { kept++; continue; }
    let best = null, bestDim = 0;
    for (const u of [large.replace("/large/", "/original/"), large]) {
      try {
        const b = await get(u);
        const d = dims(b);
        if (d && Math.max(d[0], d[1]) > bestDim) { best = b; bestDim = Math.max(d[0], d[1]); }
      } catch (e) { /* try the next variant */ }
    }
    if (best && bestDim > (haveDims ? Math.max(haveDims[0], haveDims[1]) : 0)) {
      fs.writeFileSync(path.join(HIRES, coin.t + ".png"), best);
      upgraded++;
      console.log(coin.t.padEnd(12), (haveDims ? haveDims.join("x") : "none") + " -> " + bestDim + "px");
    } else kept++;
  }
  console.log("\nupgraded " + upgraded + ", kept " + kept + ", no logo " + missing);
  console.log("hi-res originals in img/_hires — run tools/resize-logos.js to fold them in");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
