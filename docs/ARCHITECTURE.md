# Architecture

Zero-dependency static site. No build step, no framework, no bundler. Four
scripts loaded in order; everything else is optional.

```
index.html      the whole dashboard + modals (help/settings/stats/archive/reveal/board)
style.css       the whole design system (tokens up top in :root)
data.js         the item list — 151 coins + enums + tier functions
logos.js        generated manifest: ticker -> img/<TICKER>.png
art.js          generated manifest: name -> [w,h] of img/art/<NAME>.webp
lb.js           leaderboard/pot client (dormant until LB_API is set)
game.js         the engine (IIFE, no globals except what data/lb expose)
img/            coin logos, up to 320px WebP (misnamed .png — content sniffing wins)
img/art/        hand-picked high-res character art for the background crowd
server/         optional Cloudflare Worker for leaderboard + pot
tools/          dev scripts (fetch/resize logos, build crowd art, schedule, artifact build)
test/           CDP end-to-end test
```

## Layout

One screen, no home/game split: a three-column dashboard over the overworld.
Left rail switches mode, centre is the live board, right rail carries Yesterday
and the rules. Below it sits "More Memedle" (the other modes, Endless, Archive)
and the text links. At 1040px the right rail drops to a full-width row; at 760px
everything stacks with the board ordered first, since that is what you came for.

## Routing

A hash router, so static hosting needs no rewrite rules:

| hash | board |
|------|-------|
| `#/` (or empty, or anything unknown) | classic, today |
| `#/<mode>` | that mode, today |
| `#/<mode>/unlimited` | that mode, endless random coins |
| `#/<mode>/d<N>` | that mode, archived puzzle N |

`route()` runs on load and on `hashchange`, rebuilds the board in place, and
closes any open modal.

Archive runs write their own `md_day_<mode>_<N>` progress but `recordResult()`
skips them, so replaying an old puzzle can never inflate or break a streak.
This is asserted in the test suite. Modes are declared once in the `MODES` array in
game.js — id, display name, icon, blurb, shuffle seed, and `kind`.

## The three modes

| mode | kind | the puzzle | reveal ladder |
|------|------|-----------|---------------|
| Classic | `grid` | five-axis feedback per guess | — (feedback *is* the ladder) |
| Blur | `stage` | the coin's logo, heavily blurred | blur shrinks each miss |
| Lore | `stage` | one wiki sentence, name redacted | clue chips |

`stage` modes share one engine: six guesses, misses listed as `.miss-row`, and
one clue chip revealed per miss from the `CLUES` ladder (chain → year → type →
peak → now). Only Classic has the per-day hint.

## The daily pick

Every client must agree on each mode's coin with no server. `game.js`:

- `EPOCH = 2026-08-21` (local time). Day number = whole days since epoch.
- Each mode has its **own fixed seed**; a mulberry32 Fisher–Yates shuffle of
  the coin indices gives that mode one canonical permutation, identical
  everywhere. Three seeds → three different coins per day.
- Daily coin = `ORDER[mode][day % length]`.
- **Classic keeps the original `0x5EED1337`**, so its historical sequence is
  unchanged from before the multi-mode split. Never change that seed.

Independent shuffles do occasionally hand the same coin to two modes on the same
day, which turns solving one into a free hint for the other. `picksFor(day)`
assigns modes in a fixed order and, on a collision, walks that mode's
permutation forward by `STRIDE = 61` until it finds a free coin. Classic is
assigned first, so it never walks and its sequence is untouched. The stride is
large on purpose: a `+1` walk lands on that mode's *next day*, producing a
same-coin-twice-in-a-row repeat. 151 is prime, so any stride eventually visits
every index. Verified over 400 days: zero same-day collisions, zero same-mode
repeats inside any 7-day window.

`tools/schedule.js` and `test/cdp-test.js` each reimplement this — keep the
three copies in sync if you ever touch the seeds, the stride, or the mode order.

Consequences:
- Changing the coin **order or count** in `data.js` reshuffles future dailies
  in every mode (appending is fine for today, it still changes future days).
  Check `node tools/schedule.js` after any data change.
