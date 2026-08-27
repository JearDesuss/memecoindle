/* POST /api/x {name, cid, handle} -> {ok, name, handle}
 *
 * Attaches a self-declared X handle to a claimed name, or clears it with an
 * empty handle. Nothing here checks that the player owns the X account — the
 * client copy says as much, and this endpoint must not imply otherwise.
 *
 * Written as x/<name>/<ms>-<handle>.json. The version is a timestamp rather
 * than a counter because a read-then-increment counter is not a lock: two
 * edits racing would both read v=1, both write "2-...", land on different
 * pathnames, and neither would lose. A clock is monotonic without a read.
 */
const S = require("./_store.js");

module.exports = async function handler(req, res) {
  if (S.preflight(req, res)) return;
  if (!S.configured()) return S.send(res, 503, { ok: false, error: "storage not configured" });
  if (req.method !== "POST") return S.send(res, 405, { ok: false, error: "method" });

  const body = S.readBody(req) || {};
  const name = S.cleanName(body.name);
  const cid = S.cleanCid(body.cid);
  const handle = S.cleanHandle(body.handle);
  if (!name) return S.send(res, 400, { ok: false, error: "bad name" });
  if (!cid) return S.send(res, 400, { ok: false, error: "bad cid" });
  if (handle === null) return S.send(res, 400, { ok: false, error: "bad handle" });

  try {
    if (!(await S.ownsName(name, cid))) return S.send(res, 403, { ok: false, error: "not your handle" });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "lookup failed" });
  }

  try {
    await S.writeOnce("x/" + name + "/" + Date.now() + "-" + (handle || "0") + ".json", {});
    return S.send(res, 200, { ok: true, name, handle });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "link failed" });
  }
};
