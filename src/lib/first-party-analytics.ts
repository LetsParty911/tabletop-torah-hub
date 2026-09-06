// Phase 1 canonical first-party analytics client.
//
// This sits alongside — not instead of — the existing GTM helper
// (src/lib/analytics.ts) and the legacy first-party helpers
// (src/lib/site-analytics.ts). Legacy page_views / search_events /
// download_events writes are untouched; this module additionally writes every
// Phase 1 event to one canonical stream keyed by visitor_id + session_id so
// the funnel is joinable.
//
// Admin routes never emit anything from here.

export type FpEventName =
  | "session_start"
  | "page_view"
  | "publication_impression"
  | "publication_click"
  | "filter_change"
  | "search"
  | "pdf_open"
  | "download"
  | "share_click"
  | "signup"
  | "heartbeat"
  | "error";

export type PublicationContext = {
  publication_id?: string | null;
  publication_title?: string | null;
  publication_series?: string | null;
  publisher?: string | null;
  parsha?: string | null;
  jewish_year?: number | null;
};

export type FpEventInput = PublicationContext & {
  metadata?: Record<string, unknown>;
};

const VISITOR_COOKIE = "tftt_vid";
const VISITOR_STORAGE_KEY = "tftt:fp-visitor";
const SESSION_STORAGE_KEY = "tftt:fp-session";
const ATTRIBUTION_STORAGE_KEY = "tftt:fp-attribution";

const VISITOR_TTL_DAYS = 365; // 12 months
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const HEARTBEAT_MS = 15_000;
const MAX_HEARTBEAT_SECONDS = 20; // cap so a forgotten tab can't inflate time

