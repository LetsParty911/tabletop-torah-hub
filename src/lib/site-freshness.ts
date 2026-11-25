// Shared, non-sensitive build marker injected by Vite into both bundles.
declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
export const RELEASE_CHECK_INTERVAL_MS = 60_000;

export function isCatalogRefreshPath(path: string): boolean {
  return /^\/(?:|archive\/?|originals\/?|publications\/?|publication\/[^/]+\/?|parsha\/[^/]+(?:\/[^/]+)?\/?|yom-tov\/[^/]+\/[^/]+\/?|divrei-torah-parsha\/?|resources\/?|brief-insights\/?|short-vorts\/?)$/.test(path);
}

export function isPreviewHost(host: string): boolean {
  return host.startsWith("id-preview--") || host.startsWith("preview--") ||
    ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]
      .some(domain => host === domain || host.endsWith("." + domain));
}

export function claimReleaseReload(build: string, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  if (!storage || !/^[a-zA-Z0-9._-]{1,128}$/.test(build) || build === "dev" || build === BUILD_ID) return false;
  try {
    const key = "tftt-reloaded-release";
    if (storage.getItem(key) === build) return false;
    storage.setItem(key, build);
    return true;
  } catch { return false; }
}

/** Only idle public catalogue pages may automatically reload. Never reload an
 * admin, PDF reader, account/form page, background tab, dialog or print flow. */
export function startSiteFreshness(refreshCatalogue: () => Promise<unknown> | unknown): () => void {
  if (typeof window === "undefined" || !import.meta.env.PROD ||
      isPreviewHost(window.location.hostname) || window.self !== window.top) return () => {};
  let disposed = false;
  let printing = false;
  let busy = false;
  let lastCheck = 0;
  let controller: AbortController | undefined;
  const safe = () => !disposed && !printing && document.visibilityState === "visible" &&
    isCatalogRefreshPath(window.location.pathname) &&
    !document.activeElement?.closest("input, textarea, select, button, a, [contenteditable=true]") &&
    !document.querySelector('dialog[open], [role="dialog"][data-state="open"], [aria-modal="true"]') &&
    window.getSelection()?.isCollapsed !== false;
  async function check(refresh: boolean) {
    if (!safe() || busy || Date.now() - lastCheck < 1000) return;
    busy = true;
    lastCheck = Date.now();
    controller = new AbortController();
    const timer = window.setTimeout(() => controller?.abort(), 8000);
    try {
      // Unique request also avoids fallback responses from older installed workers.
      const response = await fetch("/api/site-version?fresh=" + Date.now(), {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (!response.ok || !safe()) return;
      const { build_id: latest } = await response.json() as { build_id?: unknown };
      if (!safe()) return;
      if (typeof latest === "string" && latest !== BUILD_ID && latest !== "dev") {
        let storage: Storage | null = null;
        try { storage = window.sessionStorage; } catch { /* storage disabled */ }
        if (claimReleaseReload(latest, storage)) {
          window.location.reload();
          return;
        }
      }
      // Resume revalidates route data without creating a new browser navigation.
      // The minute timer checks the lightweight build marker only; no repeated
      // full archive/database downloads just because an idle tab remains open.
      if (refresh && safe()) await refreshCatalogue();
    } catch { /* offline or transient error: leave the current page alone */ }
    finally { window.clearTimeout(timer); controller = undefined; busy = false; }
  }
  const resume = () => { void check(true); };
  const visible = () => { if (document.visibilityState === "visible") resume(); };
  const restored = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
  const beforePrint = () => { printing = true; };
  const afterPrint = () => { printing = false; };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", restored);
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  const interval = window.setInterval(() => { void check(false); }, RELEASE_CHECK_INTERVAL_MS);
  void check(false);
  return () => {
    disposed = true;
    controller?.abort();
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", restored);
    window.removeEventListener("beforeprint", beforePrint);
    window.removeEventListener("afterprint", afterPrint);
  };
}
