// Turn the square coin logos into transparent character cut-outs for the
// background crowd, the way pokedle.net's Pokemon lineup works.
//
// Most of our logos are opaque WebP with a flat baked-in background, so the
// roster read as a row of poker chips. This flood-fills the background away
// from the border inward (connected only — a white belly stays white), feathers
// the edge, trims to the subject, and keeps only the results that actually look
// like a cut-out character rather than a disc or a full-bleed square.
//
// Needs a static server on :8471 (same origin, so the canvas isn't tainted) and
// Chrome on --remote-debugging-port=9223. Node 22+ for native WebSocket.
//
//   node tools/cut-logos.js            # write img/cut/*.png + cutouts.js
//   node tools/cut-logos.js --dry      # just report what would pass
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "img", "cut");
const DRY = process.argv.includes("--dry");
const PORT = 8471, CDP = 9223;

eval(fs.readFileSync(path.join(ROOT, "logos.js"), "utf8")); // -> LOGOS

// Hand-curated drops: these cut cleanly but are wordmarks, charts or flat
// geometry — they read as debris in a crowd of characters, not as someone
// standing there. Judged by eye from tools/cut-logos.js --dry output.
const NOT_A_CHARACTER = new Set([
  "SC", "GRIFFAIN", "ANALOS", "CLANKER", "FARTCOIN", "LIBRA", "TST", "SWARMS",
  "GOAT", "ANSEM", "DUPE", "PONS", "GORK"
]);
const TICKERS = Object.keys(LOGOS).filter(t => !NOT_A_CHARACTER.has(t));

