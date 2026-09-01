# Memedle

**Play: https://jeardesuss.github.io/memecoindle/**

Guess the memecoin of the day — three ways, on one screen. 105 coins, from $DOGE
in 2013 to whatever rotated on pump.fun, four.meme and Robinhood Chain this
summer. Six tries each, a fresh coin per mode every day, and a spoiler-free
share grid at the end. The roster is curated rather than exhaustive: a coin earns
its slot by being recognisable, because an unguessable answer is not a hard
puzzle, just an unfair one. The daily rotation is weighted towards recent coins —
2026 launches come up roughly three times as often as pre-2024 ones — and every
coin appears exactly once per cycle in every mode.

| mode | the puzzle |
|------|-----------|
| **Classic** | Five-axis feedback on every guess — chain, type, year, peak cap, cap today |
| **Blur** | The coin's logo, heavily blurred. Every miss sharpens it |
| **Lore** | One sentence from the wiki, with the coin's name redacted out |

Item list and coin lore built on the [memecoin.wiki](https://memecoin.wiki)
catalogue, with per-coin figures verified against its articles. Logos via
CoinGecko/DexScreener. Not financial advice; several of these coins are
crime scenes.

## Features

- One dashboard: mode rail, live board, yesterday's answer and the rules
- Three daily puzzles, one per mode, deterministic with no server
- Archive: replay any past puzzle without risking your streak
- Coin list: the whole roster, searchable, so you can see what you are guessing against
- Six tries each; misses hand you clues (chain → year → type → peak → now)
- One hint per Classic daily, flagged in your share
- Real coin logos (64px WebP, 0.3MB total) with a procedural badge fallback
- Per-mode streaks, stats and guess distribution
- Unlimited mode for every puzzle type
- Colourblind mode (blue/orange), record wipe, OS reduced-motion respected
- Outbound X and DexScreener buttons — drop a URL into `SOCIAL` in `game.js` and
  they go live; empty means a muted `soon` sticker
- Reveal card with lore, drawdown bar, and a memecoin.wiki link
- **Post on X**: the result is drawn to a 1200x675 PNG and routed to the
  composer the best way the browser allows — the share sheet on a phone, the
  clipboard plus a prefilled post on a desktop. The card never shows the coin
- **Handles**: a globally unique lowercase handle, claimed on the first visit,
  with an optional self-declared X link that turns your name on the board into
  a link to your profile — see [docs/LEADERBOARD.md](docs/LEADERBOARD.md)
- **A daily board per mode**, ranked wins → fewest guesses → no hint → earliest

## Run it

It's a static folder. `python -m http.server` (or any server), open the URL.
No build, no dependencies.

## Develop

- **Docs**: [DESIGN.md](DESIGN.md) — the design contract; read it before
  touching `style.css` · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
  [docs/DATA.md](docs/DATA.md) · [docs/LEADERBOARD.md](docs/LEADERBOARD.md)
- **Daily schedule (spoilers)**: `node tools/schedule.js 30`
- **Day boundary**: puzzles roll at **00:00 UTC**, the same instant the board seals
  and the pot pays
- **Test** (node 22+, Chrome): serve on :8471, run Chrome with
  `--remote-debugging-port=9223`, then `node test/cdp-test.js` — 52 checks
  across all three modes, endless and the archive
- **Logos**: `node tools/fetch-logos.js` (only fetches missing) for new coins,
  `node tools/refetch-logos.js` to pull the highest resolution CoinGecko
  actually holds into `img/_hires`, `node tools/upsize-logos.js` to try
  DexScreener for whatever CoinGecko only has at 250px, then
  `node tools/resize-logos.js --clean` to fold it all in at up to 320px and
  drop the staging dir. 320 is sized for Blur mode, which renders a logo at
  ~170px CSS — ~340px on a 2x screen. A coin whose ticker is ambiguous or
  non-latin gets pinned to a CoinGecko id in `tools/logo-overrides.json`.
- **Background scene**: `img/memedle-mascot-horizon-v2.webp` is the production
  responsive backdrop: an original, generated meme-overworld crowd with a
  deliberately quiet centre for the game UI. The older per-character crowd
  source set and `tools/build-art.js` remain in the repo as experiments, but are
  no longer loaded by the page.
- **Single-file build** (offline/artifact): `node tools/build-artifact.js out.html`
- **Before every deploy**: `node tools/bump-assets.js` — restamps the `?v=` on
  every local asset, using a hash of their contents. Pages caches assets for 10
  minutes, so without a fresh stamp a returning visitor can get the new
  `index.html` paired with an old cached `game.js`, which throws on the first
  `getElementById` and renders a dead page. `--check` fails when the stamp no
  longer matches the files.

Each mode has its own shuffle seed in the `MODES` array in `game.js`. Classic's
seed is load-bearing — changing it rewrites the historical daily sequence.

## Deploys

Two hosts, same repo:

- **Vercel** (primary): https://memedle-weld.vercel.app — the project is linked
  to this GitHub repo, so every push to `master` auto-deploys. `vercel.json`
  keeps `index.html` on `must-revalidate` and lets the `?v=`-stamped assets
  cache hard. Manual: `npx vercel deploy --prod`.
- **GitHub Pages**: https://jeardesuss.github.io/memecoindle/ — served from
  `master` root.

Run `node tools/bump-assets.js` before any deploy that touches a local asset.

## The bet

The format is a commodity; the item list and the share grid are the product.
Original scaffold thesis, prior art, and the abandon criterion (first public
post under ~100 comments → stop) are preserved in
[docs/SCAFFOLD.md](docs/SCAFFOLD.md).

The repo, the URL and the leaderboard keys are still named `memecoindle` — only
the game is called Memedle. Renaming the repo would break the live Pages URL.
