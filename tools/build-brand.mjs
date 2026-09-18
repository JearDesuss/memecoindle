// Build every brand image the site ships from the two supplied sources.
//   node tools/build-brand.mjs
//
// Sources (kept in brand/, never deployed — see .vercelignore):
//   brand/icon-src.png    1254x1254  the app icon: lime field, black-framed 3x3
//   brand/banner-src.png  1692x930   the lockup: character grid + wordmark
//
// Everything is derived, so replacing a source and re-running this is the
// whole update. Nothing here is hand-cropped with a guessed number: the black
// frame is FOUND in each image and every crop is measured from it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pw from 'file:///C:/Users/akbar/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'img', 'brand');
mkdirSync(OUT, { recursive: true });

const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const browser = await pw.chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');

const res = await page.evaluate(async ({ icon, banner }) => {
  const load = async (d) => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
  const canvasOf = (img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    return { c, x, px: x.getImageData(0, 0, c.width, c.height).data };
  };
  // The bounding box of the black frame: every pixel dark enough to be the
  // frame's ink. The artwork inside is colourful, so a luminance floor of 38
  // picks up the frame and ignores the tiles.
  const frameBox = ({ c, px }, region) => {
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    const [rx0, ry0, rx1, ry1] = region || [0, 0, c.width, c.height];
    for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
      const i = (y * c.width + x) * 4;
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (l < 38) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const crop = (src, sx, sy, sw, sh, dw, dh) => {
    const c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
    return c;
  };
  // Downscale in halving steps. One jump from 1254 to 16 throws away almost
  // every source pixel and the 3x3 grid turns to mush; halving keeps the tile
  // edges crisp all the way down.
  const stepDown = (src, sx, sy, sw, sh, size) => {
    let cur = crop(src, sx, sy, sw, sh, sw, sh);
    while (cur.width / 2 > size) cur = crop(cur, 0, 0, cur.width, cur.height, Math.round(cur.width / 2), Math.round(cur.height / 2));
    return crop(cur, 0, 0, cur.width, cur.height, size, size);
  };
  const png = (c) => c.toDataURL('image/png').split(',')[1];

  const out = {};

  // ── the icon ──
  const iconImg = await load(icon);
  const I = canvasOf(iconImg);
  const f = frameBox(I);
  out.iconFrame = f;
  // Full icon for surfaces that mask their own corners (iOS home screen): the
  // lime margin is the designed safe zone, so it is kept as drawn.
  out['apple-touch-icon.png'] = png(stepDown(iconImg, 0, 0, I.c.width, I.c.height, 180));
  // Tight crop for the browser tab. At 16px the designed margin would spend a
  // third of the pixels on flat lime and shrink the grid to unreadable, so the
  // tab icon keeps only a thin lime ring around the frame.
  const pad = Math.round(f.w * 0.07);
  const side = Math.max(f.w, f.h) + pad * 2;
  const cx = Math.round(f.x0 + f.w / 2 - side / 2), cy = Math.round(f.y0 + f.h / 2 - side / 2);
  for (const s of [16, 32, 48, 64]) out[`favicon-${s}.png`] = png(stepDown(iconImg, cx, cy, side, side, s));

  // ── the lockup's character grid, keyed off its white ground ──
  const banImg = await load(banner);
  const B = canvasOf(banImg);
  // The wordmark is black too, so a box search that reaches it swallows the
  // start of the "m" (a fixed 42% cutoff did exactly that: 409px wide instead
  // of ~331). Instead, walk right from the frame's left edge and stop at the
  // first run of fully light columns: that is the gap between mark and word.
  const rough = frameBox(B, [0, 0, Math.round(B.c.width * 0.6), B.c.height]);
  const lightCol = (x) => {
    for (let y = rough.y0; y <= rough.y1; y++) {
      const i = (y * B.c.width + x) * 4;
      if (0.2126 * B.px[i] + 0.7152 * B.px[i + 1] + 0.0722 * B.px[i + 2] < 200) return false;
    }
    return true;
  };
  let gapAt = rough.x1;
  for (let x = rough.x0 + 40, run = 0; x < rough.x1; x++) {
    run = lightCol(x) ? run + 1 : 0;
    if (run >= 6) { gapAt = x - run; break; }
  }
  const g = frameBox(B, [0, 0, gapAt + 1, B.c.height]);
  out.gridFrame = g;
  const m = 4; // keep the frame's anti-aliased edge
  const gw = g.w + m * 2, gh = g.h + m * 2;
  const gc = document.createElement('canvas');
  gc.width = gw; gc.height = gh;
  const gx = gc.getContext('2d', { willReadFrequently: true });
  gx.drawImage(banImg, g.x0 - m, g.y0 - m, gw, gh, 0, 0, gw, gh);
  const id = gx.getImageData(0, 0, gw, gh), d = id.data;
  // Flood-fill from the four corners across near-white pixels only. That makes
  // the ground OUTSIDE the frame transparent while the pale tiles INSIDE it
  // (the white cat, the statue) stay opaque — they are fenced in by the frame,
  // so the fill can never reach them. A plain "white -> transparent" key would
  // have punched holes straight through them.
  const seen = new Uint8Array(gw * gh);
  const white = (i) => d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
  const stack = [[0, 0], [gw - 1, 0], [0, gh - 1], [gw - 1, gh - 1]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const k = y * gw + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (!white(i)) continue;
    d[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  // soften the one-pixel fringe where the fill met the frame's anti-aliasing
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = (y * gw + x) * 4;
    if (d[i + 3] === 0) continue;
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < gw && ny < gh && d[(ny * gw + nx) * 4 + 3] === 0;
    });
    if (edge && l > 150) d[i + 3] = Math.round(255 * (1 - (l - 150) / 105));
  }
  gx.putImageData(id, 0, 0);
  // 256px tall: the header draws it at ~100px, so this out-resolves it at 2x.
  const markH = 256, markW = Math.round(gw * markH / gh);
  const mark = document.createElement('canvas');
  mark.width = markW; mark.height = markH;
  const mx = mark.getContext('2d');
  mx.imageSmoothingQuality = 'high';
  mx.drawImage(gc, 0, 0, markW, markH);
  out['mark.webp'] = mark.toDataURL('image/webp', 0.92).split(',')[1];

  // ── the social card: 1200x630, built ENTIRELY from banner pixels ──
  // The first version filled the card with #FFFFFF and pasted the lockup on
  // top. The banner's ground is not pure white, so that left a visible
  // rectangle behind the wordmark. Now the whole banner is drawn, scaled so
  // the lockup spans ~80% of the card and centred on the lockup itself: no
  // pixel of the card comes from anywhere else, so there is no seam to find.
  const content = frameBox(B); // frame + wordmark together
  const og = document.createElement('canvas');
  og.width = 1200; og.height = 630;
  const ox = og.getContext('2d');
  const scale = Math.min(960 / content.w, 440 / content.h);
  const ccx = content.x0 + content.w / 2, ccy = content.y0 + content.h / 2;
  const bx = 600 - ccx * scale, by = 315 - ccy * scale;
  const bw = B.c.width * scale, bh = B.c.height * scale;
  // guard: the scaled banner must still cover the card, or a transparent
  // (black, in a JPEG) strip appears along an edge
  if (bx > 0 || by > 0 || bx + bw < 1200 || by + bh < 630) {
    throw new Error('banner does not cover the card at this scale: ' + JSON.stringify({ bx, by, bw, bh }));
  }
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(banImg, bx, by, bw, bh);
  // JPEG, not PNG: 460kB of PNG for a link preview slows every share, and at
  // q .9 the black wordmark on white is visually indistinguishable.
  out['og.jpg'] = og.toDataURL('image/jpeg', 0.9).split(',')[1];
  out.contentBox = content;
  return out;
}, { icon: b64('brand/icon-src.png'), banner: b64('brand/banner-src.png') });
await browser.close();

for (const [name, data] of Object.entries(res)) {
  if (typeof data !== 'string') continue;
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
}

// favicon.ico at the site root, for browsers and crawlers that still request
// /favicon.ico blind. ICO can carry PNG payloads directly (Vista+), so this is
// a 6-byte header and one 16-byte entry per size in front of the PNG bytes.
const sizes = [16, 32, 48];
const pngs = sizes.map((s) => readFileSync(join(OUT, `favicon-${s}.png`)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1);
  head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync(join(ROOT, 'favicon.ico'), Buffer.concat([head, ...pngs]));

console.log('icon frame  ', JSON.stringify(res.iconFrame));
console.log('grid frame  ', JSON.stringify(res.gridFrame));
console.log('lockup box  ', JSON.stringify(res.contentBox));
for (const n of ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'mark.webp', 'og.jpg'])
  console.log(n.padEnd(22), (readFileSync(join(OUT, n)).length / 1024).toFixed(1) + 'kB');
console.log('favicon.ico'.padEnd(22), (readFileSync(join(ROOT, 'favicon.ico')).length / 1024).toFixed(1) + 'kB');
