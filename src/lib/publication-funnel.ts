// Publication funnel aggregation.
//
// The publication id is the canonical grouping key whenever an event carries
// one. Server-recorded `download_served` rows carry publication_id but no
// publication_title, so keying on the title (or title||id) would split those
// served requests into a second row named after a UUID. The display title is
// carried from whichever event for that publication knows it.

export type PublicationEventRow = {
  event_name: string | null;
  session_id: string | null;
  visitor_id?: string | null;
  is_new_visitor?: boolean | null;
  publication_id?: string | null;
  publication_title?: string | null;
  publication_series?: string | null;
  occurred_at?: string;
  source_group?: string | null;
  device_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PublicationFunnelRow = {
  id: string | null;
  title: string;
  impressions: number;
  clicks: number;
  uniqueReaders: number;
  pdfOpens: number;
  countedPdfOpens: number;
  countedVisitors: number;
  countedSources: Array<{ label: string; opens: number }>;
  series: string | null;
  lastCountedOpenAt: string | null;
  downloadActions: number;
  downloadsServed: number;
  newVisitorSessions: number;
  returningSessions: number;
  devices: Array<{ label: string; sessions: number }>;
  clickNumerator: number;
  clickDenominator: number;
  downloadNumerator: number;
  downloadDenominator: number;
  sources: Array<{ label: string; sessions: number }>;
};

type Agg = {
  id: string | null;
  title: string;
  impressions: Set<string>;
  clicks: Set<string>;
  readers: Set<string>;
  opens: number;
  series: string | null;
  downloads: number;
  served: number;
  downloadActionIds: Set<string>;
  newVisitorSessions: Set<string>;
  returningSessions: Set<string>;
  devices: Map<string, Set<string>>;
  downloadPairs: Set<string>;
  accessPairs: Set<string>;
  sources: Map<string, Set<string>>;
};

/** Canonical grouping key: publication id first, title only as a fallback. */
export function publicationKey(row: PublicationEventRow): string | null {
  return row.publication_id?.trim() || row.publication_title?.trim() || null;
}

export function aggregatePublications(
  rows: PublicationEventRow[],
  priorVisitors: Set<string> = new Set(),
  countedPdfRows: PublicationEventRow[] = [],
): PublicationFunnelRow[] {
  const publications = new Map<string, Agg>();

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const pubId = row.publication_id?.trim() || "";
    const pubTitle = row.publication_title?.trim() || "";
    const key = pubId || pubTitle;
    if (!key) continue;

    const publication = publications.get(key) ?? {
      id: pubId || null,
      title: pubTitle || pubId,
      impressions: new Set<string>(),
      clicks: new Set<string>(),
      readers: new Set<string>(),
      opens: 0,
      series: row.publication_series?.trim() || null,
      downloads: 0,
      served: 0,
      downloadActionIds: new Set<string>(),
      newVisitorSessions: new Set<string>(),
      returningSessions: new Set<string>(),
      devices: new Map<string, Set<string>>(),
      downloadPairs: new Set<string>(),
      accessPairs: new Set<string>(),
      sources: new Map<string, Set<string>>(),
    };
    if (pubTitle) publication.title = pubTitle;
    if (row.publication_series?.trim()) publication.series = row.publication_series.trim();

    const pair = `${sid}::${key}`;
    if (row.event_name === "publication_impression") publication.impressions.add(pair);
    if (row.event_name === "publication_click") publication.clicks.add(pair);
    if (row.event_name === "pdf_open") {
      publication.opens += 1;
      publication.accessPairs.add(pair);
      if (row.visitor_id) publication.readers.add(row.visitor_id);
    }
    const actionId =
      row.metadata && typeof row.metadata["action_id"] === "string"
        ? String(row.metadata["action_id"]).trim()
        : "";
    if (row.event_name === "download_served") {
      publication.served += 1;
      const actionKey = actionId || `served::${sid}::${key}`;
      publication.downloadActionIds.add(actionKey);
      publication.downloadPairs.add(pair);
      publication.accessPairs.add(pair);
      if (row.visitor_id) publication.readers.add(row.visitor_id);
    }
    if (row.event_name === "download") {
      const actionKey = actionId || `client::${sid}::${key}`;
      publication.downloadActionIds.add(actionKey);
      publication.downloadPairs.add(pair);
      publication.accessPairs.add(pair);
      if (row.visitor_id) publication.readers.add(row.visitor_id);
    }

    const source = row.source_group?.trim() || "Direct";
    const sourceSet = publication.sources.get(source) ?? new Set<string>();
    sourceSet.add(sid);
    publication.sources.set(source, sourceSet);

    const device = row.device_type?.trim() || "unknown";
    const deviceSet = publication.devices.get(device) ?? new Set<string>();
    deviceSet.add(sid);
    publication.devices.set(device, deviceSet);

    const vid = row.visitor_id?.trim();
    if (vid && (priorVisitors.has(vid) || row.is_new_visitor === false)) publication.returningSessions.add(sid);
    else if (row.is_new_visitor === true) publication.newVisitorSessions.add(sid);

    publications.set(key, publication);
  }

  // Only the already human-filtered, five-per-visitor capped actions contribute
  // to the new primary measure. Automatic viewer previews remain in pdfOpens.
  const counted = new Map<string, { opens: number; visitors: Set<string>; sources: Map<string, number>; lastAt: string | null }>();
  for (const row of countedPdfRows) {
    // A missing publication ID still contributes to the headline, but it
    // cannot be assigned reliably to one publication in the ranked table.
    const key = row.publication_id?.trim();
    if (!key) continue;
    const current = counted.get(key) ?? { opens: 0, visitors: new Set<string>(), sources: new Map<string, number>(), lastAt: null };
    current.opens++;
    if (row.visitor_id?.trim()) current.visitors.add(row.visitor_id.trim());
    const src = row.source_group?.trim() || "Direct";
    current.sources.set(src, (current.sources.get(src) ?? 0) + 1);
    if (row.occurred_at && (!current.lastAt || row.occurred_at > current.lastAt)) current.lastAt = row.occurred_at;
    counted.set(key, current);
  }

  return [...publications.values()]
    .map((publication) => ({
      id: publication.id,
      title: publication.title,
      impressions: publication.impressions.size,
      clicks: publication.clicks.size,
      uniqueReaders: publication.readers.size,
      pdfOpens: publication.opens,
      countedPdfOpens: counted.get(publication.id ?? publication.title)?.opens ?? 0,
      countedVisitors: counted.get(publication.id ?? publication.title)?.visitors.size ?? 0,
      countedSources: [...(counted.get(publication.id ?? publication.title)?.sources.entries() ?? [])]
        .map(([label, opens]) => ({ label, opens }))
        .sort((a, b) => b.opens - a.opens),
      series: publication.series,
      lastCountedOpenAt: counted.get(publication.id ?? publication.title)?.lastAt ?? null,
      downloadActions: publication.downloadActionIds.size,
      downloadsServed: publication.served,
      newVisitorSessions: publication.newVisitorSessions.size,
      returningSessions: publication.returningSessions.size,
      devices: [...publication.devices.entries()]
        .map(([label, set]) => ({ label, sessions: set.size }))
        .sort((a, b) => b.sessions - a.sessions),
      clickNumerator: publication.clicks.size,
      clickDenominator: publication.impressions.size,
      downloadNumerator: publication.downloadPairs.size,
      downloadDenominator: publication.accessPairs.size,
      sources: [...publication.sources.entries()]
        .map(([label, set]) => ({ label, sessions: set.size }))
        .sort((a, b) => b.sessions - a.sessions),
    }))
    .sort((a, b) => b.countedPdfOpens - a.countedPdfOpens || b.clicks - a.clicks || a.title.localeCompare(b.title));
}
