/**
 * Client navigation recovery helpers (pure; unit tested).
 *
 * A reader whose tab predates a new deployment can request code-split route
 * files or data endpoints that no longer exist. Without recovery the router
 * keeps the previous page on screen while the URL has already changed. These
 * helpers let the app recognise that case and fall back to one full page load
 * of the URL the reader asked for.
 */

const STALE_BUILD_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /loading (css )?chunk [\w-]+ failed/i,
  /chunkloaderror/i,
];

export function isStaleBuildError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return STALE_BUILD_PATTERNS.some((pattern) => pattern.test(text));
}

export const HARD_RELOAD_KEY = "tftt-nav-hard-reload";
const HARD_RELOAD_WINDOW_MS = 30_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Allow at most one automatic full reload per URL within a short window so a
 * genuinely broken page can never loop.
 */
export function claimHardReload(href: string, storage: StorageLike | null, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    const previous = JSON.parse(storage.getItem(HARD_RELOAD_KEY) ?? "null") as
      | { href?: string; at?: number }
      | null;
    if (previous?.href === href && typeof previous.at === "number" && now - previous.at < HARD_RELOAD_WINDOW_MS) {
      return false;
    }
    storage.setItem(HARD_RELOAD_KEY, JSON.stringify({ href, at: now }));
    return true;
  } catch {
    return false;
  }
}

export class NavigationTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not respond within ${Math.round(ms / 1000)} seconds`);
    this.name = "NavigationTimeoutError";
  }
}

/** Reject a slow loader so the route shows its error/retry state instead of stale content. */
export function withNavigationTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NavigationTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Navigation feedback phases shown by the global status indicator. */
export type NavigationPhase = "idle" | "loading" | "slow";

export function navigationPhase(pending: boolean, elapsedMs: number, showAfterMs = 150, slowAfterMs = 10_000): NavigationPhase {
  if (!pending || elapsedMs < showAfterMs) return "idle";
  return elapsedMs >= slowAfterMs ? "slow" : "loading";
}
