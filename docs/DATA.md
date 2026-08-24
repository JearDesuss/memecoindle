# The item list

The item list is the product. Everything else is a commodity Wordle shell.

## Schema (`data.js`)

```js
{ n: "Dogecoin",        // display name (unique)
  t: "DOGE",            // ticker (unique, uppercase)
  c: "Own chain",       // chain — one of CHAINS
  y: 2013,              // launch year (2013..2026)
  m: 88000,             // PEAK market cap, $ millions, approximate
  cm: 10900,            // CURRENT market cap, $ millions, snapshot
  g: "Dog",             // type — one of CATS (what the mascot IS)
  s: "Icon",            // fate — metadata only, not a game axis
  l: "one-line lore",   // shown on the reveal card
  w: "dogecoin" }       // memecoin.wiki slug, or null
```

Enums and family groupings (for yellow matches) live at the top of data.js.

## Data conventions

- **Tiers over precision.** The game grades mcap by order of magnitude, so a
  peak recorded as 700 when the truth is 685 changes nothing. Get the tier
  right; don't sweat the digit.
- `cm` is a **snapshot** (currently mid/late-2026, sourced from memecoin.wiki
  article "as of" figures where available). Refresh it occasionally —
  memecoins only die downward, so tiers mostly hold.
- Type = what the mascot *is*, as a player perceives it. PENGU is an Animal
  (penguin), Milady is a Character, DEGEN is a Joke (slang).

## Sources

1. https://memecoin.wiki — the catalogue and per-coin figures (`w` slug links
   the reveal card there).
2. CoinGecko / DexScreener for logos (`tools/fetch-logos.js`).

## The daily schedule (dev spoilers)

```
node tools/schedule.js            # next 7 days
node tools/schedule.js 30         # next 30
node tools/schedule.js 30 --full  # every field, including lore
node tools/schedule.js --json 14  # machine-readable
```

This prints exactly what players will see because the pick is deterministic
(see ARCHITECTURE.md). **Re-run it after any change to the coin list order or
length** — both reshuffle future days.

## Adding a coin

1. Append the object to `COINS` (append, don't insert — smaller blast radius).
2. If the ticker is generic (`FOX`, `PANDA`, `TOBY`, `JOHN`…) or the symbol is
   non-latin, add `TICKER: "<coingecko-id>"` to `tools/logo-overrides.json`
   first. Searching CoinGecko by ticker returns *a* project with that symbol,
   not necessarily yours, and Blur mode is nothing but the logo. Confirm the id
   sits on the right chain:
   `/api/v3/coins/list?include_platform=true` gives every id and its platforms
   in a single request — cheaper and more reliable than `/search`.
3. `node tools/fetch-logos.js` — fetches only missing logos, updates logos.js.
4. `node tools/refetch-logos.js` then `node tools/upsize-logos.js` (Chrome on
   :9223) to pull real resolution, then `node tools/resize-logos.js --clean`.
   Blur asserts the logo beats its frame at 2x, so anything stuck at 250px will
   fail the test on the day it comes up.
5. Validate: `node -e "eval(require('fs').readFileSync('data.js','utf8'))"`
   plus the checks in the repo's CI-less ritual: unique n/t, enum membership,
   and `COINS.length % 61 !== 0` (the daily-pick stride, see ARCHITECTURE.md).
6. `node tools/bump-assets.js` — data.js changed, so the cache stamp must move.
7. `node tools/schedule.js 7` — accept that future dailies just moved.

Market caps are cheap to verify in bulk: `/api/v3/coins/markets?ids=a,b,c`
returns live caps for every pinned id in one call. Do that rather than trusting
a figure quoted in an article — two of the coins added in August 2026 were being
reported at 100x their actual current cap.
