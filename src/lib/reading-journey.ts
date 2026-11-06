/** Human-qualified homepage reading stages, without reconstructing pre-launch section views. */
export type ReadingJourneyEvent = {
  event_name: string | null;
  occurred_at: string;
  session_id: string | null;
  path?: string | null;
  source_group?: string | null;
  utm_source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ReadingJourneyReport = {
  instrumentedSessions: number;
  countedSessions: number;
  excludedSessions: number;
  originalsEligibleSessions: number;
  originalsReached: number;
  weeklyReached: number;
  cardsSeen: number;
  clickedPublications: number;
  didNotClick: number;
  weeklyWithoutClick: number;
  originalsWithoutWeekly: number;
  neitherSectionReached: number;
  sources: Array<{ label: string; sessions: number; clicked: number }>;
};

type JourneySession = {
  at: number;
  source: string;
  hasOriginals: boolean;
  originals: boolean;
  weekly: boolean;
  card: boolean;
  clicked: boolean;
};

/** Sections are optional branches, not a strict linear funnel. */
export function buildReadingJourney(rows: readonly ReadingJourneyEvent[], humanSessionIds: ReadonlySet<string>): ReadingJourneyReport {
  const sessions = new Map<string, JourneySession>();

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid || row.event_name !== "homepage_journey_start" || row.path !== "/") continue;
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at)) continue;
    const previous = sessions.get(sid);
    if (previous && previous.at <= at) continue;
    sessions.set(sid, {
      at,
      source: row.utm_source?.trim() || row.source_group?.trim() || "Direct",
      hasOriginals: row.metadata?.has_originals === true,
      originals: false, weekly: false, card: false, clicked: false,
    });
  }

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid || !humanSessionIds.has(sid)) continue;
    const session = sessions.get(sid);
    if (!session) continue;
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at) || at < session.at) continue;
    if (row.event_name === "section_impression" && row.path === "/") {
      if (row.metadata?.section_id === "originals") session.originals = true;
      if (row.metadata?.section_id === "weekly_collection") session.weekly = true;
    }
    if (row.event_name === "publication_impression" && row.path === "/") session.card = true;
    if (row.event_name === "publication_click") session.clicked = true;
  }

  const qualified = [...sessions.entries()]
    .filter(([sid]) => humanSessionIds.has(sid))
    .map(([, session]) => session);
  const sourceMap = new Map<string, { label: string; sessions: number; clicked: number }>();
  for (const session of qualified) {
    const entry = sourceMap.get(session.source) ?? { label: session.source, sessions: 0, clicked: 0 };
    entry.sessions += 1;
    if (session.clicked) entry.clicked += 1;
    sourceMap.set(session.source, entry);
  }
  const count = (test: (s: JourneySession) => boolean) => qualified.filter(test).length;
  return {
    instrumentedSessions: sessions.size,
    countedSessions: qualified.length,
    excludedSessions: sessions.size - qualified.length,
    originalsEligibleSessions: count((s) => s.hasOriginals),
    originalsReached: count((s) => s.originals && s.hasOriginals),
    weeklyReached: count((s) => s.weekly),
    cardsSeen: count((s) => s.card),
    clickedPublications: count((s) => s.clicked),
    didNotClick: count((s) => !s.clicked),
    weeklyWithoutClick: count((s) => s.weekly && !s.clicked),
    originalsWithoutWeekly: count((s) => s.originals && !s.weekly),
    neitherSectionReached: count((s) => !s.originals && !s.weekly),
    sources: [...sourceMap.values()].sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label)).slice(0, 12),
  };
}