- Editing a coin's fields in place is always safe.

## Grading (Classic)

Five axes per guess (`grade()` in game.js):

| axis  | green            | yellow                        | arrow |
|-------|------------------|-------------------------------|-------|
| Chain | exact            | both EVM family               | —     |
| Type  | exact            | same family (animal/people/tech/meme) | — |
| Year  | exact            | ±1 year                       | ▲▼ toward answer |
| Peak  | same range       | adjacent range                | ▲▼    |
| Now   | same range       | adjacent range                | ▲▼    |

Ranges are order-of-magnitude tiers (`capTier` / `nowTier` in data.js), which
is what makes approximate market-cap data safe to ship.

## Lore redaction

`loreParts()` splits the lore sentence on a case-insensitive alternation of the
coin's name, ticker, name words ≥4 chars, and wiki-slug words, longest first.
Odd-indexed pieces are the matches and get rendered as `<span class="redacted">`
blocks. Text nodes are built with `createTextNode`, never `innerHTML`.

## State

All localStorage, versioned keys:

- `md_day_<mode>_<day>` — `{g: [names], done, won, h: hintAxis}`
- `md_stats_v1_<mode>` — played/wins/streak/maxStreak/dist, one record per day
- `md_cb` (colourblind), `md_seen`, `md_migrated_v1`
- archive runs share the `md_day_*` keys but never touch `md_stats_v1_*`
- `mcdl_name`, `mcdl_cid`, `mcdl_lb_pending` — leaderboard client

`migrate()` runs once and copies the pre-Memedle `mcdl_stats_v1` and the last
three `mcdl_daily_v2_*` records into the classic keys, so existing players keep
their streak and today's in-progress board.

## Design system

Tokens in `:root` of style.css. Identity: a bright pixel-arcade overworld —
sky gradient with drifting outlined pixel clouds, cream panels with a 4px ink
border, a coloured header bar and a hard `0 6px 0` shadow that collapses on
`:active`, a grass-and-dirt band that flexes to fill whatever the content
doesn't, and a crowd of real coin logos standing in it. Every surface shares one
near-black outline (`--ink`) so the page reads as a single sprite sheet. Luckiest Guy for the logo (layered SVG strokes),
Jersey 15 for letter-only labels, Baloo 2 for body copy and for anything
containing a digit, all with system fallbacks so the offline build still reads.

Two faces were tried and rejected on legibility, both caught by rendering the
real strings rather than a pangram: **Pixelify Sans** closes its C, G and 2, so
CLASSIC rendered as "OLASSIO" and 2026 as "8026". **Silkscreen** drops the
middle vertex of its M, so MEMEDLE rendered as "HEHEDLE" and the section
heading as "HORE HEHEDLE". If you ever swap the label face again, render
`MEMEDLE · MORE MEMEDLE · CLASSIC · DAY #2 · 0/6` in it first.

**DotGothic16** was dropped for a different reason: it has no bold weight and
hairline strokes, so body copy read as spidery grey next to the solid labels.
**Jersey 15** survives the letter tests but its 6 has a nearly closed counter,
so "0/6" reads as "0/8" — hence the `--font-num` split: Jersey 15 never renders
a digit. Bull green / bear red stay reserved for market semantics. Colourblind
mode (`body.cb`) swaps green/red for blue/orange everywhere including the share
squares. Motion respects the OS `prefers-reduced-motion` setting; there is no
in-app motion toggle.

## Image pipeline

Two independent asset sets, built by different tools, for different jobs.

**Coin logos** (`img/<TICKER>.png`, WebP content) are the game's subject matter,
so they must come from the coin itself:

1. `node tools/fetch-logos.js` — new coins only; CoinGecko `large`, else
   DexScreener.
2. `node tools/refetch-logos.js` — swaps `/large/` for `/original/` on the
   CoinGecko URL to recover the uploader's real file (200-6000px depending on
   the coin) into the staging dir `img/_hires`. Resolved URLs are cached in
   `tools/.logo-src.json`, so re-runs skip the rate-limited search.
