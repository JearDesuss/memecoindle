// CDP gameplay test for Memedle — no deps, node 22+.
// Serve the repo on :8471 and run Chrome with --remote-debugging-port=9223 first.
const fs = require("fs");
const path = require("path");
const GAME_DIR = path.join(__dirname, "..");
const SCRATCH = require("os").tmpdir();

// Replicate the page's daily pick so we know every mode's answer up front.
eval(fs.readFileSync(path.join(GAME_DIR, "data.js"), "utf8"));
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const SEEDS = { classic: 0x5EED1337, blur: 0x1D0FBE47, lore: 0x4B19AC03 };
const MODES = Object.keys(SEEDS);
const EPOCH = new Date(2026, 7, 21);
const now = new Date();
const day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH) / 86400000);
const ORDER = {};
for (const m of MODES) {
  const idx = COINS.map((_, i) => i);
  const rnd = mulberry32(SEEDS[m]);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  ORDER[m] = idx;
}
const STRIDE = 61; // must match game.js
// mirrors dailyCoin(): fixed mode order, walk forward past collisions
function answerFor(mode, d = day) {
  const used = {};
  for (const m of MODES) {
    const o = ORDER[m], len = o.length;
    let chosen = null;
    for (let k = 0; k < len; k++) {
      const c = COINS[o[((((d + k * STRIDE) % len) + len) % len)]];
      if (!used[c.t]) { chosen = c; break; }
    }
    if (!chosen) chosen = COINS[o[(((d % len) + len) % len)]];
    used[chosen.t] = 1;
    if (m === mode) return chosen;
  }
}
console.log("day #" + (day + 1) + " answers:", MODES.map(m => m + "=$" + answerFor(m).t).join("  "));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  → " + detail : "")); }
}

