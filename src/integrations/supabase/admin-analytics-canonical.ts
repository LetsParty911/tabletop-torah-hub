import { countSukkahSignDownloads } from "@/lib/sukkah-sign-downloads";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import {
  CONFIDENCE_EXPLANATIONS,
  CONFIDENCE_LABELS,
  classifySession,
  emptyConfidenceCounts,
  type TrafficConfidence,
} from "@/lib/traffic-confidence";
import {
  computeCohorts,
  computeWeeklyLoyalty,
  type VisitorTimeline,
} from "@/lib/retention-cohorts";
import { aggregatePublications } from "@/lib/publication-funnel";
import {
  buildSessions,
  classifyAutomation,
  classifyKnownIncident,
  classifySessions,
} from "@/lib/human-sessions";
import {
  buildChangeObservations,
  buildObservations,
  formatDayLabel,
  formatWindowLabel,
  hasComparableBaseline,
  newYorkDayWindow,
  priorWeekDayKey,
  recentCompletedDayKeys,
  selectCollectionReportWindows,
} from "@/lib/admin-reports";

type EventRow = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  is_new_visitor: boolean | null;
  path: string | null;
  publication_id: string | null;
  publication_title: string | null;
  publication_series?: string | null;
  publisher?: string | null;
  device_type: string | null;
  source_group: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  referrer_host?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  is_internal?: boolean | null;
  geo_source?: string | null;
  geo_provider?: string | null;
  geo_reliability?: string | null;
  network_type?: string | null;
  as_organization?: string | null;
  metadata?: Record<string, unknown> | null;
  user_agent?: string | null;
};

type WindowDef = { parsha: string; start: string; end: string };



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

const BASE_COLUMNS =
  "event_name, occurred_at, visitor_id, session_id, is_new_visitor, path, publication_id, publication_title, publication_series, publisher, device_type, source_group, country, region, city, postal_code, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, metadata, user_agent";

// Newer columns. Some environments may not have every one of them yet, so the
// first query probes once and the answer is cached for the worker instance.
const EXTRA_COLUMNS =
  "utm_content, is_internal, geo_source, geo_provider, geo_reliability, network_type, as_organization";

let cachedColumns: string | null = null;

async function eventColumns(): Promise<string> {
  if (cachedColumns) return cachedColumns;
  const admin = getSupabaseAdmin();
  const probe = await admin
    .from("analytics_events")
    .select(`${BASE_COLUMNS}, ${EXTRA_COLUMNS}`)
    .limit(1);
  cachedColumns = probe.error ? BASE_COLUMNS : `${BASE_COLUMNS}, ${EXTRA_COLUMNS}`;
  return cachedColumns;
}

