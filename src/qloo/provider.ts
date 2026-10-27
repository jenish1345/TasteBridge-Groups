// Provider factory + a resilient wrapper that degrades from live → sample-fallback per call, visibly.

import { loadConfig, type Config } from '../config.js';
import type { InsightsParams, InsightsResult, ProviderStats, QlooEntity, QlooProvider, QlooTag } from '../types.js';
import { LiveQlooProvider, QlooAuthError } from './live.js';
import { SampleQlooProvider } from './sample.js';

/**
 * Wraps the live provider. If a Qloo call ultimately fails (outage, auth, rate limit exhaustion), we
 * serve fixtures for THAT call only, tag every returned entity `sample-fallback`, and expose the count so the
 * UI can say "live-degraded". Live data is never silently mixed in as if it were real.
 */
export class ResilientProvider implements QlooProvider {
  readonly mode = 'live' as const;
  private fallback = new SampleQlooProvider();
  private fallbacks = 0;
  readonly lastErrors: string[] = [];

  constructor(private live: LiveQlooProvider) {}

  stats(): ProviderStats {
    return { ...this.live.stats(), fallbacks: this.fallbacks };
  }

  private note(err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (!this.lastErrors.includes(msg)) this.lastErrors.push(msg);
    this.fallbacks++;
  }

  private mark<T extends QlooEntity>(es: T[]): T[] {
    return es.map((e) => ({ ...e, source: 'sample-fallback' as const }));
  }

  async searchEntity(q: string, o?: { types?: string[]; take?: number }): Promise<QlooEntity[]> {
    try {
      return await this.live.searchEntity(q, o);
    } catch (e) {
      if (e instanceof QlooAuthError) throw e;
      this.note(e);
      return this.mark(await this.fallback.searchEntity(q, o));
    }
  }

  async searchTags(q: string, o?: { take?: number }): Promise<QlooTag[]> {
    try {
      return await this.live.searchTags(q, o);
    } catch (e) {
      if (e instanceof QlooAuthError) throw e;
      this.note(e);
      return this.fallback.searchTags(q, o);
    }
  }

  async insights(p: InsightsParams): Promise<InsightsResult> {
    try {
      return await this.live.insights(p);
    } catch (e) {
      if (e instanceof QlooAuthError) throw e;
      this.note(e);
      const r = await this.fallback.insights(p);
      return { entities: this.mark(r.entities), warnings: [...r.warnings, 'Qloo unavailable for this query — used SAMPLE fallback'] };
    }
  }
}

let sharedLive: QlooProvider | undefined;

/** Singleton-per-process so the server-side cache survives across requests (warm serverless instances too). */
export function getProvider(cfg: Config = loadConfig()): QlooProvider {
  if (!cfg.qlooKey) return new SampleQlooProvider();
  if (!sharedLive) sharedLive = new ResilientProvider(new LiveQlooProvider(cfg));
  return sharedLive;
}

export function resetProviderForTests(): void {
  sharedLive = undefined;
}
