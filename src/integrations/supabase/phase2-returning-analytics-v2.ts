import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured");
  const cloud = createClient(url, key, {
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

type Row = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  path: string | null;
  landing_path: string | null;
  publication_id: string | null;
  publication_title: string | null;
  publication_series: string | null;
  publisher: string | null;
  parsha: string | null;
  device_type: string | null;
  source_group: string | null;
  metadata: Record<string, unknown> | null;
};

type Publication = {
  id: string;
  title: string;
  series: string | null;
  publisher: string | null;
  parsha: string | null;
};

type Session = {
  id: string;
  visitorId: string;
  startedAt: string;
  lastAt: string;
  source: string;
  device: string;
  landingPath: string | null;
  pages: string[];
  clicks: Map<string, Publication>;
  accesses: Map<string, Publication>;
  downloads: Map<string, Publication>;
  downloadEvents: number;
  firstDownloadAt: string | null;
  activeSeconds: number;
  activeInRange: boolean;
};

type Visitor = {
  id: string;
  sessions: Session[];
  firstDownloadAt: string | null;
  firstDownloadSessionNumber: number | null;
};

const nonempty = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const hours = (a: string, b: string) =>
  Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function publicationOf(row: Row): Publication | null {
  const id = nonempty(row.publication_id);
  if (!id) return null;
  return {
    id,
    title: nonempty(row.publication_title) ?? "Untitled",
    series: nonempty(row.publication_series),
    publisher: nonempty(row.publisher),
    parsha: nonempty(row.parsha),
  };
}

async function fetchRows(since?: string, visitorIds?: string[], before?: string): Promise<Row[]> {
  const admin = getSupabaseAdmin();
  const out: Row[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 100000; offset += pageSize) {
    let query = admin
      .from("analytics_events")
      .select(
        "event_name, occurred_at, visitor_id, session_id, path, landing_path, publication_id, publication_title, publication_series, publisher, parsha, device_type, source_group, metadata",
      )
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (since) query = query.gte("occurred_at", since);
    if (before) query = query.lt("occurred_at", before);
    if (visitorIds?.length) query = query.in("visitor_id", visitorIds);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function fetchHistory(visitorIds: string[], before: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let index = 0; index < visitorIds.length; index += 75) {
    out.push(...(await fetchRows(undefined, visitorIds.slice(index, index + 75), before)));
  }
  return out;
}

function buildVisitors(rows: Row[], since: string): Visitor[] {
  const sessionMap = new Map<string, Session>();

  for (const row of rows) {
    const visitorId = nonempty(row.visitor_id);
    const sessionId = nonempty(row.session_id);
    if (!visitorId || !sessionId) continue;

    let session = sessionMap.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        visitorId,
        startedAt: row.occurred_at,
        lastAt: row.occurred_at,
        source: nonempty(row.source_group) ?? "Direct",
        device: nonempty(row.device_type) ?? "unknown",
        landingPath: nonempty(row.landing_path),
        pages: [],
        clicks: new Map(),
        accesses: new Map(),
        downloads: new Map(),
        downloadEvents: 0,
        firstDownloadAt: null,
        activeSeconds: 0,
        activeInRange: row.occurred_at >= since,
      };
      sessionMap.set(sessionId, session);
    }

    session.activeInRange ||= row.occurred_at >= since;
    if (row.occurred_at < session.startedAt) session.startedAt = row.occurred_at;
    if (row.occurred_at > session.lastAt) session.lastAt = row.occurred_at;
    if (session.source === "Direct" && nonempty(row.source_group))
      session.source = nonempty(row.source_group)!;
    if (session.device === "unknown" && nonempty(row.device_type))
      session.device = nonempty(row.device_type)!;

    const name = nonempty(row.event_name) ?? "";
    if (
      name === "page_view" &&
      row.path &&
      session.pages.length < 8 &&
      !session.pages.includes(row.path)
    ) {
      session.pages.push(row.path);
    }

    const publication = publicationOf(row);
    if (publication) {
      if (name === "publication_click") session.clicks.set(publication.id, publication);
      if (name === "pdf_open" || name === "download")
        session.accesses.set(publication.id, publication);
      if (name === "download") {
        session.downloads.set(publication.id, publication);
        session.downloadEvents += 1;
        if (!session.firstDownloadAt || row.occurred_at < session.firstDownloadAt)
          session.firstDownloadAt = row.occurred_at;
      }
    }

    if (name === "heartbeat") {
      const seconds = Number(row.metadata?.["active_seconds"] ?? 0);
      if (Number.isFinite(seconds) && seconds > 0) session.activeSeconds += Math.min(seconds, 20);
    }
  }

  const visitorMap = new Map<string, Visitor>();
  for (const session of sessionMap.values()) {
    const visitor = visitorMap.get(session.visitorId) ?? {
      id: session.visitorId,
      sessions: [],
      firstDownloadAt: null,
      firstDownloadSessionNumber: null,
    };
    visitor.sessions.push(session);
    visitorMap.set(session.visitorId, visitor);
  }

  const visitors = [...visitorMap.values()];
  for (const visitor of visitors) {
    visitor.sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    visitor.sessions.forEach((session, index) => {
      if (
        session.firstDownloadAt &&
        (!visitor.firstDownloadAt || session.firstDownloadAt < visitor.firstDownloadAt)
      ) {
        visitor.firstDownloadAt = session.firstDownloadAt;
        visitor.firstDownloadSessionNumber = index + 1;
      }
    });
  }
  return visitors;
}

