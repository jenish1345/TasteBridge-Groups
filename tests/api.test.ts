import { afterEach, describe, expect, it } from 'vitest';
import { resetProviderForTests } from '../src/qloo/provider.js';
import { compare, demo, health, plan, pair, rebalanceHandler } from '../src/server/handlers.js';
import { allow } from '../src/server/ratelimit.js';

describe('HTTP handlers', () => {
  afterEach(() => { delete process.env.QLOO_API_KEY; delete process.env.ANTHROPIC_API_KEY; resetProviderForTests(); });

  it('health reports sample mode when no key is set', async () => {
    const r = await health({ method: 'GET' });
    expect(r.status).toBe(200);
    expect((r.body as any).qloo).toBe('sample');
  });

  it('never leaks key values to the client, even when keys are configured', async () => {
    process.env.QLOO_API_KEY = 'sk-qloo-should-never-leak';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-never-leak';
    resetProviderForTests();
    const r = await health({ method: 'GET' });
    const s = JSON.stringify(r.body);
    expect((r.body as any).qloo).toBe('live');
    expect(s).not.toContain('should-never-leak');
  });

  it('rejects bad input with a 400 and a readable message', async () => {
    const r = await plan({ method: 'POST', body: { people: [], constraints: {} } });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toMatch(/people|city/);
    expect((await plan({ method: 'GET' })).status).toBe(405);
  });

  it('plan → rebalance round-trip through the stateless session', async () => {
    const d: any = (await demo({ method: 'GET' })).body;
    const p = await plan({ method: 'POST', body: d.request });
    expect(p.status).toBe(200);
    const body: any = p.body;
    expect(body.itinerary.length).toBeGreaterThanOrEqual(4);
    const rb = await rebalanceHandler({ method: 'POST', body: { session: body.session } });
    expect(rb.status).toBe(200);
    expect((rb.body as any).rebalance.winsPreserved).toBe(true);
    expect((await rebalanceHandler({ method: 'POST', body: {} })).status).toBe(400);
  });

  it('compare returns both planners and a scorecard', async () => {
    const d: any = (await demo({ method: 'GET' })).body;
    const r: any = (await compare({ method: 'POST', body: d.request })).body;
    expect(r.withQloo.itinerary.length).toBeGreaterThan(0);
    expect(r.withoutQloo.stops.length).toBeGreaterThan(0);
    expect(r.scorecard.length).toBeGreaterThan(3);
  });

  it('pair (two-person flow) still works', async () => {
    const r: any = (await pair({ method: 'POST', body: { a: { name: 'A', anchors: ['Radiohead', 'Parasite'] }, b: { name: 'B', anchors: ['Taylor Swift', 'Barbie'] } } })).body;
    expect(r.ok).toBe(true);
    expect(r.domains.find((x: any) => x.domain === 'movie').picks.length).toBeGreaterThan(0);
  });

  it('rate limiter blocks bursts per IP', () => {
    const t = 1_000_000;
    const results = Array.from({ length: 5 }, () => allow('1.2.3.4', 3, 60_000, t));
    expect(results).toEqual([true, true, true, false, false]);
    expect(allow('1.2.3.4', 3, 60_000, t + 61_000)).toBe(true);
  });
});
