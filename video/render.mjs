// Renders the film.   node render.mjs                 full render (needs out/audio.wav, else silent)
//                     node render.mjs --stills 2,6,12   save JPEG stills at those seconds to out/qa/
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { FPS, W, H, TOTAL } from './timeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join(here, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'stage.html');
  if (!p.startsWith(here) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`${base}/stage.html`, { waitUntil: 'networkidle2' });
await page.evaluate(() => window.ready);
const frames = existsSync(join(here, 'footage/frames')) ? readdirSync(join(here, 'footage/frames')).length : 0;
await page.evaluate((n) => window.setFrameCount(n), frames);
const shot = () => page.screenshot({ type: 'jpeg', quality: 92, optimizeForSpeed: true });
const draw = (f) => page.evaluate((x) => window.renderFrame(x), f);

const arg = process.argv.indexOf('--stills');
if (arg > 0) {
  mkdirSync(join(here, 'out/qa'), { recursive: true });
  for (const s of process.argv[arg + 1].split(',')) {
    const t = Number(s); await draw(Math.round(t * FPS));
    writeFileSync(join(here, `out/qa/t${String(t).replace('.', '_')}.jpg`), await shot());
  }
  console.log('stills saved to out/qa/'); await browser.close(); server.close(); process.exit(0);
}

const audio = join(here, 'out/audio.wav'), outFile = join(here, 'out/tastebridge-groups-demo.mp4');
mkdirSync(join(here, 'out'), { recursive: true });
const args = ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
if (existsSync(audio)) args.push('-i', audio);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-r', String(FPS), '-movflags', '+faststart');
if (existsSync(audio)) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(outFile);
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'inherit'] });
const total = Math.round(TOTAL * FPS), t0 = Date.now();
for (let f = 0; f < total; f++) {
  await draw(f);
  const buf = await shot();
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f}/${total}  ${(f / FPS).toFixed(1)}s  elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close(); server.close();
console.log(`done: ${outFile} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
