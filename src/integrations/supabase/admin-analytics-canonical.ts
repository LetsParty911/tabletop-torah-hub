import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

const DAY = 24 * 60 * 60 * 1000;

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
  metadata: Record<string, unknown> | null;
};

type WindowDef = { parsha: string; start: string; end: string };

async function requireAnalyticsAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) {
    throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  }
  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error } = await cloud.auth.getUser(accessToken);
  if (error || !userData?.user) throw new Error("Not authenticated");
  const email = (userData.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
}

function buildCollectionWindows(rows: Array<{ parsha_key: string | null; created_at: string | null }>): WindowDef[] {
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
  for (let i = 0; i < ordered.length; i += 1) {
    const parsha = ordered[i]!;
    const start = firstAt.get(parsha)!;
    const end = i === 0 ? new Date(Date.now() + 60_000).toISOString() : windows[i - 1]!.start;
    windows.push({ parsha, start, end });
  }
  return windows;
}

async function fetchEventsBetween(start: string, end: string): Promise<EventRow[]> {
  const admin = getSupabaseAdmin();
  const rows: EventRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(
        "event_name, occurred_at, visitor_id, session_id, is_new_visitor, path, publication_id, publication_title, device_type, source_group, metadata",
      )
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as EventRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

type SessionAgg = {
  id: string;
  visitorId: string | null;
  source: string;
  device: string;
  pageviews: number;
  pages: Map<string, number>;
  engaged: boolean;
  accessedPdf: boolean;
  downloaded: boolean;
  downloadActions: number;
  uniquePdfDownloads: Set<string>;
};

function summarizeCanonical(rows: EventRow[]) {
  const sessions = new Map<string, SessionAgg>();
  const visitors = new Set<string>();
  const returningVisitors = new Set<string>();
  const sourceSessions = new Map<string, Set<string>>();
  const deviceSessions = new Map<string, Set<string>>();
  const pageMap = new Map<string, { pageviews: number; sessions: Set<string> }>();
  const uniquePdfDownloads = new Set<string>();
  let downloadActions = 0;

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const vid = row.visitor_id?.trim() || null;
    let session = sessions.get(sid);
    if (!session) {
      session = {
        id: sid,
        visitorId: vid,
        source: row.source_group?.trim() || "Direct",
        device: row.device_type?.trim() || "unknown",
        pageviews: 0,
        pages: new Map(),
        engaged: false,
        accessedPdf: false,
        downloaded: false,
        downloadActions: 0,
        uniquePdfDownloads: new Set(),
      };
      sessions.set(sid, session);
    }
    if (!session.visitorId && vid) session.visitorId = vid;
    if (session.source === "Direct" && row.source_group?.trim()) session.source = row.source_group.trim();
    if (session.device === "unknown" && row.device_type?.trim()) session.device = row.device_type.trim();

    if (vid) {
      visitors.add(vid);
      if (row.is_new_visitor !== true) returningVisitors.add(vid);
    }

    const name = row.event_name ?? "";
    if (name === "page_view") {
      session.pageviews += 1;
      const path = row.path?.trim() || "/";
      session.pages.set(path, (session.pages.get(path) ?? 0) + 1);
      const page = pageMap.get(path) ?? { pageviews: 0, sessions: new Set<string>() };
      page.pageviews += 1;
      page.sessions.add(sid);
      pageMap.set(path, page);
    }
    if (["publication_click", "pdf_open", "download", "filter_change", "search", "share_click", "signup", "heartbeat"].includes(name)) {
      session.engaged = true;
    }
    if (name === "pdf_open" || name === "download") session.accessedPdf = true;
    if (name === "download") {
      session.downloaded = true;
      session.downloadActions += 1;
      downloadActions += 1;
      const pub = row.publication_id?.trim() || row.publication_title?.trim() || "unknown";
      const key = `${sid}::${pub}`;
      session.uniquePdfDownloads.add(key);
      uniquePdfDownloads.add(key);
    }
  }

  for (const session of sessions.values()) {
    const srcSet = sourceSessions.get(session.source) ?? new Set<string>();
    srcSet.add(session.id);
    sourceSessions.set(session.source, srcSet);
    const devSet = deviceSessions.get(session.device) ?? new Set<string>();
    devSet.add(session.id);
    deviceSessions.set(session.device, devSet);
  }

  const sessionList = [...sessions.values()];
  const downloadingSessions = sessionList.filter((s) => s.downloaded).length;
  const pdfAccessingSessions = sessionList.filter((s) => s.accessedPdf).length;
  const engagedSessions = sessionList.filter((s) => s.engaged || s.pageviews >= 2).length;
  const topPages = [...pageMap.entries()]
    .map(([path, value]) => ({ path, pageviews: value.pageviews, sessions: value.sessions.size }))
    .sort((a, b) => b.pageviews - a.pageviews || b.sessions - a.sessions)
    .slice(0, 10);
  const sources = [...sourceSessions.entries()]
    .map(([label, set]) => ({ label, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions);
  const devices = [...deviceSessions.entries()]
    .map(([label, set]) => ({ label, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    pageviews: rows.filter((row) => row.event_name === "page_view").length,
    sessions: sessions.size,
    uniqueVisitors: visitors.size,
    returningVisitors: returningVisitors.size,
    engagedSessions,
    pdfAccessingSessions,
    downloadingSessions,
    uniquePdfDownloads: uniquePdfDownloads.size,
    downloadActions,
    downloadConversion: sessions.size ? downloadingSessions / sessions.size : 0,
    sources,
    devices,
    topPages,
  };
}

export const adminCanonicalCollectionTraffic = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; parsha?: string | null }) =>
    z.object({ accessToken: z.string().min(10), parsha: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const pdfRes = await admin.from("pdfs").select("parsha_key, created_at");
    if (pdfRes.error) throw new Error(pdfRes.error.message);
    const windows = buildCollectionWindows((pdfRes.data ?? []) as Array<{ parsha_key: string | null; created_at: string | null }>);
    const selected = data.parsha && windows.some((w) => w.parsha === data.parsha)
      ? data.parsha
      : (windows[0]?.parsha ?? null);
    const selectedIndex = selected ? windows.findIndex((w) => w.parsha === selected) : -1;
    const currentWindow = selectedIndex >= 0 ? windows[selectedIndex]! : null;
    const previousWindow = selectedIndex >= 0 ? (windows[selectedIndex + 1] ?? null) : null;
    if (!currentWindow) {
      return {
        parshas: [] as string[], selectedParsha: null as string | null, previousParsha: null as string | null,
        currentWindow: null, previousWindow: null, current: summarizeCanonical([]), previous: summarizeCanonical([]),
        currentSubscribers: 0, previousSubscribers: 0, subscriberConversion: 0, previousSubscriberConversion: 0,
      };
    }

    const [currentRows, previousRows] = await Promise.all([
      fetchEventsBetween(currentWindow.start, currentWindow.end),
      previousWindow ? fetchEventsBetween(previousWindow.start, previousWindow.end) : Promise.resolve([] as EventRow[]),
    ]);
    const current = summarizeCanonical(currentRows);
    const previous = summarizeCanonical(previousRows);

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
      parshas: windows.map((w) => w.parsha),
      selectedParsha: selected,
      previousParsha: previousWindow?.parsha ?? null,
      currentWindow,
      previousWindow,
      current,
      previous,
      currentSubscribers,
      previousSubscribers,
      subscriberConversion: current.uniqueVisitors ? currentSubscribers / current.uniqueVisitors : 0,
      previousSubscriberConversion: previous.uniqueVisitors ? previousSubscribers / previous.uniqueVisitors : 0,
    };
  });

export const adminCanonicalSinceLast = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; since: string }) =>
    z.object({ accessToken: z.string().min(10), since: z.string().datetime() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const now = new Date().toISOString();
    const rows = await fetchEventsBetween(data.since, now);
    return summarizeCanonical(rows);
  });

export function startOfTodayNewYork(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "") || "-04:00";
  const sign = offset.startsWith("-") ? "-" : "+";
  const raw = offset.replace(/^[-+]/, "");
  const [hours, minutes = "00"] = raw.split(":");
  const normalizedOffset = `${sign}${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00${normalizedOffset}`).toISOString();
}

export const adminDownloadActionsTodayEt = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => z.object({ accessToken: z.string().min(10) }).parse(input))
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
