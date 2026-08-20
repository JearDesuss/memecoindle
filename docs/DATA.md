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
2. `node tools/fetch-logos.js` — fetches only missing logos, updates logos.js.
3. Restart Chrome debug + `node tools/resize-logos.js` if the new file is big.
4. Validate: `node -e "eval(require('fs').readFileSync('data.js','utf8'))"`
   plus the checks in the repo's CI-less ritual: unique n/t, enum membership.
5. `node tools/schedule.js 7` — accept that future dailies just moved.
