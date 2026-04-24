// Tiny client-only GA4 helper. Fails silently if gtag isn't loaded
// (e.g. on /admin where the GA4 script is intentionally skipped).
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window === "undefined") return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== "function") return;
    gtag("event", name, params);
  } catch {
    // swallow — analytics must never break the UI
  }
}

export function currentPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location?.pathname ?? "";
}
