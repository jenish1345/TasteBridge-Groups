// Concurrency + rate limiter (requests-per-second) for outbound Qloo calls.

export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  private nextStart = 0;
  private penaltyUntil = 0;

  constructor(
    private concurrency: number,
    private rps: number,
  ) {}

  /** Back off globally for a while, e.g. after a 429. */
  penalize(ms: number): void {
    this.penaltyUntil = Math.max(this.penaltyUntil, Date.now() + ms);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const gap = 1000 / this.rps;
      const now = Date.now();
      const start = Math.max(now, this.nextStart, this.penaltyUntil);
      this.nextStart = start + gap;
      if (start > now) await sleep(start - now);
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((res) => this.queue.push(() => { this.active++; res(); }));
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
