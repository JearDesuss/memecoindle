// Generates the landscape SVG and splices it into index.html between the
// <!--scene--> markers. Inline on purpose: the world must paint on the first
// frame with no request, and it must survive any viewport width.
//   node tools/build-scene.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1536, H = 420;

const n = (v) => Math.round(v * 10) / 10;

// The profile is a valley, not a rolling field: the land rises at both edges
// and dips through the middle, so the content column and the footer line sit
// over paper rather than over green. That dip is the whole reason the page
// stays readable without a scrim.
const PROFILE = {
  back:  [ 46, 112, 248, 346, 380, 342, 240, 104,  40],
  mid:   [126, 194, 306, 382, 404, 378, 296, 184, 114],
  front: [264, 304, 356, 388, 398, 386, 350, 298, 254],
};

// one smooth top edge carried down to the baseline
function ridge(ys) {
  const step = W / (ys.length - 1);
  const pts = ys.map((y, i) => [n(i * step), n(y)]);
  let d = `M-40,${H + 40} L-40,${pts[0][1]} L${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i];
    const cx = n((px + x) / 2);
    d += ` C${cx},${py} ${cx},${y} ${x},${y}`;
  }
  d += ` L${W + 40},${pts[pts.length - 1][1]} L${W + 40},${H + 40} Z`;
  return d;
}

// read the profile back at an arbitrary x, so a block can be planted *on* the
// hill rather than at a number someone eyeballed once and never rechecked
function heightAt(ys, x) {
  const step = W / (ys.length - 1);
  const t = Math.max(0, Math.min(ys.length - 1.0001, x / step));
  const i = Math.floor(t), f = t - i;
  return ys[i] + (ys[i + 1] - ys[i]) * f;
}

// ── one isometric cube: a lit top plus two side faces ──
function cube(x, y, w, h, cls = '') {
  const half = w / 2, d = w / 4;           // 2:1 isometric footprint
  const top = `${n(x)},${n(y + d)} ${n(x + half)},${n(y)} ${n(x + w)},${n(y + d)} ${n(x + half)},${n(y + d * 2)}`;
  const left = `${n(x)},${n(y + d)} ${n(x + half)},${n(y + d * 2)} ${n(x + half)},${n(y + d * 2 + h)} ${n(x)},${n(y + d + h)}`;
  const right = `${n(x + half)},${n(y + d * 2)} ${n(x + w)},${n(y + d)} ${n(x + w)},${n(y + d + h)} ${n(x + half)},${n(y + d * 2 + h)}`;
  return `<g class="cube ${cls}">`
    + `<polygon class="c-l" points="${left}"/>`
    + `<polygon class="c-r" points="${right}"/>`
    + `<polygon class="c-t" points="${top}"/>`
    + `</g>`;
}

// ── a terraced stack of cubes: the ledge each mascot stands on ──
function plateau(x, cols, rows, cw, cls) {
  let out = '';
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const cx = x + c * cw + r * cw * 0.5;
      // plant the row on the front bank, then step it back and up
      const ground = heightAt(PROFILE.front, cx + cw / 2);
      out += cube(cx, ground - 14 - r * cw * 0.36, cw, cw * 0.6, cls);
    }
  }
  return out;
}

const LAYERS = [
  { ys: PROFILE.back,  light: 'l-1', dark: 'd-1', drop: 34 },
  { ys: PROFILE.mid,   light: 'l-2', dark: 'd-2', drop: 32 },
  { ys: PROFILE.front, light: 'l-3', dark: 'd-3', drop: 28 },
];

let body = '';
for (const L of LAYERS) {
  const d = ridge(L.ys);
  // the light band is the same ridge showing above a copy pushed down by
  // `drop` — one path, one translate, and the lit top face falls out of it
  body += `<path class="${L.light}" d="${d}"/>`;
  body += `<path class="${L.dark}" d="${d}" transform="translate(0 ${L.drop})"/>`;
}

// the two ledges, under where the mascots stand
body += plateau(56, 4, 3, 62, 'p-l');
body += plateau(1146, 4, 3, 64, 'p-r');

// a handful of loose blocks down in the valley, small enough to stay texture
for (const [x, s] of [[452, 40], [598, 30], [742, 34], [906, 28], [1042, 38]]) {
  body += cube(x, heightAt(PROFILE.front, x + s / 2) + 34, s, s * 0.5, 'p-s');
}

const svg = `<svg class="hills" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${body}</svg>`;

const file = join(ROOT, 'index.html');
const html = readFileSync(file, 'utf8');
const re = /(<!--scene-->)[\s\S]*?(<!--\/scene-->)/;
if (!re.test(html)) {
  console.error('index.html has no <!--scene--> … <!--/scene--> markers');
  process.exit(1);
}
writeFileSync(file, html.replace(re, `$1${svg}$2`));
console.log(`scene: ${svg.length} bytes inlined into index.html`);
