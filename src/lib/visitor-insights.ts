/**
 * Additional admin-only audience insights from existing canonical events.
 * Input MUST already be restricted to the shared likely-human/high-confidence
 * session IDs. This module does not collect identifiers or issue network calls.
 */
export type VisitorInsightEvent = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  path?: string | null;
  source_group?: string | null;
  referrer_host?: string | null;
  device_type?: string | null;
  accept_language?: string | null;
  network_type?: string | null;
  as_organization?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Session = {
  id: string;
  visitorId: string | null;
  rows: VisitorInsightEvent[];
};

const TIMEZONE = "America/New_York";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

function nonempty(value: string | null | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstField(rows: VisitorInsightEvent[], field: keyof VisitorInsightEvent): string {
  for (const row of rows) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function preferredLanguage(raw: string): string {
  const first = raw.split(",")[0]?.trim() ?? "";
  const match = /^([a-z]{2,3})(?:-[a-z]{2,4})?/i.exec(first);
  return match ? match[1]!.toLowerCase() : "Unknown";
}

function hourAndWeekday(iso: string): { hour: number; weekday: string } | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = TIME_PARTS.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? { hour, weekday } : null;
}

function increment(map: Map<string, number>, label: string) {
  map.set(label, (map.get(label) ?? 0) + 1);
}

function ranked(map: Map<string, number>, limit = 12) {
  return [...map.entries()]
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
    .slice(0, limit);
}

type SourceBucket = {
  sessions: number;
  browserIds: Set<string>;
  returningIds: Set<string>;
  pdfSessions: number;
  printSessions: number;
  shareSessions: number;
};

type EntryBucket = { sessions: number; pdfSessions: number; noActionSessions: number };

const ACTION_NAMES = new Set([
  "publication_click", "download", "download_served", "search",
  "filter_change", "share_click", "print_click", "signup",
  "chooser_select", "recommendation_click", "my_table_add", "my_table_open",
]);

/**
 * "Counted PDF" references MUST be supplied by the existing canonical
 * PDF-access classifier, not inferred from automatic viewer-load events.
 * Returning-browser flags also come from the existing history-based report.
 */
export function summarizeVisitorInsights(
  qualifiedRows: VisitorInsightEvent[],
  countedPdfRows: ReadonlySet<VisitorInsightEvent>,
  returningVisitorIds: ReadonlySet<string>,
) {
  const grouped = new Map<string, Session>();
  for (const row of qualifiedRows) {
    const id = nonempty(row.session_id);
    if (!id) continue;
    let session = grouped.get(id);
    if (!session) {
      session = { id, visitorId: null, rows: [] };
      grouped.set(id, session);
    }
    session.rows.push(row);
    if (!session.visitorId && row.visitor_id?.trim()) session.visitorId = row.visitor_id.trim();
  }

  const sourceBuckets = new Map<string, SourceBucket>();
  const entryBuckets = new Map<string, EntryBucket>();
  const languages = new Map<string, number>();
  const networkKinds = new Map<string, number>();
  const networkOrganizations = new Map<string, number>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessions: 0,
    pdfSessions: 0,
  }));
  const weekdayMap = new Map(WEEKDAYS.map((day) => [day, { label: day, sessions: 0, pdfSessions: 0 }]));

  const behavior = {
    singlePageNoSelection: 0,
    multiplePageSessions: 0,
    selectedWithoutPdf: 0,
    searchSessions: 0,
    printSessions: 0,
    shareSessions: 0,
    signupSessions: 0,
    signupFailures: 0,
    errorSessions: 0,
    pdfRouteFailureSessions: 0,
    pdfAttemptSessions: 0,
  };

  for (const session of grouped.values()) {
    const list = session.rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const first = list[0]!;
    const source = firstField(list, "source_group") || "Direct";
    const language = preferredLanguage(firstField(list, "accept_language"));
    const network = firstField(list, "network_type") || "Unclassified";
    const org = (firstField(list, "as_organization") || "Unavailable").slice(0, 90);
    increment(languages, language);
    increment(networkKinds, network);
    increment(networkOrganizations, org);

    const countedPdf = list.some((r) => countedPdfRows.has(r));
    const printed = list.some((r) => r.event_name === "print_click");
    const shared = list.some((r) => r.event_name === "share_click");
    const signedUp = list.some((r) => r.event_name === "signup");
    const searched = list.some((r) => r.event_name === "search");
    const selected = list.some((r) => r.event_name === "publication_click");
    const error = list.some((r) => r.event_name === "error");
    const signupFailure = list.some((r) => r.event_name === "signup_failure");
    const pdfRouteFailure = list.some(
      (r) => r.event_name === "pdf_route_result" && Number(r.metadata?.["http_status"]) >= 400,
    );
    const pageviews = list.filter((r) => r.event_name === "page_view");
    const noSelection = !countedPdf && !list.some((r) => ACTION_NAMES.has(r.event_name ?? ""));

    if (pageviews.length === 1 && noSelection) behavior.singlePageNoSelection++;
    if (pageviews.length > 1) behavior.multiplePageSessions++;
    if (selected && !countedPdf) behavior.selectedWithoutPdf++;
    if (countedPdf) behavior.pdfAttemptSessions++;
    if (printed) behavior.printSessions++;
    if (shared) behavior.shareSessions++;
    if (signedUp) behavior.signupSessions++;
    if (searched) behavior.searchSessions++;
    if (error) behavior.errorSessions++;
    if (signupFailure) behavior.signupFailures++;
    if (pdfRouteFailure) behavior.pdfRouteFailureSessions++;

    const src = sourceBuckets.get(source) ?? {
      sessions: 0, browserIds: new Set<string>(), returningIds: new Set<string>(),
      pdfSessions: 0, printSessions: 0, shareSessions: 0,
    };
    src.sessions++;
    if (session.visitorId) {
      src.browserIds.add(session.visitorId);
      if (returningVisitorIds.has(session.visitorId)) src.returningIds.add(session.visitorId);
    }
    if (countedPdf) src.pdfSessions++;
    if (printed) src.printSessions++;
    if (shared) src.shareSessions++;
    sourceBuckets.set(source, src);

    if (pageviews.length) {
      const path = nonempty(pageviews[0]!.path, "/").split("?")[0]!.slice(0, 180);
      const entry = entryBuckets.get(path) ?? { sessions: 0, pdfSessions: 0, noActionSessions: 0 };
      entry.sessions++;
      if (countedPdf) entry.pdfSessions++;
      if (noSelection) entry.noActionSessions++;
      entryBuckets.set(path, entry);
    }

    const stamp = hourAndWeekday(first.occurred_at);
    if (stamp) {
      hours[stamp.hour]!.sessions++;
      if (countedPdf) hours[stamp.hour]!.pdfSessions++;
      const day = weekdayMap.get(stamp.weekday);
      if (day) {
        day.sessions++;
        if (countedPdf) day.pdfSessions++;
      }
    }
  }

  return {
    sessions: grouped.size,
    bySource: [...sourceBuckets.entries()]
      .map(([source, b]) => ({
        source,
        sessions: b.sessions,
        browserIds: b.browserIds.size,
        returningBrowserIds: b.returningIds.size,
        pdfAttemptSessions: b.pdfSessions,
        printSessions: b.printSessions,
        shareSessions: b.shareSessions,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source))
      .slice(0, 15),
    byEntryPage: [...entryBuckets.entries()]
      .map(([path, b]) => ({ path, ...b }))
      .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path))
      .slice(0, 12),
    hoursET: hours,
    weekdaysET: WEEKDAYS.map((day) => weekdayMap.get(day)!),
    browserLanguages: ranked(languages, 10),
    networkTypes: ranked(networkKinds, 10),
    networkOrganizations: ranked(networkOrganizations, 12),
    behavior,
    note: "Existing first-party event history only. Qualified sessions; no additional cookies, fingerprinting or third-party requests. Browser language and network organization are approximate technical indicators, not personal identity.",
  };
}
