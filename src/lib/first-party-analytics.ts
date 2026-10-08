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
  | "human_signal"
  | "scroll_depth"
  | "outbound_click"
  | "chooser_select"
  | "recommendation_view"
  | "recommendation_click"
  | "my_table_add"
  | "my_table_remove"
  | "my_table_open"
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
const NEW_VISITOR_SESSION_KEY = "tftt:fp-new-visitor-session";
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

function isNewVisitorSession(sessionId: string): boolean {
  if (!sessionId) return false;
  return lsGet(NEW_VISITOR_SESSION_KEY) === sessionId;
}

/** True only during the very first session of a brand-new visitor id. */
export function isNewVisitor(): boolean {
  getVisitorId();
  const { sessionId } = touchSession();
  return isNewVisitorSession(sessionId);
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

// --- Cross-tab session coordination ------------------------------------------
//
// Two tabs opened at nearly the same moment both read "no session" and both
// mint one. Three safeguards, all optional and all degrading to the previous
// behaviour when the browser lacks the API:
//
// 1. Re-read storage immediately before writing, so a session another tab wrote
//    microseconds ago is adopted instead of replaced.
// 2. BroadcastChannel: tabs announce a freshly minted session, and when two
//    sessions are minted within the same few seconds both tabs deterministically
//    adopt the lexicographically smaller id, so they converge on one.
// 3. navigator.locks: the same reconciliation is repeated inside an exclusive
//    lock, which removes the race entirely where it is supported.
//
// Visitor IDs are never merged — this only affects session minting in one
// browser profile.

const SESSION_CHANNEL = "tftt-session";
const RACE_WINDOW_MS = 5_000;

let channel: BroadcastChannel | null = null;

function sessionChannel(): BroadcastChannel | null {
  if (channel !== null) return channel;
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.addEventListener("message", (event: MessageEvent) => {
      const incoming = event.data as StoredSession | null;
      if (!incoming?.id) return;
      adoptEarlier(incoming);
    });
    return channel;
  } catch {
    return null;
  }
}

/** Deterministic convergence: when two sessions race, the smaller id wins. */
function adoptEarlier(incoming: StoredSession): void {
  const mine = readSession();
  if (!mine || mine.id === incoming.id) return;
  if (Math.abs((mine.started ?? 0) - (incoming.started ?? 0)) > RACE_WINDOW_MS) return;
  if (incoming.id < mine.id) {
    writeSession({ ...incoming, last: Math.max(mine.last, incoming.last) });
    if (lsGet(NEW_VISITOR_SESSION_KEY) === mine.id) lsSet(NEW_VISITOR_SESSION_KEY, incoming.id);
  }
}

function announceSession(session: StoredSession): void {
  try {
    sessionChannel()?.postMessage(session);
  } catch {
    /* ignore */
  }
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks?.request) return;
    void locks.request(SESSION_CHANNEL, () => {
      const current = readSession();
      if (current) adoptEarlier(current);
    });
  } catch {
    /* ignore */
  }
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
    // If a visitor id was just created but an old session record somehow
    // survived independently, bind the new visitor to a fresh session rather
    // than mixing identities.
    if (!visitorWasCreated) {
      writeSession({ ...existing, last: now });
      return { sessionId: existing.id, isNew: false };
    }
  }

  // Last-moment re-read: another tab may have minted a session between our
  // read above and this write.
  const raced = readSession();
  if (!visitorWasCreated && raced && raced.id !== existing?.id && now - raced.last < SESSION_IDLE_MS) {
    writeSession({ ...raced, last: now });
    return { sessionId: raced.id, isNew: false };
  }

  const fresh: StoredSession = { id: randomId(), started: now, last: now };
  writeSession(fresh);
  if (visitorWasCreated) {
    // Persist the first-session id so a reload during that same session still
    // reports the visitor as new, while later 30-minute sessions do not.
    lsSet(NEW_VISITOR_SESSION_KEY, fresh.id);
    visitorWasCreated = false;
  }
  // A new session means a new first-touch attribution window.
  try {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  announceSession(fresh);
  return { sessionId: fresh.id, isNew: true };
}

