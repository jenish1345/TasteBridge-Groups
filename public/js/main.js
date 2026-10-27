// TasteBridge Groups: orchestrates the drawing board.
import { $, $$, AXIS, COLORS, esc, sleep } from './util.js';
import { initCrosshair, initLamp, reduced } from './motion.js';
import { getJSON, postJSON, streamPlan, Pacer } from './api.js';
import { TableScene } from './scene.js';
import { createEditor } from './editor.js';
import { Results, seatDistances } from './results.js';
import { renderCompare } from './compare.js';
import { initDuo } from './duo.js';

const state = { people: [], plan: null, budget: 3, vibes: [], busy: false, nextId: 1 };

// ------------------------------------------------------------------ small UI services
const tipEl = $('#tip');
const tip = {
  show(html, x, y) { tipEl.innerHTML = html; tipEl.hidden = false; const w = tipEl.offsetWidth; tipEl.style.transform = `translate(${Math.min(x + 16, innerWidth - w - 12)}px, ${y + 18}px)`; },
  hide() { tipEl.hidden = true; },
};
let toastTimer;
function toast(msg, kind = 'error') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast ${kind} show`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 7000);
}
$('#toast').addEventListener('click', () => $('#toast').classList.remove('show'));

// ------------------------------------------------------------------ the table
const newPerson = (name = '') => ({ id: `p${state.nextId++}`, name, anchors: [], avoid: [], isKey: false });
let editor;
const scene = new TableScene($('#scene'), {
  tip,
  onSeat: (i, el) => editor.open(i, el),
  onAdd: () => { if (state.people.length >= 8) return; const p = newPerson(`Guest ${state.people.length + 1}`); state.people.push(p); scene.setPeople(state.people); scene.refreshPlate(); setTimeout(() => { const s = scene.seats.find((x) => x.p.id === p.id); if (s) editor.open(state.people.indexOf(p), s.el); }, 320); refreshCTA(); },
});
editor = createEditor({ state, scene, onChange: () => { scene.refreshPlate(); refreshCTA(); } });

function loadRequest(r) {
  state.people = r.people.map((p) => ({ id: `p${state.nextId++}`, name: p.name, anchors: p.anchors.map((a) => ({ ...a })), avoid: [...(p.avoid || [])], isKey: !!p.isKey }));
  const c = r.constraints;
  $('#city').value = c.city || ''; $('#hood').value = c.neighborhood || ''; if (c.datetime) $('#when').value = c.datetime;
  setBudget(c.budget || 3);
  $$('#dietary input').forEach((x) => (x.checked = (c.dietary || []).includes(x.value)));
  $$('#access input').forEach((x) => (x.checked = (c.accessibility || []).includes(x.value)));
  state.vibes = [...(c.vibes || [])]; renderVibes(); $('#winddown').checked = r.includeWindDown !== false;
  scene.setPeople(state.people); scene.refreshPlate(); refreshCTA();
}

// ------------------------------------------------------------------ the brief (title block)
function setBudget(n) { state.budget = n; queueMicrotask(refreshSummary); $$('#budget button').forEach((b) => { const on = +b.dataset.v <= n; b.classList.toggle('on', on); b.setAttribute('aria-pressed', +b.dataset.v === n); }); }
$('#budget').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setBudget(+b.dataset.v); });
function renderVibes() {
  const box = $('#vibes'); $$('.chip', box).forEach((c) => c.remove()); const inp = $('input', box);
  state.vibes.forEach((v, j) => { const s = document.createElement('span'); s.className = 'chip'; s.innerHTML = `${esc(v)}<button type="button" data-j="${j}" aria-label="Remove ${esc(v)}">×</button>`; box.insertBefore(s, inp); });
}
$('#vibes').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); if (state.vibes.length < 8) state.vibes.push(e.target.value.trim()); e.target.value = ''; renderVibes(); } });
$('#vibes').addEventListener('click', (e) => { const b = e.target.closest('button[data-j]'); if (b) { state.vibes.splice(+b.dataset.j, 1); renderVibes(); } });
function refreshSummary() {
  const city = $('#city').value.trim() || 'No city yet', hood = $('#hood').value.trim(), w = $('#when').value;
  let when = 'no date'; if (w) { const d = new Date(w); if (!isNaN(d)) when = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  $('#brief-sum').textContent = `${hood ? `${hood}, ` : ''}${city}, ${when}, up to ${'$'.repeat(state.budget)}`;
}
function refreshCTA() {
  refreshSummary();
  const miss = state.people.filter((p) => !p.anchors.length).length;
  $('#go-hint').textContent = state.people.length < 2 ? 'Add at least two guests.' : miss ? `${miss} guest${miss > 1 ? 's' : ''} still need something they love.` : `${state.people.length} guests ready.`;
}

function buildRequest() {
  const bad = state.people.find((p) => !p.name.trim());
  if (state.people.length < 2) throw new Error('Add at least two guests to the table.');
  if (bad) throw new Error('Every guest needs a name. Click a seat to set it.');
  const empty = state.people.filter((p) => !p.anchors.length);
  if (empty.length) { empty.forEach((p) => scene.flash(scene.seats.find((s) => s.p.id === p.id))); throw new Error(`Add at least one thing ${empty.map((p) => p.name).join(' and ')} loves. Click their seat.`); }
  const city = $('#city').value.trim(); if (!city) throw new Error('Enter a city for the night out.');
  return {
    people: state.people.map((p) => ({ id: p.id, name: p.name.trim(), anchors: p.anchors, avoid: p.avoid, isKey: p.isKey })),
    constraints: { city, neighborhood: $('#hood').value.trim() || undefined, datetime: $('#when').value || undefined, budget: state.budget, dietary: $$('#dietary input:checked').map((x) => x.value), accessibility: $$('#access input:checked').map((x) => x.value), vibes: state.vibes },
    includeWindDown: $('#winddown').checked,
  };
}

// ------------------------------------------------------------------ the negotiation (streamed from the agent)
const cable = $('#cable');
function cableLine(text, cls = '') { const p = document.createElement('p'); p.className = cls; p.textContent = text; cable.appendChild(p); while (cable.children.length > 5) cable.firstChild.remove(); cable.hidden = false; }
const personIn = (m) => { const x = /^(.+?):\s/.exec(m); return x ? scene.seatByName(x[1]) : null; };

function onTrace(ev) {
  const m = ev.message, seat = personIn(m);
  if (ev.phase === 'plan') { scene.ping(true); cableLine('Drawing up the plan.'); }
  else if (ev.phase === 'observe' && m.includes('→') && seat) { scene.flyIn(seat, m.split('→')[1].trim().replace(/\s*\(.*?\)\s*$/, '')); }
  else if (ev.phase === 'observe' && /could not be resolved/.test(m)) { scene.flash(seat); cableLine(m, 'warn'); }
  else if (ev.phase === 'observe' && m.startsWith('Conflict')) {
    const x = /^Conflict \((\w+), \d+%\): (.+?) — (.+)$/.exec(m);
    if (x) {
      const [, level, label, text] = x; const [sa = '', sb = ''] = text.split(';');
      const find = (side) => state.people.find((p) => new RegExp(`(^|[\\s,&])${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(side));
      const a = find(sa), b = find(sb); const key = Object.entries(AXIS).find(([, v]) => v.label === label)?.[1].short || label;
      if (a && b) scene.addConflict({ a: a.id, b: b.id, label: key, level, text });
      cableLine(`Tension: ${key}`, 'tension');
    }
  } else if (ev.phase === 'act') { scene.ping(); if (/Scored|group query|favourites/.test(m)) cableLine(m.replace(/^\S+:\s/, '').slice(0, 90)); }
  else if (ev.phase === 'reflect' || ev.phase === 'retry') { scene.flash(seat); if (!seat) scene.ping(true); cableLine(m.slice(0, 110), 'reflect'); }
  else if (ev.phase === 'synthesize') { scene.ping(true); cableLine('Building the spans.'); }
}

