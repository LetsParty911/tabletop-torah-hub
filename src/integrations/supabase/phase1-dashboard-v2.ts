import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Server misconfigured");
  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await cloud.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");
  const email = (data.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
}

type Row = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  is_new_visitor: boolean | null;
  publication_id: string | null;
  publication_title: string | null;
  publication_series: string | null;
  publisher: string | null;
  parsha: string | null;
  device_type: string | null;
  source_group: string | null;
  metadata: Record<string, unknown> | null;
};

type Session = {
  visitorId: string | null;
  device: string;
  source: string;
  pageViews: number;
  heartbeat: boolean;
  positiveAction: boolean;
  impressions: Set<string>;
  clicks: Set<string>;
  accesses: Set<string>;
  downloads: Set<string>;
  downloadActions: number;
  activeSeconds: number;
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const ACCESS = new Set(["pdf_open", "download"]);

async function fetchRows(since: string): Promise<Row[]> {
  const admin = getSupabaseAdmin();
  const out: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(
        "event_name, occurred_at, visitor_id, session_id, is_new_visitor, publication_id, publication_title, publication_series, publisher, parsha, device_type, source_group, metadata",
      )
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function priorVisitors(visitorIds: string[], since: string): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const prior = new Set<string>();
  for (let i = 0; i < visitorIds.length; i += 100) {
    const batch = visitorIds.slice(i, i + 100);
    if (!batch.length) continue;
    const { data, error } = await admin
      .from("analytics_events")
      .select("visitor_id")
      .in("visitor_id", batch)
      .lt("occurred_at", since)
      .limit(10000);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ visitor_id: string | null }>) {
      if (row.visitor_id) prior.add(row.visitor_id);
    }
  }
  return prior;
}

