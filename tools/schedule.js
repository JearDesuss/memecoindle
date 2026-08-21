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
const SEEDS = { classic: 0x5EED1337, blur: 0x1D0FBE47, lore: 0x4B19AC03, chart: 0x7C3E5D91 };
const EPOCH = new Date(2026, 7, 21); // must match game.js

const ORDER = {};
for (const [mode, seed] of Object.entries(SEEDS)) {
  const idx = COINS.map((_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  ORDER[mode] = idx;
}
const STRIDE = 61; // must match game.js
// must match dailyCoin() in game.js: fixed mode order, walk past collisions
const ALL = Object.keys(SEEDS);
function picksFor(d) {
  const used = {}, out = {};
  for (const m of ALL) {
    const o = ORDER[m], len = o.length;
    let chosen = null;
    for (let k = 0; k < len; k++) {
      const c = COINS[o[((((d + k * STRIDE) % len) + len) % len)]];
      if (!used[c.t]) { chosen = c; break; }
    }
    if (!chosen) chosen = COINS[o[(((d % len) + len) % len)]];
    used[chosen.t] = 1;
    out[m] = chosen;
  }
  return out;
}
const pick = (mode, d) => picksFor(d)[mode];

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.find((a) => SEEDS[a]);
const modes = only ? [only] : Object.keys(SEEDS);
const days = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 7;

const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const startDay = Math.round((start - EPOCH) / 86400000);

const rows = [];
for (let d = startDay; d < startDay + days; d++) {
  const date = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate() + d);
  const localISO = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
    "-" + String(date.getDate()).padStart(2, "0");
  const row = { puzzle: d + 1, date: localISO };
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