export function getSessionId(): string {
  return touchSession().sessionId;
}

/**
 * A unique id for one user-initiated download action, used to correlate the
 * canonical `download` event with the server's `download_served` event.
 */
export function newActionId(): string {
  return randomId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
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
  utm_content: string | null;
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

type StoredAttribution = FpAttribution & { session_id?: string };

/**
 * Records first-touch attribution for the CURRENT session; never overwrites it
 * within that session. A new session re-captures, so a visitor who once came
 * from WhatsApp is not attributed to WhatsApp on every later visit.
 */
export function captureFirstTouch(path: string): FpAttribution {
  const empty: FpAttribution = {
    referrer_host: null,
    referrer_url: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    landing_path: null,
    source_group: "Direct",
  };
  if (typeof window === "undefined") return empty;

  const sessionId = getSessionId();
  const stored = lsGet(ATTRIBUTION_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as StoredAttribution;
      if (parsed.session_id === sessionId) return parsed;
    } catch {
      /* fall through and re-capture */
    }
  }

  const params = new URLSearchParams(window.location.search);
  const { referrer_host: referrerHost, referrer_url: referrer } = externalDocumentReferrer();

  const base = {
    referrer_host: referrerHost,
    referrer_url: referrer,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
  };

  const attribution: StoredAttribution = {
    ...base,
    landing_path: path,
    source_group: normalizeSourceGroup(base),
    session_id: sessionId,
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

function externalDocumentReferrer(): { referrer_host: string | null; referrer_url: string | null } {
  const referrer = typeof document !== "undefined" ? document.referrer || null : null;
  if (!referrer) return { referrer_host: null, referrer_url: null };
  try {
    const host = new URL(referrer).hostname;
    if (host && host !== window.location.hostname) return { referrer_host: host, referrer_url: referrer };
  } catch {
    /* ignore */
  }
  return { referrer_host: null, referrer_url: null };
}

// The page's ACTUAL referrer: document.referrer only describes how this
// document was loaded, so it is reported once (first page_view of a fresh
// navigation, not a reload). Later in-site pages carry no external referrer.
let pageReferrerConsumed = false;
export function takePageReferrer(): { referrer_host: string | null; referrer_url: string | null } {
  if (pageReferrerConsumed || typeof window === "undefined") return { referrer_host: null, referrer_url: null };
  pageReferrerConsumed = true;
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload" || nav?.type === "back_forward") return { referrer_host: null, referrer_url: null };
  } catch {
    /* ignore */
  }
  return externalDocumentReferrer();
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
  // Ensure share clicks are recorded even when WhatsApp opens immediately.
  "share_click",
  // Sent right away: the browser is usually about to leave the site.
  "outbound_click",
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
    })
      .then((r) => {
        if (!r.ok) scheduleRetry(events);
      })
      .catch(() => scheduleRetry(events));
  } catch {
    /* analytics must never break the page */
  }
}

