/* Memedle — motion.
   GSAP owns the two things CSS is bad at here: the endless idle life in the
   world layer (clouds, coins, the cast) and the staggered entrance of the UI.
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
  // The scene is built at build time by tools/build-scene.mjs and lives inside
  // one SVG, so there is nothing to construct here any more — only to animate.
  // Every target is transform-only, which on an SVG node means GSAP writes a
  // transform attribute the browser composites; nothing here triggers layout.

  function idle() {
    if (!g || reduced() || STILL) return;

    var r = rnd(0x1D1E);

    g.utils.toArray(".hills .cloud").forEach(function (el) {
      // A sway, not a traverse. The clouds are placed in the gutters and the
      // valley on purpose; one that crosses the page surfaces between cards.
      g.to(el, {
        x: 14 + r() * 22,
        duration: 20 + r() * 16,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 18
      });
      g.to(el, {
        y: 5 + r() * 7,
        duration: 5 + r() * 4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 6
      });
    });

    g.utils.toArray(".hills .coin").forEach(function (el, i) {
      // transform-box/origin matter on SVG: without them a rotate spins the
      // coin around the viewBox origin and it flies off the corner of the page
      g.set(el, { transformBox: "fill-box", transformOrigin: "50% 50%" });
      g.to(el, {
        y: -(10 + r() * 12),
        duration: 2.6 + r() * 1.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 3
      });
      g.to(el, {
        rotate: (i % 2 ? -1 : 1) * (7 + r() * 7),
        duration: 4 + r() * 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 4
      });
    });

    // the cast breathes, each on its own clock so they are never in sync
    g.utils.toArray(".hills .ch").forEach(function (el, i) {
      g.set(el, { transformBox: "fill-box", transformOrigin: "50% 100%" });
      g.to(el, {
        y: -(3 + r() * 4),
        duration: 2.2 + r() * 1.6,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: -r() * 3
      });
    });
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

  // the cast jumps when the board is solved. Each one is offset so the two
  // clusters read as a crowd reacting, not as one rigid object moving.
  MO.cheer = function () {
    if (!g || reduced() || STILL) return;
    g.utils.toArray(".hills .ch").forEach(function (el, i) {
      g.fromTo(el, { y: 0 }, {
        y: -26, duration: 0.28, ease: "power2.out",
        repeat: 3, yoyo: true, delay: i * 0.07
      });
    });
  };

  // the coins scatter upward when the board is solved
  MO.coinBurst = function () {
    if (!g || reduced() || STILL) return;
    g.utils.toArray(".hills .coin").forEach(function (el, i) {
      g.fromTo(el, { y: 0 }, {
        y: -64 - i * 12, rotate: (i % 2 ? -1 : 1) * 40,
        duration: 0.6, ease: "power2.out", yoyo: true, repeat: 1, delay: i * 0.05
      });
    });
  };

  MO.build = function () {};
  MO.start = function () { idle(); enter(); };

})(window, document);
