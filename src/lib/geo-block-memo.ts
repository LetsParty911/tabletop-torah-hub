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
  inflight.clear();
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

// Single-flight: concurrent requests for the same key share ONE in-progress
// lookup instead of each starting their own provider calls.
const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      return await factory();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function inflightCount(): number {
  return inflight.size;
}

export const NEGATIVE_MEMO_TTL_MS = 5 * 60 * 1000;
export const TIMEOUT_RETRY_MS = 60 * 1000;

/**
 * Memoized, coalesced, time-boxed lookup. The underlying lookup keeps running
 * after the budget expires and stores its real result when it lands, so the
 * visitor's NEXT navigation reuses it instead of paying for providers again.
 * A timeout lets the visitor through (fail open) and is never treated as blocked.
 */
export async function memoizedLookup<T>(
  key: string,
  lookup: () => Promise<T | null>,
  budgetMs = BLOCK_LOOKUP_BUDGET_MS,
  ttlFor: (v: T | null) => number = (v) => (v ? BLOCK_MEMO_TTL_MS : NEGATIVE_MEMO_TTL_MS),
): Promise<T | null> {
  const hit = memoGet<T | null>(key);
  if (hit !== undefined) return hit;
  const shared = singleFlight(key, async () => {
    let v: T | null = null;
    try {
      v = await lookup();
    } catch {
      v = null;
    }
    memoSet(key, v, ttlFor(v));
    return v;
  });
  const result = await withBudget(shared, budgetMs);
  if (result === null && memoGet(key) === undefined) {
    // Still running (or failed before storing): short retry window so a slow
    // provider is not re-called on every navigation.
    memoSet(key, null, TIMEOUT_RETRY_MS);
  }
  return result;
}
