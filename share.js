/* Memedle — the result card and the road to X.
 *
 * X's web intent cannot carry an image. Nothing in the URL will attach one,
 * so every route below ends with the picture reaching the composer some other
 * way, and the intent only ever carries the words:
 *
 *   phone      navigator.share({files}) hands the PNG straight to the X app
 *   desktop    the PNG goes to the clipboard, the intent opens, one paste
 *   anything   the PNG downloads and the intent opens
 *
 * The card is drawn at 1200x675 because that is the aspect X shows uncropped
 * in a timeline, and every value in it is the same token the page uses — this
 * is the same sticker, printed larger. It never shows the coin: a result card
 * that spoils the puzzle is a result card nobody can post before their friends
 * have played.
 */
var SHARE = (function () {
  "use strict";

  var W = 1200, H = 675;

  // The page's tokens, at print scale. Same ramp, same status hues, same die.
  var C = {
    ink: "#2B2C4B",
    ink2: "#55567A",
    paper: "#FDF6DA",
    card: "#F6E9B8",
    rind: "#E5D08A",
    ash: "#B9BAD2",
    gold: "#FFD93B",
    sky1: "#4FB3EC",
    sky2: "#97DAF8",
    bull: "#3FA84F",
    warn: "#F5B321",
    bear: "#E04B42"
  };
  var CB = { bull: "#3B7FD4", bear: "#E07B18" };

  var CUT = 7;        // the die, at card scale
  var CUT_IN = 5;
  var LIFT = 9;
  var R_CARD = 22;
  var R_TILE = 10;

  function statusColor(s, cb) {
    if (s === "g") return cb ? CB.bull : C.bull;
    if (s === "y") return C.warn;
    return cb ? CB.bear : C.bear;
  }

  // ── canvas helpers ──────────────────────────────────────────────────────
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // A sticker: flat fill, one hard Ink offset, zero blur. The page's whole
  // elevation system is this function.
  function sticker(ctx, x, y, w, h, r, fill, cut, lift) {
    cut = cut == null ? CUT : cut;
    lift = lift == null ? LIFT : lift;
    if (lift) {
      ctx.fillStyle = C.ink;
      rr(ctx, x, y + lift, w, h, r);
      ctx.fill();
    }
    ctx.fillStyle = fill;
    rr(ctx, x, y, w, h, r);
    ctx.fill();
    if (cut) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = cut;
      rr(ctx, x + cut / 2, y + cut / 2, w - cut, h - cut, Math.max(1, r - cut / 2));
      ctx.stroke();
    }
  }
  function text(ctx, str, x, y, font, fill, align) {
    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  }

  // The wordmark is extruded by stacking the same glyphs down one pixel at a
  // time, exactly like the SVG on the page — not by faking a shadow.
  function wordmark(ctx, x, y, size) {
    var depth = Math.round(size * 0.16);
    ctx.font = "400 " + size + 'px "Luckiest Guy", "Arial Black", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    var i;
    for (i = depth; i >= 1; i--) {
      ctx.fillStyle = C.ink;
      ctx.fillText("MEMEDLE", x, y + i);
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(4, size * 0.11);
    ctx.strokeText("MEMEDLE", x, y);
    ctx.fillStyle = C.gold;
    ctx.fillText("MEMEDLE", x, y);
    return ctx.measureText("MEMEDLE").width;
  }

  // ── fonts ───────────────────────────────────────────────────────────────
  // ctx.fillText silently falls back to a system face if the webfont has not
  // loaded, and the card is then quietly wrong. Wait for the exact faces.
  var fontsReady = null;
  function loadFonts() {
    if (fontsReady) return fontsReady;
    fontsReady = (function () {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      var want = [
        '400 96px "Luckiest Guy"',
        '400 40px "Jersey 15"',
        '800 44px "Baloo 2"',
        '600 26px "Baloo 2"'
      ];
      return Promise.all(want.map(function (f) {
        return document.fonts.load(f, "MEMEDLE 0123456789").catch(function () {});
      })).then(function () { return document.fonts.ready; }).catch(function () {});
    })();
    return fontsReady;
  }

  // ── the card ────────────────────────────────────────────────────────────
  // state: {mode, modeName, day, unlimited, won, guesses, max, rows, hint,
  //         streak, url, cb}
  // rows is an array of arrays of "g" | "y" | "x" — the same grid the text
  // share prints, so the picture and the words can never disagree.
  function draw(ctx, st) {
    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, C.sky1);
    sky.addColorStop(1, C.sky2);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // the one panel
    var px = 46, py = 40, pw = W - px * 2, ph = H - py * 2 - LIFT;
    sticker(ctx, px, py, pw, ph, R_CARD, C.paper);

    var padX = px + 52;
    var top = py + 46;

    // ── header: wordmark, then the puzzle it belongs to ──
    var markW = wordmark(ctx, padX, top + 62, 66);

    var label = st.unlimited
      ? st.modeName + " · Endless"
      : st.modeName + " #" + st.day;
    text(ctx, label.toUpperCase(), padX + markW + 26, top + 56,
      '400 34px "Jersey 15", ui-monospace, monospace', C.ink2);

    // ── the score, as a badge on the right ──
    var score = (st.won ? st.guesses : "X") + "/" + st.max;
    ctx.font = '800 52px "Baloo 2", "Segoe UI", system-ui, sans-serif';
    var sw = Math.max(132, ctx.measureText(score).width + 56);
    var sx = px + pw - 52 - sw;
    sticker(ctx, sx, top + 2, sw, 76, R_TILE, st.won ? C.gold : C.card, CUT_IN, 5);
    text(ctx, score, sx + sw / 2, top + 58,
      '800 52px "Baloo 2", "Segoe UI", system-ui, sans-serif', C.ink, "center");

    if (st.blurb) {
      text(ctx, st.blurb, padX, top + 106,
        '600 27px "Baloo 2", "Segoe UI", system-ui, sans-serif', C.ink2);
    }

    // ── the grid ──
    var gridTop = top + (st.blurb ? 132 : 118);
    var gridBottom = py + ph - 98;
    drawGrid(ctx, st, padX, gridTop, px + pw - 52 - padX, gridBottom - gridTop);

    // ── footer: url left, streak right ──
    var footY = py + ph - 44;
    ctx.strokeStyle = C.rind;
    ctx.lineWidth = CUT_IN;
    ctx.beginPath();
    ctx.moveTo(padX, footY - 40);
    ctx.lineTo(px + pw - 52, footY - 40);
    ctx.stroke();

    text(ctx, st.url, padX, footY,
      '800 30px "Baloo 2", "Segoe UI", system-ui, sans-serif', C.ink);

    var right = [];
    if (st.hint) right.push("hint spent");
    if (st.streak > 1) right.push(st.streak + " day streak");
    if (right.length) {
      text(ctx, right.join("  ·  "), px + pw - 52, footY,
        '600 27px "Baloo 2", "Segoe UI", system-ui, sans-serif', C.ink2, "right");
    }
  }

  function drawGrid(ctx, st, x, y, w, h) {
    var rows = st.rows || [];
    if (!rows.length) return;
    var cols = rows[0].length;
    var maxRows = st.slots || st.max;

    // The tiles are wider than they are tall, like the tiles on the real
    // board. The whole six-row box is always laid out, so a 2/6 and a 6/6
    // card are the same design with different fills rather than two designs.
    var single = maxRows === 1;
    var gap = single ? 16 : 12;
    var byH = (h - gap * (maxRows - 1)) / maxRows;
    var byW = (w - gap * (cols - 1)) / cols;
    var th = Math.max(22, Math.min(byH, single ? 88 : 62));
    var tw = Math.max(22, Math.min(byW, th * (single ? 1.5 : 1.7)));
    var gw = cols * tw + (cols - 1) * gap;
    var gx = x + (w - gw) / 2;
    var gh = maxRows * th + (maxRows - 1) * gap;
    var gy = y + (h - gh) / 2;

    for (var r = 0; r < maxRows; r++) {
      for (var c = 0; c < cols; c++) {
        var tx = gx + c * (tw + gap), ty = gy + r * (th + gap);
        var cell = rows[r] && rows[r][c];
        if (cell) sticker(ctx, tx, ty, tw, th, R_TILE, statusColor(cell, st.cb), CUT_IN, 4);
        else {
          // an unspent guess: inert, no lift, so it reads as empty not pale
          ctx.fillStyle = C.card;
          rr(ctx, tx, ty, tw, th, R_TILE);
          ctx.fill();
          ctx.strokeStyle = C.rind;
          ctx.lineWidth = CUT_IN;
          rr(ctx, tx + CUT_IN / 2, ty + CUT_IN / 2, tw - CUT_IN, th - CUT_IN, R_TILE - 1);
          ctx.stroke();
        }
      }
    }
  }

  // ── render to a blob ────────────────────────────────────────────────────
  var cache = { key: "", blob: null, file: null, name: "", promise: null };

  function keyOf(st) {
    return [st.mode, st.day, st.unlimited, st.won, st.guesses, st.hint, st.streak, st.cb, st.slots, st.blurb,
      (st.rows || []).map(function (r) { return r.join(","); }).join("|")].join("~");
  }

  function render(st) {
    var key = keyOf(st);
    if (cache.key === key && cache.promise) return cache.promise;
    cache.key = key;
    cache.blob = null;
    cache.file = null;
    cache.name = fileName(st);
    cache.promise = loadFonts().then(function () {
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var ctx = cv.getContext("2d");
      draw(ctx, st);
      return new Promise(function (resolve) {
        if (cv.toBlob) cv.toBlob(function (b) { resolve(b); }, "image/png");
        else resolve(dataURItoBlob(cv.toDataURL("image/png")));
      });
    }).then(function (blob) {
      cache.blob = blob;
      // Built here, never inside the click handler: on iOS every
      // NotAllowedError from navigator.share traces back to an await in front
      // of it, because the awaited work spends the transient activation.
      try { cache.file = blob && window.File ? new File([blob], cache.name, { type: "image/png" }) : null; }
      catch (e) { cache.file = null; }
      return blob;
    });
    return cache.promise;
  }

  // Called when the reveal opens so the PNG is sitting ready by the time the
  // button is pressed. That matters: Safari will only accept a clipboard write
  // and a popup inside the gesture that started them, and awaiting a canvas
  // first loses the gesture.
  function prime(st) {
    try { render(st).catch(function () {}); } catch (e) {}
  }

  function dataURItoBlob(uri) {
    var parts = uri.split(","), bin = atob(parts[1]), n = bin.length, u8 = new Uint8Array(n);
    while (n--) u8[n] = bin.charCodeAt(n);
    return new Blob([u8], { type: "image/png" });
  }

  function fileName(st) {
    return "memedle-" + st.mode + (st.unlimited ? "" : "-" + st.day) + ".png";
  }

  // ── routes to X ─────────────────────────────────────────────────────────
  function intentURL(caption) {
    return "https://x.com/intent/post?text=" + encodeURIComponent(caption);
  }
  // Resolves to what actually happened, so the caller can say the right thing:
  // "shared" | "clipboard" | "download" | "cancelled" | "text".
  //
  // Routing is by input modality first and capability second. Desktop Chrome,
  // Edge and Safari all report canShare({files}) === true, but the OS share
  // sheet on a desktop rarely lists X — firing it there is a dead end that
  // looks like a bug. So the sheet is for coarse pointers only.
  function postToX(st, caption) {
    var url = intentURL(caption);
    var file = cache.file;
    var coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

    if (file && coarse && navigator.share && navigator.canShare) {
      var payload = { files: [file], text: caption };
      var can = false;
      try { can = navigator.canShare(payload); } catch (e) { can = false; }
      if (can) {
        return navigator.share(payload).then(
          function () { return "shared"; },
          function (err) {
            // A cancel is an answer, not a failure. Do not escalate to a
            // second attempt the player did not ask for.
            if (err && err.name === "AbortError") return "cancelled";
            return deskRoute(url, coarse);   // throws only if the popup was blocked
          }
        );
      }
    }
    try { return Promise.resolve(deskRoute(url, coarse)); }
    catch (e) { return Promise.reject(e); }
  }

  function canCopyImage() {
    if (!window.isSecureContext) return false;
    if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) return false;
    if (typeof ClipboardItem.supports === "function") {
      try { return ClipboardItem.supports("image/png"); } catch (e) { return true; }
    }
    return true;
  }

  // Everything below has to stay synchronous inside the click: the clipboard
  // write is fired first and NOT awaited, then the composer opens in the same
  // tick so the popup blocker still sees a gesture behind it.
  function deskRoute(url, coarse) {
    var blob = cache.blob;
    var result = "text";

    if (blob && !coarse && canCopyImage()) {
      try {
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
          .catch(function () { download(blob, cache.name); });
        result = "clipboard";
      } catch (e) {
        download(blob, cache.name);
        result = "download";
      }
    } else if (blob) {
      download(blob, cache.name);
      result = "download";
    }

    var win = null;
    try { win = window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { win = null; }
    if (!win) throw new Error("popup blocked");
    return result;
  }

  function download(blob, name) {
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 4000);
    } catch (e) {}
  }

  function saveCard(st) {
    return render(st).then(function (b) { download(b, fileName(st)); return "download"; });
  }

  function ready() { return !!cache.blob; }

  return {
    render: render,
    prime: prime,
    postToX: postToX,
    saveCard: saveCard,
    intentURL: intentURL,
    ready: ready,
    _draw: draw
  };
})();
