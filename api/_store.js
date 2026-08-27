/* Shared helpers for the Memedle API.
 *
 * Storage is Vercel Blob, used as a tiny key-value store. Three rules were
 * settled by probing the real API before any of this was written:
 *
 *   1. put() with allowOverwrite:false THROWS when the pathname is taken.
 *      That throw is the whole username-uniqueness mechanism — it is a
 *      server-side check, so two people racing for "milady" cannot both win.
 *   2. A blob is readable at its public URL the instant put() resolves, but
 *      only if the pathname is NEW. Overwritten pathnames sit behind a CDN
 *      cache with max-age=2592000 and will serve you the old body.
 *   3. list() is immediately consistent and returns pathname + uploadedAt
 *      without fetching any bodies.
 *
 * So: every blob here is written ONCE and never overwritten, and anything the
 * leaderboard needs to read in bulk lives in the PATHNAME rather than the body.
 * Reading the board is two list() calls and zero body fetches.
 *
 * Layout
 *   u/<name>.json                          {cid, at}   the name claim + owner proof
 *   x/<name>/<v>-<handle>.json             {}          v wins highest; handle "0" = unlinked
 *   w/<name>/<v>-<addr>.json               {}          payout address, same rule; "0" = none
 *   s/<day>/<mode>/<w><g><h>-<name>.json   {}          one finished run; uploadedAt is the clock
 */
const { put, head, list } = require("@vercel/blob");

const PUT = {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: false,
  contentType: "application/json",
};

// ── names ────────────────────────────────────────────────────────────────
// Lowercase only, on purpose. Mixed case means "Milady" and "milady" are two
// rows on the board that look like one player, and it forces the display name
// into a blob body we would then have to fetch 50 times to draw a leaderboard.
const NAME_RE = /^[a-z0-9_]{3,16}$/;
const X_RE = /^[A-Za-z0-9_]{1,15}$/;

// Payout addresses. Both families are pathname-safe as typed, which is the
// only reason a wallet can live in a pathname the way a handle does.
const ADDR_EVM = /^0x[0-9a-fA-F]{40}$/;
const ADDR_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Reserved so nobody can impersonate the game itself or squat a route.
const RESERVED = {
  memedle: 1, admin: 1, mod: 1, moderator: 1, official: 1, staff: 1, support: 1,
  root: 1, system: 1, anon: 1, anonymous: 1, null: 1, undefined: 1, none: 1,
  api: 1, board: 1, leaderboard: 1, score: 1, name: 1, "new": 1, me: 1, you: 1,
};

