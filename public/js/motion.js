// Motion primitives: springs, one shared frame loop, count-up numbers, and the drafting crosshair cursor.
import { $ } from './util.js';

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Spring {
  constructor(x = 0, { k = 170, d = 18 } = {}) { this.x = x; this.v = 0; this.t = x; this.k = k; this.d = d; }
  step(dt) {
    const sub = Math.max(1, Math.ceil(dt / 0.008)); const h = dt / sub;
    for (let i = 0; i < sub; i++) { this.v += (-this.k * (this.x - this.t) - this.d * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  snap(x) { this.x = this.t = x; this.v = 0; }
}

const subs = new Set();
let last = 0;
export const onFrame = (fn) => { subs.add(fn); return () => subs.delete(fn); };
requestAnimationFrame(function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  subs.forEach((f) => f(dt, ts / 1000));
  requestAnimationFrame(tick);
});

export function countUp(el, to, { dur = 1200, dec = 0, from = 0 } = {}) {
  if (!el) return;
  if (reduced) { el.textContent = to.toFixed(dec); return; }
  const t0 = performance.now();
  const f = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = (from + (to - from) * e).toFixed(dec);
    if (p < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

/** Run fn the first time `el` is at least `threshold` visible. */
export function onceVisible(el, fn, threshold = 0.25) {
  if (!el) return;
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold });
  io.observe(el);
}

/**
 * Drafting crosshair. It follows the pointer, and when you point at something interactive its corner brackets
 * spring out to frame that element, like a viewfinder locking on.
 */
export function initCrosshair() {
  const x = $('#xhair');
  if (!x || matchMedia('(pointer: coarse)').matches) return;
  document.body.classList.add('has-xhair');
  const sx = new Spring(innerWidth / 2, { k: 420, d: 30 }), sy = new Spring(innerHeight / 2, { k: 420, d: 30 });
  const sw = new Spring(26, { k: 300, d: 24 }), sh = new Spring(26, { k: 300, d: 24 });
  let px = innerWidth / 2, py = innerHeight / 2, box = null;
  addEventListener('pointermove', (e) => {
    px = e.clientX; py = e.clientY;
    const el = e.target.closest?.('[data-snap],button:not([disabled]),a[href],summary,[role=tab],select,.pill,.seat');
    const r = el?.getBoundingClientRect();
    box = r && r.width < 440 && r.height < 220 ? r : null;
    x.classList.toggle('snap', !!box);
    if (el) x.style.setProperty('--snap', getComputedStyle(el).getPropertyValue('--c').trim() || '');
  }, { passive: true });
  addEventListener('pointerdown', () => x.classList.add('down'));
  addEventListener('pointerup', () => x.classList.remove('down'));
  document.addEventListener('pointerleave', () => (x.style.opacity = 0));
  document.addEventListener('pointerenter', () => (x.style.opacity = 1));
  onFrame((dt) => {
    sx.t = box ? box.left + box.width / 2 : px; sy.t = box ? box.top + box.height / 2 : py;
    sw.t = box ? box.width + 12 : 26; sh.t = box ? box.height + 12 : 26;
    sx.step(dt); sy.step(dt); sw.step(dt); sh.step(dt);
    x.style.transform = `translate(${sx.x}px, ${sy.x}px)`;
    x.style.setProperty('--w', `${Math.max(14, sw.x)}px`);
    x.style.setProperty('--h', `${Math.max(14, sh.x)}px`);
  });
}

/** The page lamp: a soft light that follows the pointer across the drawing board. */
export function initLamp() {
  if (reduced) return;
  let tx = 0.6, ty = 0.3, x = tx, y = ty;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; }, { passive: true });
  onFrame(() => { x += (tx - x) * 0.06; y += (ty - y) * 0.06; document.documentElement.style.setProperty('--lx', `${x * 100}%`); document.documentElement.style.setProperty('--ly', `${y * 100}%`); });
}
