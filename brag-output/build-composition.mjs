// Writes brag-output/composition/index.html from ONE timing table, so every
// tile flip, key tick and sound effect is placed by the same numbers and the
// picture and the audio cannot drift apart.
//   node brag-output/build-composition.mjs
//
// The three guesses and every tile colour are real: graded by the game's own
// grade() against the answer POPCAT (see brag-plan.md).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'composition', 'index.html');
const DURATION = 23;
const r2 = (n) => Math.round(n * 1000) / 1000;

// ── the round, exactly as the game grades it ──
const GUESSES = [
  { t: 'DOGE', n: 'Dogecoin', img: 'DOGE.png', tiles: [
    ['x', 'Own chain'], ['y', 'Dog'], ['x', '2013', '▲'], ['y', '$88B', '▼'], ['x', '$11B', '▼']] },
  { t: 'WIF', n: 'Dogwifhat', img: 'WIF.png', tiles: [
    ['g', 'Solana'], ['y', 'Dog'], ['g', '2023'], ['g', '$4.8B'], ['y', '$136M', '▼']] },
  { t: 'POPCAT', n: 'Popcat', img: 'POPCAT.png', tiles: [
    ['g', 'Solana'], ['g', 'Cat'], ['g', '2023'], ['g', '$2B'], ['g', '$50M']] },
];
const HEADS = ['Chain', 'Type', 'Year', 'Peak', 'Now'];

// ── timing ──
const KEY = 0.13;          // one typed letter
const FLIP = 0.42;         // one tile turning over, as on the site (--dur-flip)
const HALF = FLIP / 2;     // the edge-on moment, when the colour lands
const WIN = 16.02;         // beat-locked: the strongest cue in the bed
const HOP = 17.02;         // beat-locked: the winning row hops
const LOCK = 20.02;        // beat-locked: the lockup lands

// per guess: when typing starts, when the key is pressed, flip step, first flip
const ROUND = [
  { type: 5.00, press: 5.70, step: 0.18, flip: 5.90 },
  { type: 9.00, press: 9.60, step: 0.18, flip: 9.80 },
  // the final row turns slower, for the suspense, and is solved so that the
  // LAST tile lands on the 16.02 strong cue
  { type: 13.00, press: 14.20, step: 0.25, flip: r2(WIN - 4 * 0.25 - HALF) },
];

// Real lengths, measured with ffprobe and rounded up. Without a duration the
// linter treats a short SFX as running to the end of the video, so every cue
// on a lane 'overlaps' every later one; with the true length it can see they
// don't. The bell is the only long one.
const LEN = {
  'click2.ogg': 0.06, 'click_003.ogg': 0.02, 'impactBell_heavy_000.ogg': 1.49,
  'impactSoft_medium_001.ogg': 0.19, 'impactSoft_medium_004.ogg': 0.15,
};
const lenOf = (f) => LEN[f] || (f.startsWith('keypress-') ? 0.25 : 0.3);
const sfx = [];
const add = (t, file, vol, lane) => sfx.push({ t: r2(t), file, vol, lane });
const KEYS = ['003', '007', '011', '015', '019', '023', '027', '031'].map((n) => `keypress-${n}.wav`);
let keyN = 0;
const keyTick = (t, vol = 0.45) => { add(t, KEYS[keyN % KEYS.length], vol, 11 + (keyN % 8)); keyN++; };

// ── hook ──
const HOOK = 'Guess the memecoin.';
const HOOK_T0 = 0.72, HOOK_STEP = 0.045;
add(0.55, 'impactSoft_medium_001.ogg', 0.8, 20);
[...HOOK].forEach((c, i) => { if (c !== ' ' && i % 2 === 0) keyTick(HOOK_T0 + i * HOOK_STEP, 0.32); });

// ── the rounds ──
GUESSES.forEach((gs, gi) => {
  const R = ROUND[gi];
  [...gs.t].forEach((_, i) => keyTick(R.type + i * KEY));
  add(R.press, 'click_003.ogg', 0.7, 21);
  gs.tiles.forEach((_, ti) => {
    const land = R.flip + ti * R.step + HALF;
    // the win's last tile is scored by the bell instead of a tick
    if (gi === 2 && ti === 4) return;
    add(land, 'click2.ogg', 0.42, 22);
  });
});
add(WIN, 'impactBell_heavy_000.ogg', 0.75, 23);
add(LOCK - 0.02, 'impactSoft_medium_004.ogg', 0.8, 24);

