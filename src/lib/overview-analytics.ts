/**
 * Plausible-style aggregate overview, computed purely from canonical
 * analytics_events rows that have ALREADY been filtered to human-qualified
 * sessions (high_confidence_human + likely_human). No network, no storage.
 *
 * Every definition here is documented in docs/analytics-event-schema.md
 * ("Overview metrics").
 */
import { parseUserAgent } from "@/lib/ua-parse";

export type OverviewRow = {
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
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  referrer_host?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  metadata?: Record<string, unknown> | null;
  user_agent?: string | null;
};

export type OverviewSession = {
  id: string;
  visitorId: string | null;
  pageviews: number;
  meaningfulIntent: boolean;
  engaged: boolean;
  accessedPdf: boolean;
  downloaded: boolean;
  firstAt: number;
  lastAt: number;
};

export type Bucketing = "5min" | "hour" | "day";

export type Row = { label: string; sessions: number; count?: number };

const TZ = "America/New_York";
const TOP = 15;
const DRILL_CAP = 40;
const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

const COLLECTION_PATH = /^\/(parsha|yom-tov|publications|archive|short-vorts)(\/|$)/;
const INTERACTION = new Set(["publication_click", "recommendation_click", "chooser_select"]);

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function bucketKey(iso: string, bucketing: Bucketing): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  if (bucketing === "day") return day;
  if (bucketing === "hour") return `${day} ${get("hour")}:00`;
  const minute = Math.floor(Number(get("minute")) / 5) * 5;
  return `${day} ${get("hour")}:${String(minute).padStart(2, "0")}`;
}

export function bucketingFor(durationMs: number): Bucketing {
  if (durationMs <= 2 * 60 * 60 * 1000) return "5min";
  if (durationMs <= 2 * 24 * 60 * 60 * 1000) return "hour";
  return "day";
}

function tally(map: Map<string, Set<string>>, key: string | null | undefined, sid: string) {
  const k = key?.trim();
  if (!k) return;
  const set = map.get(k) ?? new Set<string>();
  set.add(sid);
  map.set(k, set);
}

