/* Memedle — game engine. One dashboard, three modes, no dependencies. */
(function () {
  "use strict";

  // ──────────────── constants ────────────────
  // Puzzle #1 = 21 Aug 2026, 00:00 UTC. The day number is UTC, not local, because it
  // is also the leaderboard's key and the pot pays at a UTC instant: keyed locally,
  // board N accepted posts across a 50-hour window spanning UTC+14 to UTC-12, so
  // there was no moment at which a board was complete and payable.
  var EPOCH = Date.UTC(2026, 7, 21);
  var MAX_GUESSES = 6;
  var SITE_URL = "memedle-weld.vercel.app";

  // Leave a URL empty and the button renders as a dead "soon" chip instead of a
  // link, so nothing ever points at a 404.
  // Drop a URL in and the button goes live; leave it empty and it renders
  // as a printed-but-not-stuck sticker with a "soon" tag.
  var SOCIAL = [
    { id: "x",   label: "",            title: "Memedle on X",           url: "" },
    { id: "dex", label: "DexScreener", title: "Memedle on DexScreener", url: "" }
  ];

  // Classic keeps the original seed so its daily sequence never shifts.
  var MODES = [
    { id: "classic", name: "Classic", icon: "DOGE", blurb: "Five clues on every guess.",   seed: 0x5EED1337, kind: "grid" },
    { id: "blur",    name: "Blur",    icon: "PEPE", blurb: "The logo, out of focus.",      seed: 0x1D0FBE47, kind: "stage" },
    { id: "lore",    name: "Lore",    icon: "SHIB", blurb: "One line, name blacked out.",  seed: 0x4B19AC03, kind: "stage" }
  ];
  var MODE_BY_ID = {};
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

  var COL_NAMES = ["Chain", "Type", "Year", "Peak", "Now"];
  var BLUR_STEPS = [26, 18, 12, 7.5, 4, 2];
  var ZOOM_STEPS = [1.55, 1.45, 1.36, 1.28, 1.2, 1.13];

  // ──────────────── rng ────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ──────────────── daily selection ────────────────
  function dayNumber() { return Math.floor((Date.now() - EPOCH) / 86400000); }

  // The list spans 2013 to now, but a player's recall doesn't: a coin that ran
  // this year is a fair puzzle, one from 2021 is trivia. Weight the rotation so
  // recent coins land near the front of it. Keep this table in sync with
  // tools/schedule.js and test/cdp-test.js.
  function recencyWeight(y) {
    if (y >= 2026) return 4;
    if (y === 2025) return 2.5;
    if (y === 2024) return 1.5;
    return 1;
  }
  var ORDERS = {};
  function orderFor(modeId) {
    if (ORDERS[modeId]) return ORDERS[modeId];
    var rnd = mulberry32(MODE_BY_ID[modeId].seed);
    // Efraimidis–Spirakis weighted shuffle: key = u^(1/w), sorted descending.
    // Still a permutation — every coin comes up exactly once per cycle — but a
    // heavier coin is far likelier to draw a key near 1 and sort to the front.
    // Ties break on index so node and the browser agree.
    var keyed = COINS.map(function (c, i) {
      return { i: i, k: Math.pow(rnd(), 1 / recencyWeight(c.y)) };
    });
    keyed.sort(function (a, b) { return b.k - a.k || a.i - b.i; });
    ORDERS[modeId] = keyed.map(function (e) { return e.i; });
    return ORDERS[modeId];
  }
  // Independent shuffles occasionally hand the same coin to two modes on the same day,
  // which turns solving one into a free hint for the other.
  //
  // This used to be resolved per day, by walking STRIDE places forward and serving
  // whatever was there. That silently broke the permutation: the displaced coin was
  // never served at all, and the coin walked ONTO was served twice — once as the
  // stand-in and again on its own day, a fixed 61 days later. On the 186-coin roster
  // that made 5 coins unreachable in Blur and 5 more come up at double rate.
  //
  // So de-conflict once, over the whole cycle, by SWAPPING inside the mode's own order.
  // A swap keeps the order a permutation by construction, so every coin still comes up
  // exactly once per cycle. Modes are resolved in MODES order and classic is first, so
  // its sequence is never perturbed by another mode.
  var STRIDE = 61;
  var CYCLE = null;
  function cycleOrders() {
    if (CYCLE) return CYCLE;
    var len = COINS.length, out = {}, atPos = [];
    for (var p = 0; p < len; p++) atPos[p] = {};
    MODES.forEach(function (m) {
      var o = orderFor(m.id).slice();
      for (var i = 0; i < len; i++) {
        if (!atPos[i][COINS[o[i]].t]) continue;
        // Find a partner whose coin is free here and whose slot can take ours. The
        // stride keeps the partner far away, so a displaced pick never lands on a
        // neighbouring day of its own mode.
        for (var k = 1; k < len; k++) {
          var j = (i + k * STRIDE) % len;
          if (j === i || atPos[i][COINS[o[j]].t] || atPos[j][COINS[o[i]].t]) continue;
          var t = o[i]; o[i] = o[j]; o[j] = t;
          break;
        }
      }
      for (var q = 0; q < len; q++) atPos[q][COINS[o[q]].t] = 1;
      out[m.id] = o;
    });
    CYCLE = out;
    return out;
  }
  function dailyCoin(modeId, day) {
    var o = cycleOrders()[modeId], len = o.length;
    return COINS[o[(((day % len) + len) % len)]];
  }
  function randomCoin(excludeName) {
    var c;
    do { c = COINS[Math.floor(Math.random() * COINS.length)]; }
    while (COINS.length > 1 && c.n === excludeName);
    return c;
  }

  // ──────────────── grading (classic) ────────────────
  function fmtCap(m) {
    if (m >= 1000) {
      var b = m / 1000;
      return "$" + (b >= 10 ? Math.round(b) : (Math.round(b * 10) / 10)) + "B";
    }
    if (m >= 1) return "$" + Math.round(m) + "M";
    return "<$1M";
  }
  function grade(guess, t) {
    var cells = [];
    var cs = guess.c === t.c ? "g" : (EVM_FAMILY[guess.c] && EVM_FAMILY[t.c] ? "y" : "x");
    cells.push({ v: guess.c, s: cs, d: null });
    var gs = guess.g === t.g ? "g" : (CAT_FAMILY[guess.g] === CAT_FAMILY[t.g] ? "y" : "x");
    cells.push({ v: guess.g, s: gs, d: null });
    var ys = guess.y === t.y ? "g" : (Math.abs(guess.y - t.y) <= 1 ? "y" : "x");
    cells.push({ v: String(guess.y), s: ys, d: ys === "g" ? null : (t.y > guess.y ? "up" : "down") });
    var gt = capTier(guess.m), tt = capTier(t.m);
    var ms = gt === tt ? "g" : (Math.abs(gt - tt) === 1 ? "y" : "x");
    cells.push({ v: fmtCap(guess.m), s: ms, d: ms === "g" ? null : (tt > gt ? "up" : "down") });
    var gn = nowTier(guess.cm), tn = nowTier(t.cm);
    var ns = gn === tn ? "g" : (Math.abs(gn - tn) === 1 ? "y" : "x");
    cells.push({ v: fmtCap(guess.cm), s: ns, d: ns === "g" ? null : (tn > gn ? "up" : "down") });
    return cells;
  }
  function squares() {
    return document.body.classList.contains("cb")
      ? { g: "🟦", y: "🟨", x: "🟧" }
      : { g: "🟩", y: "🟨", x: "🟥" };
  }

  var CLUES = [
    function (c) { return ["Chain", c.c]; },
    function (c) { return ["Year", String(c.y)]; },
    function (c) { return ["Type", c.g]; },
    function (c) { return ["Peak", TIER_LABELS[capTier(c.m)]]; },
    function (c) { return ["Now", NOW_LABELS[nowTier(c.cm)]]; }
  ];

  // ──────────────── lore redaction ────────────────
  // Words that carry no identity, so redacting them only mangles the sentence. The
  // short function words matter now that the length floor is 3: without them a coin
  // named "Cat in a Dogs World" blacked out every "in" and "a" on the card.
  var STOP = {
    with: 1, that: 1, from: 1, into: 1, then: 1, this: 1, coin: 1, token: 1, meme: 1,
    the: 1, and: 1, for: 1, its: 1, it: 1, of: 1, in: 1, on: 1, at: 1, to: 1, by: 1,
    an: 1, as: 1, is: 1, be: 1, or: 1, my: 1, me: 1, we: 1, you: 1, all: 1, out: 1,
    up: 1, one: 1, two: 1, new: 1, own: 1, has: 1, had: 1, was: 1, are: 1, not: 1
  };
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function loreParts(coin) {
    var terms = [coin.n, coin.t];
    // Floor of 3 on the coin's OWN words, not 4: at 4 the second half of a two-word
    // answer printed in clear, and "Base God" rendered as "████ God".
    coin.n.split(/[\s\-']+/).forEach(function (w) { if (w.length >= 3 && !STOP[w.toLowerCase()]) terms.push(w); });
    // Aliases carry the native-script name, which the latin name can never match —
    // four coins used to print their own name in Chinese, unredacted, in the clue.
    if (coin.a) coin.a.forEach(function (w) { if (w) terms.push(w); });
    // The slug keeps its floor: short slug fragments are noise, not identity.
    if (coin.w) coin.w.split("_").forEach(function (w) { if (w.length >= 4 && !STOP[w.toLowerCase()]) terms.push(w); });
    var seen = {}, uniq = [];
    terms.forEach(function (t) {
      var k = t.toLowerCase();
      if (t && !seen[k]) { seen[k] = 1; uniq.push(t); }
    });
    uniq.sort(function (a, b) { return b.length - a.length; });
    // Grow every hit out to the whole word it lands in. Matching bare terms redacted
    // mid-word, and the letters left standing spelled the answer: "Pengu" inside
    // "Penguins" rendered "Pudgy █████ins", which is a free win on guess one.
    var re = new RegExp("([A-Za-z0-9'’]*(?:" + uniq.map(reEsc).join("|") + ")[A-Za-z0-9'’]*)", "gi");
    return coin.l.split(re);   // split keeps the group: pieces alternate plain / match
  }

  // ──────────────── state ────────────────
  var modeId = "classic";
  var unlimited = false;
  var playDay = 0;              // which puzzle number is on the board
  var target = null;
  var guesses = [];
  var done = false, won = false;
  var hintAxis = -1;
  var statsMode = "classic";

  // Fixed when the board is built, never re-derived from the clock. Read live, a run
  // started at 23:58 and won at 00:03 looked like an archive replay at submit time, so
  // the win was thrown away: no stat, no streak, no leaderboard row.
  var runArchive = false;
  function isArchive() { return runArchive; }
  function statsKey(m) { return "md_stats_v1_" + m; }
  var defaultStats = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: -2, lastPlayedDay: -2, dist: [0, 0, 0, 0, 0, 0] };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function saveDaily() {
    if (unlimited) return;
    lsSet("md_day_" + modeId + "_" + playDay, JSON.stringify({
      g: guesses.map(function (c) { return c.n; }), done: done, won: won, h: hintAxis,
      t: target ? target.t : null
    }));
  }
  function loadDay(m, day) {
    try { return JSON.parse(lsGet("md_day_" + m + "_" + day)); } catch (e) { return null; }
  }
  function loadStats(m) {
    try { return JSON.parse(lsGet(statsKey(m))) || null; } catch (e) { return null; }
  }
  function recordResult(win, n) {
    if (unlimited || isArchive()) return;   // archive runs never touch the streak
    var st = loadStats(modeId) || JSON.parse(JSON.stringify(defaultStats));
    var d = playDay;                        // the day the run belongs to, not the clock
    if (st.lastPlayedDay === d) return;
    st.played++; st.lastPlayedDay = d;
    if (win) {
      st.wins++;
      st.streak = (st.lastWinDay === d - 1) ? st.streak + 1 : 1;
      st.lastWinDay = d;
      if (st.streak > st.maxStreak) st.maxStreak = st.streak;
      st.dist[n - 1]++;
    } else { st.streak = 0; }
    lsSet(statsKey(modeId), JSON.stringify(st));
  }

  // one-time migration from the pre-Memedle single-mode storage
  function migrate() {
    if (lsGet("md_migrated_v1")) return;
    lsSet("md_migrated_v1", "1");
    var old = lsGet("mcdl_stats_v1");
    if (old && !lsGet(statsKey("classic"))) lsSet(statsKey("classic"), old);
    var d = dayNumber();
    for (var i = 0; i <= 2; i++) {
      var raw = lsGet("mcdl_daily_v2_" + (d - i));
      if (raw && !lsGet("md_day_classic_" + (d - i))) lsSet("md_day_classic_" + (d - i), raw);
    }
    if (lsGet("mcdl_cb") === "1") lsSet("md_cb", "1");
    if (lsGet("mcdl_seen")) lsSet("md_seen", "1");
  }

  // ──────────────── dom helpers ────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  // ──────────────── logos ────────────────
  function badgeURI(ticker) {
    var h = 0;
    for (var i = 0; i < ticker.length; i++) h = ((h << 5) - h + ticker.charCodeAt(i)) | 0;
    var hue = ((h % 360) + 360) % 360;
    var ch = ticker.charAt(0).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="12" fill="hsl(' + hue + ',66%,52%)"/>' +
      '<text x="32" y="44" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="32" fill="hsl(' + hue + ',85%,14%)">' + ch + "</text></svg>";
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
  function logoByTicker(ticker, cls) {
    var img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.src = ((typeof LOGOS !== "undefined") && LOGOS[ticker]) || badgeURI(ticker);
    return img;
  }

  // ──────────────── brand: heavy rounded type over a Lime offset ────────────────
  // The offset is a real element rather than a text-shadow so motion.js can
  // move it on its own when a guess lands.
  function brandHTML() {
    return '<span class="b-under" aria-hidden="true">memedle</span>' +
      '<span class="b-face">memedle</span>' +
      '<span class="b-spark" aria-hidden="true">✦</span>';
  }

  // The world layer (hills, clouds, coins, mascots) belongs to motion.js now.
  // game.js only asks it to rebuild after a resize changes how many fit.
  var decorTimer = null;
  function refreshDecor() {
    clearTimeout(decorTimer);
    decorTimer = setTimeout(function () {
      if (window.MO && MO.build) MO.build();
    }, 220);
  }

  // ──────────────── the tray of side quests ────────────────
  // Six tiles in the shape the mockup asks for, but every one of them opens
  // something that exists. A tile that does nothing is worse than no tile.
  function icon(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="#16161A" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var DOCK = [
    { key: "share", label: "Ask a<br>friend", ico: icon(
      '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>' +
      '<path d="M17 4.5v7M13.5 8h7"/>') },
    { key: "archive", label: "Daily<br>puzzle", ico: icon(
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>' +
      '<circle cx="12" cy="15.5" r="1.6"/>') },
    { key: "board", label: "Leader<br>board", ico: icon(
      '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/>' +
      '<path d="M12 13v4M9 21h6M10 17h4"/>') },
    { key: "pot", label: "Daily<br>pot", ico: icon(
      '<path d="M12 3v18M8.5 7h6.2a2.8 2.8 0 0 1 0 5.6H9.3a2.8 2.8 0 0 0 0 5.6H16"/>') },
    { key: "hint", label: "Free<br>hints", ico: icon(
      '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9V16h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3Z"/>') },
    { key: "coins", label: "The<br>deck", ico: icon(
      '<ellipse cx="12" cy="6.5" rx="7.5" ry="3.2"/><path d="M4.5 6.5v5c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-5"/>' +
      '<path d="M4.5 11.5v5c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-5"/>') }
  ];

  var dockTiles = null;
  function buildDock() {
    var wrap = $("dock");
    if (!wrap) return;
    clear(wrap);
    dockTiles = DOCK.map(function (item) {
      var b = el("button", "dock-item");
      b.type = "button";
      b.setAttribute("data-dock", item.key);
      var plate = el("span", "dock-plate");
      plate.innerHTML = item.ico;
      b.appendChild(plate);
      var lab = el("span", "dock-label");
      lab.innerHTML = item.label;
      b.appendChild(lab);
      var badge = el("span", "dock-badge hidden");
      b.appendChild(badge);
      b.addEventListener("click", function () { dockGo(item.key); });
      wrap.appendChild(b);
      return { key: item.key, node: b, badge: badge };
    });
  }

  // Pass the page's own URL around rather than a hardcoded one: the game is
  // served from two origins and the Vercel one is canonical for identity, so a
  // link copied on either host has to be the host it was copied from.
  function inviteLink() {
    return location.origin + location.pathname + "#/" + modeId;
  }
  function invite() {
    var text = "Memedle — one memecoin a day, six guesses. Can you beat me?";
    if (navigator.share) {
      navigator.share({ title: "Memedle", text: text, url: inviteLink() })
        .catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + " " + inviteLink())
        .then(function () { flash("Invite copied."); })
        .catch(function () { flash(inviteLink()); });
      return;
    }
    flash(inviteLink());
  }

  function dockGo(key) {
    sfx("open");
    if (key === "share") invite();
    else if (key === "archive") openArchive();
    else if (key === "board") { if (typeof LB !== "undefined") LB.open(dayNumber(), modeId); }
    else if (key === "pot") openModal("modal-help");
    else if (key === "hint") {
      var btn = $("hint-area").querySelector(".hint-btn");
      if (btn) { btn.click(); if (window.MO) MO.pop($("hint-area").firstChild); }
      else flash(hintAxis >= 0 ? "Hint already spent today." : "Make a guess first.");
    } else if (key === "coins") openCoinList();
  }

  // Badges count what is actually waiting for the player, so they go to zero
  // when there is nothing left to do rather than sitting there decoratively.
  function renderDock() {
    if (!dockTiles) buildDock();
    if (!dockTiles) return;
    var left = 0;
    MODES.forEach(function (m) {
      var st = dayStatusFor(m.id);
      if (!st || !st.done) left++;
    });
    var counts = {
      share: 0,
      archive: left,
      board: 0,
      pot: MODES.length,
      hint: (modeId === "classic" && !unlimited && hintAxis < 0 && !done) ? 1 : 0,
      coins: 0
    };
    dockTiles.forEach(function (t) {
      var n = counts[t.key] || 0;
      t.badge.textContent = n;
      t.badge.classList.toggle("hidden", n === 0);
    });
  }

  // ──────────────── mode rail ────────────────
  function dayStatusFor(m) {
    var s = loadDay(m, dayNumber());
    if (!s || !s.g) return null;
    return { done: !!s.done, won: !!s.won, n: s.g.length };
  }

  var railCards = null;
  function buildModeRail() {
    var list = $("mode-list");
    clear(list);
    railCards = MODES.map(function (m) {
      var a = document.createElement("a");
      a.className = "mode-card";
      a.href = "#/" + m.id;
      a.appendChild(logoByTicker(m.icon, "mode-ico"));

      var txt = el("div", "mode-text");
      txt.appendChild(el("span", "mode-name", m.name));
      txt.appendChild(el("span", "mode-blurb", m.blurb));
      a.appendChild(txt);

      var flag = el("span", "mode-flag");
      a.appendChild(flag);

      var prog = el("div", "mode-prog");
      var fill = el("i");
      prog.appendChild(fill);
      a.appendChild(prog);

      list.appendChild(a);
      return { id: m.id, node: a, flag: flag, fill: fill };
    });
  }
  function renderModeRail() {
    var list = $("mode-list");
    if (!railCards || !list.firstChild) buildModeRail();
    railCards.forEach(function (c) {
      c.node.classList.toggle("on", c.id === modeId);
      var st = dayStatusFor(c.id);
      c.flag.className = "mode-flag";
      if (st && st.done) {
        c.flag.classList.add(st.won ? "win" : "lost");
        c.flag.textContent = st.won ? st.n + "/" + MAX_GUESSES : "✕";
      } else {
        c.flag.textContent = ((st && st.n) || 0) + "/" + MAX_GUESSES;
      }
      var pct = st ? Math.round(100 * Math.min(st.n, MAX_GUESSES) / MAX_GUESSES) : 0;
      c.fill.style.width = (st && st.done && st.won ? 100 : pct) + "%";
    });
  }

  // ──────────────── right rail: yesterday ────────────────
  function renderYesterday() {
    var box = $("yesterday-body");
    if (!box) return;
    clear(box);
    // Relative to the board on screen, not the wall clock. Read from the clock, this
    // printed the answer to the archive puzzle being played right now.
    var d = (unlimited ? dayNumber() : playDay) - 1;
    if (d < 0) {
      box.appendChild(el("p", "lb-empty", "Nothing yet — today is puzzle #1."));
      return;
    }
    var coin = dailyCoin(modeId, d);
    var st = loadDay(modeId, d);
    var row = el("div", "yday");
    row.appendChild(logoImg(coin, ""));
    var txt = el("div", "yday-text");
    txt.appendChild(el("span", "yday-label", MODE_BY_ID[modeId].name + " #" + (d + 1)));
    txt.appendChild(el("span", "yday-name", "$" + coin.t));
    row.appendChild(txt);
    if (st && st.done) {
      var flag = el("span", "yday-flag " + (st.won ? "win" : "lost"), st.won ? "✓" : "✕");
      flag.title = st.won ? "solved" : "missed";
      row.appendChild(flag);
    } else {
      // An unplayed day is the one thing on this card worth acting on, so it
      // is a key that opens that run, not a dash that says nothing.
      var go = el("button", "yday-flag go", "→");
      go.type = "button";
      go.title = "Play puzzle #" + (d + 1);
      go.setAttribute("aria-label", "Play " + MODE_BY_ID[modeId].name + " puzzle " + (d + 1));
      go.addEventListener("click", function () {
        sfx("swap");
        location.hash = "#/" + modeId + "/" + (d + 1);
      });
      row.appendChild(go);
    }
    box.appendChild(row);
  }

  // ──────────────── footer ────────────────
  function renderDeckCount() {
    var n = $("deck-count");
    if (n) n.textContent = COINS.length + " coins in the deck";
  }

  // ──────────────── panel chrome ────────────────
  function renderPanelChrome() {
    var m = MODE_BY_ID[modeId];
    var label = unlimited ? "Endless" : (isArchive() ? "Archive #" + (playDay + 1) : "Day #" + (playDay + 1));
    $("game-title").textContent = label + " · " + m.name;
    $("panel-badge").textContent = (MAX_GUESSES - guesses.length) + "/" + MAX_GUESSES;

    var meta = $("game-meta");
    if (unlimited) meta.textContent = "Random coin. Nothing is recorded.";
    else if (isArchive()) meta.textContent = "Archive run. Nothing is recorded.";
    else meta.textContent = "";
  }

  var lastStreak = null;
  // A streak is only live if it was extended today or yesterday; older than that and
  // the next win starts again at 1, so reporting the stored number is a lie.
  function liveStreak(st, d) {
    return st && (st.lastWinDay === d || st.lastWinDay === d - 1) ? st.streak : 0;
  }
  function renderStreak() {
    var pill = $("streak-pill");
    var st = loadStats(modeId);
    var d = dayNumber();
    if (st && st.streak > 0 && (st.lastWinDay === d || st.lastWinDay === d - 1)) {
      pill.textContent = "🔥 " + st.streak + " day streak";
      pill.classList.remove("hidden");
      if (lastStreak !== null && st.streak > lastStreak) sfx("streak");
      if (lastStreak !== null && st.streak > lastStreak && !reducedMotion()) {
        pill.classList.remove("bump");
        void pill.offsetWidth;
        pill.classList.add("bump");
        setTimeout(function () { pill.classList.remove("bump"); }, 460);
      }
      lastStreak = st.streak;
    } else {
      pill.classList.add("hidden");
      lastStreak = st ? st.streak : 0;
    }
  }

  // ──────────────── stage ────────────────
  function wrongCount() {
    return guesses.filter(function (c) { return c.n !== target.n; }).length;
  }
  function revealLevel() {
    return done ? BLUR_STEPS.length - 1 : Math.min(wrongCount(), BLUR_STEPS.length - 1);
  }

  var lastBlur = null;
  function renderStage() {
    var stage = $("stage");
    clear(stage);
    stage.classList.remove("burst", "tight");
    var kind = MODE_BY_ID[modeId].kind;
    var lvl = revealLevel();

    if (kind === "grid") {
      // classic has no image to show, so the panel gets the mystery coin
      stage.classList.add("burst");
      if (guesses.length) stage.classList.add("tight");
      if (done) {
        var solved = logoImg(target, "");
        solved.style.cssText = "position:relative;width:108px;height:108px;border-radius:50%;border:5px solid var(--ink);object-fit:cover";
        stage.appendChild(solved);
        stage.appendChild(el("div", "stage-cap", won ? "Called it." : "It was $" + target.t + "."));
      } else {
        var coin = el("div", "mystery");
        coin.appendChild(el("span", null, "?"));
        stage.appendChild(coin);
        stage.appendChild(el("div", "stage-cap", "The coin"));
      }
      return;
    }

    if (modeId === "blur") {
      var img = logoImg(target, "blur-img");
      img.removeAttribute("loading");
      var to = done
        ? { f: "none", t: "scale(1)" }
        : { f: "blur(" + BLUR_STEPS[lvl] + "px)", t: "scale(" + ZOOM_STEPS[lvl] + ")" };
      // mount at the previous level so the sharpening actually transitions
      var from = (lastBlur !== null && lastBlur !== lvl && !reducedMotion())
        ? { f: "blur(" + BLUR_STEPS[lastBlur] + "px)", t: "scale(" + ZOOM_STEPS[lastBlur] + ")" }
        : to;
      img.style.filter = from.f;
      img.style.transform = from.t;
      if (from !== to) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { img.style.filter = to.f; img.style.transform = to.t; });
        });
      }
      lastBlur = done ? null : lvl;
      var frame = el("div", "blur-frame");
      frame.appendChild(img);
      stage.appendChild(frame);
      stage.appendChild(el("div", "blur-note", done ? "There it is." : "Sharpens with every miss"));

    } else if (modeId === "lore") {
      var card = el("div", "lore-card");
      card.appendChild(el("span", "lore-mark", "“"));
      var q = el("p", "lore-quote");
      loreParts(target).forEach(function (piece, i) {
        if (!piece) return;
        if (i % 2 === 1 && !done) {
          var r = el("span", "redacted", piece);
          r.setAttribute("aria-label", "redacted");
          q.appendChild(r);
        } else {
          q.appendChild(document.createTextNode(piece));
        }
      });
      card.appendChild(q);
      stage.appendChild(card);
    }
  }

  function renderClues() {
    var strip = $("clue-strip");
    if (MODE_BY_ID[modeId].kind !== "stage" || done) { strip.classList.add("hidden"); clear(strip); return; }
    var n = Math.min(wrongCount(), CLUES.length);
    if (n === 0) { strip.classList.add("hidden"); clear(strip); return; }
    strip.classList.remove("hidden");
    clear(strip);
    for (var i = 0; i < n; i++) {
      var c = CLUES[i](target);
      var chip = el("span", "clue-chip");
      chip.appendChild(el("strong", null, c[0] + ":"));
      chip.appendChild(document.createTextNode(" " + c[1]));
      strip.appendChild(chip);
    }
  }

  // Short chain names for narrow tiles. Every chain in data.js has an entry;
  // one without a short form simply keeps its full name.
  var CHAIN_SHORT = {
    "Ethereum": "ETH", "Solana": "SOL", "Robinhood": "HOOD", "BNB Chain": "BNB",
    "Bitcoin": "BTC", "Cardano": "ADA", "Stable Chain": "Stable", "Own chain": "Own"
  };

  // ──────────────── board ────────────────
  function renderBoard(animateLast) {
    var board = $("board"), head = $("col-head");
    var isGrid = MODE_BY_ID[modeId].kind === "grid";
    clear(board); clear(head);

    if (isGrid && guesses.length > 0) {
      head.classList.remove("hidden");
      head.appendChild(el("div", "coin-label"));
      COL_NAMES.forEach(function (c) { head.appendChild(el("div", "col-name", c)); });
    } else {
      head.classList.add("hidden");
    }

    if (guesses.length === 0 && !done) {
      board.appendChild(el("div", "empty-note", isGrid
        ? COINS.length + " coins in the deck."
        : "Each miss reveals a clue."));
    } else if (isGrid) {
      guesses.forEach(function (coin, gi) {
        var isLast = gi === guesses.length - 1;
        var row = el("div", "guess-row" + (animateLast && isLast ? " fresh" : ""));
        var label = el("div", "coin-label");
        label.appendChild(logoImg(coin, "coin-logo"));
        var nw = el("div", "coin-label-text");
        nw.appendChild(el("span", "coin-ticker", "$" + coin.t));
        nw.appendChild(el("span", "coin-name", coin.n));
        label.title = coin.n + " ($" + coin.t + ")";
        label.appendChild(nw);
        row.appendChild(label);
        grade(coin, target).forEach(function (cell, ci) {
          var tile = el("div", "tile s-" + cell.s);
          // The chain column carries a short form too — ETH, SOL, HOOD — which
          // is how crypto players say it anyway. Phones show the short form,
          // because at 43px a tile cannot print "Robinhood"; the full name
          // stays in the title for anyone who hovers or long-presses.
          var short = ci === 0 && CHAIN_SHORT[cell.v];
          if (short) {
            var val = el("span", "tile-val");
            val.appendChild(el("span", "v-full", cell.v));
            val.appendChild(el("span", "v-short", short));
            tile.appendChild(val);
            tile.title = cell.v;
          } else {
            tile.appendChild(el("span", "tile-val", cell.v));
          }
          if (cell.d) tile.appendChild(el("span", "tile-dir", cell.d === "up" ? "▲" : "▼"));
          if (animateLast && isLast) {
            tile.classList.add("flip");
            // A variable, not animation-delay: the exact-match pop has to start
            // the instant this tile's own flip ends, and only a shared variable
            // lets both animations read the same number.
            tile.style.setProperty("--d", (ci * 0.18) + "s");
          }
          row.appendChild(tile);
        });
        board.appendChild(row);
      });
    } else {
      guesses.forEach(function (coin) {
        if (coin.n === target.n) return;   // the winning guess shows in the reveal
        var row = el("div", "miss-row");
        row.appendChild(logoImg(coin, "coin-logo"));
        row.appendChild(el("span", "miss-name", coin.n + " · $" + coin.t));
        row.appendChild(el("span", "miss-x", "✕"));
        board.appendChild(row);
      });
    }

    var pips = $("pips");
    clear(pips);
    for (var i = 0; i < MAX_GUESSES; i++) {
      var fresh = animateLast && i === guesses.length - 1;
      pips.appendChild(el("span", "pip" + (i < guesses.length ? " used" : "") + (fresh ? " fresh" : "")));
    }
    pips.setAttribute("aria-label", (MAX_GUESSES - guesses.length) + " guesses left");
  }

  // ──────────────── hint (classic daily only) ────────────────
  // Only the render that follows a spend animates the chip in. Every other
  // render (a reload, a mode switch back) shows it already there.
  var hintFresh = false;
  function renderHint() {
    var area = $("hint-area");
    clear(area);
    if (modeId !== "classic" || unlimited) return;
    if (hintAxis >= 0) {
      var v = [target.c, target.g, String(target.y), fmtCap(target.m), fmtCap(target.cm)][hintAxis];
      var chip = el("div", "hint-chip" + (hintFresh ? " fresh" : ""));
      hintFresh = false;
      chip.appendChild(el("span", null, COL_NAMES[hintAxis] + ": " + v));
      area.appendChild(chip);
      return;
    }
    if (done || guesses.length < 1) return;
    var btn = el("button", "hint-btn", "Spend a hint");
    btn.addEventListener("click", function () {
      var solved = {};
      guesses.forEach(function (c) {
        grade(c, target).forEach(function (cell, i) { if (cell.s === "g") solved[i] = 1; });
      });
      var open = [0, 1, 2, 3, 4].filter(function (i) { return !solved[i]; });
      if (!open.length) open = [0, 1, 2, 3, 4];
      hintAxis = open[Math.floor(Math.random() * open.length)];
      saveDaily();
      hintFresh = true;
      sfx("sparkle");
      renderHint();
      renderDock();
    });
    area.appendChild(btn);
  }

  function renderAll(animateLast) {
    renderPanelChrome();
    renderModeRail();
    renderYesterday();
    renderDock();
    renderStage();
    renderBoard(animateLast);
    renderClues();
    renderHint();
    renderStreak();
  }

  // ──────────────── confetti ────────────────
  function reducedMotion() {
    return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function confettiBurst() {
    try {
      if (reducedMotion()) return;
      var cv = $("confetti"), ctx = cv.getContext("2d");
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      var colors = ["#4FD16B", "#FFD93B", "#FF7BC4", "#B08BF0", "#F4635A"];
      var parts = [];
      for (var i = 0; i < 96; i++) {
        parts.push({
          x: Math.random() * cv.width, y: -30 - Math.random() * cv.height * 0.4,
          w: 6 + Math.random() * 5, h: 6 + Math.random() * 9,
          v: 2.6 + Math.random() * 4.2, r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.26,
          c: colors[Math.floor(Math.random() * colors.length)]
        });
      }
      var t0 = performance.now();
      (function tick(t) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (t - t0 > 1800) return;
        parts.forEach(function (p) {
          p.y += p.v; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.strokeStyle = "#2B2C4B"; ctx.lineWidth = 2;
          ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        });
        requestAnimationFrame(tick);
      })(t0);
    } catch (e) {}
  }

  // ──────────────── autocomplete ────────────────
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
    var m = acMatches($("guess-input").value);
    clear(list);
    if (done || m.length === 0) { list.classList.add("hidden"); acIndex = -1; return; }
    list.classList.remove("hidden");
    m.forEach(function (c, i) {
      var item = el("div", "ac-item" + (i === acIndex ? " active" : ""));
      item.setAttribute("role", "option");
      item.appendChild(logoImg(c, "ac-logo"));
      item.appendChild(el("span", "ac-name", c.n));
      item.appendChild(el("span", "ac-ticker", "$" + c.t));
      item.addEventListener("mousedown", function (ev) { ev.preventDefault(); submitGuess(c); });
      list.appendChild(item);
    });
  }
  function submitTyped() {
    var m = acMatches($("guess-input").value);
    if (m.length) { submitGuess(m[acIndex >= 0 ? acIndex : 0]); return; }
    // a guess with nothing to match used to be completely silent
    var wrap = document.querySelector(".input-wrap");
    if (!wrap || !$("guess-input").value.trim()) return;
    wrap.classList.remove("reject");
    void wrap.offsetWidth;
    wrap.classList.add("reject");
    sfx("deny");
    setTimeout(function () { wrap.classList.remove("reject"); }, 400);
  }

  // One door to the sound kit, so nothing in here has to know whether the
  // player has opted in or whether the file even loaded.
  function sfx(name, arg) {
    if (window.SFX) SFX.play(name, arg);
  }

  // Enter and the autocomplete row both commit without the button ever
  // entering :active, so the press has to be fired by hand.
  function stamp(btn) {
    if (!btn || reducedMotion()) return;
    btn.classList.remove("sent");
    void btn.offsetWidth;
    btn.classList.add("sent");
    setTimeout(function () { btn.classList.remove("sent"); }, 400);
  }

  function submitGuess(coin) {
    if (done || guesses.length >= MAX_GUESSES) return;
    guesses.push(coin);
    stamp($("btn-go"));
    sfx("submit");
    if (window.MO) MO.brandKick();
    $("guess-input").value = "";
    acIndex = -1; renderAC();
    var win = coin.n === target.n;
    if (win || guesses.length >= MAX_GUESSES) {
      done = true; won = win;
      recordResult(win, guesses.length);
    }
    saveDaily();
    renderAll(true);
    // one click per tile as the row turns over, pitched by column so a whole
    // row reads as a run rather than as five copies of the same sound
    if (MODE_BY_ID[modeId].kind === "grid" && !reducedMotion()) {
      for (var i = 0; i < 5; i++) {
        (function (k) { setTimeout(function () { sfx("flip", k); }, k * 180 + 180); })(i);
      }
    }
    if (done) {
      $("guess-input").disabled = true;
      $("btn-go").disabled = true;
      var delay = MODE_BY_ID[modeId].kind === "grid" ? 5 * 180 + 420 : 500;
      var isGrid = MODE_BY_ID[modeId].kind === "grid";
      // On a win the reveal waits a beat. It used to open the instant the last
      // tile landed, and the modal covered the board at exactly the moment the
      // row was worth looking at. The win is the one place in this game with a
      // delight budget; it gets room to be seen.
      var revealAt = won && isGrid ? delay + 600 : delay;
      if (won) {
        setTimeout(confettiBurst, Math.max(0, delay - 360));
        setTimeout(function () {
          sfx("win");
          if (window.MO) { MO.cheer(); MO.coinBurst(); }
        }, Math.max(0, delay - 360));
        if (isGrid) {
          setTimeout(function () {
            var rows = $("board").querySelectorAll(".guess-row");
            if (window.MO && rows.length) MO.winWave(rows[rows.length - 1]);
          }, delay);
        }
      } else {
        setTimeout(function () {
          sfx("lose");
          if (window.MO) MO.lose($("board"));
        }, Math.max(0, delay - 200));
      }
      setTimeout(openReveal, revealAt);
      if (typeof LB !== "undefined" && !unlimited && !isArchive()) {
        LB.report(modeId, won, guesses.length, playDay, hintAxis >= 0);
      }
    } else {
      sfx(win ? "hit" : "miss");
      $("guess-input").focus();
    }
  }

  // ──────────────── share ────────────────
  function shareText() {
    var m = MODE_BY_ID[modeId];
    var score = (won ? guesses.length : "X") + "/" + MAX_GUESSES;
    var head = unlimited ? "Memedle " + m.name + " · endless · " + score
      : "Memedle " + m.name + " #" + (playDay + 1) + " · " + score;
    if (hintAxis >= 0 && modeId === "classic" && !unlimited) head += " · hint";
    var SQ = squares();
    var rows = m.kind === "grid"
      ? guesses.map(function (c) { return grade(c, target).map(function (cell) { return SQ[cell.s]; }).join(""); })
      : [guesses.map(function (c) { return c.n === target.n ? SQ.g : SQ.x; }).join("")];
    return head + "\n\n" + rows.join("\n") + "\n\n" + SITE_URL;
  }
  function copyShare() {
    var txt = shareText();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(fallback);
    else fallback();
    flash("Grid copied.");
  }

  // The line that lands in the X composer. The card carries the grid, so the
  // caption does not narrate the image — it states the result and stops, and
  // the ~150 characters it leaves behind are the point: a short prefill invites
  // people to add their own line instead of deleting yours.
  function shareCaption() {
    var m = MODE_BY_ID[modeId];
    var score = (won ? guesses.length : "X") + "/" + MAX_GUESSES;
    var head = unlimited
      ? "Memedle " + m.name + " endless — " + score
      : "Memedle " + m.name + " #" + (playDay + 1) + " — " + score;
    if (hintAxis >= 0 && modeId === "classic" && !unlimited) head += " · hint";
    return head + ". https://" + SITE_URL;
  }

  // What the PNG needs. Deliberately not the answer: a result card that spoils
  // the coin is a card nobody can post until their whole timeline has played.
  function cardState() {
    var m = MODE_BY_ID[modeId];
    var grid = m.kind === "grid";
    var rows;
    if (grid) {
      rows = guesses.map(function (c) {
        return grade(c, target).map(function (cell) { return cell.s; });
      });
    } else {
      var one = guesses.map(function (c) { return c.n === target.n ? "g" : "x"; });
      while (one.length < MAX_GUESSES) one.push(null);
      rows = [one];
    }
    var st = loadStats(modeId) || defaultStats;
    return {
      mode: modeId,
      modeName: m.name,
      blurb: m.blurb,
      day: playDay + 1,
      unlimited: unlimited,
      won: won,
      guesses: guesses.length,
      max: MAX_GUESSES,
      slots: grid ? MAX_GUESSES : 1,
      rows: rows,
      hint: hintAxis >= 0 && modeId === "classic" && !unlimited,
      streak: (!unlimited && !isArchive() && st.streak) || 0,
      url: SITE_URL,
      cb: document.body.classList.contains("cb")
    };
  }

  function postToX(btn) {
    if (typeof SHARE === "undefined") { copyShare(); return; }
    btn.disabled = true;
    SHARE.postToX(cardState(), shareCaption()).then(function (how) {
      btn.disabled = false;
      if (how === "clipboard") flash("Card copied — paste it into the post.");
      else if (how === "download") flash("Card saved — attach it to the post.");
      else if (how === "text") flash("Couldn't build the card. The words went over.");
    }, function () {
      btn.disabled = false;
      flash("X didn't open. Check your popup blocker.");
    });
  }

  // ──────────────── flash ────────────────
  function flash(msg) {
    var layer = $("flash-layer");
    if (!layer) return;
    while (layer.children.length > 2) layer.removeChild(layer.firstChild);
    var node = el("div", "flash", msg);
    layer.appendChild(node);
    // 1600ms dwell + 150ms exit; the CSS reads the same two tokens, so the
    // timer and the animation cannot drift apart.
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1780);
  }

  // ──────────────── modals ────────────────
  // One dialog at a time. Opening a second used to stack it on the first: on a day you
  // had already solved, the reveal card is up on load, and clicking Coin list or Stats
  // opened that modal *behind* it — two ✕ buttons, two scrolls, one unreadable screen.
  function openModal(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop:not(.hidden)"), function (m) {
      if (m.id === id || m.hasAttribute("data-lock")) return;
      m.classList.remove("closing");
      m.classList.add("hidden");
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    });
    $(id).classList.remove("hidden");
  }
  function closeModal(node) {
    if (!node || node.classList.contains("hidden")) return;
    if (reducedMotion()) { node.classList.add("hidden"); return; }
    node.classList.add("closing");
    setTimeout(function () { node.classList.remove("closing"); node.classList.add("hidden"); }, 150);
  }
  function closeModals(force) {
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      // the handle gate is a decision, not a dialog: it does not take a
      // backdrop click, an Escape, or a route change for an answer
      if (!force && m.hasAttribute("data-lock")) return;
      closeModal(m);
    });
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    // A reveal that deferred to whatever the player had open gets its turn now,
    // once the close animation has actually finished.
    if (pendingReveal) {
      setTimeout(function () {
        if (pendingReveal && !anyModalOpen()) { pendingReveal = false; openReveal(); }
      }, 180);
    }
  }
  function countdownStr() {
    // Counts to the next UTC midnight, which is when dayNumber() actually rolls.
    var s = Math.max(0, Math.ceil(((dayNumber() + 1) * 86400000 + EPOCH - Date.now()) / 1000));
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
  }

  var countdownTimer = null;
  var pendingReveal = false;
  function gateOpen() {
    var g = $("modal-gate");
    return !!g && !g.classList.contains("hidden");
  }
  // The auto-reveal fires 320ms after a solved board is restored. Deferring only for
  // the gate was too narrow: open the coin list or the stats on a day you had already
  // solved and the reveal card dropped on top of it a moment later. Wait for whatever
  // the player opened to close instead.
  function anyModalOpen() {
    return !!document.querySelector(".modal-backdrop:not(.hidden)");
  }
  function maybeReveal() {
    if (gateOpen() || anyModalOpen()) { pendingReveal = true; return; }
    openReveal();
  }
  function openReveal() {
    var box = $("reveal-body");
    clear(box);
    box.appendChild(el("div", "reveal-verdict " + (won ? "win" : "lose"), won ? "Early." : "Rugged."));
    box.appendChild(el("div", "reveal-sub", won
      ? "Got it in " + guesses.length + "/" + MAX_GUESSES + "."
      : "The coin walks free."));

    var card = el("div", "coin-card");
    var title = el("div", "coin-card-title");
    title.appendChild(logoImg(target, "coin-card-logo"));
    var tw = el("div", "coin-card-title-text");
    tw.appendChild(el("span", "coin-card-name", target.n));
    tw.appendChild(el("span", "coin-card-ticker", "$" + target.t));
    title.appendChild(tw);
    card.appendChild(title);

    var facts = el("div", "coin-card-facts");
    [target.c, target.g, String(target.y), fmtCap(target.m) + " peak", fmtCap(target.cm) + " now"].forEach(function (f) {
      facts.appendChild(el("span", "fact-chip", f));
    });
    var dd = Math.round((1 - target.cm / target.m) * 100);
    facts.appendChild(dd >= 1
      ? el("span", "fact-chip chip-down", "−" + dd + "% from peak")
      : el("span", "fact-chip chip-peak", "at its peak"));
    card.appendChild(facts);

    var bar = el("div", "dd-bar");
    bar.title = "how much of the peak survives";
    var fill = el("div", "dd-fill");
    fill.style.width = "0%";
    bar.appendChild(fill);
    card.appendChild(bar);
    setTimeout(function () {
      fill.style.width = Math.max(0.8, Math.min(100, (target.cm / target.m) * 100)) + "%";
    }, 60);

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

    var row = el("div", "btn-row");
    // The card is rendered now, not on the click. Safari only honours a
    // clipboard write and a popup inside the gesture that started them, and
    // awaiting a canvas first throws that gesture away.
    if (typeof SHARE !== "undefined") SHARE.prime(cardState());
    var xbtn = el("button", "btn btn-primary", "Post on X");
    xbtn.addEventListener("click", function () { postToX(xbtn); });
    row.appendChild(xbtn);
    var share = el("button", "btn", "Copy grid");
    share.addEventListener("click", function () { copyShare(); });
    row.appendChild(share);

    if (unlimited) {
      var again = el("button", "btn", "next coin ↻");
      again.addEventListener("click", function () { closeModals(); startGame(); });
      row.appendChild(again);
      box.appendChild(row);
    } else {
      var next = null;
      for (var i = 0; i < MODES.length; i++) {
        var s = dayStatusFor(MODES[i].id);
        if (MODES[i].id !== modeId && !(s && s.done)) { next = MODES[i]; break; }
      }
      if (next) {
        var nm = el("button", "btn", "play " + next.name);
        nm.addEventListener("click", function () { closeModals(); location.hash = "#/" + next.id; });
        row.appendChild(nm);
      } else {
        var inf = el("button", "btn", "endless ∞");
        inf.addEventListener("click", function () { closeModals(); location.hash = "#/" + modeId + "/unlimited"; });
        row.appendChild(inf);
      }
      box.appendChild(row);
      if (!isArchive()) {
        // A finished run is the one moment the pot is a live question, so it
        // is the one place outside the board that gets a line about it.
        var pot = el("p", "reveal-pot", "The top ten on today's board is paid at 00:00 UTC. ");
        var see = el("button", null, "see the board");
        see.addEventListener("click", function () {
          closeModals();
          if (typeof LB !== "undefined") LB.open(dayNumber(), modeId);
        });
        pot.appendChild(see);
        box.appendChild(pot);
        box.appendChild(el("div", "countdown-label", "next daily in"));
        var cd = el("div", "countdown", countdownStr());
        box.appendChild(cd);
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(function () { cd.textContent = countdownStr(); }, 1000);
      }
    }
    openModal("modal-reveal");
    if (window.MO) {
      MO.coinIn(box.querySelector(".coin-card-logo"));
      MO.stagger(box.querySelectorAll(".fact-chip"), 0.28);
    }
  }

  function renderStats() {
    var st = loadStats(statsMode) || defaultStats;
    // The numbers count up from zero. The count is the flourish, not the
    // information: under reduced motion MO.countUp writes the final value at
    // once, and win rate keeps its em dash when nothing has been played.
    var count = function (id, v, fmt) {
      if (window.MO) MO.countUp($(id), v, fmt);
      else $(id).textContent = fmt ? fmt(v) : v;
    };
    count("st-played", st.played);
    if (st.played) {
      count("st-winpct", Math.round(100 * st.wins / st.played), function (v) { return Math.round(v) + "%"; });
    } else {
      $("st-winpct").textContent = "—";
    }
    // Same freshness test the header pill uses. Without it the modal kept reporting a
    // streak that had been dead for weeks, while the pill correctly hid it.
    count("st-streak", liveStreak(st, dayNumber()));
    count("st-max", st.maxStreak);
    var wrap = $("dist");
    clear(wrap);
    var max = Math.max.apply(null, st.dist.concat([1]));
    st.dist.forEach(function (n, i) {
      var row = el("div", "dist-row");
      row.appendChild(el("span", "dist-n", String(i + 1)));
      var bar = el("div", "dist-bar");
      bar.style.width = Math.max(9, Math.round(100 * n / max)) + "%";
      bar.appendChild(el("span", "dist-count", String(n)));
      row.appendChild(bar);
      wrap.appendChild(row);
    });
    var tabs = $("stat-tabs");
    clear(tabs);
    MODES.forEach(function (m) {
      var b = el("button", "stat-tab" + (m.id === statsMode ? " on" : ""), m.name);
      b.addEventListener("click", function () { statsMode = m.id; renderStats(); });
      tabs.appendChild(b);
    });
  }
  function openStats() { statsMode = modeId; renderStats(); openModal("modal-stats"); }

  // ──────────────── coin list ────────────────
  // The whole roster, so a player can see what they are guessing against. Sorted by
  // name rather than by the internal order, because the internal order is the shuffle
  // seed's business and printing it would leak the rotation.
  function renderCoinList(q) {
    var box = $("coins-body");
    if (!box) return;
    clear(box);
    var needle = String(q || "").trim().toLowerCase();
    var list = COINS.slice().sort(function (a, b) { return a.n.localeCompare(b.n); });
    if (needle) {
      list = list.filter(function (c) {
        return (c.n + " " + c.t + " " + c.c + " " + c.g).toLowerCase().indexOf(needle) >= 0;
      });
    }
    $("coins-count").textContent = needle
      ? list.length + " of " + COINS.length + " coins"
      : COINS.length + " coins in the game right now";
    if (!list.length) {
      box.appendChild(el("p", "coins-empty", "Nothing matches “" + q + "”."));
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (c) {
      var row = el("div", "coin-row");
      row.appendChild(logoImg(c, "coin-row-logo"));
      var txt = el("div", "coin-row-text");
      txt.appendChild(el("span", "coin-row-name", c.n));
      txt.appendChild(el("span", "coin-row-meta", c.c + " · " + c.y + " · " + c.g));
      row.appendChild(txt);
      row.appendChild(el("span", "coin-row-ticker", "$" + c.t));
      frag.appendChild(row);
    });
    box.appendChild(frag);
  }
  function openCoinList() {
    var input = $("coins-search");
    if (input) input.value = "";
    renderCoinList("");
    renderSocial("coins-social");
    openModal("modal-coins");
    // Not on touch: focusing here throws up the keyboard over the list you opened.
    if (input && !("ontouchstart" in window)) input.focus();
  }

  function openArchive() {
    var box = $("archive-body");
    clear(box);
    var today = dayNumber();
    var rows = 0;
    for (var d = today - 1; d >= 0 && rows < 60; d--) {
      // `var d` is function-scoped, so every click handler used to read the value the
      // loop ended on (-1). Every row navigated to #/<mode>/d-1, which route() rejects,
      // and the Archive quietly opened today's live puzzle instead.
      var day = d;
      MODES.forEach(function (m) {
        var st = loadDay(m.id, day);
        var btn = el("button", "arch-row");
        btn.appendChild(el("span", "arch-day", "#" + (day + 1)));
        btn.appendChild(el("span", "arch-mode", m.name));
        btn.appendChild(el("span", "arch-state", st && st.done ? (st.won ? "✓ " + (st.g ? st.g.length : "?") + "/6" : "✕") : "play →"));
        btn.addEventListener("click", function () {
          closeModals();
          location.hash = "#/" + m.id + "/d" + day;
        });
        box.appendChild(btn);
      });
      rows++;
    }
    if (!rows) box.appendChild(el("p", "lb-empty", "No past puzzles yet — come back tomorrow."));
    openModal("modal-archive");
  }

  function renderHelpModes() {
    var box = $("help-modes");
    if (!box) return;
    clear(box);
    MODES.forEach(function (m) {
      var row = el("div", "help-mode");
      row.appendChild(logoByTicker(m.icon, "help-mode-ico"));
      row.appendChild(el("span", "help-mode-name", m.name));
      row.appendChild(el("span", "help-mode-desc", m.blurb));
      box.appendChild(row);
    });
  }

  // ──────────────── socials ────────────────
  var SOCIAL_ICON = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    // two candles with wicks — drawn here rather than lifted, so it inherits
    // currentColor and sits on the same 24px grid as the X mark
    dex: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h3v4h2v9H9v4H6v-4H4V6h2V2zm9 3h3v5h2v7h-2v5h-3v-5h-2v-7h2V5z"/></svg>'
  };
  function renderSocial(id) {
    var row = $(id || "social-row");
    if (!row) return;
    clear(row);
    SOCIAL.forEach(function (s) {
      var live = !!s.url;
      var node = document.createElement(live ? "a" : "button");
      node.className = "social-btn" + (live ? "" : " soon");
      node.innerHTML = SOCIAL_ICON[s.id] || "";
      if (s.label) node.appendChild(el("span", "social-label", s.label));
      if (live) {
        node.href = s.url; node.target = "_blank"; node.rel = "noopener";
        node.title = s.title; node.setAttribute("aria-label", s.title);
      } else {
        node.type = "button";
        node.title = s.title + " — not up yet";
        node.setAttribute("aria-label", s.title + ", not up yet");
        node.appendChild(el("span", "soon-tag", "soon"));
        node.addEventListener("click", function () {
          node.classList.add("nudge");
          setTimeout(function () { node.classList.remove("nudge"); }, 400);
        });
      }
      row.appendChild(node);
    });
  }

  // ──────────────── start / route ────────────────
  function startGame() {
    var input = $("guess-input");
    guesses = []; done = false; won = false; hintAxis = -1; lastBlur = null;
    runArchive = !unlimited && playDay !== dayNumber();

    if (unlimited) {
      target = randomCoin(target ? target.n : null);
    } else {
      target = dailyCoin(modeId, playDay);
      var saved = loadDay(modeId, playDay);
      // A saved board is only this board if it was played against this coin. The roster
      // changes, and without the stamp an old save was restored onto a new answer and
      // repainted a solved run as an all-miss loss.
      if (saved && Array.isArray(saved.g) && (!saved.t || saved.t === target.t)) {
        var byName = {};
        COINS.forEach(function (c) { byName[c.n] = c; });
        saved.g.forEach(function (n) { if (byName[n]) guesses.push(byName[n]); });
        done = !!saved.done; won = !!saved.won;
        if (typeof saved.h === "number") hintAxis = saved.h;
      }
    }

    input.disabled = done;
    $("btn-go").disabled = done;
    input.value = "";
    input.placeholder = done ? (unlimited ? "Next coin ↻" : "Come back tomorrow") : "Type a memecoin…";
    renderAll(false);
    if (done) setTimeout(maybeReveal, 320);
    else if (!("ontouchstart" in window) && !gateOpen()) input.focus();
  }

  var routedOnce = false;
  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    var prevMode = modeId;
    modeId = MODE_BY_ID[parts[0]] ? parts[0] : "classic";
    unlimited = parts[1] === "unlimited";
    playDay = dayNumber();
    if (parts[1] && /^d\d+$/.test(parts[1])) {
      var d = parseInt(parts[1].slice(1), 10);
      if (d >= 0 && d <= dayNumber()) playDay = d;
    }
    closeModals();
    startGame();
    window.scrollTo(0, 0);
    // Not on first load: the page-wide entrance already moves everything, and
    // a second animation on top of it reads as a stutter.
    if (routedOnce && prevMode !== modeId) {
      sfx("swap");
      if (window.MO) MO.modeIn();
    }
    routedOnce = true;
  }

  // ──────────────── wire up ────────────────
  function bindToggle(box, cls, key) {
    if (!box) return;
    box.checked = lsGet(key) === "1";
    document.body.classList.toggle(cls, box.checked);
    box.setAttribute("data-sync", key);
    box.addEventListener("change", function () {
      document.body.classList.toggle(cls, box.checked);
      lsSet(key, box.checked ? "1" : "0");
      Array.prototype.forEach.call(document.querySelectorAll('input[data-sync="' + key + '"]'), function (o) {
        if (o !== box) o.checked = box.checked;
      });
      renderAll(false);
    });
  }

  function init() {
    migrate();
    $("brand-slot").innerHTML = brandHTML();
    buildDock();
    renderDeckCount();
    renderHelpModes(); renderSocial();

    // Sound: the button and the Settings checkbox are two views of one stored
    // flag, so either one moves both. Nothing is constructed until a press.
    // Drawn, not an emoji: the crossed-out speaker renders as a grey tofu box
    // on Windows, which looks like a broken asset rather than a muted state.
    function sfxIcon(on) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#16161A" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/>' +
        (on
          ? '<path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.4 6.4a8 8 0 0 1 0 11.2"/>'
          : '<path d="M16 10l4 4M20 10l-4 4"/>') +
        '</svg>';
    }
    function syncSfx() {
      var on = !!(window.SFX && SFX.enabled);
      var btn = $("btn-sfx"), ico = $("sfx-ico"), box = $("sfx-toggle");
      if (btn) { btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.title = on ? "Sound on" : "Sound off"; }
      if (ico) ico.innerHTML = sfxIcon(on);
      if (box) box.checked = on;
    }
    if ($("btn-sfx")) {
      $("btn-sfx").addEventListener("click", function () {
        if (window.SFX) SFX.toggle();
        syncSfx();
      });
    }
    if ($("sfx-toggle")) {
      $("sfx-toggle").addEventListener("change", function () {
        if (window.SFX) SFX.set($("sfx-toggle").checked);
        syncSfx();
      });
    }
    syncSfx();

    var input = $("guess-input");
    input.addEventListener("input", function () { acIndex = -1; renderAC(); });
    input.addEventListener("keydown", function (ev) {
      var m = acMatches(input.value);
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (m.length) { acIndex = (acIndex + 1) % m.length; renderAC(); } }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (m.length) { acIndex = (acIndex - 1 + m.length) % m.length; renderAC(); } }
      else if (ev.key === "Enter") { ev.preventDefault(); submitTyped(); }
      else if (ev.key === "Escape") { input.value = ""; renderAC(); }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { $("ac-list").classList.add("hidden"); }, 150);
    });
    input.addEventListener("focus", renderAC);
    $("btn-go").addEventListener("click", function () { submitTyped(); input.focus(); });

    $("btn-help").addEventListener("click", function () { openModal("modal-help"); });
    $("btn-help-2").addEventListener("click", function () { openModal("modal-help"); });
    $("btn-settings").addEventListener("click", function () { openModal("modal-settings"); });

    Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
      b.addEventListener("click", function () {
        var go = b.getAttribute("data-go");
        if (go === "stats") openStats();
        else if (go === "coins") openCoinList();
        else if (go === "board" && typeof LB !== "undefined") LB.open(dayNumber(), modeId);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
      // Wrapped, not passed directly: as a listener the MouseEvent arrives as `force`,
      // which is truthy, so every ✕ press bypassed the data-lock guard and dismissed
      // the handle gate that is explicitly meant to be undismissable.
      b.addEventListener("click", function () { closeModals(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      m.addEventListener("click", function (ev) { if (ev.target === m) closeModals(); });
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeModals(); });

    var coinSearch = $("coins-search");
    if (coinSearch) coinSearch.addEventListener("input", function () { renderCoinList(coinSearch.value); });

    bindToggle($("cb-toggle"), "cb", "md_cb");
    bindToggle($("cb-toggle-2"), "cb", "md_cb");

    $("btn-wipe").addEventListener("click", function () {
      var b = $("btn-wipe");
      if (b.getAttribute("data-armed") !== "1") {
        b.setAttribute("data-armed", "1");
        b.textContent = "tap again to confirm";
        setTimeout(function () { b.removeAttribute("data-armed"); b.textContent = "Erase my record"; }, 4000);
        return;
      }
      try {
        var keep = { md_cid: 1, md_name: 1, md_x: 1 };
        var kill = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && !keep[k] && (k.indexOf("md_") === 0 || k.indexOf("mcdl_") === 0)) kill.push(k);
        }
        kill.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
      location.reload();
    });

    // Without a touch listener somewhere in the document, iOS Safari never
    // applies :active — which silently disables every press animation on the
    // page for every iPhone visitor.
    document.addEventListener("touchstart", function () {}, { passive: true });

    window.addEventListener("hashchange", route);

    route();

    // after route() — it clears open modals on every navigation, this one included
    function firstRun() {
      if (!lsGet("md_seen")) {
        lsSet("md_seen", "1");
        openModal("modal-help");
        return;
      }
      if (pendingReveal) { pendingReveal = false; openReveal(); }
    }
    if (typeof LB !== "undefined") LB.boot(firstRun);
    else firstRun();

    // last: the board is rendered, so the entrance has something to stagger
    if (window.MO) MO.start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
