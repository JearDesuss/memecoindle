# Handles, X links and the board

The site is static. A handle that is unique to one browser is not unique at all,
so the one thing that genuinely needs a server is the name registry — and once
there is a server, the daily board comes almost free.

That server is five Vercel serverless functions in `api/`, backed by a Vercel
Blob store. There is no database, no ORM and no framework.

## The endpoints

| route | method | in | out |
|---|---|---|---|
| `/api/name` | GET | `name`, `cid` | `{ok, name, available, mine, x, w}` |
| `/api/name` | POST | `{name, cid}` | `{ok, name, fresh, x, w}` · **409** `{taken:true}` |
| `/api/x` | POST | `{name, cid, handle}` | `{ok, name, handle}` · **403** if not yours |
| `/api/wallet` | POST | `{name, cid, addr}` | `{ok, name, addr, chain}` · **403** if not yours |
| `/api/score` | POST | `{day, mode, name, cid, won, guesses, hint, x}` | `{ok, dup?}` |
| `/api/board` | GET | `day`, `mode` | `{ok, day, mode, rows:[{name, x, won, guesses, hint, t, w}]}` |

`w` on a board row is `1` when that player has a payout address on file and `0`
when they do not. It is a flag, never the address: an address is a payment
detail, and a public list of handles paired with wallets is a target list.

`cid` is a random UUID in `localStorage` (`md_cid`). It is the only proof that a
handle is yours, which has two consequences worth knowing: clearing site data on
a browser gives up the handle claimed there, and because `localStorage` is
per-origin, a handle claimed on the Pages copy is not the same identity as one
claimed on the Vercel copy. Treat the Vercel URL as canonical.

## Why the storage looks like this

Three facts about Vercel Blob, established by probing the live API rather than
by reading about it, decided the whole schema:

1. `put()` with `allowOverwrite:false` **throws** when the pathname already
   exists. That throw is a server-side check, so it is a real claim primitive:
   two people racing for `milady` cannot both be told yes.
2. A blob is readable at its public URL the instant `put()` resolves — but only
   if the pathname is new. Overwritten pathnames sit behind a CDN cache with
   `max-age=2592000` and will happily serve the old body.
3. `list()` is immediately consistent and returns `pathname` and `uploadedAt`
   without fetching a single body.

So **nothing is ever overwritten**, and **everything the board needs to draw
lives in the pathname**:

```
u/<name>.json                            {cid, at}   the claim, written once
x/<name>/<ms>-<handle>.json              {}          latest ms wins; "0" = unlinked
w/<name>/<ms>-<addr>.json                {}          payout address, same rule
s/<day>/<mode>/<w><g><h>-<name>-<x>.json {}          one finished run
```

Both address families the game accepts — EVM `0x…` and Solana base58 — are
pathname-safe as typed, which is the only reason a wallet can live in a pathname
the way a handle does. EVM addresses are folded to lowercase on the way in: the
EIP-55 checksum case carries nothing a transfer needs, and one case means one
pathname per address.

`w` is 0 for a win and 1 for a loss, `g` is the guess count, `h` is 1 if a hint
was spent. Rendering a board is **one `list()` call and zero body fetches**,
which is what keeps it inside the free-tier operation budget however often
people refresh it. `uploadedAt` is the clock: rank is wins, then fewest guesses,
then no-hint over hint, then earliest — measured from the first run posted that
day, because puzzle day N opens at a different wall-clock moment in every
timezone and an absolute timestamp would rank players by longitude.

The `x/` version is a timestamp, not a counter. A read-then-increment counter is
not a lock: two edits racing would both read `v=1`, both write `2-...`, land on
different pathnames, and neither would lose.

## The daily pot

100% of the token's trading fees become that day's pot. It pays out at 00:00
UTC, split evenly across the three modes, and inside a mode by rank across the
top ten: ten parts at #1 down to one part at #10.

The wallet rule is one rule, not two, and that is what makes it add up:

> the pot is divided by rank weight among the ranked players **who have a wallet
> on file at 00:00 UTC**.

A ranked player without one is simply not in the denominator, so their parts are
already shared out pro-rata by the arithmetic — there is no second
"redistribution" step to get wrong, and nothing is carried over to tomorrow.

The board reads the wallet flag **live**, with a second `list()` over the `w/`
prefix, rather than stamping it into the score pathname the way the X handle is
stamped. A player who files an address after finishing is in the split, and one
who clears it is out — which is only true if the flag is read at render time.
If that listing fails, the rows still rank and the flag is simply absent.

## The X link is not verified

The player types their handle. Nothing checks it, and the copy says so once
(`"It goes up as typed — nothing is checked"`) and then drops it. Do not add UI
that implies verification; real verification needs an X app, an OAuth callback
and a token exchange, none of which a static page has.

The handle is copied into the score pathname at submit time rather than joined
at read time. The cost is that linking X *after* a run does not backfill that
run's row — the client patches over this for the player's own row, and the next
run carries the link. The saving is a whole prefix scan per board request.

## Setup

Already done for this project, but for the record:

```bash
vercel blob create-store memedle --access public --yes   # links it to the project
npm install                                              # @vercel/blob
vercel deploy --prod --yes
```

`BLOB_READ_WRITE_TOKEN` is injected into the functions automatically once the
store is linked, and written to `.env.local` for local dev. Without it every
endpoint answers `503 {error:"storage not configured"}` and the game carries on
without a board — which is also exactly what happens on the GitHub Pages copy if
the Vercel origin is ever unreachable.

## What this cannot do

The answers are in `data.js`, which is world-readable on both origins. A
determined player can post a 1/6 every day and nothing here will notice.
`cid` ownership stops one player posting *under someone else's name*, which is
the part worth stopping.

**There is now a prize on this board, and the answers are still client-side.**
Nothing stops one person claiming twenty handles from twenty browser profiles,
reading `data.js`, and posting twenty 1/6 runs to take the whole pot. Closing
that needs two changes, in this order:

1. **Move the answer server-side.** Ship a per-day hash instead of the coin, and
   grade guesses in a function. Until this lands, the board ranks whoever read
   the source, not whoever played.
2. **Rate-limit claims per client.** A handle costs nothing today; a payout
   makes that the cheapest attack in the product.

Neither is written yet. The payout copy in the UI describes the rule that will
be applied by hand until they are.
