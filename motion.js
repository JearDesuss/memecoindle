/* Memedle — motion.
   GSAP owns the two things CSS is bad at here: the endless idle life in the
   world layer (clouds, coins, mascots) and the staggered entrance of the UI.
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

  // ═════════════ the world: clouds, coins, mascots ═════════════

  // Clouds and coins live in the two outer gutters only. Anywhere else they
  // surface between the cards as a hard-edged fragment, which reads as a
  // rendering bug rather than as sky.
  var CLOUDS = [
    // left %, top %, scale, hollow
    [-6, 12, 1.15, 0], [3, 44, 0.75, 1], [-4, 68, 0.95, 0],
    [84, 8, 1.05, 1], [90, 36, 0.8, 0], [86, 62, 1.2, 1], [95, 82, 0.7, 0]
  ];
  var COINS = [
    // ticker, left %, top %, size px
    ["DOGE",  17, 40, 66],
    ["PEPE",  8,  62, 50],
    ["BONK",  86, 44, 60],
    ["WIF",   93, 66, 46],
    ["SHIB",  80, 14, 42]
  ];

  function buildWorld() {
    var wrap = d.getElementById("clouds");
    if (wrap && !wrap.childElementCount) {
      CLOUDS.forEach(function (c) {
        var el = d.createElement("div");
        el.className = "cloud" + (c[3] ? " hollow" : "");
        // One closed path, not a pill plus two discs: overlapping outlines
        // cross each other and the result reads as a scribble, not a cloud.
        el.innerHTML = '<svg viewBox="0 0 124 58" aria-hidden="true"><path d="' +
          'M16 55 C7 55 1 48 1 41 C1 35 5 30 11 28 C10 18 18 9 29 9 ' +
          'C34 9 38 11 41 14 C45 6 53 2 61 2 C72 2 81 9 84 18 ' +
          'C86 17 88 17 90 17 C100 17 108 25 108 35 C108 36 108 37 108 38 ' +
          'C112 40 115 44 115 48 C115 52 112 55 108 55 Z"/></svg>';
        el.style.width = Math.round(124 * c[2]) + "px";
        el.style.height = Math.round(58 * c[2]) + "px";
        el.style.left = c[0] + "%";
        el.style.top = c[1] + "%";
        wrap.appendChild(el);
      });
    }

    var cw = d.getElementById("coins");
    if (cw && !cw.childElementCount) {
      COINS.forEach(function (c) {
        var el = d.createElement("div");
        el.className = "coin";
        el.style.setProperty("--sz", c[3] + "px");
        el.style.left = c[1] + "%";
        el.style.top = c[2] + "%";
        var img = d.createElement("img");
        img.src = (w.LOGOS && w.LOGOS[c[0]]) || ("img/" + c[0] + ".png");
        img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        // a coin whose art never arrives is a bare white disc, which reads as
        // a bug; drop the whole coin instead
        img.addEventListener("error", function () { el.remove(); });
        el.appendChild(img);
        cw.appendChild(el);
      });
    }
  }

  // Idle life. Purpose: the page is a world, not a form. It runs forever, so it
  // is kept slow, small and entirely off the main layout — transform only.
  function idle() {
    if (!g || reduced() || STILL) return;

    var r = rnd(0x1D1E);

    g.utils.toArray(".cloud").forEach(function (el) {
      // A sway, not a traverse. The clouds are anchored in the gutters on
      // purpose, and a cloud that crosses the page surfaces between the cards.
      g.to(el, {
        xPercent: 10 + r() * 14,
        duration: 22 + r() * 16,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 20
      });
      g.to(el, {
        y: 6 + r() * 8,
        duration: 5 + r() * 4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 6
      });
    });

    g.utils.toArray(".coin").forEach(function (el, i) {
      g.to(el, {
        y: -(12 + r() * 12),
        duration: 2.6 + r() * 1.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 3
      });
      // a slow tumble, not a spin: scaleX through zero would flip the art, so
      // the coin only ever leans
      g.to(el, {
        rotate: (i % 2 ? -1 : 1) * (7 + r() * 6),
        duration: 4 + r() * 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 4
      });
    });

    // the mascots breathe; the right one is offset so they are never in sync
    g.utils.toArray(".mascot .m-art").forEach(function (el, i) {
      g.to(el, {
        y: -6,
        duration: 2.4 + i * 0.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: i * 0.8
      });
    });

    var bubble = d.querySelector(".bubble");
    if (bubble) {
      g.to(bubble, { y: -5, rotate: 1.4, duration: 3.1, ease: "sine.inOut", repeat: -1, yoyo: true });
    }
    var flag = d.querySelector(".flag-cloth");
    if (flag) {
      g.set(flag, { transformOrigin: "0% 50%" });
      g.to(flag, { skewY: 1.6, duration: 2.2, ease: "sine.inOut", repeat: -1, yoyo: true });
    }
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

  // the mascots react to a win
  MO.cheer = function () {
    if (!g || reduced() || STILL) return;
    g.utils.toArray(".mascot .m-art").forEach(function (el, i) {
      g.fromTo(el, { y: 0 }, {
        y: -34, duration: 0.3, ease: "power2.out",
        repeat: 3, yoyo: true, delay: i * 0.12
      });
    });
  };

  // the coins scatter upward when the board is solved
  MO.coinBurst = function () {
    if (!g || reduced() || STILL) return;
    g.utils.toArray(".coin").forEach(function (el, i) {
      g.fromTo(el, { y: 0 }, {
        y: -70 - i * 14, rotate: (i % 2 ? -1 : 1) * 40,
        duration: 0.6, ease: "power2.out", yoyo: true, repeat: 1, delay: i * 0.05
      });
    });
  };

  MO.build = function () { buildWorld(); };
  MO.start = function () { buildWorld(); idle(); enter(); };

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", function () { buildWorld(); });
  } else {
    buildWorld();
  }
})(window, document);
