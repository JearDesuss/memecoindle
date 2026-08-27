/* GET /api/board?day=N&mode=classic -> {ok, day, mode, rows:[...]}
 *
 * One list() call, zero body fetches: a score carries its result and the
 * player's X handle in its pathname, and its clock in uploadedAt.
 *
 * Ranking is wins first, then fewest guesses, then no-hint over hint, then who
 * finished earliest — where "earliest" is measured from the first run posted
 * that day, because puzzle day N opens at a different wall-clock moment in
 * every timezone and an absolute timestamp would just rank by longitude.
 */
const S = require("./_store.js");

const MODES = { classic: 1, blur: 1, lore: 1 };
const LIMIT = 100;
const ROW = /\/([01])([1-6])([01])-([a-z0-9_]{3,16})-([A-Za-z0-9_]{1,15})\.json$/;

module.exports = async function handler(req, res) {
  if (S.preflight(req, res)) return;
  if (!S.configured()) return S.send(res, 503, { ok: false, error: "storage not configured" });
  if (req.method !== "GET") return S.send(res, 405, { ok: false, error: "method" });

  const day = parseInt((req.query && req.query.day) || "", 10);
  const mode = String((req.query && req.query.mode) || "classic");
  if (!Number.isInteger(day) || day < 0) return S.send(res, 400, { ok: false, error: "bad day" });
  if (!MODES[mode]) return S.send(res, 400, { ok: false, error: "bad mode" });

  let blobs;
  try {
    const page = await S.list({ token: S.token(), prefix: "s/" + day + "/" + mode + "/", limit: 1000 });
    blobs = page.blobs;
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "board unreadable" });
  }

  const seen = Object.create(null);
  for (const b of blobs) {
    const m = ROW.exec(b.pathname);
    if (!m) continue;
    const name = m[4];
    const at = Date.parse(b.uploadedAt) || 0;
    const prev = seen[name];
    if (prev && prev.at <= at) continue;      // one row per player, their first finish
    seen[name] = {
      name: name,
      x: m[5] === "0" ? "" : m[5],
      won: m[1] === "0",
      guesses: parseInt(m[2], 10),
      hint: m[3] === "1",
      at: at,
      t: 0,
    };
  }

  const rows = Object.keys(seen).map(function (k) { return seen[k]; });
  let first = null;
  for (const r of rows) if (first === null || r.at < first) first = r.at;
  for (const r of rows) { r.t = first === null ? 0 : r.at - first; delete r.at; }

  rows.sort(function (a, b) {
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.guesses !== b.guesses) return a.guesses - b.guesses;
    if (a.hint !== b.hint) return a.hint ? 1 : -1;
    return a.t - b.t;
  });

  return S.send(res, 200, { ok: true, day, mode, rows: rows.slice(0, LIMIT) }, 20);
};
