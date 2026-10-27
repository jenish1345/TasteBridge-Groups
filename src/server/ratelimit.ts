// Best-effort per-IP limiter so a public demo can't burn the Qloo quota. (Per instance; fine for a hackathon.)

const hits = new Map<string, number[]>();

export function allow(ip: string, max = 20, windowMs = 60_000, now = Date.now()): boolean {
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
