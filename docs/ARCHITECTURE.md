# Architecture

Zero-dependency static site. No build step, no framework, no bundler. Four
scripts loaded in order; everything else is optional.

```
index.html      markup + modals (help / stats / reveal / leaderboard)
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

## The daily pick

Every client must agree on the day's coin with no server. `game.js`:

- `EPOCH = 2026-08-21` (local time). Day number = whole days since epoch.
- A **fixed-seed** (`0x5EED1337`) mulberry32 Fisher–Yates shuffle of the coin
  indices produces one canonical permutation, identical everywhere.
- Daily coin = `ORDER[day % ORDER.length]`.

Consequences:
- Changing the coin **order or count** in `data.js` reshuffles future dailies
  (appending is fine for today, it still changes future days). Check
  `node tools/schedule.js` after any data change.
- Editing a coin's fields in place is always safe.

## Grading

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

## State

All localStorage, versioned keys:

- `mcdl_daily_v2_<day>` — `{g: [names], done, won, h: hintAxis}`
- `mcdl_stats_v1` — played/wins/streak/maxStreak/dist, one record per day
- `mcdl_cb`, `mcdl_seen`, `mcdl_name`, `mcdl_cid`, `mcdl_lb_pending`

## Hint

One per daily. Reveals a random **unsolved** axis of the answer; persisted in
daily state; marks the share text with 💡. Unlimited mode has no hint.

## Design system

Tokens in `:root` of style.css. Identity: chart-navy ground (`#0A0E1A`),
bull green / bear red reserved for market semantics, purple `#7B5CFF` as the
brand accent, Bricolage Grotesque for display type, IBM Plex Mono for data.
Webfonts load on the website; the artifact/offline build silently falls back
to system mono (font stacks include fallbacks). Colorblind mode (`body.cb`)
swaps green/red for blue/orange everywhere including the share squares.

## Testing

`test/cdp-test.js` drives a real headless Chrome over CDP (no test deps;
node 22+ for native WebSocket): serve the repo on :8471, run Chrome with
`--remote-debugging-port=9223`, then `node test/cdp-test.js`. It plays a full
daily (loss rows, win row, reveal, persistence, stats) and an unlimited game,
and fails on any page error.
