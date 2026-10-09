/**
 * Counted PDF opens — the single canonical PDF-access metric for admin reports.
 *
 * A "PDF-access action" is a deliberate reader request to open a PDF:
 *  - a tagged `publication_click` with metadata.action = "open_pdf" (current
 *    Open PDF button; an attempted open, not proof the file loaded or was read),
 *  - a historical user-initiated `download` action,
 *  - a `download_served` redirect ONLY when it carries an action_id that no
 *    `download` action in the same rows carries (solid correlation; served
 *    rows without action_id are audit-only so a paired action is never doubled).
 *
 * Automatic embedded viewer previews (`pdf_open`) are NEVER counted here.
 *
 * Rules (applied in this order):
 *  1. Collapse duplicate deliveries (same event_id) and pair download +
 *     download_served by action_id so one action counts once.
 *  2. Keep only rows from sessions the shared human classifier kept.
 *  3. Drop rows without a visitor_id (kept in raw audit only).
 *  4. Per visitor_id, across all sessions and PDFs in the window, count only
 *     the earliest CAP actions by occurred_at. Later actions are over-cap.
 * Visitors are never merged by IP or location.
 */
export const PDF_ACCESS_CAP_PER_VISITOR = 5;

export type PdfAccessRow = {
  event_name: string | null;
  event_id?: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  publication_id?: string | null;
  publication_title?: string | null;
  publication_series?: string | null;
  parsha?: string | null;
  source_group?: string | null;
  device_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PdfAccessKind = "open_pdf_click" | "download" | "download_served";

export type CountedPdfAccess<T extends PdfAccessRow = PdfAccessRow> = {
  key: string;
  kind: PdfAccessKind;
  row: T;
};

export type PdfAccessPublication = {
  publicationId: string;
  title: string;
  series: string | null;
  parsha: string | null;
  opens: number;
  uniqueVisitors: number;
  topSource: string | null;
  lastAt: string;
};

export type PdfAccessSummary<T extends PdfAccessRow = PdfAccessRow> = {
  cap: number;
  /** Headline: human, identified, capped. */
  counted: number;
  countedActions: CountedPdfAccess<T>[];
  /** All deduplicated access actions before any filter. */
  rawActions: number;
  /** After human filter + identity requirement, before the cap. */
  humanBeforeCap: number;
  excludedNonHuman: number;
  excludedNoVisitorId: number;
  overCap: number;
  visitorsOverCap: number;
  visitors: number;
  sessionsWithAccess: Set<string>;
  uniquePublications: number;
  countedMissingPublicationId: number;
  byKind: Record<PdfAccessKind, number>;
  byPublication: PdfAccessPublication[];
  /** Automatic embedded viewer previews from kept sessions (separate, never in counted). */
  automaticPreviews: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function isTaggedOpenPdfClick(row: Pick<PdfAccessRow, "event_name" | "metadata">): boolean {
  return row.event_name === "publication_click" && str(row.metadata?.["action"]) === "open_pdf";
}

/** Deduplicated PDF-access actions (all sessions, unfiltered), chronological. */
export function pdfAccessActions<T extends PdfAccessRow>(rows: T[]): CountedPdfAccess<T>[] {
  const downloadActionIds = new Set<string>();
  for (const row of rows) {
    const id = str(row.metadata?.["action_id"]);
    if (row.event_name === "download" && id) downloadActionIds.add(id);
  }
  const seen = new Set<string>();
  const out: CountedPdfAccess<T>[] = [];
  for (const row of rows) {
    let kind: PdfAccessKind | null = null;
    let key = "";
    const eventId = str(row.event_id);
    const actionId = str(row.metadata?.["action_id"]);
    const fallback = `${row.session_id ?? ""}|${row.publication_id ?? ""}|${row.occurred_at}`;
    if (isTaggedOpenPdfClick(row)) {
      kind = "open_pdf_click";
      key = `click:${eventId || fallback}`;
    } else if (row.event_name === "download") {
      kind = "download";
      key = actionId ? `action:${actionId}` : `download:${eventId || fallback}`;
    } else if (row.event_name === "download_served") {
      // Only solidly-correlated, unpaired served redirects count.
      if (!actionId || downloadActionIds.has(actionId)) continue;
      kind = "download_served";
      key = `action:${actionId}`;
    }
    if (!kind || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, kind, row });
  }
  return out.sort((a, b) => a.row.occurred_at.localeCompare(b.row.occurred_at) || a.key.localeCompare(b.key));
}

export function summarizePdfAccess<T extends PdfAccessRow>(
  rows: T[],
  keptSessionIds: Set<string>,
  cap = PDF_ACCESS_CAP_PER_VISITOR,
): PdfAccessSummary<T> {
  const all = pdfAccessActions(rows);
  const isKept = (r: PdfAccessRow) => Boolean(r.session_id && keptSessionIds.has(r.session_id.trim()));
  const human = all.filter((a) => isKept(a.row));
  const identified = human.filter((a) => str(a.row.visitor_id));
  const perVisitor = new Map<string, number>();
  const overVisitors = new Set<string>();
  const counted: CountedPdfAccess<T>[] = [];
  for (const action of identified) {
    const vid = str(action.row.visitor_id);
    const n = perVisitor.get(vid) ?? 0;
    if (n >= cap) {
      overVisitors.add(vid);
      continue;
    }
    perVisitor.set(vid, n + 1);
    counted.push(action);
  }

  const byKind: Record<PdfAccessKind, number> = { open_pdf_click: 0, download: 0, download_served: 0 };
  const pubs = new Map<string, { title: string; series: string | null; parsha: string | null; opens: number; visitors: Set<string>; sources: Map<string, number>; lastAt: string }>();
  const sessions = new Set<string>();
  let missing = 0;
  for (const a of counted) {
    byKind[a.kind] += 1;
    const sid = str(a.row.session_id);
    if (sid) sessions.add(sid);
    const id = str(a.row.publication_id);
    if (!id) {
      missing += 1;
      continue;
    }
    const p = pubs.get(id) ?? { title: str(a.row.publication_title) || id, series: null, parsha: null, opens: 0, visitors: new Set<string>(), sources: new Map<string, number>(), lastAt: a.row.occurred_at };
    if (str(a.row.publication_title)) p.title = str(a.row.publication_title);
    p.series = str(a.row.publication_series) || p.series;
    p.parsha = str(a.row.parsha) || p.parsha;
    p.opens += 1;
    p.visitors.add(str(a.row.visitor_id));
    const src = str(a.row.source_group) || "Direct";
    p.sources.set(src, (p.sources.get(src) ?? 0) + 1);
    if (a.row.occurred_at > p.lastAt) p.lastAt = a.row.occurred_at;
    pubs.set(id, p);
  }

  return {
    cap,
    counted: counted.length,
    countedActions: counted,
    rawActions: all.length,
    humanBeforeCap: identified.length,
    excludedNonHuman: all.length - human.length,
    excludedNoVisitorId: human.length - identified.length,
    overCap: identified.length - counted.length,
    visitorsOverCap: overVisitors.size,
    visitors: perVisitor.size,
    sessionsWithAccess: sessions,
    uniquePublications: pubs.size,
    countedMissingPublicationId: missing,
    byKind,
    byPublication: [...pubs.entries()]
      .map(([publicationId, p]) => ({
        publicationId,
        title: p.title,
        series: p.series,
        parsha: p.parsha,
        opens: p.opens,
        uniqueVisitors: p.visitors.size,
        topSource: [...p.sources.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
        lastAt: p.lastAt,
      }))
      .sort((x, y) => y.opens - x.opens || y.lastAt.localeCompare(x.lastAt)),
    automaticPreviews: rows.filter((r) => r.event_name === "pdf_open" && isKept(r)).length,
  };
}

/** PDF-open rate: human sessions with ≥1 counted action ÷ human sessions. */
export function pdfOpenRate(sessionsWithAccess: number, humanSessions: number): number {
  return humanSessions > 0 ? sessionsWithAccess / humanSessions : 0;
}
