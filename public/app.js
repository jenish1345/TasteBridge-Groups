// TasteBridge Groups — vanilla JS front-end. All user-provided text is escaped before insertion.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
const COLORS = ['#e4572e', '#1f7a8c', '#7b5ea7', '#c98a00', '#2e8b57', '#c2477e', '#4a6fa5', '#8a6d3b'];
const AXIS = {
  volume: { label: 'Loud vs quiet', pos: 'loud', neg: 'quiet' },
  spice: { label: 'Spicy vs mild', pos: 'spicy', neg: 'mild' },
  scene: { label: 'Nightlife vs family-friendly', pos: 'nightlife', neg: 'family-friendly' },
  novelty: { label: 'Experimental vs mainstream', pos: 'experimental', neg: 'mainstream' },
  price: { label: 'Expensive vs budget', pos: 'upscale', neg: 'budget' },
};
const KINDS = [['auto', 'Auto-detect'], ['artist', 'Artist'], ['movie', 'Film'], ['tv_show', 'TV show'], ['book', 'Book'], ['videogame', 'Game'], ['brand', 'Brand'], ['food', 'Food'], ['place', 'Place'], ['vibe', 'Vibe']];
const KIND_LABEL = Object.fromEntries(KINDS);
const SLOT_LABEL = { activity: 'Activity', food: 'Food', drink: 'Drink / dessert', winddown: 'Wind-down', encore: 'Encore' };

const state = { people: [], budget: 3, vibes: [], plan: null, mode: 'sample', focus: null, nextId: 1 };

// ------------------------------------------------------------------ people editor
function newPerson(name = '') {
  return { id: `p${state.nextId++}`, name, anchors: [], avoid: [], isKey: false };
}
function renderPeople() {
  $('#countLabel').textContent = `${state.people.length} / 8`;
  $('#addPerson').disabled = state.people.length >= 8;
  $('#people').innerHTML = state.people
    .map((p, i) => {
      const color = COLORS[i % COLORS.length];
      return `<div class="person" data-i="${i}">
        <div class="person-head">
          <span class="avatar" style="background:${color}">${esc((p.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
          <input data-f="name" value="${esc(p.name)}" placeholder="Name" maxlength="40" aria-label="Person ${i + 1} name" />
          <label class="key" title="Strong dislikes of a key guest veto venues"><input type="checkbox" data-f="key" ${p.isKey ? 'checked' : ''}/> ★ key guest</label>
          ${state.people.length > 2 ? `<button class="x" data-act="rm-person" aria-label="Remove ${esc(p.name || 'person')}">×</button>` : ''}
        </div>
        <div class="chipbox">${p.anchors.map((a, j) => `<span class="chip">${esc(a.text)} <small>${esc(a.kind === 'auto' ? '' : KIND_LABEL[a.kind] || a.kind)}</small><button data-act="rm-anchor" data-j="${j}" aria-label="Remove ${esc(a.text)}">×</button></span>`).join('') || '<span class="muted" style="font-size:.8rem;padding:3px 5px">No anchors yet</span>'}</div>
        <div class="anchor-add">
          <input data-f="anchor" placeholder="Add artist, film, show, food, brand, vibe… (Enter)" maxlength="120" aria-label="Add taste anchor for ${esc(p.name || 'person')}" />
          <select data-f="kind" aria-label="Anchor type">${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <p class="sub">Hard no's</p>
        <div class="chipbox">${p.avoid.map((a, j) => `<span class="chip avoid">${esc(a)}<button data-act="rm-avoid" data-j="${j}" aria-label="Remove ${esc(a)}">×</button></span>`).join('')}<input data-f="avoid" placeholder="e.g. karaoke, spicy (Enter)" maxlength="40" aria-label="Add hard no for ${esc(p.name || 'person')}" /></div>
      </div>`;
    })
    .join('');
  if (state.focus) {
    const el = $(`.person[data-i="${state.focus.i}"] [data-f="${state.focus.f}"]`);
    el?.focus();
    state.focus = null;
  }
}
$('#people').addEventListener('input', (e) => {
  const card = e.target.closest('.person');
  if (!card) return;
  const p = state.people[+card.dataset.i];
  if (e.target.dataset.f === 'name') {
    p.name = e.target.value;
    $('.avatar', card).textContent = (p.name.trim().charAt(0) || '?').toUpperCase();
  }
});
$('#people').addEventListener('change', (e) => {
  const card = e.target.closest('.person');
  if (card && e.target.dataset.f === 'key') state.people[+card.dataset.i].isKey = e.target.checked;
});
$('#people').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const card = e.target.closest('.person');
  if (!card) return;
  const i = +card.dataset.i;
  const p = state.people[i];
  const v = e.target.value.trim();
  if (e.target.dataset.f === 'anchor' && v) {
    e.preventDefault();
    if (p.anchors.length < 8) p.anchors.push({ text: v, kind: $('[data-f="kind"]', card).value });
    state.focus = { i, f: 'anchor' };
    renderPeople();
  } else if (e.target.dataset.f === 'avoid' && v) {
    e.preventDefault();
    if (p.avoid.length < 8) p.avoid.push(v);
    state.focus = { i, f: 'avoid' };
    renderPeople();
  }
});
$('#people').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  const card = e.target.closest('.person');
  if (!b || !card) return;
  const i = +card.dataset.i;
  const j = +b.dataset.j;
  if (b.dataset.act === 'rm-anchor') state.people[i].anchors.splice(j, 1);
  if (b.dataset.act === 'rm-avoid') state.people[i].avoid.splice(j, 1);
  if (b.dataset.act === 'rm-person') state.people.splice(i, 1);
  renderPeople();
});
$('#addPerson').addEventListener('click', () => {
  if (state.people.length < 8) {
    state.people.push(newPerson(`Guest ${state.people.length + 1}`));
    renderPeople();
  }
});

