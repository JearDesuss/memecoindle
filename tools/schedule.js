// Developer tool: print the daily puzzle schedule (SPOILERS, obviously).
// The daily pick is deterministic — same seed, same shuffle, every client agrees —
// so this prints exactly what players will get.
//
// Usage:
//   node tools/schedule.js            # next 7 days
//   node tools/schedule.js 30         # next 30 days
//   node tools/schedule.js 30 --full  # include every data field
//   node tools/schedule.js --json 14  # machine-readable
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
const EPOCH = new Date(2026, 7, 21); // must match game.js
const idx = COINS.map((_, i) => i);
const rnd = mulberry32(0x5EED1337); // must match game.js
for (let i = idx.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [idx[i], idx[j]] = [idx[j], idx[i]];
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const full = args.includes("--full");
const days = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 7;

const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const startDay = Math.round((start - EPOCH) / 86400000);

const rows = [];
for (let d = startDay; d < startDay + days; d++) {
  const coin = COINS[idx[((d % idx.length) + idx.length) % idx.length]];
  const date = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate() + d);
  const localISO = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  rows.push({
    puzzle: d + 1,
    date: localISO,
    ...(full ? coin : { name: coin.n, ticker: coin.t, chain: coin.c, year: coin.y, peakM: coin.m, nowM: coin.cm, type: coin.g }),
  });
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("⚠ SPOILERS — daily schedule (" + COINS.length + " coins, repeats after all are used)\n");
  for (const r of rows) {
    console.log(
      "#" + String(r.puzzle).padEnd(5) + r.date + "  $" + String(r.ticker).padEnd(12) +
      String(r.name).padEnd(28) + (full ? "" : r.chain + " · " + r.year + " · peak $" + r.peakM + "M · now $" + r.nowM + "M")
    );
  }
}
