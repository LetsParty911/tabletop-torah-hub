// Per-isolate memo + time budget for the blocking location lookup, so repeat
// page views from the same visitor never re-run a database or provider call,
// and a slow provider can never hold a page hostage (fail open).

export const BLOCK_MEMO_TTL_MS = 30 * 60 * 1000;
export const BLOCK_LOOKUP_BUDGET_MS = 1500;
const MAX_ENTRIES = 5000;

const memo = new Map<string, { value: unknown; expires: number }>();

export function memoGet<T>(key: string, now = Date.now()): T | undefined {
  const hit = memo.get(key);
  if (!hit) return undefined;
  if (hit.expires <= now) {
    memo.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function memoSet(key: string, value: unknown, ttl = BLOCK_MEMO_TTL_MS, now = Date.now()): void {
  if (memo.size >= MAX_ENTRIES) {
    const first = memo.keys().next().value;
    if (first !== undefined) memo.delete(first);
  }
  memo.set(key, { value, expires: now + ttl });
}

export function memoClear(): void {
  memo.clear();
}

/** Resolves to the promise result, or `null` if it takes longer than `ms`. */
export function withBudget<T>(p: Promise<T>, ms = BLOCK_LOOKUP_BUDGET_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Countries that contain at least one blocked city. */
export function blockedCountries(list: { country: string }[]): Set<string> {
  return new Set(list.map((c) => c.country.toLowerCase()));
}