// vibes chipbox + budget
function renderVibes() {
  const box = $('#vibes');
  $$('.chip', box).forEach((c) => c.remove());
  const input = $('input', box);
  state.vibes.forEach((v, j) => {
    const s = document.createElement('span');
    s.className = 'chip';
    s.innerHTML = `${esc(v)}<button data-j="${j}" aria-label="Remove ${esc(v)}">×</button>`;
    box.insertBefore(s, input);
  });
}
$('#vibes').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    e.preventDefault();
    if (state.vibes.length < 8) state.vibes.push(e.target.value.trim());
    e.target.value = '';
    renderVibes();
    $('#vibes input').focus();
  }
});
$('#vibes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-j]');
  if (b) {
    state.vibes.splice(+b.dataset.j, 1);
    renderVibes();
  }
});
$('#budget').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.budget = +b.dataset.v;
  $$('#budget button').forEach((x) => x.classList.toggle('on', x === b));
});

function loadRequest(r) {
  state.people = r.people.map((p) => ({ id: `p${state.nextId++}`, name: p.name, anchors: p.anchors.map((a) => ({ ...a })), avoid: [...(p.avoid || [])], isKey: !!p.isKey }));
  const c = r.constraints;
  $('#city').value = c.city || '';
  $('#hood').value = c.neighborhood || '';
  if (c.datetime) $('#when').value = c.datetime;
  state.budget = c.budget || 3;
  $$('#budget button').forEach((x) => x.classList.toggle('on', +x.dataset.v === state.budget));
  $$('#dietary input').forEach((x) => (x.checked = (c.dietary || []).includes(x.value)));
  $$('#access input').forEach((x) => (x.checked = (c.accessibility || []).includes(x.value)));
  state.vibes = [...(c.vibes || [])];
  $('#winddown').checked = r.includeWindDown !== false;
  renderPeople();
  renderVibes();
}

