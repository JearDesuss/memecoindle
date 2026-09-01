// Developer tool: print the daily puzzle schedule (SPOILERS, obviously).
// Each mode has its own fixed seed, so this prints exactly what players get.
//
// Usage:
//   node tools/schedule.js              # next 7 days, all four modes
//   node tools/schedule.js 30           # next 30 days
//   node tools/schedule.js 14 classic   # one mode, with its full stat line
//   node tools/schedule.js --json 14    # machine-readable
const fs = require("fs");
const path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8"));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// must match the MODES array in game.js
const SEEDS = { classic: 0x5EED1337, blur: 0x1D0FBE47, lore: 0x4B19AC03 };
const EPOCH = Date.UTC(2026, 7, 21); // must match game.js — UTC, so the schedule matches the board

// must match recencyWeight() in game.js — newer coins sort to the front
function recencyWeight(y) {
  if (y >= 2026) return 4;
  if (y === 2025) return 2.5;
  if (y === 2024) return 1.5;
  return 1;
}
const ORDER = {};
for (const [mode, seed] of Object.entries(SEEDS)) {
  const rnd = mulberry32(seed);
  // must match orderFor() in game.js: Efraimidis–Spirakis, key = u^(1/w) desc
  const keyed = COINS.map((c, i) => ({ i, k: Math.pow(rnd(), 1 / recencyWeight(c.y)) }));
  keyed.sort((a, b) => b.k - a.k || a.i - b.i);
  ORDER[mode] = keyed.map((e) => e.i);
}
const STRIDE = 61; // must match game.js
// must match cycleOrders() in game.js: de-conflict ONCE over the whole cycle by
// swapping inside each mode's own order, so every order stays a permutation.
const ALL = Object.keys(SEEDS);
const CYCLE = (() => {
  const len = COINS.length, out = {}, atPos = [];
  for (let p = 0; p < len; p++) atPos[p] = {};
  for (const m of ALL) {
    const o = ORDER[m].slice();
    for (let i = 0; i < len; i++) {
      if (!atPos[i][COINS[o[i]].t]) continue;
      for (let k = 1; k < len; k++) {
        const j = (i + k * STRIDE) % len;
        if (j === i || atPos[i][COINS[o[j]].t] || atPos[j][COINS[o[i]].t]) continue;
        const t = o[i]; o[i] = o[j]; o[j] = t;
        break;
      }
    }
    for (let q = 0; q < len; q++) atPos[q][COINS[o[q]].t] = 1;
    out[m] = o;
  }
  return out;
})();
const pick = (mode, d) => {
  const o = CYCLE[mode], len = o.length;
  return COINS[o[(((d % len) + len) % len)]];
};

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.find((a) => SEEDS[a]);
const modes = only ? [only] : Object.keys(SEEDS);
const days = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 7;

const startDay = Math.floor((Date.now() - EPOCH) / 86400000);

const rows = [];
for (let d = startDay; d < startDay + days; d++) {
  const utcISO = new Date(EPOCH + d * 86400000).toISOString().slice(0, 10);
  const row = { puzzle: d + 1, date: utcISO };
  for (const m of modes) {
    const c = pick(m, d);
    row[m] = only
      ? { name: c.n, ticker: c.t, chain: c.c, year: c.y, peakM: c.m, nowM: c.cm, type: c.g }
      : c.t;
  }
  rows.push(row);
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("SPOILERS — daily schedule (" + COINS.length + " coins, repeats after all are used)\n");
  if (only) {
    console.log("mode: " + only + "\n");
    for (const r of rows) {
      const c = r[only];
      console.log("#" + String(r.puzzle).padEnd(5) + r.date + "  $" + String(c.ticker).padEnd(12) +
        String(c.name).padEnd(28) + c.chain + " · " + c.year + " · peak $" + c.peakM + "M · now $" + c.nowM + "M");
    }
  } else {
    console.log("#".padEnd(6) + "date".padEnd(13) + modes.map((m) => m.toUpperCase().padEnd(14)).join(""));
    for (const r of rows) {
      console.log("#" + String(r.puzzle).padEnd(5) + r.date.padEnd(13) +
        modes.map((m) => ("$" + r[m]).padEnd(14)).join(""));
    }
  }
}
