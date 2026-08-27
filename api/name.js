/* GET  /api/name?name=foo   -> {ok, name, available, reason?}
 * POST /api/name  {name,cid} -> {ok, name} | 409 {taken:true}
 *
 * The claim is a put() with allowOverwrite:false. Vercel Blob rejects that
 * server-side when the pathname exists, so two clients racing for the same
 * handle cannot both be told yes.
 */
const S = require("./_store.js");

module.exports = async function handler(req, res) {
  if (S.preflight(req, res)) return;
  if (!S.configured()) return S.send(res, 503, { ok: false, error: "storage not configured" });

  if (req.method === "GET") {
    const raw = (req.query && req.query.name) || "";
    const name = S.cleanName(raw);
    if (!name) {
      return S.send(res, 200, {
        ok: true, available: false,
        reason: S.RESERVED[String(raw).trim().toLowerCase()] ? "reserved" : "format",
      });
    }
    try {
      const claim = await S.readClaim(name);
      const mine = !!(claim && claim.cid && claim.cid === S.cleanCid(req.query && req.query.cid));
      // Hand a returning player their X link back so a cleared cache or a new
      // tab does not silently unlink them.
      const x = mine ? await S.latestX(name) : "";
      return S.send(res, 200, { ok: true, name, available: !claim || mine, mine, x });
    } catch (err) {
      // Fail closed: never report a name free because the store hiccuped.
      return S.send(res, 502, { ok: false, available: false, error: "lookup failed" });
    }
  }

  if (req.method !== "POST") return S.send(res, 405, { ok: false, error: "method" });

  const body = S.readBody(req) || {};
  const name = S.cleanName(body.name);
  const cid = S.cleanCid(body.cid);
  if (!name) return S.send(res, 400, { ok: false, error: "bad name" });
  if (!cid) return S.send(res, 400, { ok: false, error: "bad cid" });

  try {
    await S.writeOnce("u/" + name + ".json", { cid, at: Date.now() });
    return S.send(res, 200, { ok: true, name, fresh: true });
  } catch (err) {
    if (!S.isTaken(err)) return S.send(res, 502, { ok: false, error: "claim failed" });
    // Someone holds it. If it is this device, hand it back rather than
    // telling a returning player their own handle is taken.
    try {
      if (await S.ownsName(name, cid)) {
        return S.send(res, 200, { ok: true, name, fresh: false, x: await S.latestX(name) });
      }
    } catch (e) { /* fall through to taken */ }
    return S.send(res, 409, { ok: false, taken: true, name });
  }
};