function buildRequest() {
  const people = state.people.map((p) => ({ id: p.id, name: p.name.trim(), anchors: p.anchors, avoid: p.avoid, isKey: p.isKey }));
  if (people.length < 2) throw new Error('Add at least 2 people.');
  for (const p of people) if (!p.name) throw new Error('Every person needs a name.');
  const empty = people.filter((p) => !p.anchors.length).map((p) => p.name);
  if (empty.length) throw new Error(`Add at least one taste anchor for ${empty.join(', ')}.`);
  const city = $('#city').value.trim();
  if (!city) throw new Error('Enter a city.');
  return {
    people,
    constraints: {
      city,
      neighborhood: $('#hood').value.trim() || undefined,
      datetime: $('#when').value || undefined,
      budget: state.budget,
      dietary: $$('#dietary input:checked').map((x) => x.value),
      accessibility: $$('#access input:checked').map((x) => x.value),
      vibes: state.vibes,
    },
    includeWindDown: $('#winddown').checked,
  };
}

// ------------------------------------------------------------------ api + chrome
async function api(path, body) {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let j;
  try { j = await res.json(); } catch { throw new Error(`Server error (${res.status})`); }
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}
function setBanner(text, mode) {
  const b = $('#banner');
  b.hidden = !text;
  b.textContent = text || '';
  b.className = `banner ${mode === 'live' ? 'live' : ''}`;
}
function setBadge(mode) {
  const el = $('#modeBadge');
  el.className = `badge ${mode === 'live' ? 'live' : 'sample'}`;
  el.textContent = mode === 'live' ? '● Live Qloo data' : '◌ SAMPLE DATA mode';
}
const LOADING = ['Resolving taste anchors to Qloo entities…', 'Looking up venue tags…', 'Asking Qloo what each person would love…', 'Measuring conflicts between tastes…', 'Negotiating a fair itinerary…'];
function loading(into) {
  let i = 0;
  into.innerHTML = `<div class="loading"><div class="spin"></div><div id="ldmsg">${LOADING[0]}</div></div>`;
  const t = setInterval(() => { const m = $('#ldmsg', into); if (!m) return clearInterval(t); m.textContent = LOADING[++i % LOADING.length]; }, 1800);
  return () => clearInterval(t);
}
function errorBox(e) { return `<div class="err" role="alert"><b>Couldn't plan that.</b> ${esc(e.message || e)}</div>`; }

// ------------------------------------------------------------------ rendering
const idx = (profile) => Object.fromEntries(profile.people.map((p, i) => [p.person.id, { name: p.person.name, color: COLORS[i % COLORS.length], i }]));
const avatar = (m) => `<span class="avatar" style="background:${m.color};width:22px;height:22px;font-size:.66rem" title="${esc(m.name)}">${esc(m.name.charAt(0).toUpperCase())}</span>`;

function renderStats(r, who) {
  const m = r.metrics;
  const winners = Object.values(m.winsByPerson).filter((x) => x.length).length;
  const total = Object.keys(m.winsByPerson).length;
  return `<div class="stats">
    <div class="stat"><b>${pct(m.meanScore)}</b><span>mean fairness score</span></div>
    <div class="stat"><b>${pct(m.minPersonAvg)}</b><span>lowest person's avg fit${who[m.minPersonId] ? ` (${esc(who[m.minPersonId].name)})` : ''}</span></div>
    <div class="stat"><b>${winners}/${total}</b><span>people with a personal win</span></div>
    <div class="stat"><b>${pct(m.equity)}</b><span>equity across the group</span></div>
    <div class="stat"><b>${r.stats.calls}</b><span>Qloo calls · ${r.stats.cacheHits} cached${r.stats.fallbacks ? ` · ${r.stats.fallbacks} fallback` : ''}</span></div>
  </div>`;
}

