// Where does the content sit vertically? Reports the empty space above and
// below the visible content block at a spread of real viewports, empty board
// and a played board, so "centred" is a number rather than an impression.
//   node tools/vcenter.mjs
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from 'file:///C:/Users/akbar/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.webp':'image/webp', '.svg':'image/svg+xml' };
const srv = createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = join(ROOT, normalize(rel).replace(/^(\.\.[\/])+/, ''));
  try { if (statSync(f).isDirectory()) throw 0;
    r.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream' });
    createReadStream(f).pipe(r);
  } catch { r.writeHead(404).end('x'); }
});
await new Promise(r => srv.listen(8495, r));

const SIZES = [[1280,800],[1366,768],[1440,900],[1536,1024],[1680,1050],[1920,1080],[1920,1200],[2560,1440]];
const b = await pw.chromium.launch({ channel: 'msedge', headless: true });
console.log('viewport      state   top    bottom  content  scrolls  bias');
for (const [w, h] of SIZES) {
  for (const played of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => { try { localStorage.setItem('md_seen','1'); localStorage.setItem('md_name','v'); } catch {} });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8495/index.html?still', { waitUntil: 'networkidle' });
    if (played) for (const g of ['PEPE','WIF','BONK']) {
      await p.fill('#guess-input', g); await p.click('#btn-go').catch(() => {}); await p.waitForTimeout(200);
    }
    await p.evaluate(() => window.scrollTo(0, 0));
    const m = await p.evaluate(() => {
      // the visible content: from the top of the topbar to the bottom of the footer
      const top = document.querySelector('.topbar').getBoundingClientRect().top;
      const bot = document.querySelector('.more').getBoundingClientRect().bottom;
      return { top: Math.round(top), bot: Math.round(bot), vh: innerHeight,
        scroll: document.documentElement.scrollHeight > innerHeight + 1 };
    });
    const below = m.vh - m.bot;
    // bias: + means the block sits HIGH of centre, - means low
    const bias = Math.round((below - m.top) / 2);
    console.log(`${String(w).padStart(4)}x${String(h).padEnd(5)}  ${played ? 'played' : 'empty '}  ${String(m.top).padStart(4)}  ${String(below).padStart(6)}  ${String(m.bot - m.top).padStart(7)}  ${m.scroll ? 'yes' : 'no '}      ${bias > 0 ? '+' : ''}${bias}`);
    await ctx.close();
  }
}
await b.close(); srv.close();