const ENDPOINT = "/api/events";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isAdminPath(path?: string): boolean {
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "/admin");
  return p === "/admin" || p.startsWith("/admin/") || p.startsWith("/admin-analytics");
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, days: number): boolean {
  try {
    const maxAge = Math.round(days * 24 * 60 * 60);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
    return readCookie(name) === value;
  } catch {
    return false;
  }
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Visitor identity — first-party cookie, 12-month lifetime, storage fallback
// ---------------------------------------------------------------------------

let visitorWasCreated = false;

export function getVisitorId(): string {
  if (typeof window === "undefined") return "";

  const fromCookie = readCookie(VISITOR_COOKIE);
  if (fromCookie) {
    // Refresh the sliding 12-month window on each visit.
    writeCookie(VISITOR_COOKIE, fromCookie, VISITOR_TTL_DAYS);
    lsSet(VISITOR_STORAGE_KEY, fromCookie);
    return fromCookie;
  }

  const fromStorage = lsGet(VISITOR_STORAGE_KEY);
  if (fromStorage) {
    writeCookie(VISITOR_COOKIE, fromStorage, VISITOR_TTL_DAYS);
    return fromStorage;
  }

  const id = randomId();
  visitorWasCreated = true;
  if (!writeCookie(VISITOR_COOKIE, id, VISITOR_TTL_DAYS)) {
    // Cookie storage blocked — fall back to localStorage only.
    lsSet(VISITOR_STORAGE_KEY, id);
  } else {
    lsSet(VISITOR_STORAGE_KEY, id);
  }
  return id;
}

/** True only for the very first session of a brand-new visitor id. */
export function isNewVisitor(): boolean {
  getVisitorId();
  return visitorWasCreated;
}

// ---------------------------------------------------------------------------
// Session identity — real 30-minute inactivity window, shared across tabs
// ---------------------------------------------------------------------------

type StoredSession = { id: string; started: number; last: number };

function readSession(): StoredSession | null {
  const raw = lsGet(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.id || typeof parsed.last !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession): void {
  lsSet(SESSION_STORAGE_KEY, JSON.stringify(s));
}

/**
 * Returns the current session id, creating a new one when the previous
 * session has been idle for 30 minutes or more. `isNew` is true only for the
 * call that created the session, so session_start fires exactly once.
 */
export function touchSession(): { sessionId: string; isNew: boolean } {
  if (typeof window === "undefined") return { sessionId: "", isNew: false };

  const now = Date.now();
  const existing = readSession();

  if (existing && now - existing.last < SESSION_IDLE_MS) {
    writeSession({ ...existing, last: now });
    return { sessionId: existing.id, isNew: false };
  }

  const fresh: StoredSession = { id: randomId(), started: now, last: now };
  writeSession(fresh);
  // A new session means a new first-touch attribution window.
  try {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { sessionId: fresh.id, isNew: true };
}

export function getSessionId(): string {
  return touchSession().sessionId;
}

// ---------------------------------------------------------------------------
// First-touch attribution + normalized source grouping
// ---------------------------------------------------------------------------

export type FpAttribution = {
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
  source_group: string;
};

/**
 * Normalized bucket used by the dashboard breakdowns. Original UTM and
 * referrer values are always kept alongside this.
 */
export function normalizeSourceGroup(input: {
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}): string {
  const host = (input.referrer_host ?? "").toLowerCase();
  const src = (input.utm_source ?? "").toLowerCase();
  const med = (input.utm_medium ?? "").toLowerCase();
  const hasCampaign = Boolean(input.utm_source || input.utm_medium || input.utm_campaign);

  const any = `${host} ${src} ${med}`;

  if (/whatsapp|wa\.me|chat\.whatsapp/.test(any)) return "WhatsApp";
  if (/(^|\W)(email|newsletter|mail)(\W|$)/.test(` ${med} `) || /email|newsletter|sender|resend|mailchimp/.test(src))
    return "Email";
  if (/^mail\.|webmail|outlook|mail\.google/.test(host)) return "Email";
  if (/(^|\.)google\./.test(host) || src === "google") return "Google";
  if (!host && !hasCampaign) return "Direct";
  if (hasCampaign) return "Other Campaign";
  return "Other Referral";
}

/** Records first-touch attribution for the session; never overwrites it. */
export function captureFirstTouch(path: string): FpAttribution {
  const empty: FpAttribution = {
    referrer_host: null,
    referrer_url: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    landing_path: null,
    source_group: "Direct",
  };
  if (typeof window === "undefined") return empty;

  const stored = lsGet(ATTRIBUTION_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as FpAttribution;
    } catch {
      /* fall through and re-capture */
    }
  }

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

  const base = {
    referrer_host: referrerHost,
    referrer_url: referrerHost ? referrer : null,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };

  const attribution: FpAttribution = {
    ...base,
    landing_path: path,
    source_group: normalizeSourceGroup(base),
  };
  lsSet(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
}

export function getFirstTouch(): FpAttribution | null {
  const stored = lsGet(ATTRIBUTION_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as FpAttribution;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transport — batched, idempotent
// ---------------------------------------------------------------------------

type WirePayload = Record<string, unknown>;

let queue: WirePayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const IMMEDIATE: ReadonlySet<string> = new Set<string>([
  "session_start",
  "download",
  "pdf_open",
  "signup",
  "error",
  "publication_click",
]);

function send(events: WirePayload[]): void {
  if (!events.length) return;
  const body = JSON.stringify({ events });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      // Only fall back to fetch when the beacon was actually refused, so one
      // click never produces two deliveries. (event_id also de-dupes server
      // side, so a retry can never double-count.)
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}

export function flushEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = queue;
  queue = [];
  send(batch);
}

function enqueue(payload: WirePayload, immediate: boolean): void {
  queue.push(payload);
  if (immediate || queue.length >= 20) {
    flushEvents();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(flushEvents, 1500);
}

// ---------------------------------------------------------------------------
// Public tracking API
// ---------------------------------------------------------------------------

let currentPath = "/";

export function setCurrentPath(path: string): void {
  currentPath = path;
}

export function trackFp(name: FpEventName, input: FpEventInput = {}): void {
  try {
    if (typeof window === "undefined") return;
    const path = currentPath || window.location.pathname;
    if (isAdminPath(path) || isAdminPath(window.location.pathname)) return;

    const visitorId = getVisitorId();
    // Any tracked activity refreshes the inactivity window. If that rolls the
    // session over, session_start is emitted first so the stream stays sane.
    const { sessionId, isNew } = touchSession();
    if (isNew && name !== "session_start") {
      emitSessionStart(path, visitorId, sessionId);
    }

    const attribution = captureFirstTouch(path);

    const payload: WirePayload = {
      event_id: randomId(),
      event_name: name,
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      is_new_visitor: visitorWasCreated,
      path,
      landing_path: attribution.landing_path,
      source_path: window.location.pathname,
      publication_id: input.publication_id ?? null,
      publication_title: input.publication_title ?? null,
      publication_series: input.publication_series ?? null,
      publisher: input.publisher ?? null,
      parsha: input.parsha ?? null,
      jewish_year: input.jewish_year ?? null,
      referrer_host: attribution.referrer_host,
      referrer_url: attribution.referrer_url,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      source_group: attribution.source_group,
      metadata: input.metadata ?? {},
    };

    enqueue(payload, IMMEDIATE.has(name));
  } catch {
    /* silent */
  }
}

function emitSessionStart(path: string, visitorId: string, sessionId: string): void {
  const attribution = captureFirstTouch(path);
  enqueue(
    {
      event_id: randomId(),
      event_name: "session_start",
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      is_new_visitor: visitorWasCreated,
      path,
      landing_path: attribution.landing_path,
      source_path: path,
      referrer_host: attribution.referrer_host,
      referrer_url: attribution.referrer_url,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      source_group: attribution.source_group,
      metadata: {},
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Route lifecycle
// ---------------------------------------------------------------------------

const seenImpressions = new Set<string>();

/**
 * Called on every real client-side route view. Fires session_start once per
 * session, then page_view, and resets per-page-view impression de-duplication.
 */
export function trackRouteView(path: string): void {
  if (typeof window === "undefined") return;
  setCurrentPath(path);
  if (isAdminPath(path)) return;

  seenImpressions.clear();

  const visitorId = getVisitorId();
  const { sessionId, isNew } = touchSession();
  captureFirstTouch(path);
  if (isNew) emitSessionStart(path, visitorId, sessionId);

  trackFp("page_view");
}

/** Fires publication_impression at most once per publication per page view. */
export function trackImpressionOnce(pub: PublicationContext): void {
  const key = pub.publication_id ?? pub.publication_title ?? "";
  if (!key || seenImpressions.has(key)) return;
  seenImpressions.add(key);
  trackFp("publication_impression", pub);
}

// ---------------------------------------------------------------------------
// Heartbeat — active seconds only, visible AND focused
// ---------------------------------------------------------------------------

export function startHeartbeat(): () => void {
  if (typeof window === "undefined") return () => {};

  let last = Date.now();

  const tick = () => {
    const now = Date.now();
    const elapsedMs = now - last;
    last = now;

    const active =
      document.visibilityState === "visible" &&
      (typeof document.hasFocus !== "function" || document.hasFocus());
    if (!active) return;
    if (isAdminPath(window.location.pathname)) return;

    // Cap the delta so a long background gap (sleep, forgotten tab) can never
    // be counted as active time.
    const seconds = Math.min(MAX_HEARTBEAT_SECONDS, Math.max(0, Math.round(elapsedMs / 1000)));
    if (seconds <= 0) return;

    trackFp("heartbeat", { metadata: { active_seconds: seconds } });
  };

  const interval = setInterval(tick, HEARTBEAT_MS);

  // Reset the clock when the tab comes back so hidden time is never billed.
  const onVisibility = () => {
    last = Date.now();
    if (document.visibilityState === "hidden") flushEvents();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("pagehide", flushEvents);

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onVisibility);
    window.removeEventListener("pagehide", flushEvents);
    flushEvents();
  };
}
