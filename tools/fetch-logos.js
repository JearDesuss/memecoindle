// Fetch coin logos for the memecoindle dataset.
// Tries CoinGecko search first (best quality, 250px), falls back to DexScreener.
// Writes img/<TICKER>.png and logos.js manifest. Throttled to respect free rate limits.
// Usage: node tools/fetch-logos.js [--only MISSING]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
eval(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"));
const IMG_DIR = path.join(ROOT, "img");
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": "memecoindle-logo-fetch/1.0" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": "memecoindle-logo-fetch/1.0" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 400) throw new Error("too small (" + buf.length + "b)");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// Ticker -> CoinGecko id, for coins whose symbol is ambiguous (FOX, TOBY,
// PANDA, JOHN...) or non-latin (币安人生, 哈基米). Search-by-ticker happily
// returns an unrelated project with the same symbol, and a wrong logo is worse
// than none — Blur mode is nothing but the logo. One /coins/markets call
// resolves the whole table.
const OVERRIDES = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "logo-overrides.json"), "utf8"));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => k[0] !== "_"));
  } catch (e) { return {}; }
})();
const PINNED = {}; // ticker -> image url, filled by resolvePinned()

async function resolvePinned(tickers) {
  const ids = tickers.filter((t) => OVERRIDES[t]).map((t) => OVERRIDES[t]);
  if (!ids.length) return;
  const byId = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).join(",");
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const rows = await jget("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=" + chunk);
        rows.forEach((r) => { if (r.image) byId[r.id] = r.image; });
        break;
      } catch (e) {
        console.log("    pinned lookup " + (/429/.test(e.message) ? "rate-limited" : e.message) + ", retry " + attempt);
        await sleep(/429/.test(e.message) ? 40000 : 3000);
      }
    }
    await sleep(2200);
  }
  for (const t of tickers) {
    const url = byId[OVERRIDES[t]];
    if (url) PINNED[t] = url;
    else if (OVERRIDES[t]) console.log("--  " + t.padEnd(12) + "pinned id " + OVERRIDES[t] + " returned no image");
  }
}

async function fromCoinGecko(coin) {
  if (PINNED[coin.t]) return PINNED[coin.t];
  for (const q of [coin.n, coin.t]) {
    try {
      const j = await jget("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(q));
      await sleep(2200);
      const hits = (j.coins || []).filter((h) => h.large && !/missing_/.test(h.large));
      // prefer exact symbol match, then exact name match
      let hit = hits.find((h) => norm(h.symbol) === norm(coin.t)) ||
                hits.find((h) => norm(h.name) === norm(coin.n));
      if (hit) return hit.large;
    } catch (e) {
      if (/429/.test(e.message)) { await sleep(30000); } else { await sleep(2200); }
    }
  }
  return null;
}

async function fromDexScreener(coin) {
  for (const q of [coin.t, coin.n]) {
    try {
      const j = await jget("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q));
      await sleep(600);
      const pairs = (j.pairs || []).filter((p) => p.info && p.info.imageUrl &&
        norm(p.baseToken.symbol) === norm(coin.t));
      // highest liquidity match wins
      pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      if (pairs[0]) return pairs[0].info.imageUrl;
    } catch (e) { await sleep(600); }
  }
  return null;
}

(async () => {
  const onlyMissing = process.argv.includes("--only") || process.argv.includes("--missing");
  // --force re-downloads even when a file exists, so a low-res logo can be
  // replaced with CoinGecko's 250px original. --tickers limits the run.
  const force = process.argv.includes("--force");
  const tArg = process.argv.indexOf("--tickers");
  const onlyTickers = tArg > -1 && process.argv[tArg + 1]
    ? new Set(process.argv[tArg + 1].split(",").map((t) => t.trim().toUpperCase()))
    : null;
  const manifest = {};
  let got = 0, missed = [];
  // Resolve pinned ids up front, but only for coins this run will actually
  // download — no point spending a request on logos already on disk.
  await resolvePinned(COINS.filter((c) => {
    if (onlyTickers && !onlyTickers.has(c.t.toUpperCase())) return false;
    const d = path.join(IMG_DIR, c.t + ".png");
    return force || !(fs.existsSync(d) && fs.statSync(d).size > 400);
  }).map((c) => c.t));
  for (const coin of COINS) {
    const dest = path.join(IMG_DIR, coin.t + ".png");
    const rel = "img/" + coin.t + ".png";
    const exists = fs.existsSync(dest) && fs.statSync(dest).size > 400;
    if (exists) { manifest[coin.t] = rel; got++; }
    if (onlyTickers && !onlyTickers.has(coin.t.toUpperCase())) continue;
    if (exists && !force) continue;
    let url = await fromCoinGecko(coin);
    let src = "coingecko";
    if (!url) { url = await fromDexScreener(coin); src = "dexscreener"; }
    if (url) {
      try {
        const size = await download(url, dest);
        manifest[coin.t] = rel; got++;
        console.log("OK  " + coin.t.padEnd(12) + src.padEnd(12) + (size / 1024).toFixed(1) + "KB");
      } catch (e) {
        missed.push(coin.t);
        console.log("ERR " + coin.t.padEnd(12) + "download failed: " + e.message);
      }
    } else {
      missed.push(coin.t);
      console.log("--  " + coin.t.padEnd(12) + "no source found");
    }
  }
  const js = "// generated by tools/fetch-logos.js — ticker -> logo path. Missing tickers fall back to a procedural badge.\nvar LOGOS = " +
    JSON.stringify(manifest, null, 0) + ";\n";
  fs.writeFileSync(path.join(ROOT, "logos.js"), js);
  console.log("\nDONE: " + got + "/" + COINS.length + " logos; missing: " + (missed.join(", ") || "none"));
})();