function firstActiveIndex(visitor: Visitor) {
  return visitor.sessions.findIndex((session) => session.activeInRange);
}

function isReturning(visitor: Visitor) {
  return firstActiveIndex(visitor) > 0;
}

export const adminPhase2ReturningAnalyticsV2 = createServerFn({ method: "POST" })
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
    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const inRange = await fetchRows(since);
    const activeIds = [
      ...new Set(
        inRange.map((row) => nonempty(row.visitor_id)).filter((id): id is string => Boolean(id)),
      ),
    ];
    const history = await fetchHistory(activeIds, since);
    const visitors = buildVisitors([...history, ...inRange], since).filter(
      (visitor) => firstActiveIndex(visitor) >= 0,
    );
    const returning = visitors.filter(isReturning);
    const converted = visitors.filter((visitor) => visitor.firstDownloadAt !== null);

    const repeatSessions = visitors.reduce(
      (total, visitor) =>
        total +
        visitor.sessions.filter((session, index) => session.activeInRange && index >= 1).length,
      0,
    );
    const returnDelays = returning.map((visitor) => {
      const firstActive = visitor.sessions[firstActiveIndex(visitor)]!;
      return hours(visitor.sessions[0]!.startedAt, firstActive.startedAt) / 24;
    });
    const conversionHours = converted.map((visitor) =>
      hours(visitor.sessions[0]!.startedAt, visitor.firstDownloadAt!),
    );

    const repeatConversion = [
      { key: "1st lifetime session", min: 1, max: 1 },
      { key: "2nd lifetime session", min: 2, max: 2 },
      { key: "3rd+ lifetime sessions", min: 3, max: Number.MAX_SAFE_INTEGER },
    ].map((bucket) => {
      let sessions = 0;
      let convertedSessions = 0;
      for (const visitor of visitors) {
        visitor.sessions.forEach((session, index) => {
          const ordinal = index + 1;
          if (!session.activeInRange || ordinal < bucket.min || ordinal > bucket.max) return;
          sessions += 1;
          if (session.downloadEvents > 0) convertedSessions += 1;
        });
      }
      return {
        key: bucket.key,
        sessions,
        convertedSessions,
        conversionRate: sessions ? convertedSessions / sessions : 0,
      };
    });

    type Cohort = {
      source: string;
      visitors: number;
      returnedVisitors: number;
      convertedVisitors: number;
      sessions: number;
      downloads: number;
    };
    const cohortMap = new Map<string, Cohort>();
    for (const visitor of visitors) {
      const source = visitor.sessions[0]?.source ?? "Direct";
      const cohort = cohortMap.get(source) ?? {
        source,
        visitors: 0,
        returnedVisitors: 0,
        convertedVisitors: 0,
        sessions: 0,
        downloads: 0,
      };
      const activeSessions = visitor.sessions.filter((session) => session.activeInRange);
      cohort.visitors += 1;
      cohort.sessions += activeSessions.length;
      cohort.downloads += activeSessions.reduce((sum, session) => sum + session.downloadEvents, 0);
      if (isReturning(visitor)) cohort.returnedVisitors += 1;
      if (visitor.firstDownloadAt) cohort.convertedVisitors += 1;
      cohortMap.set(source, cohort);
    }
    const cohorts = [...cohortMap.values()]
      .map((cohort) => ({
        ...cohort,
        returnRate: cohort.visitors ? cohort.returnedVisitors / cohort.visitors : 0,
        conversionRate: cohort.visitors ? cohort.convertedVisitors / cohort.visitors : 0,
        avgSessions: cohort.visitors ? cohort.sessions / cohort.visitors : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);

    type Affinity = {
      id: string;
      title: string;
      series: string | null;
      publisher: string | null;
      parsha: string | null;
      visitors: Set<string>;
      repeatVisitors: Set<string>;
      accesses: number;
      downloads: number;
      sessionsByVisitor: Map<string, Set<string>>;
    };
    const affinityMap = new Map<string, Affinity>();
    for (const visitor of returning) {
      for (const session of visitor.sessions.filter((item) => item.activeInRange)) {
        const touched = new Map<string, Publication>([...session.accesses, ...session.downloads]);
        for (const [id, publication] of touched) {
          const affinity = affinityMap.get(id) ?? {
            id,
            title: publication.title,
            series: publication.series,
            publisher: publication.publisher,
            parsha: publication.parsha,
            visitors: new Set<string>(),
            repeatVisitors: new Set<string>(),
            accesses: 0,
            downloads: 0,
            sessionsByVisitor: new Map<string, Set<string>>(),
          };
          affinity.visitors.add(visitor.id);
          const sessionSet = affinity.sessionsByVisitor.get(visitor.id) ?? new Set<string>();
          sessionSet.add(session.id);
          affinity.sessionsByVisitor.set(visitor.id, sessionSet);
          if (sessionSet.size >= 2) affinity.repeatVisitors.add(visitor.id);
          if (session.accesses.has(id)) affinity.accesses += 1;
          if (session.downloads.has(id)) affinity.downloads += 1;
          affinityMap.set(id, affinity);
        }
      }
    }
    const publicationAffinities = [...affinityMap.values()]
      .map((affinity) => ({
        id: affinity.id,
        title: affinity.title,
        series: affinity.series,
        publisher: affinity.publisher,
        parsha: affinity.parsha,
        returningVisitors: affinity.visitors.size,
        repeatVisitors: affinity.repeatVisitors.size,
        clicks: 0,
        accesses: affinity.accesses,
        downloads: affinity.downloads,
      }))
      .sort((a, b) => b.returningVisitors - a.returningVisitors || b.downloads - a.downloads)
      .slice(0, 30);

    const journeys = returning
      .map((visitor) => {
        const activeSessions = visitor.sessions.filter((session) => session.activeInRange);
        const first = visitor.sessions[0]!;
        const last = visitor.sessions[visitor.sessions.length - 1]!;
        return {
          visitor: shortId(visitor.id),
          firstSeenAt: first.startedAt,
          lastSeenAt: last.lastAt,
          source: first.source,
          firstDevice: first.device,
          sessions: visitor.sessions.length,
          daysSinceFirstVisit: hours(first.startedAt, last.lastAt) / 24,
          totalDownloads: activeSessions.reduce((sum, session) => sum + session.downloadEvents, 0),
          totalActiveSeconds: Math.round(
            activeSessions.reduce((sum, session) => sum + session.activeSeconds, 0),
          ),
          firstDownloadSessionNumber: visitor.firstDownloadSessionNumber,
          topPublications: [] as Array<{ title: string; sessions: number }>,
          sessionJourney: visitor.sessions.slice(-6).map((session, index, shown) => ({
            sessionNumber: visitor.sessions.length - shown.length + index + 1,
            startedAt: session.startedAt,
            source: session.source,
            device: session.device,
            landingPath: session.landingPath,
            pages: session.pages.slice(0, 5),
            impressionCount: 0,
            clicked: [...session.clicks.values()]
              .map((publication) => publication.title)
              .slice(0, 4),
            accessed: [...session.accesses.values()]
              .map((publication) => publication.title)
              .slice(0, 4),
            downloaded: [...session.downloads.values()]
              .map((publication) => publication.title)
              .slice(0, 4),
            activeSeconds: Math.round(session.activeSeconds),
            inReportingRange: session.activeInRange,
          })),
        };
      })
      .sort((a, b) => b.sessions - a.sessions || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, 20);

    return {
      ok: true as const,
      days,
      since,
      methodology:
        "Reporting range selects active visitors; prior canonical history is loaded for those visitors to determine lifetime first session, acquisition source, return status, and first download.",
      totals: {
        uniqueVisitors: visitors.length,
        returningVisitors: returning.length,
        returnRate: visitors.length ? returning.length / visitors.length : 0,
        totalSessions: visitors.reduce(
          (sum, visitor) =>
            sum + visitor.sessions.filter((session) => session.activeInRange).length,
          0,
        ),
        repeatSessions,
        convertedVisitors: converted.length,
        visitorConversionRate: visitors.length ? converted.length / visitors.length : 0,
        medianDaysToReturn: median(returnDelays),
        medianHoursToFirstDownload: median(conversionHours),
      },
      timeToConversion: {
        firstSession: visitors.filter((visitor) => visitor.firstDownloadSessionNumber === 1).length,
        laterSession: visitors.filter((visitor) => (visitor.firstDownloadSessionNumber ?? 0) > 1)
          .length,
        noDownload: visitors.filter((visitor) => visitor.firstDownloadAt === null).length,
      },
      repeatConversion,
      cohorts,
      publicationAffinities,
      journeys,
      rawEventCount: inRange.length,
      historicalEventCount: history.length,
    };
  });