function cleanName(raw) {
  const n = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!NAME_RE.test(n)) return null;
  if (RESERVED[n]) return null;
  return n;
}
function cleanHandle(raw) {
  let h = String(raw == null ? "" : raw).trim();
  if (!h) return "";
  h = h.replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "").replace(/[/?#].*$/, "");
  h = h.replace(/^@+/, "");
  return X_RE.test(h) ? h : null;
}
// "" clears the address, null means it is not something a transfer could be
// sent to. EVM is folded to lowercase: the EIP-55 checksum case carries nothing
// a transfer needs, and one case means one pathname per address.
function cleanAddr(raw) {
  const a = String(raw == null ? "" : raw).trim();
  if (!a) return "";
  if (ADDR_EVM.test(a)) return a.toLowerCase();
  if (ADDR_SOL.test(a)) return a;
  return null;
}
function chainOf(addr) {
  if (!addr) return "";
  return ADDR_EVM.test(addr) ? "evm" : "solana";
}
function cleanCid(raw) {
  const c = String(raw == null ? "" : raw).trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(c) ? c : null;
}

// ── blob plumbing ────────────────────────────────────────────────────────
function token() {
  return process.env.BLOB_READ_WRITE_TOKEN || "";
}
function isMissing(err) {
  const m = String((err && err.message) || "").toLowerCase();
  return m.indexOf("does not exist") >= 0 || m.indexOf("not found") >= 0;
}
function isTaken(err) {
  const m = String((err && err.message) || "").toLowerCase();
  return m.indexOf("already exists") >= 0;
}

async function writeOnce(pathname, body) {
  return put(pathname, JSON.stringify(body || {}), Object.assign({ token: token() }, PUT));
}

// Returns the claim record, or null when the name is free. Throws only on a
// real outage, so callers can fail closed rather than handing out a taken name.
async function readClaim(name) {
  let meta;
  try {
    meta = await head("u/" + name + ".json", { token: token() });
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  // The claim blob is written once and never overwritten, so its public URL is
  // immutable and the 30-day CDN cache on it is a feature.
  const res = await fetch(meta.url);
  if (!res.ok) throw new Error("claim unreadable: " + res.status);
  return await res.json();
}

async function ownsName(name, cid) {
  const claim = await readClaim(name);
  return !!(claim && claim.cid && claim.cid === cid);
}

// Nothing is ever overwritten, so a prefix holds every edit a player has made
// and the newest pathname is the current value. Versions are timestamps rather
// than a counter because a read-then-increment counter is not a lock: two edits
// racing would both read v=1, both write "2-...", land on different pathnames,
// and neither would lose. A clock is monotonic without a read.
async function listAll(prefix, maxPages) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const page = await list({ token: token(), prefix, limit: 1000, cursor: cursor || undefined });
    for (const b of page.blobs) out.push(b);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor && ++pages < (maxPages || 1));
  return out;
}

// The current value for one name, read out of pathnames — no bodies. "0" is
// the tombstone that means the player deliberately cleared it.
async function latestTagged(prefix, name) {
  const blobs = await listAll(prefix + name + "/", 1);
  let best = -1, val = "";
  for (const b of blobs) {
    const m = /\/(\d+)-(.+)\.json$/.exec(b.pathname);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (v <= best) continue;
    best = v;
    val = m[2] === "0" ? "" : m[2];
  }
  return val;
}
function latestX(name) { return latestTagged("x/", name); }
function latestWallet(name) { return latestTagged("w/", name); }

// Which names currently have a payout address — read out of pathnames, so the
// addresses themselves never leave the store. The board publishes whether a
// player can be paid, never where.
async function walletHolders() {
  const blobs = await listAll("w/", 5);
  const best = Object.create(null);
  for (const b of blobs) {
    const m = /^w\/([a-z0-9_]{3,16})\/(\d+)-(.+)\.json$/.exec(b.pathname);
    if (!m) continue;
    const v = parseInt(m[2], 10);
    const cur = best[m[1]];
    if (cur && cur.v >= v) continue;
    best[m[1]] = { v: v, has: m[3] !== "0" };
  }
  const out = Object.create(null);
  for (const k in best) if (best[k].has) out[k] = 1;
  return out;
}

// ── http plumbing ────────────────────────────────────────────────────────
// The site is served from two origins — Vercel and GitHub Pages — so the
// Pages copy has to reach these functions cross-origin.
function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-max-age", "86400");
  res.setHeader("vary", "origin");
}
function send(res, status, body, cacheSeconds) {
  cors(res);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader(
    "cache-control",
    cacheSeconds ? "public, s-maxage=" + cacheSeconds + ", stale-while-revalidate=60" : "no-store"
  );
  res.status(status).send(JSON.stringify(body));
}
function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;
  cors(res);
  res.status(204).end();
  return true;
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}
function configured() {
  return !!token();
}

module.exports = {
  NAME_RE, X_RE, ADDR_EVM, ADDR_SOL, RESERVED,
  cleanName, cleanHandle, cleanCid, cleanAddr, chainOf,
  token, isMissing, isTaken, writeOnce, readClaim, ownsName,
  listAll, latestX, latestWallet, walletHolders,
  cors, send, preflight, readBody, configured,
  list, head, put,
};
