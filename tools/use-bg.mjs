// Wire a supplied background plate into the page, replacing the generated SVG.
//   node tools/use-bg.mjs <path-to-image>
//
// Does four things, in this order, because each depends on the last:
//   1. Re-encodes the plate to WebP through headless Edge's canvas. A 1536px
//      PNG plate is routinely 1-3MB; this is the difference between the world
//      painting on the first screenful and painting after it.
//   2. Samples the plate's own top-centre pixel and writes that exact value
//      into --paper. The plate's cream has to BE the page's cream or there is
//      a visible seam across the full width where the image stops, and no
//      amount of eyeballing a hex gets it right.
//   3. Empties the <!--scene--> markers — the hand-built SVG world is replaced,
//      not layered under, so leaving it in ships a second landscape nobody sees.
//   4. Restamps ?v= so a returning visitor cannot pair new CSS with old art.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import pw from 'file:///C:/Users/akbar/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node tools/use-bg.mjs <path-to-image>');
  process.exit(1);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif' };
const mime = MIME[extname(src).toLowerCase()];
if (!mime) { console.error('unsupported image type:', extname(src)); process.exit(1); }

const b64 = readFileSync(src).toString('base64');
const browser = await pw.chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');

const out = await page.evaluate(async ({ d, mime }) => {
  const img = new Image();
  img.src = `data:${mime};base64,${d}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  // The plate's field colour, read from a point that is always empty sky:
  // the exact horizontal centre, a little below the top edge.
  const p = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.04), 1, 1).data;
  const hex = '#' + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  return {
    w: img.naturalWidth,
    h: img.naturalHeight,
    hex,
    webp: c.toDataURL('image/webp', 0.92).split(',')[1],
  };
}, { d: b64, mime });
await browser.close();

const dest = join(ROOT, 'img', 'bg.webp');
writeFileSync(dest, Buffer.from(out.webp, 'base64'));
const before = readFileSync(src).length, after = readFileSync(dest).length;

// ── --paper takes the plate's own field colour ──
let css = readFileSync(join(ROOT, 'style.css'), 'utf8');
const paper = /(--paper: )#[0-9A-Fa-f]{6}(;)/;
if (!paper.test(css)) { console.error('could not find --paper in style.css'); process.exit(1); }
css = css.replace(paper, `$1${out.hex}$2`);
writeFileSync(join(ROOT, 'style.css'), css);

// ── the generated SVG world is replaced, not layered under ──
const idx = join(ROOT, 'index.html');
let html = readFileSync(idx, 'utf8');
const re = /(<!--scene-->)[\s\S]*?(<!--\/scene-->)/;
if (!re.test(html)) { console.error('index.html has no <!--scene--> markers'); process.exit(1); }
html = html.replace(re, '$1$2');
writeFileSync(idx, html);

execFileSync(process.execPath, [join(ROOT, 'tools', 'bump-assets.js')], { stdio: 'inherit' });

console.log(`\nplate  ${out.w}x${out.h}  aspect ${(out.w / out.h).toFixed(3)}`);
console.log(`webp   ${(before / 1024).toFixed(0)}kB -> ${(after / 1024).toFixed(0)}kB  (img/bg.webp)`);
console.log(`--paper set to ${out.hex} from the plate's own field`);
