// Build the single-file (Claude Artifact / offline) version of Memedle.
// Inlines CSS, data, leaderboard client, game code, and every logo as a data URI.
// Usage: node tools/build-artifact.js [outfile]
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function mimeOf(buf) {
  if (buf.slice(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.slice(0, 3).toString() === "GIF") return "image/gif";
  return "image/png";
}

const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
const data = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
let game = fs.readFileSync(path.join(ROOT, "game.js"), "utf8");
const lb = fs.readFileSync(path.join(ROOT, "lb.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// artifact build: no external URL in the share text
game = game.replace('var SITE_URL = "jeardesuss.github.io/memecoindle";', 'var SITE_URL = "";');
game = game.replace(
  'return head + "\\n\\n" + rows.join("\\n") + "\\n\\n" + SITE_URL;',
  'return head + "\\n\\n" + rows.join("\\n") + (SITE_URL ? "\\n\\n" + SITE_URL : "");'
);

// inline logos
let logosInline = {};
try {
  eval(fs.readFileSync(path.join(ROOT, "logos.js"), "utf8")); // defines LOGOS
  for (const [ticker, rel] of Object.entries(LOGOS)) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    logosInline[ticker] = "data:" + mimeOf(buf) + ";base64," + buf.toString("base64");
  }
} catch (e) { /* no logos yet — badges only */ }

// inline the background-crowd cut-outs the same way
let cutsInline = {};
try {
  eval(fs.readFileSync(path.join(ROOT, "cutouts.js"), "utf8")); // defines CUTOUTS
  for (const ticker of Object.keys(CUTOUTS)) {
    const f = path.join(ROOT, "img", "cut", ticker + ".png");
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    cutsInline[ticker] = { d: CUTOUTS[ticker], u: "data:" + mimeOf(buf) + ";base64," + buf.toString("base64") };
  }
} catch (e) { /* no cut-outs yet — the crowd just stays empty */ }
const cutDims = Object.fromEntries(Object.entries(cutsInline).map(([k, v]) => [k, v.d]));
const cutSrc = Object.fromEntries(Object.entries(cutsInline).map(([k, v]) => [k, v.u]));

const bodyInner = html.split("<body>")[1].split("<script src=")[0];
// webfont links: load fine in a browser/preview; a CSP-sandboxed artifact
// blocks them and falls back to the system stacks — harmless either way
const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Pixelify+Sans:wght@400..700&display=swap" rel="stylesheet">\n';
const out =
  "<title>Memedle</title>\n" + fonts + "<style>\n" + css + "\n</style>\n" + bodyInner +
  "\n<script>\n" + data + "\n</script>\n<script>\nvar LOGOS = " + JSON.stringify(logosInline) +
  ";\n</script>\n<script>\nvar CUTOUTS = " + JSON.stringify(cutDims) +
  ";\nvar CUT_SRC = " + JSON.stringify(cutSrc) +
  ";\n</script>\n<script>\n" + lb + "\n</script>\n<script>\n" + game + "\n</script>\n";

const outFile = process.argv[2] || path.join(ROOT, "dist-artifact.html");
fs.writeFileSync(outFile, out);
console.log("built " + outFile + " — " + (out.length / 1024 / 1024).toFixed(2) + "MB, " +
  Object.keys(logosInline).length + " logos + " + Object.keys(cutsInline).length + " cut-outs inlined");