export const adminPhase1DashboardV2 = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number }) =>
    z
      .object({
        accessToken: z.string().min(10),
        days: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const days = data.days ?? 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await fetchRows(since);
    const visitorIds = [
      ...new Set(rows.map((r) => s(r.visitor_id)).filter((v): v is string => Boolean(v))),
    ];
    const prior = await priorVisitors(visitorIds, since);

    const sessions = new Map<string, Session>();
    type Pub = {
      id: string;
      title: string;
      parsha: string | null;
      series: string | null;
      publisher: string | null;
      impressions: Set<string>;
      clicks: Set<string>;
      accesses: Set<string>;
      downloads: Set<string>;
    };
    const pubs = new Map<string, Pub>();

    for (const row of rows) {
      const sid = s(row.session_id);
      if (!sid) continue;
      const vid = s(row.visitor_id);
      let session = sessions.get(sid);
      if (!session) {
        session = {
          visitorId: vid,
          device: s(row.device_type) ?? "unknown",
          source: s(row.source_group) ?? "Direct",
          pageViews: 0,
          heartbeat: false,
          positiveAction: false,
          impressions: new Set(),
          clicks: new Set(),
          accesses: new Set(),
          downloads: new Set(),
          downloadActions: 0,
          activeSeconds: 0,
        };
        sessions.set(sid, session);
      }
      if (!session.visitorId && vid) session.visitorId = vid;
      const name = s(row.event_name) ?? "";
      if (name === "page_view") session.pageViews += 1;
      if (name === "heartbeat") {
        session.heartbeat = true;
        const n = Number(row.metadata?.["active_seconds"] ?? 0);
        if (Number.isFinite(n) && n > 0) session.activeSeconds += Math.min(n, 20);
      }
      if (
        [
          "publication_click",
          "pdf_open",
          "download",
          "filter_change",
          "search",
          "share_click",
          "signup",
        ].includes(name)
      )
        session.positiveAction = true;
      const pubId = s(row.publication_id);
      if (!pubId) continue;
      const pair = `${sid}::${pubId}`;
      let pub = pubs.get(pubId);
      if (!pub) {
        pub = {
          id: pubId,
          title: s(row.publication_title) ?? "Untitled",
          parsha: s(row.parsha),
          series: s(row.publication_series),
          publisher: s(row.publisher),
          impressions: new Set(),
          clicks: new Set(),
          accesses: new Set(),
          downloads: new Set(),
        };
        pubs.set(pubId, pub);
      }
      if (name === "publication_impression") {
        session.impressions.add(pair);
        pub.impressions.add(pair);
      }
      if (name === "publication_click") {
        session.clicks.add(pair);
        pub.clicks.add(pair);
      }
      if (ACCESS.has(name)) {
        session.accesses.add(pair);
        pub.accesses.add(pair);
      }
      if (name === "download") {
        session.downloads.add(pair);
        pub.downloads.add(pair);
        session.downloadActions += 1;
      }
    }

    const all = [...sessions.values()];
    const uniqueVisitors = new Set(
      all.map((x) => x.visitorId).filter((v): v is string => Boolean(v)),
    );
    const returningVisitors = new Set<string>();
    for (const vid of uniqueVisitors) if (prior.has(vid)) returningVisitors.add(vid);
    // If canonical history began during the report window, a non-first session flag still supplies evidence of return.
    for (const row of rows) {
      const vid = s(row.visitor_id);
      if (vid && row.is_new_visitor === false) returningVisitors.add(vid);
    }
    const engaged = all.filter(
      (x) => x.positiveAction || x.heartbeat || x.pageViews >= 2 || x.activeSeconds >= 10,
    );
    const lowConfidence = all.filter(
      (x) => !x.positiveAction && !x.heartbeat && x.pageViews <= 1 && x.activeSeconds < 10,
    );
    const downloadingSessions = all.filter((x) => x.downloads.size > 0).length;
    const accessingSessions = all.filter((x) => x.accesses.size > 0).length;
    const uniquePdfDownloads = all.reduce((n, x) => n + x.downloads.size, 0);
    const downloadActions = all.reduce((n, x) => n + x.downloadActions, 0);
    const activeSeconds = all.reduce((n, x) => n + x.activeSeconds, 0);

    const group = (key: (x: Session) => string) => {
      const map = new Map<
        string,
        {
          key: string;
          sessions: number;
          clicks: number;
          accesses: number;
          uniquePdfDownloads: number;
          downloadActions: number;
          convertedSessions: number;
        }
      >();
      for (const x of all) {
        const k = key(x);
        const a = map.get(k) ?? {
          key: k,
          sessions: 0,
          clicks: 0,
          accesses: 0,
          uniquePdfDownloads: 0,
          downloadActions: 0,
          convertedSessions: 0,
        };
        a.sessions += 1;
        a.clicks += x.clicks.size;
        a.accesses += x.accesses.size;
        a.uniquePdfDownloads += x.downloads.size;
        a.downloadActions += x.downloadActions;
        if (x.downloads.size > 0) a.convertedSessions += 1;
        map.set(k, a);
      }
      return [...map.values()].sort((a, b) => b.sessions - a.sessions);
    };

    const publications = [...pubs.values()]
      .map((p) => ({
        id: p.id,
        title: p.title,
        parsha: p.parsha,
        series: p.series,
        publisher: p.publisher,
        impressions: p.impressions.size,
        clicks: p.clicks.size,
        accesses: p.accesses.size,
        downloads: p.downloads.size,
      }))
      .sort((a, b) => b.downloads - a.downloads || b.accesses - a.accesses)
      .slice(0, 50);

    return {
      ok: true as const,
      days,
      since,
      totals: {
        uniqueVisitors: uniqueVisitors.size,
        returningVisitors: returningVisitors.size,
        sessions: all.length,
        engagedSessions: engaged.length,
        lowConfidenceSessions: lowConfidence.length,
        pdfAccessingSessions: accessingSessions,
        downloadingSessions,
        uniquePdfDownloads,
        downloadActions,
        sessionDownloadConversion: all.length ? downloadingSessions / all.length : 0,
        avgActiveSeconds: all.length ? activeSeconds / all.length : 0,
      },
      bySource: group((x) => x.source),
      byDevice: group((x) => x.device),
      publications,
      rawEventCount: rows.length,
    };
  });
