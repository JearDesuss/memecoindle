# Architecture

Zero-dependency static site. No build step, no framework, no bundler. Four
scripts loaded in order; everything else is optional.

```
index.html      the whole dashboard + modals (help/settings/stats/archive/reveal/board)
style.css       the whole design system (tokens up top in :root)
data.js         the item list — 105 coins + enums + tier functions
logos.js        generated manifest: ticker -> img/<TICKER>.png
sfx.js          the sound kit — synthesised, nothing preloaded, off by default
motion.js       GSAP: the world's idle life and the staggered entrance
vendor/         gsap.min.js, vendored so the page has no CDN dependency
lb.js           handles, X links and the board (talks to api/)
share.js        draws the result-card PNG and routes it to X
game.js         the engine (IIFE, no globals except what data/lb/share expose)
img/            coin logos, up to 320px WebP (misnamed .png — content sniffing wins)
img/art/        hand-picked transparent character art; two of these are the mascots
api/            four Vercel functions on a Blob store — see docs/LEADERBOARD.md
tools/          dev scripts (logos, build-scene, shot, run-test, schedule, stamp)
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

- `EPOCH = 2026-08-21 00:00 UTC`. Day number = whole UTC days since epoch.
  It is UTC, not local, because the same integer keys the leaderboard and the pot
  pays at a UTC instant: keyed locally, one board accepted posts across a 50-hour
  window spanning UTC+14 to UTC-12, so no moment existed at which it was complete.
- Each mode has its **own fixed seed**; a mulberry32 weighted shuffle of the
  coin indices gives that mode one canonical permutation, identical everywhere.
  Three seeds → three different coins per day.
- Daily coin = `ORDER[mode][day % length]`.
- **Classic keeps the original `0x5EED1337`**, so its seed is unchanged from
  before the multi-mode split. Never change that seed.

The shuffle is **weighted by launch year**, because the list spans 2013 to now
but a player's recall doesn't — a coin that ran this year is a fair puzzle, one
from 2021 is trivia. `recencyWeight()` scores 2026 at 4, 2025 at 2.5, 2024 at
1.5 and everything older at 1, and `orderFor()` sorts by the Efraimidis–Spirakis
key `u^(1/w)` descending. That is still a **permutation** — every coin comes up
exactly once per cycle — but heavier coins land near the front of it. Measured
over the first 60 days: ~48% of picks are 2026 coins and only ~3% predate 2023.
Ties break on index so node and the browser can't disagree.

Independent shuffles do occasionally hand the same coin to two modes on the same
day, which turns solving one into a free hint for the other. `picksFor(day)`
assigns modes in a fixed order and de-conflicts **once over the whole cycle**, by
swapping inside that mode's own order. Classic is resolved first, so its sequence
is never perturbed by another mode. A swap keeps each order a permutation by
construction, so every coin still comes up exactly once per cycle. The partner
slot is found by walking `STRIDE = 61` places, which keeps a displaced pick far
from that mode's neighbouring days; the stride must be coprime with the list
length to reach every index, and 61 is prime, so that holds for any length that
is not a multiple of it (105 % 61 = 44).

This used to be resolved per *day* instead: on a collision the mode served
whatever sat 61 places forward, for that day only. That silently broke the
permutation — the displaced coin was never served at all, and the coin walked
onto was served twice, once as the stand-in and again on its own day exactly 61
days later. On the old 186-coin roster that made 5 coins unreachable in Blur and
5 more come up at double rate. If you touch this, re-run the check: every mode
must serve every coin exactly once per cycle, and no two modes may share a day.

`tools/schedule.js` and `test/cdp-test.js` each reimplement this — keep the
three copies in sync if you ever touch the seeds, the stride, the mode order or
`recencyWeight()`.

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

**[DESIGN.md](../DESIGN.md) at the repo root is the contract — read it before
touching style.css.** It holds the north star, the full token vocabulary and the
dos/donts with their reasons. What follows is only the mechanical summary.

Tokens live in `:root` of style.css and nowhere else: a literal hex or px inside
a component rule is a bug. Three radii (`--r-1` 12 / `--r-2` 20 / `--r-pill`),
two die widths (`--cut` / `--cut-in`), one lift (`--lift`) plus a hover rise
(`--rise`), one accent (`--lime`), three status hues, a named neutral ramp from
`--ink` to `--paper`, and a separate five-green scenery ramp that is banned from
every UI surface.

Elevation is **two tiers, and the tier is the affordance**: a Calm card is white
with a `--line` hairline and `--shadow-soft`; a Live object has a black die line
and `--shadow`, a hard offset with zero blur. Only pressable things get Live.
There are no blurred shadows anywhere in the UI — blur exists in exactly two
places, the modal scrim and Blur mode's coin, which is the puzzle.

Two families, and that is the whole list. **Baloo 2** (600–800) for the
wordmark, mode names and big numerals; **Figtree** (400–800) for everything
else. Figtree carries every digit in the interface because it has real tabular
figures, so a counter does not change width as it ticks. `--font-num` does not
exist and must not come back.

Hit green / miss pink stay reserved for market semantics. Colourblind mode
(`body.cb`) swaps them for blue/orange everywhere including the share squares.
Motion respects the OS `prefers-reduced-motion` setting; there is no in-app
motion toggle. Sound has one, and it is off by default.

### The world the cards lie on

The landscape is **hand-authored inline SVG**, generated by
`tools/build-scene.mjs` and spliced into `index.html` between `<!--scene-->`
markers. Inline on purpose: it has to paint on the first frame with no request,
and it has to survive any viewport width. Re-run the generator after editing it.

Its profile is a **valley** — the land rises at both edges and dips through the
middle — so the content column and the footer line sit over paper rather than
over green. That dip is the only reason the page stays readable without a
scrim, and flattening it is how you break the footer.

Each of the three layers is one ridge path drawn twice, the second copy pushed
down by `drop`; the lit top face falls out of the offset rather than being a
second hand-drawn path that can drift. Isometric cubes are planted by reading
the front profile back at an arbitrary x (`heightAt`), so a block sits *on* the
hill instead of at a number someone eyeballed once.

`motion.js` builds the clouds and the floating coins at runtime. Both are
pinned to the **outer gutters only** — anywhere else they surface between the
cards as a hard-edged fragment, which reads as a rendering bug rather than as
sky. Each cloud is one closed path; the earlier version was a pill plus two
discs, and the outlines crossed each other into a scribble.

The two mascots are transparent cut-outs from `img/art/`, laid out as a flex
row with their prop (the flag, the speech bubble) beside the art. They were
absolutely positioned first, and an offset measured against the image box moves
with the image and lands on the character's face. **A token icon is not a
mascot**: it is a character inside a coloured disc, so cutting it out returns a
disc. Only art from `tools/art-sources.json` is eligible. Below 860px the
mascots and coins are hidden — a fixed world behind a tall scrolling page
surfaces in every gap between cards as an ear or half a speech bubble, and the
hills survive that but the characters do not.

### Motion and sound

`vendor/gsap.min.js` is vendored, not loaded from a CDN, so the page has no
third-party runtime dependency. `motion.js` owns the two things CSS is bad at
here: the endless idle life in the world layer and the staggered entrance of
the UI. Everything a finger touches stays on a CSS transition, because a
transition retargets from wherever it is and a timeline restarts from zero.

Both files fail safe. If GSAP never loads, `enter()` returns before it hides
anything, so the page renders fully rather than staying at `opacity: 0`.
Appending `?still` to the URL freezes every timeline at its resting state,
which is what makes a screenshot reproducible — `tools/shot.mjs` passes it.

`sfx.js` synthesises every cue from oscillators, so there are no audio files to
ship and nothing to preload. Sound is off until the player opts in (stored in
`md_sfx`) and the `AudioContext` is not constructed until the first real
gesture, because browsers will not start one without it and a page that makes
noise on load is a page people close.

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