// ═══════════ markup ═══════════
const hookSpans = [...HOOK].map((c, i) => `<span id="hk${i}">${c === ' ' ? '&#32;' : c}</span>`).join('');
const headCells = HEADS.map((h, i) => `<div class="head" id="hd${i}">${h}</div>`).join('');

const rows = GUESSES.map((gs, gi) => {
  const tiles = gs.tiles.map(([s, v, d], ti) =>
    `<div class="tile" id="r${gi}t${ti}" data-s="${s}"><span class="tv">${v}</span>${d ? `<span class="dir">${d}</span>` : ''}</div>`).join('');
  return `
        <div class="row" id="row${gi}">
          ${gi === 2 ? '<div class="glow" id="glow"></div>' : ''}
          <div class="label" id="lb${gi}">
            <img src="assets/img/${gs.img}" alt="" width="86" height="86" />
            <div class="lt"><div class="tk">$${gs.t}</div><div class="nm">${gs.n}</div></div>
          </div>
          ${tiles}
        </div>`;
}).join('');

const typedFields = GUESSES.map((gs, gi) =>
  `<div class="typed" id="ty${gi}">${[...gs.t].map((c, i) => `<span id="ty${gi}c${i}">${c}</span>`).join('')}</div>`).join('');

const pips = Array.from({ length: 6 }, (_, i) => `<div class="pip" id="pp${i}"></div>`).join('');
const badges = ['6/6', '5/6', '4/6', '3/6'].map((b, i) => `<span class="badge" id="bd${i}">${b}</span>`).join('');

const CAPTIONS = [
  ['Six guesses. Five clues each.', 3.05, 6.90],
  ['Yellow means close.', 7.10, 10.85],
  ['Green is exact.', 11.05, 16.98],
  ['It was the cat.', 17.20, 18.85],
];
const caps = CAPTIONS.map(([c], i) => `<div class="cap" id="cp${i}">${c}</div>`).join('');

const WORD = 'memedle';
const wordSpans = [...WORD].map((c, i) => `<span id="wd${i}">${c}</span>`).join('');

const audio = [
  `<audio id="bgm" src="assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3" data-start="0" data-duration="${DURATION}" data-track-index="10" data-volume="1"></audio>`,
  ...sfx.map((s, i) => `<audio id="sfx${String(i).padStart(2, '0')}" src="assets/sfx/${s.file}" data-start="${s.t}" data-duration="${lenOf(s.file)}" data-track-index="${s.lane}" data-volume="${s.vol}"></audio>`),
].join('\n    ');

// ═══════════ timeline ═══════════
const COLOR = { g: ['#8BD418', '#16161A'], y: ['#FFC53D', '#3A2A00'], x: ['#FB6F84', '#3A0C14'] };
const tl = [];
const T = (s) => tl.push(s);

// hook: the coin drops, the line types
T(`tl.fromTo("#coin", { y: -300, rotation: -28, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.5, ease: "bounce.out" }, 0.1);`);
[...HOOK].forEach((_, i) => T(`tl.set("#hk${i}", { opacity: 1 }, ${r2(HOOK_T0 + i * HOOK_STEP)});`));
T(`tl.to("#hookwrap", { opacity: 0, y: -30, duration: 0.3, ease: "power2.in" }, 2.55);`);

// the board slides up, the heads arrive left to right
T(`tl.fromTo("#panel", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, 2.7);`);
HEADS.forEach((_, i) => T(`tl.fromTo("#hd${i}", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, ${r2(3.25 + i * 0.07)});`));
T(`tl.set("#bd0", { opacity: 1 }, 2.7);`);
T(`tl.set("#ph", { opacity: 1 }, 2.7);`);

// captions: in fast, then hold at least the reading floor, then out fast
CAPTIONS.forEach(([, a, b], i) => {
  T(`tl.fromTo("#cp${i}", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, ${a});`);
  T(`tl.to("#cp${i}", { y: -18, opacity: 0, duration: 0.2, ease: "power2.in" }, ${b});`);
});

