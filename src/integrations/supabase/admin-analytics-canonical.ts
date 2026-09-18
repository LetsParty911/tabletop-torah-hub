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

/* ------------------------------------------------------------------ */
/* Visitor Activity (admin-only investigation view)                     */
/* ------------------------------------------------------------------ */

type VisitorEventRow = EventRow & {
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  accept_language: string | null;
  sec_ch_ua: string | null;
  sec_ch_platform: string | null;
  sec_ch_mobile: string | null;
  asn: number | null;
  as_organization: string | null;
  referrer_host: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

const VISITOR_SELECT =
  "event_name, occurred_at, visitor_id, session_id, is_new_visitor, path, publication_id, publication_title, source_group, device_type, country, region, city, postal_code, metadata, ip_address, user_agent, accept_language, sec_ch_ua, sec_ch_platform, sec_ch_mobile, asn, as_organization, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign";

/** Admin-only view of the enhanced fingerprint snapshot for a session. */
export type FingerprintRow = {
  session_id: string;
  visitor_id: string | null;
  captured_at: string | null;
  consent_mode: string | null;
  fingerprint_version: string | null;
  fingerprint_hash: string | null;
  canvas_hash: string | null;
  font_hash: string | null;
  font_count: number | null;
  webgl_hash: string | null;
  webgl_vendor: string | null;
  webgl_renderer: string | null;
  audio_hash: string | null;
  hardware_concurrency: number | null;
  device_memory: number | null;
  screen_width: number | null;
  screen_height: number | null;
  pixel_ratio: number | null;
  color_depth: number | null;
  timezone: string | null;
  timezone_offset: number | null;
  language: string | null;
  languages: unknown;
  platform: string | null;
  max_touch_points: number | null;
  connection_effective_type: string | null;
  connection_downlink: number | null;
  connection_rtt: number | null;
  connection_save_data: boolean | null;
  ua_ch_platform: string | null;
  ua_ch_mobile: boolean | null;
  ua_ch_brands: unknown;
  ua_high_entropy: unknown;
  asn: number | null;
  as_organization: string | null;
};

const FINGERPRINT_SELECT =
  "session_id, visitor_id, captured_at, consent_mode, fingerprint_version, fingerprint_hash, canvas_hash, font_hash, font_count, webgl_hash, webgl_vendor, webgl_renderer, audio_hash, hardware_concurrency, device_memory, screen_width, screen_height, pixel_ratio, color_depth, timezone, timezone_offset, language, languages, platform, max_touch_points, connection_effective_type, connection_downlink, connection_rtt, connection_save_data, ua_ch_platform, ua_ch_mobile, ua_ch_brands, ua_high_entropy, asn, as_organization";

/**
 * Fingerprint snapshots for the sessions seen in the range. Missing rows are
 * normal: historical sessions predate the feature, and visitors who declined
 * enhanced analytics never have one.
 */
async function fetchFingerprints(sessionIds: string[]): Promise<Map<string, FingerprintRow>> {
  const out = new Map<string, FingerprintRow>();
  if (!sessionIds.length) return out;
  const admin = getSupabaseAdmin();
  const chunkSize = 400;
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("visitor_fingerprints")
      .select(FINGERPRINT_SELECT)
      .in("session_id", chunk);
    // Never let a fingerprint lookup break the whole visitor view.
    if (error) {
      console.error("[adminVisitorActivity] fingerprint lookup failed", error.message);
      return out;
    }
    for (const row of (data ?? []) as FingerprintRow[]) out.set(row.session_id, row);
  }
  return out;
}

