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
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: name,
      page_path: window.location?.pathname ?? "",
      page_location: window.location?.href ?? "",
      ...params,
    });
  } catch {
    // swallow — analytics must never break the UI
  }
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