3. `node tools/resize-logos.js --clean` — folds the staging dir in at up to
   **320px** and deletes it. 320 is sized for Blur mode, which draws a logo at
   ~170px CSS once it settles — ~340px on a 2x screen. Nothing is upscaled: a
   coin whose source is only 200px stays 200px.

Resize was hardcoded to 64px, then 160px; both threw away resolution the UI
was already asking for.

**Crowd art** (`img/art/<NAME>.webp`) is decoration, and does *not* come from
the token icons — see below.

## The background crowd

pokedle.net ships one 3.3MB `Background.png` containing sky, the Pokemon lineup
and grass. The first two attempts here tried to derive the cast from the same
151 coin logos the game uses, by flood-filling their backgrounds away
(`tools/cut-logos.js`, now deleted). That could never work:

- a token icon is typically a character crammed inside a coloured disc, so
  cutting the background off returns **a disc**, not a character;
- the source is a 250px JPEG. Drawn into the front band's 106px slot on a 2x
  screen (212px) it was being upscaled, so the whole strip read as mud.

The crowd is now a separate, hand-picked set. `tools/art-sources.json` maps a
character name to a source URL for artwork that already ships an alpha channel
at 600-4000px; `tools/build-art.js` downloads it, trims to the subject's
bounding box, renders at **288px** tall (the front band tops out at ~129px CSS,
so 288 clears 2x) and writes `img/art/` plus the `art.js` manifest. 52
characters, ~790kb, all lazy-loaded below the fold.

Names are not tickers: the set carries several poses of the famous memes
(`WOJAK`, `WOJAK2`, `PEPE`..`PEPE4`, `CHILLGUY`..`CHILLGUY3`) because a crowd
wants variety more than it wants 1:1 coverage of the dataset. Obscure tickers
were deliberately left out — generic image search returns stock animals for
them, and a stock cobra labelled `SNEK` is worse than no `SNEK`.

`buildCrowd()` deals them into three absolutely-positioned depth bands — back
band smallest, highest, dimmed and desaturated; front band biggest and
full-strength — with seeded size jitter, random horizontal mirroring and
negative margins for overlap. Counts are derived from `window.innerWidth`, not
fixed, or the crowd sits as a clump in the middle of a wide screen; a debounced
`resize` listener refills. `buildFloaters()` puts a few in the sky, positioned
in the gutters beside the column so they read as sky rather than as fragments
peeking out from behind a card.

Two ranks of grass blades are drawn as `.ground::before` / `::after` SVG tiles.
`.ground` needs `z-index: 4` to sit above `.crowd-row`'s 1-3 — without it the
blades paint behind the crowd and the horizon slices every character off in a
dead-straight line. `.crowd`'s negative `margin-bottom` has to clear those
13px blades and no more, or the front row is buried to the waist instead of
standing in the grass.

## Cache busting

GitHub Pages serves every asset with `Cache-Control: max-age=600` and there is
no bundler to fingerprint filenames, so `index.html` carries a manual `?v=`
stamp on each local asset, derived from a hash of their contents. It was a date
stamp first, which collides on same-day edits and silently serves stale files —
the exact failure this exists to prevent. This is not cosmetic: `index.html` and `game.js`
change together, and a visitor holding a 10-minute-old `game.js` against fresh
markup gets a `TypeError` on the first `getElementById` of a renamed element and
a blank page — the script dies before it builds the menu, clouds or roster.

`node tools/bump-assets.js` restamps them; run it before any deploy that touches
a local asset. `--check` exits non-zero when the stamp no longer matches the
files, so it can gate a deploy.

## Testing

`test/cdp-test.js` drives a real headless Chrome over CDP (no test deps;
node 22+ for native WebSocket): serve the repo on :8471, run Chrome with
`--remote-debugging-port=9223`, then `node test/cdp-test.js`. It computes each
mode's answer independently, then checks the home menu, every route, a full
Classic win (grading, reveal, persistence, stats), each stage mode's puzzle and
clue ladder, unlimited mode, and the colourblind toggle — failing on any page
error. 51 checks.