function renderTrace(r) {
  const rows = r.trace.map((t) => `<li class="p-${t.phase}"><span class="ph">${esc(t.phase)}</span>${esc(t.message)}<span class="ms">${t.t}ms</span></li>`).join('');
  return `<details class="trace card"><summary>Agent trace — ${r.trace.length} steps (plan → resolve → retrieve → reflect → synthesize)</summary><ul class="tl">${rows}</ul></details>`;
}

function renderMap(r, who) {
  const g = r.profile;
  const N = g.people.length;
  const rows = new Map();
  g.people.forEach((p) => p.topTags.forEach((t) => {
    const k = t.name.toLowerCase();
    const cur = rows.get(k) || { name: t.name, by: {}, n: 0, sum: 0 };
    cur.by[p.person.id] = t.weight; cur.n++; cur.sum += t.weight;
    rows.set(k, cur);
  }));
  const list = [...rows.values()].sort((a, b) => b.n - a.n || b.sum - a.sum).slice(0, 14);
  const cls = (n) => (n === N && N > 1 ? 'tag-overlap' : n >= 2 ? 'tag-shared' : 'tag-unique');
  const head = g.people.map((p) => `<th>${avatar(who[p.person.id])}</th>`).join('');
  const body = list.map((t) => `<tr><td class="${cls(t.n)}">${esc(t.name)}</td>${g.people.map((p) => { const w = t.by[p.person.id]; return `<td>${w ? `<span class="dot" style="width:${6 + w * 14}px;height:${6 + w * 14}px;background:${who[p.person.id].color}"></span>` : ''}</td>`; }).join('')}</tr>`).join('');
  const cf = Object.fromEntries(g.conflicts.map((c) => [c.axis, c]));
  const axes = Object.entries(AXIS).map(([k, m]) => {
    const c = cf[k];
    const pips = g.people.filter((p) => Math.abs(p.pref[k]) > 0.05).map((p) => `<span class="pip" style="left:${((p.pref[k] + 1) / 2) * 100}%;background:${who[p.person.id].color}" title="${esc(p.person.name)}: ${p.pref[k] > 0 ? m.pos : m.neg} ${pct(Math.abs(p.pref[k]))}">${esc(p.person.name.charAt(0).toUpperCase())}</span>`).join('');
    return `<div class="axis"><div class="axis-top"><span>${m.label}</span><span class="lvl ${c ? c.level : 'none'}">${c ? `${c.level} conflict` : 'aligned'}</span></div><div class="bar">${pips}</div><div class="poles"><span>${m.neg}</span><span>${m.pos}</span></div>${c ? `<div class="meta">${esc(c.explanation)}</div>` : ''}</div>`;
  }).join('');
  return `<section class="card"><h2>Group taste map</h2><p class="lead">Built from Qloo tags on each person's resolved anchors.</p>
    <div class="map"><div><div class="matrix"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body || '<tr><td class="muted">No tags returned</td></tr>'}</tbody></table></div>
    <div class="legend"><span class="tag-overlap">● shared by everyone</span><span class="tag-shared">● shared by some</span><span class="tag-unique">● unique to one person</span></div></div>
    <div><h3 style="margin-bottom:8px">Taste conflict diplomacy</h3>${axes}</div></div></section>`;
}

