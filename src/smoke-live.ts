// `npm run smoke:live` — verifies your QLOO_API_KEY end to end against the real API and prints a pass/fail report.
import { runGroupAgent } from './agent/agent.js';
import { loadConfig } from './config.js';
import { parseRequest } from './core/request.js';
import { inCity } from './core/slots.js';
import { DEMO_REQUEST } from './demo.js';

const cfg = loadConfig();
if (!cfg.qlooKey) {
  console.error('QLOO_API_KEY is not set (put it in .env). Nothing to smoke-test.');
  process.exit(2);
}
const checks: [string, boolean, string?][] = [];
const t0 = Date.now();
const r = await runGroupAgent(parseRequest(DEMO_REQUEST), { llm: null });
const secs = (Date.now() - t0) / 1000;
const city = DEMO_REQUEST.constraints.city;
checks.push(['data mode is live', r.dataMode === 'live', r.dataMode]);
checks.push(['no sample fallbacks', r.stats.fallbacks === 0, `${r.stats.fallbacks}`]);
checks.push(['no request failures', r.stats.failures === 0, `${r.stats.failures}`]);
checks.push(['every anchor resolved', r.unresolved.length === 0, r.unresolved.map((u) => u.anchor).join(', ') || 'all']);
checks.push(['4 stops', r.itinerary.length >= 4, `${r.itinerary.length}`]);
checks.push([`every venue is in ${city}`, r.itinerary.every((s) => inCity({ ...r.session.pools[s.slot === 'encore' ? 'drink' : s.slot]?.find((c) => c.entity.id === s.place.id)!.entity }, city))]);
checks.push(['every stop has Qloo entity id + tags', r.itinerary.every((s) => s.evidence.qlooEntityIds[0] && s.evidence.candidateTags.length > 0)]);
checks.push(['everyone has a personal win', r.metrics.peopleWithoutWin.length === 0]);
checks.push([`finished in under 60s (Vercel limit)`, secs < 60, `${secs.toFixed(1)}s`]);
const withHours = r.itinerary.filter((s) => s.place.openNote).length;
checks.push(['opening hours available for some stops', withHours > 0, `${withHours}/${r.itinerary.length}`]);

for (const [name, ok, note] of checks) console.log(`${ok ? '✓' : '✗'} ${name}${note ? `  (${note})` : ''}`);
console.log(`\n${r.itinerary.map((s) => `${s.time} ${s.place.name}`).join(' → ')}`);
console.log(`Qloo calls: ${r.stats.calls} · retries: ${r.stats.retries} · 429s: ${r.stats.rateLimited}`);
const failed = checks.filter((c) => !c[1]).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
