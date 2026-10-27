// Name matching used for entity resolution (and by the sample provider's search).

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between a user's text and a candidate entity name. */
export function nameSimilarity(query: string, candidate: string): number {
  const a = normName(query);
  const b = normName(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const levScore = 1 - lev(a, b) / Math.max(a.length, b.length);
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jacc = inter / (ta.size + tb.size - inter);
  // whole-word containment (e.g. "mad max" in "mad max fury road")
  const padA = ` ${a} `;
  const padB = ` ${b} `;
  const contain = padB.includes(padA) || padA.includes(padB) ? 0.88 * (Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.4 + 0.6) : 0;
  // a user typing the start of a longer title ("mad max" → "mad max fury road", "harry potter" → "harry potter and the ...")
  const prefix = (b.startsWith(a + ' ') && a.length >= 4) || (a.startsWith(b + ' ') && b.length >= 4) ? 0.8 : 0;
  return Math.max(levScore, jacc * 0.95, contain, prefix);
}