function renderStop(s, who, opts = {}) {
  const p = s.place;
  const price = p.priceLevel ? '$'.repeat(p.priceLevel) : '';
  const meta = [p.neighborhood, price, p.rating ? `★ ${p.rating}` : ''].filter(Boolean).join(' · ');
  const tags = s.evidence.candidateTags.slice(0, 6).map((t) => `<span class="tag">${esc(t.name)}</span>`).join('');
  const slot = SLOT_LABEL[s.slot] || s.slot;
  const serves = s.serves.map((x) => `<li>${avatar(who[x.personId] || { name: x.name, color: '#888' })}<span><b>${esc(x.name)}</b> ${esc(x.reason).replace('Personal win.', '<span class="win">Personal win</span>')}</span></li>`).join('');
  const conf = s.conflicts.map((c) => `<li><b>${esc(c.text)}</b><small>↳ ${esc(c.resolution)}</small></li>`).join('');
  const aff = s.evidence.affinitySignals.map((a) => `<div class="aff"><span>${esc(who[a.personId]?.name || a.personId)}</span><div class="meter"><i style="width:${pct(a.individual)}"></i></div><span>${pct(a.individual)}</span></div>`).join('');
  const sigs = s.evidence.signals.map((x) => `<div>${esc(who[x.personId]?.name || '')} → <b>${esc(x.anchor)}</b> ${x.entityId ? `<code>${esc(x.entityId)}</code>` : x.tagId ? `<code>${esc(x.tagId)}</code>` : ''}</div>`).join('');
  const src = { 'qloo-live': 'Live Qloo', sample: 'SAMPLE fixture', 'sample-fallback': 'SAMPLE fallback (Qloo unavailable)' }[s.evidence.source] || s.evidence.source;
  const alts = s.alternatives.length ? `<span class="alts">Next best: ${s.alternatives.map((a) => esc(a.name)).join(', ')}</span>` : '';
  return `<article class="card stop" data-slot="${esc(s.slot)}">
    <div class="stop-head"><div class="time">${esc(s.time || slot.split(' ')[0])}</div>
      <div class="stop-title"><div class="meta">${esc(slot)}</div><h3>${esc(p.name)}</h3><div class="meta">${esc(meta)}</div>${p.description ? `<div class="meta">${esc(p.description)}</div>` : ''}<div class="tagrow">${tags}</div></div>
      <div class="score"><b>${pct(s.score.score)}</b><span>fairness</span></div></div>
    <div class="stop-body">
      <p class="why">${esc(s.why)}</p>
      <div class="mini"><div>Group coverage ${pct(s.score.coverage)}<div class="meter"><i style="width:${pct(s.score.coverage)}"></i></div></div><div>Lowest fit ${pct(s.score.minAffinity)}<div class="meter"><i style="width:${pct(s.score.minAffinity)}"></i></div></div><div>Conflict-free ${pct(s.score.conflictPenalty)}<div class="meter"><i style="width:${pct(s.score.conflictPenalty)}"></i></div></div></div>
      <h4 class="sub">Who it especially serves</h4><ul class="serves">${serves || '<li class="muted">A broad compromise — no single standout.</li>'}</ul>
      ${conf ? `<h4 class="sub">Potential conflicts &amp; how the plan resolves them</h4><ul class="confl">${conf}</ul>` : ''}
      ${s.warnings.map((w) => `<div class="warnline">⚠ ${esc(w)}</div>`).join('')}
      <details class="ev"><summary>Evidence: Qloo entities, tags &amp; affinity signals</summary><div class="ev-grid">
        <div><h4>Qloo entities &amp; signals</h4><div>Venue <code>${esc(p.id)}</code></div>${sigs || '<div class="muted">No anchor signals linked.</div>'}<h4 style="margin-top:8px">Venue tags</h4><div class="tagrow">${s.evidence.candidateTags.map((t) => `<span class="tag" title="${esc(t.id)}">${esc(t.name)}</span>`).join('')}</div><div class="meta" style="margin-top:6px">Source: ${esc(src)}</div></div>
        <div><h4>Individual affinity (0.75·Qloo + 0.25·axis fit)</h4>${aff}</div></div></details>
      ${opts.compact ? '' : `<div class="stop-actions"><button class="btn small" data-rebalance="${esc(s.slot)}">↻ Swap this stop</button>${alts}</div>`}
    </div></article>`;
}

function renderWins(r, who) {
  const cards = Object.entries(r.metrics.winsByPerson).map(([id, stops]) => `<div class="win-card">${avatar(who[id] || { name: id, color: '#888' })}<div><b>${esc(who[id]?.name || id)}</b><br>${stops.length ? stops.map(esc).join(' · ') : '<span class="warnline">No personal win yet</span>'}</div></div>`).join('');
  return `<section class="card"><h2>Personal wins</h2><p class="lead">Every person should get at least one stop that's genuinely theirs.</p><div class="wins">${cards}</div></section>`;
}

