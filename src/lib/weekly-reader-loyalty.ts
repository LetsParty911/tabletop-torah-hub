import { classifySessions, type SessionEventRow } from "./human-sessions";
import { isOpenPdfClick } from "./open-pdf-clicks";

const TZ = "America/New_York";
const DAY_MS = 86400000;

export type LoyaltyEvent = SessionEventRow & {
  publication_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Thursday-to-Wednesday weekly publishing cycle, calculated in New York time. */
export function publicationWeekKey(iso: string): string {
  const at = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(at);
  const p = (key: string) => parts.find((x) => x.type === key)?.value ?? "";
  const y = Number(p("year")), m = Number(p("month")), d = Number(p("day"));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p("weekday"));
  if (day < 0 || !y || !m || !d) return "";
  const back = (day - 4 + 7) % 7;
  return new Date(Date.UTC(y, m - 1, d) - back * DAY_MS).toISOString().slice(0, 10);
}

export function weeklyReaderLoyalty(rows: LoyaltyEvent[], now: Date = new Date()) {
  const human = classifySessions(rows);
  const sessionData = new Map<string, { visitor: string; week: string; source: string; opened: boolean; started: number }>();
  for (const event of rows) {
    const sid = event.session_id?.trim(), vid = event.visitor_id?.trim();
    if (!sid || !vid || !human.humanIds.has(sid)) continue;
    const week = publicationWeekKey(event.occurred_at);
    if (!week) continue;
    const time = Date.parse(event.occurred_at);
    if (!Number.isFinite(time)) continue;
    const prior = sessionData.get(sid);
    if (!prior) {
      sessionData.set(sid, {
        visitor: vid, week, source: event.source_group?.trim() || "Direct",
        opened: isOpenPdfClick(event), started: time,
      });
    } else {
      prior.opened ||= isOpenPdfClick(event);
      if (time < prior.started) {
        prior.started = time;
        prior.week = week;
        prior.source = event.source_group?.trim() || prior.source;
      }
    }
  }

  const byWeek = new Map<string, { visitors: Set<string>; openers: Set<string>; sources: Map<string, Set<string>> }>();
  const byVisitor = new Map<string, Set<string>>();
  const sortedSessions = [...sessionData.values()].sort((a,b)=>a.started-b.started);
  for (const s of sortedSessions) {
    const bucket = byWeek.get(s.week) ?? { visitors: new Set(), openers: new Set(), sources: new Map() };
    bucket.visitors.add(s.visitor);
    if (s.opened) bucket.openers.add(s.visitor);
    const from = bucket.sources.get(s.source) ?? new Set<string>();
    from.add(s.visitor);
    bucket.sources.set(s.source, from);
    byWeek.set(s.week, bucket);
    const weeks = byVisitor.get(s.visitor) ?? new Set<string>();
    weeks.add(s.week);
    byVisitor.set(s.visitor, weeks);
  }
  const activeWeek = publicationWeekKey(now.toISOString());
  const result = [...byWeek.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10).map(([week, data]) => {
    const earlierWeeks = [...byWeek.entries()].filter(([w])=>w<week).flatMap(([, x])=>[...x.visitors]);
    const earlier = new Set(earlierWeeks);
    const returning = [...data.visitors].filter((id)=>earlier.has(id)).length;
    const priorDate = new Date(Date.parse(week+"T00:00:00Z")-7*DAY_MS).toISOString().slice(0,10);
    const prior = byWeek.get(priorDate);
    const priorRepeat = prior ? [...data.visitors].filter((id)=>prior.visitors.has(id)).length : 0;
    return {
      week, isPartial: week === activeWeek,
      readers: data.visitors.size, openers: data.openers.size,
      returningObserved: returning, priorWeekRepeat: priorRepeat,
      sources: [...data.sources.entries()].map(([source,ids])=>({source,readers:ids.size})).sort((a,b)=>b.readers-a.readers).slice(0,5),
    };
  });
  return {
    weeks: result,
    twoPlusWeeks: [...byVisitor.values()].filter((s)=>s.size>=2).length,
    threePlusWeeks: [...byVisitor.values()].filter((s)=>s.size>=3).length,
    observedReaderIds: byVisitor.size,
    note: "Likely-human browser IDs only; not identified people. Earlier return counts depend on observed history and may miss visits before this window. Open PDF is an attempted click, not confirmed reading. The current week is incomplete.",
  };
}
