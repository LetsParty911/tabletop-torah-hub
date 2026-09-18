import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

type EventRow = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  is_new_visitor: boolean | null;
  path: string | null;
  publication_id: string | null;
  publication_title: string | null;
  device_type: string | null;
  source_group: string | null;
};

type WindowDef = { parsha: string; start: string; end: string };

type SessionAgg = {
  id: string;
  visitorId: string | null;
  source: string;
  device: string;
  pageviews: number;
  engaged: boolean;
  accessedPdf: boolean;
  downloaded: boolean;
  firstAt: number;
  lastAt: number;
  heartbeats: number;
  impressions: number;
  humanSignal: boolean;
  meaningfulIntent: boolean;
};

// Events that only a person can realistically produce.
const MEANINGFUL_INTENT = new Set([
  "download",
  "pdf_open",
  "publication_click",
  "filter_change",
  "search",
  "share_click",
  "signup",
  "human_signal",
]);

// One-time cleanup for a known automated traffic spike on 2026-09-18.
// This is intentionally narrow: it only applies to sessions that started inside
// the incident window and match every low-confidence signal. It must not be
// turned into a general "filter all one-page bounces" rule.
const KNOWN_INCIDENT_START = Date.parse("2026-09-18T00:30:00.000Z");
const KNOWN_INCIDENT_END = Date.parse("2026-09-18T01:15:00.000Z");

async function requireAnalyticsAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Server misconfigured: Supabase credentials missing");

  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await cloud.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");

  const email = (data.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
}

function buildCollectionWindows(
  rows: Array<{ parsha_key: string | null; created_at: string | null }>,
): WindowDef[] {
  const firstAt = new Map<string, string>();
  const lastAt = new Map<string, string>();

  for (const row of rows) {
    const parsha = row.parsha_key?.trim() ?? "";
    const at = row.created_at ?? "";
    if (!parsha || !at) continue;
    if (!firstAt.has(parsha) || at < firstAt.get(parsha)!) firstAt.set(parsha, at);
    if (!lastAt.has(parsha) || at > lastAt.get(parsha)!) lastAt.set(parsha, at);
  }

  const ordered = [...lastAt.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([parsha]) => parsha);

  const windows: WindowDef[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const parsha = ordered[index]!;
    const start = firstAt.get(parsha)!;
    const end =
      index === 0 ? new Date(Date.now() + 60_000).toISOString() : windows[index - 1]!.start;
    windows.push({ parsha, start, end });
  }
  return windows;
}

