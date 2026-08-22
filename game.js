/* Memedle — game engine. One dashboard, three modes, no dependencies. */
(function () {
  "use strict";

  // ──────────────── constants ────────────────
  var EPOCH = new Date(2026, 7, 21);   // puzzle #1 = Aug 21 2026 (local time)
  var MAX_GUESSES = 6;
  var SITE_URL = "memedle-weld.vercel.app";

  // Leave a URL empty and the button renders as a dead "soon" chip instead of a
  // link, so nothing ever points at a 404.
  var SOCIAL = [{ id: "x", label: "Follow on X", url: "" }];

  // Classic keeps the original seed so its daily sequence never shifts.
  var MODES = [
    { id: "classic", name: "Classic", icon: "DOGE", blurb: "Guess from attributes.",        seed: 0x5EED1337, kind: "grid" },
    { id: "blur",    name: "Blur",    icon: "PEPE", blurb: "Logo starts cursed. It clears.", seed: 0x1D0FBE47, kind: "stage" },
    { id: "lore",    name: "Lore",    icon: "SHIB", blurb: "One unhinged sentence.",         seed: 0x4B19AC03, kind: "stage" }
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
  function todayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function dayNumber() { return Math.round((todayLocal() - EPOCH) / 86400000); }

  var ORDERS = {};
  function orderFor(modeId) {
    if (ORDERS[modeId]) return ORDERS[modeId];
    var idx = COINS.map(function (_, i) { return i; });
    var rnd = mulberry32(MODE_BY_ID[modeId].seed);
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    ORDERS[modeId] = idx;
    return idx;
  }
  // Independent shuffles occasionally hand the same coin to two modes on the
  // same day, which turns solving one into a free hint for the other. Assign in
  // a fixed mode order and walk past collisions — classic is first, so its
  // historical sequence is never touched. 151 is prime, so any stride walks the
  // whole permutation; a big one keeps a displaced pick far from that mode's
  // neighbouring days (a +1 walk would land on its own next day).
  var STRIDE = 61;
  var dayPicks = {};
  function picksFor(day) {
    if (dayPicks[day]) return dayPicks[day];
    var used = {}, out = {};
    MODES.forEach(function (m) {
      var o = orderFor(m.id), len = o.length, pick = null;
      for (var k = 0; k < len; k++) {
        var c = COINS[o[((((day + k * STRIDE) % len) + len) % len)]];
        if (!used[c.t]) { pick = c; break; }
      }
      if (!pick) pick = COINS[o[(((day % len) + len) % len)]];
      used[pick.t] = 1;
      out[m.id] = pick;
    });
    dayPicks[day] = out;
    return out;
  }
  function dailyCoin(modeId, day) { return picksFor(day)[modeId]; }
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
    function (c) { return ["Born", String(c.y)]; },
    function (c) { return ["Type", c.g]; },
    function (c) { return ["Peak", TIER_LABELS[capTier(c.m)]]; },
    function (c) { return ["Now", NOW_LABELS[nowTier(c.cm)]]; }
  ];

  // ──────────────── lore redaction ────────────────
  var STOP = { with: 1, that: 1, from: 1, into: 1, then: 1, this: 1, coin: 1, token: 1, meme: 1 };
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function loreParts(coin) {
    var terms = [coin.n, coin.t];
    coin.n.split(/[\s\-']+/).forEach(function (w) { if (w.length >= 4 && !STOP[w.toLowerCase()]) terms.push(w); });
    if (coin.w) coin.w.split("_").forEach(function (w) { if (w.length >= 4 && !STOP[w.toLowerCase()]) terms.push(w); });
    var seen = {}, uniq = [];
    terms.forEach(function (t) {
      var k = t.toLowerCase();
      if (t && !seen[k]) { seen[k] = 1; uniq.push(t); }
    });
    uniq.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(" + uniq.map(reEsc).join("|") + ")", "gi");
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

  function isArchive() { return !unlimited && playDay !== dayNumber(); }
  function statsKey(m) { return "md_stats_v1_" + m; }
  var defaultStats = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: -2, lastPlayedDay: -2, dist: [0, 0, 0, 0, 0, 0] };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function saveDaily() {
    if (unlimited) return;
    lsSet("md_day_" + modeId + "_" + playDay, JSON.stringify({
      g: guesses.map(function (c) { return c.n; }), done: done, won: won, h: hintAxis
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
    var d = dayNumber();
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

  // ──────────────── brand: chunky extruded pixel wordmark ────────────────
  function brandSVG(sfx) {
    var gid = "bg-" + sfx;
    var DEPTH = 9;
    function line(y, fill, stroke) {
      return '<text x="280" y="' + y + '" text-anchor="middle" ' +
        'font-family="Luckiest Guy, Arial Black, sans-serif" font-size="80" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="14" stroke-linejoin="round" ' +
        'paint-order="stroke">MEMEDLE</text>';
    }
    var out = '<svg viewBox="0 0 560 140" role="img" aria-label="Memedle">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#FFF3A6"/><stop offset="48%" stop-color="#FFD93B"/>' +
      '<stop offset="100%" stop-color="#FFC01F"/></linearGradient></defs><g>';
    // extrusion slabs, deepest first, each outlined so the stack reads as one solid
    for (var i = DEPTH; i >= 1; i--) out += line(88 + i, "#E08A12", "#2B2C4B");
    out += line(88, "url(#" + gid + ")", "#2B2C4B");
    return out + "</g></svg>";
  }

  // ──────────────── clouds: outlined pixel blocks ────────────────
  var CLOUD_SHAPES = [
    [[2,0],[3,0],[1,1],[2,1],[3,1],[4,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2]],
    [[3,0],[4,0],[5,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
     [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]],
    [[2,0],[3,0],[6,0],[7,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],
     [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2]],
    [[1,0],[2,0],[0,1],[1,1],[2,1],[3,1]]
  ];
  function cloudSVG(shape) {
    var has = {}, i, x, y;
    for (i = 0; i < shape.length; i++) has[shape[i][0] + "," + shape[i][1]] = 1;
    // outline = every empty cell orthogonally touching the shape
    var outline = {};
    for (i = 0; i < shape.length; i++) {
      x = shape[i][0]; y = shape[i][1];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
        var k = (x + d[0]) + "," + (y + d[1]);
        if (!has[k]) outline[k] = 1;
      });
    }
    var minX = 0, minY = 0, maxX = 0, maxY = 0, first = true;
    function span(k) {
      var p = k.split(","), px = +p[0], py = +p[1];
      if (first) { minX = maxX = px; minY = maxY = py; first = false; }
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    Object.keys(has).forEach(span); Object.keys(outline).forEach(span);
    var lowest = {};
    for (i = 0; i < shape.length; i++) {
      x = shape[i][0]; y = shape[i][1];
      if (lowest[x] === undefined || y > lowest[x]) lowest[x] = y;
    }
    var r = "";
    Object.keys(outline).forEach(function (k) {
      var p = k.split(",");
      r += "%3Crect x='" + (+p[0] - minX) + "' y='" + (+p[1] - minY) + "' width='1' height='1' fill='%232B2C4B'/%3E";
    });
    for (i = 0; i < shape.length; i++) {
      x = shape[i][0]; y = shape[i][1];
      var fill = y === lowest[x] ? "%23C9E4F5" : "%23FFFFFF";
      r += "%3Crect x='" + (x - minX) + "' y='" + (y - minY) + "' width='1' height='1' fill='" + fill + "'/%3E";
    }
    return {
      uri: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " +
        (maxX - minX + 1) + " " + (maxY - minY + 1) + "'%3E" + r + "%3C/svg%3E",
      w: maxX - minX + 1, h: maxY - minY + 1
    };
  }
  function buildClouds() {
    var wrap = $("clouds");
    if (!wrap) return;
    clear(wrap);
    var rnd = mulberry32(0xC10D5);
    var n = window.innerWidth <= 760 ? 5 : 8;
    for (var i = 0; i < n; i++) {
      var svg = cloudSVG(CLOUD_SHAPES[Math.floor(rnd() * CLOUD_SHAPES.length)]);
      var px = 5 + Math.round(rnd() * 5);
      var c = el("div", "cloud");
      c.style.backgroundImage = 'url("' + svg.uri + '")';
      c.style.width = svg.w * px + "px";
      c.style.height = svg.h * px + "px";
      c.style.top = (3 + rnd() * 30).toFixed(1) + "%";
      c.style.opacity = (0.75 + rnd() * 0.25).toFixed(2);
      c.style.animationDuration = (85 + rnd() * 120).toFixed(0) + "s";
      c.style.animationDelay = "-" + (rnd() * 150).toFixed(0) + "s";
      wrap.appendChild(c);
    }
  }

  // ──────────────── the crowd standing in the grass ────────────────
  function artList() {
    if (typeof ART === "undefined") return [];
    var keys = Object.keys(ART);
    var rnd = mulberry32(0x120573);
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    return keys;
  }
  function artImg(name, h) {
    var dims = ART[name];
    var img = document.createElement("img");
    img.src = (typeof ART_SRC !== "undefined" && ART_SRC[name]) || ("img/art/" + name + ".webp");
    img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    img.title = name.replace(/\d+$/, "");
    var w = Math.max(8, Math.round(h * (dims[0] / dims[1])));
    img.style.height = h + "px";
    img.style.width = w + "px";
    // real intrinsic size so the row reserves its space before the art decodes
    img.width = w; img.height = h;
    return img;
  }
  function buildCrowd() {
    var wrap = $("crowd");
    if (!wrap) return;
    var rows = wrap.querySelectorAll(".crowd-row");
    var keys = artList();
    if (!rows.length || !keys.length) return;
    var vw = window.innerWidth;
    // the art is real illustration now, not a 160px token icon, so it can be
    // shown at a size where you can actually tell who is standing there
    var HEIGHTS = vw <= 760 ? [42, 58, 76] : [58, 80, 106];
    var rnd = mulberry32(0x9F17E5);
    var at = 0;
    for (var b = 0; b < rows.length && b < HEIGHTS.length; b++) {
      var row = rows[b], bh = HEIGHTS[b];
      clear(row);
      // fill the viewport rather than a fixed count, or the crowd sits as a
      // small clump in the middle of a wide screen
      var n = Math.ceil(vw / (bh * 0.78)) + 2;
      for (var i = 0; i < n; i++) {
        var h = Math.round(bh * (0.82 + rnd() * 0.4));
        var img = artImg(keys[at % keys.length], h); at++;
        // enough overlap to read as a crowd, little enough that you can still
        // tell who each one is — the art is worth seeing now
        img.style.marginInline = "-" + Math.round(h * (0.01 + rnd() * 0.06)) + "px";
        img.style.marginBottom = "-" + Math.round(rnd() * 7) + "px";
        if (rnd() < 0.5) img.style.transform = "scaleX(-1)";
        row.appendChild(img);
      }
    }
  }
  function buildFloaters() {
    var wrap = $("floaters");
    if (!wrap || typeof ART === "undefined") return;
    var keys = artList();
    if (!keys.length) return;
    clear(wrap);
    var rnd = mulberry32(0x5C1E5);
    // keep them in the gutters beside the column so they read as sky, not as
    // fragments peeking out from behind a panel
    var spots = window.innerWidth <= 760
      ? [[12, 13], [88, 9]]
      : [[6, 12], [94, 8], [4, 34], [96, 29]];
    for (var i = 0; i < spots.length; i++) {
      var img = artImg(keys[(keys.length - 1 - i + keys.length) % keys.length], 32 + Math.round(rnd() * 16));
      img.className = "floater";
      img.style.left = spots[i][0] + "%";
      img.style.top = spots[i][1] + "%";
      img.style.opacity = (0.78 + rnd() * 0.2).toFixed(2);
      img.style.animationDuration = (3.4 + rnd() * 2.6).toFixed(1) + "s";
      img.style.animationDelay = "-" + (rnd() * 3).toFixed(1) + "s";
      wrap.appendChild(img);
    }
  }

  var decorTimer = null;
  function refreshDecor() {
    clearTimeout(decorTimer);
    decorTimer = setTimeout(function () { buildClouds(); buildCrowd(); buildFloaters(); }, 220);
  }

  // ──────────────── mode rail ────────────────
  function dayStatusFor(m) {
    var s = loadDay(m, dayNumber());
    if (!s || !s.g) return null;
    return { done: !!s.done, won: !!s.won, n: s.g.length };
  }

  function renderModeRail() {
    var list = $("mode-list");
    clear(list);
    MODES.forEach(function (m) {
      var a = document.createElement("a");
      a.className = "mode-card" + (m.id === modeId ? " on" : "");
      a.href = "#/" + m.id;

      a.appendChild(logoByTicker(m.icon, "mode-ico"));

      var txt = el("div", "mode-text");
      txt.appendChild(el("span", "mode-name", m.name));
      txt.appendChild(el("span", "mode-blurb", m.blurb));
      a.appendChild(txt);

      var st = dayStatusFor(m.id);
      var flag = el("span", "mode-flag");
      if (st && st.done) {
        flag.classList.add(st.won ? "win" : "lost");
        flag.textContent = st.won ? st.n + "/" + MAX_GUESSES : "✕";
      } else {
        flag.textContent = ((st && st.n) || 0) + "/" + MAX_GUESSES;
      }
      a.appendChild(flag);

      var prog = el("div", "mode-prog");
      var fill = el("i");
      var pct = st ? Math.round(100 * Math.min(st.n, MAX_GUESSES) / MAX_GUESSES) : 0;
      fill.style.width = (st && st.done && st.won ? 100 : pct) + "%";
      prog.appendChild(fill);
      a.appendChild(prog);

      list.appendChild(a);
    });
  }

  // ──────────────── right rail: yesterday ────────────────
  function renderYesterday() {
    var box = $("yesterday-body");
    if (!box) return;
    clear(box);
    var d = dayNumber() - 1;
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
    var flag = el("span", "yday-flag");
    if (st && st.done) {
      flag.classList.add(st.won ? "win" : "lost");
      flag.textContent = st.won ? "✓" : "✕";
    } else { flag.textContent = "–"; flag.title = "not played"; }
    row.appendChild(flag);
    box.appendChild(row);
  }

  // ──────────────── more memedle pills ────────────────
  function renderPills() {
    var row = $("pill-row");
    if (!row) return;
    clear(row);
    var tones = ["pill-green", "pill-cream"];
    var t = 0;
    MODES.forEach(function (m) {
      if (m.id === modeId) return;
      var a = document.createElement("a");
      a.className = "pill " + tones[t++ % tones.length];
      a.href = "#/" + m.id;
      a.textContent = m.name;
      row.appendChild(a);
    });
    var endless = el("a", "pill pill-purple", "∞ Endless");
    endless.href = "#/" + modeId + "/unlimited";
    row.appendChild(endless);
    var arch = el("button", "pill pill-yellow", "🏆 Archive");
    arch.addEventListener("click", openArchive);
    row.appendChild(arch);
  }

  // ──────────────── panel chrome ────────────────
  function renderPanelChrome() {
    var m = MODE_BY_ID[modeId];
    var label = unlimited ? "Endless" : (isArchive() ? "Archive #" + (playDay + 1) : "Day #" + (playDay + 1));
    $("game-title").textContent = label + " · " + m.name;
    $("panel-badge").textContent = (MAX_GUESSES - guesses.length) + "/" + MAX_GUESSES;

    var meta = $("game-meta");
    if (unlimited) meta.textContent = "Endless mode · random coin, replay forever.";
    else if (isArchive()) meta.textContent = "Archive run — your streak is safe.";
    else meta.textContent = "Guess the memecoin in " + MAX_GUESSES + " tries.";
  }

  function renderStreak() {
    var pill = $("streak-pill");
    var st = loadStats(modeId);
    var d = dayNumber();
    if (st && st.streak > 0 && (st.lastWinDay === d || st.lastWinDay === d - 1)) {
      pill.textContent = "🔥 " + st.streak + " day streak";
      pill.classList.remove("hidden");
    } else {
      pill.classList.add("hidden");
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
    stage.classList.remove("burst");
    var kind = MODE_BY_ID[modeId].kind;
    var lvl = revealLevel();

    if (kind === "grid") {
      // classic has no image to show, so the panel gets the mystery coin
      stage.classList.add("burst");
      if (done) {
        var solved = logoImg(target, "");
        solved.style.cssText = "position:relative;width:108px;height:108px;border-radius:50%;border:5px solid var(--ink);object-fit:cover";
        stage.appendChild(solved);
        stage.appendChild(el("div", "stage-cap", won ? "Called it." : "It was $" + target.t + "."));
      } else {
        var coin = el("div", "mystery");
        coin.appendChild(el("span", null, "?"));
        stage.appendChild(coin);
        stage.appendChild(el("div", "stage-cap", "Who is today's coin?"));
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
        ? COINS.length + " coins are in play. The majors make good openers."
        : "Every miss hands you one more clue. Spend them wisely."));
    } else if (isGrid) {
      guesses.forEach(function (coin, gi) {
        var row = el("div", "guess-row");
        var isLast = gi === guesses.length - 1;
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
          tile.appendChild(el("span", "tile-val", cell.v));
          if (cell.d) tile.appendChild(el("span", "tile-dir", cell.d === "up" ? "▲" : "▼"));
          if (animateLast && isLast) {
            tile.classList.add("flip");
            tile.style.animationDelay = (ci * 0.18) + "s";
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
      pips.appendChild(el("span", "pip" + (i < guesses.length ? " used" : "")));
    }
    pips.setAttribute("aria-label", (MAX_GUESSES - guesses.length) + " guesses left");
  }

  // ──────────────── hint (classic daily only) ────────────────
  function renderHint() {
    var area = $("hint-area");
    clear(area);
    if (modeId !== "classic" || unlimited) return;
    if (hintAxis >= 0) {
      var v = [target.c, target.g, String(target.y), fmtCap(target.m), fmtCap(target.cm)][hintAxis];
      var chip = el("div", "hint-chip");
      chip.appendChild(el("span", null, "💡"));
      chip.appendChild(el("span", null, COL_NAMES[hintAxis] + ": " + v));
      area.appendChild(chip);
      return;
    }
    if (done || guesses.length < 1) return;
    var btn = el("button", "hint-btn", "💡 hint (1)");
    btn.addEventListener("click", function () {
      var solved = {};
      guesses.forEach(function (c) {
        grade(c, target).forEach(function (cell, i) { if (cell.s === "g") solved[i] = 1; });
      });
      var open = [0, 1, 2, 3, 4].filter(function (i) { return !solved[i]; });
      if (!open.length) open = [0, 1, 2, 3, 4];
      hintAxis = open[Math.floor(Math.random() * open.length)];
      saveDaily();
      renderHint();
    });
    area.appendChild(btn);
  }

  function renderAll(animateLast) {
    renderPanelChrome();
    renderModeRail();
    renderYesterday();
    renderPills();
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
    if (m.length) submitGuess(m[acIndex >= 0 ? acIndex : 0]);
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
    renderAll(true);
    if (done) {
      $("guess-input").disabled = true;
      $("btn-go").disabled = true;
      var delay = MODE_BY_ID[modeId].kind === "grid" ? 5 * 180 + 420 : 500;
      if (won) setTimeout(confettiBurst, Math.max(0, delay - 360));
      setTimeout(openReveal, delay);
      if (typeof LB !== "undefined" && !isArchive()) LB.report(modeId, won, guesses.length, dayNumber(), hintAxis >= 0);
    } else {
      $("guess-input").focus();
    }
  }

  // ──────────────── share ────────────────
  function shareText() {
    var m = MODE_BY_ID[modeId];
    var score = (won ? guesses.length : "X") + "/" + MAX_GUESSES;
    var head = unlimited ? "Memedle " + m.name + " · endless · " + score
      : "Memedle " + m.name + " #" + (playDay + 1) + " · " + score;
    if (hintAxis >= 0 && modeId === "classic" && !unlimited) head += " 💡";
    var SQ = squares();
    var rows = m.kind === "grid"
      ? guesses.map(function (c) { return grade(c, target).map(function (cell) { return SQ[cell.s]; }).join(""); })
      : [guesses.map(function (c) { return c.n === target.n ? SQ.g : SQ.x; }).join("")];
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
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(fallback);
    else fallback();
    var old = btn.textContent;
    btn.textContent = "copied ✓";
    setTimeout(function () { btn.textContent = old; }, 1600);
  }

  // ──────────────── modals ────────────────
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModals() {
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      m.classList.add("hidden");
    });
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }
  function countdownStr() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var s = Math.max(0, Math.floor((next - now) / 1000));
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
  }

  var countdownTimer = null;
  function openReveal() {
    var box = $("reveal-body");
    clear(box);
    box.appendChild(el("div", "reveal-verdict " + (won ? "win" : "lose"), won ? "You were early." : "Rugged."));
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
    var share = el("button", "btn btn-primary", "share");
    share.addEventListener("click", function () { copyShare(share); });
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
        box.appendChild(el("div", "countdown-label", "next daily in"));
        var cd = el("div", "countdown", countdownStr());
        box.appendChild(cd);
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(function () { cd.textContent = countdownStr(); }, 1000);
      }
    }
    openModal("modal-reveal");
  }

  function renderStats() {
    var st = loadStats(statsMode) || defaultStats;
    $("st-played").textContent = st.played;
    $("st-winpct").textContent = st.played ? Math.round(100 * st.wins / st.played) + "%" : "—";
    $("st-streak").textContent = st.streak;
    $("st-max").textContent = st.maxStreak;
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

  function openArchive() {
    var box = $("archive-body");
    clear(box);
    var today = dayNumber();
    var rows = 0;
    for (var d = today - 1; d >= 0 && rows < 60; d--) {
      MODES.forEach(function (m) {
        var st = loadDay(m.id, d);
        var btn = el("button", "arch-row");
        btn.appendChild(el("span", "arch-day", "#" + (d + 1)));
        btn.appendChild(el("span", "arch-mode", m.name));
        btn.appendChild(el("span", "arch-state", st && st.done ? (st.won ? "✓ " + st.n + "/6" : "✕") : "play →"));
        btn.addEventListener("click", function () {
          closeModals();
          location.hash = "#/" + m.id + "/d" + d;
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
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
  };
  function renderSocial() {
    var row = $("social-row");
    if (!row) return;
    clear(row);
    SOCIAL.forEach(function (s) {
      var live = !!s.url;
      var node = document.createElement(live ? "a" : "button");
      node.className = "social-btn" + (live ? "" : " soon");
      node.innerHTML = SOCIAL_ICON[s.id] || "";
      if (live) {
        node.href = s.url; node.target = "_blank"; node.rel = "noopener";
        node.title = s.label; node.setAttribute("aria-label", s.label);
      } else {
        node.type = "button";
        node.title = s.label + " — coming soon";
        node.setAttribute("aria-label", s.label + ", coming soon");
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

    if (unlimited) {
      target = randomCoin(target ? target.n : null);
    } else {
      target = dailyCoin(modeId, playDay);
      var saved = loadDay(modeId, playDay);
      if (saved && Array.isArray(saved.g)) {
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
    input.placeholder = done ? "Come back tomorrow" : "Type a memecoin…";
    renderAll(false);
    if (done) setTimeout(openReveal, 320);
    else if (!("ontouchstart" in window)) input.focus();
  }

  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
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
    $("brand-slot").innerHTML = brandSVG("a");
    buildClouds(); buildCrowd(); buildFloaters();
    renderHelpModes(); renderSocial();

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
        else if (go === "board") LB.open(dayNumber());
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
      b.addEventListener("click", closeModals);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (m) {
      m.addEventListener("click", function (ev) { if (ev.target === m) closeModals(); });
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeModals(); });

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
        var kill = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && (k.indexOf("md_") === 0 || k.indexOf("mcdl_") === 0)) kill.push(k);
        }
        kill.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
      location.reload();
    });

    window.addEventListener("hashchange", route);
    window.addEventListener("resize", refreshDecor);

    route();

    // after route() — it clears open modals on every navigation, this one included
    if (!lsGet("md_seen")) {
      lsSet("md_seen", "1");
      openModal("modal-help");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
