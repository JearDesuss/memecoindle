// Brings up what test/cdp-test.js expects — a static server on :8471 and a
// headless browser on :9223 — runs the suite, then tears both down.
//   node tools/run-test.mjs
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_X86 = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EDGE = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = join(ROOT, normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  try {
    if (statSync(file).isDirectory()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(8471, r));

// A fresh profile every run: a reused one carries localStorage from the last
// run, and the suite's very first assertion is about a first visit.
const profile = mkdtempSync(join(tmpdir(), 'memedle-cdp-'));
// executablePath() ignores `channel` and hands back the bundled Chromium,
// which Smart App Control blocks on this machine. Use signed Edge directly.
const exe = existsSync(EDGE_X86) ? EDGE_X86 : EDGE;
const browser = spawn(exe, [
  '--headless=new',
  '--remote-debugging-port=9223',
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--disable-gpu',
  'http://localhost:8471/index.html',
], { stdio: 'ignore' });

// wait for the DevTools endpoint rather than sleeping a guessed number
for (let i = 0; i < 60; i++) {
  try { await fetch('http://localhost:9223/json/version'); break; } catch { await new Promise(r => setTimeout(r, 250)); }
}

const test = spawn(process.execPath, [join(ROOT, 'test', 'cdp-test.js')], { stdio: 'inherit', cwd: ROOT });
const code = await new Promise(r => test.on('exit', r));

browser.kill();
server.close();
process.exit(code);