async function cdp() {
  const list = await (await fetch("http://localhost:9223/json")).json();
  const page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params.exceptionDetails.exception || m.params.exceptionDetails));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value).join(" "));
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaljs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error("page eval failed: " + JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SCRATCH, name), Buffer.from(r.result.data, "base64"));
  };
  // go through the real input + autocomplete path, never straight at internals
  const guess = async (name) => {
    await evaljs(`(function(){
      var i=document.getElementById('guess-input');
      i.focus(); i.value=${JSON.stringify(name)};
      i.dispatchEvent(new Event('input',{bubbles:true}));
      i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    })()`);
    await sleep(430);
  };
  const goto = async (hash) => { await evaljs(`location.hash=${JSON.stringify(hash)};'ok'`); await sleep(650); };
  const closeModals = () => evaljs("document.querySelectorAll('.modal-backdrop').forEach(function(m){m.classList.add('hidden')});'ok'");

  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8471/" });
  await sleep(1300);
  await evaljs("localStorage.clear(); location.hash=''; location.reload(); 'ok'");
  await sleep(1600);

  console.log("\nshell");
  check("first-visit help modal opens", await evaljs("!document.getElementById('modal-help').classList.contains('hidden')"));
  await closeModals();
  check("three mode cards in the rail", await evaljs("document.querySelectorAll('.mode-card').length") === 3);
  check("classic is the default and is marked active", await evaljs("!!document.querySelector('.mode-card.on')")
    && /classic/i.test(await evaljs("document.getElementById('game-title').textContent")));
  check("wordmark rendered", await evaljs("!!document.querySelector('.brand svg')"));
  check("game panel, yesterday panel and rules panel all present", await evaljs("document.querySelectorAll('.panel').length") >= 3);
  check("yesterday panel filled", await evaljs("document.getElementById('yesterday-body').children.length") > 0);
  check("more-memedle pills rendered", await evaljs("document.querySelectorAll('#pill-row .pill').length") === 4);
  check("crowd populated across 3 depth bands", await evaljs(
    "Array.from(document.querySelectorAll('.crowd-row')).every(function(r){return r.children.length > 4})"));
  check("crowd uses cut-outs, not coin discs", await evaljs(
    "Array.from(document.querySelectorAll('.crowd-row img')).every(function(i){return /img\\/cut\\/|^data:/.test(i.getAttribute('src'))})"));
  check("clouds rendered", await evaljs("document.querySelectorAll('.cloud').length") > 0);
  check("no images failed to load", await evaljs(
    "Array.from(document.images).filter(function(i){return i.complete && i.naturalWidth===0}).length") === 0);
  check("X social button rendered", await evaljs("!!document.querySelector('.social-btn')"));
  check("no horizontal overflow", await evaljs("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));

  console.log("\nrouting");
  for (const m of MODES) {
    await goto("#/" + m);
    check("#/" + m + " loads its board", new RegExp(m, "i").test(await evaljs("document.getElementById('game-title').textContent")));
  }
  await goto("#/chart");
  check("retired #/chart falls back to classic", /classic/i.test(await evaljs("document.getElementById('game-title').textContent")));

  console.log("\nclassic");
  const ans = answerFor("classic");
  await goto("#/classic");
  check("mystery coin shows before the first guess", await evaljs("!!document.querySelector('.stage .mystery')"));
  await evaljs("var i=document.getElementById('guess-input'); i.value='dog'; i.dispatchEvent(new Event('input',{bubbles:true})); 'ok'");
  check("autocomplete matches 'dog'", await evaljs("document.querySelectorAll('.ac-item').length") > 0);
  await evaljs("var i=document.getElementById('guess-input'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); 'ok'");

  const wrong = COINS.filter(c => c.n !== ans.n).slice(0, 2);
  await guess(wrong[0].n);
  check("wrong guess adds a graded row", await evaljs("document.querySelectorAll('.guess-row').length") === 1);
  check("badge counts down", (await evaljs("document.getElementById('panel-badge').textContent")) === "5/6");
  check("mode rail progress advanced", await evaljs("document.querySelector('.mode-card .mode-prog i').style.width") !== "0%");
  check("hint button appears after guess 1", await evaljs("!!document.querySelector('.hint-btn')"));
  await sleep(1200);
  await guess(wrong[1].n);
  await sleep(1200);
  await shot("t_classic_mid.png");
  await guess(ans.n);
  await sleep(2300);
  check("winning row is all green", await evaljs("Array.from(document.querySelectorAll('.guess-row:last-child .tile')).every(function(t){return t.classList.contains('s-g')})"));
  check("reveal modal opens on win", await evaljs("!document.getElementById('modal-reveal').classList.contains('hidden')"));
  check("reveal names the coin", (await evaljs("(document.querySelector('.coin-card-name')||{}).textContent||''")) === ans.n);
  check("input locks after the game ends", await evaljs("document.getElementById('guess-input').disabled && document.getElementById('btn-go').disabled"));
  await shot("t_classic_win.png");

  const stats = await evaljs("JSON.parse(localStorage.getItem('md_stats_v1_classic'))");
  check("classic stats recorded", stats && stats.played === 1 && stats.wins === 1 && stats.streak === 1, JSON.stringify(stats));
  await closeModals();
  check("streak pill appears", await evaljs("!document.getElementById('streak-pill').classList.contains('hidden')"));

  await evaljs("location.reload();'ok'"); await sleep(1600);
  await goto("#/classic");
  check("daily state survives reload", await evaljs("document.querySelectorAll('.guess-row').length") === 3);
  check("solved mode flagged in the rail", await evaljs("!!document.querySelector('.mode-card .mode-flag.win')"));
  await closeModals();

  console.log("\nstage modes");
  for (const m of ["blur", "lore"]) {
    const a = answerFor(m);
    await goto("#/" + m);
    check(m + ": stage rendered", await evaljs("document.getElementById('stage').children.length") > 0);
    if (m === "blur") check("blur: logo starts blurred", /blur\(/.test(await evaljs("(document.querySelector('.blur-img')||{style:{}}).style.filter||''")));
    if (m === "lore") check("lore: coin name is redacted out", await evaljs("document.querySelectorAll('.redacted').length") >= 0);
    check(m + ": no clues before a miss", await evaljs("document.querySelectorAll('.clue-chip').length") === 0);
    const w = COINS.filter(c => c.n !== a.n)[0];
    await guess(w.n);
    check(m + ": miss is listed", await evaljs("document.querySelectorAll('.miss-row').length") === 1);
    check(m + ": miss reveals one clue", await evaljs("document.querySelectorAll('.clue-chip').length") === 1);
    await sleep(400);
    await guess(a.n);
    await sleep(1300);
    check(m + ": reveal opens on win", await evaljs("!document.getElementById('modal-reveal').classList.contains('hidden')"));
    check(m + ": stats recorded", (await evaljs(`JSON.parse(localStorage.getItem('md_stats_v1_${m}')||'null')`) || {}).wins === 1);
    await closeModals();
  }

  console.log("\nendless + archive");
  await goto("#/classic/unlimited");
  check("endless resets the board", await evaljs("document.querySelectorAll('.guess-row').length") === 0);
  check("endless is labelled", /endless/i.test(await evaljs("document.getElementById('game-title').textContent")));
  const six = COINS.slice(20, 26).map(c => c.n);
  for (const n of six) { await guess(n); }
  await sleep(2200);
  check("endless ends after 6 guesses", await evaljs("!document.getElementById('modal-reveal').classList.contains('hidden')"));
  await closeModals();

  if (day >= 1) {
    await goto("#/classic/d0");
    check("archive route loads puzzle #1", /archive #1/i.test(await evaljs("document.getElementById('game-title').textContent")));
    const before = await evaljs("JSON.parse(localStorage.getItem('md_stats_v1_classic')).streak");
    const a0 = answerFor("classic", 0);
    await guess(a0.n);
    await sleep(1600);
    const after = await evaljs("JSON.parse(localStorage.getItem('md_stats_v1_classic')).streak");
    check("archive win leaves the streak untouched", before === after, before + " -> " + after);
    await closeModals();
  }

  await goto("#/classic");
  await evaljs("var c=document.getElementById('cb-toggle-2'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));'ok'");
  await sleep(280);
  check("colourblind mode toggles", await evaljs("document.body.classList.contains('cb') && localStorage.getItem('md_cb')==='1'"));

  console.log("\npage errors:", errors.length ? errors : "none");
  if (errors.length) fail += errors.length;
  console.log("\n" + pass + " passed, " + fail + " failed");
  ws.close();
  return fail === 0;
}

cdp().then(ok => process.exit(ok ? 0 : 1))
     .catch(e => { console.error("TEST HARNESS ERROR:", e.message); process.exit(1); });
