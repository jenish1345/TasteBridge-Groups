// The Table: a plan-view drawing of the group. Canvas draws the linework; seats are real buttons on top of it.
//  - anchors orbit each seat
//  - while the agent works, resolved entities fly into the table and become survey points
//  - conflicts are cables under tension between two seats; once the plan resolves them they turn into trusses
import { COLORS, HATCH, clamp, esc, initial, lerp, AXIS } from './util.js';
import { Spring, countUp, onFrame, reduced } from './motion.js';

const TAU = Math.PI * 2;
const CHALK = '237,244,255';
const TENSION = '255,91,58';
const FONT = '"Familjen Grotesk", system-ui, sans-serif';
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export class TableScene {
  constructor(root, { layout = 'ring', max = 8, onSeat, onAdd, tip } = {}) {
    this.root = root; this.layout = layout; this.max = layout === 'duel' ? 2 : max;
    this.onSeat = onSeat; this.onAdd = onAdd; this.tip = tip;
    root.classList.add('scene', `scene-${layout}`);
    root.innerHTML = `<canvas class="sc-canvas" aria-hidden="true"></canvas><div class="sc-seats"></div><div class="sc-plate" aria-live="polite"></div>`;
    this.cv = root.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.seatsEl = root.querySelector('.sc-seats'); this.plateEl = root.querySelector('.sc-plate');
    this.seats = []; this.people = []; this.ghost = null;
    this.conflicts = []; this.effects = []; this.marks = []; this.distances = null; this.unres = new Set();
    this.t = 0; this.intro = reduced ? 1 : 0; this.mode = 'idle'; this.absorbed = 0; this.hover = -1; this.focusId = null;
    this.ptr = { x: 0, y: 0, in: false }; this.visible = true; this.w = 0; this.h = 0; this.cx = 0; this.cy = 0; this.R = 100;
    this.spin = 0;
    new ResizeObserver(() => this.#resize()).observe(root);
    new IntersectionObserver((es) => (this.visible = es[0].isIntersecting)).observe(root);
    root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); this.ptr = { x: e.clientX - r.left, y: e.clientY - r.top, in: true }; }, { passive: true });
    root.addEventListener('pointerleave', () => (this.ptr.in = false));
    this.#ghost();
    this.setPlate('idle');
    this.#resize();
    this.off = onFrame((dt, t) => this.#frame(dt, t));
  }

  // ------------------------------------------------------------------ people / seats
  setPeople(people) {
    this.people = people;
    const byId = new Map(this.seats.map((s) => [s.p.id, s]));
    const next = [];
    people.forEach((p, i) => {
      let s = byId.get(p.id);
      if (!s) s = this.#mkSeat(p, i); else byId.delete(p.id);
      s.p = p; s.i = i; next.push(s);
    });
    byId.forEach((s) => this.#killSeat(s));
    this.seats = next;
    this.seats.forEach((s) => this.#paint(s));
    this.#retarget();
    if (this.ghost) this.ghost.el.hidden = this.seats.length >= this.max;
  }

  #slots() { return this.layout === 'duel' ? 2 : Math.min(this.seats.length + 1, this.max); }
  #angleOf(k) {
    if (this.layout === 'duel') return k === 0 ? Math.PI : 0;
    const n = this.#slots();
    return -Math.PI / 2 + (TAU * k) / n;
  }
  #retarget() {
    this.seats.forEach((s, k) => (s.ang.t = this.#angleOf(k)));
    if (this.ghost) this.ghost.ang.t = this.#angleOf(this.seats.length);
  }

  #mkSeat(p, i) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'seat';
    el.innerHTML = `<span class="orb"><b></b><i class="ring2"></i></span><span class="nm"></span><span class="wins" hidden></span>`;
    el.addEventListener('click', () => this.onSeat?.(this.seats.findIndex((s) => s.el === el), el));
    el.addEventListener('pointerenter', () => (this.hover = this.seats.findIndex((s) => s.el === el)));
    el.addEventListener('pointerleave', () => (this.hover = -1));
    el.addEventListener('focus', () => (this.hover = this.seats.findIndex((s) => s.el === el)));
    el.addEventListener('blur', () => (this.hover = -1));
    this.seatsEl.appendChild(el);
    const start = this.ghost ? this.ghost.ang.x : this.#angleOf(i);
    const s = { p, i, el, ang: new Spring(start, { k: 90, d: 15 }), pop: new Spring(reduced ? 1 : 0, { k: 160, d: 14 }), ph: [], sp: [], flash: 0, orbR: new Spring(0, { k: 120, d: 14 }) };
    s.pop.t = 1;
    setTimeout(() => el.classList.add('in'), reduced ? 0 : 450 + i * 110);
    return s;
  }
  #killSeat(s) {
    s.dead = true; s.pop.t = 0; s.el.classList.add('leave'); s.el.disabled = true;
    setTimeout(() => s.el.remove(), 380);
  }
  #paint(s) {
    const i = s.i, c = COLORS[i % COLORS.length];
    s.el.style.setProperty('--c', c); s.el.style.setProperty('--hatch', `${HATCH[i % HATCH.length]}deg`);
    s.el.querySelector('b').textContent = initial(s.p.name);
    s.el.querySelector('.nm').textContent = s.p.name || 'Guest';
    s.el.classList.toggle('key', !!s.p.isKey);
    s.el.setAttribute('aria-label', `${s.p.name || 'Guest'}${s.p.isKey ? ', guest of honor' : ''}, ${s.p.anchors.length} taste anchors. Edit.`);
    while (s.ph.length < 10) { s.ph.push(Math.random() * TAU); s.sp.push((0.35 + Math.random() * 0.55) * (s.ph.length % 2 ? 1 : -1)); }
  }
  #ghost() {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'seat ghost'; el.setAttribute('aria-label', 'Add a guest to the table');
    el.innerHTML = `<span class="orb"><b>+</b></span><span class="nm">Add guest</span>`;
    el.addEventListener('click', () => this.onAdd?.());
    this.seatsEl.appendChild(el);
    this.ghost = { el, ang: new Spring(-Math.PI / 2, { k: 90, d: 15 }) };
    setTimeout(() => el.classList.add('in'), reduced ? 0 : 1300);
    if (this.layout === 'duel') el.hidden = true;
  }

  /** Update the wins badge on each seat after a plan. */
  setWins(map) {
    this.seats.forEach((s) => {
      const n = map?.[s.p.id]?.length || 0;
      const b = s.el.querySelector('.wins');
      b.hidden = !n; b.textContent = n ? `${n}` : '';
      b.title = n ? `${n} personal win${n > 1 ? 's' : ''}` : '';
    });
  }
  setUnresolved(list) { this.unres = new Set(list.map((u) => `${u.personId}|${u.anchor}`)); }
  setDistances(d) { this.distances = d; this.distT = 0; }

  // ------------------------------------------------------------------ the negotiation
  begin() { this.mode = 'working'; this.absorbed = 0; this.marks = []; this.conflicts = []; this.distances = null; this.setPlate('working'); this.root.classList.add('working'); }
  abort() { this.mode = 'idle'; this.root.classList.remove('working'); this.setPlate('idle'); }
  finish(summary) { this.mode = 'done'; this.root.classList.remove('working'); this.bridgeAll(); this.setPlate('done', summary); }

  seatByName(name) { return this.seats.find((s) => s.p.name === name); }
  addConflict({ a, b, label, level, text }) {
    const sa = this.seats.find((s) => s.p.id === a), sb = this.seats.find((s) => s.p.id === b);
    if (!sa || !sb || sa === sb) return;
    const dup = this.conflicts.filter((c) => (c.a === sa && c.b === sb) || (c.a === sb && c.b === sa)).length;
    if (this.conflicts.some((c) => c.label === label)) return;
    this.conflicts.push({ a: sa, b: sb, label, level, text, idx: dup, born: this.t, br: 0, bridging: false });
  }
  bridgeAll() { this.conflicts.forEach((c) => (c.bridging = true)); }
  clearConflicts() { this.conflicts = []; }

  flyIn(seat, label) {
    if (!seat) return;
    if (reduced) { this.#land(seat, label); return; }
    this.effects.push({ type: 'fly', seat, label, t: 0, dur: 0.95 + Math.random() * 0.35, bend: (Math.random() - 0.5) * 120 });
  }
  ping(strong = false) { if (!reduced) this.effects.push({ type: 'ping', t: 0, dur: strong ? 1.5 : 1.0, strong }); }
  flash(seat) { if (seat) { seat.flash = 1; seat.el.classList.add('flash'); setTimeout(() => seat.el.classList.remove('flash'), 600); } }
  #land(seat, label) {
    this.absorbed++;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * this.R * 0.4;
    this.marks.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, color: COLORS[seat.i % COLORS.length], born: this.t, label });
    if (this.marks.length > 60) this.marks.shift();
    if (this.mode === 'working') this.plateEl.querySelector('.n') && (this.plateEl.querySelector('.n').textContent = String(this.absorbed));
  }

  setPlate(kind, d = {}) {
    const p = this.plateEl;
    if (kind === 'idle') p.innerHTML = `<span class="pl-n">${this.seats.length || ''}</span><span class="pl-l">at the table</span>`;
    else if (kind === 'working') p.innerHTML = `<span class="pl-n n">0</span><span class="pl-l">tastes resolved</span>`;
    else if (kind === 'done') {
      p.innerHTML = `<span class="pl-n"><span class="f">0</span><small>%</small></span><span class="pl-l">${esc(d.line || 'fair to everyone')}</span>`;
      countUp(p.querySelector('.f'), Math.round((d.fairness || 0) * 100), { dur: 1400 });
    }
    p.dataset.kind = kind;
  }
  refreshPlate() { if (this.mode === 'idle') this.setPlate('idle'); }

  // ------------------------------------------------------------------ geometry
  #resize() {
    const r = this.root.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.cv.width = r.width * dpr; this.cv.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const floating = this.layout === 'ring' && getComputedStyle(this.root).position === 'absolute';
    let R = this.layout === 'duel' ? Math.min(r.width * 0.34, r.height * 0.5) : Math.min(r.width * (floating ? 0.34 : 0.34), r.height * (floating ? 0.37 : 0.36));
    this.cy = r.height / 2;
    if (floating) {
      // sit the table in the space to the right of the hero column
      const col = this.root.parentElement?.querySelector('.hero-col');
      const colRight = col ? col.getBoundingClientRect().right - r.left : 0;
      const avail = r.width - colRight;
      R = Math.max(90, Math.min(R, avail / 2 - 96));
      this.cx = colRight + avail / 2;
    } else this.cx = r.width / 2;
    this.R = R;
    this.root.style.setProperty('--cx', `${this.cx}px`); this.root.style.setProperty('--cy', `${this.cy}px`);
  }
  #pos(ang, rad = this.R) { return { x: this.cx + Math.cos(ang) * rad, y: this.cy + Math.sin(ang) * rad * (this.layout === 'duel' ? 0.1 : 1) }; }
  seatPos(s) { return this.#pos(s.ang.x); }

  // ------------------------------------------------------------------ frame
  #frame(dt, t) {
    if (!this.visible || !this.w) return;
    this.t = t;
    if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / 2.1);
    this.spin += dt * (this.mode === 'working' ? 0.9 : 0.05);
    // seats
    this.seats.forEach((s) => {
      s.ang.step(dt); const pop = Math.max(0, s.pop.step(dt));
      const p = this.#pos(s.ang.x);
      const hov = this.hover === s.i ? 1.1 : 1;
      s.hs = lerp(s.hs ?? 1, hov, 0.18);
      s.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${pop * s.hs})`;
      s.orbR.t = this.hover === s.i || this.focusId === s.p.id ? 1 : 0; s.orbR.step(dt);
      s.flash = Math.max(0, s.flash - dt * 1.6);
    });
    if (this.ghost) {
      this.ghost.ang.step(dt);
      const p = this.#pos(this.ghost.ang.x);
      this.ghost.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    this.conflicts.forEach((c) => { if (c.bridging && c.br < 1) c.br = Math.min(1, c.br + dt / 1.6); });
    if (this.distances && this.distT < 1) this.distT = Math.min(1, this.distT + dt / 1.2);
    this.effects.forEach((e) => (e.t += dt / e.dur));
    this.effects = this.effects.filter((e) => {
      if (e.t >= 1) { if (e.type === 'fly') this.#land(e.seat, e.label); return false; }
      return true;
    });
    this.#draw();
    this.#hitTip();
  }

  #draw() {
    const { ctx, w, h, cx, cy, R, t } = this;
    ctx.clearRect(0, 0, w, h);
    const k = easeOut(this.intro);
    const Rt = R * 0.6;
    // table top
    ctx.save();
    ctx.lineCap = 'round';
    const lamp = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rt * 1.1);
    lamp.addColorStop(0, `rgba(${CHALK},${this.mode === 'working' ? 0.16 : 0.08})`); lamp.addColorStop(1, `rgba(${CHALK},0)`);
    ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(cx, cy, Rt * 1.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${CHALK},0.9)`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, Rt, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    ctx.strokeStyle = `rgba(${CHALK},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, Rt * 0.78, Math.PI / 2, Math.PI / 2 + TAU * k); ctx.stroke();
    // ticks, turning slowly (fast while the agent works)
    const ticks = 120;
    for (let i = 0; i < ticks * k; i++) {
      const a = (i / ticks) * TAU + this.spin; const long = i % 10 === 0;
      const r0 = Rt + 3, r1 = Rt + (long ? 13 : 7);
      ctx.strokeStyle = `rgba(${CHALK},${long ? 0.7 : 0.3})`; ctx.lineWidth = long ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    // hatching on the table top
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Rt * 0.78, 0, TAU); ctx.clip();
    ctx.strokeStyle = `rgba(${CHALK},0.07)`; ctx.lineWidth = 1;
    for (let x = -Rt * 2; x < Rt * 2; x += 9) { ctx.beginPath(); ctx.moveTo(cx + x - Rt, cy - Rt); ctx.lineTo(cx + x + Rt, cy + Rt); ctx.stroke(); }
    ctx.restore();
    // centre mark
    ctx.strokeStyle = `rgba(${CHALK},0.45)`;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
    ctx.restore();

    // survey points (resolved tastes)
    this.marks.forEach((m) => {
      const age = t - m.born; const a = clamp(age * 3, 0, 1);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.9 * a;
      const x = cx + m.x, y = cy + m.y, s = 3 + (1 - a) * 6;
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fillStyle = m.color; ctx.fill();
      ctx.globalAlpha = 1;
    });

    // centrelines seat -> table
    this.seats.forEach((s) => {
      const p = this.seatPos(s); const hov = this.hover === s.i;
      ctx.setLineDash([10, 4, 2, 4]); ctx.lineWidth = 1;
      ctx.strokeStyle = hov ? COLORS[s.i % COLORS.length] : `rgba(${CHALK},${0.18 * k})`;
      ctx.beginPath();
      const ang = Math.atan2(p.y - cy, p.x - cx);
      ctx.moveTo(cx + Math.cos(ang) * (Rt + 14), cy + Math.sin(ang) * (Rt + 14)); ctx.lineTo(p.x - Math.cos(ang) * 44, p.y - Math.sin(ang) * 44);
      ctx.stroke(); ctx.setLineDash([]);
    });

    this.#dimensions(k);
    this.#needle();
    this.#conflicts();
    this.#satellites();
    this.#effects();
  }

  // drafting compass: a hairline from the table centre that points at whatever you're looking at
  #needle() {
    if (!this.ptr.in || reduced) return;
    const { ctx, cx, cy } = this;
    let tx = this.ptr.x, ty = this.ptr.y;
    if (this.hover >= 0 && this.seats[this.hover]) { const p = this.seatPos(this.seats[this.hover]); tx = p.x; ty = p.y; }
    const a = Math.atan2(ty - cy, tx - cx), len = this.R * 0.34;
    ctx.strokeStyle = `rgba(${CHALK},0.5)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
    ctx.fillStyle = `rgba(${CHALK},0.9)`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * len, cy + Math.sin(a) * len, 2.4, 0, TAU); ctx.fill();
  }

  // dimension lines between neighbouring seats, labelled with how far apart their tastes are
  #dimensions(k) {
    if (!this.distances || this.layout === 'duel') return;
    const { ctx, cx, cy, R } = this;
    const n = this.seats.length; if (n < 2) return;
    const rr = R * 1.3; const prog = easeOut(this.distT ?? 1);
    ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = this.seats[i], b = this.seats[(i + 1) % n];
      if (n === 2 && i === 1) break;
      const key = `${a.p.id}|${b.p.id}`; const d = this.distances[key]; if (d === undefined) continue;
      let a0 = a.ang.x + 0.2, a1 = b.ang.x - 0.2; if (a1 < a0) a1 += TAU;
      const am = (a0 + a1) / 2;
      ctx.strokeStyle = `rgba(${CHALK},0.45)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + (a1 - a0) * prog); ctx.stroke();
      [a0, a1].forEach((aa) => { ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * (rr - 6), cy + Math.sin(aa) * (rr - 6)); ctx.lineTo(cx + Math.cos(aa) * (rr + 6), cy + Math.sin(aa) * (rr + 6)); ctx.stroke(); });
      if (prog > 0.8) {
        const x = cx + Math.cos(am) * rr, y = cy + Math.sin(am) * rr; const label = d < 0.25 ? 'close' : d < 0.5 ? `${d.toFixed(2)} apart` : `${d.toFixed(2)} apart`;
        ctx.fillStyle = 'rgba(11,58,107,0.95)'; const tw = ctx.measureText(label).width + 10; ctx.fillRect(x - tw / 2, y - 8, tw, 16);
        ctx.fillStyle = d > 0.6 ? `rgb(${TENSION})` : `rgba(${CHALK},0.85)`; ctx.fillText(label, x, y);
      }
    }
  }

  #conflicts() {
    const { ctx, t } = this;
    this.hits = [];
    this.conflicts.forEach((c) => {
      const pa = this.seatPos(c.a), pb = this.seatPos(c.b);
      const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const off = c.idx * 16 - 0; const g = 44;
      const p0 = { x: pa.x + ux * g + nx * off, y: pa.y + uy * g + ny * off }, p1 = { x: pb.x - ux * g + nx * off, y: pb.y - uy * g + ny * off };
      const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const born = clamp((t - c.born) * 1.8, 0, 1);
      const sev = c.level === 'high' ? 1 : c.level === 'medium' ? 0.6 : 0.35;
      const N = 36, br = c.br;
      // cable under tension
      if (br < 1) {
        const vib = (1 - br) * (1.5 + sev * 5) * (reduced ? 0 : 1);
        ctx.strokeStyle = `rgba(${TENSION},${(1 - br * 0.9) * 0.95})`; ctx.lineWidth = 1.6;
        for (const lane of [-2.2, 2.2]) {
          ctx.beginPath();
          for (let i = 0; i <= N * born; i++) {
            const u = i / N, s = Math.sin(u * Math.PI);
            const o = lane + s * (-10 * (1 - br)) + s * vib * Math.sin(t * 24 + i * 0.8 + c.idx * 2) ;
            const x = lerp(p0.x, p1.x, u) + nx * o, y = lerp(p0.y, p1.y, u) + ny * o;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      // truss span
      if (br > 0) {
        const H = 15, M = 9; ctx.strokeStyle = `rgba(${CHALK},0.95)`; ctx.lineWidth = 1.5;
        const top = (u) => ({ x: lerp(p0.x, p1.x, u) + nx * -H * Math.sin(Math.PI * clamp(u, 0, 1)) * 0.6 - nx * 3, y: lerp(p0.y, p1.y, u) + ny * -H * Math.sin(Math.PI * clamp(u, 0, 1)) * 0.6 - ny * 3 });
        const bot = (u) => ({ x: lerp(p0.x, p1.x, u) + nx * 3, y: lerp(p0.y, p1.y, u) + ny * 3 });
        const prog = easeOut(br);
        ctx.beginPath();
        for (let i = 0; i <= 40 * prog; i++) { const q = top(i / 40); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 40 * prog; i++) { const q = bot(i / 40); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
        ctx.stroke();
        ctx.lineWidth = 1.1; ctx.beginPath();
        for (let i = 0; i <= M * prog; i++) {
          const u0 = i / M, u1 = (i + 0.5) / M; const a = bot(u0), b = top(u1), c2 = bot((i + 1) / M);
          if (u1 > prog) break;
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffe14d';
        for (let i = 0; i <= M * prog; i++) { const q = bot(i / M); ctx.beginPath(); ctx.arc(q.x, q.y, 2.1, 0, TAU); ctx.fill(); }
      }
      // label
      const mx = (p0.x + p1.x) / 2 + nx * -26, my = (p0.y + p1.y) / 2 + ny * -26;
      ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = c.label;
      const tw = ctx.measureText(label).width + 12;
      ctx.globalAlpha = born; ctx.fillStyle = 'rgba(11,58,107,0.92)'; ctx.fillRect(mx - tw / 2, my - 9, tw, 18);
      ctx.fillStyle = br > 0.6 ? '#ffe14d' : `rgb(${TENSION})`; ctx.fillText(label, mx, my); ctx.globalAlpha = 1;
      this.hits.push({ c, x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, p0, p1, L });
    });
  }

  #satellites() {
    const { ctx, t } = this;
    ctx.font = `500 11px ${FONT}`; ctx.textBaseline = 'middle';
    this.seats.forEach((s) => {
      if (s.dead) return;
      const p = this.seatPos(s), color = COLORS[s.i % COLORS.length];
      const hov = this.hover === s.i || this.focusId === s.p.id;
      s.p.anchors.slice(0, 8).forEach((a, j) => {
        const r = 44 + (j % 3) * 9 + s.orbR.x * 4;
        const ang = s.ph[j] + (reduced ? 0 : t * s.sp[j] * 0.8);
        const x = p.x + Math.cos(ang) * r, y = p.y + Math.sin(ang) * r;
        if (hov || this.intro < 1) { ctx.strokeStyle = `rgba(${CHALK},${hov ? 0.18 : 0.08})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); }
        const unresolved = this.unres.has(`${s.p.id}|${a.text}`);
        ctx.globalAlpha = clamp(this.intro * 1.6 - 0.4, 0, 1);
        if (unresolved) { ctx.strokeStyle = `rgb(${TENSION})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.stroke(); }
        else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, hov ? 3.4 : 2.6, 0, TAU); ctx.fill(); }
        if (hov) {
          const side = Math.cos(ang) >= 0 ? 1 : -1;
          ctx.textAlign = side > 0 ? 'left' : 'right';
          ctx.fillStyle = 'rgba(11,58,107,0.9)'; const tw = ctx.measureText(a.text).width + 8; ctx.fillRect(side > 0 ? x + 6 : x - 6 - tw, y - 8, tw, 16);
          ctx.fillStyle = unresolved ? `rgb(${TENSION})` : `rgb(${CHALK})`; ctx.fillText(a.text, x + side * 10, y);
        }
        ctx.globalAlpha = 1;
      });
    });
  }

  #effects() {
    const { ctx, cx, cy, R } = this;
    this.effects.forEach((e) => {
      if (e.type === 'ping') {
        const r = R * 0.6 * easeOut(e.t) * (e.strong ? 1.9 : 1.3);
        ctx.strokeStyle = `rgba(${CHALK},${(1 - e.t) * (e.strong ? 0.7 : 0.4)})`; ctx.lineWidth = e.strong ? 2 : 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      } else if (e.type === 'fly') {
        const a = this.seatPos(e.seat), color = COLORS[e.seat.i % COLORS.length];
        const mx = (a.x + cx) / 2 + (-(cy - a.y)) * 0.0 + e.bend, my = (a.y + cy) / 2 + e.bend * 0.4;
        const pt = (u) => { const v = 1 - u; return { x: v * v * a.x + 2 * v * u * mx + u * u * cx, y: v * v * a.y + 2 * v * u * my + u * u * cy }; };
        const u = easeOut(e.t);
        ctx.strokeStyle = color; ctx.lineWidth = 1.4;
        for (let k = 0; k < 10; k++) { const q0 = pt(Math.max(0, u - (k + 1) * 0.025)), q1 = pt(Math.max(0, u - k * 0.025)); ctx.globalAlpha = (1 - k / 10) * 0.8; ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke(); }
        const q = pt(u); ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q.x, q.y, 3.4, 0, TAU); ctx.fill();
        if (e.label && e.t < 0.7) {
          ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 1 - e.t / 0.7; ctx.fillStyle = `rgb(${CHALK})`;
          ctx.fillText(e.label.length > 26 ? e.label.slice(0, 25) + '…' : e.label, q.x + 9, q.y - 9); ctx.globalAlpha = 1;
        }
      }
    });
  }

  #hitTip() {
    if (!this.tip) return;
    let hit = null;
    if (this.ptr.in && this.hits) {
      for (const h of this.hits) {
        const { p0, p1 } = h; const dx = p1.x - p0.x, dy = p1.y - p0.y; const l2 = dx * dx + dy * dy || 1;
        const u = clamp(((this.ptr.x - p0.x) * dx + (this.ptr.y - p0.y) * dy) / l2, 0, 1);
        const d = Math.hypot(this.ptr.x - (p0.x + dx * u), this.ptr.y - (p0.y + dy * u));
        if (d < 16) { hit = h; break; }
      }
    }
    if (hit) { const r = this.root.getBoundingClientRect(); this.tip.show(`<b>${esc(hit.c.label)}</b><span>${esc(hit.c.text || '')}</span><em>${hit.c.br >= 1 ? 'Bridged in the plan' : 'Under tension'}</em>`, r.left + this.ptr.x, r.top + this.ptr.y); this.tipOn = true; }
    else if (this.tipOn) { this.tip.hide(); this.tipOn = false; }
  }
}
