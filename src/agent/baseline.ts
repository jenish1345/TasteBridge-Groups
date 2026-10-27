// "Without Qloo" baseline: what you get from a generic LLM guess (or a canned template when no LLM key is set).

import type { GroupRequest, SlotId } from '../types.js';
import { SLOT_META, SLOT_ORDER } from '../core/slots.js';
import { extractJson, type Llm } from './llm.js';

export interface BaselineStop {
  slot: SlotId;
  title: string;
  name: string;
  why: string;
}

export interface BaselineResult {
  source: 'llm' | 'template';
  label: string;
  model?: string;
  stops: BaselineStop[];
  note: string;
}

const GENERIC: Record<SlotId, { name: string; why: string }> = {
  activity: { name: 'A popular, well-reviewed local attraction', why: 'Crowd-pleasers like museums or a movie are usually a safe choice for groups.' },
  food: { name: 'A highly rated restaurant with a varied menu', why: 'A varied menu (pizza, pasta, salads) tends to suit most dietary needs and tastes.' },
  drink: { name: 'A trendy cocktail bar or dessert café', why: 'Drinks or dessert give everyone something to enjoy and keep conversation flowing.' },
  winddown: { name: 'A relaxed evening stroll or rooftop view', why: 'A calm finish lets the group unwind after a busy evening.' },
};

export async function baselinePlan(req: GroupRequest, llm: Llm | undefined): Promise<BaselineResult> {
  const slots = (req.slots?.length ? req.slots : SLOT_ORDER).filter((s) => s !== 'winddown' || req.includeWindDown !== false);
  const c = req.constraints;
  if (llm) {
    try {
      const prompt =
        `Plan a ${slots.length}-stop group outing in ${c.city}${c.neighborhood ? ` (${c.neighborhood})` : ''}` +
        `${c.datetime ? ` on ${c.datetime}` : ''}. Budget level: ${c.budget ?? 'any'}/4. Dietary: ${(c.dietary ?? []).join(', ') || 'none'}. ` +
        `Accessibility: ${(c.accessibility ?? []).join(', ') || 'none'}. Vibe: ${(c.vibes ?? []).join(', ') || 'any'}.\n` +
        `Group:\n` +
        req.people.map((p) => `- ${p.name}: likes ${p.anchors.map((a) => a.text).join(', ')}${p.avoid?.length ? `; avoids ${p.avoid.join(', ')}` : ''}`).join('\n') +
        `\nStops needed (in order): ${slots.join(', ')}.\n` +
        `Reply with JSON only: {"stops":[{"slot": "<slot>", "name": "<venue name>", "why": "<one sentence>"}]}`;
      const raw = await llm.complete('You are a helpful local-recommendations assistant.', prompt, { maxTokens: 900 });
      const parsed = extractJson<{ stops?: { slot: string; name: string; why: string }[] }>(raw);
      if (parsed?.stops?.length) {
        return {
          source: 'llm',
          label: 'Generic LLM guess (no Qloo)',
          model: llm.name,
          stops: slots.map((slot, i) => {
            const s = parsed.stops!.find((x) => x.slot === slot) ?? parsed.stops![i];
            return { slot, title: `${SLOT_META[slot].label}: ${s?.name ?? GENERIC[slot].name}`, name: s?.name ?? GENERIC[slot].name, why: s?.why ?? GENERIC[slot].why };
          }),
          note: 'Venue names come from the model’s memory — unverified, with no affinity data behind them.',
        };
      }
    } catch {
      /* fall through to template */
    }
  }
  return {
    source: 'template',
    label: 'Generic suggestions (no Qloo, no LLM key configured)',
    stops: slots.map((slot) => ({ slot, title: `${SLOT_META[slot].label}: ${GENERIC[slot].name}`, name: GENERIC[slot].name, why: GENERIC[slot].why })),
    note: 'No LLM key is configured, so this shows the kind of generic, popularity-style advice an ungrounded assistant gives. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to see a real LLM baseline.',
  };
}
