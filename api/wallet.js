/* POST /api/wallet {name, cid, addr} -> {ok, name, addr, chain}
 *
 * Attaches a payout address to a claimed name, or clears it with an empty
 * string. This is the address the daily pot is sent to at 00:00 UTC — the
 * board reads *whether* a name has one, never which, so the address only ever
 * travels between this endpoint and its owner.
 *
 * Written as w/<name>/<ms>-<addr>.json, same write-once rule as the X link:
 * the newest pathname is the current address and "0" is the tombstone.
 *
 * Nothing here proves the player controls the address, and nothing can: an
 * address is a claim about where to send money, not an identity. The client
 * copy says so.
 */
const S = require("./_store.js");

module.exports = async function handler(req, res) {
  if (S.preflight(req, res)) return;
  if (!S.configured()) return S.send(res, 503, { ok: false, error: "storage not configured" });
  if (req.method !== "POST") return S.send(res, 405, { ok: false, error: "method" });

  const body = S.readBody(req) || {};
  const name = S.cleanName(body.name);
  const cid = S.cleanCid(body.cid);
  const addr = S.cleanAddr(body.addr);
  if (!name) return S.send(res, 400, { ok: false, error: "bad name" });
  if (!cid) return S.send(res, 400, { ok: false, error: "bad cid" });
  if (addr === null) return S.send(res, 400, { ok: false, error: "bad address" });

  try {
    if (!(await S.ownsName(name, cid))) return S.send(res, 403, { ok: false, error: "not your handle" });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "lookup failed" });
  }

  try {
    await S.writeOnce("w/" + name + "/" + Date.now() + "-" + (addr || "0") + ".json", {});
    return S.send(res, 200, { ok: true, name, addr, chain: S.chainOf(addr) });
  } catch (err) {
    return S.send(res, 502, { ok: false, error: "save failed" });
  }
};
