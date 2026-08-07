// First-party, privacy-preserving site analytics client helper.
//
// Mirrors the download-tracking approach: the browser posts a small JSON body
// to a server route, and the server does the geo lookup at the edge. No IP
// addresses, no raw user agents, no third-party scripts.
//
// Admin routes are never tracked.

const SESSION_KEY = "tftt:analytics-session";
const VISITOR_KEY = "tftt:analytics-visitor";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Returns the visitor id plus whether it was created just now. */
function getVisitor(): { visitorId: string; isNew: boolean } {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return { visitorId: existing, isNew: false };
    const id = randomId();
    localStorage.setItem(VISITOR_KEY, id);
    return { visitorId: id, isNew: true };
  } catch {
    return { visitorId: randomId(), isNew: true };
  }
}

function post(url: string, payload: unknown): void {
  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, blob)) return;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}

/** Log one pageview. Safe to call on every client-side route change. */
export function trackPageView(path: string): void {
  try {
    if (typeof window === "undefined") return;
    if (isAdminPath(path)) return;

    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer || null;
    let referrerHost: string | null = null;
    if (referrer) {
      try {
        const host = new URL(referrer).hostname;
        // Internal navigation isn't a traffic source.
        referrerHost = host && host !== window.location.hostname ? host : null;
      } catch {
        referrerHost = null;
      }
    }

    const { visitorId, isNew } = getVisitor();

    post("/api/track-view", {
      path,
      referrer: referrerHost ? referrer : null,
      referrer_host: referrerHost,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      session_id: getSessionId(),
      visitor_id: visitorId,
      is_new_visitor: isNew,
    });
  } catch {
    /* silent */
  }
}

/** Log one submitted search with the number of results it returned. */
export function trackSearch(query: string, resultCount: number): void {
  try {
    if (typeof window === "undefined") return;
    if (isAdminPath(window.location.pathname)) return;
    const q = query.trim();
    if (!q) return;
    post("/api/track-search", {
      query: q.slice(0, 200),
      result_count: resultCount,
      session_id: getSessionId(),
    });
  } catch {
    /* silent */
  }
}
