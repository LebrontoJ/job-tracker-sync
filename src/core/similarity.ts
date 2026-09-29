/** Jaro similarity in [0, 1]. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(b.length - 1, i + window);
    for (let j = start; j <= end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  return (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b);
  if (j < 0.7) return j;
  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return j + prefix * prefixScale * (1 - j);
}

/** |A ∩ B| / |A ∪ B|; two empty sets are treated as identical. */
export function tokenJaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** True when every token of the shorter list appears in the longer one. */
export function isTokenSubset(a: readonly string[], b: readonly string[]): boolean {
  if (!a.length || !b.length) return false;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(large);
  return small.every((t) => set.has(t));
}
