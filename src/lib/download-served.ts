/**
 * Pure builder for the canonical server-side `download_served` row.
 *
 * Identity (action/session/visitor) comes only from readCorrelation, which
 * requires a UUID action id and a visitor id matching the first-party
 * tftt_vid cookie. Parsha, year and title come only from the validated
 * catalogue row the route just read — never from client query parameters.
 * The row means "redirect to the real file issued", not a finished download.
 */
export type DownloadCorrelation = { action: string; sid: string; vid: string };
export type DownloadCatalogRow = {
  title?: string | null;
  publication?: string | null;
  parsha_key?: string | null;
  jewish_year?: number | null;
};

export function buildDownloadServedRow(
  c: DownloadCorrelation,
  publicationId: string,
  catalog: DownloadCatalogRow,
  filename: string,
  context: Record<string, unknown>,
  now: Date,
): Record<string, unknown> {
  const year = Number(catalog.jewish_year);
  return {
    ...context,
    event_id: `served-${c.action}`,
    event_name: "download_served",
    occurred_at: now.toISOString(),
    visitor_id: c.vid,
    session_id: c.sid,
    is_new_visitor: null,
    path: `/view/${publicationId}/download`,
    publication_id: publicationId,
    publication_title: catalog.title ?? null,
    publication_series: catalog.publication ?? null,
    parsha: catalog.parsha_key ?? null,
    jewish_year: Number.isFinite(year) && year > 0 ? Math.trunc(year) : null,
    is_internal: false,
    metadata: { action_id: c.action, filename },
  };
}
