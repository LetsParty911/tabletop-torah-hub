/**
 * "Open PDF" button clicks.
 *
 * The public Open PDF button (DownloadToPrintButton) emits the existing
 * `publication_click` event tagged with metadata.action = "open_pdf". That
 * tagged event is the only thing counted here. It is deliberately separate
 * from:
 *  - `pdf_open`: the embedded viewer preview loading on /view/$id (automatic),
 *  - `download`: a download action,
 *  - untagged `publication_click`: ordinary navigation to a publication page.
 */
export type OpenPdfRow = {
  event_name: string | null;
  event_id?: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  path: string | null;
  publication_id: string | null;
  publication_title: string | null;
  metadata?: Record<string, unknown> | null;
};

export function isOpenPdfClick(row: Pick<OpenPdfRow, "event_name" | "metadata">): boolean {
  if (row.event_name !== "publication_click") return false;
  const action = row.metadata?.["action"];
  return typeof action === "string" && action.trim() === "open_pdf";
}

/** Collapses retried deliveries of the same logical click onto one. */
export function uniqueOpenPdfClicks<T extends OpenPdfRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!isOpenPdfClick(row)) continue;
    const key = row.event_id?.trim() || `${row.session_id}|${row.publication_id}|${row.occurred_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export type OpenPdfSummary = {
  total: number;
  uniqueSessions: number;
  uniqueVisitors: number;
  /** Distinct non-empty publication IDs across qualified clicks. Never inferred from titles. */
  uniquePublications: number;
  /** Qualified clicks with no publication ID (excluded from uniquePublications). */
  clicksMissingPublicationId: number;
  byPublication: Array<{ publicationId: string | null; title: string; clicks: number; sessions: number; lastAt: string }>;
  byPage: Array<{ page: string; clicks: number }>;
};

function pageLabel(path: string | null): string {
  const p = (path ?? "").split("?")[0]?.replace(/\/+$/, "") || "/";
  if (p === "/") return "Homepage";
  if (p === "/archive") return "Archive";
  if (p.startsWith("/view/")) return "PDF detail page (/view)";
  if (p.startsWith("/parsha/")) return `Parsha page (${p})`;
  if (p.startsWith("/yom-tov/")) return `Yom Tov page (${p})`;
  if (p.startsWith("/publication/")) return `Series page (${p})`;
  return p;
}

export function summarizeOpenPdfClicks(rows: OpenPdfRow[]): OpenPdfSummary {
  const clicks = uniqueOpenPdfClicks(rows);
  const pubs = new Map<string, { publicationId: string | null; title: string; clicks: number; sessions: Set<string>; lastAt: string }>();
  const pages = new Map<string, number>();
  for (const row of clicks) {
    const id = row.publication_id?.trim() || null;
    const title = row.publication_title?.trim() || id || "Unknown publication";
    // Missing IDs are never merged by title: each such click stays its own row.
    const key = id ? `id:${id}` : `missing:${row.event_id ?? ""}|${row.session_id}|${row.occurred_at}`;
    const entry = pubs.get(key) ?? { publicationId: id, title, clicks: 0, sessions: new Set<string>(), lastAt: row.occurred_at };
    entry.clicks += 1;
    if (row.session_id) entry.sessions.add(row.session_id);
    if (row.occurred_at > entry.lastAt) entry.lastAt = row.occurred_at;
    pubs.set(key, entry);
    const page = pageLabel(row.path);
    pages.set(page, (pages.get(page) ?? 0) + 1);
  }
  return {
    total: clicks.length,
    uniqueSessions: new Set(clicks.map((r) => r.session_id).filter(Boolean)).size,
    uniqueVisitors: new Set(clicks.map((r) => r.visitor_id).filter(Boolean)).size,
    uniquePublications: uniqueOpenedPublicationIds(clicks).size,
    clicksMissingPublicationId: clicks.filter((r) => !r.publication_id?.trim()).length,
    byPublication: [...pubs.values()]
      .map((p) => ({ publicationId: p.publicationId, title: p.title, clicks: p.clicks, sessions: p.sessions.size, lastAt: p.lastAt }))
      .sort((a, b) => b.clicks - a.clicks || b.lastAt.localeCompare(a.lastAt)),
    byPage: [...pages.entries()].map(([page, clicks]) => ({ page, clicks })).sort((a, b) => b.clicks - a.clicks),
  };
}

/** Distinct publication IDs among tagged Open PDF clicks (deduplicated by event). */
export function uniqueOpenedPublicationIds(rows: OpenPdfRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of uniqueOpenPdfClicks(rows)) {
    const id = row.publication_id?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Human headline uses only rows from sessions the shared classifier kept
 * (internal/test and suspected automation excluded); the raw count is kept
 * alongside for audit.
 */
export function openPdfClicksForReport<T extends OpenPdfRow>(allRows: T[], keptSessionIds: Set<string>) {
  const kept = allRows.filter((row) => Boolean(row.session_id && keptSessionIds.has(row.session_id.trim())));
  const summary = summarizeOpenPdfClicks(kept);
  const rawTotal = uniqueOpenPdfClicks(allRows).length;
  const rawUniquePublications = uniqueOpenedPublicationIds(allRows).size;
  return { ...summary, rawTotal, rawUniquePublications, excluded: Math.max(0, rawTotal - summary.total), keptRows: uniqueOpenPdfClicks(kept) };
}

/**
 * Referrer shown for an Open PDF click. Click events are written with
 * referrer_host = null by design (only page views carry an actual page
 * referrer), but they retain the session's grounded first-touch referrer in
 * metadata. Fall back to that recorded value only; never infer one.
 */
export function openPdfClickReferrer(row: Pick<OpenPdfRow, "metadata"> & { referrer_host?: string | null }): string | null {
  const actual = row.referrer_host?.trim();
  if (actual) return actual;
  const first = row.metadata?.["first_touch_referrer_host"];
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

/** New York wall-clock timestamp to the second, e.g. "Oct 8, 3:27:05 PM". */
export function formatNyClockSeconds(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

/**
 * Final shaping of the Open PDF click drilldown used by the real report
 * builder: base detail fields come from the shared builder, referrer is
 * overridden with the grounded click referrer, newest first.
 */
export function shapeOpenPdfClickDetails<R extends OpenPdfRow & { referrer_host?: string | null }, D extends { at: string; referrer?: string | null }>(
  keptRows: R[],
  baseDetail: (row: R) => D,
): D[] {
  return keptRows
    .map((row) => ({ ...baseDetail(row), referrer: openPdfClickReferrer(row) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