// every tile starts blank, exactly like the site before its turn
GUESSES.forEach((gs, gi) => gs.tiles.forEach((_, ti) =>
  T(`tl.set("#r${gi}t${ti}", { backgroundColor: "#F2F0E8", borderColor: "#E4E2D9", transformPerspective: 700 }, 0);`)));
// A waiting tile hides its words with OPACITY, not transparent ink: `check`
// reads a transparent fill as glyphs painted invisible, which it is right to
// call a bug. Opacity is the honest way to say "not shown yet".
GUESSES.forEach((gs, gi) => gs.tiles.forEach((_, ti) =>
  T(`tl.set("#r${gi}t${ti} > span", { opacity: 0 }, 0);`)));

GUESSES.forEach((gs, gi) => {
  const R = ROUND[gi];
  // typing: the placeholder goes, letters land one at a time
  T(`tl.set("#ph", { opacity: 0 }, ${R.type});`);
  T(`tl.set("#ty${gi}", { opacity: 1 }, ${R.type});`);
  [...gs.t].forEach((_, i) => T(`tl.set("#ty${gi}c${i}", { opacity: 1 }, ${r2(R.type + i * KEY)});`));
  // the arrow key presses down onto the paper and springs back
  T(`tl.to("#go", { y: 6, boxShadow: "0 0px 0 #16161A", duration: 0.08, ease: "power2.out" }, ${R.press});`);
  T(`tl.to("#go", { y: 0, boxShadow: "0 6px 0 #16161A", duration: 0.22, ease: "back.out(2.4)" }, ${r2(R.press + 0.09)});`);
  // the field clears, a pip is spent, the badge counts down
  T(`tl.set("#ty${gi}", { opacity: 0 }, ${r2(R.press + 0.06)});`);
  if (gi < 2) T(`tl.set("#ph", { opacity: 1 }, ${r2(R.press + 0.06)});`);
  T(`tl.set("#pp${gi}", { backgroundColor: "#16161A" }, ${r2(R.press + 0.06)});`);
  T(`tl.set("#bd${gi}", { opacity: 0 }, ${r2(R.press + 0.06)});`);
  T(`tl.set("#bd${gi + 1}", { opacity: 1 }, ${r2(R.press + 0.06)});`);
  // the row arrives, then its tiles turn over in order
  T(`tl.fromTo("#row${gi}", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, ${r2(R.press + 0.1)});`);
  gs.tiles.forEach(([s], ti) => {
    const t0 = R.flip + ti * R.step;
    const [bg, ink] = COLOR[s];
    T(`tl.to("#r${gi}t${ti}", { rotationX: -90, duration: ${HALF}, ease: "power2.in" }, ${r2(t0)});`);
    // The colour lands at the edge-on frame: a snap, never a fade. Both halves
    // are chained with ">" ("where the last tween ended"), not absolute times:
    // 15.06 + 0.21 is 15.270000000000001 in floating point, and the two halves
    // overlapped by that hair.
    T(`tl.set("#r${gi}t${ti}", { backgroundColor: "${bg}", borderColor: "#16161A", color: "${ink}" }, ">");`);
    T(`tl.set("#r${gi}t${ti} > span", { opacity: 1 }, "<");`);
    T(`tl.to("#r${gi}t${ti}", { rotationX: 0, duration: ${HALF}, ease: "power2.out" }, ">");`);
    if (s === 'g') T(`tl.fromTo("#r${gi}t${ti}", { scale: 1 }, { scale: 1.07, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 }, ${r2(t0 + FLIP)});`);
  });
});