async function planNight() {
  if (state.busy) return;
  let req; try { req = buildRequest(); } catch (e) { toast(e.message); return; }
  state.busy = true; editor.close(); document.body.classList.add('busy'); $('#go').disabled = true; $('#go').classList.add('busy'); $('#go .t').textContent = 'Negotiating';
  cable.innerHTML = ''; scene.begin(); document.querySelector('#plan').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const pacer = new Pacer(onTrace);
  try {
    const plan = await streamPlan(req, (ev) => pacer.push(ev));
    await pacer.drain(); await sleep(reduced ? 0 : 700);
    present(plan);
  } catch (e) { scene.abort(); toast(e.message || 'Something went wrong. Try again.'); }
  finally { state.busy = false; document.body.classList.remove('busy'); $('#go').disabled = false; $('#go').classList.remove('busy'); $('#go .t').textContent = 'Plan the night'; }
}

let results;
function present(plan) {
  state.plan = plan;
  setMode(plan.dataMode, plan.banner);
  if (!scene.conflicts.length) plan.profile.conflicts.forEach((c) => { const a = plan.profile.people.find((p) => p.person.id === c.sideA[0]), b = plan.profile.people.find((p) => p.person.id === c.sideB[0]); if (a && b) scene.addConflict({ a: a.person.id, b: b.person.id, label: AXIS[c.axis]?.short || c.label, level: c.level, text: c.explanation }); });
  const winners = plan.profile.people.length - plan.metrics.peopleWithoutWin.length;
  scene.setWins(plan.metrics.winsByPerson); scene.setUnresolved(plan.unresolved); scene.setDistances(seatDistances(plan.profile));
  scene.finish({ fairness: plan.metrics.meanScore, line: `${winners} of ${plan.profile.people.length} have a win` });
  $('#results').hidden = false;
  results = new Results($('#results'), { rebalance, compare });
  results.show(plan);
  $$('#nav a[data-needs-plan]').forEach((a) => (a.hidden = false));
  setTimeout(() => $('#verdict').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), reduced ? 0 : 500);
}