async function fetchEventsBetween(start: string, end: string): Promise<EventRow[]> {
  const admin = getSupabaseAdmin();
  const out: EventRow[] = [];
  const pageSize = 1000;
  const columns = await eventColumns();

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(columns)
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

export type UsedTorahReason = "Opened a PDF" | "Requested a download" | "Shared Torah" | "Signed up";

export function usedTorahQualification(eventNames: string[]): UsedTorahReason | null {
  if (eventNames.includes("download") || eventNames.includes("download_served")) return "Requested a download";
  if (eventNames.includes("pdf_open")) return "Opened a PDF";
  if (eventNames.includes("share_click")) return "Shared Torah";
  if (eventNames.includes("signup")) return "Signed up";
  return null;
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


function summarizeCanonical(rows: EventRow[], priorVisitors = new Set<string>()) {
  // Headline counts use ONLY high_confidence_human + likely_human sessions.
  const classified = classifySessions(rows);
  const allSessions = classified.sessions;
  const excluded = new Set([...allSessions.keys()].filter((id) => !classified.humanIds.has(id)));
  const allAutomated = new Set([...allSessions.keys()].filter((id) => classified.confidence.get(id) === "suspected_automation"));
  const internalOnly = new Set([...allSessions.keys()].filter((id) => classified.confidence.get(id) === "internal_test"));
  const uncertain = new Set([...allSessions.keys()].filter((id) => classified.confidence.get(id) === "uncertain"));

  const rawSessions = allSessions.size;
  const rawVisitors = new Set<string>();
  for (const session of allSessions.values()) {
    if (session.visitorId) rawVisitors.add(session.visitorId);
  }

  const kept = [...allSessions.values()].filter((session) => !excluded.has(session.id));
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
  const downloadActionIds = new Set<string>();

  for (const row of keptRows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
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
    if (name === "download" || name === "download_served") {
      const publication = row.publication_id?.trim() || row.publication_title?.trim() || "unknown";
      const rawActionId = row.metadata?.["action_id"];
      const actionId = typeof rawActionId === "string" ? rawActionId.trim() : "";
      downloadActionIds.add(actionId || `${name}::${sid}::${publication}`);
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
    filteredInternalSessions: internalOnly.size,
    filteredUncertainSessions: uncertain.size,
    returningVisitors: returningVisitors.size,
    engagedSessions,
    pdfAccessingSessions,
    downloadingSessions,
    uniquePdfDownloads: uniquePdfDownloads.size,
    downloadActions: downloadActionIds.size,
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

export type AnalyticsReportRange = "1h" | "today" | "collection" | "7d";

type ReportDetail = {
  sessionId: string;
  visitorId: string | null;
  at: string;
  event: string;
  path: string | null;
  publication: string | null;
  source: string;
  reason: string | null;
};

function reportWindow(range: AnalyticsReportRange, collection: WindowDef | null) {
  const end = new Date(Date.now() + 60_000).toISOString();
  if (range === "collection" && collection) return { start: collection.start, end, label: collection.parsha };
  if (range === "today") return { start: startOfTodayNewYork(), end, label: "Today" };
  const hours = range === "1h" ? 1 : 24 * 7;
  return {
    start: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    end,
    label: range === "1h" ? "Last hour" : "Last 7 days",
  };
}

/**
 * Approximate, network-derived location wording. Never presented as an exact
 * address: a carrier, VPN or datacentre exit produces a plausible-looking city
 * that is not where the reader is sitting.
 */
export function describeLocation(place: string, row: Pick<EventRow, "geo_reliability" | "network_type" | "geo_source">): string {
  const network = row.network_type?.trim().toLowerCase() ?? "";
  const reliability = row.geo_reliability?.trim().toLowerCase() ?? "";
  if (network && network !== "standard" && network !== "unknown")
    return `${place} — ${network} network location, low reliability`;
  if (reliability === "low") return `${place} — network location, low reliability`;
  if (row.geo_source === "country_only") return `${place} — country only`;
  return `${place} — approximate network location`;
}

function buildAnalyticsReport(rows: EventRow[], priorVisitors: Set<string>) {
  // Shared classifier: only high_confidence_human + likely_human count.
  const classified = classifySessions(rows);
  const allSessions = classified.sessions;
  const confidenceBySession = classified.confidence;
  const confidenceCounts = classified.counts;
  const keptSessions = [...allSessions.values()].filter((session) => classified.humanIds.has(session.id));
  const keptIds = classified.humanIds;
  const markedInternalSessions = [...allSessions.values()].filter((s) => s.markedInternal).length;
  const keptRows = rows.filter((row) => Boolean(row.session_id && keptIds.has(row.session_id.trim())));
  const canonical = summarizeCanonical(rows, priorVisitors);
  const rowsBySession = new Map<string, EventRow[]>();
  for (const row of keptRows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const list = rowsBySession.get(sid) ?? [];
    list.push(row);
    rowsBySession.set(sid, list);
  }

  const detailFor = (row: EventRow, reason: string | null = null): ReportDetail => ({
    sessionId: row.session_id?.trim() ?? "",
    visitorId: row.visitor_id?.trim() || null,
    at: row.occurred_at,
    event: row.event_name ?? "unknown",
    path: row.path,
    publication: row.publication_title?.trim() || row.publication_id?.trim() || null,
    source: row.source_group?.trim() || "Direct",
    reason,
  });

  const sessionDetails = keptSessions.map((session) => {
    const events = rowsBySession.get(session.id) ?? [];
    const reason = usedTorahQualification(events.map((row) => row.event_name ?? ""));
    return {
      sessionId: session.id,
      visitorId: session.visitorId,
      startedAt: new Date(session.firstAt).toISOString(),
      source: session.source,
      device: session.device,
      pageviews: session.pageviews,
      engaged: session.engaged || session.pageviews >= 2,
      usedTorah: Boolean(reason),
      usedTorahReason: reason,
      events: events.map((row) => detailFor(row, reason)),
    };
  });
  const usedSessions = sessionDetails.filter((session) => session.usedTorah);
  const usedVisitors = new Set(usedSessions.map((session) => session.visitorId).filter(Boolean));
  const returning = new Set<string>();
  for (const row of keptRows) {
    const vid = row.visitor_id?.trim();
    if (vid && (priorVisitors.has(vid) || row.is_new_visitor === false)) returning.add(vid);
  }

  const publications = aggregatePublications(keptRows, priorVisitors);
  const campaigns = new Map<string, { sessions: Set<string>; variants: Map<string, Set<string>> }>();
  const utmSources = new Map<string, Set<string>>();
  const locations = new Map<string, Set<string>>();
  const searches: Array<{ term: string; at: string; sessionId: string; ledToContent: boolean }> = [];

  for (const row of keptRows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;

    const utmSource = row.utm_source?.trim().toLowerCase();
    if (utmSource) {
      const label = row.utm_medium?.trim()
        ? `${utmSource} / ${row.utm_medium.trim().toLowerCase()}`
        : utmSource;
      const set = utmSources.get(label) ?? new Set<string>();
      set.add(sid);
      utmSources.set(label, set);
    }

    // Same source/medium/campaign always groups together; utm_content is kept
    // as a variant breakdown underneath it, never as a separate campaign.
    const campaignParts = [row.utm_source, row.utm_medium, row.utm_campaign]
      .map((part) => part?.trim()).filter(Boolean);
    if (campaignParts.length) {
      const label = campaignParts.join(" / ");
      const entry = campaigns.get(label) ?? { sessions: new Set<string>(), variants: new Map<string, Set<string>>() };
      entry.sessions.add(sid);
      const variant = row.utm_content?.trim();
      if (variant) {
        const variantSet = entry.variants.get(variant) ?? new Set<string>();
        variantSet.add(sid);
        entry.variants.set(variant, variantSet);
      }
      campaigns.set(label, entry);
    }
    const place = [row.city, row.region, row.country].map((part) => part?.trim()).filter(Boolean).join(", ");
    if (place) {
      const location = describeLocation(place, row);
      const set = locations.get(location) ?? new Set<string>();
      set.add(sid);
      locations.set(location, set);
    }
    if (row.event_name === "search") {
      const metadata = row.metadata ?? {};
      const value = metadata["query"] ?? metadata["term"] ?? metadata["q"];
      if (typeof value === "string" && value.trim()) {
        const laterContent = (rowsBySession.get(sid) ?? []).some(
          (event) => event.occurred_at >= row.occurred_at && ["publication_click", "pdf_open", "download"].includes(event.event_name ?? ""),
        );
        searches.push({ term: value.trim(), at: row.occurred_at, sessionId: sid, ledToContent: laterContent });
      }
    }
  }

  // Correlate user-initiated download actions with served download requests.
  const actionId = (row: EventRow): string | null => {
    const value = (row.metadata ?? {})["action_id"];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const actionIds = new Set<string>();
  const servedActions = new Set<string>();
  for (const row of keptRows) {
    const id = actionId(row);
    if (!id) continue;
    if (row.event_name === "download") actionIds.add(id);
    if (row.event_name === "download_served") servedActions.add(id);
  }
  const matchedActions = new Set([...actionIds].filter((id) => servedActions.has(id)));

  // Plain-English, factual sentences about recent meaningful visits.
  const recentStories = sessionDetails
    .filter((session) => session.usedTorah || session.engaged)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8)
    .map((session) => {
      const events = session.events;
      const titles = [...new Set(events.map((event) => event.publication).filter(Boolean))].slice(0, 2);
      const opened = events.some((event) => event.event === "pdf_open");
      const downloaded = events.some((event) => event.event === "download");
      const did = downloaded
        ? "requested a download"
        : opened
          ? "opened a PDF"
          : `viewed ${session.pageviews} ${session.pageviews === 1 ? "page" : "pages"}`;
      const confidenceLabel = CONFIDENCE_LABELS[confidenceBySession.get(session.sessionId) ?? "uncertain"];
      return {
        at: session.startedAt,
        text: `A ${session.device} visitor arriving from ${session.source} ${did}${titles.length ? ` (${titles.join(", ")})` : ""}. Classified ${confidenceLabel.toLowerCase()}.`,
      };
    });

  const metricDetails = {
    people: keptRows.filter((row, index, list) => row.visitor_id && list.findIndex((other) => other.visitor_id === row.visitor_id) === index).map((row) => detailFor(row)),
    usedTorah: usedSessions.flatMap((session) => session.events.filter((event) => ["pdf_open", "download", "share_click", "signup"].includes(event.event))),
    pdfOpens: keptRows.filter((row) => row.event_name === "pdf_open").map((row) => detailFor(row)),
    downloads: keptRows.filter((row) => row.event_name === "download").map((row) => detailFor(row)),
    returning: keptRows.filter((row, index, list) => row.visitor_id && returning.has(row.visitor_id) && list.findIndex((other) => other.visitor_id === row.visitor_id) === index).map((row) => detailFor(row)),
    engaged: sessionDetails.filter((session) => session.engaged).flatMap((session) => session.events.slice(0, 1)),
    downloadsServed: keptRows.filter((row) => row.event_name === "download_served").map((row) => detailFor(row, "Application validated the file and issued the redirect")),
  };

  return {
    metrics: {
      people: canonical.uniqueVisitors,
      usedTorah: usedVisitors.size,
      pdfOpens: metricDetails.pdfOpens.length,
      downloads: canonical.downloadActions,
      sessions: canonical.sessions,
      engagedSessions: canonical.engagedSessions,
      returningReaders: returning.size,
      signups: keptRows.filter((row) => row.event_name === "signup").length,
      newVisitors: new Set(keptRows.filter((row) => row.is_new_visitor === true && row.visitor_id).map((row) => row.visitor_id)).size,
      // A served download request means the application validated the
      // publication and issued the redirect. It is not proof the file finished.
      downloadsServed: servedActions.size,
      downloadActionsMatched: matchedActions.size,
      downloadActionsUnmatched: Math.max(0, actionIds.size - matchedActions.size),
      servedWithoutAction: [...servedActions].filter((id) => !actionIds.has(id)).length,
      chooserSelections: keptRows.filter((row) => row.event_name === "chooser_select").length,
      recommendationClicks: keptRows.filter((row) => row.event_name === "recommendation_click").length,
      myTableAdds: keptRows.filter((row) => row.event_name === "my_table_add").length,
      myTableOpens: keptRows.filter((row) => row.event_name === "my_table_open").length,
    },
    confidence: {
      counts: confidenceCounts,
      labels: CONFIDENCE_LABELS,
      explanations: CONFIDENCE_EXPLANATIONS,
      markedInternalSessions,
    },
    recentStories,
    raw: { sessions: canonical.rawSessions, visitors: canonical.rawUniqueVisitors },
    filteredAutomationSessions: canonical.filteredAutomationSessions,
    filteredInternalSessions: canonical.filteredInternalSessions,
    filteredUncertainSessions: canonical.filteredUncertainSessions,
    details: metricDetails,
    sessions: sessionDetails,
    recentActivity: keptRows.slice(-20).reverse().map((row) => detailFor(row)),
    sources: canonical.sources,
    devices: canonical.devices,
    publications,
    utmSources: [...utmSources.entries()].map(([label, set]) => ({ label, sessions: set.size })).sort((a, b) => b.sessions - a.sessions),
    campaigns: [...campaigns.entries()]
      .map(([label, entry]) => ({
        label,
        sessions: entry.sessions.size,
        variants: [...entry.variants.entries()]
          .map(([content, set]) => ({ content, sessions: set.size }))
          .sort((a, b) => b.sessions - a.sessions),
      }))
      .sort((a, b) => b.sessions - a.sessions),
    locations: [...locations.entries()].map(([label, set]) => ({ label, sessions: set.size })).sort((a, b) => b.sessions - a.sessions).slice(0, 20),
    searches: searches.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
  };
}

export const adminAnalyticsReport = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; range?: AnalyticsReportRange }) =>
    z.object({ accessToken: z.string().min(10), range: z.enum(["1h", "today", "collection", "7d"]).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const pdfResult = await admin.from("pdfs").select("parsha_key, created_at");
    if (pdfResult.error) throw new Error(pdfResult.error.message);
    const windows = buildCollectionWindows((pdfResult.data ?? []) as Array<{ parsha_key: string | null; created_at: string | null }>);
    const range = data.range ?? "collection";
    const window = reportWindow(range, windows[0] ?? null);
    const duration = Date.parse(window.end) - Date.parse(window.start);
    const priorWindow = { start: new Date(Date.parse(window.start) - duration).toISOString(), end: window.start };
    const [rows, priorRows] = await Promise.all([
      fetchEventsBetween(window.start, window.end),
      fetchEventsBetween(priorWindow.start, priorWindow.end),
    ]);
    const [priorVisitors, comparisonPriorVisitors] = await Promise.all([
      fetchPriorVisitors(visitorIds(rows), window.start),
      fetchPriorVisitors(visitorIds(priorRows), priorWindow.start),
    ]);
    return {
      range,
      rangeLabel: window.label,
      windowStart: window.start,
      windowEnd: window.end,
      report: buildAnalyticsReport(rows, priorVisitors),
      comparison: buildAnalyticsReport(priorRows, comparisonPriorVisitors).metrics,
    };
  });

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
  geo_provider?: string | null;
  geo_reliability?: string | null;
  network_type?: string | null;
};

const VISITOR_SELECT_BASE =
  "event_name, occurred_at, visitor_id, session_id, is_new_visitor, path, publication_id, publication_title, source_group, device_type, country, region, city, postal_code, metadata, ip_address, user_agent, accept_language, sec_ch_ua, sec_ch_platform, sec_ch_mobile, asn, as_organization, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign";

// Extended geo columns may not exist yet in the analytics project; the fetcher
// falls back to the base projection when they are missing.
const VISITOR_SELECT = `${VISITOR_SELECT_BASE}, geo_provider, geo_reliability, network_type`;

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

  let projection = VISITOR_SELECT;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const run = (select: string) =>
      admin
        .from("analytics_events")
        .select(select)
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("occurred_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

    let { data, error } = await run(projection);
    if (error && /geo_provider|geo_reliability|network_type/.test(error.message)) {
      projection = VISITOR_SELECT_BASE;
      ({ data, error } = await run(projection));
    }
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as VisitorEventRow[];
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

function geoPlace(row: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  const parts = [row.city, row.region, row.country].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

const NETWORK_WORD: Record<string, string> = {
  mobile: "mobile",
  vpn: "VPN",
  proxy: "proxy",
  tor: "Tor",
  hosting: "datacenter",
  relay: "private relay",
};

/**
 * Admin-facing location wording. IP-derived places are never presented as an
 * exact physical address, and a network is only described as mobile/VPN/etc.
 * when the provider gave an explicit signal.
 */
function geoLabel(row: {
  city: string | null;
  region: string | null;
  country: string | null;
  reliability?: string | null;
  networkType?: string | null;
}): string {
  const place = geoPlace(row);
  if (!place) return row.networkType && row.networkType !== "unknown" ? "Network location only" : "";
  const word = row.networkType ? NETWORK_WORD[row.networkType] : undefined;
  if (row.reliability === "low") {
    return `${place} — ${word ? `${word}/network location` : "network location"}, low reliability`;
  }
  return `${place} — approximate network location`;
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
      geo: {
        city: string | null;
        region: string | null;
        country: string | null;
        postalCode: string | null;
        provider: string | null;
        reliability: string | null;
        networkType: string | null;
      };
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
          geo: {
            city: null,
            region: null,
            country: null,
            postalCode: null,
            provider: null,
            reliability: null,
            networkType: null,
          },
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
      if (row.geo_provider?.trim()) v.geo.provider = row.geo_provider.trim();
      if (row.geo_reliability?.trim()) v.geo.reliability = row.geo_reliability.trim();
      if (row.network_type?.trim()) v.geo.networkType = row.network_type.trim();
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

/* ------------------------------------------------------------------ *
 * Deterministic reports (daily + collection). These reuse the canonical
 * report builder above; no separate metric definitions are introduced.
 * ------------------------------------------------------------------ */

type BuiltReport = ReturnType<typeof buildAnalyticsReport>;

async function reportForWindow(start: string, end: string): Promise<BuiltReport> {
  const rows = await fetchEventsBetween(start, end);
  const priorVisitors = await fetchPriorVisitors(visitorIds(rows), start);
  return buildAnalyticsReport(rows, priorVisitors);
}

function downloadsBySource(report: BuiltReport) {
  const totals = new Map<string, number>();
  for (const detail of report.details.downloads) {
    totals.set(detail.source, (totals.get(detail.source) ?? 0) + 1);
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    breakdown: [...totals.entries()].map(([label, downloads]) => ({ label, downloads })).sort((a, b) => b.downloads - a.downloads),
    top: top ? { label: top[0], downloads: top[1] } : null,
  };
}

function shapeReport(report: BuiltReport, limit: number) {
  const searches = report.searches;
  const failedSearches = searches.filter((search) => !search.ledToContent);
  const sources = downloadsBySource(report);
  const topPublication = report.publications[0] ?? null;
  const observations = buildObservations({
    people: report.metrics.people,
    usedTorah: report.metrics.usedTorah,
    pdfOpens: report.metrics.pdfOpens,
    downloads: report.metrics.downloads,
    signups: report.metrics.signups,
    returningReaders: report.metrics.returningReaders,
    topPublication: topPublication
      ? { title: topPublication.title, downloadActions: topPublication.downloadActions, pdfOpens: topPublication.pdfOpens }
      : null,
    topSourceDownloads: sources.top,
    searchesWithoutContent: failedSearches.length,
    searchesTotal: searches.length,
    suspectedSessions: report.filteredAutomationSessions,
  });

  return {
    metrics: report.metrics,
    raw: report.raw,
    suspectedAutomatedSessions: report.filteredAutomationSessions,
    internalSessions: report.filteredInternalSessions,
    uncertainSessions: report.filteredUncertainSessions,
    publications: report.publications.slice(0, limit),
    // Computed before the top-N slice so the signs are counted even when not in the top list.
    sukkahSignDownloads: countSukkahSignDownloads(report.publications),
    sources: report.sources.slice(0, limit),
    downloadSources: sources.breakdown.slice(0, limit),
    campaigns: report.campaigns.slice(0, limit),
    locations: report.locations.slice(0, limit),
    searches: searches.slice(0, limit * 2),
    failedSearches: failedSearches.slice(0, limit * 2),
    lastEventAt: report.recentActivity[0]?.at ?? null,
    observations,
  };
}

function changeLines(current: BuiltReport, previous: BuiltReport | null) {
  if (!previous || !hasComparableBaseline({ people: previous.metrics.people, sessions: previous.metrics.sessions })) {
    return [] as string[];
  }
  return buildChangeObservations([
    { label: "People", current: current.metrics.people, previous: previous.metrics.people },
    { label: "Used Torah", current: current.metrics.usedTorah, previous: previous.metrics.usedTorah },
    { label: "Download actions", current: current.metrics.downloads, previous: previous.metrics.downloads },
  ]);
}

export const adminDailyReport = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; dayKey?: string | null }) =>
    z.object({ accessToken: z.string().min(10), dayKey: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const availableDays = recentCompletedDayKeys(14);
    const dayKey = data.dayKey && availableDays.includes(data.dayKey) ? data.dayKey : availableDays[0]!;
    const window = newYorkDayWindow(dayKey);
    const comparisonDayKey = priorWeekDayKey(dayKey);
    const comparisonWindow = newYorkDayWindow(comparisonDayKey);

    const [current, comparison] = await Promise.all([
      reportForWindow(window.start, window.end),
      reportForWindow(comparisonWindow.start, comparisonWindow.end),
    ]);
    const comparable = hasComparableBaseline({
      people: comparison.metrics.people,
      sessions: comparison.metrics.sessions,
    });

    return {
      kind: "daily" as const,
      dayKey,
      availableDays,
      title: `Daily report — ${formatDayLabel(dayKey)}`,
      windowLabel: formatWindowLabel(window.start, window.end),
      windowStart: window.start,
      windowEnd: window.end,
      comparisonLabel: `${formatDayLabel(comparisonDayKey)} (same weekday, one week earlier)`,
      comparable,
      comparisonMetrics: comparable ? comparison.metrics : null,
      changes: changeLines(current, comparison),
      generatedAt: new Date().toISOString(),
      ...shapeReport(current, 5),
    };
  });

export const adminCollectionReport = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; parsha?: string | null }) =>
    z.object({ accessToken: z.string().min(10), parsha: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const pdfResult = await admin.from("pdfs").select("parsha_key, created_at");
    if (pdfResult.error) throw new Error(pdfResult.error.message);
    const windows = buildCollectionWindows(
      (pdfResult.data ?? []) as Array<{ parsha_key: string | null; created_at: string | null }>,
    );
    const selection = selectCollectionReportWindows(windows, data.parsha ?? null);
    if (!selection.current) {
      return {
        kind: "collection" as const,
        empty: true as const,
        parsha: null,
        available: selection.available,
        title: "No completed collection yet",
        generatedAt: new Date().toISOString(),
      };
    }

    const current = await reportForWindow(selection.current.start, selection.current.end);
    const previous = selection.previous
      ? await reportForWindow(selection.previous.start, selection.previous.end)
      : null;
    const comparable = Boolean(
      previous && hasComparableBaseline({ people: previous.metrics.people, sessions: previous.metrics.sessions }),
    );

    return {
      kind: "collection" as const,
      empty: false as const,
      parsha: selection.current.parsha,
      available: selection.available,
      title: `Collection report — ${selection.current.parsha}`,
      windowLabel: formatWindowLabel(selection.current.start, selection.current.end),
      windowStart: selection.current.start,
      windowEnd: selection.current.end,
      comparisonLabel: selection.previous ? `Previous collection: ${selection.previous.parsha}` : null,
      comparable,
      comparisonMetrics: comparable && previous ? previous.metrics : null,
      changes: comparable ? changeLines(current, previous) : [],
      generatedAt: new Date().toISOString(),
      ...shapeReport(current, 8),
    };
  });

// ---------------------------------------------------------------------------
// Retention cohorts
// ---------------------------------------------------------------------------

type TimelineRow = {
  visitor_id: string | null;
  session_id: string | null;
  occurred_at: string;
  is_internal?: boolean | null;
};

async function fetchTimelineRows(sinceIso: string): Promise<TimelineRow[]> {
  const admin = getSupabaseAdmin();
  const out: TimelineRow[] = [];
  const pageSize = 1000;
  const maxRows = 60_000;
  const columns = (await eventColumns()).includes("is_internal")
    ? "visitor_id, session_id, occurred_at, is_internal"
    : "visitor_id, session_id, occurred_at";

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await admin
      .from("analytics_events")
      .select(columns)
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as TimelineRow[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export const adminRetentionCohorts = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);

    const lookbackDays = 120;
    const observationStartIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = (await fetchTimelineRows(observationStartIso)).filter((row) => row.is_internal !== true);

    // Distinct session starts per visitor. Repeat events inside one session
    // collapse to that session's earliest timestamp, so a heartbeat or a
    // second pageview can never register as a return.
    const sessionFirstAt = new Map<string, { visitorId: string; at: number }>();
    for (const row of rows) {
      const vid = row.visitor_id?.trim();
      const sid = row.session_id?.trim();
      if (!vid || !sid) continue;
      const at = Date.parse(row.occurred_at);
      if (Number.isNaN(at)) continue;
      const key = `${vid}::${sid}`;
      const existing = sessionFirstAt.get(key);
      if (!existing || at < existing.at) sessionFirstAt.set(key, { visitorId: vid, at });
    }

    const byVisitor = new Map<string, VisitorTimeline>();
    for (const { visitorId, at } of sessionFirstAt.values()) {
      const entry = byVisitor.get(visitorId) ?? { visitorId, firstSession: at, sessionStarts: [] };
      if (at < entry.firstSession) entry.firstSession = at;
      entry.sessionStarts.push(at);
      byVisitor.set(visitorId, entry);
    }

    // Left-censoring: any visitor with canonical history before the
    // observation period cannot be trusted to have their real day 0 here.
    const priorVisitors = await fetchPriorVisitors([...byVisitor.keys()], observationStartIso);
    const timelines = [...byVisitor.values()].map((timeline) => ({
      ...timeline,
      sessionStarts: timeline.sessionStarts.sort((a, b) => a - b),
      hasPriorHistory: priorVisitors.has(timeline.visitorId),
    }));

    const observationStart = Date.parse(observationStartIso);

    return {
      lookbackDays,
      observationStart: observationStartIso,
      visitorsObserved: timelines.length,
      leftCensoredVisitors: timelines.filter((timeline) => timeline.hasPriorHistory).length,
      cohorts: computeCohorts(timelines, observationStart),
      loyalty: computeWeeklyLoyalty(timelines.filter((timeline) => !timeline.hasPriorHistory)),
    };
  });

