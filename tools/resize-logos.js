// Fold the hi-res originals staged in img/_hires into the shipped img/*.png
// logos, at the resolution the UI actually renders.
//
// SIZE defaults to 320. The largest on-screen use is Blur mode: a 150px frame
// that opens at scale 1.55 and settles at 1.13, i.e. ~170px CSS or ~340px on a
// 2x screen. The previous 160px target was less than half that, so the reveal —
// the moment the player is staring hardest at the logo — landed soft. Coin
// cards (52px) and autocomplete rows (28px) are comfortably covered either way.
//
// Nothing is ever upscaled: a coin whose source is only 200px stays 200px
// rather than being blown up into a blurry 320.
//
// Run tools/refetch-logos.js first to populate img/_hires.
// Needs Chrome running with --remote-debugging-port=9223 (any page).
//   SIZE=320 node tools/resize-logos.js
//   node tools/resize-logos.js --clean   # also delete img/_hires when done
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const IMG = path.join(ROOT, "img");
const HIRES = path.join(IMG, "_hires");
const SZ = Number(process.env.SIZE) || 320;
const CLEAN = process.argv.includes("--clean");

function mimeOf(buf) {
  if (buf[0] === 0xff) return "image/jpeg";
  if (buf.slice(0, 4).toString() === "RIFF") return "image/webp";
  return "image/png";
}

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
  let done = 0, rewritten = 0, before = 0, after = 0;
  for (const f of files) {
    const shipped = path.join(IMG, f);
    const staged = path.join(HIRES, f);
    // the staged original wins when we have one, otherwise re-encode in place
    const srcPath = fs.existsSync(staged) ? staged : shipped;
    const cur = fs.readFileSync(shipped);
    const buf = fs.readFileSync(srcPath);
    before += cur.length;
    const dataUri = "data:" + mimeOf(buf) + ";base64," + buf.toString("base64");
    const expr = `(async () => {
      const CAP = ${SZ};
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); img.src = ${JSON.stringify(dataUri)}; });
      // never upscale — a 200px source stays 200px
      const SZ = Math.min(CAP, Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = SZ; c.height = SZ;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      const s = Math.max(SZ / img.width, SZ / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, (SZ - w) / 2, (SZ - h) / 2, w, h);
      return { d: c.toDataURL('image/webp', 0.88).split(',')[1], px: SZ };
    })()`;
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    const v = r.result && r.result.result && r.result.result.value;
    if (v && v.d) {
      const out = Buffer.from(v.d, "base64");
      // keep whichever is better: a bigger render, or the smaller file at equal size
      if (out.length > 100 && (srcPath === staged || out.length < cur.length)) {
        fs.writeFileSync(shipped, out);
        rewritten++; after += out.length;
      } else after += cur.length;
    } else { after += cur.length; console.log("skip (no result):", f); }
    done++;
  }
  console.log(`rewrote ${rewritten}/${done} at up to ${SZ}px: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB`);
  if (CLEAN && fs.existsSync(HIRES)) { fs.rmSync(HIRES, { recursive: true, force: true }); console.log("removed img/_hires"); }
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