// ── the worker that runs inside the page ──────────────────────────────────
// Returns { ok, reason, dataURL, w, h, fill } for one ticker.
const PAGE_FN = `
window.__cut = function (src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = function () { resolve({ ok: false, reason: "load-failed" }); };
    img.onload = function () {
      var W = img.naturalWidth, H = img.naturalHeight;
      if (!W || !H) return resolve({ ok: false, reason: "empty" });
      var S = Number(window.__maxEdge || 256);
      var scale = Math.min(1, S / Math.max(W, H));
      var cw = Math.max(1, Math.round(W * scale)), ch = Math.max(1, Math.round(H * scale));
      var cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cw, ch);
      var id;
      try { id = ctx.getImageData(0, 0, cw, ch); }
      catch (e) { return resolve({ ok: false, reason: "tainted" }); }
      var d = id.data, N = cw * ch;

      // does it already ship an alpha channel worth keeping?
      var transparent = 0;
      for (var i = 0; i < N; i++) if (d[i * 4 + 3] < 200) transparent++;
      var hadAlpha = transparent / N > 0.04;

      if (!hadAlpha) {
        // dominant border colour, quantised so noise doesn't split the vote
        var votes = {}, bx, by, k;
        function vote(x, y) {
          k = (y * cw + x) * 4;
          var key = (d[k] >> 3) + "," + (d[k + 1] >> 3) + "," + (d[k + 2] >> 3);
          votes[key] = (votes[key] || 0) + 1;
        }
        for (bx = 0; bx < cw; bx++) { vote(bx, 0); vote(bx, ch - 1); }
        for (by = 0; by < ch; by++) { vote(0, by); vote(cw - 1, by); }
        var best = null, bestN = 0, total = 0;
        for (var key in votes) { total += votes[key]; if (votes[key] > bestN) { bestN = votes[key]; best = key; } }
        var uniformity = bestN / total;
        var UNIF = Number(window.__unif || 0.42);
        if (uniformity < UNIF) return resolve({ ok: false, reason: "busy-border(" + uniformity.toFixed(2) + ")" });
        var bg = best.split(",").map(function (v) { return parseInt(v, 10) * 8 + 4; });

        // flood fill inward from every matching border pixel
        var TOL = 42, SOFT = 78;
        function dist(k2) {
          var dr = d[k2] - bg[0], dg = d[k2 + 1] - bg[1], db = d[k2 + 2] - bg[2];
          return Math.sqrt(dr * dr + dg * dg + db * db);
        }
        var seen = new Uint8Array(N), stack = [];
        function push(x, y) {
          if (x < 0 || y < 0 || x >= cw || y >= ch) return;
          var p = y * cw + x;
          if (seen[p]) return;
          if (dist(p * 4) > TOL) return;
          seen[p] = 1; stack.push(p);
        }
        for (bx = 0; bx < cw; bx++) { push(bx, 0); push(bx, ch - 1); }
        for (by = 0; by < ch; by++) { push(0, by); push(cw - 1, by); }
        while (stack.length) {
          var p = stack.pop(), px = p % cw, py = (p / cw) | 0;
          d[p * 4 + 3] = 0;
          push(px + 1, py); push(px - 1, py); push(px, py + 1); push(px, py - 1);
        }
        // feather: pixels touching a hole that are still near the bg colour
        var copy = new Uint8Array(N);
        for (var q = 0; q < N; q++) copy[q] = d[q * 4 + 3];
        for (var y2 = 0; y2 < ch; y2++) {
          for (var x2 = 0; x2 < cw; x2++) {
            var p2 = y2 * cw + x2;
            if (copy[p2] === 0) continue;
            var touching = (x2 > 0 && copy[p2 - 1] === 0) || (x2 < cw - 1 && copy[p2 + 1] === 0) ||
                           (y2 > 0 && copy[p2 - cw] === 0) || (y2 < ch - 1 && copy[p2 + cw] === 0);
            if (!touching) continue;
            var dd = dist(p2 * 4);
            if (dd < SOFT) d[p2 * 4 + 3] = Math.round(255 * Math.max(0, (dd - TOL) / (SOFT - TOL)));
          }
        }
      }

      ctx.putImageData(id, 0, 0);

      // trim to the subject and score the silhouette
      var minX = cw, minY = ch, maxX = -1, maxY = -1, opaque = 0;
      for (var y3 = 0; y3 < ch; y3++) {
        for (var x3 = 0; x3 < cw; x3++) {
          if (d[(y3 * cw + x3) * 4 + 3] > 24) {
            opaque++;
            if (x3 < minX) minX = x3; if (x3 > maxX) maxX = x3;
            if (y3 < minY) minY = y3; if (y3 > maxY) maxY = y3;
          }
        }
      }
      if (maxX < 0) return resolve({ ok: false, reason: "all-removed" });
      var bw = maxX - minX + 1, bh = maxY - minY + 1;
      var fill = opaque / (bw * bh);   // 1.0 = square, ~0.79 = circle, lower = shaped
      if (fill > 0.88) return resolve({ ok: false, reason: "square(" + fill.toFixed(2) + ")", fill: fill });
      if (opaque / N < 0.04) return resolve({ ok: false, reason: "too-thin", fill: fill });

      // Removing a flat background still leaves a disc when the artwork itself is
      // a coin badge, which is exactly the shape we're trying to get away from.
      // Score the silhouette against a perfect inscribed circle and drop matches.
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, rad = Math.min(bw, bh) / 2;
      var inter = 0, uni = 0;
      for (var y4 = minY; y4 <= maxY; y4++) {
        for (var x4 = minX; x4 <= maxX; x4++) {
          var on = d[(y4 * cw + x4) * 4 + 3] > 24 ? 1 : 0;
          var ddx = x4 - cx, ddy = y4 - cy;
          var inC = (ddx * ddx + ddy * ddy) <= rad * rad ? 1 : 0;
          if (on && inC) inter++;
          if (on || inC) uni++;
        }
      }
      var circleIoU = uni ? inter / uni : 0;
      if (circleIoU > 0.86) return resolve({ ok: false, reason: "disc(" + circleIoU.toFixed(2) + ")", fill: fill });

      // Near-white line art disappears against a pale sky — it reads as a smudge
      // in the crowd, not a character. Require some actual dark/coloured mass.
      var mass = 0;
      for (var y5 = minY; y5 <= maxY; y5++) {
        for (var x5 = minX; x5 <= maxX; x5++) {
          var k5 = (y5 * cw + x5) * 4;
          if (d[k5 + 3] <= 24) continue;
          var lum = (d[k5] * 0.299 + d[k5 + 1] * 0.587 + d[k5 + 2] * 0.114);
          if (lum < 205) mass++;
        }
      }
      var massFrac = opaque ? mass / opaque : 0;
      if (massFrac < 0.3) return resolve({ ok: false, reason: "washed-out(" + massFrac.toFixed(2) + ")", fill: fill });

      var out = document.createElement("canvas");
      out.width = bw; out.height = bh;
      out.getContext("2d").drawImage(cv, minX, minY, bw, bh, 0, 0, bw, bh);
      // cap the long edge at what the front crowd band actually needs at 2x DPR
      var CAP = Number(window.__cap || 160);
      var k = Math.min(1, CAP / Math.max(bw, bh));
      var fin = document.createElement("canvas");
      fin.width = Math.max(1, Math.round(bw * k));
      fin.height = Math.max(1, Math.round(bh * k));
      var fx = fin.getContext("2d");
      fx.imageSmoothingQuality = "high";
      fx.drawImage(out, 0, 0, fin.width, fin.height);
      resolve({ ok: true, dataURL: fin.toDataURL("image/webp", 0.9),
                w: fin.width, h: fin.height, fill: fill, hadAlpha: hadAlpha });
    };
    img.src = src;
  });
};
"ready";
`;

