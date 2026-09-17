/* Memedle — sound.
   Every cue is synthesised from oscillators, so there are no audio files to
   ship and nothing to preload. Sound is OFF until the player opts in (stored
   in md_sfx) and the AudioContext is not even constructed until the first real
   gesture, because browsers will not start one without it and a page that
   makes noise on load is a page people close. */
(function (w) {
  "use strict";

  var KEY = "md_sfx";
  var ctx = null;
  var master = null;
  var on = false;

  try { on = localStorage.getItem(KEY) === "1"; } catch (e) { on = false; }

  function ready() {
    if (!on) return false;
    if (!ctx) {
      var AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;      // the whole kit sits well under the page
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return false; }
    }
    // a context created before a gesture starts suspended; resume is a no-op otherwise
    if (ctx.state === "suspended") ctx.resume().catch(function () {});
    return true;
  }

  // one voice: a shaped oscillator with its own short envelope
  function tone(opt) {
    if (!ready()) return;
    var t0 = ctx.currentTime + (opt.at || 0);
    var dur = opt.dur || 0.12;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opt.type || "sine";
    osc.frequency.setValueAtTime(opt.f, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + dur);
    // a tiny attack rather than a hard start, or every cue clicks
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opt.v || 0.5, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // filtered white noise: the paper/confetti texture
  function noise(opt) {
    if (!ready()) return;
    var t0 = ctx.currentTime + (opt.at || 0);
    var dur = opt.dur || 0.15;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = opt.f || 1800; bp.Q.value = opt.q || 1.1;
    var g = ctx.createGain(); g.gain.value = opt.v || 0.3;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0);
  }

  var CUES = {
    // a key going down: short, low, felt more than heard
    tap:    function () { tone({ f: 420, to: 300, dur: 0.06, type: "triangle", v: 0.32 }); },
    // the submit key
    submit: function () { tone({ f: 540, to: 760, dur: 0.1, type: "triangle", v: 0.4 }); },
    // switching modes: a small two-note lift
    swap:   function () { tone({ f: 500, dur: 0.07, type: "sine", v: 0.3 });
                          tone({ f: 740, dur: 0.09, type: "sine", v: 0.28, at: 0.06 }); },
    // one clue tile turning over — pitched by column so a row reads as a run
    flip:   function (i) { tone({ f: 380 + (i || 0) * 58, dur: 0.07, type: "square", v: 0.12 });
                           noise({ f: 2600, dur: 0.05, v: 0.1 }); },
    // an exact match landing
    hit:    function () { tone({ f: 660, to: 990, dur: 0.14, type: "sine", v: 0.4 }); },
    // a wrong guess: down, not harsh
    miss:   function () { tone({ f: 260, to: 170, dur: 0.18, type: "sawtooth", v: 0.18 }); },
    // the interface refusing input
    deny:   function () { tone({ f: 200, to: 150, dur: 0.1, type: "square", v: 0.16 }); },
    // a coin landing in the tray
    coin:   function () { tone({ f: 980, dur: 0.06, type: "square", v: 0.22 });
                          tone({ f: 1480, dur: 0.1, type: "square", v: 0.18, at: 0.05 }); },
    // a panel opening
    open:   function () { tone({ f: 380, to: 620, dur: 0.12, type: "sine", v: 0.26 }); },
    close:  function () { tone({ f: 560, to: 340, dur: 0.1, type: "sine", v: 0.22 }); },
    // the win: a rising arpeggio plus the confetti hiss
    win:    function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ f: f, dur: 0.22, type: "triangle", v: 0.36, at: i * 0.085 });
      });
      noise({ f: 3200, q: 0.8, dur: 0.5, v: 0.14, at: 0.1 });
    },
    // the loss: a short fall, and then it stops talking
    lose:   function () {
      [392, 330, 262].forEach(function (f, i) {
        tone({ f: f, dur: 0.22, type: "triangle", v: 0.3, at: i * 0.11 });
      });
    }
  };

  var SFX = {
    play: function (name, arg) {
      var cue = CUES[name];
      if (cue && on) { try { cue(arg); } catch (e) {} }
    },
    get enabled() { return on; },
    set: function (v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      if (on) { ready(); SFX.play("coin"); }
    },
    toggle: function () { SFX.set(!on); return on; }
  };

  w.SFX = SFX;
})(window);
