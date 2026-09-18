// Generates the whole world — hills, slime blocks, character clusters and
// coins — as ONE inline SVG, spliced into index.html between the <!--scene-->
// markers.
//   node tools/build-scene.mjs
//
// Everything lives in one 1536x520 coordinate space on purpose. A background
// assembled from an SVG plus absolutely-positioned HTML drifts apart the moment
// the viewport changes: the drawn ledge and the character standing on it are
// sized by different rules, so they line up at exactly one width. Inside a
// single viewBox with preserveAspectRatio="xMidYMax slice" the browser scales
// the whole scene as one illustration, and the alignment is correct at every
// resolution by construction.
//
// Inline rather than an <img src>: it must paint on the first frame with no
// request, and motion.js needs to reach individual nodes to animate them.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1536, H = 520;
const n = (v) => Math.round(v * 10) / 10;

// art.js is the generated manifest of name -> [w,h] for img/art/. It is no
// longer shipped to the browser, but reading it here means a character box is
// derived from the real artwork instead of a guessed aspect ratio.
const ART = (() => {
  const src = readFileSync(join(ROOT, 'art.js'), 'utf8');
  const box = {};
  // eslint-disable-next-line no-eval
  eval(src.replace(/^var /, 'var ') + '; Object.assign(box, ART);');
  return box;
})();

// ───────────────────────── hills ─────────────────────────
// A scalloped, puffy silhouette rather than a smooth ridge: a row of circles
// centred on the profile line, plus a polygon through those same centres down
// to the baseline. The circles bulge above the polygon and the union reads as
// one bushy mass. They carry no stroke, so overlapping them is free — that is
// the whole reason this is circles and not one hand-authored outline.
function scallop(cls, ys, rs) {
  const step = W / (ys.length - 1);
  let pts = `-60,${H + 40}`;
  ys.forEach((y, i) => { pts += ` ${n(-60 + (i * (W + 120)) / (ys.length - 1))},${n(y)}`; });
  pts += ` ${W + 60},${H + 40}`;
  let out = `<g class="${cls}"><polygon points="${pts}"/>`;
  ys.forEach((y, i) => {
    const cx = -60 + (i * (W + 120)) / (ys.length - 1);
    out += `<circle cx="${n(cx)}" cy="${n(y)}" r="${n(rs[i])}"/>`;
  });
  return out + '</g>';
}

// Read the profile back at an arbitrary x so a block can be planted ON the
// hill rather than at a number someone eyeballed once and never rechecked.
function heightAt(ys, x) {
  const t = Math.max(0, Math.min(ys.length - 1.0001, ((x + 60) / (W + 120)) * (ys.length - 1)));
  const i = Math.floor(t), f = t - i;
  return ys[i] + (ys[i + 1] - ys[i]) * f;
}

// The profile is a VALLEY — high at both edges, dipping through the middle —
// so the content column and the footer sit over paper rather than over green.
// Flattening this dip is how you make the footer grey-on-green again.
const BACK  = [376, 354, 397, 411, 410, 416, 416, 396, 310, 216];
const BACK_R = [110, 124, 112,  96,  84,  86,  98, 116, 130, 120];
const MID   = [424, 406, 440, 452, 452, 456, 456, 440, 366, 282];
const MID_R = [ 96, 108,  98,  84,  74,  76,  86, 100, 114, 106];

// ───────────────────────── slime blocks ─────────────────────────
// 2:1 isometric. Unlike the hills these DO carry the die line — that black
// outline is what makes them read as objects sitting on the landscape rather
// than as another shade of it.
function cube(x, y, w, h) {
  const half = w / 2, d = w / 4;
  const top = `${n(x)},${n(y + d)} ${n(x + half)},${n(y)} ${n(x + w)},${n(y + d)} ${n(x + half)},${n(y + d * 2)}`;
  const left = `${n(x)},${n(y + d)} ${n(x + half)},${n(y + d * 2)} ${n(x + half)},${n(y + d * 2 + h)} ${n(x)},${n(y + d + h)}`;
  const right = `${n(x + half)},${n(y + d * 2)} ${n(x + w)},${n(y + d)} ${n(x + w)},${n(y + d + h)} ${n(x + half)},${n(y + d * 2 + h)}`;
  return `<g class="cube">`
    + `<polygon class="c-l" points="${left}"/>`
    + `<polygon class="c-r" points="${right}"/>`
    + `<polygon class="c-t" points="${top}"/>`
    + `</g>`;
}

// A terraced platform on an isometric grid. Cells are drawn back to front by
// (i + j), which is the only order that makes the overlaps correct.
function platform(ox, oy, cells, w) {
  const half = w / 2, d = w / 4;
  return cells
    .slice()
    .sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2])
    .map(([i, j, lift = 0]) =>
      cube(ox + (i - j) * half, oy + (i + j) * d - lift * d * 1.6, w, w * 0.55))
    .join('');
}

// ───────────────────────── characters ─────────────────────────
// Inside the SVG, not as HTML <img>: that is what keeps a character standing
// on its block at every viewport. xMidYMax means the art sits on the bottom
// edge of its box, so the box bottom IS the character's feet.
function ch(name, x, footY, h, flip = false) {
  const dim = ART[name];
  if (!dim) throw new Error(`no art manifest entry for ${name}`);
  const w = h * (dim[0] / dim[1]);
  const t = flip ? ` transform="translate(${n(x * 2 + w)} 0) scale(-1 1)"` : '';
  return `<image class="ch" href="img/art/${name}.webp" x="${n(x)}" y="${n(footY - h)}" `
    + `width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMax meet"${t}/>`;
}

