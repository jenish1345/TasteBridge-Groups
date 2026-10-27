// Two of you: the original TasteBridge flow. Two seats facing each other; common ground becomes a truss between them.
import { $, $$, COLORS, esc, pct } from './util.js';
import { TableScene } from './scene.js';
import { postJSON } from './api.js';

export function initDuo({ tip, toast }) {
  const root = $('#duoScene');
  const people = [
    { id: 'a', name: 'Alex', anchors: [], avoid: [], isKey: false },
    { id: 'b', name: 'Jordan', anchors: [], avoid: [], isKey: false },
  ];
  const scene = new TableScene(root, { layout: 'duel', max: 2, tip });
  const split = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const sync = () => {
    people[0].name = $('#duoNameA').value.trim() || 'Person A'; people[1].name = $('#duoNameB').value.trim() || 'Person B';
    people[0].anchors = split($('#duoA').value).slice(0, 8).map((text) => ({ text, kind: 'auto' }));
    people[1].anchors = split($('#duoB').value).slice(0, 8).map((text) => ({ text, kind: 'auto' }));
    scene.setPeople(people); scene.refreshPlate();
  };
  $$('#duoForm input, #duoForm textarea').forEach((el) => el.addEventListener('input', sync));
  sync();

  $('#duoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#duoGo'); btn.disabled = true; btn.classList.add('busy');
    scene.begin(); scene.clearConflicts();
    try {
      const r = await postJSON('/api/pair', { a: { name: people[0].name, anchors: split($('#duoA').value) }, b: { name: people[1].name, anchors: split($('#duoB').value) }, city: $('#duoCity').value.trim() || undefined });
      r.people.forEach(() => {});
      people.forEach((p) => p.anchors.forEach((a) => scene.flyIn(scene.seats.find((s) => s.p.id === p.id), a.text)));
      const shared = r.profile.overlapTags.map((t) => t.name);
      scene.addConflict({ a: 'a', b: 'b', label: shared.length ? shared.slice(0, 2).join(' and ') : 'common ground', level: 'low', text: shared.length ? `You both like ${shared.slice(0, 4).join(', ')}.` : 'No shared tags, but neighbouring tastes connect.' });
      const best = r.domains.flatMap((d) => d.picks).map((p) => p.score);
      setTimeout(() => scene.finish({ fairness: best.length ? best.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, best.length) : 0.5, line: 'common ground' }), 900);
      render(r);
    } catch (err) { scene.abort(); toast(err.message); }
    finally { btn.disabled = false; btn.classList.remove('busy'); }
  });

  function render(r) {
    const out = $('#duoOut');
    const conf = r.profile.conflicts.map((c) => `<li><b>${esc(c.label)}</b> ${esc(c.explanation)}</li>`).join('');
    out.innerHTML = `${conf ? `<div class="diffs"><h4>Where you differ</h4><ul>${conf}</ul></div>` : ''}` +
      r.domains.filter((d) => d.picks.length).map((d) => `<div class="dom"><h3>${esc(d.label)}</h3><ol>${d.picks.map((p) => {
        const [x, y] = Object.values(p.affinity);
        return `<li><div><b>${esc(p.name)}</b><span>${esc(p.tags.slice(0, 3).join(', '))}</span></div><div class="pair"><div class="gauge" style="--c:${COLORS[0]}" title="${esc(r.people[0].name)} ${pct(x)}"><i class="on" style="--v:${x}"></i></div><div class="gauge" style="--c:${COLORS[1]}" title="${esc(r.people[1].name)} ${pct(y)}"><i class="on" style="--v:${y}"></i></div></div><strong>${pct(p.score)}</strong></li>`;
      }).join('')}</ol></div>`).join('') + (r.unresolved.length ? `<p class="soft">Couldn't match: ${r.unresolved.map((u) => esc(u.anchor)).join(', ')}.</p>` : '');
    out.hidden = false;
  }
  return scene;
}
