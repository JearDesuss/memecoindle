/* memecoindle leaderboard + daily-pot API — Cloudflare Worker (free tier).
 *
 * Deploy (3 minutes):
 *   1. npm i -g wrangler && wrangler login
 *   2. cd server && wrangler kv namespace create MCDL   # paste the id into wrangler.toml
 *   3. wrangler deploy
 *   4. Put the printed URL into LB_API in lb.js, push.
 *
 * Pot config (optional — enables the claim flow):
 *   wrangler kv key put --binding MCDL config '{"pot":{"active":true,"amount":"0.5 SOL","note":"from creator fees"}}'
 *   Payouts are manual: read claims with
 *   wrangler kv key get --binding MCDL claim:<day>
 *
 * Storage layout (KV):
 *   board:<day>  -> JSON array of {cid,name,guesses,won,hint,t}  (t = ms since first score of the day)
 *   claim:<day>  -> {cid,address,at}
 *   config       -> {pot:{active,amount,note}}
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === "/config") {
      const cfg = (await env.MCDL.get("config", "json")) || { pot: { active: false } };
      return json(cfg);
    }

    if (url.pathname === "/board") {
      const day = parseInt(url.searchParams.get("day"), 10);
      if (!Number.isInteger(day) || day < 0) return json({ error: "bad day" }, 400);
      const board = (await env.MCDL.get("board:" + day, "json")) || [];
      const cfg = (await env.MCDL.get("config", "json")) || { pot: { active: false } };
      const claim = await env.MCDL.get("claim:" + day, "json");
      const sorted = board
        .slice()
        .sort((a, b) => (b.won - a.won) || (a.guesses - b.guesses) || (a.t - b.t))
        .slice(0, 50);
      const first = board.filter((s) => s.won).sort((a, b) => a.t - b.t)[0] || null;
      return json({
        scores: sorted,
        pot: cfg.pot || { active: false },
        winner: first ? { cid: first.cid, name: first.name, claimed: !!claim } : null,
      });
    }

    if (url.pathname === "/score" && req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      const day = b.day, cid = String(b.cid || "").slice(0, 64);
      const name = String(b.name || "").replace(/[^\w .$-]/g, "").slice(0, 20);
      const guesses = Math.min(6, Math.max(1, parseInt(b.guesses, 10) || 6));
      if (!Number.isInteger(day) || day < 0 || !cid || !name) return json({ error: "bad payload" }, 400);
      const key = "board:" + day;
      const board = (await env.MCDL.get(key, "json")) || [];
      if (board.length >= 2000) return json({ error: "board full" }, 429);
      if (board.some((s) => s.cid === cid)) return json({ ok: true, dup: true });
      const dayStart = board.length ? board[0].epoch : Date.now();
      board.push({
        cid, name, guesses,
        won: !!b.won, hint: !!b.hint,
        t: Date.now() - dayStart, epoch: board.length ? board[0].epoch : dayStart,
      });
      await env.MCDL.put(key, JSON.stringify(board), { expirationTtl: 60 * 60 * 24 * 45 });
      return json({ ok: true });
    }

    if (url.pathname === "/claim" && req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      const day = b.day, cid = String(b.cid || "").slice(0, 64);
      const address = String(b.address || "").trim();
      if (!Number.isInteger(day) || !cid || address.length < 32 || address.length > 44 ||
          !/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return json({ error: "bad payload" }, 400);
      const cfg = (await env.MCDL.get("config", "json")) || {};
      if (!cfg.pot || !cfg.pot.active) return json({ error: "no pot" }, 400);
      const board = (await env.MCDL.get("board:" + day, "json")) || [];
      const first = board.filter((s) => s.won).sort((a, b) => a.t - b.t)[0];
      if (!first || first.cid !== cid) return json({ error: "not the winner" }, 403);
      const existing = await env.MCDL.get("claim:" + day, "json");
      if (existing) return json({ error: "already claimed" }, 409);
      await env.MCDL.put("claim:" + day, JSON.stringify({ cid, address, at: Date.now() }));
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};
