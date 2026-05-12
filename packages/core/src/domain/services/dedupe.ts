type Stringable = { toString: () => string };

export function dedupe<T extends Stringable>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
