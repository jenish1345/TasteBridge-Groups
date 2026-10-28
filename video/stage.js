// The film's renderer. renderFrame(f) draws frame f as a pure function of time: no state between frames.
import { FPS, W, H, S, TRANS, HITS, E2, footageTime, setMarks } from './timeline.js';

const BP = '#0b3a6b', BP3 = '#06284d', CHALK = '#edf4ff', SOFT = '#a9c3e6', GOLD = '#ffe14d', TENS = '#ff5b3a';
const PCOL = ['#ff8fa3', '#6fe0b4', '#ffb347', '#e9a6ff', '#c8f060'];
const HATCH = [45, 135, 0, 90, 30];
const NAMES = ['Maya', 'Dan', 'Priya', 'Tom', 'Sam'];
const DISP = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const TEXT = '"Familjen Grotesk", system-ui, sans-serif';
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const eo3 = (t) => 1 - Math.pow(1 - clamp(t), 3);
const eio = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const ebk = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const prog = (t, a, b) => clamp((t - a) / (b - a));
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };

// ------------------------------------------------------------------ canvases
const cv = document.getElementById('cv'); const ctx = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const cA = mk(), cB = mk(), grid = mk();
const gA = cA.getContext('2d'), gB = cB.getContext('2d');
{ // the drafting board, drawn once
  const g = grid.getContext('2d'); g.fillStyle = BP; g.fillRect(0, 0, W, H);
  g.lineWidth = 1; g.strokeStyle = 'rgba(237,244,255,0.05)';
  for (let x = 0; x <= W; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 24) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.strokeStyle = 'rgba(237,244,255,0.11)';
  for (let x = 0; x <= W; x += 120) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 120) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, H * 0.95); v.addColorStop(0, 'rgba(4,22,44,0)'); v.addColorStop(1, 'rgba(4,22,44,0.6)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
const bg = (c) => c.drawImage(grid, 0, 0);

// ------------------------------------------------------------------ drawing helpers
function txt(c, s, x, y, { size = 48, weight = 600, family = TEXT, color = CHALK, align = 'left', base = 'alphabetic', alpha = 1, ls = 0, scale = 1, shadow = false } = {}) {
  if (alpha <= 0 || !s) return;
  c.save(); c.globalAlpha *= alpha; c.font = `${weight} ${size}px ${family}`; c.textAlign = align; c.textBaseline = base; c.fillStyle = color; c.letterSpacing = `${ls}px`;
  if (shadow) { c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 24; }
  if (scale !== 1) { c.translate(x, y); c.scale(scale, scale); c.fillText(s, 0, 0); } else c.fillText(s, x, y);
  c.restore();
}
const disp = (c, s, x, y, o = {}) => txt(c, s, x, y, { family: DISP, weight: 900, ...o });
const typed = (s, t, t0, cps = 26) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
function slam(c, s, x, y, t, t0, o = {}) { // scale-down impact with a flash of blur
  const p = (t - t0); if (p < 0) return;
  const k = eo3(p / 0.4), sc = lerp(1.55, 1, k), a = clamp(p / 0.12);
  disp(c, s, x, y, { ...o, scale: sc, alpha: a * (o.alpha ?? 1) });
}
function seat(c, x, y, r, i, { scale = 1, alpha = 1, letter, ring = true, color } = {}) {
  if (scale <= 0 || alpha <= 0) return;
  const col = color ?? PCOL[i % 5];
  c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.scale(scale, scale);
  c.shadowColor = col; c.shadowBlur = 26;
  c.fillStyle = BP3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.shadowBlur = 0;
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
  c.strokeStyle = col; c.globalAlpha *= 0.55; c.lineWidth = 2.5;
  const a = (HATCH[i % 5] * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  for (let k = -r * 2; k < r * 2; k += 9) { c.beginPath(); c.moveTo(-dx * r * 2 - dy * k, -dy * r * 2 + dx * k); c.lineTo(dx * r * 2 - dy * k, dy * r * 2 + dx * k); c.stroke(); }
  c.restore();
  if (ring) { c.strokeStyle = col; c.lineWidth = 3.5; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
  c.font = `800 ${r * 1.0}px ${DISP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = CHALK; c.shadowColor = BP3; c.shadowBlur = 8;
  c.fillText(letter ?? NAMES[i % 5][0], 0, r * 0.06);
  c.restore();
}
function table(c, cx, cy, R, p, spin = 0, alpha = 1) {
  c.save(); c.globalAlpha *= alpha; c.lineCap = 'round';
  c.strokeStyle = 'rgba(237,244,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * p); c.stroke();
  c.strokeStyle = 'rgba(237,244,255,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R * 0.78, Math.PI / 2, Math.PI / 2 + TAU * p); c.stroke();
  for (let i = 0; i < 120 * p; i++) { const a = (i / 120) * TAU + spin, long = i % 10 === 0; c.strokeStyle = `rgba(237,244,255,${long ? 0.7 : 0.3})`; c.lineWidth = long ? 2 : 1.2; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6)); c.lineTo(cx + Math.cos(a) * (R + (long ? 26 : 14)), cy + Math.sin(a) * (R + (long ? 26 : 14))); c.stroke(); }
  c.save(); c.beginPath(); c.arc(cx, cy, R * 0.78, 0, TAU); c.clip(); c.strokeStyle = 'rgba(237,244,255,0.07)'; c.lineWidth = 1.5; for (let x = -R * 2; x < R * 2; x += 16) { c.beginPath(); c.moveTo(cx + x - R, cy - R); c.lineTo(cx + x + R, cy + R); c.stroke(); } c.restore();
  c.restore();
}
function chip(c, s, x, y, { color = CHALK, size = 30, alpha = 1, scale = 1, fill = 'rgba(6,40,77,0.92)' } = {}) {
  if (alpha <= 0) return;
  c.save(); c.globalAlpha *= alpha; c.font = `600 ${size}px ${TEXT}`; const w = c.measureText(s).width + 36, h = size + 22;
  c.translate(x, y); c.scale(scale, scale); c.fillStyle = fill; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(-w / 2, -h / 2, w, h);
  c.fillStyle = CHALK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 2); c.restore();
}
// a cable under tension / the truss that replaces it
function span(c, x0, y0, x1, y1, t, { tension = 0, truss = 0, label = '', alpha = 1, seed = 1 } = {}) {
  c.save(); c.globalAlpha *= alpha;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  if (tension > 0) {
    c.strokeStyle = `rgba(255,91,58,${tension * (1 - truss * 0.92)})`; c.lineWidth = 3;
    for (const lane of [-3.5, 3.5]) { c.beginPath(); for (let i = 0; i <= 60; i++) { const u = i / 60, s = Math.sin(Math.PI * u), o = lane - s * 16 * (1 - truss) + s * (3 + 9 * tension) * (1 - truss) * Math.sin(t * 34 + i * 0.8 + seed); const x = x0 + dx * u + nx * o, y = y0 + dy * u + ny * o; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  }
  if (truss > 0) {
    const H_ = 26, M = 12, top = (u) => [x0 + dx * u + nx * (-H_ * Math.sin(Math.PI * u) * 0.6 - 5), y0 + dy * u + ny * (-H_ * Math.sin(Math.PI * u) * 0.6 - 5)], bot = (u) => [x0 + dx * u + nx * 5, y0 + dy * u + ny * 5];
    const p = eo3(truss); c.strokeStyle = 'rgba(237,244,255,0.96)'; c.lineWidth = 3;
    for (const f of [top, bot]) { c.beginPath(); for (let i = 0; i <= 60 * p; i++) { const q = f(i / 60); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.stroke(); }
    c.lineWidth = 2; c.beginPath(); for (let i = 0; i < M * p; i++) { const a = bot(i / M), b = top((i + 0.5) / M), d = bot((i + 1) / M); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); } c.stroke();
    c.fillStyle = GOLD; for (let i = 0; i <= M * p; i++) { const q = bot(i / M); c.beginPath(); c.arc(q[0], q[1], 4.2, 0, TAU); c.fill(); }
  }
  if (label) chip(c, label, (x0 + x1) / 2 + nx * -62, (y0 + y1) / 2 + ny * -62, { color: truss > 0.6 ? GOLD : TENS, size: 30 });
  c.restore();
}
const panel = (c, x, y, w, h, { border = CHALK, fill = 'rgba(6,40,77,0.9)', alpha = 1, lw = 2 } = {}) => { c.save(); c.globalAlpha *= alpha; c.fillStyle = fill; c.fillRect(x, y, w, h); c.strokeStyle = border; c.lineWidth = lw; c.strokeRect(x, y, w, h); c.restore(); };
const wrap = (c, s, maxW, size, weight = 500) => { c.font = `${weight} ${size}px ${TEXT}`; const out = []; let line = ''; for (const w of s.split(' ')) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };

// ------------------------------------------------------------------ footage
const frameCache = new Map();
let FRAME_COUNT = 0;
const fidx = (scene, T) => Math.round(clamp(footageTime(scene, T), 0, 1e6) * FPS);
async function ensure(idx) {
  if (FRAME_COUNT) idx = Math.min(idx, FRAME_COUNT - 1);
  if (frameCache.has(idx)) return;
  await new Promise((res) => { const im = new Image(); im.onload = () => { frameCache.set(idx, im); res(); }; im.onerror = () => res(); im.src = `/footage/frames/${String(idx).padStart(6, '0')}.jpg`; });
  if (frameCache.size > 60) frameCache.delete(frameCache.keys().next().value);
}

const PX = 160, PY = 90, PW = 1600, PH = 900;
function camera(keys, T) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (T >= keys[i].t && T < keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
  if (T >= keys[keys.length - 1].t) return keys[keys.length - 1];
  if (T < keys[0].t) return keys[0];
  const k = eio((T - a.t) / (b.t - a.t));
  return { z: lerp(a.z, b.z, k), fx: lerp(a.fx, b.fx, k), fy: lerp(a.fy, b.fy, k) };
}
const toCanvas = (cam, x, y) => [PX + PW / 2 + (x - cam.fx) * cam.z, PY + PH / 2 + (y - cam.fy) * cam.z];

function callout(c, cam, T, { t0, t1, x, y, bx, by, lines, color = GOLD, w = 460 }) {
  if (T < t0 || T > t1) return;
  const inn = eo3((T - t0) / 0.35), out = 1 - eo3((T - (t1 - 0.3)) / 0.3), a = Math.min(inn, out); if (a <= 0) return;
  const [tx, ty] = toCanvas(cam, x, y);
  c.save(); c.globalAlpha *= a;
  c.font = `600 34px ${TEXT}`; const ls = lines.flatMap((l) => wrap(c, l, w - 40, 34, 600)); const h = ls.length * 44 + 28;
  const bxx = bx, byy = by; panel(c, bxx, byy, w, h, { border: color, fill: 'rgba(6,40,77,0.95)' });
  ls.forEach((l, i) => txt(c, l, bxx + 20, byy + 44 + i * 44, { size: 34, weight: 600 }));
  const ax = clamp(tx, bxx, bxx + w), ay = ty < byy ? byy : ty > byy + h ? byy + h : (tx < bxx ? ty : byy + h / 2);
  c.strokeStyle = color; c.lineWidth = 3; c.beginPath(); c.moveTo(ax, ay); c.lineTo(tx, ty); c.stroke();
  c.fillStyle = color; c.beginPath(); c.arc(tx, ty, 9 + 3 * Math.sin(T * 8), 0, TAU); c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.arc(tx, ty, 22 + (((T - t0) * 40) % 18), 0, TAU); c.globalAlpha *= 0.5; c.stroke();
  c.restore();
}
function caption(c, T, { t0, t1, step, top, bottom }) {
  if (T < t0 || T > t1) return;
  const inn = eo3((T - t0) / 0.45), out = 1 - eo3((T - (t1 - 0.3)) / 0.3), a = Math.min(inn, out); if (a <= 0) return;
  c.save(); c.globalAlpha *= a;
  const xo = (1 - inn) * -60;
  let x = 180 + xo;
  if (step) { c.fillStyle = GOLD; c.beginPath(); c.arc(x + 32, 48, 32, 0, TAU); c.fill(); disp(c, String(step), x + 32, 49, { size: 52, color: BP3, align: 'center', base: 'middle' }); x += 86; }
  disp(c, top, x, 66, { size: 62, weight: 800, shadow: true });
  c.restore();
}
function drawFootage(c, scene, T, cam, caps, calls) {
  bg(c);
  const idx = Math.min(fidx(scene, T), FRAME_COUNT ? FRAME_COUNT - 1 : 1e9), img = frameCache.get(idx);
  c.save(); c.beginPath(); c.rect(PX, PY, PW, PH); c.clip();
  if (img) { c.translate(PX + PW / 2, PY + PH / 2); c.scale(cam.z, cam.z); c.translate(-cam.fx, -cam.fy); c.drawImage(img, 0, 0); }
  c.restore();
  c.strokeStyle = 'rgba(237,244,255,0.7)'; c.lineWidth = 2; c.strokeRect(PX - 1, PY - 1, PW + 2, PH + 2);
  for (const [x, y, sx, sy] of [[PX, PY, 1, 1], [PX + PW, PY, -1, 1], [PX, PY + PH, 1, -1], [PX + PW, PY + PH, -1, -1]]) { c.strokeStyle = GOLD; c.lineWidth = 4; c.beginPath(); c.moveTo(x + sx * 34, y); c.lineTo(x, y); c.lineTo(x, y + sy * 34); c.stroke(); }
  if (cam.z > 1.03 || (scene === 'how' && T < 46.5)) { const g = c.createLinearGradient(PX, 0, PX + 430, 0), a = (scene === 'how' && T < 46.5) ? 1 : clamp((cam.z - 1.03) / 0.1); g.addColorStop(0, `rgba(11,58,107,${0.97 * a})`); g.addColorStop(0.6, `rgba(11,58,107,${0.7 * a})`); g.addColorStop(1, 'rgba(11,58,107,0)'); c.fillStyle = g; c.fillRect(PX, PY, 430, PH); }
  txt(c, 'recorded from the live app, real Qloo data', PX + PW, 58, { size: 22, color: SOFT, align: 'right' });
  caps.forEach((k) => caption(c, T, k)); calls.forEach((k) => callout(c, cam, T, k));
}

// ------------------------------------------------------------------ scenes (t = local seconds, may run past the end during a transition)
const ringPos = (i, cx, cy, R) => { const a = -Math.PI / 2 + (i * TAU) / 5; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R, a]; };
const WORDS = [['Metallica', 'nightlife'], ['Bon Iver', 'quiet'], ['Parasite', 'hot pot'], ['Bluey', 'pizza'], ['thrift', 'tacos']];

function sceneCold(c, t) {
  bg(c);
  const sc = eo3(prog(t, 0.1, 1.3)); c.save(); c.strokeStyle = 'rgba(255,225,77,' + (0.9 * (1 - prog(t, 1.2, 1.5))) + ')'; c.lineWidth = 3; if (t < 1.5) { c.beginPath(); c.moveTo(sc * W, 0); c.lineTo(sc * W, H); c.stroke(); } c.restore();
  const cx = 960, cy = 455, R = 285;
  table(c, cx, cy, R * 0.55, eio(prog(t, 0.8, 2.4)), t * 0.05);
  for (let i = 0; i < 5; i++) {
    const [x, y] = ringPos(i, cx, cy, R), s = ebk(prog(t, 1.6 + 0.35 * i, 2.2 + 0.35 * i)), cosA = (x - cx) / R;
    seat(c, x, y, 54, i, { scale: s });
    txt(c, NAMES[i], x, y + 96, { size: 34, align: 'center', alpha: prog(t, 2.0 + 0.35 * i, 2.6 + 0.35 * i) });
    const side = cosA > 0.2 ? 1 : cosA < -0.2 ? -1 : 0;
    WORDS[i].forEach((w, k) => {
      const tt = 5.6 + 0.35 * i + k * 0.18, p = prog(t, tt, tt + 0.3), fl = Math.sin(t * 2 + i + k) * 4;
      const px = side ? x + side * 205 + (k ? side * 36 : 0) : x, py = side ? y + (k ? 34 : -22) + fl : y - 84 - (k ? 0 : 52) + fl;
      chip(c, w, px, py, { color: PCOL[i], alpha: p, scale: ebk(p), size: 28 });
    });
  }
  if (t > 3.6) slam(c, 'FIVE FRIENDS.', 960, 920, t, 3.6, { size: 112, align: 'center' });
  if (t > 5.0) slam(c, 'ONE SATURDAY NIGHT.', 960, 1036, t, 5.0, { size: 112, align: 'center', color: GOLD });
  const fadeOut = prog(t, 8.4, 9.0); if (fadeOut > 0) { c.fillStyle = `rgba(6,40,77,${fadeOut * 0.6})`; c.fillRect(0, 0, W, H); }
}

function sceneProblem(c, t) {
  bg(c);
  const e = (k) => E2[k] - 9, cx = 960, cy = 470, R = 300;
  const conv = eio(prog(t, e('conv') - 0.0, e('merge'))), burst = ebk(prog(t, e('burst'), e('burst') + 0.8)), burstOn = t >= e('burst');
  const grow = eio(prog(t, e('grow'), e('grow') + 1.2));
  txt(c, 'The usual ways to plan a night out', 960, 120, { size: 40, align: 'center', color: SOFT, alpha: prog(t, 0.3, 1.0) * (1 - prog(t, 5.2, 5.8)) });
  // beat A: average everyone
  const gray = prog(t, e('merge'), e('merge') + 1.4);
  if (!burstOn) {
    if (conv < 0.98) for (let i = 0; i < 5; i++) { const [x, y] = ringPos(i, cx, cy, R); seat(c, lerp(x, cx, conv), lerp(y, cy, conv), lerp(54, 36, conv), i, { alpha: 1 - gray * 0.0 }); }
    else { c.save(); const r = 86 + Math.sin(t * 6) * 2 * gray; c.translate(cx, cy); for (let i = 0; i < 5; i++) { c.fillStyle = mix(PCOL[i], '#8ea0b6', gray); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, (i * TAU) / 5 - Math.PI / 2, ((i + 1) * TAU) / 5 - Math.PI / 2); c.closePath(); c.fill(); } c.strokeStyle = 'rgba(237,244,255,0.6)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.restore(); }
    txt(c, 'the average', cx, cy + 150, { size: 44, align: 'center', alpha: prog(t, e('merge'), e('merge') + 0.6), color: SOFT });
    disp(c, typed("AVERAGE EVERYONE'S TASTE...", t, e('typeA'), 17), 960, 250, { size: 100, align: 'center' });
    if (t > e('loses')) slam(c, '...AND EVERYONE LOSES.', 960, 900, t, e('loses'), { size: 112, align: 'center', color: TENS });
  }
  // beat B: the loudest voice wins
  if (burstOn) {
    for (let i = 0; i < 5; i++) {
      const [x, y] = ringPos(i, cx, cy, R); const px = lerp(cx, x, burst), py = lerp(cy, y, burst);
      if (i === 0) { const gx = lerp(px, cx - 60, grow), gy = lerp(py, cy + 10, grow); seat(c, gx, gy, 54, 0, { scale: lerp(1, 2.7, grow) * Math.min(1, burst) }); }
      else { const fx = lerp(px, cx + (x - cx) * 1.25, grow), fy = lerp(py, cy + (y - cy) * 1.2, grow); seat(c, fx, fy, 54, i, { scale: lerp(1, 0.6, grow), alpha: lerp(1, 0.3, grow) }); }
    }
    disp(c, typed('OR LET THE LOUDEST VOICE WIN...', t, e('typeB'), 17), 960, 190, { size: 100, align: 'center', alpha: 1 - prog(t, 10.6, 11.0) });
    if (t > e('loudLoses')) slam(c, '...AND SOMEONE ALWAYS LOSES.', 960, 960, t, e('loudLoses'), { size: 112, align: 'center', color: TENS, alpha: 1 - prog(t, 10.6, 11.0) });
  }
  if (t > e('better')) { c.fillStyle = `rgba(6,40,77,${0.82 * prog(t, e('better'), e('better') + 0.2)})`; c.fillRect(0, 0, W, H); slam(c, "THERE'S A BETTER WAY.", 960, 590, t, e('better'), { size: 170, align: 'center', color: GOLD }); }
}

function sceneTitle(c, t) {
  bg(c);
  const y = 300, x0 = 330, x1 = 1590;
  const cable = prog(t, 0.2, 0.7) * (1 - prog(t, 4.4, 4.9)), truss = eio(prog(t, 2.6, 4.6));
  seat(c, x0, y, 70, 0, { scale: ebk(prog(t, 0, 0.5)) }); seat(c, x1, y, 70, 1, { scale: ebk(prog(t, 0.1, 0.6)) });
  txt(c, 'Maya wants loud', x0, y + 126, { size: 34, align: 'center', alpha: prog(t, 0.6, 1.0) }); txt(c, 'Dan wants quiet', x1, y + 126, { size: 34, align: 'center', alpha: prog(t, 0.7, 1.1) });
  span(c, x0 + 90, y, x1 - 90, y, t, { tension: cable, truss, label: truss > 0.6 ? 'bridged' : 'loud vs quiet' });
  if (t > 4.6) { const p = t - 4.6; c.fillStyle = `rgba(237,244,255,${0.35 * Math.exp(-p * 9)})`; c.fillRect(0, 0, W, H); }
  slam(c, 'TASTEBRIDGE GROUPS', 960, 700, t, 4.6, { size: 200, align: 'center' });
  txt(c, 'The taste diplomat for real-life plans.', 960, 800, { size: 58, weight: 500, align: 'center', color: GOLD, alpha: eo3(prog(t, 6.0, 6.6)) });
  chip(c, "Built on Qloo's Taste AI", 960, 905, { color: GOLD, size: 40, alpha: eo3(prog(t, 7.0, 7.4)), scale: ebk(prog(t, 7.0, 7.5)) });
}

const HOW_CAMS = [
  { t: 31, z: 1.0, fx: 800, fy: 450 }, { t: 33.6, z: 1.0, fx: 800, fy: 450 }, { t: 35.0, z: 1.5, fx: 1030, fy: 300 }, { t: 37.0, z: 1.45, fx: 1100, fy: 330 },
  { t: 39.8, z: 1.25, fx: 1030, fy: 470 }, { t: 46.5, z: 1.3, fx: 1057, fy: 440 }, { t: 50.4, z: 1.3, fx: 1057, fy: 440 }, { t: 51.4, z: 1.1, fx: 780, fy: 330 }, { t: 58, z: 1.0, fx: 800, fy: 450 }, { t: 61, z: 1.0, fx: 800, fy: 450 },
];
const HOW_CAPS = [
  { t0: 31.3, t1: 37.0, step: 1, top: 'Seat everyone. Add what each person loves.', bottom: "Point at a seat: the dots orbiting it are that person's tastes." },
  { t0: 37.0, t1: 40.0, step: 0, top: 'Name a guest of honor.', bottom: 'Their strong dislikes become vetoes, never just suggestions.' },
  { t0: 40.0, t1: 43.6, step: 2, top: 'The agent asks Qloo, not a guess.', bottom: 'Every taste is matched to a real Qloo entity, live, while you watch.' },
  { t0: 43.6, t1: 46.5, step: 3, top: 'Conflicts appear as cables under tension.', bottom: 'Loud vs quiet. Nightlife vs family. Expensive vs budget.' },
  { t0: 46.5, t1: 50.5, step: 4, top: 'Then the plan bridges them.', bottom: 'Each cable becomes a truss: a span the plan can actually carry.' },
  { t0: 50.5, t1: 61.0, step: 5, top: 'A verdict in plain language.', bottom: 'And exactly where your tastes pull apart.' },
];
const HOW_CALLS = [
  { t0: 35.2, t1: 36.9, x: 1057, y: 170, bx: 190, by: 640, lines: ["Maya's tastes: Metallica, Mad Max, Elden Ring, Korean BBQ"], color: PCOL[0] },
  { t0: 37.6, t1: 39.7, x: 1325, y: 325, bx: 190, by: 640, lines: ['Guest of honor: the dashed ring'], color: GOLD, w: 420 },
  { t0: 41.0, t1: 43.4, x: 1057, y: 470, bx: 190, by: 640, lines: ['Tastes resolved to real Qloo entities'], color: GOLD, w: 420 },
  { t0: 44.0, t1: 46.4, x: 1190, y: 250, bx: 190, by: 640, lines: ['Maya wants loud. Dan wants quiet.'], color: TENS, w: 420 },
  { t0: 47.2, t1: 50.3, x: 1190, y: 250, bx: 190, by: 640, lines: ['The same conflict, now bridged'], color: GOLD, w: 420 },
];
function sceneHow(c, T) { drawFootage(c, 'how', T, camera(HOW_CAMS, T), HOW_CAPS, HOW_CALLS); }

const BR_CAMS = [
  { t: 61, z: 1.1, fx: 800, fy: 400 }, { t: 66, z: 1.0, fx: 800, fy: 450 }, { t: 67.4, z: 1.22, fx: 800, fy: 640 }, { t: 71, z: 1.22, fx: 800, fy: 640 }, { t: 71.8, z: 1.2, fx: 1000, fy: 600 },
  { t: 75.0, z: 1.3, fx: 1020, fy: 650 }, { t: 81, z: 1.3, fx: 1020, fy: 650 }, { t: 81.6, z: 1.1, fx: 800, fy: 450 }, { t: 85, z: 1.1, fx: 800, fy: 450 },
];
const BR_CAPS = [
  { t0: 61.3, t1: 67.0, step: 0, top: 'The night, drawn as a bridge.', bottom: 'One pier per stop. A traveller walks the span and opens each stop.' },
  { t0: 67.0, t1: 75.0, step: 0, top: 'Every stop explains itself.', bottom: 'Why it fits. Who it serves. What it costs. The Qloo evidence.' },
  { t0: 75.0, t1: 81.0, step: 0, top: 'It shows its work.', bottom: "What it ruled out, and what a plain average would have picked." },
  { t0: 81.0, t1: 85.0, step: 0, top: 'Rebalance in one click.', bottom: 'Swap a stop. Everyone keeps their win. Every change is a logged revision.' },
];
const BR_CALLS = [
  { t0: 68.0, t1: 70.8, x: 1020, y: 570, bx: 190, by: 640, lines: ['The fairness formula, with the real numbers'], color: GOLD, w: 420 },
  { t0: 75.6, t1: 78.4, x: 1000, y: 618, bx: 190, by: 640, lines: ['Ruled out: closed at that hour, per Qloo’s own hours'], color: TENS, w: 440 },
  { t0: 78.4, t1: 80.9, x: 1000, y: 775, bx: 190, by: 640, lines: ['A plain average would have picked this instead'], color: GOLD, w: 440 },
];
function sceneBridge(c, T) { drawFootage(c, 'bridge', T, camera(BR_CAMS, T), BR_CAPS, BR_CALLS); }

const QL = [
  ['/search', 'Mad Max becomes a real Qloo entity, with its tags'],
  ['/v2/tags', 'Foods and vibes, and the right kind of venue for each stop'],
  ['/v2/insights', "What each person would love in this city, at this price"],
  ['filter.results.entities + explainability', 'Every venue scored for every person, and which anchor drove it'],
];
function sceneQloo(c, t) {
  const T = 85 + t;
  if (T >= 94.7) { // the with/without footage
    const w = prog(T, 94.7, 95.3);
    const cam = { z: 1.05, fx: 800, fy: 470 };
    drawFootage(c, 'qloo', T, cam, [{ t0: 95.2, t1: 101, step: 0, top: 'Same group. Planned two ways.', bottom: 'On the right: a generic recommender. No entities. No affinity scores. No conflicts.' }], [
      { t0: 96.4, t1: 98.4, x: 1120, y: 500, bx: 190, by: 640, lines: ['Qloo plan: real venues, scores, reasons'], color: GOLD, w: 420 },
      { t0: 98.8, t1: 100.9, x: 1250, y: 640, bx: 1100, by: 190, lines: ['Generic: nothing you can check'], color: TENS, w: 420 }]);
    if (w < 1) { c.save(); c.beginPath(); c.rect(0, 0, W * (1 - eo3(w)), H); c.clip(); sceneQlooDiagram(c, t); c.restore(); c.fillStyle = GOLD; c.fillRect(W * (1 - eo3(w)) - 3, 0, 6, H); }
    return;
  }
  sceneQlooDiagram(c, t);
}
function sceneQlooDiagram(c, t) {
  bg(c);
  slam(c, 'HOW QLOO POWERS EVERY DECISION', 120, 170, t, 0.4, { size: 96 });
  QL.forEach(([ep, desc], i) => {
    const t0 = 1.6 + 1.7 * i, a = eo3(prog(t, t0, t0 + 0.4)), y = 270 + i * 150;
    c.save(); c.globalAlpha *= a; c.translate(lerp(-80, 0, a), 0);
    panel(c, 120, y, 760, 118, { border: GOLD }); txt(c, ep, 150, y + 74, { size: ep.length > 20 ? 31 : 42, weight: 700, color: GOLD });
    c.restore();
    const pk = prog(t, t0 + 0.5, t0 + 1.1);
    c.strokeStyle = 'rgba(237,244,255,0.7)'; c.lineWidth = 3; c.beginPath(); c.moveTo(900, y + 59); c.lineTo(900 + 110 * eo3(prog(t, t0 + 0.3, t0 + 0.9)), y + 59); c.stroke();
    if (pk > 0 && pk < 1) { c.fillStyle = GOLD; c.beginPath(); c.arc(900 + 110 * pk, y + 59, 9, 0, TAU); c.fill(); }
    const d = eo3(prog(t, t0 + 0.9, t0 + 1.4)); const lines = wrap(c, desc, 760, 38, 500);
    lines.forEach((l, k) => txt(c, l, 1040, y + 54 + k * 44 - (lines.length - 1) * 20, { size: 38, weight: 500, alpha: d }));
  });
  const s = "Take Qloo away and there's no venue, no affinity score, no conflict.";
  txt(c, typed(s, t, 8.0, 38), 120, 960, { size: 54, weight: 700, color: CHALK });
  if (t > 9.8) { c.fillStyle = `rgba(255,225,77,${0.9 * Math.exp(-(t - 9.8) * 6)})`; c.fillRect(110, 905, 1700, 8); }
}

function sceneStand(c, t) {
  bg(c);
  const intro = eio(prog(t, 2.0, 2.8));
  slam(c, 'WHAT MAKES IT DIFFERENT', lerp(960, 120, intro), lerp(560, 130, intro), t, 0.4, { size: lerp(170, 64, intro), align: intro > 0.5 ? 'left' : 'center', alpha: 1 - 0 });
  const B = [2.0, 7.2, 12.4], beat = (i) => t >= B[i] && t < (i < 2 ? B[i + 1] : 17.4);
  const vis = (i) => (i === 2 ? eo3(prog(t, B[i], B[i] + 0.4)) * (1 - prog(t, 17.0, 17.4)) : eo3(prog(t, B[i], B[i] + 0.4)) * (1 - prog(t, B[i + 1] - 0.3, B[i + 1])));
  // beat 1
  if (beat(0)) {
    const a = vis(0); c.save(); c.globalAlpha *= a;
    slam(c, 'CONFLICTS ARE', 120, 470, t, 2.0, { size: 130 }); slam(c, 'BRIDGED, NOT', 120, 600, t, 2.2, { size: 130, color: GOLD }); slam(c, 'AVERAGED.', 120, 730, t, 2.4, { size: 130, color: GOLD });
    seat(c, 1120, 540, 62, 0); seat(c, 1700, 540, 62, 1);
    span(c, 1200, 540, 1620, 540, t, { tension: prog(t, 2.2, 2.5) * (1 - prog(t, 5.0, 5.4)), truss: eio(prog(t, 4.2, 5.2)), label: t > 5.0 ? 'bridged' : 'loud vs quiet', seed: 3 });
    c.restore();
  }
  if (beat(1)) {
    const a = vis(1); c.save(); c.globalAlpha *= a;
    slam(c, 'EVERYONE GETS', 120, 470, t, 7.2, { size: 118 }); slam(c, 'A STOP THAT’S', 120, 590, t, 7.3, { size: 118 }); slam(c, 'THEIRS.', 120, 710, t, 7.4, { size: 118, color: GOLD });
    for (let i = 0; i < 5; i++) {
      const x = 1090 + i * 150, y = 420, tt = 9.2 + 0.35 * i, p = eo3(prog(t, tt, tt + 0.4));
      seat(c, x, y, 44, i, { scale: ebk(prog(t, 8.2 + i * 0.1, 8.7 + i * 0.1)) });
      c.fillStyle = 'rgba(6,40,77,0.9)'; c.strokeStyle = 'rgba(237,244,255,0.5)'; c.lineWidth = 2; c.fillRect(x - 40, 640, 80, 60); c.strokeRect(x - 40, 640, 80, 60);
      txt(c, i < 4 ? `stop ${i + 1}` : 'encore', x, 676, { size: 24, align: 'center', color: SOFT });
      if (p > 0) { c.strokeStyle = PCOL[i]; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y + 48); c.lineTo(x, y + 48 + 172 * p); c.stroke(); if (p > 0.95 && i !== 4) { c.strokeStyle = PCOL[i]; c.lineWidth = 5; c.strokeRect(x - 44, 636, 88, 68); } }
    }
    const cf = eo3(prog(t, 11.4, 11.9)); c.strokeStyle = TENS; c.setLineDash([10, 8]); c.lineWidth = 4; c.globalAlpha *= 1; c.beginPath(); c.arc(1090 + 4 * 150, 420, 56 * cf, 0, TAU); c.stroke(); c.setLineDash([]);
    chip(c, "or an honest 'closest fit'", 1390, 790, { color: TENS, size: 36, alpha: cf, scale: ebk(prog(t, 11.4, 11.9)) });
    c.restore();
  }
  if (beat(2)) {
    const a = vis(2); c.save(); c.globalAlpha *= a;
    slam(c, 'IT SHOWS', 120, 470, t, 12.4, { size: 140 }); slam(c, 'ITS WORK.', 120, 610, t, 12.6, { size: 140, color: GOLD });
    panel(c, 940, 330, 880, 400, { border: CHALK });
    const rows = [['Birdland Jazz Club', "closed at 9:30, per Qloo's hours", 14.6], ['A plain average picks Battery Gardens', 'closed at 11:00, per Qloo’s hours', 16.0]];
    rows.forEach(([a1, b1, tt], i) => { const y = 410 + i * 130, p = eo3(prog(t, tt - 1.0, tt - 0.5)); txt(c, a1, 980, y, { size: 44, weight: 700, alpha: p }); txt(c, b1, 980, y + 46, { size: 32, color: SOFT, alpha: p }); const s = eo3(prog(t, tt, tt + 0.25)); if (s > 0) { c.strokeStyle = TENS; c.lineWidth = 7; c.beginPath(); c.moveTo(970, y - 14); c.lineTo(970 + 820 * s, y - 14); c.stroke(); } });
    const ok = eo3(prog(t, 16.7, 17.1)); txt(c, 'Chosen: The Rum House, open until 2 AM', 980, 665, { size: 40, weight: 700, color: GOLD, alpha: ok });
    c.restore();
  }
  if (t > 17.4) { const p = prog(t, 17.4, 17.9); c.fillStyle = `rgba(6,40,77,${0.9 * p})`; c.fillRect(0, 0, W, H); }
  if (t > 17.9) { slam(c, 'NOT A RECOMMENDATION.', 960, 500, t, 17.9, { size: 140, align: 'center' }); slam(c, 'A NEGOTIATION YOU CAN AUDIT.', 960, 660, t, 18.1, { size: 140, align: 'center', color: GOLD }); }
}

const TILES = [
  ['Live agent trace', 'Streams every plan, resolve, retry and score'], ['Opening-hours aware', 'Rules out closed venues and says why'], ['One-click rebalance', 'Swap a stop, keep every win, log the revision'],
  ['With vs without Qloo', 'Same group, side by side, scored'], ['Two-person mode', 'The original TasteBridge, kept'], ['CLI and MCP server', 'Four tools, including plan_group_outing'],
  ['Key stays on the server', 'Cached, rate-limited, retried, never exposed'], ['Sample-data mode', 'Clearly labelled whenever there is no key'], ['72 tests + evals', 'Measured, not claimed'],
];
function sceneAddons(c, t) {
  bg(c);
  slam(c, 'AND EVERYTHING AROUND IT', 960, 170, t, 0.5, { size: 110, align: 'center' });
  TILES.forEach(([h, d], i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 80 + col * 600, y = 260 + row * 250, t0 = 1.8 + 0.85 * i, p = ebk(prog(t, t0, t0 + 0.5)), a = prog(t, t0, t0 + 0.25);
    if (a <= 0) return;
    c.save(); c.translate(x + 280, y + 105); c.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p); c.globalAlpha *= a; c.translate(-280, -105);
    panel(c, 0, 0, 560, 210, { border: i % 2 ? CHALK : GOLD }); c.fillStyle = i % 2 ? CHALK : GOLD; c.fillRect(0, 0, 8, 210);
    disp(c, h, 36, 86, { size: 54, weight: 800 }); wrap(c, d, 490, 32).forEach((l, k) => txt(c, l, 36, 136 + k * 40, { size: 32, weight: 500, color: SOFT }));
    c.restore();
  });
  const sw = prog(t, 10.2, 12.2); if (sw > 0 && sw < 1) { c.save(); c.strokeStyle = GOLD; c.lineWidth = 5; c.globalAlpha *= 1 - Math.abs(sw - 0.5) * 1.2; const x = 80 + sw * 1760; c.beginPath(); c.moveTo(x, 250); c.lineTo(x, 1010); c.stroke(); c.restore(); }
}

function sceneProof(c, t) {
  bg(c);
  slam(c, 'MEASURED, NOT CLAIMED', 960, 160, t, 0.5, { size: 110, align: 'center' });
  const dim = 1 - 0.65 * eo3(prog(t, 7.4, 7.9));
  c.save(); c.globalAlpha *= dim;
  const col = (x, big, label, sub, color = GOLD, a = 1) => { disp(c, big, x, 560, { size: 240, align: 'center', color, alpha: a }); txt(c, label, x, 630, { size: 44, weight: 700, align: 'center', alpha: a }); wrap(c, sub, 480, 30).forEach((l, i) => txt(c, l, x, 684 + i * 38, { size: 30, color: SOFT, align: 'center', alpha: a })); };
  col(340, String(Math.round(eo3(prog(t, 1.5, 3.1)) * 60)), 'random groups', '2 to 8 people, 254 stops, sample data', GOLD, prog(t, 1.4, 1.8));
  const a2 = prog(t, 3.2, 3.6); const ba = eo3(prog(t, 3.2, 4.3));
  disp(c, '0', 960, 560, { size: 240, align: 'center', color: GOLD, alpha: a2 }); txt(c, 'broken rules', 960, 630, { size: 44, weight: 700, align: 'center', alpha: a2 });
  c.fillStyle = TENS; c.fillRect(760, 700, 400 * ba * 0.08 * 12.5 * 0.08 * 1.0 + 10, 28); txt(c, 'a plain average ranker: about 8% of stops', 960, 770, { size: 30, align: 'center', color: SOFT, alpha: a2 });
  const pc = Math.round(eo3(prog(t, 4.4, 5.6)) * 100);
  col(1580, `${pc}%`, 'everyone covered', 'a win, or an honest closest fit, in every group', GOLD, prog(t, 4.3, 4.7));
  c.restore();
  if (t > 7.4) {
    const p = eo3(prog(t, 7.4, 8.0)); panel(c, 260, 290, 1400, 560, { border: GOLD, fill: 'rgba(6,40,77,0.97)', alpha: p });
    disp(c, 'AN HONEST LIMIT', 960, 420, { size: 110, align: 'center', color: GOLD, alpha: p });
    const s = 'Average fit is level with a plain ranker: 61.4% against 61.7%. The gain is rules kept, fewer people left behind, and reasoning you can see.';
    wrap(c, typed(s, t, 8.4, 32), 1260, 50, 500).forEach((l, i) => txt(c, l, 960, 520 + i * 66, { size: 50, weight: 500, align: 'center', alpha: p }));
  }
}

function sceneClose(c, t) {
  bg(c);
  const p = eio(prog(t, 0, 1.8)), y = 330;
  c.save(); c.lineWidth = 4; c.strokeStyle = CHALK; c.lineCap = 'round';
  c.beginPath(); c.moveTo(100, y); c.lineTo(100 + 1720 * p, y); c.stroke();
  const xs = [260, 740, 1220, 1700];
  for (let i = 0; i < 3; i++) { const a = prog(p, i / 3, (i + 1) / 3); c.beginPath(); c.moveTo(xs[i], y); c.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, y - 190, xs[i] + (xs[i + 1] - xs[i]) * a, y - 190 * 2 * a * (1 - a)); c.stroke(); }
  xs.forEach((x, i) => { const a = prog(t, 0.4 + i * 0.3, 0.9 + i * 0.3); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 150 * eo3(a)); c.stroke(); c.fillStyle = BP; c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); c.stroke(); });
  c.restore();
  if (t > 1.0) { const q = t - 1.0; c.fillStyle = `rgba(237,244,255,${0.3 * Math.exp(-q * 9)})`; c.fillRect(0, 0, W, H); }
  slam(c, 'NOBODY LOSES.', 960, 700, t, 1.0, { size: 250, align: 'center' });
  txt(c, typed('tastebridge-groups.onrender.com', t, 3.2, 20), 960, 810, { size: 70, weight: 700, align: 'center', color: GOLD });
  txt(c, typed('github.com/jenish1345/TasteBridge-Groups', t, 4.7, 24), 960, 890, { size: 46, weight: 500, align: 'center', color: CHALK });
  txt(c, 'Not a recommendation. A negotiation you can audit.', 960, 975, { size: 40, weight: 500, align: 'center', color: SOFT, alpha: eo3(prog(t, 6.0, 6.6)) });
  const f = prog(t, 8.2, 9.0); if (f > 0) { c.fillStyle = `rgba(4,22,44,${f})`; c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ composition
const SCENES = { cold: sceneCold, problem: sceneProblem, title: sceneTitle, how: (c, t) => sceneHow(c, S.how[0] + t), bridge: (c, t) => sceneBridge(c, S.bridge[0] + t), qloo: sceneQloo, stand: sceneStand, addons: sceneAddons, proof: sceneProof, close: sceneClose };
const ORDER = Object.keys(S);
const sceneAt = (T) => ORDER.find((k) => T >= S[k][0] && T < S[k][1]) ?? ORDER[ORDER.length - 1];
function drawScene(c, name, T) { c.save(); c.clearRect(0, 0, W, H); SCENES[name](c, Math.max(0, T - S[name][0])); c.restore(); }
function neededFootage(T) {
  const names = new Set([sceneAt(T)]);
  for (const tr of TRANS) if (Math.abs(T - tr.at) <= tr.d / 2 + 0.05) { names.add(sceneAt(tr.at - 0.01)); names.add(sceneAt(tr.at + 0.01)); }
  const out = [];
  for (const n of names) if (n === 'how' || n === 'bridge' || (n === 'qloo' && T >= 94.4)) out.push(fidx(n, Math.min(Math.max(T, S[n][0]), S[n][1] - 0.001)));
  return out;
}

function transition(T, tr) {
  const a = sceneAt(tr.at - 0.01), b = sceneAt(tr.at + 0.01), p = eio((T - (tr.at - tr.d / 2)) / tr.d);
  drawScene(gA, a, Math.min(T, S[a][1] + 0.6)); drawScene(gB, b, Math.max(T, S[b][0]));
  const c = ctx; c.drawImage(cA, 0, 0);
  if (tr.type === 'iris') {
    c.save(); c.beginPath(); c.arc(W / 2, H / 2, p * 1250, 0, TAU); c.clip(); c.drawImage(cB, 0, 0); c.restore();
    c.strokeStyle = GOLD; c.lineWidth = 8; c.beginPath(); c.arc(W / 2, H / 2, p * 1250, 0, TAU); c.stroke();
  } else if (tr.type === 'wipe') {
    const x = lerp(-300, W + 300, p), sk = 260; c.save(); c.beginPath(); c.moveTo(0, 0); c.lineTo(x, 0); c.lineTo(x - sk, H); c.lineTo(0, H); c.closePath(); c.clip(); c.drawImage(cB, 0, 0); c.restore();
    c.strokeStyle = GOLD; c.lineWidth = 10; c.beginPath(); c.moveTo(x, 0); c.lineTo(x - sk, H); c.stroke();
  } else if (tr.type === 'slats') {
    const n = 16, sw = W / n; for (let k = 0; k < n; k++) { const sp = eo3(clamp(p * 1.7 - (k / n) * 0.7)); c.save(); c.beginPath(); c.rect(k * sw, 0, sw + 1, H * sp); c.clip(); c.drawImage(cB, 0, 0); c.restore(); if (sp > 0 && sp < 1) { c.fillStyle = GOLD; c.fillRect(k * sw, H * sp - 4, sw, 6); } }
  } else if (tr.type === 'glitch') {
    c.clearRect(0, 0, W, H); c.drawImage(p < 0.5 ? cA : cB, 0, 0);
    const r = rng(Math.floor(T * FPS) * 977 + 13), amp = Math.sin(p * Math.PI);
    for (let k = 0; k < 18; k++) { const y = Math.floor(r() * H), h = 20 + Math.floor(r() * 90), off = (r() - 0.5) * 360 * amp, src = p < 0.5 ? cA : cB; c.drawImage(src, 0, y, W, h, off, y, W, h); }
    c.fillStyle = `rgba(255,91,58,${0.1 * amp})`; c.fillRect(0, 0, W, H);
  }
}


// ------------------------------------------------------------------ voiceover captions: a drafting-board title block with a gold dimension line that walks under each word as it is spoken
let VOL = [];
const prepVO = (ln) => {
  const words = ln.text.split(/\s+/), wt = words.map((w) => w.replace(/[^\w']/g, '').length + 1.5 + (/[.?!:;]$/.test(w) ? 3 : /[,]$/.test(w) ? 1.5 : 0) + (/\.\.\.$/.test(w) ? 2 : 0));
  const total = wt.reduce((a, b) => a + b, 0), span = ln.dur * 0.97; let acc = 0;
  const ws = words.map((w, i) => { const a = ln.t + (acc / total) * span; acc += wt[i]; return { w, a, b: ln.t + (acc / total) * span }; });
  const chunks = []; let cur = [];
  for (const k of ws) { const len = cur.reduce((n, x) => n + x.w.length + 1, 0); if (cur.length && len + k.w.length > 42) { chunks.push(cur); cur = []; } cur.push(k); if (/[.?!:]$/.test(k.w) && cur.length >= 3) { chunks.push(cur); cur = []; } }
  if (cur.length) { if (cur.length < 2 && chunks.length) chunks[chunks.length - 1].push(...cur); else chunks.push(cur); }
  return { ...ln, chunks: chunks.map((words, i) => ({ words, a: words[0].a, b: i + 1 < chunks.length ? chunks[i + 1][0].a : ln.t + ln.dur + 0.3 })) };
};
function drawCaption(c, T) {
  for (const ln of VOL) {
    if (ln.nocap || T < ln.t - 0.05 || T > ln.t + ln.dur + 0.4) continue;
    const ch = ln.chunks.find((k) => T >= k.a - 0.05 && T < k.b); if (!ch) continue;
    const inn = eo3((T - (ch.a - 0.05)) / 0.2), out = 1 - eo3((T - (ch.b - 0.22)) / 0.22), a = Math.min(inn, ch === ln.chunks[ln.chunks.length - 1] ? out : 1);
    if (a <= 0.01) continue;
    c.save(); c.globalAlpha *= a; c.font = `600 46px ${TEXT}`; c.textBaseline = 'alphabetic';
    const sp = c.measureText(' ').width, ww = ch.words.map((k) => c.measureText(k.w).width), tw = ww.reduce((x, y) => x + y, 0) + sp * (ww.length - 1);
    const pw = tw + 110, ph = 76, x0 = 960 - pw / 2, y0 = 996 + (1 - inn) * 16;
    c.fillStyle = 'rgba(6,40,77,0.93)'; c.fillRect(x0, y0, pw, ph); c.strokeStyle = 'rgba(237,244,255,0.75)'; c.lineWidth = 2; c.strokeRect(x0, y0, pw, ph);
    c.fillStyle = GOLD; c.fillRect(x0, y0, 10, ph);
    for (const [px, py, sx, sy] of [[x0 + pw, y0, -1, 1], [x0 + pw, y0 + ph, -1, -1]]) { c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.moveTo(px + sx * 22, py); c.lineTo(px, py); c.lineTo(px, py + sy * 22); c.stroke(); }
    let x = x0 + 55; const by = y0 + 50;
    ch.words.forEach((k, i) => {
      const state = T >= k.b ? 2 : T >= k.a ? 1 : 0;
      c.fillStyle = state === 1 ? GOLD : state === 2 ? CHALK : 'rgba(169,195,230,0.62)';
      c.fillText(k.w, x, by - (state === 1 ? 2 : 0));
      if (state === 1) { const p = prog(T, k.a, k.b), e = x + ww[i] * p; c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y0 + ph - 11); c.lineTo(e, y0 + ph - 11); c.stroke(); c.beginPath(); c.moveTo(x, y0 + ph - 17); c.lineTo(x, y0 + ph - 5); c.moveTo(e, y0 + ph - 17); c.lineTo(e, y0 + ph - 5); c.stroke(); }
      x += ww[i] + sp;
    });
    c.restore();
  }
}

function compose(T) {
  const tr = TRANS.find((x) => T >= x.at - x.d / 2 && T < x.at + x.d / 2);
  if (tr) transition(T, tr); else { ctx.clearRect(0, 0, W, H); drawScene(ctx, sceneAt(T), T); }
  // impacts: a short shake and flash
  let sx = 0, sy = 0, fl = 0;
  for (const h of HITS) { const d = T - h; if (d >= 0 && d < 0.45) { const k = Math.exp(-d * 13); sx += Math.sin(d * 120) * 13 * k; sy += Math.cos(d * 97) * 9 * k; fl += 0.1 * k; } }
  if (sx || sy) { const oc = scratch(); oc.getContext('2d').clearRect(0, 0, W, H); oc.getContext('2d').drawImage(cv, 0, 0); ctx.fillStyle = BP3; ctx.fillRect(0, 0, W, H); ctx.drawImage(oc, sx, sy); }
  if (fl > 0.01) { ctx.fillStyle = `rgba(237,244,255,${Math.min(0.18, fl)})`; ctx.fillRect(0, 0, W, H); }
  drawCaption(ctx, T);
}
let _o; const scratch = () => (_o ??= mk());

window.setFrameCount = (n) => { FRAME_COUNT = n; };
window.renderFrame = async (f) => { const T = f / FPS; await Promise.all(neededFootage(T).map(ensure)); compose(T); return true; };
window.ready = Promise.all([
  fetch('/out/vo.json').then((r) => (r.ok ? r.json() : [])).then((j) => { VOL = j.map(prepVO); }),
  fetch('/footage/marks.json').then((r) => r.json()).then((j) => { setMarks(j.marks); FRAME_COUNT = j.frames; }),
  document.fonts.load('900 100px "Big Shoulders Display"'), document.fonts.load('800 100px "Big Shoulders Display"'), document.fonts.load('600 40px "Familjen Grotesk"'), document.fonts.load('500 40px "Familjen Grotesk"'), document.fonts.load('700 40px "Familjen Grotesk"'),
]).then(() => document.fonts.ready).then(() => true);