// A stable resting state for every seek before 16.02. Without it, GSAP's
// fromTo applies its from-values when the tween is AUTHORED, so an early seek
// inherited whichever glow tween was written last. Renders seek out of order.
T(`tl.set("#glow", { opacity: 0, scale: 0.9 }, 0);`);
// beat-locked: 16.02s — the last tile lands and the whole row glows
T(`tl.fromTo("#glow", { opacity: 0, scale: 0.9 }, { opacity: 0.85, scale: 1, duration: 0.35, ease: "power3.out", immediateRender: false }, ${WIN});`);
// beat-grid: the glow breathes on 16.52, 17.52, 18.02 — non-text accents may hit every beat
[16.52, 17.52, 18.02].forEach((b) => T(`tl.fromTo("#glow", { scale: 1.04 }, { scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, ${b});`));
// beat-locked: 17.02s — the winning row hops tile by tile. 12px, not more:
// rows sit 14px apart, and a taller hop clipped into the tile above.
GUESSES[2].tiles.forEach((_, ti) =>
  T(`tl.to("#r2t${ti}", { y: -12, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 }, ${r2(HOP + ti * 0.07)});`));

// the board leaves, the lockup arrives
T(`tl.to("#panel", { opacity: 0, y: -40, scale: 0.97, duration: 0.4, ease: "power2.in" }, 18.8);`);
// beat-locked: 20.02s — the grid mark lands
T(`tl.fromTo("#mark", { scale: 0.55, rotation: -10, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(1.9)" }, ${r2(LOCK - 0.5)});`);
[...WORD].forEach((_, i) => T(`tl.fromTo("#wd${i}", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34, ease: "back.out(2)" }, ${r2(LOCK + 0.04 + i * 0.045)});`));
T(`tl.fromTo("#tag", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${r2(LOCK + 0.25)});`);
T(`tl.fromTo("#url", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${r2(LOCK + 0.45)});`);