async function rebalance(slot) {
  if (!state.plan || results.busy) return;
  results.busy = true; results.setBusy(true);
  try {
    const r = await postJSON('/api/rebalance', { session: state.plan.session, slot: slot || undefined });
    state.plan = { ...state.plan, itinerary: r.itinerary, metrics: r.metrics, audit: r.audit, session: r.session, warnings: r.warnings };
    scene.setWins(r.metrics.winsByPerson);
    await results.update(state.plan, r.rebalance);
    if (r.rebalance.removed === r.rebalance.added) toast(r.rebalance.note, 'info');
  } catch (e) { toast(e.message); }
  finally { results.busy = false; results.setBusy(false); }
}

async function compare() {
  let req; try { req = buildRequest(); } catch (e) { toast(e.message); return; }
  const root = $('#compare'); root.hidden = false; $('#nav a[href="#compare"]').hidden = false;
  root.innerHTML = `<header class="sh"><h2>The same night, drawn two ways</h2></header><div class="wait"><div class="beam-ic big busy" aria-hidden="true"><i></i></div><p>Drawing both versions. This takes a moment the first time.</p></div>`;
  root.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  try { renderCompare(root, await postJSON('/api/compare', req)); } catch (e) { root.hidden = true; toast(e.message); }
}

// sheets draw themselves in the first time they scroll into view
const sheetIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('seen'); sheetIO.unobserve(e.target); } }), { threshold: 0.06 });
const watchSheets = () => $$('.sheet:not(.hero):not(.seen)').forEach((s) => sheetIO.observe(s));
new MutationObserver(watchSheets).observe($('main'), { childList: true, subtree: true });

// ------------------------------------------------------------------ mode + intro
function setMode(mode, banner) {
  const m = $('#mode'); const live = mode === 'live';
  m.className = `mode ${live ? 'live' : mode === 'live-degraded' ? 'deg' : 'smp'}`; m.querySelector('span').textContent = live ? 'Live Qloo data' : mode === 'live-degraded' ? 'Live, partly sample' : 'Sample data';
  const n = $('#note'); n.hidden = !banner; n.textContent = banner || '';
}

function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent.trim());
  el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${esc(w)}</span>`).join(' ');
}

async function init() {
  initCrosshair(); initLamp(); splitWords($('#h1')); watchSheets();
  $('#go').addEventListener('click', planNight);
  $('#brief').addEventListener('input', refreshSummary); $('#brief').addEventListener('change', refreshSummary);
  $('#clear').addEventListener('click', () => { state.people = [newPerson('You'), newPerson('Guest 2'), newPerson('Guest 3')]; scene.setPeople(state.people); scene.refreshPlate(); refreshCTA(); });
  $('#demo').addEventListener('click', async () => { try { loadRequest((await getJSON('/api/demo')).request); } catch (e) { toast(e.message); } });
  const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); $('#when').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T19:00`;
  setBudget(3);
  initDuo({ tip, toast });
  try { const h = await getJSON('/api/health'); setMode(h.qloo === 'live' ? 'live' : 'sample', h.qloo === 'live' ? '' : 'Sample data mode. Venues and affinities come from built-in fixtures, not Qloo. Add QLOO_API_KEY on the server to go live.'); } catch { $('#mode span').textContent = 'Offline'; }
  try { loadRequest((await getJSON('/api/demo')).request); } catch { state.people = [newPerson('You'), newPerson('Guest 2'), newPerson('Guest 3')]; scene.setPeople(state.people); refreshCTA(); }
}
init();