const RANGE_HOURS = { "1h": 1, "6h": 6, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
export type VisitorActivityRange = keyof typeof RANGE_HOURS;

const VISITOR_CAP = 100;

async function fetchVisitorEvents(start: string, end: string): Promise<VisitorEventRow[]> {
  const admin = getSupabaseAdmin();
  const out: VisitorEventRow[] = [];
  const pageSize = 1000;
  const maxRows = 40_000; // hard guard so a wide range cannot run forever

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(VISITOR_SELECT)
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as VisitorEventRow[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

function pushUnique(list: string[], value: string | null | undefined) {
  const v = value?.trim();
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

function geoLabel(row: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  const parts = [row.city, row.region, row.country].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

export const adminVisitorActivity = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; range?: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        range: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);

    const range = (data.range ?? "24h") as VisitorActivityRange;
    const endMs = Date.now() + 60_000;
    const startMs = Date.now() - RANGE_HOURS[range] * 60 * 60 * 1000;
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();

    const rows = await fetchVisitorEvents(start, end);

    // Reuse the EXISTING canonical session/automation rules — no new bot filter.
    const sessions = buildSessions(rows);
    const sessionList = [...sessions.values()];
    const burstOrHeartbeat = classifyAutomation(sessionList);
    const knownIncident = classifyKnownIncident(sessionList);

    type SessionDetail = {
      sessionId: string;
      startedAt: string;
      endedAt: string;
      pageviews: number;
      suspected: boolean;
      suspicionReasons: string[];
      timeline: Array<{
        at: string;
        event: string;
        path: string | null;
        publication: string | null;
        detail: string | null;
      }>;
    };

    type VisitorAgg = {
      visitorId: string;
      firstSeenInRange: string;
      lastSeenInRange: string;
      sessionIds: string[];
      pageviews: number;
      publicationClicks: number;
      pdfOpens: number;
      downloads: number;
      searches: number;
      signups: number;
      shares: number;
      filterChanges: number;
      humanSignalSeen: boolean;
      sources: string[];
      devices: string[];
      paths: string[];
      ips: string[];
      userAgents: string[];
      latestIp: string | null;
      latestUserAgent: string | null;
      latestDeviceType: string | null;
      latestAcceptLanguage: string | null;
      latestSecChUa: string | null;
      latestSecChPlatform: string | null;
      latestSecChMobile: string | null;
      latestAsn: number | null;
      latestAsOrganization: string | null;
      geo: { city: string | null; region: string | null; country: string | null; postalCode: string | null };
      referrerHost: string | null;
      referrerUrl: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      isNewFlagSeen: boolean;
      isReturningFlagSeen: boolean;
      publicationActions: Array<{ at: string; action: string; publication: string }>;
      searchTerms: Array<{ at: string; term: string }>;
      filterChangeDetails: Array<{ at: string; detail: string }>;
      sessionDetails: Map<string, SessionDetail>;
    };

    const visitors = new Map<string, VisitorAgg>();

    // rows arrive newest-first; walk oldest-first so "latest" wins naturally.
    const ordered = [...rows].reverse();

    for (const row of ordered) {
      const vid = row.visitor_id?.trim();
      if (!vid) continue;
      const at = row.occurred_at;
      const name = row.event_name ?? "";
      const sid = row.session_id?.trim() ?? "";

      let v = visitors.get(vid);
      if (!v) {
        v = {
          visitorId: vid,
          firstSeenInRange: at,
          lastSeenInRange: at,
          sessionIds: [],
          pageviews: 0,
          publicationClicks: 0,
          pdfOpens: 0,
          downloads: 0,
          searches: 0,
          signups: 0,
          shares: 0,
          filterChanges: 0,
          humanSignalSeen: false,
          sources: [],
          devices: [],
          paths: [],
          ips: [],
          userAgents: [],
          latestIp: null,
          latestUserAgent: null,
          latestDeviceType: null,
          latestAcceptLanguage: null,
          latestSecChUa: null,
          latestSecChPlatform: null,
          latestSecChMobile: null,
          latestAsn: null,
          latestAsOrganization: null,
          geo: { city: null, region: null, country: null, postalCode: null },
          referrerHost: null,
          referrerUrl: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          isNewFlagSeen: false,
          isReturningFlagSeen: false,
          publicationActions: [],
          searchTerms: [],
          filterChangeDetails: [],
          sessionDetails: new Map(),
        };
        visitors.set(vid, v);
      }

      if (at < v.firstSeenInRange) v.firstSeenInRange = at;
      if (at > v.lastSeenInRange) v.lastSeenInRange = at;

      pushUnique(v.sessionIds, sid);
      pushUnique(v.sources, row.source_group);
      pushUnique(v.devices, row.device_type);
      pushUnique(v.ips, row.ip_address);
      pushUnique(v.userAgents, row.user_agent);
      if (row.ip_address?.trim()) v.latestIp = row.ip_address.trim();
      if (row.user_agent?.trim()) v.latestUserAgent = row.user_agent.trim();
      if (row.device_type?.trim()) v.latestDeviceType = row.device_type.trim();
      if (row.accept_language?.trim()) v.latestAcceptLanguage = row.accept_language.trim();
      if (row.sec_ch_ua?.trim()) v.latestSecChUa = row.sec_ch_ua.trim();
      if (row.sec_ch_platform?.trim()) v.latestSecChPlatform = row.sec_ch_platform.trim();
      if (row.sec_ch_mobile?.trim()) v.latestSecChMobile = row.sec_ch_mobile.trim();
      if (typeof row.asn === "number") v.latestAsn = row.asn;
      if (row.as_organization?.trim()) v.latestAsOrganization = row.as_organization.trim();
      if (row.city?.trim()) v.geo.city = row.city.trim();
      if (row.region?.trim()) v.geo.region = row.region.trim();
      if (row.country?.trim()) v.geo.country = row.country.trim();
      if (row.postal_code?.trim()) v.geo.postalCode = row.postal_code.trim();
      if (row.referrer_host?.trim()) v.referrerHost = row.referrer_host.trim();
      if (row.referrer_url?.trim()) v.referrerUrl = row.referrer_url.trim();
      if (row.utm_source?.trim()) v.utmSource = row.utm_source.trim();
      if (row.utm_medium?.trim()) v.utmMedium = row.utm_medium.trim();
      if (row.utm_campaign?.trim()) v.utmCampaign = row.utm_campaign.trim();
      if (row.is_new_visitor === true) v.isNewFlagSeen = true;
      if (row.is_new_visitor === false) v.isReturningFlagSeen = true;

      const publication = row.publication_title?.trim() || row.publication_id?.trim() || null;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const metaString = (key: string) => {
        const value = meta[key];
        return typeof value === "string" && value.trim() ? value.trim() : null;
      };

      if (name === "page_view") {
        v.pageviews += 1;
        pushUnique(v.paths, row.path);
      }
      if (name === "publication_click") {
        v.publicationClicks += 1;
        if (publication) v.publicationActions.push({ at, action: "Clicked", publication });
      }
      if (name === "pdf_open") {
        v.pdfOpens += 1;
        if (publication) v.publicationActions.push({ at, action: "Opened PDF", publication });
      }
      if (name === "download") {
        v.downloads += 1;
        if (publication) v.publicationActions.push({ at, action: "Downloaded", publication });
      }
      if (name === "search") {
        v.searches += 1;
        const term = metaString("query") ?? metaString("term") ?? metaString("q");
        if (term) v.searchTerms.push({ at, term });
      }
      if (name === "signup") v.signups += 1;
      if (name === "share_click") v.shares += 1;
      if (name === "filter_change") {
        v.filterChanges += 1;
        const detail =
          metaString("filter") ??
          metaString("value") ??
          metaString("label") ??
          (Object.keys(meta).length ? JSON.stringify(meta).slice(0, 200) : null);
        if (detail) v.filterChangeDetails.push({ at, detail });
      }
      if (name === "human_signal") v.humanSignalSeen = true;

      if (sid) {
        let detail = v.sessionDetails.get(sid);
        if (!detail) {
          const reasons: string[] = [];
          if (burstOrHeartbeat.has(sid)) reasons.push("Matches canonical high-confidence automation rule");
          if (knownIncident.has(sid)) reasons.push("Inside known automated traffic incident window");
          detail = {
            sessionId: sid,
            startedAt: at,
            endedAt: at,
            pageviews: 0,
            suspected: reasons.length > 0,
            suspicionReasons: reasons,
            timeline: [],
          };
          v.sessionDetails.set(sid, detail);
        }
        if (at < detail.startedAt) detail.startedAt = at;
        if (at > detail.endedAt) detail.endedAt = at;
        if (name === "page_view") detail.pageviews += 1;
        if (detail.timeline.length < 200) {
          detail.timeline.push({
            at,
            event: name || "unknown",
            path: row.path?.trim() || null,
            publication,
            detail:
              name === "search"
                ? (metaString("query") ?? metaString("term") ?? metaString("q"))
                : name === "filter_change"
                  ? (metaString("filter") ?? metaString("value") ?? metaString("label"))
                  : null,
          });
        }
      }
    }

    // Enhanced fingerprint snapshots for the sessions in this window, plus
    // neutral cross-visitor diagnostics. These are shared-signal indicators for
    // investigating traffic — never proof that two visitors are the same person.
    const fingerprints = await fetchFingerprints([...sessions.keys()]);
    const hashToVisitors = new Map<string, Set<string>>();
    const ipToVisitors = new Map<string, Set<string>>();
    for (const row of rows) {
      const vid = row.visitor_id?.trim();
      if (!vid) continue;
      const ip = row.ip_address?.trim();
      if (ip) {
        const set = ipToVisitors.get(ip) ?? new Set<string>();
        set.add(vid);
        ipToVisitors.set(ip, set);
      }
    }
    for (const fp of fingerprints.values()) {
      const vid = fp.visitor_id?.trim();
      const hash = fp.fingerprint_hash?.trim();
      if (!vid || !hash) continue;
      const set = hashToVisitors.get(hash) ?? new Set<string>();
      set.add(vid);
      hashToVisitors.set(hash, set);
    }

    const all = [...visitors.values()].sort((a, b) =>
      b.lastSeenInRange.localeCompare(a.lastSeenInRange),
    );
    const capped = all.slice(0, VISITOR_CAP);

    const shaped = capped.map((v) => {
      const sessionDetails = [...v.sessionDetails.values()].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      );
      const suspectedSessions = sessionDetails.filter((s) => s.suspected).length;
      const suspicionReasons = [
        ...new Set(sessionDetails.flatMap((s) => s.suspicionReasons)),
      ];
      const meaningful =
        v.publicationClicks + v.pdfOpens + v.downloads + v.searches + v.signups + v.shares;

      const visitorFps = v.sessionIds
        .map((sid) => fingerprints.get(sid))
        .filter((fp): fp is FingerprintRow => Boolean(fp))
        .sort((a, b) => (a.captured_at ?? "").localeCompare(b.captured_at ?? ""));
      const latestFp = visitorFps.length ? visitorFps[visitorFps.length - 1]! : null;
      const distinctFpHashes = new Set(
        visitorFps.map((fp) => fp.fingerprint_hash?.trim()).filter(Boolean) as string[],
      );
      const fpVisitorIdCount = latestFp?.fingerprint_hash
        ? (hashToVisitors.get(latestFp.fingerprint_hash.trim())?.size ?? 1)
        : 0;
      const ipVisitorIdCount = v.latestIp ? (ipToVisitors.get(v.latestIp)?.size ?? 1) : 0;

      return {
        fingerprint: latestFp
          ? {
              capturedAt: latestFp.captured_at,
              consentMode: latestFp.consent_mode,
              version: latestFp.fingerprint_version,
              hash: latestFp.fingerprint_hash,
              canvasPresent: Boolean(latestFp.canvas_hash),
              fontPresent: Boolean(latestFp.font_hash),
              webglPresent: Boolean(latestFp.webgl_hash),
              audioPresent: Boolean(latestFp.audio_hash),
              fontCount: latestFp.font_count,
              webglVendor: latestFp.webgl_vendor,
              webglRenderer: latestFp.webgl_renderer,
              hardwareConcurrency: latestFp.hardware_concurrency,
              deviceMemory: latestFp.device_memory,
              screenWidth: latestFp.screen_width,
              screenHeight: latestFp.screen_height,
              pixelRatio: latestFp.pixel_ratio,
              colorDepth: latestFp.color_depth,
              timezone: latestFp.timezone,
              timezoneOffset: latestFp.timezone_offset,
              language: latestFp.language,
              languages: Array.isArray(latestFp.languages)
                ? (latestFp.languages as unknown[]).map(String)
                : null,
              platform: latestFp.platform,
              maxTouchPoints: latestFp.max_touch_points,
              connectionEffectiveType: latestFp.connection_effective_type,
              connectionDownlink: latestFp.connection_downlink,
              connectionRtt: latestFp.connection_rtt,
              connectionSaveData: latestFp.connection_save_data,
              uaChPlatform: latestFp.ua_ch_platform,
              uaChMobile: latestFp.ua_ch_mobile,
              // Flattened to plain strings so the payload stays serializable.
              uaChBrands: Array.isArray(latestFp.ua_ch_brands)
                ? (latestFp.ua_ch_brands as unknown[]).map((b) =>
                    typeof b === "string" ? b : JSON.stringify(b),
                  )
                : null,
              uaHighEntropy:
                latestFp.ua_high_entropy && typeof latestFp.ua_high_entropy === "object"
                  ? Object.fromEntries(
                      Object.entries(latestFp.ua_high_entropy as Record<string, unknown>).map(
                        ([k, val]) => [k, typeof val === "string" ? val : JSON.stringify(val)],
                      ),
                    )
                  : null,
            }
          : null,
        fingerprintChanged: distinctFpHashes.size > 1,
        fingerprintVisitorIdCount: fpVisitorIdCount,
        ipVisitorIdCount,
        latestAcceptLanguage: v.latestAcceptLanguage,
        latestSecChUa: v.latestSecChUa,
        latestSecChPlatform: v.latestSecChPlatform,
        latestSecChMobile: v.latestSecChMobile,
        latestAsn: v.latestAsn,
        latestAsOrganization: v.latestAsOrganization,
        visitorId: v.visitorId,
        firstSeenInRange: v.firstSeenInRange,
        lastSeenInRange: v.lastSeenInRange,
        sessionsInRange: v.sessionIds.length,
        pageviews: v.pageviews,
        publicationClicks: v.publicationClicks,
        pdfOpens: v.pdfOpens,
        downloads: v.downloads,
        searches: v.searches,
        signups: v.signups,
        shares: v.shares,
        filterChanges: v.filterChanges,
        humanSignalSeen: v.humanSignalSeen,
        meaningfulActionCount: meaningful,
        sources: v.sources.length ? v.sources : ["Direct"],
        devices: v.devices.length ? v.devices : ["unknown"],
        paths: v.paths,
        geo: { ...v.geo, label: geoLabel(v.geo) },
        latestIp: v.latestIp,
        distinctIpCount: v.ips.length,
        ips: v.ips,
        latestUserAgent: v.latestUserAgent,
        distinctUserAgentCount: v.userAgents.length,
        latestDeviceType: v.latestDeviceType,
        referrerHost: v.referrerHost,
        referrerUrl: v.referrerUrl,
        utmSource: v.utmSource,
        utmMedium: v.utmMedium,
        utmCampaign: v.utmCampaign,
        // Returning when an event explicitly says so, or when more than one
        // session appeared in range; otherwise treat the new-flag as "new".
        likelyReturning: v.isReturningFlagSeen || v.sessionIds.length > 1,
        likelyNew: !v.isReturningFlagSeen && v.isNewFlagSeen && v.sessionIds.length <= 1,
        suspectedSessions,
        suspicionReasons,
        publicationActions: v.publicationActions.slice(-50).reverse(),
        searchTerms: v.searchTerms.slice(-50).reverse(),
        filterChangeDetails: v.filterChangeDetails.slice(-50).reverse(),
        sessions: sessionDetails,
      };
    });

    const totals = {
      visitors: all.length,
      visitorsShown: shaped.length,
      sessions: sessions.size,
      pageviews: rows.filter((r) => r.event_name === "page_view").length,
      pdfOpens: rows.filter((r) => r.event_name === "pdf_open").length,
      downloads: rows.filter((r) => r.event_name === "download").length,
      signups: rows.filter((r) => r.event_name === "signup").length,
      suspectedSessions: new Set([...burstOrHeartbeat, ...knownIncident]).size,
      eventsScanned: rows.length,
    };

    return {
      range,
      windowStart: start,
      windowEnd: end,
      cap: VISITOR_CAP,
      totals,
      visitors: shaped,
    };
  });
