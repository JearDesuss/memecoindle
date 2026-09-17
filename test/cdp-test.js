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
const EPOCH = Date.UTC(2026, 7, 21);
const day = Math.floor((Date.now() - EPOCH) / 86400000);
// must match recencyWeight() in game.js
function recencyWeight(y){ if(y>=2026) return 4; if(y===2025) return 2.5; if(y===2024) return 1.5; return 1; }
const ORDER = {};
for (const m of MODES) {
  const rnd = mulberry32(SEEDS[m]);
  // must match orderFor() in game.js: Efraimidis–Spirakis, key = u^(1/w) desc
  const keyed = COINS.map((c, i) => ({ i, k: Math.pow(rnd(), 1 / recencyWeight(c.y)) }));
  keyed.sort((a, b) => b.k - a.k || a.i - b.i);
  ORDER[m] = keyed.map((e) => e.i);
}
const STRIDE = 61; // must match game.js
// mirrors cycleOrders(): de-conflict once per cycle by swapping inside each mode's
// own order, so every mode's order stays a permutation of the whole roster.
const CYCLE = (() => {
  const len = COINS.length, out = {}, atPos = [];
  for (let p = 0; p < len; p++) atPos[p] = {};
  for (const m of MODES) {
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
function answerFor(mode, d = day) {
  const o = CYCLE[mode], len = o.length;
  return COINS[o[(((d % len) + len) % len)]];
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
  // The API does not exist on the static test server, so this exercises the
  // exact path a player hits when the board is unreachable.
  check("first visit opens the handle gate", await evaljs("!document.getElementById('modal-gate').classList.contains('hidden')"));
  check("the gate refuses a backdrop click", await evaljs(`(function(){
    var g=document.getElementById('modal-gate');
    g.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    return !g.classList.contains('hidden');
  })()`));
  await evaljs("document.querySelector('#gate-body .gate-skip').click(); 'ok'");
  await sleep(420);
  check("declining the gate hands over to the rules", await evaljs(
    "document.getElementById('modal-gate').classList.contains('hidden') && " +
    "!document.getElementById('modal-help').classList.contains('hidden')"));
  await closeModals();
  check("three mode cards in the rail", await evaljs("document.querySelectorAll('.mode-card').length") === 3);
  check("classic is the default and is marked active", await evaljs("!!document.querySelector('.mode-card.on')")
    && /classic/i.test(await evaljs("document.getElementById('game-title').textContent")));
  check("wordmark rendered", await evaljs("!!document.querySelector('.brand .b-face')"));
  check("game panel, yesterday panel and rules panel all present", await evaljs("document.querySelectorAll('.panel').length") >= 3);
  check("yesterday panel filled", await evaljs("document.getElementById('yesterday-body').children.length") > 0);
  check("the tray renders six side quests", await evaljs("document.querySelectorAll('.dock-item').length") === 6);
  check("every tray tile drew its icon", await evaljs("document.querySelectorAll('.dock-plate svg').length") === 6);
  check("the deck count is printed in the footer", /[0-9]+ coins in the deck/.test(
    await evaljs("document.getElementById('deck-count').textContent")));
  // The landscape is inline SVG on purpose: it has to paint on the first frame
  // with no request, so a missing <svg> here means someone made it an <img>.
  check("the landscape is inline SVG", await evaljs("document.querySelectorAll('.world svg.hills path').length") >= 6);
  check("clouds and coins built", await evaljs("document.querySelectorAll('.cloud').length") > 0
    && await evaljs("document.querySelectorAll('.coin').length") > 0);
  check("both mascots carry a prop", await evaljs("document.querySelectorAll('.mascot .prop').length") === 2);
  // The old pixel world is deleted by DESIGN.md; a reappearance means someone
  // restored a rule from git rather than reading the contract.
  check("the retired pixel world is gone", await evaljs(
    "!document.querySelector('.sky') && !document.querySelector('.crowd') && !document.querySelector('#pill-row')"));
  check("sound is off until the player opts in", await evaljs(
    "document.getElementById('btn-sfx').getAttribute('aria-pressed')") === "false");
  check("no images failed to load", await evaljs(
    "Array.from(document.images).filter(function(i){return i.complete && i.naturalWidth===0}).length") === 0);
  check("X and DexScreener social buttons rendered", await evaljs("document.querySelectorAll('.social-btn').length") === 2);
  check("both social icons drew a glyph", await evaljs("Array.from(document.querySelectorAll('.social-btn svg')).length") === 2);
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
    // Blur opens at scale 1.55 on a 150px frame, so the logo is drawn into
    // ~233px CSS — ~465px on a 2x screen. We cannot always beat that (some
    // sources only exist at 200px), but it must at least clear the frame at 2x,
    // or the reveal lands soft exactly when the player is staring at it.
    if (m === "blur") check("blur: logo out-resolves the frame at 2x", await evaljs(
      "(function(i){return !i || !i.complete || i.naturalWidth === 0 || i.naturalWidth >= i.clientWidth * 2;})" +
      "(document.querySelector('.blur-img'))"));
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

  console.log("\nshare + board");
  check("share.js loaded", await evaljs("typeof SHARE === 'object' && typeof SHARE.postToX === 'function'"));
  check("lb.js exposes the handle flow", await evaljs(
    "typeof LB === 'object' && typeof LB.boot === 'function' && typeof LB.open === 'function'"));

  // Render a real result card and check the PNG comes back with pixels in it.
  const card = await evaljs(`(function(){
    return SHARE.render({
      mode:"classic", modeName:"Classic", day:12, unlimited:false, won:true,
      guesses:4, max:6, slots:6, hint:false, streak:3, url:"memedle-weld.vercel.app", cb:false,
      rows:[["x","y","g","x","x"],["y","g","g","x","y"],["g","g","y","g","x"],["g","g","g","g","g"]]
    }).then(function(b){ return b ? b.size : 0; });
  })()`);
  check("result card renders a PNG", typeof card === "number" && card > 8000, "bytes=" + card);

  const caption = await evaljs("SHARE.intentURL('Memedle Classic #12 — 4/6. https://memedle-weld.vercel.app')");
  check("X intent points at the post composer", /^https:\/\/x\.com\/intent\/post\?text=/.test(caption), caption);
  check("the card gives nothing away", !/BONK|\$[A-Z]{2,}/.test(caption), caption);

  await evaljs("document.querySelector('[data-go=\"board\"]').click(); 'ok'");
  await sleep(900);
  check("board modal opens", await evaljs("!document.getElementById('modal-lb').classList.contains('hidden')"));
  check("board offers all three modes", await evaljs("document.querySelectorAll('#lb-body .stat-tab').length") === 3);
  check("board says so when it cannot be reached", await evaljs(
    "/couldn't reach|no .* scores yet/i.test(document.getElementById('lb-body').textContent)"),
    await evaljs("document.getElementById('lb-body').textContent.slice(0,120)"));
  check("no handle means the board says how to get one", await evaljs(
    "!!document.querySelector('#lb-body .lb-callout')"));
  await closeModals();

  console.log("\nmotion");
  // Down flat and fast, back with energy. Asserted as the relationship rather
  // than as a literal, so retuning the scale in :root does not fail the suite
  // while a symmetric toggle — which is the actual defect — still does.
  check("press tokens are asymmetric (down fast, up springs)", await evaljs(`(function(){
    var cs=getComputedStyle(document.documentElement);
    function ms(v){ var m=/([\\d.]+)m?s/.exec(v); return m ? (v.indexOf('ms')>=0 ? +m[1] : +m[1]*1000) : 0; }
    var up=ms(cs.getPropertyValue('--press')), down=ms(cs.getPropertyValue('--press-in'));
    return down > 0 && up > 0 && down < up;
  })()`));
  // DESIGN.md's elevation rule: the Live tier is a hard offset with ZERO blur.
  // A blur radius creeping in here is the fastest way to make the page generic.
  check("the live tier casts a zero-blur shadow", await evaljs(`(function(){
    var b=document.querySelector('.btn');
    var s=getComputedStyle(b).boxShadow;
    var m=/(-?[\\d.]+)px (-?[\\d.]+)px (-?[\\d.]+)px/.exec(s);
    return !!m && +m[3] === 0 && +m[2] > 0;
  })()`));
  check("a submitted guess stamps the go button", await evaljs(`(function(){
    var b=document.getElementById('btn-go');
    b.classList.add('sent');
    var an=getComputedStyle(b).animationName;
    b.classList.remove('sent');
    return an === 'stamp-down';
  })()`));
  check("the flash layer is mounted", await evaljs("!!document.getElementById('flash-layer')"));

  console.log("\nrules card and the payout wallet");
  check("the rules card is a five-step numbered list", await evaljs(
    "document.querySelectorAll('.rule-list li').length") === 5);
  check("the pot line is in the rules card", /100%/.test(await evaljs(
    "document.querySelector('.rule-list').textContent")));
  check("the rules CTA is the system button", (await evaljs(
    "document.getElementById('btn-help-2').className")).split(" ")[0] === "btn");
  check("the full rules explain the pot", await evaljs(`(function(){
    var t=document.getElementById('modal-help').textContent;
    return /00:00 UTC/.test(t) && /pro-rata/.test(t) && /wallet/i.test(t);
  })()`));
  check("settings has a wallet section", await evaljs("!!document.getElementById('wallet-body')"));
  check("no handle means no wallet row, and it says why", await evaljs(`(function(){
    LB.renderProfile();
    var b=document.getElementById('wallet-body');
    return b.querySelectorAll('button').length === 0 && /handle/i.test(b.textContent);
  })()`));
  check("a claimed handle draws the add-wallet button", await evaljs(`(function(){
    localStorage.setItem('md_name','tester'); LB.renderProfile();
    var b=document.getElementById('wallet-body').querySelector('button');
    return !!b && /wallet/i.test(b.textContent);
  })()`));
  check("the wallet prompt takes a pasted Solana address", await evaljs(`(function(){
    LB.openWallet();
    var i=document.getElementById('wallet-input');
    i.value=' 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\\n';
    i.dispatchEvent(new Event('input',{bubbles:true}));
    var n=document.querySelector('#gate-body .gate-note');
    return i.value.length===44 && n.className.indexOf('ok')>=0 && /Solana/.test(n.textContent);
  })()`));
  check("an EVM address reads as EVM", await evaljs(`(function(){
    var i=document.getElementById('wallet-input');
    i.value='0x'+'aB'.repeat(20);
    i.dispatchEvent(new Event('input',{bubbles:true}));
    var n=document.querySelector('#gate-body .gate-note');
    return n.className.indexOf('ok')>=0 && /EVM/.test(n.textContent);
  })()`));
  check("a wrong address is refused before any request", await evaljs(`(function(){
    var i=document.getElementById('wallet-input');
    i.value='7xKXtg2CW87d97TX';
    i.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#gate-body .btn-primary').click();
    var n=document.querySelector('#gate-body .gate-note');
    return n.className.indexOf('bad')>=0;
  })()`));
  await evaljs("localStorage.removeItem('md_name'); localStorage.removeItem('md_w'); LB.renderProfile(); 'ok'");
  await closeModals();



  console.log("\npage errors:", errors.length ? errors : "none");
  if (errors.length) fail += errors.length;
  console.log("\n" + pass + " passed, " + fail + " failed");
  ws.close();
  return fail === 0;
}

cdp().then(ok => process.exit(ok ? 0 : 1))
     .catch(e => { console.error("TEST HARNESS ERROR:", e.message); process.exit(1); });
