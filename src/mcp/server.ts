// TasteBridge MCP server (stdio). Tools: plan_group_outing, rebalance_group_plan, find_common_ground, resolve_taste_anchors.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runGroupAgent } from '../agent/agent.js';
import { findCommonGround } from '../core/pair.js';
import { rebalance } from '../core/plan.js';
import { parseRequest, PersonSchema, ConstraintsSchema, UserError } from '../core/request.js';
import { loadConfig } from '../config.js';
import { formatPair, formatPlan } from '../format.js';
import { getProvider } from '../qloo/provider.js';
import { resolveAnchor } from '../qloo/resolve.js';
import type { PlanResult, SessionState } from '../types.js';

const server = new McpServer({ name: 'tastebridge', version: '2.0.0' });
const plans = new Map<string, SessionState>();
let counter = 0;

const text = (t: string, structured?: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: t }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof UserError ? e.message : 'TasteBridge failed to complete the request.' }] });

function compact(r: PlanResult, planId: string) {
  return {
    plan_id: planId,
    data_mode: r.dataMode,
    banner: r.banner,
    metrics: r.metrics,
    conflicts: r.profile.conflicts,
    itinerary: r.itinerary.map((s) => ({
      slot: s.slot,
      time: s.time,
      place: s.place.name,
      qloo_entity_id: s.place.id,
      fairness: s.score,
      why: s.why,
      serves: s.serves,
      conflicts: s.conflicts,
      evidence: { source: s.evidence.source, tags: s.evidence.candidateTags.map((t) => t.name), signals: s.evidence.signals, affinities: s.evidence.affinitySignals },
      warnings: s.warnings,
    })),
    warnings: r.warnings,
    unresolved: r.unresolved,
  };
}

server.registerTool(
  'plan_group_outing',
  {
    title: 'Plan a group outing',
    description:
      'Plan a fair, multi-stop outing (activity, food, drink/dessert, optional wind-down) for 2–8 people using Qloo Taste AI. ' +
      'Each person gives taste anchors (artists, films, shows, books, games, brands, foods, places, vibes). The agent resolves them to Qloo entities, ' +
      'detects taste conflicts (loud/quiet, spicy/mild, nightlife/family, experimental/mainstream, expensive/budget), scores venues with ' +
      'coverage*0.5 + min_affinity*0.3 + conflict_penalty*0.2, and guarantees every person a personal win. Returns a plan_id usable with rebalance_group_plan.',
    inputSchema: {
      people: z.array(PersonSchema).min(2).max(8).describe('2–8 people; anchors may be plain strings or {text, kind}'),
      constraints: ConstraintsSchema.describe('city is required; also neighborhood, datetime, budget 1–4, dietary, accessibility, vibes'),
      includeWindDown: z.boolean().optional(),
    },
  },
  async (args) => {
    try {
      const r = await runGroupAgent(parseRequest(args));
      const id = `plan_${++counter}`;
      plans.set(id, r.session);
      if (plans.size > 25) plans.delete(plans.keys().next().value as string);
      return text(formatPlan(r), compact(r, id));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'rebalance_group_plan',
  {
    title: 'Rebalance one stop',
    description: 'Swap one stop of a plan from plan_group_outing (or the weakest stop if none given) while preserving every personal win and keeping fairness within 3 points.',
    inputSchema: { plan_id: z.string(), stop: z.enum(['activity', 'food', 'drink', 'winddown', 'encore']).optional() },
  },
  async ({ plan_id, stop }) => {
    const s = plans.get(plan_id);
    if (!s) return fail(new UserError(`Unknown plan_id "${plan_id}". Run plan_group_outing first.`));
    const r = rebalance(s, stop);
    plans.set(plan_id, r.session);
    const lines = [r.diff.note, '', ...r.assembled.itinerary.map((i) => `${i.time ?? ''} ${i.title} [${Math.round(i.score.score * 100)}%]`)];
    return text(lines.join('\n'), { plan_id, rebalance: r.diff, metrics: r.assembled.metrics, itinerary: r.assembled.itinerary.map((i) => ({ slot: i.slot, place: i.place.name, score: i.score.score })) });
  },
);

server.registerTool(
  'find_common_ground',
  {
    title: 'Find common ground (two people)',
    description: 'The original two-person TasteBridge flow: given taste anchors for two people, return films, shows, music, books, games, brands (and places if a city is given) both would enjoy, with per-person affinity.',
    inputSchema: {
      person_a: z.object({ name: z.string(), anchors: z.array(z.string()).min(1).max(10) }),
      person_b: z.object({ name: z.string(), anchors: z.array(z.string()).min(1).max(10) }),
      city: z.string().optional(),
    },
  },
  async ({ person_a, person_b, city }) => {
    try {
      const r = await findCommonGround({ a: person_a, b: person_b, city });
      return text(formatPair(r), { data_mode: r.dataMode, domains: r.domains, shared_tags: r.profile.overlapTags, conflicts: r.profile.conflicts, unresolved: r.unresolved });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  'resolve_taste_anchors',
  {
    title: 'Resolve taste anchors to Qloo entities',
    description: 'Resolve free-text taste anchors (e.g. "Radiohead", "Mad Max", "hot pot") to Qloo entities/tags, with retries and broadened lookups.',
    inputSchema: { anchors: z.array(z.string()).min(1).max(20) },
  },
  async ({ anchors }) => {
    const qloo = getProvider(loadConfig());
    const res = await Promise.all(anchors.map((a) => resolveAnchor({ text: a, kind: 'auto' }, { qloo })));
    const rows = res.map((r) => ({ input: r.anchor.text, status: r.status, name: r.entity?.name ?? r.tag?.name, id: r.entity?.id ?? r.tag?.id, type: r.entity?.type ?? (r.tag ? 'tag' : undefined), confidence: Math.round(r.confidence * 100) / 100, method: r.method, note: r.note }));
    return text(rows.map((r) => `${r.input} → ${r.status === 'resolved' ? `${r.name} (${r.type}, ${r.id})` : 'UNRESOLVED'}`).join('\n') + (qloo.mode === 'sample' ? '\n\n(SAMPLE DATA mode — QLOO_API_KEY not set)' : ''), { data_mode: qloo.mode, results: rows });
  },
);

await server.connect(new StdioServerTransport());
console.error(`[tastebridge-mcp] ready (${getProvider(loadConfig()).mode === 'live' ? 'live Qloo' : 'SAMPLE DATA mode'})`);
