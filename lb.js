/* Memedle — handles, X links, and the board.
 *
 * The page is static, so a handle that is unique to one browser is not unique
 * at all. Uniqueness lives in /api/name, which claims the name with a write the
 * store rejects if the pathname already exists — two people racing for the same
 * handle cannot both be told yes. See api/_store.js.
 *
 * The X handle is typed, not verified. Nothing here pretends otherwise: the
 * board links a name to x.com/<handle> because the player said that is theirs,
 * and the copy says so once, plainly, and then drops it.
 *
 * Every request ends in a catch. The game is served from a plain static server
 * in the test harness, where /api does not exist at all, and a rejected fetch
 * that nobody catches is a console error — which is a failing test and, more to
 * the point, a leaderboard outage that takes the puzzle down with it.
 *
 * localStorage
 *   md_cid    this browser's id — the proof of ownership for a claimed name
 *   md_name   the claimed handle, lowercase
 *   md_x      the linked X handle, without the @
 *   md_w      the payout address the daily pot is sent to
 *   md_queue  runs finished before a handle existed, posted once one does
 */
var LB = (function () {
  "use strict";

  // Same-origin on Vercel, absolute from anywhere else: the GitHub Pages copy
  // has to reach the functions cross-origin, which is why they send CORS. A
  // relative "/api" there would resolve to jeardesuss.github.io/api — a
  // different site entirely.
  var API = (function () {
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "/api";
    if (h.indexOf("vercel.app") >= 0 || h === "memedle.app") return "/api";
    return "https://memedle-weld.vercel.app/api";
  })();

  var NAME_RE = /^[a-z0-9_]{3,16}$/;
  var X_RE = /^[A-Za-z0-9_]{1,15}$/;

  // The two address families a memecoin can plausibly trade on. Both are
  // pathname-safe as typed, which is what lets a wallet live in a pathname the
  // way a handle does — see api/_store.js.
  var ADDR_EVM = /^0x[0-9a-fA-F]{40}$/;
  var ADDR_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  // The payout rule, in one place, because it is stated in four.
  var POT_TOP = 10;
  var POT_LINE = "100% of the day's trading fees become the pot. It pays out at "
    + "00:00 UTC, split by rank across the top " + POT_TOP + " of each mode.";
  var POT_ORPHAN = "A ranked player with no wallet on file at 00:00 UTC drops out "
    + "of the split — their parts go pro-rata to the ranked players who have one.";

  // ── storage ─────────────────────────────────────────────────────────────
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function cid() {
    var id = lsGet("md_cid") || lsGet("mcdl_cid");
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
    lsSet("md_cid", id);
    return id;
  }
  function name() { return lsGet("md_name") || ""; }
  function xHandle() { return lsGet("md_x") || ""; }
  function wallet() { return lsGet("md_w") || ""; }
  function hasName() { return !!name(); }

  function addrOK(a) { return ADDR_EVM.test(a) || ADDR_SOL.test(a); }
  function addrChain(a) { return ADDR_EVM.test(a) ? "EVM" : ADDR_SOL.test(a) ? "Solana" : ""; }
  // Enough of both ends to check a paste against a wallet, short enough to sit
  // in a row. The full address is never drawn: it is a payment detail, not a
  // display name.
  function shortAddr(a) { return a.length > 13 ? a.slice(0, 5) + "…" + a.slice(-4) : a; }

  // ── api ─────────────────────────────────────────────────────────────────
  function api(path, opts) {
    return fetch(API + path, Object.assign({ headers: { "content-type": "application/json" } }, opts || {}))
      .then(function (r) {
        return r.json().then(function (j) {
          j._status = r.status;
          if (!r.ok && !j.taken) j._failed = true;
          return j;
        }, function () {
          return { _status: r.status, _failed: true };
        });
      }, function () {
        return { _status: 0, _failed: true };
      });
  }

  function checkName(n) {
    return api("/name?name=" + encodeURIComponent(n) + "&cid=" + encodeURIComponent(cid()));
  }
  function claimName(n) {
    return api("/name", { method: "POST", body: JSON.stringify({ name: n, cid: cid() }) });
  }
  function linkX(handle) {
    return api("/x", { method: "POST", body: JSON.stringify({ name: name(), cid: cid(), handle: handle }) });
  }
  function saveWallet(addr) {
    return api("/wallet", { method: "POST", body: JSON.stringify({ name: name(), cid: cid(), addr: addr }) });
  }

  // ── reporting a finished run ────────────────────────────────────────────
  function queue() {
    try { return JSON.parse(lsGet("md_queue") || "[]") || []; } catch (e) { return []; }
  }
  function setQueue(q) { lsSet("md_queue", JSON.stringify(q.slice(-12))); }

  function report(mode, won, guesses, day, hintUsed) {
    var run = { day: day, mode: mode, won: !!won, guesses: guesses, hint: !!hintUsed };
    // Always park the run first, even when a handle exists. A direct post that failed
    // used to take the run with it — the queue was only ever a waiting room for
    // unnamed players, so a named player on a flaky connection simply lost the game
    // they had just finished. flushQueue() removes it once the server confirms.
    var q = queue();
    for (var i = 0; i < q.length; i++) if (q[i].day === day && q[i].mode === mode) return;
    q.push(run); setQueue(q);
    if (hasName()) flushQueue();
  }
  function post(run) {
    // The handle travels with the run rather than being joined at read time —
    // that is what lets the board render from one listing with no body fetches.
    return api("/score", {
      method: "POST",
      body: JSON.stringify(Object.assign({ name: name(), cid: cid(), x: xHandle() }, run))
    }).then(function (r) {
      // This name belongs to a different browser. Clearing local storage on a
      // deployment where the name was claimed does exactly this, and without
      // this branch the player is stuck posting 403s forever.
      if (r._status === 403) { lsDel("md_name"); }
      return r;
    });
  }
  function flushQueue() {
    if (!hasName()) return Promise.resolve();
    var q = queue();
    if (!q.length) return Promise.resolve();
    // Keep the runs in storage until each one is known to have landed. Emptying the
    // queue first meant one flush while offline destroyed every run in it: the posts
    // rejected, the queue was already "[]", and the finished games existed nowhere.
    return Promise.all(q.map(function (run) {
      return post(run).then(
        function (r) { return { run: run, ok: !!(r && (r.ok || r.dup)) }; },
        function () { return { run: run, ok: false }; }
      );
    })).then(function (results) {
      setQueue(results.filter(function (r) { return !r.ok; }).map(function (r) { return r.run; }));
      return results;
    });
  }

  // ── dom helpers ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  // The same path the footer's social button uses, so there is one X mark in
  // the product. The double-struck 𝕏 character has no glyph in Baloo, Jersey
  // or Luckiest Guy and fell back to a bare lowercase x.
  var X_MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
    'd="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.remove("closing"); $(id).classList.add("hidden"); }

  function flash(msg) {
    var layer = $("flash-layer");
    if (!layer) return;
    while (layer.children.length > 2) layer.removeChild(layer.firstChild);
    var node = el("div", "flash", msg);
    layer.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1780);
  }

  // ── the handle gate ─────────────────────────────────────────────────────
  var onGateDone = null;

  function normalise(v) {
    return String(v || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "").slice(0, 16);
  }
  // Addresses arrive pasted, which means stray whitespace, a wrapped newline
  // out of a wallet app, or a chain prefix from a QR payload.
  function normaliseAddr(v) {
    return String(v || "").replace(/\s+/g, "")
      .replace(/^(solana|ethereum|eth):/i, "")
      .replace(/[^1-9A-HJ-NP-Za-km-zxX0]/g, "")
      .slice(0, 64);
  }
  function normaliseX(v) {
    var h = String(v || "").trim();
    h = h.replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "").replace(/[/?#].*$/, "");
    return h.replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  }

  function openGate(done, locked) {
    onGateDone = done || null;
    var modal = $("modal-gate");
    if (locked) modal.setAttribute("data-lock", "1");
    else modal.removeAttribute("data-lock");
    $("gate-h").textContent = hasName() ? "Your handle" : "Pick a handle";

    var body = $("gate-body");
    clear(body);
    body.appendChild(el("p", "gate-sub",
      "It sits next to your score on the daily board. Lowercase letters, numbers and underscores, 3 to 16 of them."));

    var form = el("div", "gate-form");
    var wrap = el("div", "field");
    wrap.appendChild(el("span", "field-at", "@"));
    var input = document.createElement("input");
    input.className = "field-input";
    input.id = "gate-name";
    input.maxLength = 16;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.placeholder = "your handle";
    input.value = name();
    wrap.appendChild(input);
    form.appendChild(wrap);

    var go = el("button", "btn btn-primary", "Take it");
    form.appendChild(go);
    body.appendChild(form);

    var note = el("p", "gate-note", "");
    body.appendChild(note);

    var skip = el("button", "gate-skip", locked ? "Play without one" : "Close");
    skip.addEventListener("click", function () { finishGate(false); });
    body.appendChild(skip);

    function say(cls, msg) {
      note.className = "gate-note" + (cls ? " " + cls : "");
      note.textContent = msg;
    }

    var checkT = null, checking = "";
    input.addEventListener("input", function () {
      var v = normalise(input.value);
      if (input.value !== v) input.value = v;
      clearTimeout(checkT);
      if (!v) { say("", ""); return; }
      if (!NAME_RE.test(v)) { say("bad", "Three characters minimum."); return; }
      say("", "checking…");
      checkT = setTimeout(function () {
        checking = v;
        checkName(v).then(function (r) {
          if (normalise(input.value) !== checking) return;
          if (r._failed) { say("bad", "Can't reach the board right now."); return; }
          if (r.available) {
            say("ok", r.mine ? "Already yours." : "Free.");
            if (r.mine && r.x) lsSet("md_x", r.x);
            if (r.mine && r.w) lsSet("md_w", r.w);
          } else {
            say("bad", r.reason === "reserved" ? "That one is spoken for." : "Taken. Try another.");
          }
        });
      }, 320);
    });

    go.addEventListener("click", function () {
      var v = normalise(input.value);
      if (!NAME_RE.test(v)) { say("bad", "Three to sixteen characters."); input.focus(); return; }
      go.disabled = true;
      say("", "claiming…");
      claimName(v).then(function (r) {
        go.disabled = false;
        if (r.ok) {
          lsSet("md_name", r.name);
          if (r.x) lsSet("md_x", r.x);
          if (r.w) lsSet("md_w", r.w);
          flushQueue();
          renderProfile();
          say("ok", "Yours.");
          setTimeout(function () { finishGate(true); }, 380);
          return;
        }
        if (r.taken) { say("bad", "Taken. Try another."); input.focus(); return; }
        say("bad", "Can't reach the board right now.");
      });
    });

    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); go.click(); }
    });

    show("modal-gate");
    setTimeout(function () { if (!("ontouchstart" in window)) input.focus(); }, 60);
  }

  function finishGate(claimed) {
    $("modal-gate").removeAttribute("data-lock");
    if (claimed && !xHandle()) { openXPrompt(); return; }   // keeps onGateDone for the X step
    hide("modal-gate");
    var fn = onGateDone; onGateDone = null;
    if (fn) fn();
  }

  // ── linking X ───────────────────────────────────────────────────────────
  function openXPrompt() {
    $("modal-gate").removeAttribute("data-lock");
    $("gate-h").textContent = "Link your X";
    var body = $("gate-body");
    clear(body);
    body.appendChild(el("p", "gate-sub",
      "Your name on the board becomes a link to your profile. It goes up as typed — nothing is checked."));

    var form = el("div", "gate-form");
    var wrap = el("div", "field");
    wrap.appendChild(el("span", "field-at", "@"));
    var input = document.createElement("input");
    input.className = "field-input";
    input.maxLength = 15;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.placeholder = "yourhandle";
    input.value = xHandle();
    wrap.appendChild(input);
    form.appendChild(wrap);
    var go = el("button", "btn btn-primary", "Link");
    form.appendChild(go);
    body.appendChild(form);

    var note = el("p", "gate-note", "");
    body.appendChild(note);

    var later = el("button", "gate-skip", xHandle() ? "Close" : "Later");
    later.addEventListener("click", done);
    body.appendChild(later);

    function done() {
      hide("modal-gate");
      var fn = onGateDone; onGateDone = null;
      if (fn) fn();
    }

    input.addEventListener("input", function () {
      var v = normaliseX(input.value);
      if (input.value !== v) input.value = v;
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); go.click(); }
    });

    go.addEventListener("click", function () {
      var v = normaliseX(input.value);
      if (v && !X_RE.test(v)) { note.className = "gate-note bad"; note.textContent = "That isn't an X handle."; return; }
      go.disabled = true;
      note.className = "gate-note"; note.textContent = "linking…";
      linkX(v).then(function (r) {
        go.disabled = false;
        if (r.ok) {
          lsSet("md_x", r.handle || "");
          renderProfile();
          flash(r.handle ? "Linked to @" + r.handle + "." : "Unlinked.");
          done();
          return;
        }
        note.className = "gate-note bad";
        note.textContent = r._status === 403
          ? "That handle was claimed on another browser."
          : "Can't reach the board right now.";
      });
    });

    show("modal-gate");
    setTimeout(function () { if (!("ontouchstart" in window)) input.focus(); }, 60);
  }


  // ── the payout wallet ───────────────────────────────────────────────────
  // Reuses the gate modal, like the X step: one dialog, three jobs, and no
  // third backdrop to keep in sync.
  function openWalletPrompt(done) {
    if (done) onGateDone = done;
    if (!hasName()) { openGate(function () { openWalletPrompt(onGateDone); }, false); return; }
    $("modal-gate").removeAttribute("data-lock");
    $("gate-h").textContent = "Your wallet";
    var body = $("gate-body");
    clear(body);
    body.appendChild(el("p", "gate-sub", POT_LINE));
    body.appendChild(el("p", "gate-sub",
      "Paste the address it should land in — Solana or EVM. Nothing here can check an address, so paste it, never type it."));

    var form = el("div", "gate-form stack");
    var wrap = el("div", "field");
    var input = document.createElement("input");
    input.className = "field-input addr";
    input.id = "wallet-input";
    input.maxLength = 64;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.placeholder = "paste your address";
    input.value = wallet();
    wrap.appendChild(input);
    form.appendChild(wrap);
    var go = el("button", "btn btn-primary", "Save");
    form.appendChild(go);
    body.appendChild(form);

    var note = el("p", "gate-note", "");
    body.appendChild(note);

    var later = el("button", "gate-skip", wallet() ? "Close" : "Later");
    later.addEventListener("click", finish);
    body.appendChild(later);

    function say(cls, msg) {
      note.className = "gate-note" + (cls ? " " + cls : "");
      note.textContent = msg;
    }
    function finish() {
      hide("modal-gate");
      var fn = onGateDone; onGateDone = null;
      if (fn) fn();
    }

    input.addEventListener("input", function () {
      var v = normaliseAddr(input.value);
      if (input.value !== v) input.value = v;
      if (!v) { say("", wallet() ? "Saving it empty clears the address." : ""); return; }
      say(addrOK(v) ? "ok" : "", addrOK(v) ? addrChain(v) + " address." : "");
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); go.click(); }
    });

    go.addEventListener("click", function () {
      var v = normaliseAddr(input.value);
      if (v && !addrOK(v)) { say("bad", "That is not a Solana or EVM address."); input.focus(); return; }
      go.disabled = true;
      say("", "saving…");
      saveWallet(v).then(function (r) {
        go.disabled = false;
        if (r.ok) {
          lsSet("md_w", r.addr || "");
          renderProfile();
          flash(r.addr ? "Paying to " + shortAddr(r.addr) + "." : "Wallet cleared.");
          finish();
          return;
        }
        say("bad", r._status === 403
          ? "That handle was claimed on another browser."
          : "Can't reach the board right now.");
      });
    });

    show("modal-gate");
    setTimeout(function () { if (!("ontouchstart" in window)) input.focus(); }, 60);
  }

  // ── the wallet row in settings ──────────────────────────────────────────
  function renderWallet() {
    var box = $("wallet-body");
    if (!box) return;
    clear(box);
    if (!hasName()) {
      box.appendChild(el("p", "profile-x none", "A slice is paid to a name on the board, so pick a handle first."));
      return;
    }
    var row = el("div", "profile-row"), w = wallet();
    if (w) {
      row.appendChild(el("span", "profile-name addr", shortAddr(w)));
      row.appendChild(el("span", "profile-x", addrChain(w) + " address · paid at 00:00 UTC"));
    } else {
      row.appendChild(el("span", "profile-name none", "No wallet"));
      row.appendChild(el("span", "profile-x none", "nothing to pay a slice into"));
    }
    box.appendChild(row);
    var b = el("button", "btn", w ? "Change" : "Add wallet");
    b.addEventListener("click", function () { onGateDone = null; openWalletPrompt(); });
    box.appendChild(b);
  }

  // ── the profile row in settings ─────────────────────────────────────────
  function renderProfile() {
    var box = $("profile-body");
    if (!box) return;
    clear(box);
    if (!hasName()) {
      var pick = el("button", "btn", "Pick a handle");
      pick.addEventListener("click", function () { openGate(null, false); });
      box.appendChild(pick);
      renderWallet();
      return;
    }
    var row = el("div", "profile-row");
    row.appendChild(el("span", "profile-name", "@" + name()));
    if (xHandle()) {
      var a = document.createElement("a");
      a.className = "profile-x";
      a.href = "https://x.com/" + xHandle();
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "x.com/" + xHandle();
      row.appendChild(a);
    } else {
      row.appendChild(el("span", "profile-x none", "no X linked"));
    }
    box.appendChild(row);
    var edit = el("button", "btn", xHandle() ? "Change X" : "Link X");
    edit.addEventListener("click", function () { onGateDone = null; openXPrompt(); });
    box.appendChild(edit);
    renderWallet();
  }

  // ── the board ───────────────────────────────────────────────────────────
  var boardMode = "classic";
  var MODE_NAMES = { classic: "Classic", blur: "Blur", lore: "Lore" };

  function fmtT(ms) {
    if (typeof ms !== "number" || ms < 0) return "";
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    if (h > 0) return "+" + h + "h" + (m % 60) + "m";
    if (m > 0) return "+" + m + "m";
    return "first";
  }

  function openBoard(day, mode) {
    if (mode && MODE_NAMES[mode]) boardMode = mode;
    var body = $("lb-body");
    clear(body);

    var tabs = el("div", "stat-tabs");
    ["classic", "blur", "lore"].forEach(function (m) {
      var b = el("button", "stat-tab" + (m === boardMode ? " on" : ""), MODE_NAMES[m]);
      b.addEventListener("click", function () { openBoard(day, m); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    // The stakes come before the standings: the rule that decides who gets
    // paid is the reason anyone reads this list twice.
    var pot = el("div", "lb-callout");
    var potCopy = el("div", "lb-pot");
    potCopy.appendChild(el("p", "lb-note strong", POT_LINE));
    potCopy.appendChild(el("p", "lb-note", hasName() && wallet()
      ? "Your slice pays to " + shortAddr(wallet()) + "."
      : POT_ORPHAN));
    pot.appendChild(potCopy);
    var setW = el("button", "btn", hasName() && wallet() ? "Change" : "Add wallet");
    setW.addEventListener("click", function () {
      hide("modal-lb");
      openWalletPrompt(function () { openBoard(day, boardMode); });
    });
    pot.appendChild(setW);
    body.appendChild(pot);

    if (!hasName()) {
      var call = el("div", "lb-callout");
      call.appendChild(el("p", "lb-note", "You need a handle to show up here."));
      var pick = el("button", "btn", "Pick one");
      pick.addEventListener("click", function () {
        hide("modal-lb");
        openGate(function () { openBoard(day, boardMode); }, false);
      });
      call.appendChild(pick);
      body.appendChild(call);
    }

    var list = el("div", "lb-list");
    list.appendChild(el("p", "lb-note", "loading…"));
    body.appendChild(list);
    show("modal-lb");

    api("/board?day=" + day + "&mode=" + boardMode).then(function (b) {
      clear(list);
      if (b._failed || !b.ok) {
        list.appendChild(el("p", "lb-note", "Couldn't reach the board."));
        return;
      }
      var rows = b.rows || [];
      if (!rows.length) {
        list.appendChild(el("p", "lb-note", "No " + MODE_NAMES[boardMode] + " scores yet today."));
        return;
      }
      var me = name();
      rows.forEach(function (s, i) {
        var r = el("div", "lb-row" + (s.name === me ? " me" : ""));
        r.appendChild(el("span", "lb-rank", "#" + (i + 1)));

        // A linked handle turns the name into the player's profile. This is
        // the only reason the X field exists.
        var handle = s.x || (s.name === me ? xHandle() : "");
        var who;
        if (handle) {
          who = document.createElement("a");
          who.className = "lb-player linked";
          who.href = "https://x.com/" + handle;
          who.target = "_blank"; who.rel = "noopener";
          who.title = "@" + handle + " on X";
          who.textContent = s.name;
          var mark = el("span", "lb-x");
          mark.innerHTML = X_MARK;
          who.appendChild(mark);
        } else {
          who = el("span", "lb-player", s.name);
        }
        r.appendChild(who);

        // Inside the paying ranks, a row with no wallet on file is not being
        // paid — and saying so is the whole reason the flag is on the row.
        if (i < POT_TOP && s.w === 0) {
          var tag = el("span", "lb-tag", "no wallet");
          tag.title = "no wallet on file — this slice goes to the players who have one";
          r.appendChild(tag);
        }

        var cell = el("span", "lb-res " + (s.won ? "w" : "l"), s.won ? s.guesses + "/6" : "X/6");
        if (s.hint) cell.title = "spent a hint";
        r.appendChild(cell);
        r.appendChild(el("span", "lb-time", fmtT(s.t)));
        list.appendChild(r);
      });
    });
  }

  // ── boot ────────────────────────────────────────────────────────────────
  // Runs after the game has drawn itself, so the page behind the gate is the
  // real board rather than an empty panel.
  function boot(afterGate) {
    cid();
    renderProfile();
    if (hasName()) { flushQueue(); if (afterGate) afterGate(); return; }
    openGate(afterGate, true);
  }

  return {
    boot: boot,
    report: report,
    open: openBoard,
    openHandle: function () { openGate(null, false); },
    openX: openXPrompt,
    openWallet: openWalletPrompt,
    renderProfile: renderProfile,
    name: name,
    xHandle: xHandle,
    wallet: wallet,
    hasName: hasName,
    flash: flash
  };
})();
