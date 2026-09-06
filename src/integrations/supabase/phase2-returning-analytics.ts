import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requirePhase2Admin(accessToken: string) {
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

type AnalyticsRow = {
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

type PublicationInfo = {
  id: string;
  title: string;
  series: string | null;
  publisher: string | null;
  parsha: string | null;
};

type SessionAgg = {
  id: string;
  visitorId: string;
  startedAt: string;
  lastAt: string;
  source: string;
  device: string;
  landingPath: string | null;
  pages: string[];
  impressions: Map<string, PublicationInfo>;
  clicks: Map<string, PublicationInfo>;
  accesses: Map<string, PublicationInfo>;
  downloads: Map<string, PublicationInfo>;
  downloadEvents: number;
  activeSeconds: number;
};

type VisitorAgg = {
  id: string;
  sessions: SessionAgg[];
  firstDownloadAt: string | null;
  firstDownloadSessionNumber: number | null;
};

const PDF_ACCESS_EVENTS = new Set(["pdf_open", "download"]);

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicationOf(row: AnalyticsRow): PublicationInfo | null {
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

function addUniquePath(paths: string[], path: string | null) {
  const value = path?.trim();
  if (!value || paths.includes(value) || paths.length >= 8) return;
  paths.push(value);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function hoursBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

function daysBetween(a: string, b: string): number {
  return hoursBetween(a, b) / 24;
}

function shortVisitorId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export const adminPhase2ReturningAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number }) =>
    z
      .object({
        accessToken: z.string().min(10),
        days: z.number().int().min(7).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requirePhase2Admin(data.accessToken);

    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const admin = getSupabaseAdmin();

    const rows: AnalyticsRow[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 100000; offset += pageSize) {
      const { data: page, error } = await admin
        .from("analytics_events")
        .select(
          "event_name, occurred_at, visitor_id, session_id, path, landing_path, publication_id, publication_title, publication_series, publisher, parsha, device_type, source_group, metadata",
        )
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw new Error(error.message);
      const list = (page ?? []) as AnalyticsRow[];
      rows.push(...list);
      if (list.length < pageSize) break;
    }

    const sessions = new Map<string, SessionAgg>();
    for (const row of rows) {
      const visitorId = nonempty(row.visitor_id);
      const sessionId = nonempty(row.session_id);
      if (!visitorId || !sessionId) continue;

      let session = sessions.get(sessionId);
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
          impressions: new Map(),
          clicks: new Map(),
          accesses: new Map(),
          downloads: new Map(),
          downloadEvents: 0,
          activeSeconds: 0,
        };
        sessions.set(sessionId, session);
      }

      if (row.occurred_at < session.startedAt) session.startedAt = row.occurred_at;
      if (row.occurred_at > session.lastAt) session.lastAt = row.occurred_at;
      if (session.source === "Direct" && nonempty(row.source_group)) {
        session.source = nonempty(row.source_group)!;
      }
      if (session.device === "unknown" && nonempty(row.device_type)) {
        session.device = nonempty(row.device_type)!;
      }
      if (!session.landingPath && nonempty(row.landing_path)) {
        session.landingPath = nonempty(row.landing_path);
      }

      const eventName = nonempty(row.event_name);
      if (eventName === "page_view") addUniquePath(session.pages, row.path);

      const pub = publicationOf(row);
      if (pub) {
        if (eventName === "publication_impression") session.impressions.set(pub.id, pub);
        if (eventName === "publication_click") session.clicks.set(pub.id, pub);
        if (eventName && PDF_ACCESS_EVENTS.has(eventName)) session.accesses.set(pub.id, pub);
        if (eventName === "download") {
          session.downloads.set(pub.id, pub);
          session.downloadEvents += 1;
        }
      }

      if (eventName === "heartbeat") {
        const meta = row.metadata ?? {};
        const raw = Number(meta["active_seconds"] ?? meta["delta"] ?? 0);
        if (Number.isFinite(raw) && raw > 0) session.activeSeconds += Math.min(raw, 20);
      }
    }

    const visitorsMap = new Map<string, VisitorAgg>();
    for (const session of sessions.values()) {
      let visitor = visitorsMap.get(session.visitorId);
      if (!visitor) {
        visitor = {
          id: session.visitorId,
          sessions: [],
          firstDownloadAt: null,
          firstDownloadSessionNumber: null,
        };
        visitorsMap.set(session.visitorId, visitor);
      }
      visitor.sessions.push(session);
    }

    const visitors = [...visitorsMap.values()];
    for (const visitor of visitors) {
      visitor.sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      for (let i = 0; i < visitor.sessions.length; i += 1) {
        const session = visitor.sessions[i]!;
        if (session.downloadEvents > 0 && visitor.firstDownloadAt === null) {
          visitor.firstDownloadAt = session.startedAt;
          visitor.firstDownloadSessionNumber = i + 1;
        }
      }
    }

    const returning = visitors.filter((visitor) => visitor.sessions.length >= 2);
    const converted = visitors.filter((visitor) => visitor.firstDownloadAt !== null);
    const repeatSessions = returning.reduce(
      (total, visitor) => total + Math.max(0, visitor.sessions.length - 1),
      0,
    );
    const returnDelays = returning.map((visitor) =>
      daysBetween(visitor.sessions[0]!.startedAt, visitor.sessions[1]!.startedAt),
    );
    const conversionHours = converted.map((visitor) =>
      hoursBetween(visitor.sessions[0]!.startedAt, visitor.firstDownloadAt!),
    );

    const repeatConversion = [
      { key: "1st session", sessionNumber: 1 },
      { key: "2nd session", sessionNumber: 2 },
      { key: "3rd+ sessions", sessionNumber: 3 },
    ].map((bucket) => {
      let sessionCount = 0;
      let convertedSessions = 0;
      for (const visitor of visitors) {
        for (let i = 0; i < visitor.sessions.length; i += 1) {
          const ordinal = i + 1;
          const belongs =
            bucket.sessionNumber === 3 ? ordinal >= 3 : ordinal === bucket.sessionNumber;
          if (!belongs) continue;
          sessionCount += 1;
          if (visitor.sessions[i]!.downloadEvents > 0) convertedSessions += 1;
        }
      }
      return {
        key: bucket.key,
        sessions: sessionCount,
        convertedSessions,
        conversionRate: sessionCount ? convertedSessions / sessionCount : 0,
      };
    });

    type CohortAgg = {
      source: string;
      visitors: number;
      returnedVisitors: number;
      convertedVisitors: number;
      sessions: number;
      downloads: number;
    };
    const cohortMap = new Map<string, CohortAgg>();
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
      cohort.visitors += 1;
      cohort.sessions += visitor.sessions.length;
      cohort.downloads += visitor.sessions.reduce((n, session) => n + session.downloadEvents, 0);
      if (visitor.sessions.length >= 2) cohort.returnedVisitors += 1;
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
      .sort((a, b) => b.visitors - a.visitors || b.returnedVisitors - a.returnedVisitors);

    type AffinityAgg = {
      id: string;
      title: string;
      series: string | null;
      publisher: string | null;
      parsha: string | null;
      visitors: Set<string>;
      repeatVisitors: Set<string>;
      clicks: number;
      accesses: number;
      downloads: number;
      sessionsByVisitor: Map<string, Set<string>>;
    };
    const affinityMap = new Map<string, AffinityAgg>();
    for (const visitor of returning) {
      for (const session of visitor.sessions) {
        const touched = new Map<string, PublicationInfo>();
        for (const [id, pub] of session.clicks) touched.set(id, pub);
        for (const [id, pub] of session.accesses) touched.set(id, pub);
        for (const [id, pub] of session.downloads) touched.set(id, pub);

        for (const [id, pub] of touched) {
          let affinity = affinityMap.get(id);
          if (!affinity) {
            affinity = {
              id,
              title: pub.title,
              series: pub.series,
              publisher: pub.publisher,
              parsha: pub.parsha,
              visitors: new Set(),
              repeatVisitors: new Set(),
              clicks: 0,
              accesses: 0,
              downloads: 0,
              sessionsByVisitor: new Map(),
            };
            affinityMap.set(id, affinity);
          }
          affinity.visitors.add(visitor.id);
          const sessionSet = affinity.sessionsByVisitor.get(visitor.id) ?? new Set<string>();
          sessionSet.add(session.id);
          affinity.sessionsByVisitor.set(visitor.id, sessionSet);
          if (sessionSet.size >= 2) affinity.repeatVisitors.add(visitor.id);
        }

        for (const id of session.clicks.keys()) {
          const affinity = affinityMap.get(id);
          if (affinity) affinity.clicks += 1;
        }
        for (const id of session.accesses.keys()) {
          const affinity = affinityMap.get(id);
          if (affinity) affinity.accesses += 1;
        }
        for (const id of session.downloads.keys()) {
          const affinity = affinityMap.get(id);
          if (affinity) affinity.downloads += 1;
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
        clicks: affinity.clicks,
        accesses: affinity.accesses,
        downloads: affinity.downloads,
      }))
      .sort(
        (a, b) =>
          b.returningVisitors - a.returningVisitors ||
          b.repeatVisitors - a.repeatVisitors ||
          b.downloads - a.downloads ||
          b.accesses - a.accesses,
      )
      .slice(0, 30);

    const journeys = returning
      .map((visitor) => {
        const first = visitor.sessions[0]!;
        const last = visitor.sessions[visitor.sessions.length - 1]!;
        const totalDownloads = visitor.sessions.reduce((n, session) => n + session.downloadEvents, 0);
        const totalActiveSeconds = visitor.sessions.reduce((n, session) => n + session.activeSeconds, 0);
        const publicationCounts = new Map<string, { title: string; sessions: number }>();
        for (const session of visitor.sessions) {
          const touched = new Map<string, PublicationInfo>();
          for (const [id, pub] of session.clicks) touched.set(id, pub);
          for (const [id, pub] of session.accesses) touched.set(id, pub);
          for (const [id, pub] of session.downloads) touched.set(id, pub);
          for (const [id, pub] of touched) {
            const current = publicationCounts.get(id) ?? { title: pub.title, sessions: 0 };
            current.sessions += 1;
            publicationCounts.set(id, current);
          }
        }
        const topPublications = [...publicationCounts.values()]
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 4);

        return {
          visitor: shortVisitorId(visitor.id),
          firstSeenAt: first.startedAt,
          lastSeenAt: last.lastAt,
          source: first.source,
          firstDevice: first.device,
          sessions: visitor.sessions.length,
          daysSinceFirstVisit: daysBetween(first.startedAt, last.lastAt),
          totalDownloads,
          totalActiveSeconds: Math.round(totalActiveSeconds),
          firstDownloadSessionNumber: visitor.firstDownloadSessionNumber,
          topPublications,
          sessionJourney: visitor.sessions.slice(-6).map((session, index, arr) => {
            const absoluteIndex = visitor.sessions.length - arr.length + index + 1;
            return {
              sessionNumber: absoluteIndex,
              startedAt: session.startedAt,
              source: session.source,
              device: session.device,
              landingPath: session.landingPath,
              pages: session.pages.slice(0, 5),
              impressionCount: session.impressions.size,
              clicked: [...session.clicks.values()].map((p) => p.title).slice(0, 4),
              accessed: [...session.accesses.values()].map((p) => p.title).slice(0, 4),
              downloaded: [...session.downloads.values()].map((p) => p.title).slice(0, 4),
              activeSeconds: Math.round(session.activeSeconds),
            };
          }),
        };
      })
      .sort(
        (a, b) =>
          b.sessions - a.sessions ||
          b.totalDownloads - a.totalDownloads ||
          b.lastSeenAt.localeCompare(a.lastSeenAt),
      )
      .slice(0, 20);

    const firstSessionConversions = visitors.filter(
      (visitor) => visitor.firstDownloadSessionNumber === 1,
    ).length;
    const laterSessionConversions = visitors.filter(
      (visitor) =>
        visitor.firstDownloadSessionNumber !== null && visitor.firstDownloadSessionNumber > 1,
    ).length;

    return {
      ok: true as const,
      days,
      totals: {
        uniqueVisitors: visitors.length,
        returningVisitors: returning.length,
        returnRate: visitors.length ? returning.length / visitors.length : 0,
        totalSessions: sessions.size,
        repeatSessions,
        convertedVisitors: converted.length,
        visitorConversionRate: visitors.length ? converted.length / visitors.length : 0,
        medianDaysToReturn: median(returnDelays),
        medianHoursToFirstDownload: median(conversionHours),
      },
      timeToConversion: {
        firstSession: firstSessionConversions,
        laterSession: laterSessionConversions,
        noDownload: Math.max(0, visitors.length - converted.length),
      },
      repeatConversion,
      cohorts,
      publicationAffinities,
      journeys,
      rawEventCount: rows.length,
    };
  });
