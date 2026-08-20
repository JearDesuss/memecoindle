# memecoindle

**Play: https://jeardesuss.github.io/memecoindle/**

Guess the memecoin of the day in six tries. Every guess grades you on five
axes — **Chain · Type · Year · Peak mcap · Now mcap** — with a spoiler-free
candle share grid (🟩🟨🟥) at the end. One hint per day. Streaks. An
unlimited mode for the addicted. 151 coins, from $DOGE in 2013 to whatever
rotated on pump.fun this summer.

Item list and coin lore built on the [memecoin.wiki](https://memecoin.wiki)
catalogue, with per-coin figures verified against its articles. Logos via
CoinGecko/DexScreener. Not financial advice; several of these coins are
crime scenes.

## Features

- Daily deterministic puzzle (no server — every client agrees), plus unlimited mode
- Five-axis feedback with directional arrows; mcap graded by order-of-magnitude range
- One hint per daily — reveals an unsolved axis, flagged 💡 in your share
- Real coin logos (64px WebP, 0.3MB total) with procedural badge fallback
- Streak flame, stats, guess distribution, colorblind mode (blue/orange)
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
  `--remote-debugging-port=9223`, then `node test/cdp-test.js`
- **Logos**: `node tools/fetch-logos.js` (only fetches missing), then
  `node tools/resize-logos.js`
- **Single-file build** (offline/artifact): `node tools/build-artifact.js out.html`

## The bet

The format is a commodity; the item list and the share grid are the product.
Original scaffold thesis, prior art, and the abandon criterion (first public
post under ~100 comments → stop) are preserved in
[docs/SCAFFOLD.md](docs/SCAFFOLD.md).
