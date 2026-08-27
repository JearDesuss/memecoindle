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

// The current X handle for one name, read out of pathnames — no bodies.
// x/<name>/<v>-<handle>.json, highest v wins, "0" means deliberately unlinked.
// Versions are timestamps, not a counter: two edits racing on a read-then-write
// counter would land on two different pathnames and neither would lose.
async function latestX(name) {
  const page = await list({ token: token(), prefix: "x/" + name + "/", limit: 1000 });
  let best = -1, handle = "";
  for (const b of page.blobs) {
    const m = /\/(\d+)-(.+)\.json$/.exec(b.pathname);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (v <= best) continue;
    best = v;
    handle = m[2] === "0" ? "" : m[2];
  }
  return handle;
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
  NAME_RE, X_RE, RESERVED,
  cleanName, cleanHandle, cleanCid,
  token, isMissing, isTaken, writeOnce, readClaim, ownsName, latestX,
  cors, send, preflight, readBody, configured,
  list, head, put,
};
