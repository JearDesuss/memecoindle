/* Memedle — motion.
   GSAP owns the two things CSS is bad at here: the endless idle life in the
   world layer and the staggered entrance of the UI.
   Everything a finger touches stays on a CSS transition, because a transition
   retargets from wherever it is and a timeline restarts from zero.

   The curve and duration vocabulary lives in DESIGN.md and in :root. Nothing
   in this file invents a number that is not there. */
(function (w, d) {
  "use strict";

  var g = w.gsap;
  var MO = {};
  w.MO = MO;

  function reduced() {
    return w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  MO.reduced = reduced;

  // ?still freezes every timeline at its resting state, so a screenshot is
  // reproducible. Without it there is no way to shoot the same frame twice.
  var STILL = /(^|[?&])still(=|&|$)/.test(w.location.search);
  MO.still = STILL;

  function rnd(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ═════════════ the world ═════════════
  // The world is the supplied plate — one flat image — so its clouds, coins and
  // characters are pixels, not nodes, and none of them can move independently
  // any more. That is the trade for using the real artwork instead of a redraw.
  // The plate as a whole gets one very slow drift so the page is not dead
  // behind the cards; it is deliberately small enough to read as light, not as
  // a parallax effect, which this system does not have.
  function idle() {
    if (!g || reduced() || STILL) return;
    var world = d.querySelector(".world");
    if (!world) return;
    // Transform, NOT backgroundPositionY. The plate is anchored to the bottom
    // with a computed background-position of "50% 100%"; writing a pixel value
    // into background-position-y replaces that anchor and slams the artwork to
    // the top of the screen.
    // The drift is downward only. Moving it up would expose a strip of --paper
    // along the bottom edge, and the plate's bottom edge is solid green, so the
    // seam is obvious. Down just pushes a few pixels of green off-screen.
    g.to(world, { y: 3, duration: 9, ease: "sine.inOut", repeat: -1, yoyo: true });
  }

  // ═════════════ the entrance ═════════════
  // Nothing in this interface arrives all at once; the stagger is 60ms.
  function enter() {
    if (!g) return;
    var groups = [
      ".brand",
      ".tagline",
      ".mode-card",
      ".col-mid .panel",
      ".col-right .panel",
      ".dock-item",
      ".more"
    ];
    var nodes = [];
    groups.forEach(function (sel) {
      d.querySelectorAll(sel).forEach(function (n) { nodes.push(n); });
    });
    if (!nodes.length) return;

    if (reduced() || STILL) { g.set(nodes, { clearProps: "all" }); return; }

    g.set(nodes, { opacity: 0, y: 14, scale: 0.96 });
    g.to(nodes, {
      opacity: 1, y: 0, scale: 1,
      duration: 0.42,
      ease: "power3.out",        // the --ease-out curve, by name
      stagger: 0.06,
      clearProps: "transform"    // hand the element back so :hover owns it again
    });

    // the world lifts in behind the cards, once, slower than they do
    var world = d.querySelector(".world");
    if (world) {
      g.fromTo(world, { yPercent: 12, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.9, ease: "power3.out" });
    }
  }

  // ═════════════ cues the game calls into ═════════════

  // the wordmark takes the hit when a guess lands
  MO.brandKick = function () {
    if (!g || reduced() || STILL) return;
    var u = d.querySelector(".brand .b-under");
    if (!u) return;
    g.fromTo(u, { x: 3, y: 5 }, { x: 7, y: 10, duration: 0.11, ease: "power2.out", yoyo: true, repeat: 1 });
  };

  // a card drawing attention to itself without moving the layout
  MO.pop = function (el) {
    if (!g || !el || reduced() || STILL) return;
    g.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.34, ease: "back.out(2.2)", clearProps: "transform" });
  };

  // A win used to make the cast jump and the coins scatter. Both were nodes in
  // the drawn scene; in the plate they are pixels. The whole world swells from
  // its bottom edge instead — growing from the anchor means no edge of the
  // viewport ever shows through, which a translate in any direction would risk.
  MO.cheer = function () {
    if (!g || reduced() || STILL) return;
    var world = d.querySelector(".world");
    if (!world) return;
    g.set(world, { transformOrigin: "50% 100%" });
    g.fromTo(world, { scale: 1 }, {
      scale: 1.015, duration: 0.3, ease: "power2.out", repeat: 3, yoyo: true
    });
  };

  // Kept as a no-op rather than deleted: game.js calls it on a win, and a
  // missing function there throws mid-celebration.
  MO.coinBurst = function () {};

  function sfx(name, arg) { if (w.SFX) w.SFX.play(name, arg); }
  var fine = w.matchMedia && w.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function live() { return g && !reduced() && !STILL; }

  // ═════════════ toy: the wordmark ═════════════
  // Split once into one box per letter, so a letter can jump and leave its Lime
  // shadow copy behind — the gap between them is what reads as a sticker
  // peeling off the sheet. The shadow is left whole on purpose.
  var letters = [];
  function splitBrand() {
    var face = d.querySelector(".brand .b-face");
    if (!face || face.dataset.split) return;
    var text = face.textContent;
    face.textContent = "";
    face.dataset.split = "1";
    face.setAttribute("aria-label", text);
    letters = text.split("").map(function (ch) {
      var sp = d.createElement("span");
      sp.className = "b-l";
      sp.setAttribute("aria-hidden", "true");
      sp.textContent = ch;
      face.appendChild(sp);
      return sp;
    });
  }

  function hop(el, height, delay) {
    g.fromTo(el, { y: 0 }, {
      y: -height, duration: 0.18, delay: delay || 0, ease: "power2.out",
      yoyo: true, repeat: 1,
      onComplete: function () { g.set(el, { clearProps: "transform" }); }
    });
  }

  // the whole word goes up as a wave, each letter a beat after the last
  MO.brandWave = function (withSound) {
    if (!live() || !letters.length) return;
    letters.forEach(function (l, i) {
      hop(l, 16, i * 0.05);
      if (withSound) setTimeout(function () { sfx("pop", i); }, i * 50);
    });
  };

  function wireBrand() {
    var brand = d.querySelector(".brand");
    if (!brand || brand.dataset.wired) return;
    brand.dataset.wired = "1";
    // Hover is silent. It fires every time the pointer crosses the logo, and a
    // sound on that would be noise within a minute. The click is the play.
    if (fine) {
      letters.forEach(function (l) {
        l.addEventListener("mouseenter", function () { if (live()) hop(l, 9, 0); });
      });
    }
    brand.addEventListener("click", function () { MO.brandWave(true); });
  }

  // ═════════════ toy: the mystery coin ═════════════
  // The "?" is the coin of the day, so spinning it is on-theme. It is rebuilt on
  // every render, so the click is delegated from the stage rather than bound.
  var spinning = false;
  function wireCoin() {
    var stage = d.getElementById("stage");
    if (!stage || stage.dataset.wired) return;
    stage.dataset.wired = "1";
    stage.addEventListener("click", function (ev) {
      var coin = ev.target.closest && ev.target.closest(".mystery");
      if (!coin || spinning) return;
      sfx("spin");
      if (!live()) return;
      spinning = true;
      // Two full turns with an overshoot: fast off the finger, settling slow.
      g.fromTo(coin, { rotateY: 0 }, {
        rotateY: 720, duration: 0.9, ease: "back.out(1.4)",
        onComplete: function () { g.set(coin, { clearProps: "transform" }); spinning = false; }
      });
    });
  }

  // ═════════════ cues the game calls into ═════════════

  // Switching mode swaps the whole centre panel. Without this it teleports; the
  // blur bridges the two states so the eye reads one thing changing, not one
  // thing vanishing and another appearing.
  MO.modeIn = function () {
    if (!live()) return;
    var body = d.querySelector(".game-panel .panel-body");
    if (body) {
      g.fromTo(body, { opacity: 0, y: 8, filter: "blur(4px)" }, {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 0.28, ease: "power3.out",
        clearProps: "transform,filter,opacity"
      });
    }
    var ico = d.querySelector(".mode-card.on .mode-ico");
    if (ico) {
      g.fromTo(ico, { scale: 0.8, rotate: -12 }, {
        scale: 1, rotate: 0, duration: 0.4, ease: "back.out(2.6)", clearProps: "transform"
      });
    }
  };

  // The winning row, after every tile has landed: each hops in turn.
  MO.winWave = function (row) {
    if (!row) return;
    var tiles = row.querySelectorAll(".tile");
    if (!live()) return;
    tiles.forEach(function (t, i) {
      t.classList.remove("flip");
      t.style.setProperty("--d", (i * 0.07) + "s");
      void t.offsetWidth;
      t.classList.add("hop");
    });
    MO.brandWave(false);
  };

  // A loss shakes the board once and then leaves it alone. Anything longer
  // turns a small disappointment into a lecture.
  MO.lose = function (board) {
    if (!board || !live()) return;
    board.classList.remove("lost");
    void board.offsetWidth;
    board.classList.add("lost");
    setTimeout(function () { board.classList.remove("lost"); }, 460);
  };

  // A stat counting up from zero. Under reduced motion or ?still the final
  // value is written straight away — the number is the information, the count
  // is only the flourish.
  MO.countUp = function (el, to, format) {
    if (!el) return;
    var fmt = format || function (v) { return String(Math.round(v)); };
    if (!live() || !isFinite(to) || to <= 0) { el.textContent = fmt(to); return; }
    var box = { v: 0 }, lastTick = -1;
    g.to(box, {
      v: to, duration: Math.min(0.9, 0.35 + to * 0.02), ease: "power2.out",
      onUpdate: function () {
        el.textContent = fmt(box.v);
        var step = Math.floor(box.v);
        // one quiet tick per whole number, capped so a big count does not buzz
        if (step !== lastTick && step % Math.max(1, Math.ceil(to / 12)) === 0) {
          lastTick = step;
          sfx("tick", step);
        }
      },
      onComplete: function () { el.textContent = fmt(to); }
    });
  };

  // The reveal's coin turns over into view, like being flipped onto a table.
  MO.coinIn = function (el) {
    if (!el || !live()) return;
    g.fromTo(el, { rotateY: -110, scale: 0.7, opacity: 0 }, {
      rotateY: 0, scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)",
      clearProps: "transform,opacity"
    });
  };

  // stagger the facts in the reveal card, after the coin has landed
  MO.stagger = function (nodes, delay) {
    if (!nodes || !nodes.length || !live()) return;
    g.fromTo(nodes, { opacity: 0, y: 8 }, {
      opacity: 1, y: 0, duration: 0.28, ease: "power3.out", stagger: 0.05,
      delay: delay || 0, clearProps: "transform,opacity"
    });
  };

  MO.build = function () {};
  MO.start = function () {
    splitBrand();
    wireBrand();
    wireCoin();
    idle();
    enter();
    // the letters wave in once the wordmark has landed, as part of arriving
    if (live()) setTimeout(function () { MO.brandWave(false); }, 520);
  };

})(window, document);
