// TasteBridge CLI: `group` (new), `pair` (original two-person flow), `resolve`, `compare`.
import { readFileSync } from 'node:fs';
import { runGroupAgent } from '../agent/agent.js';
import { comparePlans } from '../agent/compare.js';
import { findCommonGround } from '../core/pair.js';
import { parseRequest, UserError } from '../core/request.js';
import { DEMO_REQUEST } from '../demo.js';
import { loadConfig } from '../config.js';
import { formatPair, formatPlan } from '../format.js';
import { getProvider } from '../qloo/provider.js';
import { resolveAnchor } from '../qloo/resolve.js';
import type { AnchorKind, GroupRequest } from '../types.js';

const HELP = `TasteBridge Groups CLI

  tastebridge group  --demo | --file plan.json | --person "Name: a, b, c" [--person ...] --city "New York"
                     [--when 2026-11-14T19:00] [--budget 3] [--hood "East Village"] [--dietary vegan,halal]
                     [--access wheelchair] [--vibe "no loud venues"] [--key Name] [--avoid "Name: karaoke,spicy"]
                     [--no-winddown] [--json] [--trace] [--compare]
  tastebridge pair   --a "Alex: Radiohead, Parasite" --b "Jordan: Taylor Swift, Barbie" [--city "New York"] [--json]
  tastebridge resolve "Radiohead" "Mad Max" "hot pot"

Anchors may be tagged with a kind: "artist:Radiohead", "movie:Parasite", "food:ramen", "vibe:quiet".
Without QLOO_API_KEY the CLI runs in clearly-labelled SAMPLE DATA mode.`;

const KINDS = new Set(['artist', 'movie', 'tv_show', 'book', 'videogame', 'brand', 'place', 'food', 'vibe']);

function anchor(raw: string) {
  const m = /^(\w+):(.+)$/.exec(raw.trim());
  if (m && KINDS.has(m[1])) return { text: m[2].trim(), kind: m[1] as AnchorKind };
  return { text: raw.trim(), kind: 'auto' as const };
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string[]> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) (flags[k] ??= []).push('true');
      else { (flags[k] ??= []).push(next); i++; }
    } else rest.push(a);
  }
  return { flags, rest };
}

const one = (f: Record<string, string[]>, k: string) => f[k]?.[f[k].length - 1];

function personFromFlag(s: string) {
  const [name, list = ''] = s.split(/:(.*)/s);
  return { name: name.trim(), anchors: list.split(',').map((x) => x.trim()).filter(Boolean).map(anchor) };
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (!cmd || cmd === 'help' || flags.help) return console.log(HELP);
  const mode = getProvider(loadConfig()).mode;
  if (mode === 'sample') console.error('[SAMPLE DATA mode — set QLOO_API_KEY for live Qloo results]\n');

  if (cmd === 'resolve') {
    const qloo = getProvider(loadConfig());
    for (const a of rest) {
      const r = await resolveAnchor(anchor(a), { qloo });
      console.log(`${a} → ${r.status === 'resolved' ? `${r.entity?.name ?? r.tag?.name} (${r.entity?.type ?? 'tag'}) ${r.entity?.id ?? r.tag?.id} [${Math.round(r.confidence * 100)}%]` : 'UNRESOLVED'}`);
    }
    return;
  }

  if (cmd === 'pair') {
    const a = personFromFlag(one(flags, 'a') ?? ''); const b = personFromFlag(one(flags, 'b') ?? '');
    if (!a.anchors.length || !b.anchors.length) throw new UserError('Provide --a "Name: anchors" and --b "Name: anchors".');
    const r = await findCommonGround({ a, b, city: one(flags, 'city') });
    return console.log(flags.json ? JSON.stringify(r, null, 2) : formatPair(r));
  }

  if (cmd === 'group') {
    let req: GroupRequest;
    if (flags.demo) req = parseRequest(DEMO_REQUEST);
    else if (one(flags, 'file')) req = parseRequest(JSON.parse(readFileSync(one(flags, 'file')!, 'utf8')));
    else {
      const avoid = Object.fromEntries((flags.avoid ?? []).map((s) => { const [n, l = ''] = s.split(/:(.*)/s); return [n.trim().toLowerCase(), l.split(',').map((x) => x.trim()).filter(Boolean)]; }));
      const keys = new Set((flags.key ?? []).map((k) => k.toLowerCase()));
      const people = (flags.person ?? []).map(personFromFlag).map((p) => ({ ...p, isKey: keys.has(p.name.toLowerCase()), avoid: avoid[p.name.toLowerCase()] }));
      req = parseRequest({
        people,
        constraints: {
          city: one(flags, 'city') ?? '',
          neighborhood: one(flags, 'hood'),
          datetime: one(flags, 'when'),
          budget: one(flags, 'budget') ? Number(one(flags, 'budget')) : undefined,
          dietary: one(flags, 'dietary')?.split(','),
          accessibility: one(flags, 'access')?.split(','),
          vibes: flags.vibe,
        },
        includeWindDown: !flags['no-winddown'],
      });
    }
    if (flags.compare) {
      const r = await comparePlans(req);
      if (flags.json) return console.log(JSON.stringify(r, null, 2));
      console.log(formatPlan(r.withQloo, { trace: !!flags.trace }));
      console.log('\n=== WITHOUT QLOO ===\n' + r.withoutQloo.label + '\n' + r.withoutQloo.stops.map((s) => `  - ${s.title}: ${s.why}`).join('\n'));
      console.log('\n=== SCORECARD ===\n' + r.scorecard.map((s) => `  ${s.label}: with Qloo ${s.withQloo} | without ${s.withoutQloo}`).join('\n'));
      return;
    }
    const r = await runGroupAgent(req);
    return console.log(flags.json ? JSON.stringify(r, null, 2) : formatPlan(r, { trace: !!flags.trace }));
  }

  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof UserError ? `Error: ${e.message}` : `Failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
