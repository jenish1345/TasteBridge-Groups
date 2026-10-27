// Results: the drawing set that follows a plan.
//   Verdict      the headline number, in plain language
//   Stress       taste conflicts as beams, and where tastes overlap
//   The night    an elevation drawing: one pier per stop, with a dossier for the selected stop
//   Loads        who each stop serves, person by stop
import { $, $$, AXIS, COLORS, HATCH, SLOT_LABEL, clamp, esc, initial, pct, sleep } from './util.js';
import { countUp, onceVisible, reduced } from './motion.js';

const col = (i) => COLORS[i % COLORS.length];
const stopName = (s) => s.place.name;
const money = (n) => (n ? '$'.repeat(n) : '');
const revLetter = (i) => String.fromCharCode(65 + i);

function titleBlock(plan, sheet, rev) {
  const c = plan.session.request.constraints;
  return `<footer class="tb"><div><small>Project</small><b>${esc(c.neighborhood ? `${c.neighborhood}, ${c.city}` : c.city)}</b></div><div><small>When</small><b>${esc(c.datetime ? c.datetime.replace('T', ' ') : 'Not set')}</b></div><div><small>Sheet</small><b>${esc(sheet)}</b></div><div><small>Revision</small><b>${esc(rev)}</b></div></footer>`;
}

