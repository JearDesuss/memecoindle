# Architecture

Zero-dependency static site. No build step, no framework, no bundler. Four
scripts loaded in order; everything else is optional.

```
index.html      home menu + game shell + modals (help/settings/stats/reveal/board)
style.css       the whole design system (tokens up top in :root)
data.js         the item list — 151 coins + enums + tier functions
logos.js        generated manifest: ticker -> img/<TICKER>.png
lb.js           leaderboard/pot client (dormant until LB_API is set)
game.js         the engine (IIFE, no globals except what data/lb expose)
img/            64x64 WebP logos (misnamed .png — content sniffing wins)
server/         optional Cloudflare Worker for leaderboard + pot
tools/          dev scripts (fetch/resize logos, schedule, artifact build)
test/           CDP end-to-end test
```

## Routing

A hash router, so GitHub Pages needs no rewrite rules:

| hash | view |
|------|------|
| `#/` (or empty) | home menu |
| `#/<mode>` | that mode's daily |
| `#/<mode>/unlimited` | that mode, endless random coins |

`route()` runs on load and on `hashchange`, swaps `#view-home` / `#view-game`,
and closes any open modal. Modes are declared once in the `MODES` array in
game.js — id, display name, icon, blurb, shuffle seed, and `kind`.

## The four modes

| mode | kind | the puzzle | reveal ladder |
|------|------|-----------|---------------|
| Classic | `grid` | five-axis feedback per guess | — (feedback *is* the ladder) |
| Blur | `stage` | the coin's logo, heavily blurred | blur shrinks each miss |
| Lore | `stage` | one wiki sentence, name redacted | clue chips |
| Chart | `stage` | the pump-and-dump curve, unlabelled | detail sharpens each miss |

`stage` modes share one engine: six guesses, misses listed as `.miss-row`, and
one clue chip revealed per miss from the `CLUES` ladder (chain → year → type →
peak → now). Only Classic has the per-day hint.

## The daily pick

Every client must agree on each mode's coin with no server. `game.js`:

- `EPOCH = 2026-08-21` (local time). Day number = whole days since epoch.
- Each mode has its **own fixed seed**; a mulberry32 Fisher–Yates shuffle of
  the coin indices gives that mode one canonical permutation, identical
  everywhere. Four seeds → four different coins per day.
- Daily coin = `ORDER[mode][day % length]`.
- **Classic keeps the original `0x5EED1337`**, so its historical sequence is
  unchanged from before the four-mode split. Never change that seed.

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

## The mystery chart

`chartShape(coin)` returns a **continuous** function of `t ∈ [0,1]` built from
the coin's own numbers: `cm/m` sets the floor, `s` (fate) sets roughly when the
peak lands, and a ticker-seeded value-noise table adds the jitter. Because it's
continuous in `t` rather than per-index random, sampling it at 10 points and at
110 points draws the *same* curve at different resolutions — which is what makes
"sharpens with every miss" work. No axes or labels are ever drawn; the shape is
the whole puzzle.

## Lore redaction

`loreParts()` splits the lore sentence on a case-insensitive alternation of the
coin's name, ticker, name words ≥4 chars, and wiki-slug words, longest first.
Odd-indexed pieces are the matches and get rendered as `<span class="redacted">`
blocks. Text nodes are built with `createTextNode`, never `innerHTML`.

## State

All localStorage, versioned keys:

- `md_day_<mode>_<day>` — `{g: [names], done, won, h: hintAxis}`
- `md_stats_v1_<mode>` — played/wins/streak/maxStreak/dist, one record per day
- `md_cb` (colourblind), `md_rm` (reduce motion), `md_seen`, `md_migrated_v1`
- `mcdl_name`, `mcdl_cid`, `mcdl_lb_pending` — leaderboard client

`migrate()` runs once and copies the pre-Memedle `mcdl_stats_v1` and the last
three `mcdl_daily_v2_*` records into the classic keys, so existing players keep
their streak and today's in-progress board.

## Design system

Tokens in `:root` of style.css. Identity: a bright pixel-arcade overworld —
sky gradient with drifting box-shadow clouds, chunky cream panels with a 3px
ink border and a hard `0 5px 0` shadow that collapses on `:active`, a grass
band that flexes to fill whatever the content doesn't, and a crowd of real coin
logos standing in it. Luckiest Guy for the logo (layered SVG strokes), Pixelify
Sans for everything else, both with system fallbacks so the offline build still
reads. Bull green / bear red stay reserved for market semantics. Colourblind
mode (`body.cb`) swaps green/red for blue/orange everywhere including the share
squares; `body.rm` kills every non-essential animation.

## Testing

`test/cdp-test.js` drives a real headless Chrome over CDP (no test deps;
node 22+ for native WebSocket): serve the repo on :8471, run Chrome with
`--remote-debugging-port=9223`, then `node test/cdp-test.js`. It computes each
mode's answer independently, then checks the home menu, all four routes, a full
Classic win (grading, reveal, persistence, stats), each stage mode's puzzle and
clue ladder, unlimited mode, and the colourblind toggle — failing on any page
error. 45 checks.