function toRows(map: Map<string, Set<string>>, limit = TOP): Row[] {
  return [...map.entries()]
    .map(([label, set]) => ({ label, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function headlineOf(rows: OverviewRow[], sessions: OverviewSession[], returningVisitors: Set<string>) {
  const visitors = new Set<string>();
  const activeSeconds = new Map<string, number>();
  let pageviews = 0;
  const uniqueDownloads = new Set<string>();
  const downloadActions = new Set<string>();
  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    if (row.visitor_id) visitors.add(row.visitor_id);
    const name = row.event_name ?? "";
    if (name === "page_view") pageviews += 1;
    if (name === "heartbeat") {
      const s = num(row.metadata?.["active_seconds"]);
      if (s && s > 0) activeSeconds.set(sid, (activeSeconds.get(sid) ?? 0) + Math.min(s, 20));
    }
    // Canonical download metrics count user-initiated `download` events.
    // `download_served` is a separate server-side confirmation that the
    // application issued the CDN redirect; it must not create an action or
    // unique-download metric on its own.
    if (name === "download") {
      const pub = row.publication_id?.trim() || row.publication_title?.trim() || "unknown";
      const actionId = typeof row.metadata?.["action_id"] === "string" ? String(row.metadata["action_id"]).trim() : "";
      downloadActions.add(actionId || `download::${sid}::${pub}::${row.occurred_at}`);
      uniqueDownloads.add(`${sid}::${pub}`);
    }
  }
  const engaged = sessions.filter((s) => s.engaged || s.pageviews >= 2);
  const bounced = sessions.filter((s) => s.pageviews <= 1 && !s.meaningfulIntent);
  const engagedDurations = engaged.map((s) => activeSeconds.get(s.id) ?? 0).filter((v) => v > 0);
  const returning = [...visitors].filter((v) => returningVisitors.has(v)).length;
  const downloading = sessions.filter((s) => s.downloaded).length;
  return {
    visitors: visitors.size,
    sessions: sessions.length,
    pageviews,
    engagedSessions: engaged.length,
    pagesPerSession: sessions.length ? Math.round((pageviews / sessions.length) * 10) / 10 : 0,
    bouncedSessions: bounced.length,
    medianEngagedSeconds: median(engagedDurations),
    averageEngagedSeconds: engagedDurations.length
      ? Math.round(engagedDurations.reduce((a, b) => a + b, 0) / engagedDurations.length)
      : 0,
    engagedSessionsWithTime: engagedDurations.length,
    newVisitors: visitors.size - returning,
    returningVisitors: returning,
    pdfAccessingSessions: sessions.filter((s) => s.accessedPdf).length,
    downloadingSessions: downloading,
    uniqueSessionPublicationDownloads: uniqueDownloads.size,
    downloadActions: downloadActions.size,
  };
}

export type Headline = ReturnType<typeof headlineOf>;

export function buildOverview(input: {
  rows: OverviewRow[];
  sessions: OverviewSession[];
  returningVisitors: Set<string>;
  windowStart: string;
  windowEnd: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const rows = [...input.rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));
  const bySession = new Map<string, OverviewRow[]>();
  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid || !sessionById.has(sid)) continue;
    const list = bySession.get(sid) ?? [];
    list.push(row);
    bySession.set(sid, list);
  }

  const headline = headlineOf(rows, input.sessions, input.returningVisitors);

  // ---- Trend ------------------------------------------------------------
  const bucketing = bucketingFor(Date.parse(input.windowEnd) - Date.parse(input.windowStart));
  const trendMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number; downloads: number }>();
  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const key = bucketKey(row.occurred_at, bucketing);
    const b = trendMap.get(key) ?? { visitors: new Set(), sessions: new Set(), pageviews: 0, downloads: 0 };
    if (row.visitor_id) b.visitors.add(row.visitor_id);
    b.sessions.add(sid);
    if (row.event_name === "page_view") b.pageviews += 1;
    if (row.event_name === "download") b.downloads += 1;
    trendMap.set(key, b);
  }
  const trend = [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, b]) => ({ bucket, visitors: b.visitors.size, sessions: b.sessions.size, pageviews: b.pageviews, downloads: b.downloads }));

  // ---- Pages / landing / exit ------------------------------------------
  const pages = new Map<string, { pageviews: number; sessions: Set<string> }>();
  const landing = new Map<string, Set<string>>();
  const exits = new Map<string, Set<string>>();
  const sources = new Map<string, Set<string>>();
  const referrers = new Map<string, Set<string>>();
  const utmSource = new Map<string, Set<string>>();
  const utmMedium = new Map<string, Set<string>>();
  const utmCampaign = new Map<string, Set<string>>();
  const utmContent = new Map<string, Set<string>>();
  const countries = new Map<string, Set<string>>();
  const regions = new Map<string, Set<string>>();
  const cities = new Map<string, Set<string>>();
  const postals = new Map<string, Set<string>>();
  const devices = new Map<string, Set<string>>();
  const browsers = new Map<string, Set<string>>();
  const oses = new Map<string, Set<string>>();

  // Scroll: per page, sessions that viewed it and sessions reaching each threshold.
  const scrollPages = new Map<string, { viewSessions: Set<string>; reached: Map<number, Set<string>>; maxBySession: Map<string, number> }>();
  let scrollEventsRaw = 0;
  const scrollKeys = new Set<string>();

  const outboundHosts = new Map<string, { clicks: number; sessions: Set<string> }>();
  const outboundTargets = new Map<string, { clicks: number; sessions: Set<string> }>();

  const eventCatalog = new Map<string, { count: number; sessions: Set<string> }>();

  for (const [sid, list] of bySession) {
    const first = list[0]!;
    const firstWith = (key: keyof OverviewRow) =>
      (list.find((r) => typeof r[key] === "string" && String(r[key]).trim())?.[key] as string | undefined) ?? null;

    // Session-level attribution comes from the session's first-touch values.
    tally(sources, first.source_group || "Direct", sid);
    tally(referrers, firstWith("referrer_host") ?? "(none / direct)", sid);
    tally(utmSource, firstWith("utm_source"), sid);
    tally(utmMedium, firstWith("utm_medium"), sid);
    tally(utmCampaign, firstWith("utm_campaign"), sid);
    tally(utmContent, firstWith("utm_content"), sid);

    const country = firstWith("country");
    const region = firstWith("region");
    const city = firstWith("city");
    tally(countries, country ?? "Unknown", sid);
    tally(regions, region ? [region, country].filter(Boolean).join(", ") : null, sid);
    tally(cities, city ? [city, region, country].filter(Boolean).join(", ") : null, sid);
    const postal = firstWith("postal_code");
    tally(postals, postal ? `${postal}${country ? ` (${country})` : ""}` : null, sid);

    const ua = parseUserAgent(firstWith("user_agent"), first.device_type);
    tally(devices, first.device_type || ua.deviceCategory || "unknown", sid);
    tally(browsers, ua.browser, sid);
    tally(oses, ua.os, sid);

    const views = list.filter((r) => r.event_name === "page_view");
    if (views.length) {
      tally(landing, views[0]!.path || "/", sid);
      tally(exits, views[views.length - 1]!.path || "/", sid);
    }

    for (const row of list) {
      const name = row.event_name ?? "unknown";
      const path = row.path?.trim() || "/";
      const cat = eventCatalog.get(name) ?? { count: 0, sessions: new Set<string>() };
      cat.count += 1;
      cat.sessions.add(sid);
      eventCatalog.set(name, cat);

      if (name === "page_view") {
        const page = pages.get(path) ?? { pageviews: 0, sessions: new Set<string>() };
        page.pageviews += 1;
        page.sessions.add(sid);
        pages.set(path, page);
        const sp = scrollPages.get(path) ?? { viewSessions: new Set(), reached: new Map(), maxBySession: new Map() };
        sp.viewSessions.add(sid);
        scrollPages.set(path, sp);
      }
      if (name === "scroll_depth") {
        scrollEventsRaw += 1;
        const percent = num(row.metadata?.["percent"]);
        const pv = typeof row.metadata?.["page_view_id"] === "string" ? String(row.metadata["page_view_id"]) : path;
        if (percent !== null) scrollKeys.add(`${sid}::${pv}::${percent}`);
        const sp = scrollPages.get(path) ?? { viewSessions: new Set(), reached: new Map(), maxBySession: new Map() };
        if (percent !== null && (SCROLL_THRESHOLDS as readonly number[]).includes(percent)) {
          const set = sp.reached.get(percent) ?? new Set<string>();
          set.add(sid);
          sp.reached.set(percent, set);
        }
        const max = num(row.metadata?.["max_scroll_percent"]) ?? percent;
        if (max !== null) sp.maxBySession.set(sid, Math.max(sp.maxBySession.get(sid) ?? 0, Math.min(100, max)));
        scrollPages.set(path, sp);
      }
      if (name === "outbound_click") {
        const host = typeof row.metadata?.["target_host"] === "string" ? String(row.metadata["target_host"]) : "unknown";
        const tpath = typeof row.metadata?.["target_path"] === "string" ? String(row.metadata["target_path"]) : "";
        const h = outboundHosts.get(host) ?? { clicks: 0, sessions: new Set<string>() };
        h.clicks += 1;
        h.sessions.add(sid);
        outboundHosts.set(host, h);
        const key = `${host}${tpath}`;
        const t = outboundTargets.get(key) ?? { clicks: 0, sessions: new Set<string>() };
        t.clicks += 1;
        t.sessions.add(sid);
        outboundTargets.set(key, t);
      }
    }
  }

  const scrollRows = (entries: Array<[string, { viewSessions: Set<string>; reached: Map<number, Set<string>>; maxBySession: Map<string, number> }]>) =>
    entries.map(([path, sp]) => {
      const maxes = [...sp.maxBySession.values()];
      return {
        path,
        viewSessions: sp.viewSessions.size,
        reached: Object.fromEntries(SCROLL_THRESHOLDS.map((t) => [t, sp.reached.get(t)?.size ?? 0])) as Record<25 | 50 | 75 | 100, number>,
        medianMaxDepth: median(maxes),
      };
    });
  const allScroll = { viewSessions: new Set<string>(), reached: new Map<number, Set<string>>(), maxBySession: new Map<string, number>() };
  for (const sp of scrollPages.values()) {
    sp.viewSessions.forEach((s) => allScroll.viewSessions.add(s));
    for (const [t, set] of sp.reached) {
      const agg = allScroll.reached.get(t) ?? new Set<string>();
      set.forEach((s) => agg.add(s));
      allScroll.reached.set(t, agg);
    }
    for (const [s, m] of sp.maxBySession) allScroll.maxBySession.set(s, Math.max(allScroll.maxBySession.get(s) ?? 0, m));
  }

  // ---- Funnels -----------------------------------------------------------
  type Stage = { label: string; sessions: string[] };
  const funnel = (entry: (list: OverviewRow[]) => number, steps: Array<{ label: string; match: (r: OverviewRow) => boolean }>, entryLabel: string): Stage[] => {
    const stages: Stage[] = [{ label: entryLabel, sessions: [] }, ...steps.map((s) => ({ label: s.label, sessions: [] as string[] }))];
    for (const [sid, list] of bySession) {
      let cursor = entry(list);
      if (cursor < 0) continue;
      stages[0]!.sessions.push(sid);
      for (let i = 0; i < steps.length; i += 1) {
        const at = list.findIndex((r, idx) => idx >= cursor && steps[i]!.match(r));
        if (at < 0) break;
        stages[i + 1]!.sessions.push(sid);
        cursor = at;
      }
    }
    return stages;
  };
  // A canonical publication access is either a viewer open or a direct
  // download action. A served redirect alone is not a user action.
  const isAccess = (r: OverviewRow) => r.event_name === "pdf_open" || r.event_name === "download";
  const isDownload = (r: OverviewRow) => r.event_name === "download";
  const landingFunnel = funnel(
    (list) => list.findIndex((r) => r.event_name === "page_view" || r.event_name === "session_start"),
    [
      { label: "Selected a publication", match: (r) => r.event_name === "publication_click" },
      { label: "Accessed the publication", match: isAccess },
      { label: "Requested a download", match: isDownload },
    ],
    "Landed on the site",
  );
  const collectionFunnel = funnel(
    (list) => list.findIndex((r) => r.event_name === "page_view" && (r.path === "/" || COLLECTION_PATH.test(r.path ?? ""))),
    [
      { label: "Interacted with a publication", match: (r) => INTERACTION.has(r.event_name ?? "") },
      { label: "Accessed the publication", match: isAccess },
      { label: "Requested a download", match: isDownload },
    ],
    "Viewed home or a collection page",
  );
  const drill = (stages: Stage[]) =>
    stages.map((stage) => ({
      label: stage.label,
      sessions: stage.sessions.length,
      examples: stage.sessions.slice(-DRILL_CAP).reverse().map((sid) => {
        const list = bySession.get(sid) ?? [];
        return { sessionId: sid, at: list[0]?.occurred_at ?? "", landing: list.find((r) => r.event_name === "page_view")?.path ?? null, source: list[0]?.source_group || "Direct" };
      }),
    }));

  // ---- Journeys (most recent sessions) ---------------------------------
  const journeys = [...bySession.entries()]
    .sort((a, b) => (b[1][0]?.occurred_at ?? "").localeCompare(a[1][0]?.occurred_at ?? ""))
    .slice(0, 30)
    .map(([sid, list]) => {
      const steps: Array<{ at: string; event: string; label: string }> = [];
      for (const r of list) {
        const name = r.event_name ?? "unknown";
        if (name === "heartbeat" || name === "publication_impression" || name === "human_signal" || name === "session_start") continue;
        const label =
          name === "scroll_depth" ? `${r.path ?? "/"} · ${String(r.metadata?.["percent"] ?? "?")}%`
          : name === "outbound_click" ? String(r.metadata?.["target_host"] ?? "external link")
          : r.publication_title?.trim() || r.path || "";
        const prev = steps[steps.length - 1];
        if (prev && prev.event === name && prev.label === label) continue;
        steps.push({ at: r.occurred_at, event: name, label });
      }
      const pick = (k: "city" | "region" | "country" | "referrer_host") => list.find((r) => r[k]?.trim())?.[k]?.trim() ?? null;
      const visitorId = list.find((r) => r.visitor_id)?.visitor_id ?? null;
      let maxScroll: number | null = null;
      const downloadIds = new Set<string>();
      for (const r of list) {
        if (r.event_name === "scroll_depth") {
          const v = Number(r.metadata?.["max_scroll_percent"] ?? r.metadata?.["percent"]);
          if (Number.isFinite(v)) maxScroll = Math.max(maxScroll ?? 0, v);
        }
        if (r.event_name === "download_click" || r.event_name === "download") downloadIds.add(String(r.metadata?.["action_id"] ?? r.publication_id ?? r.occurred_at));
      }
      const firstAt = Date.parse(list[0]?.occurred_at ?? "");
      const lastAt = Date.parse(list[list.length - 1]?.occurred_at ?? "");
      return {
        sessionId: sid,
        visitorId,
        startedAt: list[0]?.occurred_at ?? "",
        lastAt: list[list.length - 1]?.occurred_at ?? "",
        durationSeconds: Number.isFinite(firstAt) && Number.isFinite(lastAt) ? Math.max(0, Math.round((lastAt - firstAt) / 1000)) : 0,
        source: list[0]?.source_group || "Direct",
        referrer: pick("referrer_host"),
        location: [pick("city"), pick("region"), pick("country")].filter(Boolean).join(", ") || "Unknown",
        returning: visitorId ? input.returningVisitors.has(visitorId) : false,
        device: list[0]?.device_type || "unknown",
        pageviews: list.filter((r) => r.event_name === "page_view").length,
        downloads: downloadIds.size,
        maxScroll,
        steps: steps.slice(0, 60),
      };
    });

  // ---- Recency -----------------------------------------------------------
  const latestEventAt = rows.length ? rows[rows.length - 1]!.occurred_at : null;
  const latestHeartbeat = [...rows].reverse().find((r) => r.event_name === "heartbeat")?.occurred_at ?? null;
  const activeWithin = (ms: number) => input.sessions.filter((s) => now - s.lastAt <= ms).length;

  return {
    headline,
    bucketing,
    trend,
    pages: [...pages.entries()]
      .map(([path, v]) => ({ label: path, count: v.pageviews, sessions: v.sessions.size }))
      .sort((a, b) => b.count - a.count || b.sessions - a.sessions)
      .slice(0, TOP),
    landingPages: toRows(landing),
    exitPages: toRows(exits),
    acquisition: {
      sources: toRows(sources),
      referrers: toRows(referrers),
      utmSource: toRows(utmSource),
      utmMedium: toRows(utmMedium),
      utmCampaign: toRows(utmCampaign),
      utmContent: toRows(utmContent),
    },
    geography: { countries: toRows(countries), regions: toRows(regions), cities: toRows(cities), postalCodes: toRows(postals) },
    technology: { devices: toRows(devices), browsers: toRows(browsers), os: toRows(oses) },
    scroll: {
      overall: scrollRows([["All pages", allScroll]])[0]!,
      pages: scrollRows([...scrollPages.entries()]).sort((a, b) => b.viewSessions - a.viewSessions).slice(0, 25),
      rawEvents: scrollEventsRaw,
      uniqueThresholdEvents: scrollKeys.size,
    },
    outbound: {
      clicks: [...outboundHosts.values()].reduce((a, b) => a + b.clicks, 0),
      sessions: new Set([...outboundHosts.values()].flatMap((h) => [...h.sessions])).size,
      hosts: [...outboundHosts.entries()].map(([label, v]) => ({ label, count: v.clicks, sessions: v.sessions.size })).sort((a, b) => b.count - a.count).slice(0, TOP),
      targets: [...outboundTargets.entries()].map(([label, v]) => ({ label, count: v.clicks, sessions: v.sessions.size })).sort((a, b) => b.count - a.count).slice(0, TOP),
    },
    funnels: [
      { id: "landing", title: "Landing → selection → PDF → download", stages: drill(landingFunnel) },
      { id: "collection", title: "Home / collection → interaction → PDF → download", stages: drill(collectionFunnel) },
    ],
    journeys,
    recency: {
      latestEventAt,
      latestHeartbeatAt: latestHeartbeat,
      activeLast5Min: activeWithin(5 * 60 * 1000),
      activeLast30Min: activeWithin(30 * 60 * 1000),
    },
    eventCatalog: [...eventCatalog.entries()]
      .map(([label, v]) => ({ label, count: v.count, sessions: v.sessions.size }))
      .sort((a, b) => b.count - a.count),
  };
}

export type Overview = ReturnType<typeof buildOverview>;
