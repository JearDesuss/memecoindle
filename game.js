/* Memedle — game engine. Four modes, one daily coin each, no dependencies. */
(function () {
  "use strict";

  // ──────────────── constants ────────────────
  var EPOCH = new Date(2026, 7, 21);   // puzzle #1 = Aug 21 2026 (local time)
  var MAX_GUESSES = 6;
  var SITE_URL = "jeardesuss.github.io/memecoindle";

  // Socials. Leave a URL empty and its button renders as a dead "soon" chip
  // instead of a link, so nothing ever points at a 404.
  var SOCIAL = [
    { id: "x", label: "Follow on X", url: "" }
  ];

  // Classic keeps the original seed so its daily sequence never shifts.
  var MODES = [
    { id: "classic", name: "Classic", ico: "🔍", blurb: "Get clues on every try",   seed: 0x5EED1337, kind: "grid",  sq: "🟩" },
    { id: "blur",    name: "Blur",    ico: "🔮", blurb: "With a blurry logo",       seed: 0x1D0FBE47, kind: "stage", sq: "🟩" },
    { id: "lore",    name: "Lore",    ico: "📜", blurb: "With one cursed sentence", seed: 0x4B19AC03, kind: "stage", sq: "🟩" }
  ];
  var MODE_BY_ID = {};
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

  var COL_NAMES = ["Chain", "Type", "Year", "Peak", "Now"];
  var BLUR_STEPS = [26, 18, 12, 7.5, 4, 2];      // px, indexed by wrong-guess count
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
  function hashStr(s) {
    var h = 0x811C9DC5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
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
  // a fixed mode order and walk forward past collisions — classic is first, so
  // its historical sequence is never touched.
  // 151 is prime, so any stride walks the whole permutation; a big one keeps a
  // displaced pick far from that mode's neighbouring days.
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

  // clue ladder used by the non-classic modes
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
    // split keeps the captured group, so pieces alternate plain / match
    return coin.l.split(re);
  }

  // ──────────────── state ────────────────
  var view = "home";        // 'home' | 'game'
  var modeId = "classic";
  var unlimited = false;
  var target = null;
  var guesses = [];
  var done = false, won = false;
  var hintAxis = -1;
  var statsMode = "classic"; // which mode the stats modal is showing

  function dayKey() { return "md_day_" + modeId + "_" + dayNumber(); }
  function statsKey(m) { return "md_stats_v1_" + m; }
  var defaultStats = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: -2, lastPlayedDay: -2, dist: [0, 0, 0, 0, 0, 0] };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function saveDaily() {
    if (unlimited) return;
    lsSet(dayKey(), JSON.stringify({
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
    if (unlimited) return;
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
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ──────────────── logos ────────────────
  function badgeURI(ticker) {
    var h = 0;
    for (var i = 0; i < ticker.length; i++) h = ((h << 5) - h + ticker.charCodeAt(i)) | 0;
    var hue = ((h % 360) + 360) % 360;
    var ch = ticker.charAt(0).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0%" stop-color="hsl(' + hue + ',75%,64%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + hue + ',66%,40%)"/></radialGradient></defs>' +
      '<rect width="64" height="64" rx="14" fill="url(#g)"/>' +
      '<text x="32" y="44" text-anchor="middle" font-family="Consolas,monospace" font-weight="bold" font-size="32" fill="hsl(' + hue + ',85%,14%)">' + ch + "</text></svg>";
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

  // ──────────────── decor: brand, clouds, roster ────────────────
  function brandSVG(sfx) {
    var gid = "bg-" + sfx;
    var t = function (attrs) {
      return '<text x="262" y="100" text-anchor="middle" ' + attrs + ">Memedle</text>";
    };
    return '<svg viewBox="0 0 524 138" role="img" aria-label="Memedle">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#FFF6B8"/><stop offset="44%" stop-color="#FFD23D"/>' +
      '<stop offset="53%" stop-color="#F0A016"/><stop offset="100%" stop-color="#FFE484"/>' +
      "</linearGradient></defs>" +
      '<g font-family="Luckiest Guy, Arial Black, Impact, sans-serif" font-size="94">' +
      t('transform="translate(0,8)" fill="#13224C" opacity=".34" stroke="#13224C" stroke-width="27" stroke-linejoin="round" paint-order="stroke"') +
      t('fill="#13224C" stroke="#13224C" stroke-width="27" stroke-linejoin="round" paint-order="stroke"') +
      t('fill="#4C8DF6" stroke="#4C8DF6" stroke-width="16" stroke-linejoin="round" paint-order="stroke"') +
      t('fill="url(#' + gid + ')" stroke="#FFFDF0" stroke-width="3" stroke-linejoin="round" paint-order="stroke"') +
      "</g></svg>";
  }

  // Soft pixel clouds. Flat white box-shadow blocks read as render glitches, so
  // each cloud is an SVG of stacked blocks with a shaded underside, like the
  // reference's painted clouds.
  var CLOUD_SHAPES = [
    [[2,0],[3,0],[1,1],[2,1],[3,1],[4,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2]],
    [[3,0],[4,0],[5,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
     [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]],
    [[2,0],[3,0],[6,0],[7,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],
     [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2]],
    [[1,0],[2,0],[0,1],[1,1],[2,1],[3,1]]
  ];
  function cloudSVG(shape) {
    var maxX = 0, maxY = 0, i;
    for (i = 0; i < shape.length; i++) {
      if (shape[i][0] > maxX) maxX = shape[i][0];
      if (shape[i][1] > maxY) maxY = shape[i][1];
    }
    // lowest block in each column gets the shaded underside
    var lowest = {};
    for (i = 0; i < shape.length; i++) {
      var x = shape[i][0], y = shape[i][1];
      if (lowest[x] === undefined || y > lowest[x]) lowest[x] = y;
    }
    var rects = "";
    for (i = 0; i < shape.length; i++) {
      var cx = shape[i][0], cy = shape[i][1];
      var fill = cy === lowest[cx] ? "%23D9EBF7" : "%23FFFFFF";
      rects += "%3Crect x='" + cx + "' y='" + cy + "' width='1' height='1' fill='" + fill + "'/%3E";
    }
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " +
      (maxX + 1) + " " + (maxY + 1) + "'%3E" + rects + "%3C/svg%3E";
  }
  function buildClouds() {
    var wrap = $("clouds");
    if (!wrap) return;
    clear(wrap);
    var rnd = mulberry32(0xC10D5);
    var n = window.innerWidth <= 480 ? 5 : 8;
    for (var i = 0; i < n; i++) {
      var shape = CLOUD_SHAPES[Math.floor(rnd() * CLOUD_SHAPES.length)];
      var w = 0;
      for (var j = 0; j < shape.length; j++) if (shape[j][0] > w) w = shape[j][0];
      var px = 9 + Math.round(rnd() * 9);
      var c = el("div", "cloud");
      c.style.backgroundImage = "url(\"" + cloudSVG(shape) + "\")";
      c.style.width = (w + 1) * px + "px";
      c.style.height = 3 * px + "px";
      c.style.top = (5 + rnd() * 40).toFixed(1) + "%";
      c.style.opacity = (0.68 + rnd() * 0.26).toFixed(2);
      c.style.animationDuration = (80 + rnd() * 120).toFixed(0) + "s";
      c.style.animationDelay = "-" + (rnd() * 140).toFixed(0) + "s";
      wrap.appendChild(c);
    }
  }

  // The crowd standing in the grass — background-removed character art, three
  // depth bands deep, the way pokedle.net's lineup reads. See tools/cut-logos.js.
  function cutList() {
    if (typeof CUTOUTS === "undefined") return [];
    var keys = Object.keys(CUTOUTS);
    var rnd = mulberry32(0x120573);
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    return keys;
  }

  function cutImg(ticker, h) {
    var dims = CUTOUTS[ticker];                  // [w, h] of the trimmed art
    var img = document.createElement("img");
    // the single-file build swaps the folder for inlined data URIs
    img.src = (typeof CUT_SRC !== "undefined" && CUT_SRC[ticker]) || ("img/cut/" + ticker + ".png");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.title = ticker;
    img.height = h;
    img.style.height = h + "px";
    img.style.width = Math.max(8, Math.round(h * (dims[0] / dims[1]))) + "px";
    return img;
  }

  function buildCrowd() {
    var wrap = $("crowd");
    if (!wrap) return;
    var rows = wrap.querySelectorAll(".crowd-row");
    if (!rows.length) return;
    var keys = cutList();
    if (!keys.length) return;

    var vw = window.innerWidth;
    var narrow = vw <= 480;
    // back band is smallest and most numerous, front band biggest and sparsest
    var HEIGHTS = narrow ? [36, 48, 62] : [44, 58, 76];

    var rnd = mulberry32(0x9F17E5);
    var at = 0;
    for (var b = 0; b < rows.length && b < HEIGHTS.length; b++) {
      var row = rows[b], bh = HEIGHTS[b];
      clear(row);
      // fill the viewport rather than a fixed count, or the crowd sits as a
      // small clump in the middle of a wide screen
      var advance = bh * 0.78;
      var n = Math.ceil(vw / advance) + 2;
      for (var i = 0; i < n; i++) {
        var ticker = keys[at % keys.length]; at++;
        var h = Math.round(bh * (0.82 + rnd() * 0.4));
        var img = cutImg(ticker, h);
        // overlap so they read as a crowd rather than a queue
        img.style.marginInline = "-" + Math.round(h * (0.04 + rnd() * 0.11)) + "px";
        // let a few sink deeper into the grass
        img.style.marginBottom = "-" + Math.round(rnd() * 7) + "px";
        if (rnd() < 0.5) img.style.transform = "scaleX(-1)";
        row.appendChild(img);
      }
    }
  }

  // the crowd and floaters are sized off the viewport, so refill after a resize
  var decorTimer = null;
  function refreshDecor() {
    clearTimeout(decorTimer);
    decorTimer = setTimeout(function () { buildClouds(); buildCrowd(); buildFloaters(); }, 220);
  }

  // a couple of them drifting in the sky, like the reference's Mew and Moltres
  function buildFloaters() {
    var wrap = $("floaters");
    if (!wrap || typeof CUTOUTS === "undefined") return;
    var keys = cutList();
    if (!keys.length) return;
    clear(wrap);
    var rnd = mulberry32(0x5C1E5);
    // desktop: keep them in the gutters beside the 620px column so they read as
    // sky, not as debris peeking out from behind a card
    var spots = window.innerWidth <= 480
      ? [[13, 15], [87, 10]]
      : [[7, 13], [93, 9], [5, 33], [95, 28]];
    for (var i = 0; i < spots.length; i++) {
      var img = cutImg(keys[(keys.length - 1 - i + keys.length) % keys.length], 30 + Math.round(rnd() * 18));
      img.className = "floater";
      img.style.left = spots[i][0] + "%";
      img.style.top = spots[i][1] + "%";
      img.style.opacity = (0.72 + rnd() * 0.22).toFixed(2);
      img.style.animationDuration = (3.4 + rnd() * 2.6).toFixed(1) + "s";
      img.style.animationDelay = "-" + (rnd() * 3).toFixed(1) + "s";
      wrap.appendChild(img);
    }
  }

  // ──────────────── home ────────────────
  function dayStatusFor(m) {
    var s = loadDay(m, dayNumber());
    if (!s || !s.g) return null;
    return { done: !!s.done, won: !!s.won, n: s.g.length, started: s.g.length > 0 };
  }

  function renderHome() {
    var list = $("mode-list");
    clear(list);
    MODES.forEach(function (m) {
      var a = document.createElement("a");
      a.className = "mode-card";
      a.href = "#/" + m.id;

      var name = el("span", "mode-name", m.name);
      a.appendChild(name);

      var pill = el("div", "mode-pill");
      var ico = el("span", "mode-pill-ico", m.ico);
      pill.appendChild(ico);
      pill.appendChild(el("span", "mode-pill-text", m.blurb));
      a.appendChild(pill);

      var st = dayStatusFor(m.id);
      if (st && st.done) {
        var flag = el("span", "mode-flag" + (st.won ? "" : " lost"), st.won ? "✓ " + st.n + "/" + MAX_GUESSES : "✕ missed");
        a.appendChild(flag);
      } else if (st && st.started) {
        a.appendChild(el("span", "mode-flag open", st.n + "/" + MAX_GUESSES));
      }
      list.appendChild(a);
    });
  }

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
        node.href = s.url;
        node.target = "_blank";
        node.rel = "noopener";
        node.title = s.label;
        node.setAttribute("aria-label", s.label);
      } else {
        node.type = "button";
        node.title = s.label + " — coming soon";
        node.setAttribute("aria-label", s.label + ", coming soon");
        node.appendChild(el("span", "soon-tag", "soon"));
        node.addEventListener("click", function () {
          node.classList.add("nudge");
          setTimeout(function () { node.classList.remove("nudge"); }, 420);
        });
      }
      row.appendChild(node);
    });
  }

  function renderHelpModes() {
    var box = $("help-modes");
    if (!box) return;
    clear(box);
    MODES.forEach(function (m) {
      var row = el("div", "help-mode");
      row.appendChild(el("span", "help-mode-ico", m.ico));
      row.appendChild(el("span", "help-mode-name", m.name));
      row.appendChild(el("span", "help-mode-desc", m.blurb));
      box.appendChild(row);
    });
  }

  // ──────────────── game chrome ────────────────
  function renderTabs() {
    var nav = $("mode-tabs");
    clear(nav);
    MODES.forEach(function (m) {
      var a = document.createElement("a");
      a.className = "tab" + (m.id === modeId ? " on" : "");
      a.href = "#/" + m.id;
      a.textContent = m.name;
      var st = dayStatusFor(m.id);
      if (st && st.done && st.won) a.classList.add("done");
      nav.appendChild(a);
    });
  }

  function renderMeta() {
    var m = MODE_BY_ID[modeId];
    $("game-title").textContent = m.name;
    var meta = $("game-meta");
    if (unlimited) {
      meta.textContent = "Unlimited · random coin, endless replays";
    } else {
      var txt = "Daily #" + (dayNumber() + 1);
      var d = dayNumber();
      if (d >= 1) txt += " · yesterday $" + dailyCoin(modeId, d - 1).t;
      meta.textContent = txt;
    }
    var tog = $("btn-mode-toggle");
    tog.querySelector(".ico").textContent = unlimited ? "1D" : "∞";
    tog.title = unlimited ? "Back to the daily" : "Unlimited mode";
  }

  function renderStreak() {
    var pill = $("streak-pill");
    var st = loadStats(modeId);
    var d = dayNumber();
    if (!unlimited && st && st.streak > 0 && (st.lastWinDay === d || st.lastWinDay === d - 1)) {
      pill.textContent = "🔥 " + st.streak;
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
    var kind = MODE_BY_ID[modeId].kind;
    if (kind !== "stage") { stage.classList.add("hidden"); clear(stage); return; }
    stage.classList.remove("hidden");
    clear(stage);
    var lvl = revealLevel();

    if (modeId === "blur") {
      var wrap = el("div", "blur-wrap");
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
      wrap.appendChild(frame);
      wrap.appendChild(el("div", "blur-note", done ? "there it is." : "sharpens with every miss"));
      stage.appendChild(wrap);

    } else if (modeId === "lore") {
      var card = el("div", "lore-card");
      card.appendChild(el("span", "lore-mark", "“"));
      var q = el("p", "lore-quote");
      var parts = loreParts(target);
      parts.forEach(function (piece, i) {
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
    if (MODE_BY_ID[modeId].kind !== "stage") { strip.classList.add("hidden"); clear(strip); return; }
    var n = Math.min(wrongCount(), CLUES.length);
    if (done) n = 0;
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
    var board = $("board");
    var head = $("col-head");
    var isGrid = MODE_BY_ID[modeId].kind === "grid";
    clear(board);
    clear(head);

    if (isGrid && guesses.length > 0) {
      head.classList.remove("hidden");
      head.appendChild(el("div", "coin-label"));
      COL_NAMES.forEach(function (c) { head.appendChild(el("div", "col-name", c)); });
    } else {
      head.classList.add("hidden");
    }

    if (guesses.length === 0 && !done) {
      var note = el("div", "empty-note");
      note.appendChild(el("div", "empty-big", COINS.length + " coins are in play"));
      note.appendChild(el("div", "empty-sub", isGrid
        ? "From $DOGE in 2013 to this summer's trenches. The majors make good openers."
        : "Every miss hands you one more clue. Spend them wisely."));
      board.appendChild(note);
    } else if (isGrid) {
      guesses.forEach(function (coin, gi) {
        var cells = grade(coin, target);
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
        cells.forEach(function (cell, ci) {
          var tile = el("div", "tile s-" + cell.s);
          tile.appendChild(el("span", "tile-val", cell.v));
          if (cell.d) tile.appendChild(el("span", "tile-dir", cell.d === "up" ? "▲" : "▼"));
          if (animateLast && isLast) {
            tile.classList.add("flip");
            tile.style.animationDelay = (ci * 0.2) + "s";
          }
          row.appendChild(tile);
        });
        board.appendChild(row);
      });
    } else {
      guesses.forEach(function (coin) {
        if (coin.n === target.n) return;   // the winning guess shows up in the reveal
        var row = el("div", "miss-row");
        row.appendChild(logoImg(coin, "coin-logo"));
        row.appendChild(el("span", "miss-name", coin.n + " · $" + coin.t));
        row.appendChild(el("span", "miss-x", "✕"));
        board.appendChild(row);
      });
    }

    var pips = $("pips");
    clear(pips);
    if (!done) {
      pips.setAttribute("aria-label", (MAX_GUESSES - guesses.length) + " guesses left");
      for (var i = 0; i < MAX_GUESSES; i++) {
        pips.appendChild(el("span", "pip" + (i < guesses.length ? " used" : "")));
      }
    }
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
    var btn = el("button", "hint-btn", "hint (1)");
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
    renderMeta();
    renderTabs();
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
      var colors = ["#45CE7D", "#45CE7D", "#FFCE3A", "#FF8FD2", "#4C8DF6", "#F4635A"];
      var parts = [];
      for (var i = 0; i < 96; i++) {
        parts.push({
          x: Math.random() * cv.width, y: -30 - Math.random() * cv.height * 0.4,
          w: 5 + Math.random() * 5, h: 5 + Math.random() * 10,
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
          ctx.strokeStyle = "rgba(36,31,51,.55)"; ctx.lineWidth = 1;
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
      var delay = MODE_BY_ID[modeId].kind === "grid" ? 5 * 200 + 460 : 520;
      if (won) setTimeout(confettiBurst, Math.max(0, delay - 380));
      setTimeout(openReveal, delay);
      if (typeof LB !== "undefined") LB.report(modeId, won, guesses.length, dayNumber(), hintAxis >= 0);
    } else {
      $("guess-input").focus();
    }
  }

  // ──────────────── share ────────────────
  function shareText() {
    var m = MODE_BY_ID[modeId];
    var score = (won ? guesses.length : "X") + "/" + MAX_GUESSES;
    var head = unlimited
      ? "Memedle " + m.name + " · unlimited · " + score
      : "Memedle " + m.name + " #" + (dayNumber() + 1) + " · " + score;
    if (hintAxis >= 0 && modeId === "classic" && !unlimited) head += " 💡";
    var SQ = squares();
    var rows;
    if (m.kind === "grid") {
      rows = guesses.map(function (c) {
        return grade(c, target).map(function (cell) { return SQ[cell.s]; }).join("");
      });
    } else {
      rows = [guesses.map(function (c) { return c.n === target.n ? SQ.g : SQ.x; }).join("")];
    }
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
    var verdict = won
      ? ["You were early.", "Got it in " + guesses.length + "/" + MAX_GUESSES + "."]
      : ["Rugged.", "The coin walks free."];
    box.appendChild(el("div", "reveal-verdict " + (won ? "win" : "lose"), verdict[0]));
    box.appendChild(el("div", "reveal-sub", verdict[1]));

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
    var share = el("button", "btn btn-primary", "share result");
    share.addEventListener("click", function () { copyShare(share); });
    row.appendChild(share);

    if (unlimited) {
      var again = el("button", "btn", "next coin ↻");
      again.addEventListener("click", function () { closeModals(); startGame(); });
      row.appendChild(again);
      box.appendChild(row);
    } else {
      var nextMode = null;
      for (var i = 0; i < MODES.length; i++) {
        var s = dayStatusFor(MODES[i].id);
        if (MODES[i].id !== modeId && !(s && s.done)) { nextMode = MODES[i]; break; }
      }
      if (nextMode) {
        var nm = el("button", "btn", "play " + nextMode.name.toLowerCase() + " →");
        nm.addEventListener("click", function () { closeModals(); location.hash = "#/" + nextMode.id; });
        row.appendChild(nm);
      } else {
        var inf = el("button", "btn", "unlimited ∞");
        inf.addEventListener("click", function () { closeModals(); location.hash = "#/" + modeId + "/unlimited"; });
        row.appendChild(inf);
      }
      box.appendChild(row);
      box.appendChild(el("div", "countdown-label", "next daily in"));
      var cd = el("div", "countdown", countdownStr());
      box.appendChild(cd);
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(function () { cd.textContent = countdownStr(); }, 1000);
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
  function openStats() {
    statsMode = view === "game" ? modeId : "classic";
    renderStats();
    openModal("modal-stats");
  }

  // ──────────────── start / route ────────────────
  function startGame() {
    var input = $("guess-input");
    guesses = []; done = false; won = false; hintAxis = -1;
    lastBlur = null;

    if (unlimited) {
      target = randomCoin(target ? target.n : null);
    } else {
      target = dailyCoin(modeId, dayNumber());
      var saved = loadDay(modeId, dayNumber());
      if (saved && Array.isArray(saved.g)) {
        var byName = {};
        COINS.forEach(function (c) { byName[c.n] = c; });
        saved.g.forEach(function (n) { if (byName[n]) guesses.push(byName[n]); });
        done = !!saved.done; won = !!saved.won;
        if (typeof saved.h === "number") hintAxis = saved.h;
      }
    }

    input.disabled = done;
    input.value = "";
    input.placeholder = done ? "come back tomorrow" : "name or ticker…";
    renderAll(false);
    if (done) setTimeout(openReveal, 320);
    else if (!("ontouchstart" in window)) input.focus();
  }

  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    return { mode: parts[0] || null, unlimited: parts[1] === "unlimited" };
  }

  function route() {
    var p = parseHash();
    closeModals();
    if (p.mode && MODE_BY_ID[p.mode]) {
      view = "game";
      modeId = p.mode;
      unlimited = p.unlimited;
      $("view-home").classList.add("hidden");
      $("view-game").classList.remove("hidden");
      startGame();
    } else {
      view = "home";
      $("view-game").classList.add("hidden");
      $("view-home").classList.remove("hidden");
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  // ──────────────── wire up ────────────────
  function bindToggle(box, cls, key) {
    if (!box) return;
    box.checked = lsGet(key) === "1";
    document.body.classList.toggle(cls, box.checked);
    box.addEventListener("change", function () {
      document.body.classList.toggle(cls, box.checked);
      lsSet(key, box.checked ? "1" : "0");
      // keep the twin checkbox in the other modal in sync
      Array.prototype.forEach.call(document.querySelectorAll('input[data-sync="' + key + '"]'), function (o) {
        if (o !== box) o.checked = box.checked;
      });
      if (view === "game") renderAll(false);
    });
    box.setAttribute("data-sync", key);
  }

  function init() {
    migrate();

    $("brand-slot").innerHTML = brandSVG("a");
    $("brand-slot-sm").innerHTML = brandSVG("b");
    buildClouds();
    buildCrowd();
    buildFloaters();
    renderSocial();
    renderHelpModes();

    var input = $("guess-input");
    input.addEventListener("input", function () { acIndex = -1; renderAC(); });
    input.addEventListener("keydown", function (ev) {
      var m = acMatches(input.value);
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (m.length) { acIndex = (acIndex + 1) % m.length; renderAC(); } }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (m.length) { acIndex = (acIndex - 1 + m.length) % m.length; renderAC(); } }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        if (m.length) submitGuess(m[acIndex >= 0 ? acIndex : 0]);
      } else if (ev.key === "Escape") { input.value = ""; renderAC(); }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { $("ac-list").classList.add("hidden"); }, 150);
    });
    input.addEventListener("focus", renderAC);

    $("btn-help").addEventListener("click", function () { openModal("modal-help"); });
    $("btn-settings").addEventListener("click", function () { openModal("modal-settings"); });
    $("btn-settings-2").addEventListener("click", function () { openModal("modal-settings"); });
    $("btn-stats").addEventListener("click", openStats);
    $("btn-lb").addEventListener("click", function () { LB.open(dayNumber()); });
    $("btn-mode-toggle").addEventListener("click", function () {
      location.hash = "#/" + modeId + (unlimited ? "" : "/unlimited");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
      b.addEventListener("click", function () {
        var go = b.getAttribute("data-go");
        if (go === "unlimited") location.hash = "#/classic/unlimited";
        else if (go === "stats") openStats();
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
        setTimeout(function () {
          b.removeAttribute("data-armed");
          b.textContent = "Erase my record";
        }, 4000);
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
