// Render the page at a spread of real viewport sizes and report the metrics
// that catch layout breakage: horizontal overflow, cards narrower than their
// content, and anything overlapping the scene it should sit above.
//   node tools/sweep.mjs [shot]
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from 'file:///C:/Users/akbar/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json' };
const srv = createServer((q,r)=>{
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'') || 'index.html';
  const f = join(ROOT, normalize(rel).replace(/^(\.\.[\/])+/,''));
  try { if (statSync(f).isDirectory()) throw 0;
    r.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});
    createReadStream(f).pipe(r);
  } catch { r.writeHead(404).end('x'); }
});
await new Promise(r=>srv.listen(8479,r));

const SIZES = [
  ['phone-sm', 360, 780], ['phone', 420, 900], ['phablet', 560, 900],
  ['tablet', 768, 1024], ['tablet-land', 1024, 768], ['laptop-sm', 1280, 800],
  ['laptop', 1440, 900], ['desktop', 1536, 1024], ['fhd', 1920, 1080],
  ['qhd', 2560, 1440], ['ultrawide', 2560, 1080], ['short', 1440, 620],
];
const shot = process.argv.includes('shot');
mkdirSync(join(ROOT,'output','sweep'), { recursive: true });

const b = await pw.chromium.launch({ channel:'msedge', headless:true });
let bad = 0;
for (const [name, w, h] of SIZES) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('md_seen','1'); localStorage.setItem('md_name','sweep'); }catch{} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8479/index.html?still', { waitUntil:'networkidle', timeout:60000 });
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForTimeout(350);
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const clipped = [...document.querySelectorAll('.panel, .mode-card, .dock, .btn, .dock-item')]
      .filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className);
    const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const dock = r('.dock'), world = r('.world'), foot = r('.more');
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      pageH: de.scrollHeight,
      clipped,
      // the footer line must not sit on the green, which is the whole reason
      // the hill profile is a valley
      footOnGreen: !!(foot && world && foot.bottom > world.top + world.height * 0.42),
      dockW: dock ? Math.round(dock.width) : 0,
      worldH: world ? Math.round(world.height) : 0,
    };
  });
  const ok = m.overflowX === 0 && m.clipped.length === 0 && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${String(w).padStart(4)}x${String(h).padEnd(4)} ` +
    `overflowX=${m.overflowX} page=${m.pageH} world=${m.worldH} dock=${m.dockW}` +
    (m.clipped.length ? ` clipped=[${m.clipped.join(', ')}]` : '') +
    (m.footOnGreen ? ' FOOTER-ON-GREEN' : '') +
    (errs.length ? ` errors=${errs.length}` : ''));
  if (shot) await p.screenshot({ path: join(ROOT,'output','sweep',`${name}.png`) });
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad ? `\n${bad} size(s) failed` : '\nall sizes clean');
process.exit(bad ? 1 : 0);
