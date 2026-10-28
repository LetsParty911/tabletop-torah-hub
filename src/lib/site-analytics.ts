// Legacy first-party tracker — now a thin compatibility wrapper.
//
// Historically this module minted its OWN visitor ids (tftt:analytics-visitor),
// its own sessionStorage session (tftt:analytics-session) and its own
// first-touch attribution. That made the legacy `page_views` / `search_events`
// rows impossible to reconcile with the canonical `analytics_events` stream and
// could inflate visitor/session counts.
//
// From this change forward every id written by this module comes from the
// canonical identity in `src/lib/first-party-analytics.ts`. The public exports
// are unchanged so existing callers keep working. Canonical analytics remains
// the authoritative source for headline audience metrics; page_views is a
// legacy raw/audit feed only.
//
// Older historical page_views rows still carry the old legacy ids and must
// never be joined to analytics_events by visitor_id / session_id.

import {
  captureFirstTouch,
  getFirstTouch,
  getSessionId as getCanonicalSessionId,
  getVisitorId,
  isAdminPath as isCanonicalAdminPath,
  isNewVisitor,
} from "@/lib/first-party-analytics";

export function isAdminPath(path: string): boolean {
  return isCanonicalAdminPath(path);
}

/** Canonical session id — shared with the canonical event stream. */
export function getSessionId(): string {
  return getCanonicalSessionId();
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

// Page-level referrer semantics: document.referrer only describes the page that
// loaded this document, so it is reported on the first tracked view only.
// Later client-side navigations are internal and carry no external referrer.
let firstViewTracked = false;

function pageLevelSource(): {
  referrer: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  const firstView = !firstViewTracked;
  const params = new URLSearchParams(window.location.search);
  let referrer: string | null = null;
  let referrerHost: string | null = null;
  if (firstView && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) {
        referrer = document.referrer;
        referrerHost = host;
      }
    } catch {
      /* ignore */
    }
  }
  firstViewTracked = true;
  return {
    referrer,
    referrer_host: referrerHost,
    // Legacy page_views is a per-page audit feed. Campaign UTM parameters
    // describe entry attribution, not subsequent SPA navigation. Keep them
    // only on the first recorded document view; canonical analytics separately
    // retains the session's first-touch campaign on session_start.
    utm_source: firstView ? params.get("utm_source") : null,
    utm_medium: firstView ? params.get("utm_medium") : null,
    utm_campaign: firstView ? params.get("utm_campaign") : null,
  };
}

/** Log one legacy raw pageview. Safe to call on every client-side route change. */
export function trackPageView(path: string): void {
  try {
    if (typeof window === "undefined") return;
    if (isAdminPath(path)) return;

    // First-touch attribution is still recorded separately (canonical stream).
    captureFirstTouch(path);
    const visitorId = getVisitorId();
    if (!visitorId) return;

    post("/api/track-view", {
      path,
      ...pageLevelSource(),
      session_id: getSessionId(),
      visitor_id: visitorId,
      is_new_visitor: isNewVisitor(),
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
// First-touch attribution (canonical-backed)
// ---------------------------------------------------------------------------

export type Attribution = {
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
};

function toLegacy(a: {
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
}): Attribution {
  return {
    referrer_host: a.referrer_host,
    referrer_url: a.referrer_url,
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    landing_path: a.landing_path,
  };
}

/** Records the canonical first-touch attribution for the session and returns it. */
export function captureAttribution(path: string): Attribution | null {
  try {
    if (typeof window === "undefined") return null;
    if (isAdminPath(path)) return null;
    return toLegacy(captureFirstTouch(path));
  } catch {
    return null;
  }
}

/** Reads the session's canonical first-touch attribution, if any. */
export function getAttribution(): Attribution | null {
  const first = getFirstTouch();
  return first ? toLegacy(first) : null;
}
