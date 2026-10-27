// Seat editor: a small drafting-note that opens next to a seat. Edits are live, so the dots orbiting the seat change as you type.
import { $, COLORS, KINDS, KIND_LABEL, SUGGEST, esc, initial } from './util.js';

export function createEditor({ state, scene, onChange }) {
  const el = $('#editor');
  let id = null, seatEl = null, kind = 'auto';

  const person = () => state.people.find((p) => p.id === id);
  const idx = () => state.people.findIndex((p) => p.id === id);

  function chips(p) {
    return p.anchors.length
      ? p.anchors.map((a, j) => `<span class="chip" style="--d:${j * 40}ms">${esc(a.text)}${a.kind !== 'auto' ? `<small>${esc(KIND_LABEL[a.kind] || a.kind)}</small>` : ''}<button type="button" data-rm-anchor="${j}" aria-label="Remove ${esc(a.text)}">×</button></span>`).join('')
      : '<span class="empty">Nothing yet. Add an artist, film, food or a feeling like "quiet".</span>';
  }
  function avoids(p) {
    return p.avoid.map((a, j) => `<span class="chip no">${esc(a)}<button type="button" data-rm-avoid="${j}" aria-label="Remove ${esc(a)}">×</button></span>`).join('');
  }
  function suggestions(p) {
    const have = new Set(p.anchors.map((a) => a.text.toLowerCase()));
    return SUGGEST.filter((s) => !have.has(s.toLowerCase())).slice(0, 4).map((s) => `<button type="button" class="sug" data-sug="${esc(s)}">${esc(s)}</button>`).join('');
  }

  function render() {
    const p = person(); if (!p) return;
    const i = idx(), c = COLORS[i % COLORS.length];
    el.style.setProperty('--c', c);
    el.innerHTML = `
      <div class="ed-head">
        <span class="ed-av">${esc(initial(p.name))}</span>
        <label class="ed-name"><span class="sr">Name</span><input data-name value="${esc(p.name)}" maxlength="40" placeholder="Name" autocomplete="off"></label>
        <button type="button" class="ed-x" data-close aria-label="Close editor">×</button>
      </div>
      <label class="switch"><input type="checkbox" data-key ${p.isKey ? 'checked' : ''}><i></i><span><b>Guest of honor</b><small>What they strongly dislike is ruled out of the plan.</small></span></label>
      <h4>What they love</h4>
      <div class="chips" data-chips>${chips(p)}</div>
      <div class="kinds" role="group" aria-label="Type of thing">${KINDS.map(([v, l]) => `<button type="button" class="pill ${v === kind ? 'on' : ''}" data-kind="${v}" aria-pressed="${v === kind}">${l}</button>`).join('')}</div>
      <div class="add"><input data-anchor placeholder="Type it, press Enter" maxlength="120" autocomplete="off" aria-label="Add something ${esc(p.name)} loves"><button type="button" class="btn small" data-add>Add</button></div>
      <div class="sugs" data-sugs>${suggestions(p)}</div>
      <h4>Hard no's</h4>
      <div class="chips" data-avoids>${avoids(p)}</div>
      <div class="add"><input data-avoid placeholder="e.g. karaoke, spicy" maxlength="40" autocomplete="off" aria-label="Add a hard no for ${esc(p.name)}"><button type="button" class="btn small" data-add-avoid>Add</button></div>
      ${state.people.length > 2 ? `<button type="button" class="rm" data-remove>Remove from the table</button>` : ''}`;
  }

  function place() {
    if (!seatEl) return;
    const r = seatEl.getBoundingClientRect();
    const w = Math.min(360, innerWidth - 24);
    el.style.width = `${w}px`;
    if (innerWidth < 640) { el.style.left = '12px'; el.style.top = 'auto'; el.style.bottom = '12px'; return; }
    if (innerWidth >= 1100) {
      // wide screens: dock beside the headline so the table (and every other seat) stays visible
      const h0 = el.offsetHeight || 460;
      el.style.left = '44px'; el.style.top = `${Math.max(12, Math.min(innerHeight - h0 - 12, 70))}px`; el.style.bottom = 'auto'; return;
    }
    let left = r.right + 18; if (left + w > innerWidth - 12) left = r.left - w - 18;
    left = Math.max(12, Math.min(left, innerWidth - w - 12));
    const h = el.offsetHeight || 460;
    let top = r.top + r.height / 2 - 80; top = Math.max(12, Math.min(top, innerHeight - h - 12));
    el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.bottom = 'auto';
  }

  function open(i, seat) {
    const p = state.people[i]; if (!p) return;
    id = p.id; seatEl = seat; kind = 'auto';
    render(); el.hidden = false; scene.focusId = id;
    requestAnimationFrame(() => { place(); el.classList.add('open'); el.querySelector('[data-anchor]')?.focus({ preventScroll: true }); });
  }
  function close() {
    if (el.hidden) return;
    el.classList.remove('open'); scene.focusId = null;
    setTimeout(() => { if (!el.classList.contains('open')) el.hidden = true; }, 220);
    seatEl?.focus({ preventScroll: true }); id = null;
  }
  const changed = () => { scene.setPeople(state.people); onChange?.(); };

  function addAnchor(text) {
    const p = person(); const v = text.trim(); if (!p || !v || p.anchors.length >= 8) return;
    if (p.anchors.some((a) => a.text.toLowerCase() === v.toLowerCase())) return;
    p.anchors.push({ text: v, kind }); changed();
    $('[data-chips]', el).innerHTML = chips(p); $('[data-sugs]', el).innerHTML = suggestions(p);
    const inp = $('[data-anchor]', el); inp.value = ''; inp.focus();
  }
  function addAvoid(text) {
    const p = person(); const v = text.trim(); if (!p || !v || p.avoid.length >= 8) return;
    if (!p.avoid.includes(v)) p.avoid.push(v); changed();
    $('[data-avoids]', el).innerHTML = avoids(p); const inp = $('[data-avoid]', el); inp.value = ''; inp.focus();
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const p = person(); if (!p) return;
    if (t.dataset.close !== undefined) return close();
    if (t.dataset.rmAnchor !== undefined) { p.anchors.splice(+t.dataset.rmAnchor, 1); changed(); $('[data-chips]', el).innerHTML = chips(p); $('[data-sugs]', el).innerHTML = suggestions(p); }
    else if (t.dataset.rmAvoid !== undefined) { p.avoid.splice(+t.dataset.rmAvoid, 1); changed(); $('[data-avoids]', el).innerHTML = avoids(p); }
    else if (t.dataset.kind) { kind = t.dataset.kind; $$k().forEach((b) => { const on = b.dataset.kind === kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
    else if (t.dataset.sug) addAnchor(t.dataset.sug);
    else if (t.dataset.add !== undefined) addAnchor($('[data-anchor]', el).value);
    else if (t.dataset.addAvoid !== undefined) addAvoid($('[data-avoid]', el).value);
    else if (t.dataset.remove !== undefined) { const i = idx(); state.people.splice(i, 1); el.classList.remove('open'); el.hidden = true; scene.focusId = null; id = null; changed(); }
  });
  const $$k = () => [...el.querySelectorAll('[data-kind]')];
  el.addEventListener('input', (e) => {
    const p = person(); if (!p) return;
    if (e.target.matches('[data-name]')) { p.name = e.target.value; $('.ed-av', el).textContent = initial(p.name); changed(); }
  });
  el.addEventListener('change', (e) => { const p = person(); if (p && e.target.matches('[data-key]')) { state.people.forEach((q) => (q.isKey = false)); p.isKey = e.target.checked; changed(); } });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-anchor]')) { e.preventDefault(); addAnchor(e.target.value); }
    if (e.key === 'Enter' && e.target.matches('[data-avoid]')) { e.preventDefault(); addAvoid(e.target.value); }
    if (e.key === 'Escape') close();
  });
  document.addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target) && !e.target.closest('.seat')) close(); });
  addEventListener('resize', place);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });

  return { open, close, get isOpen() { return !el.hidden; } };
}