// ---------------------------------------------------------------------------
// Analytics health — evidence-based checks over real recent data
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "warning" | "not_enough_data";
export type HealthCheck = { name: string; status: HealthStatus; detail: string };

export const adminAnalyticsHealth = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAnalyticsAdmin(data.accessToken);

    const end = new Date(Date.now() + 60_000).toISOString();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await fetchEventsBetween(start, end);
    const checks: HealthCheck[] = [];
    const total = rows.length;

    // 1. Ingestion recency
    const latest = rows.length ? rows[rows.length - 1]!.occurred_at : null;
    const minutesSince = latest ? Math.round((Date.now() - Date.parse(latest)) / 60_000) : null;
    checks.push({
      name: "Event ingestion",
      status: minutesSince === null ? "not_enough_data" : minutesSince <= 180 ? "healthy" : "warning",
      detail:
        minutesSince === null
          ? "No events recorded in the last 7 days."
          : `${total} events in 7 days; most recent ${minutesSince} minutes ago.`,
    });

    // 2. session_start consistency
    const sessions = new Set<string>();
    const sessionsWithStart = new Set<string>();
    for (const row of rows) {
      const sid = row.session_id?.trim();
      if (!sid) continue;
      sessions.add(sid);
      if (row.event_name === "session_start") sessionsWithStart.add(sid);
    }
    const missingStart = sessions.size - sessionsWithStart.size;
    checks.push({
      name: "Session consistency",
      status:
        sessions.size < 10
          ? "not_enough_data"
          : missingStart / Math.max(1, sessions.size) <= 0.15
            ? "healthy"
            : "warning",
      detail: `${sessions.size} sessions; ${missingStart} without a session_start event (sessions that began before this window count here).`,
    });

    // 3. Duplicate protection
    const seen = new Set<string>();
    let duplicates = 0;
    for (const row of rows) {
      const key = `${row.session_id}|${row.event_name}|${row.occurred_at}`;
      if (seen.has(key)) duplicates += 1;
      seen.add(key);
    }
    checks.push({
      name: "Duplicate protection",
      status: total < 10 ? "not_enough_data" : duplicates === 0 ? "healthy" : "warning",
      detail:
        duplicates === 0
          ? "No identical session/event/timestamp rows observed; event_id uniqueness is collapsing retries."
          : `${duplicates} rows share a session, event name and timestamp. Distinct event_ids kept them, so they are separate events, not retries.`,
    });

    // 4. Geo enrichment — measured per recent SESSION, not per event row.
    // Geo enrichment was rolled out mid-window and not every event row needs
    // a location, so an event-level ratio produced a misleading warning.
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentSessions = new Set<string>();
    const recentSessionsWithGeo = new Set<string>();
    const recentSessionsLowReliability = new Set<string>();
    const recentSessionsWithNetwork = new Set<string>();
    for (const row of rows) {
      const sid = row.session_id?.trim();
      if (!sid) continue;
      if (Date.parse(row.occurred_at) < recentCutoff) continue;
      recentSessions.add(sid);
      if (row.country?.trim() || row.region?.trim() || row.city?.trim()) recentSessionsWithGeo.add(sid);
      if (row.geo_reliability === "low") recentSessionsLowReliability.add(sid);
      if (row.network_type?.trim() && row.network_type.trim() !== "unknown") recentSessionsWithNetwork.add(sid);
    }
    checks.push({
      name: "Location enrichment",
      status:
        recentSessions.size < 10
          ? "not_enough_data"
          : recentSessionsWithGeo.size / recentSessions.size >= 0.5
            ? "healthy"
            : "warning",
      detail: `${recentSessionsWithGeo.size} of ${recentSessions.size} sessions in the last 24 hours carry an approximate country, region or city; ${recentSessionsLowReliability.size} flagged low reliability and ${recentSessionsWithNetwork.size} carry network context (carrier, VPN or hosting). Older events from before geo enrichment rolled out are not counted.`,
    });

    // 5. Human signal
    const humanSignals = rows.filter((row) => row.event_name === "human_signal").length;
    checks.push({
      name: "Human interaction signal",
      status: sessions.size < 10 ? "not_enough_data" : humanSignals > 0 ? "healthy" : "warning",
      detail: `${humanSignals} human_signal events across ${sessions.size} sessions.`,
    });

    // 6. Campaign coverage — no tagged sessions is "nothing to judge", not healthy.
    const taggedSessions = new Set<string>();
    const contentSessions = new Set<string>();
    for (const row of rows) {
      const sid = row.session_id?.trim();
      if (!sid) continue;
      if (row.utm_source?.trim()) taggedSessions.add(sid);
      if (row.utm_content?.trim()) contentSessions.add(sid);
    }
    checks.push({
      name: "Campaign fields",
      status: total < 10 || taggedSessions.size === 0 ? "not_enough_data" : "healthy",
      detail:
        taggedSessions.size === 0
          ? `No campaign-tagged sessions in this window, so campaign capture cannot be judged. ${sessions.size} sessions seen.`
          : `${taggedSessions.size} of ${sessions.size} sessions carry a utm_source; ${contentSessions.size} also carry a utm_content variant.`,
    });

    // 7. Download action -> served matching
    const actions = new Set<string>();
    const served = new Set<string>();
    for (const row of rows) {
      const value = (row.metadata ?? {})["action_id"];
      const id = typeof value === "string" && value.trim() ? value.trim() : null;
      if (!id) continue;
      if (row.event_name === "download") actions.add(id);
      if (row.event_name === "download_served") served.add(id);
    }
    const matched = [...actions].filter((id) => served.has(id)).length;
    checks.push({
      name: "Download request matching",
      status:
        actions.size < 10
          ? "not_enough_data"
          : matched / Math.max(1, actions.size) >= 0.7
            ? "healthy"
            : "warning",
      detail: `${matched} of ${actions.size} tagged download actions have a matching served request. A served request means the file redirect was issued, not that the download completed.`,
    });

    return { windowStart: start, windowEnd: end, events: total, checks };
  });
