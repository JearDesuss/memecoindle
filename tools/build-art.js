// Build the crowd's character art from tools/art-sources.json.
//
// The crowd used to be background-removed coin logos: 250px token icons from
// CoinGecko, flood-filled and downscaled to 160px. Most token icons are a
// character crammed inside a coloured disc, so the flood fill returned a disc,
// and 250px of JPEG upscaled to a 164px @2x slot looked like mud. The result
// read as a smeared strip of poker chips rather than characters standing in
// grass.
//
// This instead pulls hand-picked, genuinely high-resolution artwork that already
// ships an alpha channel (600-4000px), trims it to the subject, and renders it
// at ART_H so the largest on-screen slot (82px @2x = 164px) has real pixels to
// draw from. Sources are recorded in art-sources.json so the set is
// reproducible and auditable.
//
// Needs Chrome on --remote-debugging-port=9223 (any page). Node 22+.
//   node tools/build-art.js            # download missing, then build
//   node tools/build-art.js --rebuild  # rebuild from the cache, no network
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, "art-sources.json"), "utf8"));
const CACHE = path.join(__dirname, ".art-cache");
const OUT = path.join(ROOT, "img", "art");
const ART_H = 288;   // tallest crowd slot is ~129px CSS; 288 covers 2x with headroom
const QUALITY = 0.86;
const REBUILD = process.argv.includes("--rebuild");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Trim to the subject, scale to ART_H, and re-encode with the alpha intact.
// Runs in the page because Chrome is the only image decoder we have.
const PAGE_FN = `
window.__art = function (src, H, q) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onerror = function () { resolve({ ok: false, reason: "load" }); };
    img.onload = function () {
      var W = img.naturalWidth, Hh = img.naturalHeight;
      if (!W || !Hh) return resolve({ ok: false, reason: "empty" });
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = Hh;
      var x = cv.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      var d;
      try { d = x.getImageData(0, 0, W, Hh).data; } catch (e) { return resolve({ ok: false, reason: "taint" }); }
      // bounding box of anything meaningfully opaque
      var minX = W, minY = Hh, maxX = -1, maxY = -1;
      for (var y = 0; y < Hh; y++) {
        for (var xx = 0; xx < W; xx++) {
          if (d[(y * W + xx) * 4 + 3] > 24) {
            if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return resolve({ ok: false, reason: "blank" });
      var bw = maxX - minX + 1, bh = maxY - minY + 1;
      var s = H / bh;
      var ow = Math.max(1, Math.round(bw * s)), oh = H;
      var o = document.createElement("canvas");
      o.width = ow; o.height = oh;
      var ox = o.getContext("2d");
      ox.imageSmoothingQuality = "high";
      ox.drawImage(img, minX, minY, bw, bh, 0, 0, ow, oh);
      resolve({ ok: true, w: ow, h: oh, srcW: W, srcH: Hh, data: o.toDataURL("image/webp", q).split(",")[1] });
    };
    img.src = src;
  });
};
`;

function mime(b) {
  if (b.slice(1, 4).toString() === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

async function download(ticker, url) {
  const dest = path.join(CACHE, ticker);
  const hit = fs.existsSync(CACHE) && fs.readdirSync(CACHE).find((f) => f.replace(/\.[^.]+$/, "") === ticker);
  if (hit) return path.join(CACHE, hit);
  if (REBUILD) return null;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*,*/*" }, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  const m = mime(b);
  if (!m) throw new Error("not an image");
  const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[m];
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(dest + ext, b);
  return dest + ext;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await (await fetch("http://localhost:9223/json")).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Runtime.evaluate", { expression: PAGE_FN });

  const manifest = {};
  let bytes = 0, failed = [];
  for (const [ticker, meta] of Object.entries(SRC)) {
    let file;
    try { file = await download(ticker, meta.url); } catch (e) { failed.push(ticker + " (fetch: " + e.message + ")"); continue; }
    if (!file) { failed.push(ticker + " (not cached)"); continue; }
    const b = fs.readFileSync(file);
    const uri = "data:" + mime(b) + ";base64," + b.toString("base64");
    const r = await send("Runtime.evaluate", {
      expression: "window.__art(" + JSON.stringify(uri) + "," + ART_H + "," + QUALITY + ")",
      awaitPromise: true, returnByValue: true,
    });
    const v = r.result && r.result.result && r.result.result.value;
    if (!v || !v.ok) { failed.push(ticker + " (" + ((v && v.reason) || "cdp") + ")"); continue; }
    const out = Buffer.from(v.data, "base64");
    fs.writeFileSync(path.join(OUT, ticker + ".webp"), out);
    manifest[ticker] = [v.w, v.h];
    bytes += out.length;
    console.log(ticker.padEnd(12), v.srcW + "x" + v.srcH + " -> " + v.w + "x" + v.h, (out.length / 1024).toFixed(1) + "kb");
  }

  fs.writeFileSync(
    path.join(ROOT, "art.js"),
    "// generated by tools/build-art.js — ticker -> [w,h] of img/art/<TICKER>.webp\n" +
    "// Hand-picked high-resolution character art for the crowd; see tools/art-sources.json.\n" +
    "var ART = " + JSON.stringify(manifest) + ";\n"
  );
  console.log("\n" + Object.keys(manifest).length + " characters, " + (bytes / 1024).toFixed(0) + "kb total");
  if (failed.length) console.log("failed: " + failed.join(", "));
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
