# Memedle

**Play: https://jeardesuss.github.io/memecoindle/**

Guess the memecoin of the day — in four different ways. 151 coins, from $DOGE
in 2013 to whatever rotated on pump.fun this summer. Six tries each, a fresh
coin per mode every day, and a spoiler-free share grid at the end.

| mode | the puzzle |
|------|-----------|
| **Classic** | Five-axis feedback on every guess — chain, type, year, peak cap, cap today |
| **Blur** | The coin's logo, heavily blurred. Every miss sharpens it |
| **Lore** | One sentence from the wiki, with the coin's name redacted out |
| **Chart** | Just the pump-and-dump curve. No axes, no labels, no ticker |

Item list and coin lore built on the [memecoin.wiki](https://memecoin.wiki)
catalogue, with per-coin figures verified against its articles. Logos via
CoinGecko/DexScreener. Not financial advice; several of these coins are
crime scenes.

## Features

- Four daily puzzles, one per mode, deterministic with no server
- Six tries each; misses hand you clues (chain → year → type → peak → now)
- One hint per Classic daily, flagged 💡 in your share
- Real coin logos (64px WebP, 0.3MB total) with a procedural badge fallback
- Per-mode streaks, stats and guess distribution
- Unlimited mode for every puzzle type
- Colourblind mode (blue/orange), reduce-motion mode, one-tap record wipe
- Reveal card with lore, drawdown bar, and a memecoin.wiki link
- Optional global leaderboard + daily winner pot — see [docs/LEADERBOARD.md](docs/LEADERBOARD.md)

## Run it

It's a static folder. `python -m http.server` (or any server), open the URL.
No build, no dependencies.

## Develop

- **Docs**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
  [docs/DATA.md](docs/DATA.md) · [docs/LEADERBOARD.md](docs/LEADERBOARD.md)
- **Daily schedule (spoilers)**: `node tools/schedule.js 30`
- **Test** (node 22+, Chrome): serve on :8471, run Chrome with
  `--remote-debugging-port=9223`, then `node test/cdp-test.js` — 45 checks
  across all four modes
- **Logos**: `node tools/fetch-logos.js` (only fetches missing), then
  `node tools/resize-logos.js`
- **Single-file build** (offline/artifact): `node tools/build-artifact.js out.html`
- **Before every deploy**: `node tools/bump-assets.js` — restamps the `?v=` on
  style.css/game.js/data.js/logos.js/lb.js. Pages caches assets for 10 minutes,
  so without a fresh stamp a returning visitor can get the new `index.html`
  paired with an old cached `game.js`, which throws on the first
  `getElementById` and renders a dead page. `--check` fails if the stamp is
  older than the assets.

Each mode has its own shuffle seed in the `MODES` array in `game.js`. Classic's
seed is load-bearing — changing it rewrites the historical daily sequence.

## The bet

The format is a commodity; the item list and the share grid are the product.
Original scaffold thesis, prior art, and the abandon criterion (first public
post under ~100 comments → stop) are preserved in
[docs/SCAFFOLD.md](docs/SCAFFOLD.md).

The repo, the URL and the leaderboard keys are still named `memecoindle` — only
the game is called Memedle. Renaming the repo would break the live Pages URL.
