// Downscale img/*.png to SIZE x SIZE WebP via headless Chrome canvas (CDP, no deps).
// SIZE defaults to 160: the largest on-screen use is a 52px coin card, so 160
// covers 2x DPR with room. Run tools/cut-logos.js BEFORE this — the cut-outs
// want the full-resolution originals.
// Needs Chrome running with --remote-debugging-port=9223 (any page).
// Usage: SIZE=160 node tools/resize-logos.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const IMG = path.join(ROOT, "img");

async function main() {
  const list = await (await fetch("http://localhost:9223/json")).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");

  const files = fs.readdirSync(IMG).filter((f) => f.endsWith(".png"));
  let done = 0, saved = 0, before = 0, after = 0;
  for (const f of files) {
    const p = path.join(IMG, f);
    const buf = fs.readFileSync(p);
    before += buf.length;
    if (buf.length < 6000) { after += buf.length; done++; continue; } // already tiny
    const mime = buf[0] === 0xff ? "image/jpeg" : (buf.slice(0, 4).toString() === "RIFF" ? "image/webp" : "image/png");
    const dataUri = "data:" + mime + ";base64," + buf.toString("base64");
    const SZ = Number(process.env.SIZE) || 160;
    const expr = `(async () => {
      const SZ = ${SZ};
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); img.src = ${JSON.stringify(dataUri)}; });
      const c = document.createElement('canvas'); c.width = SZ; c.height = SZ;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      const s = Math.max(SZ / img.width, SZ / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, (SZ - w) / 2, (SZ - h) / 2, w, h);
      return c.toDataURL('image/webp', 0.88).split(',')[1];
    })()`;
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    const b64 = r.result && r.result.result && r.result.result.value;
    if (b64) {
      const out = Buffer.from(b64, "base64");
      if (out.length > 100 && out.length < buf.length) { fs.writeFileSync(p, out); saved++; after += out.length; }
      else after += buf.length;
    } else { after += buf.length; console.log("skip (no result):", f); }
    done++;
  }
  console.log(`resized ${saved}/${done}: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB`);
  ws.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