// One delayed, non-blocking retry for failed session_start writes. event_id is
// unique server-side, so a retry can never double-count.
const retried = new Set<string>();
function scheduleRetry(events: WirePayload[]): void {
  const pending = events.filter(
    (e) => e["event_name"] === "session_start" && !retried.has(String(e["event_id"])),
  );
  if (!pending.length) return;
  pending.forEach((e) => retried.add(String(e["event_id"])));
  setTimeout(() => send(pending), 5000);
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
    void isNew;
    if (name !== "session_start") ensureSessionStart(path, visitorId, sessionId);

    const attribution = captureFirstTouch(path);

    const payload: WirePayload = {
      event_id: randomId(),
      event_name: name,
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      is_new_visitor: isNewVisitorSession(sessionId),
      path,
      landing_path: attribution.landing_path,
      source_path: window.location.pathname,
      publication_id: input.publication_id ?? null,
      publication_title: input.publication_title ?? null,
      publication_series: input.publication_series ?? null,
      publisher: input.publisher ?? null,
      parsha: input.parsha ?? null,
      jewish_year: input.jewish_year ?? null,
      // referrer_* = this page's actual external referrer (page_view only,
      // once per document load). First-touch stays in source_group / utm_* /
      // landing_path and metadata.first_touch_referrer_host.
      ...(name === "page_view" ? takePageReferrer() : { referrer_host: null, referrer_url: null }),
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      source_group: attribution.source_group,
      metadata: { ...(input.metadata ?? {}), first_touch_referrer_host: attribution.referrer_host },
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
      is_new_visitor: isNewVisitorSession(sessionId),
      path,
      landing_path: attribution.landing_path,
      source_path: path,
      referrer_host: attribution.referrer_host,
      referrer_url: attribution.referrer_url,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      source_group: attribution.source_group,
      metadata: {},
    },
    true,
  );
}
// Root cause of missing starts: other modules (legacy page-view tracker) call
// getSessionId() first, which consumes touchSession()'s one-shot `isNew`, so
// session_start was skipped. Track "start sent" per session id in shared
// localStorage instead — exactly once per session across reloads and tabs.
const SESSION_START_SENT_KEY = "tftt:fp-session-start-sent";

function ensureSessionStart(path: string, visitorId: string, sessionId: string): void {
  if (!sessionId || !visitorId) return;
  if (lsGet(SESSION_START_SENT_KEY) === sessionId) return;
  lsSet(SESSION_START_SENT_KEY, sessionId);
  emitSessionStart(path, visitorId, sessionId);
}

// ---------------------------------------------------------------------------
// Route lifecycle
// ---------------------------------------------------------------------------

const seenImpressions = new Set<string>();

// One id per client-side route view. Scroll milestones are deduplicated per
// page view with it, so scrolling back and forth can never inflate counts.
let currentPageViewId = "";
export function getPageViewId(): string {
  return currentPageViewId;
}

/**
 * Called on every real client-side route view. Fires session_start once per
 * session, then page_view, and resets per-page-view impression de-duplication.
 */
export function trackRouteView(path: string): void {
  if (typeof window === "undefined") return;
  setCurrentPath(path);
  if (isAdminPath(path)) return;

  seenImpressions.clear();
  currentPageViewId = randomId();

  const visitorId = getVisitorId();
  const { sessionId } = touchSession();
  captureFirstTouch(path);
  ensureSessionStart(path, visitorId, sessionId);

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


// ---------------------------------------------------------------------------
// Scroll depth — page-level milestones, once per route view
// ---------------------------------------------------------------------------

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

/**
 * Emits a scroll_depth event the first time a visitor reaches each milestone
 * on the current route view. Milestones reset on client-side navigation.
 *
 * The canonical heartbeat remains the source for active time; scroll_depth
 * only records how far down the page the visitor reached.
 */
export function startScrollDepthWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  let activeView = currentPageViewId || window.location.pathname;
  let reached = new Set<number>();
  let maxReached = 0;

  const resetIfRouteChanged = () => {
    const view = currentPageViewId || window.location.pathname;
    if (view !== activeView) {
      activeView = view;
      reached = new Set<number>();
      maxReached = 0;
    }
  };

  const measure = (event?: Event) => {
    if (event && "isTrusted" in event && event.isTrusted === false) return;
    if (isAdminPath(window.location.pathname)) return;

    resetIfRouteChanged();

    const doc = document.documentElement;
    const body = document.body;
    const scrollTop = Math.max(window.scrollY || 0, doc.scrollTop || 0, body?.scrollTop || 0);
    const viewport = Math.max(window.innerHeight || 0, doc.clientHeight || 0);
    const fullHeight = Math.max(
      doc.scrollHeight || 0,
      body?.scrollHeight || 0,
      doc.offsetHeight || 0,
      body?.offsetHeight || 0,
    );

    if (fullHeight <= 0) return;

    const percent = Math.max(0, Math.min(100, ((scrollTop + viewport) / fullHeight) * 100));
    maxReached = Math.max(maxReached, Math.round(percent));

    for (const milestone of SCROLL_MILESTONES) {
      if (percent < milestone || reached.has(milestone)) continue;
      reached.add(milestone);
      trackFp("scroll_depth", {
        metadata: {
          percent: milestone,
          max_scroll_percent: maxReached,
          page_view_id: activeView,
          document_height: Math.round(fullHeight),
          viewport_height: Math.round(viewport),
        },
      });
    }
  };

  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });

  return () => {
    window.removeEventListener("scroll", measure);
    window.removeEventListener("resize", measure);
  };
}

