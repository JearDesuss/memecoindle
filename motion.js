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
  // The scene is built at build time by tools/build-scene.mjs and lives inside
  // one SVG, so there is nothing to construct here any more — only to animate.
  // Every target is transform-only, which on an SVG node means GSAP writes a
  // transform attribute the browser composites; nothing here triggers layout.

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

  MO.build = function () {};
  MO.start = function () { idle(); enter(); };

})(window, document);
