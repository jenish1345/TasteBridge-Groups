// Request schema + normalisation shared by the web API, CLI and MCP server.

import { z } from 'zod';
import type { GroupRequest } from '../types.js';

export class UserError extends Error {
  status = 400;
}

const AnchorKind = z.enum(['auto', 'artist', 'movie', 'tv_show', 'book', 'videogame', 'brand', 'place', 'food', 'vibe']);

const AnchorSchema = z.union([
  z.string().min(1).max(120).transform((text) => ({ text, kind: 'auto' as const })),
  z.object({ text: z.string().min(1).max(120), kind: AnchorKind.default('auto') }),
]);

export const PersonSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().min(1).max(40),
  anchors: z.array(AnchorSchema).max(10).default([]),
  avoid: z.array(z.string().min(1).max(40)).max(8).optional(),
  isKey: z.boolean().optional(),
});

export const ConstraintsSchema = z.object({
  city: z.string().min(1).max(80),
  neighborhood: z.string().max(80).optional().or(z.literal('').transform(() => undefined)),
  datetime: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
  budget: z.number().int().min(1).max(4).optional(),
  dietary: z.array(z.string().max(40)).max(8).optional(),
  accessibility: z.array(z.string().max(40)).max(8).optional(),
  vibes: z.array(z.string().max(80)).max(8).optional(),
});

export const GroupRequestSchema = z.object({
  people: z.array(PersonSchema).min(2, 'Add at least 2 people').max(8, 'At most 8 people'),
  constraints: ConstraintsSchema,
  slots: z.array(z.enum(['activity', 'food', 'drink', 'winddown'])).max(4).optional(),
  includeWindDown: z.boolean().optional(),
});

export function parseRequest(input: unknown): GroupRequest {
  const r = GroupRequestSchema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
    throw new UserError(msg);
  }
  const used = new Set<string>();
  const people = r.data.people.map((p, i) => {
    let id = (p.id || `p${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || used.has(id)) id = `p${i + 1}`;
    used.add(id);
    return { ...p, id, name: p.name.trim(), anchors: p.anchors.slice(0, 8) };
  });
  const names = new Set<string>();
  for (const p of people) {
    const k = p.name.toLowerCase();
    if (names.has(k)) p.name = `${p.name} ${p.id.replace('p', '')}`;
    names.add(p.name.toLowerCase());
  }
  return { ...r.data, people } as GroupRequest;
}
