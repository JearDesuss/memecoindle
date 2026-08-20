# Leaderboard & the daily winner pot

The site is static; the global board needs one tiny backend. The repo ships a
complete Cloudflare Worker (free tier is far more than enough) — until you
deploy it, the trophy button explains itself and nothing is broken or fake.

## Deploy the backend (~3 minutes)

```bash
npm i -g wrangler
wrangler login
cd server
wrangler kv namespace create MCDL      # copy the id it prints
# paste that id into server/wrangler.toml
wrangler deploy                        # prints https://memecoindle-api.<you>.workers.dev
```

Then open `lb.js`, set:

```js
var LB_API = "https://memecoindle-api.<you>.workers.dev";
```

commit, push. Pages redeploys and the board is live.

## How the board works

- Players pick a handle (stored locally); each finished **daily** posts
  `{day, name, guesses, won, hint}` once per client id.
- Ranking: wins first, then fewest guesses, then earliest submission.
- `t` is ms since the first score of that day (server clock), shown as
  "how long after the day opened".
- Board caps at 2000 entries/day, KV entries expire after 45 days.

## The pot (winner claims from creator fees)

The intended flow: you launch a memecoindle token, its **creator fees fund a
daily pot**, and the first correct solver of each day claims it.

The claim plumbing is built and honest-by-default:

1. **Off** until you set the config — the UI shows no pot at all:
   ```bash
   wrangler kv key put --binding MCDL config \
     '{"pot":{"active":true,"amount":"0.5 SOL","note":"from creator fees"}}'
   ```
2. When active, the board shows the pot banner; **only the day's first
   correct solver** (by server timestamp, keyed to their client id) gets the
   claim form and submits a Solana address (base58-validated).
3. One claim per day, stored server-side:
   ```bash
   wrangler kv key get --binding MCDL claim:<day>
   # -> {"cid":"...","address":"<SOL address>","at":1755772800000}
   ```
4. **Payout is manual and yours**: send the pot from the fee wallet to that
   address. Nothing on-chain is automated — do not advertise amounts you
   won't pay.

### Honesty notes (read before flipping the pot on)

- A client-side game can be cheated (the answer is derivable from data.js).
  A pot makes cheating worth someone's time. Mitigations if the pot grows:
  move the daily answer server-side, or accept it as marketing spend.
- The `cid` is a random localStorage UUID — clearing storage forfeits an
  unclaimed win; nothing links claims to wallets except the address given.
- Keep amounts small. This is a game, not an exchange.
