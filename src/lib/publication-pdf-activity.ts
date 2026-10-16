import { pdfAccessActions, type PdfAccessRow } from './pdf-access';
import { csvCell } from './open-pdf-clicks';

export type PdfCatalogEntry = { id: string; title: string; parsha_key: string | null; publication?: string | null };
export type PublicationPdfActivity = {
  publicationId: string; title: string; parsha: string | null;
  deliberateOpens: number; automaticLoads: number; historicalDownloads: number; historicalRedirects: number;
  uniqueVisitors: number; visitorIds: string[]; lastAt: string | null;
};

/** Read-only projection. Uses canonical action pairing and the caller's shared human classification. */
export function publicationPdfActivity(rows: PdfAccessRow[], kept: Set<string>, catalog: PdfCatalogEntry[] = []) {
  const pubs = new Map<string, PublicationPdfActivity>();
  for (const p of catalog) pubs.set(p.id, { publicationId: p.id, title: p.title, parsha: p.parsha_key,
    deliberateOpens: 0, automaticLoads: 0, historicalDownloads: 0, historicalRedirects: 0,
    uniqueVisitors: 0, visitorIds: [], lastAt: null });
  let missingPublication = 0;
  const add = (r: PdfAccessRow, kind: 'deliberateOpens' | 'automaticLoads' | 'historicalDownloads' | 'historicalRedirects') => {
    if (!r.session_id || !kept.has(r.session_id.trim()) || !r.visitor_id?.trim()) return;
    const id = r.publication_id?.trim();
    if (!id) { missingPublication++; return; }
    const p = pubs.get(id) ?? { publicationId: id, title: r.publication_title || id, parsha: r.parsha || null,
      deliberateOpens: 0, automaticLoads: 0, historicalDownloads: 0, historicalRedirects: 0,
      uniqueVisitors: 0, visitorIds: [], lastAt: null };
    p.parsha ||= r.parsha || null;
    p[kind]++;
    if (!p.visitorIds.includes(r.visitor_id.trim())) p.visitorIds.push(r.visitor_id.trim());
    p.uniqueVisitors = p.visitorIds.length;
    if (!p.lastAt || r.occurred_at > p.lastAt) p.lastAt = r.occurred_at;
    pubs.set(id, p);
  };
  for (const a of pdfAccessActions(rows)) add(a.row, a.kind === 'open_pdf_click' ? 'deliberateOpens' : a.kind === 'download' ? 'historicalDownloads' : 'historicalRedirects');
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.event_name !== 'pdf_open') continue;
    const key = r.event_id?.trim() || `${r.session_id}|${r.publication_id}|${r.occurred_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add(r, 'automaticLoads');
  }
  return { publications: [...pubs.values()], missingPublication };
}

export function activityTotals(rows: PublicationPdfActivity[]) {
  return { deliberateOpens: rows.reduce((n, p) => n + p.deliberateOpens, 0),
    automaticLoads: rows.reduce((n, p) => n + p.automaticLoads, 0),
    historicalDownloads: rows.reduce((n, p) => n + p.historicalDownloads, 0),
    historicalRedirects: rows.reduce((n, p) => n + p.historicalRedirects, 0),
    uniqueVisitors: new Set(rows.flatMap(p => p.visitorIds)).size };
}

export function publicationActivityCsv(rows: PublicationPdfActivity[]) {
  return [['publication_id','title','parsha','deliberate_open_attempts','automatic_viewer_loads','historical_download_actions','unpaired_historical_redirects','unique_activity_visitors','last_activity_utc'].join(','),
    ...rows.map(p => [p.publicationId,p.title,p.parsha,p.deliberateOpens,p.automaticLoads,p.historicalDownloads,p.historicalRedirects,p.uniqueVisitors,p.lastAt].map(csvCell).join(','))].join('\n');
}

export type ActivityMetric = 'deliberateOpens' | 'automaticLoads' | 'historicalDownloads' | 'historicalRedirects' | 'uniqueVisitors';
export function selectPublicationActivity(rows: PublicationPdfActivity[], parsha: string, metric: ActivityMetric) {
  return rows.filter(p => !parsha || (p.parsha || '__unknown') === parsha)
    .sort((a, b) => b[metric] - a[metric] || a.title.localeCompare(b.title));
}