export class Results {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx; this.sel = 0; this.tab = 'why'; this.touched = false; this.revs = []; this.plan = null;
  }

  // ------------------------------------------------------------------ build
  show(plan) {
    this.plan = plan; this.sel = 0; this.tab = 'why'; this.touched = false;
    this.revs = [{ text: 'First plan from the agent', fairness: plan.metrics.meanScore }];
    this.who = Object.fromEntries(plan.profile.people.map((p, i) => [p.person.id, { name: p.person.name, i, c: col(i) }]));
    this.root.innerHTML = this.#verdict() + this.#stress() + this.#night() + this.#loads();
    this.#wire();
    this.#animateVerdict(true);
    this.#buildBridge();
    this.#renderDossier(false);
    this.#renderLoads();
    this.revsHTMLInit();
  }

  #rev() { return revLetter(this.revs.length - 1); }

  #verdict() {
    const p = this.plan, m = p.metrics, n = p.profile.people.length;
    const winners = n - m.peopleWithoutExclusive.length;
    const relaxed = p.itinerary.filter((s) => s.warnings.some((w) => w.startsWith('Relaxed'))).length;
    const conflicts = p.profile.conflicts.filter((c) => c.level !== 'low').length;
    const lines = [
      winners === n ? `Everyone has a stop that's theirs.` : m.peopleWithoutWin.length ? `${winners} of ${n} people have a stop that's theirs.` : `${winners} of ${n} people have a stop that's theirs, and the rest get their closest fit.`,
      relaxed ? `${relaxed} stop${relaxed > 1 ? 's' : ''} had to relax a rule because nothing else fit.` : `Nothing anyone ruled out made it into the plan.`,
      conflicts ? `${conflicts} taste conflict${conflicts > 1 ? 's were' : ' was'} bridged.` : 'The table is in agreement. No major conflicts.',
    ];
    const who = this.who;
    return `<section class="sheet" id="verdict" data-sheet="Verdict">
      <div class="verdict">
        <div class="vnum" aria-label="Fairness ${pct(m.meanScore)}"><span class="v" data-v>0</span><span class="u">%</span><span class="cap">fair across the table</span></div>
        <div class="vtext">
          <h2 data-split>${lines[0]}</h2>
          <p>${lines.slice(1).map(esc).join(' ')}</p>
          <dl class="facts">
            <div><dt>Lowest fit</dt><dd><span data-c="${Math.round(m.minPersonAvg * 100)}">0</span>%<small>${esc(who[m.minPersonId]?.name || '')}'s average</small></dd></div>
            <div><dt>Evenness</dt><dd><span data-c="${Math.round(m.equity * 100)}">0</span>%<small>of fit shared equally</small></dd></div>
            <div><dt>Qloo calls</dt><dd><span data-c="${p.stats.calls}">0</span><small>${p.stats.cacheHits} from cache</small></dd></div>
          </dl>
          ${p.warnings.length ? `<ul class="notes">${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
          <div class="row"><button type="button" class="btn" data-compare>Compare with a plan made without Qloo</button></div>
        </div>
      </div>
      ${titleBlock(p, 'Verdict', this.#rev())}
    </section>`;
  }

  #animateVerdict(first) {
    const p = this.plan, v = $('[data-v]', this.root); if (!v) return;
    countUp(v, Math.round(p.metrics.meanScore * 100), { dur: first ? 1800 : 900, from: this.lastV || 0 });
    this.lastV = Math.round(p.metrics.meanScore * 100);
    $$('[data-c]', this.root).forEach((el) => countUp(el, +el.dataset.c, { dur: 1400 }));
  }

  // ------------------------------------------------------------------ stress
  #stress() {
    const p = this.plan, g = p.profile, who = this.who;
    const conf = Object.fromEntries(g.conflicts.map((c) => [c.axis, c]));
    const bridged = (axis) => p.itinerary.filter((s) => s.conflicts.some((c) => c.axis === axis));
    const beams = Object.entries(AXIS).map(([k, m]) => {
      const c = conf[k];
      const pips = g.people.filter((x) => Math.abs(x.pref[k]) > 0.05).map((x) => `<span class="pip" style="--x:${((x.pref[k] + 1) / 2) * 100}%;--c:${who[x.person.id].c}" title="${esc(x.person.name)} leans ${x.pref[k] > 0 ? m.pos : m.neg}">${esc(initial(x.person.name))}</span>`).join('');
      const b = bridged(k);
      return `<div class="beam ${c ? c.level : 'ok'}" data-axis="${k}">
        <div class="bh"><b>${m.label}</b><span class="state">${c ? (c.level === 'low' ? 'Slight tension' : c.level === 'medium' ? 'Tension' : 'High tension') : 'In agreement'}</span></div>
        <div class="bar" role="img" aria-label="${esc(m.label)}">${pips}</div>
        <div class="poles"><span>${m.neg}</span><span>${m.pos}</span></div>
        ${c ? `<p class="why">${esc(c.explanation)} ${b.length ? `Bridged at ${b.slice(0, 3).map((s) => esc(stopName(s))).join(', ')}.` : ''}</p>` : ''}
      </div>`;
    }).join('');
    const rail = (title, tags, cls) => tags.length ? `<div class="rail ${cls}"><h4>${title}</h4><div>${tags.map((t) => `<span class="tg" style="--dots:${t.people?.length || 1}">${esc(t.name)}${t.people && t.people.length < g.people.length ? `<i>${t.people.map((id) => `<s style="--c:${who[id]?.c}"></s>`).join('')}</i>` : ''}</span>`).join('')}</div></div>` : '';
    const unique = g.uniqueTags.filter((u) => u.tags.length).map((u) => `<div class="rail one"><h4>Only ${esc(who[u.personId]?.name || '')}</h4><div>${u.tags.map((t) => `<span class="tg" style="--c:${who[u.personId]?.c}">${esc(t.name)}</span>`).join('')}</div></div>`).join('');
    const log = p.trace.map((t) => `<li class="ph-${t.phase}"><b>${esc(t.phase)}</b>${esc(t.message)}</li>`).join('');
    return `<section class="sheet" id="stress" data-sheet="Stress analysis">
      <header class="sh"><h2>Where your tastes pull apart</h2><p>Qloo's tags on everything each person loves, placed on five scales. Where two people sit far apart, the plan has to carry the load.</p></header>
      <div class="stress"><div class="beams">${beams}</div>
      <div class="rails">${rail('Everyone likes', g.overlapTags, 'all')}${rail('Some of you', g.sharedTags.slice(0, 14), 'some')}${unique}${!g.overlapTags.length && !g.sharedTags.length ? '<p class="soft">No tag is shared by two or more people. The compromises come from neighbouring tastes.</p>' : ''}</div></div>
      <details class="log"><summary data-snap>Survey log: ${p.trace.length} steps the agent took</summary><ol>${log}</ol></details>
      ${titleBlock(p, 'Stress analysis', this.#rev())}
    </section>`;
  }

  // ------------------------------------------------------------------ the night (elevation)
  #night() {
    const p = this.plan;
    return `<section class="sheet" id="night" data-sheet="The night">
      <header class="sh sh-row"><div><h2>The night, as a bridge</h2><p>One pier per stop. Select a pier to see why it's there, who it's for and what it cost the others.</p></div>
        <button type="button" class="btn primary scale" data-rebalance><span class="beam-ic" aria-hidden="true"><i></i></span><span class="t">Rebalance plan</span></button></header>
      <div class="bridge" id="bridge"><svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg><div class="piers" role="tablist" aria-label="Stops"></div></div>
      <div class="dossier" id="dossier" aria-live="polite"></div>
      <div class="revs"><h4>Revisions</h4><ol id="revs"></ol></div>
      ${titleBlock(p, 'Elevation', this.#rev())}
    </section>`;
  }

  #xs() { const n = this.plan.itinerary.length; return Array.from({ length: n }, (_, i) => (n === 1 ? 500 : 130 + (i * 740) / (n - 1))); }

  #buildBridge() {
    const svg = $('#bridge svg', this.root), xs = this.#xs(), deck = 150, ground = 262;
    let d = `<path class="ln gr" d="M30 ${ground}H970"/>`;
    d += `<path class="ln gr hatch" d="${Array.from({ length: 60 }, (_, i) => `M${40 + i * 15.5} ${ground}l-9 12`).join('')}"/>`;
    d += `<path class="ln deck" d="M40 ${deck}H960"/><path class="ln deck2" d="M40 ${deck + 7}H960"/>`;
    xs.forEach((x, i) => {
      d += `<path class="ln pier" style="--i:${i}" d="M${x} ${deck + 7}V${ground}"/><path class="ln foot" d="M${x - 14} ${ground}H${x + 14}"/>`;
      if (i < xs.length - 1) {
        const x1 = xs[i + 1], cx = (x + x1) / 2, top = deck - 96;
        d += `<path class="ln arch" style="--i:${i}" d="M${x} ${deck}Q${cx} ${top} ${x1} ${deck}"/>`;
        for (let k = 1; k <= 5; k++) { const u = k / 6, bx = (1 - u) ** 2 * x + 2 * (1 - u) * u * cx + u * u * x1, by = (1 - u) ** 2 * deck + 2 * (1 - u) * u * top + u * u * deck; d += `<path class="ln hang" style="--i:${i + k * 0.2}" d="M${bx} ${by}V${deck}"/>`; }
      }
    });
    xs.forEach((x, i) => (d += `<g class="node" data-i="${i}" transform="translate(${x} ${deck})"><circle class="halo" r="20"/><circle class="dot" r="8"/></g>`));
    d += `<circle id="trav" class="trav" r="5" cx="${xs[0]}" cy="${deck - 14}"/>`;
    svg.innerHTML = d;
    $$('.ln', svg).forEach((p, k) => { const L = p.getTotalLength?.() || 600; p.style.strokeDasharray = L; p.style.strokeDashoffset = reduced ? 0 : L; p.style.setProperty('--dl', `${k * 14}ms`); });
    this.#renderPiers();
    const run = () => { $('#bridge', this.root).classList.add('built'); setTimeout(() => this.#tour(), 1500); };
    onceVisible($('#bridge', this.root), run, 0.35);
  }

  async #tour() {
    if (reduced) return;
    const xs = this.#xs(), trav = $('#trav', this.root); if (!trav) return;
    for (let i = 0; i < xs.length && !this.touched; i++) {
      trav.style.transform = `translateX(${xs[i] - xs[0]}px)`; await sleep(i === 0 ? 400 : 1100);
      if (this.touched) return;
      this.select(i, true); await sleep(1500);
    }
    if (!this.touched) { trav.style.transform = `translateX(${xs[0] - xs[0]}px)`; this.select(0, true); }
  }

  #renderPiers() {
    const xs = this.#xs(), box = $('#bridge .piers', this.root);
    box.innerHTML = this.plan.itinerary.map((s, i) => {
      const wins = s.serves.filter((x) => x.reason.startsWith('Personal win')).map((x) => `<s style="--c:${this.who[x.personId]?.c}" title="${esc(x.name)}'s personal win"></s>`).join('');
      return `<button type="button" role="tab" class="pier ${i === this.sel ? 'on' : ''}" data-i="${i}" aria-selected="${i === this.sel}" style="--x:${xs[i] / 10}%"><span class="tm">${esc(s.time || SLOT_LABEL[s.slot])}</span><span class="pn">${esc(stopName(s))}</span><span class="wn">${wins}</span></button>`;
    }).join('');
    $$('.node', this.root).forEach((n) => n.classList.toggle('on', +n.dataset.i === this.sel));
  }

  select(i, auto = false) {
    if (!auto) this.touched = true;
    if (i === this.sel && auto === false) return;
    this.sel = i; this.tab = this.tab || 'why';
    $$('.pier', this.root).forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $$('.node', this.root).forEach((n) => n.classList.toggle('on', +n.dataset.i === i));
    const trav = $('#trav', this.root); if (trav && !auto) trav.style.transform = `translateX(${this.#xs()[i] - this.#xs()[0]}px)`;
    this.#renderDossier(true);
  }

  #renderDossier(animate) {
    const box = $('#dossier', this.root), s = this.plan.itinerary[this.sel]; if (!s) return;
    const fill = () => {
      const p = s.place, who = this.who;
      const meta = [p.neighborhood, money(p.priceLevel), p.rating ? `${p.rating} stars` : ''].filter(Boolean).join(', ');
      const slot = `${SLOT_LABEL[s.slot] || s.slot}${s.time ? ` at ${s.time}` : ''}`;
      const tabs = [['why', 'Why it fits'], ['serves', 'Who it serves'], ['trade', 'What it costs'], ['proof', 'Evidence']];
      box.innerHTML = `
        <div class="dos-main">
          <h3>${esc(p.name)}</h3>
          <p class="when">${esc(slot)}</p>
          <p class="meta">${esc(meta)}</p>
          ${p.openNote ? `<p class="open">${esc(p.openNote)}</p>` : ''}
          ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
          <div class="tagrow">${s.evidence.candidateTags.slice(0, 7).map((t) => `<span class="tg">${esc(t.name)}</span>`).join('')}</div>
          <div class="links">${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}</div>
          <div class="score"><b data-sc>0</b><span>% fair here</span></div>
          <button type="button" class="btn small" data-swap="${esc(s.slot)}">Swap this stop</button>
        </div>
        <div class="dos-side">
          <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${k === this.tab ? 'on' : ''}" aria-selected="${k === this.tab}">${l}</button>`).join('')}<i class="ink"></i></div>
          <div class="tabpanel" role="tabpanel">${this.#panel(s)}</div>
        </div>`;
      countUp($('[data-sc]', box), Math.round(s.score.score * 100), { dur: 800 });
      this.#ink();
      requestAnimationFrame(() => $$('.gauge i', box).forEach((g) => g.classList.add('on')));
    };
    if (!animate || reduced) return fill();
    box.classList.add('out'); setTimeout(() => { fill(); box.classList.remove('out'); box.classList.add('in'); setTimeout(() => box.classList.remove('in'), 400); }, 170);
  }

  #ink() {
    const box = $('#dossier', this.root), on = $('.tabs .on', box), ink = $('.tabs .ink', box); if (!on || !ink) return;
    ink.style.width = `${on.offsetWidth}px`; ink.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  #panel(s) {
    const who = this.who, sc = s.score;
    if (this.tab === 'why') {
      const w = (label, v) => `<div class="gline"><span>${label}</span><div class="gauge"><i style="--v:${v}"></i></div><b>${pct(v)}</b></div>`;
      return `<p class="lead">${esc(s.why)}</p>
        ${w('Share of the table clearly into it', sc.coverage)}${w(`Least-served person (${esc(who[sc.weakestPersonId]?.name || '')})`, sc.minAffinity)}${w('Free of taste conflict', sc.conflictPenalty)}
        <p class="formula">0.5 × ${pct(sc.coverage)} + 0.3 × ${pct(sc.minAffinity)} + 0.2 × ${pct(sc.conflictPenalty)} = <b>${pct(sc.score)}</b></p>`;
    }
    if (this.tab === 'serves') {
      const reasons = Object.fromEntries(s.serves.map((x) => [x.personId, x.reason]));
      const rows = s.evidence.affinitySignals.slice().sort((a, b) => b.individual - a.individual).map((a) => {
        const w = who[a.personId] || { name: a.personId, c: '#fff', i: 0 }; const win = reasons[a.personId]?.startsWith('Personal win'); const close = reasons[a.personId]?.startsWith('Closest to theirs');
        return `<li class="${win ? 'win' : ''}" style="--c:${w.c}"><span class="av" style="--h:${HATCH[w.i % 8]}deg">${esc(initial(w.name))}</span><div><b>${esc(w.name)}${win ? '<em>Personal win</em>' : close ? '<em class="close">Closest fit</em>' : ''}</b><p>${esc((reasons[a.personId] || `Fits at ${pct(a.individual)}.`).replace(/^(Personal win|Closest to theirs)\.\s*/, ''))}</p><div class="gauge"><i style="--v:${a.individual}"></i></div></div><strong>${pct(a.individual)}</strong></li>`;
      }).join('');
      return `<ul class="serve-list">${rows}</ul>`;
    }
    if (this.tab === 'trade') {
      const conf = s.conflicts.length ? s.conflicts.map((c) => `<li><b>${esc(c.text)}</b><span>${esc(c.resolution)}</span></li>`).join('') : '<li class="soft">No taste conflict lands on this stop.</li>';
      const out = s.ruledOut.length ? s.ruledOut.map((r) => `<li><s>${esc(r.name)}</s><span>${pct(r.score)} fit, but ${esc(r.reason)}</span></li>`).join('') : '<li class="soft">Nothing better-scoring had to be ruled out.</li>';
      const nv = s.vsNaive ? `<p class="naive">A plain "highest average" ranking would have chosen <b>${esc(s.vsNaive.name)}</b>. Its least-served person, ${esc(s.vsNaive.weakest)}, would sit at ${pct(s.vsNaive.minAffinity)}${s.vsNaive.vetoed ? `, and it ${esc(s.vsNaive.vetoed.startsWith('closed') ? 'is ' + s.vsNaive.vetoed : 'breaks a rule: ' + s.vsNaive.vetoed)}` : ''}. Here it's ${pct(s.vsNaive.ourMin)}.</p>` : '<p class="naive soft">A plain average would have chosen the same venue.</p>';
      return `<h4>Conflicts and how the plan handles them</h4><ul class="tr">${conf}</ul><h4>Ruled out for this stop</h4><ul class="tr out">${out}</ul>${nv}${s.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}`;
    }
    const src = { 'qloo-live': 'Live from Qloo', sample: 'Sample fixture, not real Qloo data', 'sample-fallback': 'Sample fallback, Qloo was unavailable' }[s.evidence.source] || s.evidence.source;
    const sigs = s.evidence.signals.map((x) => `<li><b>${esc(who[x.personId]?.name || '')}</b> loves ${esc(x.anchor)} <code>${esc(x.entityId || x.tagId || '')}</code></li>`).join('');
    return `<p class="src">${esc(src)}</p><h4>Qloo venue</h4><p><code>${esc(s.place.id)}</code></p><h4>Taste signals that linked it to people</h4><ul class="sig">${sigs || '<li class="soft">None linked.</li>'}</ul><h4>Tags</h4><div class="tagrow">${s.evidence.candidateTags.map((t) => `<span class="tg" title="${esc(t.id)}">${esc(t.name)}</span>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ loads
  #loads() {
    return `<section class="sheet" id="loads" data-sheet="Load schedule">
      <header class="sh"><h2>Who carries what</h2><p>Each circle is how well a stop fits a person. A ring means it's their personal win.</p></header>
      <div class="loadwrap"><div id="loadtable"></div><aside class="audit" id="audit"></aside></div>
      ${titleBlock(this.plan, 'Load schedule', this.#rev())}
    </section>`;
  }

  #renderLoads() {
    const p = this.plan, who = this.who;
    const head = p.itinerary.map((s) => `<th scope="col"><span>${esc(s.time || '')}</span>${esc(stopName(s))}</th>`).join('');
    const rows = p.profile.people.map((x) => {
      const w = who[x.person.id];
      const cells = p.itinerary.map((s) => {
        const a = s.affinities[x.person.id] ?? 0; const win = s.serves.some((v) => v.personId === x.person.id && v.reason.startsWith('Personal win'));
        return `<td><span class="cell ${win ? 'win' : ''} ${a < 0.4 ? 'low' : ''}" style="--v:${a};--c:${w.c}" title="${esc(x.person.name)} at ${esc(stopName(s))}: ${pct(a)}${win ? ', personal win' : ''}"><i></i><b>${Math.round(a * 100)}</b></span></td>`;
      }).join('');
      return `<tr data-p="${esc(x.person.id)}"><th scope="row"><span class="av" style="--c:${w.c};--h:${HATCH[w.i % 8]}deg">${esc(initial(x.person.name))}</span>${esc(x.person.name)}</th>${cells}</tr>`;
    }).join('');
    $('#loadtable', this.root).innerHTML = `<table class="loads"><thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    const a = p.audit;
    $('#audit', this.root).innerHTML = `<h3>Against a plain average</h3>
      <p>We also ran the obvious ranking, which picks whatever has the highest average fit, and compared the two on this table.</p>
      <ul><li><b data-ac="${a.stopsChanged}">0</b> of ${a.stops} stops are different here</li>
      <li><b data-ac="${a.naiveViolations}">0</b> of its picks broke a rule: a hard no, a veto, the budget or opening hours</li>
      <li><b data-ac="${a.poorFitsNaive}">0</b> times it left someone under 40% fit. This plan: <b>${a.poorFitsOurs}</b></li></ul>`;
    $$('[data-ac]', this.root).forEach((el) => countUp(el, +el.dataset.ac, { dur: 1200 }));
    $$('.loads tbody tr', this.root).forEach((tr) => {
      tr.addEventListener('pointerenter', () => tr.classList.add('hl'));
      tr.addEventListener('pointerleave', () => tr.classList.remove('hl'));
    });
  }

  // ------------------------------------------------------------------ interaction
  #wire() {
    this.root.addEventListener('click', (e) => {
      const pier = e.target.closest('.pier'); if (pier) return this.select(+pier.dataset.i);
      const node = e.target.closest('.node'); if (node) return this.select(+node.dataset.i);
      const tab = e.target.closest('[data-tab]'); if (tab) { this.touched = true; this.tab = tab.dataset.tab; $$('[data-tab]', this.root).forEach((b) => { const on = b === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); this.#ink(); const panel = $('.tabpanel', this.root); panel.classList.add('swap'); setTimeout(() => { panel.innerHTML = this.#panel(this.plan.itinerary[this.sel]); panel.classList.remove('swap'); requestAnimationFrame(() => $$('.gauge i', panel).forEach((g) => g.classList.add('on'))); }, 110); return; }
      const swap = e.target.closest('[data-swap]'); if (swap) { this.touched = true; return this.ctx.rebalance(swap.dataset.swap); }
      if (e.target.closest('[data-rebalance]')) { this.touched = true; return this.ctx.rebalance(''); }
      if (e.target.closest('[data-compare]')) return this.ctx.compare();
    });
    this.root.addEventListener('keydown', (e) => {
      if (!e.target.closest('.piers')) return;
      const n = this.plan.itinerary.length;
      if (e.key === 'ArrowRight') { this.select((this.sel + 1) % n); $$('.pier', this.root)[this.sel]?.focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { this.select((this.sel + n - 1) % n); $$('.pier', this.root)[this.sel]?.focus(); e.preventDefault(); }
    });
  }

  setBusy(on) { $('[data-rebalance]', this.root)?.classList.toggle('busy', on); $$('[data-swap]', this.root).forEach((b) => (b.disabled = on)); }

  /** Apply a rebalanced plan in place: the changed pier drops and a new one rises. */
  async update(plan, diff) {
    const old = this.plan.itinerary.map((s) => s.place.id);
    this.plan = { ...this.plan, itinerary: plan.itinerary, metrics: plan.metrics, audit: plan.audit, session: plan.session, warnings: plan.warnings };
    const changed = plan.itinerary.findIndex((s, i) => s.place.id !== old[i]);
    this.revs.push({ text: diff.note, fairness: plan.metrics.meanScore });
    const piers = $$('.pier', this.root);
    if (changed >= 0 && !reduced) { piers[changed]?.classList.add('drop'); $$('.node', this.root)[changed]?.classList.add('drop'); await sleep(380); }
    this.#renderPiers();
    if (changed >= 0) this.sel = changed;
    this.#renderPiers(); this.#renderDossier(true); this.#renderLoads(); this.#animateVerdict(false);
    $$('.pier', this.root)[this.sel]?.classList.add('rise'); setTimeout(() => $$('.pier.rise', this.root).forEach((p) => p.classList.remove('rise')), 700);
    const rev = $('#revs', this.root);
    rev.innerHTML = this.revs.map((r, i) => `<li><b>Rev ${revLetter(i)}</b><span>${esc(r.text)}</span><em>${pct(r.fairness)} fair</em></li>`).join('');
    $$('.tb div:nth-child(4) b', this.root).forEach((b) => (b.textContent = revLetter(this.revs.length - 1)));
    $('#night').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  revsHTMLInit() { const rev = $('#revs', this.root); if (rev) rev.innerHTML = this.revs.map((r, i) => `<li><b>Rev ${revLetter(i)}</b><span>${esc(r.text)}</span><em>${pct(r.fairness)} fair</em></li>`).join(''); }
}

/** Distance between neighbouring seats, from the preference vectors Qloo's tags produced. */
export function seatDistances(profile) {
  const ps = profile.people, out = {};
  const d = (a, b) => clamp(Math.sqrt(Object.keys(a.pref).reduce((s, k) => s + (a.pref[k] - b.pref[k]) ** 2, 0)) / 2.2, 0, 1);
  ps.forEach((a, i) => { const b = ps[(i + 1) % ps.length]; if (a !== b) out[`${a.person.id}|${b.person.id}`] = d(a, b); });
  return out;
}
