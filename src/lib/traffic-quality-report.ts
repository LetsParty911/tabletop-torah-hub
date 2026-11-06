/** Reporting-only, browser-ID-based traffic quality summary.
 *  Uses the exact same session classifier as the owner analytics report.
 *  Never reclassifies, deletes, blocks, or merges a visitor. */
export type TrafficQualityInput = {
  raw: { visitors: number; sessions: number };
  metrics: { people: number; sessions: number };
  confidence: {
    counts: {
      high_confidence_human: number;
      likely_human: number;
      uncertain: number;
      suspected_automation: number;
      internal_test: number;
    };
  };
  /** Only sessions already qualified by the shared report classifier. */
  sessions: Array<{
    visitorId: string | null;
    events: Array<{ event: string }>;
  }>;
};

export function summarizeTrafficQuality(report: TrafficQualityInput) {
  const clickerIds = new Set<string>();
  let publicationClicks = 0;
  for (const session of report.sessions) {
    for (const event of session.events) {
      if (event.event !== "publication_click") continue;
      publicationClicks += 1;
      const id = session.visitorId?.trim();
      if (id) clickerIds.add(id);
    }
  }
  const counts = report.confidence.counts;
  const classifiedSessions =
    counts.high_confidence_human + counts.likely_human + counts.uncertain +
    counts.suspected_automation + counts.internal_test;
  return {
    rawVisitorIds: report.raw.visitors,
    rawSessions: report.raw.sessions,
    qualifiedVisitorIds: report.metrics.people,
    qualifiedSessions: report.metrics.sessions,
    publicationClickerIds: clickerIds.size,
    qualifiedPublicationClicks: publicationClicks,
    classifications: counts,
    classifiedSessions,
  };
}
