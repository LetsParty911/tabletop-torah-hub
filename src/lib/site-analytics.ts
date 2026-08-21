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

export function getSessionId(): string {
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

// ---------------------------------------------------------------------------
// First-touch attribution
// ---------------------------------------------------------------------------

const ATTRIBUTION_KEY = "tftt:attribution";

export type Attribution = {
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
};

/**
 * Records the first external referrer / campaign / landing page of the session
 * and returns it. Later pageviews never overwrite the first touch.
 */
export function captureAttribution(path: string): Attribution | null {
  try {
    if (typeof window === "undefined") return null;
    if (isAdminPath(path)) return null;

    const stored = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (stored) return JSON.parse(stored) as Attribution;

    const params = new URLSearchParams(window.location.search);
    let referrerHost: string | null = null;
    const referrer = document.referrer || null;
    if (referrer) {
      try {
        const host = new URL(referrer).hostname;
        referrerHost = host && host !== window.location.hostname ? host : null;
      } catch {
        referrerHost = null;
      }
    }

    const attribution: Attribution = {
      referrer_host: referrerHost,
      referrer_url: referrerHost ? referrer : null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      landing_path: path,
    };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return null;
  }
}

/** Reads the session's first-touch attribution, if any. */
export function getAttribution(): Attribution | null {
  try {
    const stored = sessionStorage.getItem(ATTRIBUTION_KEY);
    return stored ? (JSON.parse(stored) as Attribution) : null;
  } catch {
    return null;
  }
}