async function fetchEventsBetween(start: string, end: string): Promise<EventRow[]> {
  const admin = getSupabaseAdmin();
  const out: EventRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(
        "event_name, occurred_at, visitor_id, session_id, is_new_visitor, path, publication_id, publication_title, device_type, source_group",
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as EventRow[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

function visitorIds(rows: EventRow[]): string[] {
  return [
    ...new Set(rows.map((row) => row.visitor_id?.trim()).filter((id): id is string => Boolean(id))),
  ];
}

async function fetchPriorVisitors(ids: string[], before: string): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const prior = new Set<string>();
  const pageSize = 1000;

  for (let index = 0; index < ids.length; index += 75) {
    const batch = ids.slice(index, index + 75);
    if (!batch.length) continue;

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("analytics_events")
        .select("visitor_id, occurred_at")
        .in("visitor_id", batch)
        .lt("occurred_at", before)
        .order("occurred_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Array<{ visitor_id: string | null; occurred_at: string }>;
      for (const row of page) {
        if (row.visitor_id) prior.add(row.visitor_id);
      }
      if (page.length < pageSize || batch.every((id) => prior.has(id))) break;
    }
  }
  return prior;
}

/**
 * Builds per-session stats from the raw canonical event rows.
 * No filtering happens here — classification is a separate step.
 */
function buildSessions(rows: EventRow[]): Map<string, SessionAgg> {
  const sessions = new Map<string, SessionAgg>();

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const vid = row.visitor_id?.trim() || null;
    const at = Date.parse(row.occurred_at);
    const time = Number.isNaN(at) ? 0 : at;

    let session = sessions.get(sid);
    if (!session) {
      session = {
        id: sid,
        visitorId: vid,
        source: row.source_group?.trim() || "Direct",
        device: row.device_type?.trim() || "unknown",
        pageviews: 0,
        engaged: false,
        accessedPdf: false,
        downloaded: false,
        firstAt: time,
        lastAt: time,
        heartbeats: 0,
        impressions: 0,
        humanSignal: false,
        meaningfulIntent: false,
      };
      sessions.set(sid, session);
    }

    if (!session.visitorId && vid) session.visitorId = vid;
    if (session.source === "Direct" && row.source_group?.trim())
      session.source = row.source_group.trim();
    if (session.device === "unknown" && row.device_type?.trim())
      session.device = row.device_type.trim();
    if (time) {
      if (!session.firstAt || time < session.firstAt) session.firstAt = time;
      if (time > session.lastAt) session.lastAt = time;
    }

    const name = row.event_name ?? "";
    if (name === "page_view") session.pageviews += 1;
    if (name === "heartbeat") session.heartbeats += 1;
    if (name === "publication_impression") session.impressions += 1;
    if (name === "human_signal") session.humanSignal = true;
    if (MEANINGFUL_INTENT.has(name)) session.meaningfulIntent = true;
    // A heartbeat alone is never engagement.
    if (MEANINGFUL_INTENT.has(name)) session.engaged = true;
    if (name === "pdf_open" || name === "download") session.accessedPdf = true;
    if (name === "download") session.downloaded = true;
  }

  return sessions;
}

/**
 * High-confidence automation only. Any session showing real intent (download,
 * pdf_open, publication_click, filter, search, share, signup, human_signal) is
 * never classified as automated.
 */
function classifyAutomation(sessions: SessionAgg[]): Set<string> {
  const automated = new Set<string>();
  const oneHitCandidates: SessionAgg[] = [];

  for (const session of sessions) {
    if (session.meaningfulIntent || session.humanSignal) continue;
    const isDirectDesktop = session.source === "Direct" && session.device === "desktop";
    if (!isDirectDesktop) continue;

    const durationMs = Math.max(0, session.lastAt - session.firstAt);

    // (b) Impossible heartbeat cadence — the client beats every 15 seconds,
    // so 10+ beats inside a minute cannot be a real browser.
    if (durationMs <= 60_000 && session.heartbeats >= 10) {
      automated.add(session.id);
      continue;
    }

    // (a) Instant one-hit session — only counted when it arrives in a burst.
    if (durationMs <= 2_000 && session.pageviews <= 1) {
      oneHitCandidates.push(session);
    }
  }

  const buckets = new Map<number, SessionAgg[]>();
  for (const session of oneHitCandidates) {
    const bucket = Math.floor(session.firstAt / 10_000);
    const list = buckets.get(bucket) ?? [];
    list.push(session);
    buckets.set(bucket, list);
  }
  for (const list of buckets.values()) {
    if (list.length < 8) continue; // isolated instant bounces stay counted
    for (const session of list) automated.add(session.id);
  }

  return automated;
}

/**
 * One-time cleanup for a known automation incident.
 *
 * On 2026-09-18 a crawler/bot produced many Direct/desktop sessions, each with
 * a single pageview, no meaningful intent events, no human_signal, no
 * publication impressions, and no heartbeats. Because they were spread across
 * many minutes they did not trigger the 10-second burst rule. This helper
 * removes only those sessions that started inside the known incident window and
 * match every low-confidence signal. It is intentionally not a general rule.
 */
function classifyKnownIncident(sessions: SessionAgg[]): Set<string> {
  const automated = new Set<string>();
  for (const session of sessions) {
    if (session.firstAt < KNOWN_INCIDENT_START || session.firstAt >= KNOWN_INCIDENT_END)
      continue;
    if (session.source !== "Direct") continue;
    if (session.device !== "desktop") continue;
    if (session.meaningfulIntent) continue;
    if (session.humanSignal) continue;
    if (session.pageviews > 1) continue;
    if (session.impressions !== 0) continue;
    if (session.heartbeats > 1) continue;
    automated.add(session.id);
  }
  return automated;
}

function summarizeCanonical(rows: EventRow[], priorVisitors = new Set<string>()) {
  const allSessions = buildSessions(rows);
  const automated = classifyAutomation([...allSessions.values()]);
  const knownIncident = classifyKnownIncident([...allSessions.values()]);
  const allAutomated = new Set([...automated, ...knownIncident]);

  const rawSessions = allSessions.size;
  const rawVisitors = new Set<string>();
  for (const session of allSessions.values()) {
    if (session.visitorId) rawVisitors.add(session.visitorId);
  }

  const kept = [...allSessions.values()].filter((session) => !allAutomated.has(session.id));
  const keptIds = new Set(kept.map((session) => session.id));
  const keptRows = rows.filter((row) => {
    const sid = row.session_id?.trim();
    return sid ? keptIds.has(sid) : false;
  });

  const visitors = new Set<string>();
  const returningVisitors = new Set<string>();
  const sourceSessions = new Map<string, Set<string>>();
  const deviceSessions = new Map<string, Set<string>>();
  const pageMap = new Map<string, { pageviews: number; sessions: Set<string> }>();
  const uniquePdfDownloads = new Set<string>();
  let downloadActions = 0;

  for (const row of keptRows) {
    const sid = row.session_id!.trim();
    const vid = row.visitor_id?.trim() || null;
    if (vid) {
      visitors.add(vid);
      if (priorVisitors.has(vid) || row.is_new_visitor === false) returningVisitors.add(vid);
    }

    const name = row.event_name ?? "";
    if (name === "page_view") {
      const path = row.path?.trim() || "/";
      const page = pageMap.get(path) ?? { pageviews: 0, sessions: new Set<string>() };
      page.pageviews += 1;
      page.sessions.add(sid);
      pageMap.set(path, page);
    }
    if (name === "download") {
      downloadActions += 1;
      const publication = row.publication_id?.trim() || row.publication_title?.trim() || "unknown";
      uniquePdfDownloads.add(`${sid}::${publication}`);
    }
  }

  for (const session of kept) {
    const sourceSet = sourceSessions.get(session.source) ?? new Set<string>();
    sourceSet.add(session.id);
    sourceSessions.set(session.source, sourceSet);

    const deviceSet = deviceSessions.get(session.device) ?? new Set<string>();
    deviceSet.add(session.id);
    deviceSessions.set(session.device, deviceSet);
  }

  const downloadingSessions = kept.filter((session) => session.downloaded).length;
  const pdfAccessingSessions = kept.filter((session) => session.accessedPdf).length;
  const engagedSessions = kept.filter(
    (session) => session.engaged || session.pageviews >= 2,
  ).length;

  return {
    pageviews: keptRows.filter((row) => row.event_name === "page_view").length,
    sessions: kept.length,
    uniqueVisitors: visitors.size,
    rawSessions,
    rawUniqueVisitors: rawVisitors.size,
    filteredAutomationSessions: allAutomated.size,
    returningVisitors: returningVisitors.size,
    engagedSessions,
    pdfAccessingSessions,
    downloadingSessions,
    uniquePdfDownloads: uniquePdfDownloads.size,
    downloadActions,
    downloadConversion: kept.length ? downloadingSessions / kept.length : 0,
    sources: [...sourceSessions.entries()]
      .map(([label, set]) => ({ label, sessions: set.size }))
      .sort((a, b) => b.sessions - a.sessions),
    devices: [...deviceSessions.entries()]
      .map(([label, set]) => ({ label, sessions: set.size }))
      .sort((a, b) => b.sessions - a.sessions),
    topPages: [...pageMap.entries()]
      .map(([path, value]) => ({ path, pageviews: value.pageviews, sessions: value.sessions.size }))
      .sort((a, b) => b.pageviews - a.pageviews || b.sessions - a.sessions)
      .slice(0, 10),
  };
}

export const adminCanonicalCollectionTraffic = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; parsha?: string | null }) =>
    z
      .object({ accessToken: z.string().min(10), parsha: z.string().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const pdfResult = await admin.from("pdfs").select("parsha_key, created_at");
    if (pdfResult.error) throw new Error(pdfResult.error.message);

    const windows = buildCollectionWindows(
      (pdfResult.data ?? []) as Array<{ parsha_key: string | null; created_at: string | null }>,
    );
    const selected =
      data.parsha && windows.some((window) => window.parsha === data.parsha)
        ? data.parsha
        : (windows[0]?.parsha ?? null);
    const selectedIndex = selected ? windows.findIndex((window) => window.parsha === selected) : -1;
    const currentWindow = selectedIndex >= 0 ? windows[selectedIndex]! : null;
    const previousWindow = selectedIndex >= 0 ? (windows[selectedIndex + 1] ?? null) : null;

    if (!currentWindow) {
      const empty = summarizeCanonical([]);
      return {
        parshas: [] as string[],
        selectedParsha: null as string | null,
        previousParsha: null as string | null,
        currentWindow: null,
        previousWindow: null,
        current: empty,
        previous: empty,
        currentSubscribers: 0,
        previousSubscribers: 0,
        subscriberConversion: 0,
        previousSubscriberConversion: 0,
      };
    }

    const [currentRows, previousRows] = await Promise.all([
      fetchEventsBetween(currentWindow.start, currentWindow.end),
      previousWindow
        ? fetchEventsBetween(previousWindow.start, previousWindow.end)
        : Promise.resolve([] as EventRow[]),
    ]);
    const [currentPrior, previousPrior] = await Promise.all([
      fetchPriorVisitors(visitorIds(currentRows), currentWindow.start),
      previousWindow
        ? fetchPriorVisitors(visitorIds(previousRows), previousWindow.start)
        : Promise.resolve(new Set<string>()),
    ]);

    const current = summarizeCanonical(currentRows, currentPrior);
    const previous = summarizeCanonical(previousRows, previousPrior);

    const countSubscribers = async (window: WindowDef | null) => {
      if (!window) return 0;
      const { count, error } = await admin
        .from("subscribers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", window.start)
        .lt("created_at", window.end);
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [currentSubscribers, previousSubscribers] = await Promise.all([
      countSubscribers(currentWindow),
      countSubscribers(previousWindow),
    ]);

    return {
      parshas: windows.map((window) => window.parsha),
      selectedParsha: selected,
      previousParsha: previousWindow?.parsha ?? null,
      currentWindow,
      previousWindow,
      current,
      previous,
      currentSubscribers,
      previousSubscribers,
      subscriberConversion: current.uniqueVisitors
        ? currentSubscribers / current.uniqueVisitors
        : 0,
      previousSubscriberConversion: previous.uniqueVisitors
        ? previousSubscribers / previous.uniqueVisitors
        : 0,
    };
  });

export const adminCanonicalSinceLast = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; since: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        // Accept any parseable timestamp, not only strict Zod datetime format.
        since: z
          .string()
          .min(1)
          .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date")
          .transform((v) => new Date(v).toISOString()),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const rows = await fetchEventsBetween(data.since, new Date().toISOString());
    const prior = await fetchPriorVisitors(visitorIds(rows), data.since);
    return summarizeCanonical(rows, prior);
  });

function newYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function startOfTodayNewYork(now = new Date()): string {
  const today = newYorkParts(now);
  const targetWallClock = Date.UTC(today.year, today.month - 1, today.day, 0, 0, 0);

  // Start with UTC midnight for the New York calendar date, then iteratively
  // correct until that instant formats to 00:00:00 in New York. This resolves
  // the offset that applies at local midnight itself, including DST-change days.
  let candidate = targetWallClock;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const shown = newYorkParts(new Date(candidate));
    const shownWallClock = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const correction = targetWallClock - shownWallClock;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate).toISOString();
}

export const adminDownloadActionsTodayEt = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
      .from("download_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfTodayNewYork());
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });
