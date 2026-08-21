# Architecture

Zero-dependency static site. No build step, no framework, no bundler. Four
scripts loaded in order; everything else is optional.

```
index.html      the whole dashboard + modals (help/settings/stats/archive/reveal/board)
style.css       the whole design system (tokens up top in :root)
data.js         the item list — 151 coins + enums + tier functions
logos.js        generated manifest: ticker -> img/<TICKER>.png
cutouts.js      generated manifest: ticker -> [w,h] of img/cut/<TICKER>.png
lb.js           leaderboard/pot client (dormant until LB_API is set)
game.js         the engine (IIFE, no globals except what data/lb expose)
img/            64x64 WebP logos (misnamed .png — content sniffing wins)
img/cut/        background-removed character art for the background crowd
server/         optional Cloudflare Worker for leaderboard + pot
tools/          dev scripts (fetch/resize logos, schedule, artifact build)
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

## Image pipeline (order matters)

`fetch-logos.js` pulls CoinGecko's 250px `large` variant, then
`resize-logos.js` downsamples for the small UI uses. For a long time resize was
hardcoded to **64px**, which threw the good resolution away — the crowd was
upscaling 64px art to 82px and every logo looked soft. Now:

1. `node tools/fetch-logos.js --force --tickers A,B,C` — re-download at full
   size. It skips existing files unless `--force`, so a low-res logo will
   otherwise stay low-res forever.
2. `node tools/cut-logos.js` — **before** resizing, so the cut-outs are built
   from the 250px originals. Output is capped at 160px (what the front crowd
   band needs at 2x DPR) and written as WebP with alpha.
3. `SIZE=160 node tools/resize-logos.js` — shrink `img/` afterwards. The largest
   on-screen use is a 52px coin card, so 160 covers 2x DPR with room.

Running resize before cut is the one ordering that silently degrades the crowd.

## The background crowd

pokedle.net ships one 3.3MB `Background.png` containing sky, the Pokemon lineup
and grass. We can't: the cast has to come from the same 151 logos the game uses,
and those are square avatars with a flat baked-in background — rendered as-is
they read as a row of poker chips, not characters standing in a field.

`tools/cut-logos.js` fixes that offline. In a headless Chrome canvas it:

1. votes on the dominant border colour and bails if the border isn't uniform
   (a photo or gradient background can't be cut cleanly),
2. flood-fills that colour inward **from the edges only**, so a white belly
   stays white while a white background disappears,
3. feathers the boundary so there's no hard fringe,
4. trims to the subject's bounding box,
5. rejects the result if the silhouette is basically a square (`fill > 0.88`) or
   scores `IoU > 0.86` against a perfect inscribed circle — a cut disc is still
   the coin shape we're trying to escape.

A short hand-curated `NOT_A_CHARACTER` list drops wordmarks and bar charts that
survive the geometry tests but read as debris. 46 of 151 make it through.

`buildCrowd()` deals them into three absolutely-positioned depth bands — back
band smallest, highest, dimmed and desaturated; front band biggest and
full-strength — with seeded size jitter, random horizontal mirroring and
negative margins for overlap. Counts are derived from `window.innerWidth`, not
fixed, or the crowd sits as a clump in the middle of a wide screen; a debounced
`resize` listener refills. `buildFloaters()` puts a few in the sky, positioned
in the gutters beside the 620px column so they read as sky rather than as
fragments peeking out from behind a card.

Two ranks of grass blades are drawn as `.ground::before` / `::after` SVG tiles.
`.ground` needs `z-index: 4` to sit above `.crowd-row`'s 1-3 — without it the
blades paint behind the crowd and the horizon slices every character off in a
dead-straight line.

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
