// Second source for logos CoinGecko only holds at 250px.
//
// Blur mode draws the logo into a 150px frame, so the reveal wants ~300px to
// stay crisp on a 2x screen (test/cdp-test.js asserts exactly that). CoinGecko
// caps a lot of coins at its 250px `large`, and /original/ is no bigger for
// them — but DexScreener's CDN usually holds the uploader's file at 500-800px.
//
// The catch is that DexScreener is searched by ticker, and a ticker is not an
// identity: `FOX`, `TOBY`, `PANDA` and `VLAD` all have several unrelated
// projects. So a candidate is only accepted when it is (a) on the chain the
// dataset claims for the coin, (b) a symbol or name match, and (c) visually the
// same artwork as the logo we already ship — compared in-browser at 24x24
// greyscale. (c) is the one that actually matters: it makes a wrong-project
// image impossible to accept no matter how the search ranks.
//
// Accepted files land in img/_hires; run tools/resize-logos.js afterwards to
// fold them in, exactly like tools/refetch-logos.js.
//
// Needs Chrome running with --remote-debugging-port=9223 (any page).
//   node tools/upsize-logos.js                 # every logo under 300px
//   node tools/upsize-logos.js --min 320       # different resolution target
//   node tools/upsize-logos.js --tickers A,B   # just these
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {};
eval(fs.readFileSync(path.join(ROOT, "data.js"), "utf8")); // -> COINS
const IMG = path.join(ROOT, "img");
const HIRES = path.join(IMG, "_hires");

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const MIN = Number(argOf("--min", 300));
const ONLY = argOf("--tickers", null);
// How different two 24x24 greyscale renders may be and still count as the same
// artwork. Calibrated against real pairs: the same mascot re-cropped (circular
// mask vs square original, different padding) lands at 0.02-0.15, while a
// genuinely different project sharing the ticker lands at 0.36+. 0.20 sits in
// that gap. Anything rejected is printed, so a near-miss can be reviewed by eye
// and forced through with --maxdiff.
const MAX_DIFF = Number(argOf("--maxdiff", 0.2));

const CHAIN = { "Robinhood": "robinhood", "Base": "base", "BNB Chain": "bsc", "Solana": "solana", "Ethereum": "ethereum", "Bitcoin": null, "Cardano": null, "Own chain": null, "Stable Chain": null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function mimeOf(buf) {
  if (buf[0] === 0xff) return "image/jpeg";
  if (buf.slice(0, 4).toString() === "RIFF") return "image/webp";
  return "image/png";
}

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

async function candidates(coin) {
  const want = CHAIN[coin.c];
  if (!want) return [];
  const out = [];
  const seen = new Set();
  for (const q of [coin.n, coin.t]) {
    try {
      const res = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      for (const p of (j.pairs || [])) {
        if (p.chainId !== want || !p.info || !p.info.imageUrl) continue;
        if (norm(p.baseToken.symbol) !== norm(coin.t) && norm(p.baseToken.name) !== norm(coin.n)) continue;
        if (seen.has(p.info.imageUrl)) continue;
        seen.add(p.info.imageUrl);
        out.push({ url: p.info.imageUrl, name: p.baseToken.name, liq: (p.liquidity && p.liquidity.usd) || 0 });
      }
    } catch (e) { /* try the other query */ }
    await sleep(700);
    if (out.length) break;
  }
  // a name match beats a bare symbol match; liquidity breaks the rest
  out.sort((a, b) => (norm(a.name) === norm(coin.n) ? 0 : 1) - (norm(b.name) === norm(coin.n) ? 0 : 1) || b.liq - a.liq);
  return out.slice(0, 3);
}

async function main() {
  const list = await (await fetch("http://localhost:9223/json")).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no Chrome page on :9223");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");

  // Mean absolute difference of two images rendered at 24x24 greyscale over
  // white, in 0..1. Same artwork re-encoded lands near 0; a different picture
  // lands well above the threshold.
  const compare = async (a, b) => {
    const expr = `(async () => {
      const draw = async (src) => {
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('load')); im.src = src; });
        const N = 24, c = document.createElement('canvas'); c.width = N; c.height = N;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, N, N);
        x.imageSmoothingQuality = 'high';
        const s = Math.max(N / im.width, N / im.height);
        const w = im.width * s, h = im.height * s;
        x.drawImage(im, (N - w) / 2, (N - h) / 2, w, h);
        const d = x.getImageData(0, 0, N, N).data, g = [];
        for (let i = 0; i < d.length; i += 4) g.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        return g;
      };
      const A = await draw(${JSON.stringify(a)}), B = await draw(${JSON.stringify(b)});
      let s = 0; for (let i = 0; i < A.length; i++) s += Math.abs(A[i] - B[i]);
      return s / A.length / 255;
    })()`;
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    const v = r.result && r.result.result;
    if (!v || v.value == null) return null;
    return v.value;
  };

  fs.mkdirSync(HIRES, { recursive: true });
  const only = ONLY ? new Set(ONLY.split(",").map((t) => t.trim().toUpperCase())) : null;
  const targets = COINS.filter((c) => {
    if (only) return only.has(c.t.toUpperCase());
    const p = path.join(IMG, c.t + ".png");
    if (!fs.existsSync(p)) return false;
    const d = dims(fs.readFileSync(p));
    return d && Math.min(d[0], d[1]) < MIN;
  });
  console.log(targets.length + " logos under " + MIN + "px\n");

  let upgraded = 0, rejected = 0, none = 0;
  for (const coin of targets) {
    const shipped = path.join(IMG, coin.t + ".png");
    const cur = fs.readFileSync(shipped);
    const curDim = Math.max(...(dims(cur) || [0]));
    const curUri = "data:" + mimeOf(cur) + ";base64," + cur.toString("base64");

    const cands = await candidates(coin);
    if (!cands.length) { console.log("--  " + coin.t.padEnd(13) + "no candidate on " + coin.c); none++; continue; }

    let took = false;
    for (const cand of cands) {
      let buf = null, d = null;
      for (const u of [cand.url + (cand.url.includes("?") ? "&" : "?") + "size=lg", cand.url]) {
        try {
          const r = await fetch(u);
          if (!r.ok) continue;
          const b = Buffer.from(await r.arrayBuffer());
          const dd = dims(b);
          if (dd && Math.max(dd[0], dd[1]) > Math.max(...(d || [0]))) { buf = b; d = dd; }
        } catch (e) { /* next url shape */ }
      }
      if (!buf || !d) continue;
      const newDim = Math.max(d[0], d[1]);
      if (newDim <= curDim) continue;

      const diff = await compare(curUri, "data:" + mimeOf(buf) + ";base64," + buf.toString("base64"));
      if (diff == null) { console.log("??  " + coin.t.padEnd(13) + "compare failed"); continue; }
      if (diff > MAX_DIFF) {
        console.log("REJ " + coin.t.padEnd(13) + curDim + "px vs " + newDim + "px  diff " + diff.toFixed(3) +
          "  (\"" + cand.name + "\" — different artwork, kept ours)");
        continue;
      }
      fs.writeFileSync(path.join(HIRES, coin.t + ".png"), buf);
      console.log("OK  " + coin.t.padEnd(13) + curDim + "px -> " + newDim + "px  diff " + diff.toFixed(3));
      upgraded++; took = true;
      break;
    }
    if (!took && cands.length) rejected++;
  }
  console.log("\nupgraded " + upgraded + ", rejected/too-small " + rejected + ", no candidate " + none);
  console.log("staged in img/_hires — run tools/resize-logos.js to fold them in");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
