import { classifySessions, type SessionEventRow } from "./human-sessions";
import { isOpenPdfClick } from "./open-pdf-clicks";

/** Seven completed Sunday-Saturday New York weeks. One browser ID per week. */
export type AudienceEvent = SessionEventRow & {
  is_new_visitor?: boolean | null;
  publication_id?: string | null;
  publication_title?: string | null;
  publication_series?: string | null;
  utm_source?: string | null;
  metadata?: Record<string, unknown> | null;
};
const ZONE = "America/New_York";
const DAY = 86_400_000;
const DELIBERATE = new Set([
  "publication_click", "download", "print_click", "share_click", "signup",
  "search", "filter_change", "chooser_select", "recommendation_click",
  "my_table_add", "my_table_remove", "my_table_open", "noahide_footer_click", "signup_attempt",
]);
const addDays = (key: string, days: number) =>
  new Date(Date.parse(key + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);

export function sundayWeekKey(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(new Date(timestamp));
  const val = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(val("weekday"));
  const year = Number(val("year")), month = Number(val("month")), date = Number(val("day"));
  if (day < 0 || !year || !month || !date) return "";
  return new Date(Date.UTC(year, month - 1, date) - day * DAY).toISOString().slice(0, 10);
}

function attribution(row: AudienceEvent): string {
  const group = row.source_group?.trim() || "Direct";
  const source = row.utm_source?.trim().toLowerCase() || "";
  return source && !["direct", "google"].includes(group.toLowerCase())
    ? group + " / " + source.slice(0, 40)
    : group;
}

type WeekVisitor = {
  actions: Set<string>;
  requestedPdf: boolean;
  previewLoaded: boolean;
  previewFocused: boolean;
  signupAttempted: boolean;
  signupFailed: boolean;
  signedUp: boolean;
  publications: Set<string>;
};
type Publication = { title: string; series: string; visitors: Map<string, Set<string>> };

export function sevenWeekAudience(rows: AudienceEvent[], now: Date = new Date()) {
  const currentWeek = sundayWeekKey(now.toISOString());
  const firstWeek = addDays(currentWeek, -49);
  const weeks = Array.from({ length: 7 }, (_, i) => addDays(firstWeek, i * 7));
  const qualified = classifySessions(rows);
  const observedFirst = new Map<string, number>();
  const sourceFirst = new Map<string, string>();
  const byWeek = new Map<string, Map<string, WeekVisitor>>(weeks.map((w) => [w, new Map()]));
  const byPublication = new Map<string, Publication>();
  const bySeries = new Map<string, Map<string, Set<string>>>();
  const eligibleRows = rows
    .filter((row) => row.visitor_id?.trim() && row.session_id?.trim())
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  for (const row of eligibleRows) {
    const visitor = row.visitor_id!.trim(), session = row.session_id!.trim();
    const time = Date.parse(row.occurred_at);
    if (!Number.isFinite(time)) continue;
    const earliest = observedFirst.get(visitor);
    if (earliest === undefined || time < earliest) observedFirst.set(visitor, time);
    if (!qualified.humanIds.has(session)) continue;
    if (!sourceFirst.has(visitor)) sourceFirst.set(visitor, attribution(row));

    const week = sundayWeekKey(row.occurred_at);
    if (!week || week < firstWeek || week >= currentWeek) continue;
    const group = byWeek.get(week);
    if (!group) continue;
    let entry = group.get(visitor);
    if (!entry) {
      entry = { actions: new Set(), requestedPdf: false, previewLoaded: false,
        previewFocused: false, signupAttempted: false, signupFailed: false,
        signedUp: false, publications: new Set() };
      group.set(visitor, entry);
    }
    const name = row.event_name ?? "";
    if (DELIBERATE.has(name)) entry.actions.add(name);
    if (isOpenPdfClick(row) || name === "download") entry.requestedPdf = true;
    if (name === "pdf_open") entry.previewLoaded = true;
    if (name === "pdf_preview_focus") entry.previewFocused = true;
    if (name === "signup_attempt") entry.signupAttempted = true;
    if (name === "signup_failure") entry.signupFailed = true;
    if (name === "signup") entry.signedUp = true;

    // Publication/series loyalty requires deliberate selection, not iframe loading.
    if (isOpenPdfClick(row) || name === "download") {
      const key = row.publication_id?.trim() || row.publication_title?.trim();
      const series = row.publication_series?.trim();
      if (key) {
        entry.publications.add(key);
        const item = byPublication.get(key) ?? {
          title: row.publication_title?.trim() || key,
          series: series || "Unspecified", visitors: new Map<string, Set<string>>(),
        };
        const dates = item.visitors.get(visitor) ?? new Set<string>();
        dates.add(week);
        item.visitors.set(visitor, dates);
        byPublication.set(key, item);
      }
      if (series) {
        const people = bySeries.get(series) ?? new Map<string, Set<string>>();
        const dates = people.get(visitor) ?? new Set<string>();
        dates.add(week);
        people.set(visitor, dates);
        bySeries.set(series, people);
      }
    }
  }

  const visitorWeeks = new Map<string, Set<string>>();
  const actionWeeks = new Map<string, Set<string>>();
  const sourceVisitors = new Map<string, Set<string>>();
  let multiPublicationVisitorWeeks = 0, singlePublicationVisitorWeeks = 0;

  for (const [week, people] of byWeek) {
    for (const [vid, detail] of people) {
      const dates = visitorWeeks.get(vid) ?? new Set<string>();
      dates.add(week);
      visitorWeeks.set(vid, dates);
      if (detail.actions.size) {
        const actionDates = actionWeeks.get(vid) ?? new Set<string>();
        actionDates.add(week);
        actionWeeks.set(vid, actionDates);
      }
      if (detail.publications.size >= 2) multiPublicationVisitorWeeks++;
      if (detail.publications.size === 1) singlePublicationVisitorWeeks++;
      const source = sourceFirst.get(vid) ?? "Direct";
      const ids = sourceVisitors.get(source) ?? new Set<string>();
      ids.add(vid);
      sourceVisitors.set(source, ids);
    }
  }

  const weekly = weeks.map((week, i) => {
    const people = byWeek.get(week)!;
    const previous = i > 0 ? byWeek.get(weeks[i - 1]!)! : null;
    const earlier = new Set(weeks.slice(0, i).flatMap((w) => [...byWeek.get(w)!.keys()]));
    const lastWeekReturn = previous ? [...people.keys()].filter((id) => previous.has(id)).length : 0;
    const base = previous?.size ?? 0;
    const firstObserved = [...people.keys()].filter((id) => {
      const first = observedFirst.get(id);
      return first !== undefined && sundayWeekKey(new Date(first).toISOString()) === week;
    }).length;
    const visits = [...people.values()];
    const sources = new Map<string, number>();
    for (const id of people.keys()) {
      const source = sourceFirst.get(id) ?? "Direct";
      sources.set(source, (sources.get(source) ?? 0) + 1);
    }
    return {
      week, through: addDays(week, 6), visitors: people.size,
      firstObserved, seenEarlier: people.size - firstObserved,
      returnedWithinWindow: [...people.keys()].filter((id) => earlier.has(id)).length,
      priorWeekRepeat: lastWeekReturn, priorWeekBase: base,
      priorWeekRate: base >= 10 ? lastWeekReturn / base : null,
      deliberateVisitors: visits.filter((v) => v.actions.size > 0).length,
      pdfRequestedVisitors: visits.filter((v) => v.requestedPdf).length,
      automaticPreviewVisitors: visits.filter((v) => v.previewLoaded).length,
      previewFocusVisitors: visits.filter((v) => v.previewFocused).length,
      signupAttemptVisitors: visits.filter((v) => v.signupAttempted).length,
      signupFailureVisitors: visits.filter((v) => v.signupFailed).length,
      signupSuccessVisitors: visits.filter((v) => v.signedUp).length,
      topSource: [...sources.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
    };
  });

  const sourceLoyalty = [...sourceVisitors.entries()].map(([source, ids]) => {
    let repeat = 0, consecutive = 0, engaged = 0;
    for (const id of ids) {
      const dates = visitorWeeks.get(id)!;
      if (dates.size >= 2) repeat++;
      if ([...dates].some((day) => dates.has(addDays(day, 7)))) consecutive++;
      if ((actionWeeks.get(id)?.size ?? 0) >= 2) engaged++;
    }
    return { source, visitors: ids.size, multiWeekVisitors: repeat,
      consecutiveWeekVisitors: consecutive, engagedMultiWeekVisitors: engaged,
      consecutiveRate: ids.size >= 10 ? consecutive / ids.size : null };
  }).sort((a, b) => b.visitors - a.visitors).slice(0, 12);

  const seriesLoyalty = [...bySeries.entries()].map(([series, visitors]) => ({
    series, readers: visitors.size,
    multiWeekReaders: [...visitors.values()].filter((dates) => dates.size >= 2).length,
  })).sort((a, b) => b.multiWeekReaders - a.multiWeekReaders || b.readers - a.readers).slice(0, 12);
  const publicationLoyalty = [...byPublication.values()].map((item) => ({
    title: item.title, series: item.series, readers: item.visitors.size,
    returningAcrossWeeks: [...item.visitors.values()].filter((dates) => dates.size >= 2).length,
  })).sort((a, b) => b.returningAcrossWeeks - a.returningAcrossWeeks || b.readers - a.readers).slice(0, 10);

  return {
    windowStart: firstWeek, windowEndExclusive: currentWeek,
    weeks: weekly, distinctQualifiedVisitors: visitorWeeks.size,
    inTwoPlusWeeks: [...visitorWeeks.values()].filter((dates) => dates.size >= 2).length,
    inThreePlusWeeks: [...visitorWeeks.values()].filter((dates) => dates.size >= 3).length,
    inAllSevenWeeks: [...visitorWeeks.values()].filter((dates) => dates.size === 7).length,
    consecutiveWeekVisitors: [...visitorWeeks.values()].filter((dates) =>
      [...dates].some((day) => dates.has(addDays(day, 7)))).length,
    engagedInTwoPlusWeeks: [...actionWeeks.values()].filter((dates) => dates.size >= 2).length,
    engagedInThreePlusWeeks: [...actionWeeks.values()].filter((dates) => dates.size >= 3).length,
    multiplePublicationsInWeek: multiPublicationVisitorWeeks,
    onePublicationInWeek: singlePublicationVisitorWeeks,
    sourceLoyalty, seriesLoyalty, publicationLoyalty,
    trafficQuality: {
      sessionsObserved: qualified.sessions.size,
      likelyHumanSessions: qualified.humanIds.size,
      excludedSuspectedAutomation: qualified.counts.suspected_automation,
      excludedUncertain: qualified.counts.uncertain,
      excludedInternal: qualified.counts.internal_test,
    },
    caveat: "Browser IDs are not people. September lacked full network metadata. Clicks, previews and focus do not establish reading or completed transfers. B&H corporate visitors remain eligible. Closed-site requests are not ordinary visits.",
  };
}