(async () => {
  const list = await (await fetch("http://127.0.0.1:" + CDP + "/json")).json();
  const page = list.find(t => t.type === "page");
  if (!page) throw new Error("no Chrome page — start Chrome with --remote-debugging-port=" + CDP);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/" });
  await new Promise(r => setTimeout(r, 1500));
  // how uniform the border must be to trust the flood fill. 0.42 keeps the
  // cast wide; raise it if a logo starts cutting badly.
  await ev("window.__unif = " + (Number(process.env.UNIF) || 0.42) + ";" +
    "window.__maxEdge = " + (Number(process.env.MAX_EDGE) || 512) + ";" +
    "window.__cap = " + (Number(process.env.CAP) || 160) + ";'ok'");
  await ev(PAGE_FN);

  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

  const kept = {}, rejected = {};
  let bytes = 0;
  for (const t of TICKERS) {
    const src = "http://127.0.0.1:" + PORT + "/" + LOGOS[t];
    let r;
    try { r = await ev(`window.__cut(${JSON.stringify(src)})`); }
    catch (e) { rejected[t] = "eval:" + e.message.slice(0, 60); continue; }
    if (!r || !r.ok) { rejected[t] = (r && r.reason) || "unknown"; continue; }
    if (!DRY) {
      const buf = Buffer.from(r.dataURL.split(",")[1], "base64");
      fs.writeFileSync(path.join(OUT_DIR, t + ".png"), buf);
      bytes += buf.length;
    }
    kept[t] = { w: r.w, h: r.h, fill: +r.fill.toFixed(2), alpha: !!r.hadAlpha };
  }

  const names = Object.keys(kept);
  console.log("kept " + names.length + " / " + TICKERS.length + " cut-outs" +
    (DRY ? " (dry run)" : ", " + (bytes / 1024).toFixed(0) + "KB"));
  const why = {};
  for (const t in rejected) { const k = rejected[t].replace(/\(.*\)/, ""); why[k] = (why[k] || 0) + 1; }
  console.log("rejected:", JSON.stringify(why));

  if (!DRY) {
    const manifest = names.map(t => JSON.stringify(t) + ":[" + kept[t].w + "," + kept[t].h + "]").join(",");
    fs.writeFileSync(path.join(ROOT, "cutouts.js"),
      "// generated by tools/cut-logos.js — ticker -> [w,h] of img/cut/<TICKER>.png\n" +
      "// Background-removed character art for the crowd standing in the grass.\n" +
      "var CUTOUTS = {" + manifest + "};\n");
    console.log("wrote img/cut/ and cutouts.js");
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