// ───────────────────────── coins ─────────────────────────
// A chain token, not a memecoin: the coins are the ground the game stands on,
// and a memecoin logo here competes with the ones inside the board.
function coin(id, cx, cy, r, href) {
  const inner = r * 0.62;
  return `<g class="coin" data-coin="${id}">`
    + `<circle class="co-face" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
    + `<circle class="co-shade" cx="${n(cx)}" cy="${n(cy + r * 0.16)}" r="${n(r * 0.86)}"/>`
    + `<clipPath id="cc-${id}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.84)}"/></clipPath>`
    + `<image href="${href}" x="${n(cx - inner)}" y="${n(cy - inner)}" width="${n(inner * 2)}" `
    + `height="${n(inner * 2)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#cc-${id})"/>`
    + `<circle class="co-ring" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
    + `</g>`;
}

// ───────────────────────── clouds ─────────────────────────
// Lime outline only. One closed path each: the earlier version was a pill plus
// two discs and the three outlines crossed each other into a scribble.
const CLOUD = 'M16 55 C7 55 1 48 1 41 C1 35 5 30 11 28 C10 18 18 9 29 9 '
  + 'C34 9 38 11 41 14 C45 6 53 2 61 2 C72 2 81 9 84 18 '
  + 'C86 17 88 17 90 17 C100 17 108 25 108 35 C108 36 108 37 108 38 '
  + 'C112 40 115 44 115 48 C115 52 112 55 108 55 Z';
function cloud(x, y, s) {
  return `<g class="cloud" transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">`
    + `<path d="${CLOUD}"/></g>`;
}

// ═════════════════════════ assemble ═════════════════════════
let body = '';

// Clouds sit behind everything, in the outer gutters and down in the valley
// only — anywhere else they surface between the cards as a hard-edged fragment.
body += '<g class="clouds">';
for (const [x, y, s] of [
  [-40, 40, 1.0], [52, 176, 0.66], [-20, 286, 0.86], [236, 128, 0.58],
  [1148, 96, 0.62], [1300, 6, 0.92], [1372, 196, 0.76], [1206, 300, 0.6],
  [560, 330, 0.5], [880, 348, 0.46],
]) body += cloud(x, y, s);
body += '</g>';

body += scallop('l-1', BACK, BACK_R);
body += scallop('l-2', MID, MID_R);

// The two ledges the clusters stand on. An isometric diamond of cells rather
// than a rectangle: a rectangular grid in 2:1 iso reads as a wall, not a floor.
const CUBE_W = 104;
// A dense rectangle of cells reads as a green wall. Three rows plus a short
// raised tier gives the silhouette a step, which is what makes it read as
// ground you could stand on.
const SLAB = [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [1, 2], [2, 2],
  [1, 0, 1], [2, 0, 1],
];
body += '<g class="blocks">';
body += platform(96, 330, SLAB, CUBE_W);
body += platform(1188, 318, SLAB.map(([i, j, l]) => [j, i, l]), CUBE_W);
// two loose blocks on the valley floor, small enough to stay texture
for (const [x, sz] of [[612, 62], [902, 54]]) {
  body += cube(x, heightAt(MID, x + sz / 2) - 6, sz, sz * 0.5);
}
body += '</g>';

// The coins ride above the landscape but behind the cast.
body += '<g class="coins">'
  + coin('hood', 156, 150, 33, 'img/svg/hood.svg')
  + coin('doge', 1376, 128, 31, 'img/DOGE.png')
  + coin('sol', 1250, 268, 27, 'img/svg/sol.svg')
  + coin('eth', 1122, 452, 29, 'img/svg/eth.svg')
  + coin('btc', 92, 336, 24, 'img/BITCOIN.png')
  + '</g>';

// The cast, back to front. The reference groups three or four characters into
// each bottom corner and lets them overlap — one mascot standing alone reads
// as a sticker someone forgot to peel off. Both clusters are kept clear of the
// content column: x under 340 on the left, over 1200 on the right.
body += '<g class="cast cast-l">'
  + ch('CHEEMS', 156, 420, 196)
  + ch('MOODENG', 8, 452, 186)
  + ch('NEIRO', 92, 474, 168)
  + ch('WIF', 242, 486, 152)
  + '</g>';
body += '<g class="cast cast-r">'
  + ch('HARAMBE', 1318, 424, 192)
  + ch('MANEKI', 1268, 408, 172, true)
  + ch('SLERF', 1206, 486, 166)
  + ch('PENGU', 1394, 490, 148)
  + '</g>';

const svg = `<svg class="hills" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" `
  + `aria-hidden="true" focusable="false">${body}</svg>`;

const file = join(ROOT, 'index.html');
const html = readFileSync(file, 'utf8');
const re = /(<!--scene-->)[\s\S]*?(<!--\/scene-->)/;
if (!re.test(html)) {
  console.error('index.html has no <!--scene--> … <!--/scene--> markers');
  process.exit(1);
}
writeFileSync(file, html.replace(re, `$1${svg}$2`));
console.log(`scene: ${svg.length} bytes inlined into index.html`);
