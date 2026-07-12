// GTM-only analytics helper. Pushes clean events to window.dataLayer so GTM
// (container GTM-WMVV6CJ7) is the sole analytics path. No direct gtag calls.
//
// Admin routes are excluded: GTM is not loaded there, and this helper also
// short-circuits if the current path is /admin or /admin/* as a defense in
// depth measure so events never fire from admin UIs.

type EventParams = Record<string, unknown>;

function isAdminPath(): boolean {
  if (typeof window === "undefined") return true;
  const p = window.location?.pathname ?? "";
  return p === "/admin" || p.startsWith("/admin/");
}

export function trackEvent(name: string, params: EventParams = {}): void {
  try {
    if (typeof window === "undefined") return;
    if (isAdminPath()) return;
    const w = window as unknown as { dataLayer?: unknown[] };

    const hadDataLayer = Array.isArray(w.dataLayer);
    if (!hadDataLayer) {
      console.info(
        `[tftt analytics] window.dataLayer not yet initialized by GTM; creating fallback array before event "${name}"`,
      );
      w.dataLayer = [];
    } else {
      console.info(
        `[tftt analytics] window.dataLayer available (length ${w.dataLayer!.length}); pushing event "${name}"`,
      );
    }

    const dataLayer = w.dataLayer!;
    dataLayer.push({
      event: name,
      page_path: window.location?.pathname ?? "",
      page_location: window.location?.href ?? "",
      ...params,
    });
  } catch {
    // swallow — analytics must never break the UI
  }
}

const SESSION_SENT_PREFIX = "tftt:analytics-sent:";

/**
 * Fire a dataLayer event at most once per browser session. Use this for
 * popup lifecycle events (show / dismiss / signup) so GTM/GA4 does not count
 * the same user action multiple times on repeated interactions.
 *
 * @param name       dataLayer event name
 * @param params     event parameters
 * @param dedupeKey  optional sessionStorage key; defaults to a key based on
 *                   the event name. Pass a custom key when the same event
 *                   name is used in multiple contexts (e.g. newsletter_signup
 *                   from the homepage vs. the download popup).
 */
export function trackEventOnce(
  name: string,
  params: EventParams = {},
  dedupeKey?: string,
): void {
  if (typeof window === "undefined") return;
  const key = dedupeKey ?? `${SESSION_SENT_PREFIX}${name}`;
  try {
    if (sessionStorage.getItem(key) === "1") {
      console.info(
        `[tftt analytics] event "${name}" already sent this session (key: ${key}); skipping`,
      );
      return;
    }
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore storage failures (e.g. private browsing) and fall through to track
  }
  trackEvent(name, params);
}

export function currentPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location?.pathname ?? "";
}

// Convenience builder for PDF-related events. All fields are optional; only
// non-null values are forwarded so reports stay clean.
export function pdfEventParams(input: {
  fileId?: string | null;
  fileTitle?: string | null;
  parsha?: string | null;
  jewishYear?: number | string | null;
  sourceName?: string | null;
}): EventParams {
  const out: EventParams = {};
  if (input.fileId) out.file_id = input.fileId;
  if (input.fileTitle) out.file_title = input.fileTitle;
  if (input.parsha) out.parsha = input.parsha;
  if (input.jewishYear != null && input.jewishYear !== "") {
    out.jewish_year = input.jewishYear;
  }
  if (input.sourceName) out.source_name = input.sourceName;
  return out;
}
