/* memecoindle — leaderboard + daily-winner-pot client.
   Fully optional: with LB_API empty, the game is untouched and the trophy
   button explains how to go online. Deploy server/worker.js (Cloudflare
   Workers free tier), then set LB_API to its URL. See docs/LEADERBOARD.md. */
var LB = (function () {
  "use strict";

  // ====== set this to your deployed worker URL to go live ======
  var LB_API = ""; // e.g. "https://memecoindle-api.yourname.workers.dev"
  // =============================================================

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function enabled() { return !!LB_API; }

  function clientId() {
    try {
      var id = localStorage.getItem("mcdl_cid");
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) ||
          ("cid-" + Date.now() + "-" + Math.random().toString(36).slice(2));
        localStorage.setItem("mcdl_cid", id);
      }
      return id;
    } catch (e) { return "cid-mem"; }
  }
  function getName() { try { return localStorage.getItem("mcdl_name") || ""; } catch (e) { return ""; } }
  function setName(n) { try { localStorage.setItem("mcdl_name", n); } catch (e) {} }

  function api(path, opts) {
    return fetch(LB_API + path, Object.assign({
      headers: { "content-type": "application/json" }
    }, opts || {})).then(function (r) {
      if (!r.ok) throw new Error("api " + r.status);
      return r.json();
    });
  }

  var pendingKey = "mcdl_lb_pending";

  // Called by the game when a run completes. Daily results only.
  function report(mode, won, guesses, day, hintUsed) {
    if (mode !== "daily" || !enabled()) return;
    var payload = { day: day, name: getName(), guesses: guesses, won: won, hint: !!hintUsed, cid: clientId() };
    if (!payload.name) {
      try { localStorage.setItem(pendingKey, JSON.stringify(payload)); } catch (e) {}
      return; // submitted once the player picks a handle in the board modal
    }
    submit(payload);
  }
  function submit(payload) {
    api("/score", { method: "POST", body: JSON.stringify(payload) })
      .then(function () { try { localStorage.removeItem(pendingKey); } catch (e) {} })
      .catch(function () {}); // scores are a bonus, never break the game
  }
  function flushPending() {
    try {
      var raw = localStorage.getItem(pendingKey);
      if (!raw) return;
      var p = JSON.parse(raw);
      p.name = getName();
      if (p.name) submit(p);
    } catch (e) {}
  }

  // ---------- board modal ----------
  function fmtT(ms) {
    if (typeof ms !== "number") return "";
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    if (h > 0) return h + "h" + (m % 60) + "m";
    return m + "m";
  }

  function open(day) {
    var body = $("lb-body");
    body.innerHTML = "";
    if (!enabled()) {
      body.appendChild(el("p", "lb-note",
        "The global leaderboard isn't connected on this deployment yet. " +
        "It takes one free Cloudflare Worker — see docs/LEADERBOARD.md in the repo."));
      openModal();
      return;
    }

    // handle row
    var row = el("div", "lb-name-row", "");
    var input = document.createElement("input");
    input.className = "lb-name-input";
    input.maxLength = 20;
    input.placeholder = "your handle for the board…";
    input.value = getName();
    var saveBtn = el("button", "btn lb-name-btn", getName() ? "update" : "join");
    saveBtn.addEventListener("click", function () {
      var v = input.value.trim().replace(/[^\w .$-]/g, "").slice(0, 20);
      if (!v) return;
      setName(v);
      saveBtn.textContent = "saved ✓";
      setTimeout(function () { saveBtn.textContent = "update"; }, 1500);
      flushPending();
      setTimeout(function () { open(day); }, 700);
    });
    row.appendChild(input); row.appendChild(saveBtn);
    body.appendChild(row);

    var list = el("div", "lb-list", "");
    list.appendChild(el("p", "lb-note", "loading the tape…"));
    body.appendChild(list);
    openModal();

    api("/board?day=" + day).then(function (b) {
      list.innerHTML = "";

      // pot banner + claim flow (only when the server says a pot is live)
      if (b.pot && b.pot.active) {
        var pot = el("div", "lb-pot", "");
        pot.appendChild(el("div", "lb-pot-title", "today's pot: " + (b.pot.amount || "") + " " + (b.pot.note || "")));
        pot.appendChild(el("div", "lb-pot-sub", "first correct solve of the day takes it"));
        if (b.winner && b.winner.cid === clientId() && !b.winner.claimed) {
          var claim = el("div", "lb-claim", "");
          var addr = document.createElement("input");
          addr.className = "lb-name-input";
          addr.placeholder = "your SOL address to claim…";
          var cbtn = el("button", "btn btn-primary lb-name-btn", "claim");
          cbtn.addEventListener("click", function () {
            var a = addr.value.trim();
            if (a.length < 32 || a.length > 44) { addr.value = ""; addr.placeholder = "that's not a SOL address"; return; }
            api("/claim", { method: "POST", body: JSON.stringify({ day: day, cid: clientId(), address: a }) })
              .then(function () { cbtn.textContent = "claimed ✓"; cbtn.disabled = true; })
              .catch(function () { cbtn.textContent = "failed — retry"; });
          });
          claim.appendChild(addr); claim.appendChild(cbtn);
          pot.appendChild(claim);
        } else if (b.winner && b.winner.claimed) {
          pot.appendChild(el("div", "lb-pot-sub", "claimed by " + (b.winner.name || "anon")));
        }
        list.appendChild(pot);
      }

      var scores = b.scores || [];
      if (!scores.length) {
        list.appendChild(el("p", "lb-note", "nobody on the board yet — finish today's daily and take the top."));
        return;
      }
      scores.forEach(function (s, i) {
        var r = el("div", "lb-row" + (s.cid === clientId() ? " me" : ""), "");
        r.appendChild(el("span", "lb-rank", "#" + (i + 1)));
        r.appendChild(el("span", "lb-player", s.name || "anon"));
        var res = s.won ? s.guesses + "/6" + (s.hint ? " 💡" : "") : "X/6";
        r.appendChild(el("span", "lb-res " + (s.won ? "w" : "l"), res));
        r.appendChild(el("span", "lb-time", fmtT(s.t)));
        list.appendChild(r);
      });
    }).catch(function () {
      list.innerHTML = "";
      list.appendChild(el("p", "lb-note", "couldn't reach the leaderboard — try again in a minute."));
    });
  }

  function openModal() { $("modal-lb").classList.remove("hidden"); }

  return { report: report, open: open, enabled: enabled };
})();