function renderPlan(r) {
  state.plan = r;
  const who = idx(r.profile);
  const warnings = [...(r.warnings || [])];
  const diff = r.rebalance ? `<div class="diff"><b>Rebalanced:</b> ${esc(r.rebalance.note)} Fairness ${pct(r.rebalance.before.meanScore)} → ${pct(r.rebalance.after.meanScore)}; lowest person ${pct(r.rebalance.before.minPersonAvg)} → ${pct(r.rebalance.after.minPersonAvg)}.</div>` : '';
  $('#results').innerHTML = `
    ${diff}
    ${renderStats(r, who)}
    <div class="row gap" style="margin-bottom:14px;align-items:center"><button class="btn primary" data-rebalance="">↻ Rebalance plan</button><span class="muted" style="font-size:.82rem">Swaps the weakest stop while keeping every personal win and fairness within 3 points.</span></div>
    ${warnings.length ? `<div class="banner" style="margin:0 0 14px">${warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join('')}</div>` : ''}
    ${renderTrace(r)}
    ${renderMap(r, who)}
    <h2 style="margin:20px 0 10px">Your itinerary</h2>
    ${r.itinerary.map((s) => renderStop(s, who)).join('')}
    ${renderWins(r, who)}`;
}

// ------------------------------------------------------------------ actions
async function doPlan() {
  let req;
  try { req = buildRequest(); } catch (e) { $('#results').innerHTML = errorBox(e); return; }
  const stop = loading($('#results'));
  setBtn(true);
  try {
    const r = await api('/api/plan', req);
    setBanner(r.banner, r.dataMode);
    setBadge(r.dataMode === 'sample' ? 'sample' : 'live');
    renderPlan(r);
  } catch (e) { $('#results').innerHTML = errorBox(e); } finally { stop(); setBtn(false); }
}
async function doRebalance(slot) {
  if (!state.plan) return;
  const btns = $$('[data-rebalance]');
  btns.forEach((b) => (b.disabled = true));
  try {
    const r = await api('/api/rebalance', { session: state.plan.session, slot: slot || undefined });
    renderPlan({ ...state.plan, itinerary: r.itinerary, metrics: r.metrics, session: r.session, warnings: r.warnings, rebalance: r.rebalance });
  } catch (e) { $('#results').insertAdjacentHTML('afterbegin', errorBox(e)); }
}
async function doCompare() {
  let req;
  try { req = buildRequest(); } catch (e) { switchTab('plan'); $('#results').innerHTML = errorBox(e); return; }
  switchTab('compare');
  const out = $('#compareOut');
  const stop = loading(out);
  setBtn(true);
  try {
    const r = await api('/api/compare', req);
    setBanner(r.withQloo.banner, r.withQloo.dataMode);
    setBadge(r.withQloo.dataMode === 'sample' ? 'sample' : 'live');
    const who = idx(r.withQloo.profile);
    const rows = r.scorecard.map((s) => `<tr><td><b>${esc(s.label)}</b><small>${esc(s.note)}</small></td><td class="q">${esc(s.withQloo)}</td><td>${esc(s.withoutQloo)}</td></tr>`).join('');
    const base = r.withoutQloo;
    out.innerHTML = `
      <section class="card"><h2>Scorecard</h2><p class="lead">Same request, same group. One planner is grounded in Qloo; the other is a generic guess.</p>
        <table class="scoretbl"><thead><tr><th>What we measured</th><th>With Qloo</th><th>Without Qloo</th></tr></thead><tbody>${rows}</tbody></table></section>
      <div class="cmp">
        <div><div class="col-h"><h2>With Qloo</h2><span class="pill q">${r.withQloo.dataMode === 'live' ? 'LIVE · grounded' : 'SAMPLE · grounded'}</span></div>
          ${r.withQloo.itinerary.map((s) => renderStop(s, who, { compact: true })).join('')}</div>
        <div><div class="col-h"><h2>Without Qloo</h2><span class="pill n">${esc(base.label)}</span></div>
          <p class="muted" style="font-size:.85rem">${esc(base.note)}</p>
          ${base.stops.map((s) => `<div class="generic-stop"><h4>${esc(s.title)}</h4><p>${esc(s.why)}</p></div>`).join('')}
          <div class="generic-stop"><p><b>Evidence:</b> none. No entity IDs, no tags, no per-person affinity, no conflict model, no guarantee anyone gets a win.</p></div></div>
      </div>`;
  } catch (e) { out.innerHTML = errorBox(e); } finally { stop(); setBtn(false); }
}
async function doPair() {
  const split = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const out = $('#pairOut');
  const stop = loading(out);
  try {
    const r = await api('/api/pair', { a: { name: $('#pairNameA').value, anchors: split($('#pairA').value) }, b: { name: $('#pairNameB').value, anchors: split($('#pairB').value) }, city: $('#pairCity').value.trim() || undefined });
    setBanner(r.banner, r.dataMode);
    const who = idx({ people: r.profile.people });
    const overlap = r.profile.overlapTags.map((t) => `<span class="tag">${esc(t.name)}</span>`).join('') || '<span class="muted">No directly shared tags — the bridge comes from adjacent tastes.</span>';
    const conf = r.profile.conflicts.map((c) => `<div class="meta"><span class="lvl ${c.level}">${c.level}</span> ${esc(c.label)} — ${esc(c.explanation)}</div>`).join('');
    out.innerHTML = `<section class="card"><h2>${esc(r.people[0].name)} × ${esc(r.people[1].name)}</h2><p class="lead">Shared tags</p><div class="tagrow">${overlap}</div>${conf ? `<h3 style="margin-top:14px">Where you differ</h3>${conf}` : ''}</section>` +
      r.domains.map((d) => `<section class="card domain"><h2>${esc(d.label)}</h2>${d.picks.map((p) => `<div class="pick"><div><b>${esc(p.name)}</b><small>${esc(p.why)}</small></div><b>${pct(p.score)}</b></div>`).join('') || '<p class="muted">Nothing returned.</p>'}</section>`).join('') +
      (r.unresolved.length ? `<div class="banner">Couldn't resolve: ${r.unresolved.map((u) => esc(u.anchor)).join(', ')}</div>` : '') + renderTrace(r);
    void who;
  } catch (e) { out.innerHTML = errorBox(e); } finally { stop(); }
}
function setBtn(b) { $('#planBtn').disabled = b; $('#compareBtn').disabled = b; }
function switchTab(t) {
  $$('.tab').forEach((x) => { const on = x.dataset.tab === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${t}`));
}

$('#planBtn').addEventListener('click', doPlan);
$('#compareBtn').addEventListener('click', doCompare);
$('#pairBtn').addEventListener('click', doPair);
$('#goPlanner').addEventListener('click', () => switchTab('plan'));
$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rebalance]');
  if (b) doRebalance(b.dataset.rebalance);
  if (e.target.id === 'emptyDemo') loadDemo(true);
});
async function loadDemo(run) {
  try {
    const { request } = await api('/api/demo');
    loadRequest(request);
    if (run) doPlan();
  } catch (e) { $('#results').innerHTML = errorBox(e); }
}
$('#loadDemo').addEventListener('click', () => loadDemo(false));

// ------------------------------------------------------------------ init
(function init() {
  state.people = [newPerson('You'), newPerson('Friend 2'), newPerson('Friend 3')];
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  $('#when').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T19:00`;
  renderPeople();
  api('/api/health').then((h) => setBadge(h.qloo)).catch(() => ($('#modeBadge').textContent = 'offline'));
})();
