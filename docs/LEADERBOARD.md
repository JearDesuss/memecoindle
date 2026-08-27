# Handles, X links and the board

The site is static. A handle that is unique to one browser is not unique at all,
so the one thing that genuinely needs a server is the name registry — and once
there is a server, the daily board comes almost free.

That server is four Vercel serverless functions in `api/`, backed by a Vercel
Blob store. There is no database, no ORM and no framework.

## The endpoints

| route | method | in | out |
|---|---|---|---|
| `/api/name` | GET | `name`, `cid` | `{ok, name, available, mine, x}` |
| `/api/name` | POST | `{name, cid}` | `{ok, name, fresh, x}` · **409** `{taken:true}` |
| `/api/x` | POST | `{name, cid, handle}` | `{ok, name, handle}` · **403** if not yours |
| `/api/score` | POST | `{day, mode, name, cid, won, guesses, hint, x}` | `{ok, dup?}` |
| `/api/board` | GET | `day`, `mode` | `{ok, day, mode, rows:[{name, x, won, guesses, hint, t}]}` |

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
s/<day>/<mode>/<w><g><h>-<name>-<x>.json {}          one finished run
```

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
the part worth stopping. Do not put a prize on this board without moving the
daily answer server-side first.
