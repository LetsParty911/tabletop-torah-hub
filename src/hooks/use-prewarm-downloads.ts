import { useEffect } from "react";

/**
 * Quietly warm the edge cache for the PDFs shown on the page.
 *
 * A cold download costs 1.2-1.9s (row lookup + storage read); the same file
 * requested again from the same region costs ~0.12s. Requesting the visible
 * files at low priority once the page is idle means the reader's click almost
 * always lands on a warm file.
 *
 * Fire-and-forget: failures are ignored, nothing is awaited, and the real
 * download is never gated on this.
 */
const warmed = new Set<string>();

const MAX_FILES = 6;
const STAGGER_MS = 300;

function shouldSkip(): boolean {
  if (typeof navigator === "undefined") return true;
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const type = String(conn.effectiveType ?? "");
  return type === "2g" || type === "slow-2g";
}

export function usePrewarmDownloads(ids: readonly string[]) {
  // Stable dependency so re-renders with the same list don't reschedule.
  const key = ids.join(",");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkip()) return;

    const targets = ids.filter((id) => id && !warmed.has(id)).slice(0, MAX_FILES);
    if (targets.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      targets.forEach((id, i) => {
        timers.push(
          setTimeout(() => {
            if (cancelled || warmed.has(id)) return;
            warmed.add(id);
            try {
              void fetch(`/view/${id}/download`, {
                // `priority` is not in the TS DOM lib yet; browsers that don't
                // know it simply ignore it.
                ...({ priority: "low" } as Record<string, unknown>),
                mode: "no-cors",
                credentials: "omit",
tab:            }).catch(() => {});
            } catch {
              // best effort only
            }
          }, i * STAGGER_MS),
        );
      });
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    let idleHandle: number | undefined;
    if (ric) {
      idleHandle = ric(start, { timeout: 3000 });
    } else {
      timers.push(setTimeout(start, 1500));
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      const cic = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idleHandle !== undefined && cic) cic(idleHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
