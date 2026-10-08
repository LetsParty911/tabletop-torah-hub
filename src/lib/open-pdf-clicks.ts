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
    const key = id ?? `title:${title}`;
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
    byPublication: [...pubs.values()]
      .map((p) => ({ publicationId: p.publicationId, title: p.title, clicks: p.clicks, sessions: p.sessions.size, lastAt: p.lastAt }))
      .sort((a, b) => b.clicks - a.clicks || b.lastAt.localeCompare(a.lastAt)),
    byPage: [...pages.entries()].map(([page, clicks]) => ({ page, clicks })).sort((a, b) => b.clicks - a.clicks),
  };
}
