/* POST /api/score {day, mode, name, cid, won, guesses, hint, x} -> {ok}
 *
 * One blob per player per mode per day, written once, never overwritten:
 *   s/<day>/<mode>/<w><g><h>-<name>-<handle>.json
 * w=0 win / 1 loss, g=guesses, h=1 if a hint was spent, handle="0" if no X is
 * linked. The body is empty. Everything the board draws is in that pathname and
 * list() supplies uploadedAt as the clock, so rendering the board costs one
 * list() call and zero body fetches — which is what keeps it inside the Blob
 * operation budget however often people refresh it.
 *
 * The X handle is copied in at submit time rather than joined at read time. The
 * cost is that linking X *after* a run does not backfill that run's row; the
 * saving is a whole prefix scan per board request.
 */
const S = require("./_store.js");

const MODES = { classic: 1, blur: 1, lore: 1 };
const CAP = 1000;   // one list() page; past this the per-name dedupe below stops seeing everyone

module.exports = async function handler(req, res) {
  if (S.preflight(req, res)) return;
  if (!S.configured()) return S.send(res, 503, { ok: false, error: "storage not configured" });
  if (req.method !== "POST") return S.send(res, 405, { ok: false, error: "method" });

  const body = S.readBody(req) || {};
  const day = parseInt(body.day, 10);
  const mode = String(body.mode || "");
  const name = S.cleanName(body.name);
  const cid = S.cleanCid(body.cid);
  const guesses = Math.min(6, Math.max(1, parseInt(body.guesses, 10) || 6));
  const won = body.won ? 0 : 1;          // 0 sorts first, and winners sort first
  const hint = body.hint ? 1 : 0;
  const handle = S.cleanHandle(body.x) || "";

  if (!Number.isInteger(day) || day < 0 || day > 100000) return S.send(res, 400, { ok: false, error: "bad day" });
  if (!MODES[mode]) return S.send(res, 400, { ok: false, error: "bad mode" });
  if (!name) return S.send(res, 400, { ok: false, error: "bad name" });
  if (!cid) return S.send(res, 400, { ok: false, error: "bad cid" });

  // Stops one player posting a run under someone else's name. It cannot stop
  // anyone reading the answer out of data.js — nothing client-side can.
  try {
    if (!(await S.ownsName(name, cid))) return S.send(res, 403, { ok: false, error: "not your handle" });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "lookup failed" });
  }

  const dir = "s/" + day + "/" + mode + "/";
  try {
    const page = await S.list({ token: S.token(), prefix: dir, limit: CAP });
    const mine = new RegExp("-" + name + "-[^/]*\\.json$");
    for (const b of page.blobs) if (mine.test(b.pathname)) return S.send(res, 200, { ok: true, dup: true });
    if (page.hasMore) return S.send(res, 429, { ok: false, error: "board full" });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "board unreadable" });
  }

  try {
    await S.writeOnce(dir + won + guesses + hint + "-" + name + "-" + (handle || "0") + ".json", {});
    return S.send(res, 200, { ok: true });
  } catch (err) {
    if (S.isTaken(err)) return S.send(res, 200, { ok: true, dup: true });
    return S.send(res, 502, { ok: false, error: "write failed" });
  }
};
