// Optional LLM adapter (Anthropic or OpenAI-compatible). Keys come from env and never reach the browser.
// Everything in the product works without an LLM; it only enriches wording, anchor rewrites and the baseline.

import type { Config } from '../config.js';

export interface Llm {
  name: string;
  complete(system: string, user: string, opts?: { maxTokens?: number }): Promise<string>;
}

export function getLlm(cfg: Config): Llm | undefined {
  if (cfg.anthropicKey) {
    const model = cfg.llmModel ?? 'claude-sonnet-5-5';
    return {
      name: `anthropic:${model}`,
      async complete(system, user, opts) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': cfg.anthropicKey!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: opts?.maxTokens ?? 1500, system, messages: [{ role: 'user', content: user }] }),
          signal: AbortSignal.timeout(40_000),
        });
        if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
        const j: any = await res.json();
        return (j.content ?? []).map((b: any) => b.text ?? '').join('');
      },
    };
  }
  if (cfg.openaiKey) {
    const model = cfg.llmModel ?? cfg.openaiModel;
    return {
      name: `openai:${model}`,
      async complete(system, user, opts) {
        const res = await fetch(`${cfg.openaiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.openaiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: opts?.maxTokens ?? 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
          signal: AbortSignal.timeout(40_000),
        });
        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
        const j: any = await res.json();
        return j.choices?.[0]?.message?.content ?? '';
      },
    };
  }
  return undefined;
}

/** Pull the first JSON object/array out of an LLM reply. */
export function extractJson<T = unknown>(text: string): T | undefined {
  const m = /[[{][\s\S]*[\]}]/.exec(text);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return undefined;
  }
}
