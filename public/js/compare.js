// "The same night, drawn two ways": a draggable curtain between the Qloo plan and a generic guess.
import { $, $$, COLORS, esc, initial, pct } from './util.js';
import { onceVisible, reduced } from './motion.js';

export function renderCompare(root, data) {
  const q = data.withQloo, b = data.withoutQloo;
  const who = Object.fromEntries(q.profile.people.map((p, i) => [p.person.id, { name: p.person.name, c: COLORS[i % COLORS.length] }]));
  const withStops = q.itinerary.map((s) => `<li><b>${esc(s.time || '')}</b><div><h4>${esc(s.place.name)}</h4><p>${esc(s.why)}</p>
      <div class="meta"><span class="avs">${s.serves.slice(0, 5).map((x) => `<i style="--c:${who[x.personId]?.c}" title="${esc(x.name)}">${esc(initial(x.name))}</i>`).join('')}</span><span>${s.evidence.qlooEntityIds.length} Qloo entities, ${s.evidence.candidateTags.length} tags, ${s.evidence.affinitySignals.length} affinity scores</span></div></div></li>`).join('');
  const withoutStops = b.stops.map((s, i) => `<li><b>${esc(q.itinerary[i]?.time || '')}</b><div><h4>${esc(s.name)}</h4><p>${esc(s.why)}</p><div class="meta"><span class="none">No entity, no tags, no affinity scores</span></div></div></li>`).join('');
  const rows = data.scorecard.map((r) => `<tr><th scope="row">${esc(r.label)}<small>${esc(r.note)}</small></th><td class="q">${esc(r.withQloo)}</td><td>${esc(r.withoutQloo)}</td></tr>`).join('');
  root.hidden = false;
  root.innerHTML = `
    <header class="sh"><h2>The same night, drawn two ways</h2><p>Drag the line across. On the left, the plan built from Qloo. On the right, what a generic recommender suggests for the same five people.</p></header>
    <div class="curtain" style="--x:96%">
      <div class="layer with"><h3>With Qloo <span class="tag ${q.dataMode === 'live' ? 'live' : 'smp'}">${q.dataMode === 'live' ? 'live data' : 'sample data'}</span></h3><ol>${withStops}</ol></div>
      <div class="layer without"><h3>Without Qloo <span class="tag">${esc(b.label)}</span></h3><p class="soft">${esc(b.note)}</p><ol>${withoutStops}</ol></div>
      <button type="button" class="handle" role="slider" aria-label="Reveal the plan made with or without Qloo" aria-valuemin="4" aria-valuemax="96" aria-valuenow="50"><span><i></i><i></i></span></button>
    </div>
    <div class="score-wrap"><table class="scoretbl"><thead><tr><th>What we measured</th><th>With Qloo</th><th>Without</th></tr></thead><tbody>${rows}</tbody></table></div>
    <footer class="tb"><div><small>Sheet</small><b>Two drawings</b></div><div><small>Compared</small><b>${esc(q.session.request.constraints.city)}</b></div></footer>`;
  const cur = $('.curtain', root), handle = $('.handle', root);
  const set = (x) => { x = Math.max(4, Math.min(96, x)); cur.style.setProperty('--x', `${x}%`); handle.setAttribute('aria-valuenow', Math.round(x)); cur.dataset.x = x; };
  set(reduced ? 50 : 96);
  let drag = false;
  const move = (e) => { const r = cur.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  handle.addEventListener('pointerdown', (e) => { drag = true; handle.setPointerCapture(e.pointerId); cur.classList.add('drag'); });
  handle.addEventListener('pointermove', (e) => drag && move(e));
  handle.addEventListener('pointerup', () => { drag = false; cur.classList.remove('drag'); });
  cur.addEventListener('pointerdown', (e) => { if (!e.target.closest('.handle')) { move(e); } });
  handle.addEventListener('keydown', (e) => { const x = +cur.dataset.x || 50; if (e.key === 'ArrowLeft') { set(x - 4); e.preventDefault(); } if (e.key === 'ArrowRight') { set(x + 4); e.preventDefault(); } });
  let touched = false; cur.addEventListener('pointerdown', () => (touched = true));
  onceVisible(cur, () => {
    if (reduced) return;
    const t0 = performance.now(), from = 96, to = 50;
    const f = (now) => { if (touched) return; const p = Math.min(1, (now - t0) / 1500); set(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    setTimeout(() => requestAnimationFrame(f), 350);
  }, 0.4);
}
