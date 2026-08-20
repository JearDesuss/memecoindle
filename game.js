/* memecoindle — game engine. No dependencies, no build step. */
(function () {
  "use strict";

  // ---------- daily puzzle selection ----------
  var EPOCH = new Date(2026, 7, 21); // puzzle #1 = Aug 21 2026 (local time)
  var MAX_GUESSES = 6;
  var SITE_URL = "jeardesuss.github.io/memecoindle";

  function todayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function dayNumber() {
    return Math.round((todayLocal() - EPOCH) / 86400000); // 0 = first day
  }

  // deterministic PRNG + fixed shuffle so every client agrees on the daily order
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailyOrder() {
    var idx = COINS.map(function (_, i) { return i; });
    var rnd = mulberry32(0x5EED1337);
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx;
  }
  var ORDER = dailyOrder();

  function dailyCoin() {
    var d = dayNumber();
    var i = ((d % ORDER.length) + ORDER.length) % ORDER.length;
    return COINS[ORDER[i]];
  }
  function randomCoin(excludeName) {
    var c;
    do { c = COINS[Math.floor(Math.random() * COINS.length)]; }
    while (COINS.length > 1 && c.n === excludeName);
    return c;
  }

  // ---------- grading ----------
  function fmtCap(m) {
    if (m >= 1000) {
      var b = m / 1000;
      return "~$" + (b >= 10 ? Math.round(b) : (Math.round(b * 10) / 10)) + "B";
    }
    if (m >= 1) return "~$" + Math.round(m) + "M";
    return "<$1M";
  }

  // returns array of 5 cells: {v: display value, s: 'g'|'y'|'x', d: 'up'|'down'|null}
  function grade(guess, target) {
    var cells = [];
    // chain
    var cs = guess.c === target.c ? "g" : (EVM_FAMILY[guess.c] && EVM_FAMILY[target.c] ? "y" : "x");
    cells.push({ v: guess.c, s: cs, d: null });
    // category
    var gs = guess.g === target.g ? "g" : (CAT_FAMILY[guess.g] === CAT_FAMILY[target.g] ? "y" : "x");
    cells.push({ v: guess.g, s: gs, d: null });
    // year
    var ys = guess.y === target.y ? "g" : (Math.abs(guess.y - target.y) <= 1 ? "y" : "x");
    cells.push({ v: String(guess.y), s: ys, d: ys === "g" ? null : (target.y > guess.y ? "up" : "down") });
    // peak mcap (range)
    var gt = capTier(guess.m), tt = capTier(target.m);
    var ms = gt === tt ? "g" : (Math.abs(gt - tt) === 1 ? "y" : "x");
    cells.push({ v: fmtCap(guess.m), s: ms, d: ms === "g" ? null : (tt > gt ? "up" : "down") });
    // current mcap (range)
    var gn = nowTier(guess.cm), tn = nowTier(target.cm);
    var ns = gn === tn ? "g" : (Math.abs(gn - tn) === 1 ? "y" : "x");
    cells.push({ v: fmtCap(guess.cm), s: ns, d: ns === "g" ? null : (tn > gn ? "up" : "down") });
    return cells;
  }

  var COL_NAMES = ["Chain", "Type", "Year", "Peak", "Now"];
  var SQ = { g: "🟩", y: "🟨", x: "🟥" }; // 🟩 🟨 🟥

  // ---------- state ----------
  var mode = "daily"; // 'daily' | 'free'
  var target = null;
  var guesses = []; // array of coin objects
  var done = false, won = false;

  function stateKey() { return "mcdl_daily_v2_" + dayNumber(); }

  function saveDaily() {
    if (mode !== "daily") return;
    try {
      localStorage.setItem(stateKey(), JSON.stringify({
        g: guesses.map(function (c) { return c.n; }), done: done, won: won
      }));
    } catch (e) {}
  }
  function loadDaily() {
    try {
      var raw = localStorage.getItem(stateKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function loadStats() {
    try { return JSON.parse(localStorage.getItem("mcdl_stats_v1")) || null; } catch (e) { return null; }
  }
  var defaultStats = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: -2, lastPlayedDay: -2, dist: [0, 0, 0, 0, 0, 0] };
  function recordResult(win, nGuesses) {
    if (mode !== "daily") return;
    var st = loadStats() || JSON.parse(JSON.stringify(defaultStats));
    var d = dayNumber();
    if (st.lastPlayedDay === d) return; // already recorded today
    st.played++; st.lastPlayedDay = d;
    if (win) {
      st.wins++;
      st.streak = (st.lastWinDay === d - 1) ? st.streak + 1 : 1;
      st.lastWinDay = d;
      if (st.streak > st.maxStreak) st.maxStreak = st.streak;
      st.dist[nGuesses - 1]++;
    } else {
      st.streak = 0;
    }
    try { localStorage.setItem("mcdl_stats_v1", JSON.stringify(st)); } catch (e) {}
  }

  // ---------- dom helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- coin logos ----------
  // Real logo when the manifest has one; otherwise a deterministic procedural
  // coin badge (ticker-tinted disc with the first letter) so nothing looks broken.
  function badgeURI(ticker) {
    var h = 0;
    for (var i = 0; i < ticker.length; i++) h = ((h << 5) - h + ticker.charCodeAt(i)) | 0;
    var hue = ((h % 360) + 360) % 360;
    var ch = ticker.charAt(0).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0%" stop-color="hsl(' + hue + ',72%,62%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + hue + ',65%,38%)"/></radialGradient></defs>' +
      '<circle cx="32" cy="32" r="30" fill="url(#g)"/>' +
      '<circle cx="32" cy="32" r="30" fill="none" stroke="hsl(' + hue + ',60%,24%)" stroke-width="3"/>' +
      '<circle cx="32" cy="32" r="24" fill="none" stroke="hsl(' + hue + ',70%,70%)" stroke-width="1.5" stroke-dasharray="3 4" opacity=".8"/>' +
      '<text x="32" y="43" text-anchor="middle" font-family="Consolas,monospace" font-weight="bold" font-size="30" fill="hsl(' + hue + ',85%,12%)">' + ch + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function logoImg(coin, cls) {
    var img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.loading = "lazy";
    var real = (typeof LOGOS !== "undefined") && LOGOS[coin.t];
    img.src = real || badgeURI(coin.t);
    if (real) img.onerror = function () { img.onerror = null; img.src = badgeURI(coin.t); };
    return img;
  }

  // ---------- rendering ----------
  function renderHeaderMeta() {
    var meta = $("puzzle-meta");
    if (mode === "daily") {
      meta.textContent = "Daily #" + (dayNumber() + 1) + " · guess the memecoin in " + MAX_GUESSES;
    } else {
      meta.textContent = "Unlimited mode · random coin, endless replays";
    }
  }

  function renderColHead() {
    var head = $("col-head");
    head.innerHTML = "";
    if (guesses.length === 0) { head.classList.add("hidden"); return; }
    head.classList.remove("hidden");
    head.appendChild(el("div", "coin-label", ""));
    COL_NAMES.forEach(function (c) { head.appendChild(el("div", "col-name", c)); });
  }

  function renderGuesses(animateLast) {
    renderColHead();
    var board = $("board");
    board.innerHTML = "";
    guesses.forEach(function (coin, gi) {
      var cells = grade(coin, target);
      var row = el("div", "guess-row");
      var isLast = gi === guesses.length - 1;
      var label = el("div", "coin-label", "");
      label.appendChild(logoImg(coin, "coin-logo"));
      var nameWrap = el("div", "coin-label-text", "");
      nameWrap.appendChild(el("span", "coin-name", coin.n));
      nameWrap.appendChild(el("span", "coin-ticker", "$" + coin.t));
      label.appendChild(nameWrap);
      row.appendChild(label);
      cells.forEach(function (cell, ci) {
        var tile = el("div", "tile s-" + cell.s, "");
        var val = el("span", "tile-val", cell.v);
        tile.appendChild(val);
        if (cell.d) tile.appendChild(el("span", "tile-dir", cell.d === "up" ? "▲" : "▼"));
        if (animateLast && isLast) {
          tile.classList.add("flip");
          tile.style.animationDelay = (ci * 0.22) + "s";
        }
        row.appendChild(tile);
      });
      board.appendChild(row);
    });
    var left = $("guesses-left");
    if (done) { left.textContent = ""; }
    else {
      var n = MAX_GUESSES - guesses.length;
      left.textContent = n + (n === 1 ? " guess left" : " guesses left");
    }
  }

  // ---------- autocomplete ----------
  var acIndex = -1;
  function acMatches(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var guessed = {};
    guesses.forEach(function (c) { guessed[c.n] = 1; });
    var starts = [], contains = [];
    COINS.forEach(function (c) {
      if (guessed[c.n]) return;
      var name = c.n.toLowerCase(), tick = c.t.toLowerCase();
      if (name.indexOf(q) === 0 || tick.indexOf(q) === 0) starts.push(c);
      else if (name.indexOf(q) >= 0 || tick.indexOf(q) >= 0) contains.push(c);
    });
    return starts.concat(contains).slice(0, 8);
  }
  function renderAC() {
    var list = $("ac-list");
    var q = $("guess-input").value;
    var m = acMatches(q);
    list.innerHTML = "";
    if (done || m.length === 0) { list.classList.add("hidden"); acIndex = -1; return; }
    list.classList.remove("hidden");
    m.forEach(function (c, i) {
      var item = el("div", "ac-item" + (i === acIndex ? " active" : ""), "");
      item.appendChild(logoImg(c, "ac-logo"));
      item.appendChild(el("span", "ac-name", c.n));
      item.appendChild(el("span", "ac-ticker", "$" + c.t));
      item.addEventListener("mousedown", function (ev) { ev.preventDefault(); submitGuess(c); });
      list.appendChild(item);
    });
  }

  function submitGuess(coin) {
    if (done || guesses.length >= MAX_GUESSES) return;
    guesses.push(coin);
    $("guess-input").value = "";
    acIndex = -1; renderAC();
    var win = coin.n === target.n;
    if (win || guesses.length >= MAX_GUESSES) {
      done = true; won = win;
      recordResult(win, guesses.length);
    }
    saveDaily();
    renderGuesses(true);
    if (done) {
      var delay = 5 * 220 + 500;
      setTimeout(function () { openReveal(); }, delay);
    }
  }

  // ---------- share ----------
  function shareText() {
    var head = mode === "daily"
      ? "memecoindle #" + (dayNumber() + 1) + " · " + (won ? guesses.length : "X") + "/" + MAX_GUESSES
      : "memecoindle · unlimited · " + (won ? guesses.length : "X") + "/" + MAX_GUESSES;
    var rows = guesses.map(function (c) {
      return grade(c, target).map(function (cell) { return SQ[cell.s]; }).join("");
    });
    return head + "\n\n" + rows.join("\n") + "\n\n" + SITE_URL;
  }
  function copyShare(btn) {
    var txt = shareText();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(fallback);
    } else fallback();
    var old = btn.textContent;
    btn.textContent = "copied ✓";
    setTimeout(function () { btn.textContent = old; }, 1600);
  }

  // ---------- modals ----------
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModals() {
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      m.classList.add("hidden");
    });
  }

  function countdownStr() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var s = Math.max(0, Math.floor((next - now) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(h) + ":" + p(m) + ":" + p(sec);
  }

  var countdownTimer = null;
  function openReveal() {
    var box = $("reveal-body");
    box.innerHTML = "";
    var verdict = won
      ? ["you were early.", "got it in " + guesses.length + "/" + MAX_GUESSES + "."]
      : ["rugged.", "the coin walks free."];
    box.appendChild(el("div", "reveal-verdict " + (won ? "win" : "lose"), verdict[0]));
    box.appendChild(el("div", "reveal-sub", verdict[1]));

    var card = el("div", "coin-card", "");
    var title = el("div", "coin-card-title", "");
    title.appendChild(logoImg(target, "coin-card-logo"));
    var tWrap = el("div", "coin-card-title-text", "");
    tWrap.appendChild(el("span", "coin-card-name", target.n));
    tWrap.appendChild(el("span", "coin-card-ticker", "$" + target.t));
    title.appendChild(tWrap);
    card.appendChild(title);
    var facts = el("div", "coin-card-facts", "");
    [[target.c, "chain"], [target.g, "type"], [String(target.y), "born"], [fmtCap(target.m) + " peak", "peak"], [fmtCap(target.cm) + " now", "now"]].forEach(function (f) {
      facts.appendChild(el("span", "fact-chip", f[0]));
    });
    card.appendChild(facts);
    card.appendChild(el("p", "coin-card-lore", target.l));
    if (target.w) {
      var a = document.createElement("a");
      a.href = "https://memecoin.wiki/wiki/" + target.w;
      a.target = "_blank"; a.rel = "noopener";
      a.className = "wiki-link";
      a.textContent = "read the lore on memecoin.wiki →";
      card.appendChild(a);
    }
    box.appendChild(card);

    var btnRow = el("div", "btn-row", "");
    var shareBtn = el("button", "btn btn-primary", "share result");
    shareBtn.addEventListener("click", function () { copyShare(shareBtn); });
    btnRow.appendChild(shareBtn);
    if (mode === "free") {
      var again = el("button", "btn", "next coin ↻");
      again.addEventListener("click", function () { closeModals(); startFree(); });
      btnRow.appendChild(again);
    } else {
      var freeBtn = el("button", "btn", "play unlimited ∞");
      freeBtn.addEventListener("click", function () { closeModals(); setMode("free"); });
      btnRow.appendChild(freeBtn);
      var cd = el("div", "countdown", "");
      box.appendChild(btnRow);
      box.appendChild(el("div", "countdown-label", "next daily in"));
      box.appendChild(cd);
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(function () { cd.textContent = countdownStr(); }, 1000);
      cd.textContent = countdownStr();
      openModal("modal-reveal");
      return;
    }
    box.appendChild(btnRow);
    openModal("modal-reveal");
  }

  function openStats() {
    var st = loadStats() || defaultStats;
    $("st-played").textContent = st.played;
    $("st-winpct").textContent = st.played ? Math.round(100 * st.wins / st.played) + "%" : "—";
    $("st-streak").textContent = st.streak;
    $("st-max").textContent = st.maxStreak;
    var wrap = $("dist");
    wrap.innerHTML = "";
    var max = Math.max.apply(null, st.dist.concat([1]));
    st.dist.forEach(function (n, i) {
      var row = el("div", "dist-row", "");
      row.appendChild(el("span", "dist-n", String(i + 1)));
      var bar = el("div", "dist-bar", "");
      bar.style.width = Math.max(7, Math.round(100 * n / max)) + "%";
      bar.appendChild(el("span", "dist-count", String(n)));
      row.appendChild(bar);
      wrap.appendChild(row);
    });
    openModal("modal-stats");
  }

  // ---------- modes ----------
  function setMode(m) {
    mode = m;
    $("mode-toggle").textContent = m === "daily" ? "∞" : "📅";
    $("mode-toggle").title = m === "daily" ? "Play unlimited" : "Back to daily";
    if (m === "daily") startDaily(); else startFree();
  }

  function startDaily() {
    target = dailyCoin();
    guesses = []; done = false; won = false;
    var saved = loadDaily();
    if (saved && Array.isArray(saved.g)) {
      var byName = {};
      COINS.forEach(function (c) { byName[c.n] = c; });
      saved.g.forEach(function (n) { if (byName[n]) guesses.push(byName[n]); });
      done = !!saved.done; won = !!saved.won;
    }
    renderHeaderMeta();
    renderGuesses(false);
    $("guess-input").disabled = done;
    $("guess-input").placeholder = done ? "come back tomorrow" : "type a coin name or ticker…";
    if (done) setTimeout(openReveal, 300);
  }

  function startFree() {
    target = randomCoin(target ? target.n : null);
    guesses = []; done = false; won = false;
    renderHeaderMeta();
    renderGuesses(false);
    $("guess-input").disabled = false;
    $("guess-input").placeholder = "type a coin name or ticker…";
    $("guess-input").focus();
  }

  // ---------- wire up ----------
  function init() {
    var input = $("guess-input");
    input.addEventListener("input", function () { acIndex = -1; renderAC(); });
    input.addEventListener("keydown", function (ev) {
      var m = acMatches(input.value);
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (m.length) { acIndex = (acIndex + 1) % m.length; renderAC(); } }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (m.length) { acIndex = (acIndex - 1 + m.length) % m.length; renderAC(); } }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        if (m.length === 0) return;
        submitGuess(m[acIndex >= 0 ? acIndex : 0]);
      } else if (ev.key === "Escape") { input.value = ""; renderAC(); }
    });
    input.addEventListener("blur", function () { setTimeout(function () { $("ac-list").classList.add("hidden"); }, 150); });
    input.addEventListener("focus", renderAC);

    $("mode-toggle").addEventListener("click", function () { setMode(mode === "daily" ? "free" : "daily"); });
    $("btn-help").addEventListener("click", function () { openModal("modal-help"); });
    $("btn-stats").addEventListener("click", openStats);
    Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
      b.addEventListener("click", closeModals);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      m.addEventListener("click", function (ev) { if (ev.target === m) closeModals(); });
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeModals(); });

    // first visit: show help
    try {
      if (!localStorage.getItem("mcdl_seen")) {
        localStorage.setItem("mcdl_seen", "1");
        openModal("modal-help");
      }
    } catch (e) {}

    setMode("daily");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
