// Render memedle with signed Edge and save a screenshot to output/.
//   node tools/shot.mjs <name> [width] [height] [actions...]
// actions: full  live  route=<hash>  click=<selector>  type=<text>  wait=<ms>  seed
// Routes are passed WITHOUT a leading "#": Git Bash rewrites those into Windows paths.
import { mkdirSync, createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import pw from 'file:///C:/Users/akbar/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [name = 'home', w = '1536', h = '1024', ...actions] = process.argv.slice(2);
const opt = key => (actions.find(a => a.startsWith(key + '=')) || '').slice(key.length + 1);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

const PORT = 8471 + (Number(process.env.SHOT_PORT_OFFSET) || 0);
const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = join(ROOT, normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  try {
    if (statSync(file).isDirectory()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(PORT, r));

mkdirSync(join(ROOT, 'output'), { recursive: true });
const browser = await pw.chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
const missing = [];
page.on('response', r => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });

// Skip the handle gate and the first-run help modal so shots show the board.
await context.addInitScript(() => {
  try {
    localStorage.setItem('md_seen', '1');
    localStorage.setItem('md_cid', 'shot-0000-0000-0000');
    localStorage.setItem('md_name', 'shotrunner');
  } catch {}
});

const route = opt('route');
const pageFile = opt('page') || 'index.html';
// motion.js reads ?still and freezes every timeline at its resting state, so a
// screenshot is reproducible; pass 'live' to let the idle motion run.
const q = actions.includes('live') ? '' : '?still';
await page.goto(`http://127.0.0.1:${PORT}/${pageFile}${q}` + (route ? '#/' + route : ''), { waitUntil: 'networkidle', timeout: 60000 });
if (!actions.includes('live')) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}' });
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

for (const a of actions) {
  if (a.startsWith('type=')) { await page.fill('#guess-input', opt('type')); await page.waitForTimeout(250); }
  if (a === 'reveal') {
    // Six wrong guesses ends the run, which opens the reveal card. The win and
    // loss cards are the same layout apart from the verdict line.
    for (const g of ['PEPE', 'WIF', 'BONK', 'SHIB', 'FLOKI', 'BRETT', 'APU', 'DEGEN']) {
      // the input locks the moment the run ends, and fill() then blocks until
      // it times out rather than telling you the game is simply over
      if (await page.locator('#guess-input').isDisabled()) break;
      await page.fill('#guess-input', g);
      await page.click('#btn-go').catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1800);
  }
  if (a === 'seed') {
    // Play three losing guesses so the board has rows in it.
    for (const g of ['PEPE', 'WIF', 'BONK']) {
      await page.fill('#guess-input', g);
      await page.click('#btn-go').catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  if (a.startsWith('click=')) { await page.click(opt('click')); await page.waitForTimeout(500); }
  if (a.startsWith('wait=')) await page.waitForTimeout(+opt('wait'));
}
await page.waitForTimeout(300);

const metrics = await page.evaluate(() => ({
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  height: document.documentElement.scrollHeight,
  fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i),
}));
const file = join(ROOT, 'output', `${name}.png`);
await page.screenshot({ path: file, fullPage: actions.includes('full') });
console.log(JSON.stringify({ name, file, ...metrics, errors: errors.slice(0, 8), missing }));
await browser.close();
server.close();
