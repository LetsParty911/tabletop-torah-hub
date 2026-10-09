/**
 * Separate homepage WhatsApp share-button attempts from PDF share clicks and
 * from sessions attributed to the homepage sharing URL.
 *
 * Call with the canonical admin report's human-qualified rows. Attribution is
 * first touch, so campaign-tagged page views can occur in later sessions and
 * must never be described as confirmed messages or individual recipients.
 */
export type HomepageSharingEvent = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  metadata?: Record<string, unknown> | null;
};

const norm = (value?: string | null) => (value ?? "").trim().toLowerCase();

export function summarizeHomepageSharing(rows: HomepageSharingEvent[], countedPdfRows: HomepageSharingEvent[] = []) {
  let buttonClicks = 0;
  const clickingBrowsers = new Set<string>();
  const linkSessions = new Set<string>();
  const linkVisitors = new Set<string>();
  let lastClickAt: string | null = null;
  let lastLinkVisitAt: string | null = null;

  const isTagged = (row: HomepageSharingEvent) =>
    norm(row.utm_source) === "whatsapp" &&
    norm(row.utm_medium) === "share" &&
    norm(row.utm_campaign) === "weekly-share";

  for (const row of rows) {
    if (
      row.event_name === "share_click" &&
      row.metadata?.["placement"] === "homepage_veahavta" &&
      row.metadata?.["share_method"] === "whatsapp"
    ) {
      buttonClicks += 1;
      if (row.visitor_id) clickingBrowsers.add(row.visitor_id);
      if (!lastClickAt || row.occurred_at > lastClickAt) lastClickAt = row.occurred_at;
    }

    if (isTagged(row) && row.event_name === "page_view") {
      if (row.session_id) linkSessions.add(row.session_id);
      if (row.visitor_id) linkVisitors.add(row.visitor_id);
      if (!lastLinkVisitAt || row.occurred_at > lastLinkVisitAt) lastLinkVisitAt = row.occurred_at;
    }
  }

  let linkDownloads = 0;
  let linkPdfOpens = 0;
  let linkCountedPdfOpens = 0;
  for (const row of rows) {
    if (!row.session_id || !linkSessions.has(row.session_id) || !isTagged(row)) continue;
    if (row.event_name === "download") linkDownloads += 1;
    if (row.event_name === "pdf_open") linkPdfOpens += 1;
  }

  // Campaign conversions only count the same qualified PDF opens as all
  // other admin reports. An attributed visit is not proof a share was sent.
  for (const row of countedPdfRows) {
    if (row.session_id && linkSessions.has(row.session_id) && isTagged(row)) linkCountedPdfOpens += 1;
  }
  return {
    buttonClicks,
    clickingBrowsers: clickingBrowsers.size,
    linkSessions: linkSessions.size,
    linkVisitors: linkVisitors.size,
    linkDownloads,
    linkPdfOpens,
    linkCountedPdfOpens,
    lastClickAt,
    lastLinkVisitAt,
  };
}