// ---------------------------------------------------------------------------
// Human signal — one event per session on the first genuine interaction
// ---------------------------------------------------------------------------

const HUMAN_SIGNAL_STORAGE_KEY = "tftt:fp-human-signal";

/**
 * Emits `human_signal` at most once per session when a real person interacts
 * with the page. No fingerprinting: we only look at whether a trusted browser
 * interaction event happened.
 */
export function startHumanSignalWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  const events = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;
  let done = false;

  const cleanup = () => {
    for (const name of events) {
      window.removeEventListener(name, onInteract, true);
    }
  };

  function onInteract(event: Event) {
    if (done) return;
    // Prefer genuine, user-generated events where the browser tells us.
    if ("isTrusted" in event && event.isTrusted === false) return;
    if (isAdminPath(window.location.pathname)) return;

    const { sessionId } = touchSession();
    if (!sessionId) return;
    if (lsGet(HUMAN_SIGNAL_STORAGE_KEY) === sessionId) {
      done = true;
      cleanup();
      return;
    }

    done = true;
    lsSet(HUMAN_SIGNAL_STORAGE_KEY, sessionId);
    cleanup();
    trackFp("human_signal");
  }

  for (const name of events) {
    window.addEventListener(name, onInteract, { capture: true, passive: true });
  }

  return cleanup;
}

// ---------------------------------------------------------------------------
// Outbound clicks — external links only, through the canonical pipeline
// ---------------------------------------------------------------------------

/**
 * Emits `outbound_click` when a visitor follows a link to another site.
 * Same-site navigation, mailto:/tel: and javascript: links are ignored.
 * Only the target hostname and path are kept — never the query string or
 * fragment, which can carry tokens.
 */
export function startOutboundClickWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  const onClick = (event: MouseEvent) => {
    try {
      if (event.isTrusted === false) return;
      if (event.button !== 0 && event.button !== 1) return;
      if (isAdminPath(window.location.pathname)) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      const here = window.location.hostname.replace(/^www\./, "");
      const host = url.hostname.replace(/^www\./, "");
      if (!host || host === here) return;
      trackFp("outbound_click", {
        metadata: {
          target_host: url.hostname.toLowerCase().slice(0, 200),
          target_path: url.pathname.slice(0, 200),
          new_tab: anchor.target === "_blank" || event.button === 1 || event.metaKey || event.ctrlKey,
        },
      });
    } catch {
      /* analytics must never break navigation */
    }
  };

  // `click` already fires for normal left-click navigation. `auxclick`
  // covers middle-click only; ignoring auxclick button 0 prevents an unusual
  // browser from reporting the same activation through both event types.
  const onAuxClick = (event: MouseEvent) => {
    if (event.button !== 1) return;
    onClick(event);
  };

  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("auxclick", onAuxClick, { capture: true });
  return () => {
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("auxclick", onAuxClick, { capture: true });
  };
}