// The bed: in over the hook, warm fade under the logo. data-volume is left at
// 1 on purpose: a volume tween REPLACES that gain rather than scaling it, so the
// tweens alone carry the level (0 -> 0.30, hold, -> 0).
T(`tl.fromTo("#bgm", { volume: 0 }, { volume: 0.3, duration: 0.9, ease: "none" }, 0);`);
T(`tl.to("#bgm", { volume: 0, duration: 1.4, ease: "none" }, ${DURATION - 1.5});`);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>memedle brag</title>
    <script src="assets/js/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Baloo 2"; src: url("assets/fonts/Baloo2-800.woff2") format("woff2"); font-weight: 800; font-display: block; }
      @font-face { font-family: "Figtree"; src: url("assets/fonts/Figtree-var.woff2") format("woff2"); font-weight: 400 800; font-display: block; }
      body { margin: 0; background: #FEFDF7; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #FEFDF7; color: #16161A; font-family: "Figtree", sans-serif; }
      .clip { position: absolute; inset: 0; }

      /* hook */
      #hook { display: flex; align-items: center; justify-content: center; }
      #hookwrap { display: flex; align-items: center; gap: 64px; }
      #coin { width: 250px; height: 250px; box-sizing: border-box; border-radius: 50%; background: #FFFFFF; border: 12px solid #16161A; display: grid; place-items: center; font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 150px; line-height: 1; box-shadow: 0 10px 0 #16161A; }
      .hookline { font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 116px; letter-spacing: -0.03em; white-space: pre; line-height: 1; }
      .hookline span { opacity: 0; }

      /* board */
      #board { display: flex; flex-direction: column; align-items: center; box-sizing: border-box; padding-top: 40px; }
      .capslot { position: relative; width: 1700px; height: 112px; }
      .cap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 86px; letter-spacing: -0.02em; line-height: 1; opacity: 0; }
      #panel { width: 1784px; margin-top: 18px; background: #FFFFFF; border: 3px solid #E4E2D9; border-radius: 30px; box-shadow: 0 5px 0 #E4E2D9; opacity: 0; }
      .bar { display: flex; justify-content: space-between; align-items: center; padding: 22px 48px; border-bottom: 3px solid #E4E2D9; font-size: 28px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
      .badgeslot { position: relative; width: 80px; height: 30px; }
      .badge { position: absolute; right: 0; top: 0; color: #4A4A52; opacity: 0; }
      .pbody { padding: 28px 48px 34px; display: flex; flex-direction: column; gap: 20px; }
      .inrow { display: flex; gap: 18px; }
      .field { position: relative; flex: 1; height: 100px; box-sizing: border-box; border-radius: 999px; background: #F2F0E8; border: 3px solid #E4E2D9; font-size: 44px; }
      #ph, .typed { position: absolute; left: 38px; top: 0; bottom: 0; display: flex; align-items: center; }
      #ph { color: #5E5E68; opacity: 0; }
      .typed { font-weight: 800; letter-spacing: 0.02em; opacity: 0; }
      .typed span { opacity: 0; }
      #go { width: 128px; height: 100px; box-sizing: border-box; border-radius: 20px; background: #BCF23F; border: 3px solid #16161A; box-shadow: 0 6px 0 #16161A; display: grid; place-items: center; font-size: 52px; font-weight: 800; }
      .pips { display: flex; gap: 12px; justify-content: center; }
      .pip { width: 66px; height: 13px; border-radius: 999px; background: #C9C8C2; }
      .grid, .row { display: grid; grid-template-columns: 340px repeat(5, minmax(0, 1fr)); gap: 12px; align-items: center; }
      .head { font-size: 27px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #4A4A52; text-align: center; opacity: 0; }
      .rows { display: flex; flex-direction: column; gap: 14px; }
      .row { position: relative; opacity: 0; }
      .glow { position: absolute; left: 340px; right: -14px; top: -12px; bottom: -12px; margin-left: -2px; border-radius: 26px; background: #BCF23F; opacity: 0; z-index: 0; }
      .label, .tile { position: relative; z-index: 1; }
      .label { display: flex; align-items: center; gap: 16px; }
      .label img { width: 86px; height: 86px; border-radius: 16px; border: 2px solid #E4E2D9; object-fit: cover; }
      .tk { font-weight: 800; font-size: 38px; line-height: 1.05; }
      .nm { font-size: 26px; color: #5E5E68; }
      .tile { height: 124px; box-sizing: border-box; border-radius: 20px; border: 3px solid #E4E2D9; background: #F2F0E8; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-weight: 800; font-size: 40px; line-height: 1.1; }
      .dir { font-size: 26px; }

      /* lockup */
      #lockup { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px; }
      .lock { display: flex; align-items: center; gap: 44px; }
      #mark { display: block; height: 256px; width: auto; }
      .word { font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 212px; letter-spacing: -0.035em; line-height: 1; }
      .word span { display: inline-block; opacity: 0; }
      #tag { font-size: 54px; font-weight: 700; color: #4A4A52; opacity: 0; }
      #url { font-size: 40px; font-weight: 800; color: #16161A; background: #BCF23F; padding: 12px 30px; border-radius: 999px; border: 3px solid #16161A; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${DURATION}" data-fps="30">

      <section id="hook" class="clip" data-start="0" data-duration="2.9" data-track-index="1">
        <div id="hookwrap">
          <div id="coin">?</div>
          <div class="hookline">${hookSpans}</div>
        </div>
      </section>

      <section id="board" class="clip" data-start="2.6" data-duration="16.7" data-track-index="2">
        <div class="capslot">${caps}</div>
        <div id="panel">
          <div class="bar"><span>Day #29 · Classic</span><span class="badgeslot">${badges}</span></div>
          <div class="pbody">
            <div class="inrow">
              <div class="field"><span id="ph">Type a memecoin…</span>${typedFields}</div>
              <div id="go">→</div>
            </div>
            <div class="pips">${pips}</div>
            <div class="grid"><div></div>${headCells}</div>
            <div class="rows">${rows}
            </div>
          </div>
        </div>
      </section>

      <section id="lockup" class="clip" data-start="19.2" data-duration="${r2(DURATION - 19.2)}" data-track-index="3">
        <div class="lock">
          <img id="mark" src="assets/img/mark.webp" alt="" width="262" height="256" />
          <div class="word">${wordSpans}</div>
        </div>
        <div id="tag">One memecoin a day. Six guesses.</div>
        <div id="url">memedle-weld.vercel.app</div>
      </section>

    ${audio}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${tl.join('\n      ')}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);
console.log(`${tl.length} timeline entries, ${sfx.length} sfx cues, ${DURATION}s`);
console.log(`final row: first flip ${ROUND[2].flip}s, last tile lands ${r2(ROUND[2].flip + 4 * ROUND[2].step + HALF)}s (cue ${WIN}s)`);
