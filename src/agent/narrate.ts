// Optional LLM narration. The LLM may only rephrase facts we pass in; on any problem we keep the template text.

import type { ItineraryStop } from '../types.js';
import { extractJson, type Llm } from './llm.js';

const SYSTEM =
  'You rewrite itinerary explanations for a group-outing planner. You may ONLY use facts present in the JSON given. ' +
  'Do not invent venues, tags, people, numbers or claims. Keep each "why" to at most 2 sentences. ' +
  'Reply with JSON only: {"headline": string, "stops": [{"title": string, "why": string}]}.';

export async function narrate(llm: Llm | undefined, stops: ItineraryStop[]): Promise<{ headline?: string; stops: ItineraryStop[]; used: boolean }> {
  if (!llm) return { stops, used: false };
  try {
    const facts = stops.map((s) => ({
      title: s.title,
      why: s.why,
      serves: s.serves.map((x) => `${x.name}: ${x.reason}`),
      conflicts: s.conflicts.map((c) => `${c.text} → ${c.resolution}`),
      tags: s.evidence.candidateTags.map((t) => t.name),
    }));
    const raw = await llm.complete(SYSTEM, JSON.stringify(facts), { maxTokens: 1200 });
    const parsed = extractJson<{ headline?: string; stops?: { title: string; why: string }[] }>(raw);
    if (!parsed?.stops || !Array.isArray(parsed.stops)) return { stops, used: false };
    const byTitle = new Map(parsed.stops.map((s) => [s.title, s.why]));
    const out = stops.map((s) => {
      const w = byTitle.get(s.title);
      return w && w.length <= 420 ? { ...s, why: w } : s;
    });
    return { headline: parsed.headline?.slice(0, 160), stops: out, used: true };
  } catch {
    return { stops, used: false };
  }
}
