// CDP gameplay test for memecoindle — no deps, node 22+.
const fs = require("fs");
const path = require("path");
const GAME_DIR = require("path").join(__dirname, "..");
const SCRATCH = require("os").tmpdir();

// Replicate deterministic daily pick to know today's answer
eval(fs.readFileSync(path.join(GAME_DIR, "data.js"), "utf8"));
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const EPOCH = new Date(2026, 7, 21);
const now = new Date();
const day = Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate()) - EPOCH)/86400000);
const idx = COINS.map((_,i)=>i);
const rnd = mulberry32(0x5EED1337);
for (let i=idx.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
const answer = COINS[idx[((day%idx.length)+idx.length)%idx.length]];
console.log("day#", day+1, "| today's answer:", answer.n, "$"+answer.t);

async function cdp() {
  const list = await (await fetch("http://localhost:9223/json")).json();
  const page = list.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params.exceptionDetails.exception));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a=>a.value).join(" "));
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params={}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id:i, method, params})); });
  const evaljs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error("page eval failed: " + JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SCRATCH, name), Buffer.from(r.result.data, "base64"));
    console.log("screenshot:", name);
  };

  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: "http://localhost:8471/" });
  await sleep(1200);
  await evaljs("localStorage.clear(); location.reload(); 'ok'");
  await sleep(1200);

  // 1. help modal should be open on first visit
  const helpOpen = await evaljs("!document.getElementById('modal-help').classList.contains('hidden')");
  console.log("TEST first-visit help modal:", helpOpen ? "PASS" : "FAIL");
  await evaljs("document.querySelector('#modal-help .modal-close').click(); 'ok'");

  // helper to guess a coin by exact name via the real input path
  const guessJS = (name) => `
    (function(){
      var inp = document.getElementById('guess-input');
      inp.focus(); inp.value = ${JSON.stringify(name)};
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
      return document.querySelectorAll('.guess-row').length;
    })()`;

  // 2. autocomplete renders
  await evaljs("var i=document.getElementById('guess-input'); i.value='dog'; i.dispatchEvent(new Event('input',{bubbles:true})); 'ok'");
  const acCount = await evaljs("document.querySelectorAll('.ac-item').length");
  console.log("TEST autocomplete for 'dog':", acCount > 0 ? "PASS ("+acCount+" items)" : "FAIL");
  await evaljs("var i=document.getElementById('guess-input'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); 'ok'");

  // 3. two wrong guesses then the right one
  const wrong = COINS.filter(c => c.n !== answer.n).slice(0, 2);
  let rows = await evaljs(guessJS(wrong[0].n));
  console.log("TEST wrong guess 1 row added:", rows === 1 ? "PASS" : "FAIL rows=" + rows);
  await sleep(1500);
  rows = await evaljs(guessJS(wrong[1].n));
  console.log("TEST wrong guess 2 row added:", rows === 2 ? "PASS" : "FAIL rows=" + rows);
  await sleep(1500);
  await shot("t_midgame.png");
  rows = await evaljs(guessJS(answer.n));
  console.log("TEST winning guess row added:", rows === 3 ? "PASS" : "FAIL rows=" + rows);
  await sleep(2300);

  // 4. reveal modal with win verdict
  const revealOpen = await evaljs("!document.getElementById('modal-reveal').classList.contains('hidden')");
  const verdict = await evaljs("(document.querySelector('.reveal-verdict')||{}).textContent || ''");
  console.log("TEST reveal opens on win:", revealOpen ? "PASS" : "FAIL", "| verdict:", verdict);
  const lastRowGreen = await evaljs("Array.from(document.querySelectorAll('.guess-row:last-child .tile')).every(t=>t.classList.contains('s-g'))");
  console.log("TEST winning row all green:", lastRowGreen ? "PASS" : "FAIL");
  await shot("t_win.png");

  // 5. state persists across reload
  await evaljs("location.reload(); 'ok'");
  await sleep(1500);
  const rowsAfter = await evaljs("document.querySelectorAll('.guess-row').length");
  const inputDisabled = await evaljs("document.getElementById('guess-input').disabled");
  console.log("TEST daily state persists:", rowsAfter === 3 && inputDisabled ? "PASS" : "FAIL rows="+rowsAfter+" disabled="+inputDisabled);
  await evaljs("document.querySelector('#modal-reveal .modal-close') && document.querySelector('#modal-reveal .modal-close').click(); 'ok'");

  // 6. stats recorded
  const stats = await evaljs("JSON.parse(localStorage.getItem('mcdl_stats_v1'))");
  console.log("TEST stats recorded:", stats && stats.played === 1 && stats.wins === 1 && stats.streak === 1 ? "PASS" : "FAIL " + JSON.stringify(stats));

  // 7. unlimited mode
  await evaljs("document.getElementById('mode-toggle').click(); 'ok'");
  await sleep(400);
  const freeMeta = await evaljs("document.getElementById('puzzle-meta').textContent");
  const freeRows = await evaljs("document.querySelectorAll('.guess-row').length");
  console.log("TEST unlimited mode:", /Unlimited/.test(freeMeta) && freeRows === 0 ? "PASS" : "FAIL meta=" + freeMeta);
  // lose a free game in 6 wrong guesses (guess anything; if we accidentally hit the answer, fine too)
  const six = COINS.slice(10, 16).map(c => c.n);
  for (const n of six) { await evaljs(guessJS(n)); await sleep(200); }
  await sleep(2600);
  const freeDone = await evaljs("!document.getElementById('modal-reveal').classList.contains('hidden')");
  console.log("TEST unlimited completes after 6:", freeDone ? "PASS" : "FAIL");
  await shot("t_free_end.png");

  console.log("page errors:", errors.length ? errors : "none");
  ws.close();
}
cdp().then(() => process.exit(0)).catch(e => { console.error("TEST HARNESS ERROR:", e.message); process.exit(1); });
