// Records REAL footage of the running app: a scripted, human-paced session driven through Chrome.
//   node capture-footage.mjs
// Output: footage/frames/%06d.jpg at a constant 30 fps, plus footage/marks.json (named moments + element rects).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, 'footage');
const FRAMES = join(OUT, 'frames');
const PORT = 3001;
const BASE = `http://localhost:${PORT}`;
const W = 1600, H = 900, FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// ---- start the real server (warm Qloo cache, real key from .env)
const server = spawn('npx', ['tsx', 'src/server/dev.ts'], { cwd: root, env: { ...process.env, PORT: String(PORT), QLOO_CACHE_DIR: '.qloo-cache' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up yet */ } await sleep(500); }

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const client = await page.createCDPSession();
const frames = [];
client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  try { await client.send('Page.screencastFrameAck', { sessionId }); } catch { /* closing */ }
});

const marks = {};
let t0 = null;
const now = () => Date.now() / 1000;
const mark = async (name, selectors = []) => {
  const t = now();
  const rects = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => [s, [...document.querySelectorAll(s)].slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })])), selectors);
  marks[name] = { t, rects };
};

let mx = 800, my = 450;
const glide = async (x, y, ms = 700) => {
  const sx = mx, sy = my, steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const e = i / steps, k = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2; // ease in-out
    await page.mouse.move(sx + (x - sx) * k, sy + (y - sy) * k);
    await sleep(ms / steps);
  }
  mx = x; my = y;
};
const center = async (sel, i = 0) => page.evaluate((s, k) => { const e = document.querySelectorAll(s)[k]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel, i);
const clickAt = async (sel, i = 0, ms = 800) => { const c = await center(sel, i); if (!c) throw new Error(`missing ${sel}`); await glide(c[0], c[1], ms); await sleep(180); await page.mouse.down(); await sleep(70); await page.mouse.up(); };
const smoothScrollTo = async (sel, block = 'start') => { await page.evaluate((s, b) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: b }), sel, block); };

await client.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
t0 = now();

try {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.mouse.move(mx, my);
  await sleep(6800); // the table draws itself and the guests sit down
  await mark('table', ['#scene', '.sc-plate', '.seat', '#go', '#h1', '#brief']);

  const maya = await center('.seat', 0);
  await glide(maya[0], maya[1], 1100); await sleep(1700); // hover: her anchors orbit and get named
  await mark('hoverMaya', ['.seat']);
  const dan = await center('.seat', 1);
  await glide(dan[0], dan[1], 800); await sleep(1300);
  await mark('hoverDan', ['.seat']);
  const goC = await center('#go');
  await glide(goC[0], goC[1], 900); await sleep(500);
  await mark('beforePlan', ['#go']);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
  await mark('plan', ['#scene', '.sc-plate', '.cable']);

  await page.waitForSelector('#results:not([hidden]) #verdict', { timeout: 180000 });
  await mark('results', ['#verdict', '#verdict .vnum']);
  await sleep(1300); // the app scrolls to the verdict; go back up so the finished trusses on the table are on screen
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(4200);
  await mark('bridged', ['.sc-plate', '#scene', '.seat']);
  await page.evaluate(() => document.querySelector('#verdict').scrollIntoView({ behavior: 'smooth', block: 'start' })); await sleep(3600);
  await mark('verdict', ['#verdict', '.vnum', '.facts', '.vtext h2']);

  await glide(900, 520, 600);
  await smoothScrollTo('#stress'); await sleep(3600);
  await mark('stress', ['.beam', '.rails']);

  await smoothScrollTo('#night'); await sleep(2600);
  await mark('bridge', ['#bridge', '.pier', '.node', '[data-rebalance]']);
  await sleep(9500); // the traveller tours the piers and the dossier changes
  await mark('tour', ['.pier', '#dossier']);

  await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' })); await sleep(1500);
  await mark('dossier', ['#dossier', '.tabs button', '.dos-main h3', '.gline']);
  await clickAt('[data-tab="serves"]', 0, 900); await sleep(2800);
  await mark('serves', ['.serve-list li', '.tabs button']);
  await clickAt('[data-tab="trade"]', 0, 700); await sleep(3800);
  await mark('costs', ['.tr li', '.naive', '.tabs button']);

  await page.evaluate(() => document.querySelector('#night').scrollIntoView({ behavior: 'smooth', block: 'start' })); await sleep(1800);
  await clickAt('[data-rebalance]', 0, 900); await sleep(4200);
  await mark('rebalanced', ['#revs li', '.pier']);

  await smoothScrollTo('#loads'); await sleep(3600);
  await mark('loads', ['.loads', '.audit']);

  await page.evaluate(() => document.querySelector('#verdict').scrollIntoView({ behavior: 'smooth', block: 'start' })); await sleep(1600);
  await clickAt('[data-compare]', 0, 800);
  await page.waitForSelector('.curtain', { timeout: 120000 });
  await sleep(2600);
  await page.evaluate(() => document.querySelector('#compare').scrollIntoView({ behavior: 'smooth', block: 'start' })); await sleep(2800);
  await mark('compare', ['.curtain', '.handle', '.score-wrap']);
  const hnd = await center('.handle');
  await glide(hnd[0], hnd[1], 700); await page.mouse.down(); await sleep(150);
  await glide(hnd[0] - 520, hnd[1], 1800); await glide(hnd[0] + 380, hnd[1], 2000); await page.mouse.up(); await sleep(900);
  await mark('curtain', ['.curtain']);
} finally {
  const tEnd = now();
  await client.send('Page.stopScreencast').catch(() => {});
  await browser.close();
  server.kill();
  marks._start = { t: t0, rects: {} }; marks._end = { t: tEnd, rects: {} };

  // resample the screencast to a constant frame rate
  frames.sort((a, b) => a.t - b.t);
  const dur = tEnd - t0, n = Math.floor(dur * FPS);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const tt = t0 + i / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= tt) j++;
    writeFileSync(join(FRAMES, `${String(i).padStart(6, '0')}.jpg`), Buffer.from(frames[Math.max(0, j)].data, 'base64'));
  }
  // marks in seconds from the start
  const out = { fps: FPS, width: W, height: H, frames: n, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { t: +(v.t - t0).toFixed(2), rects: v.rects }])) };
  writeFileSync(join(OUT, 'marks.json'), JSON.stringify(out, null, 1));
  console.log(`captured ${frames.length} raw frames → ${n} frames @ ${FPS}fps (${dur.toFixed(1)}s)`);
  console.log(Object.entries(out.marks).map(([k, v]) => `${k}@${v.t}s`).join('  '));
}
