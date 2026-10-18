// Admin-only, reporting-only summary of the /noahide-resources page.
// Sessions are classified from the WHOLE window (via the shared classifier) so a
// session that visited other pages is judged consistently with every other
// report; only events whose path is exactly /noahide-resources are attributed.
// Outbound clicks are generic link clicks: they never feed PDF/"Used Torah"
// counts, and a click does not prove anyone read the external site.

import { classifySessions, isHeadlineConfidence, type SessionClassification, type SessionEventRow } from "./human-sessions";
import type { TrafficConfidence } from "./traffic-confidence";
import { isClientReturningEvidence } from "./visitor-return-evidence";

export const NOAHIDE_PATH = "/noahide-resources";

export type NoahideEventRow = SessionEventRow & {
  event_id?: string | null;
  path: string | null;
  is_new_visitor?: boolean | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  geo_reliability?: string | null;
  network_type?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NoahideDestination = "ask_noah" | "chabad";

const DESTINATIONS: Record<NoahideDestination, { host: string; path: string; label: string }> = {
  ask_noah: { host: "asknoah.org", path: "/7-commandments", label: "Ask Noah International" },
  chabad: {
    host: "chabad.org",
    path: "/library/article_cdo/aid/5559665/jewish/The-Seven-Laws-of-Noah.htm",
    label: "Chabad.org",
  },
};

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
/** One heartbeat should never report more than this many focused seconds. */
const MAX_ACTIVE_SECONDS_PER_HEARTBEAT = 300;

export function normalizePath(path: string | null | undefined): string {
  if (!path) return "";
  const clean = path.split(/[?#]/)[0].trim();
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

const meta = (row: NoahideEventRow) => (row.metadata && typeof row.metadata === "object" ? row.metadata : {});

/** Exact allowlist match: hostname (optional www.) + pathname. No substrings. */
export function matchDestination(host: unknown, path: unknown): NoahideDestination | null {
  if (typeof host !== "string" || typeof path !== "string") return null;
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  const p = normalizePath(path);
  for (const key of Object.keys(DESTINATIONS) as NoahideDestination[]) {
    const d = DESTINATIONS[key];
    if (h === d.host && p === d.path) return key;
  }
  return null;
}

type SessionStat = {
  id: string;
  visitorId: string | null;
  confidence: TrafficConfidence;
  firstAt: string;
  pageviews: number;
  clicks: Record<NoahideDestination, number>;
  footerClicks: number;
  footerSources: Map<string, number>;
  humanSignal: boolean;
  maxScroll: number;
  activeSeconds: number;
  heartbeatSampled: boolean;
  source: string;
  utm: string | null;
  device: string;
  location: string;
  locationQuality: string;
  returning: boolean;
};

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const ranked = (map: Map<string, number>) =>
  [...map.entries()].map(([label, sessions]) => ({ label, sessions })).sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));

const emptyByConfidence = (): Record<TrafficConfidence, number> => ({
  high_confidence_human: 0,
  likely_human: 0,
  uncertain: 0,
  suspected_automation: 0,
  internal_test: 0,
});

export function summarizeNoahideResources(
  rows: NoahideEventRow[],
  priorVisitors: Set<string> = new Set(),
  classified: SessionClassification = classifySessions(rows),
  journeyLimit = 100,
) {
  const seen = new Set<string>();
  const pageRows: NoahideEventRow[] = [];
  const footerRows: NoahideEventRow[] = [];
  for (const row of rows) {
    if (row.event_name === "noahide_footer_click") {
      if (row.metadata?.target_path !== NOAHIDE_PATH || row.metadata?.placement !== "site_footer") continue;
      if (row.event_id) {
        if (seen.has(row.event_id)) continue;
        seen.add(row.event_id);
      }
      footerRows.push(row);
      continue;
    }
    if (normalizePath(row.path) !== NOAHIDE_PATH) continue;
    if (row.event_id) {
      if (seen.has(row.event_id)) continue;
      seen.add(row.event_id);
    }
    pageRows.push(row);
  }

  const stats = new Map<string, SessionStat>();
  const rawClicks: Record<NoahideDestination, number> = { ask_noah: 0, chabad: 0 };
  let rejectedClicks = 0;
  const clickOnlySessions = new Set<string>();
  const firstPass = new Map<string, NoahideEventRow[]>();
  for (const row of pageRows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const list = firstPass.get(sid) ?? [];
    list.push(row);
    firstPass.set(sid, list);
  }

  for (const [sid, list] of firstPass) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const hasPageView = list.some((r) => r.event_name === "page_view");
    for (const r of list) {
      if (r.event_name !== "outbound_click") continue;
      const dest = matchDestination(meta(r).target_host, meta(r).target_path);
      if (dest) rawClicks[dest] += 1;
      else rejectedClicks += 1;
    }
    if (!hasPageView) {
      if (list.some((r) => r.event_name === "outbound_click")) clickOnlySessions.add(sid);
      continue;
    }
    const pv = list.find((r) => r.event_name === "page_view")!;
    const vid = list.find((r) => r.visitor_id?.trim())?.visitor_id?.trim() ?? null;
    const stat: SessionStat = {
      id: sid,
      visitorId: vid,
      confidence: classified.confidence.get(sid) ?? "uncertain",
      firstAt: pv.occurred_at,
      pageviews: 0,
      clicks: { ask_noah: 0, chabad: 0 },
      footerClicks: 0,
      footerSources: new Map(),
      humanSignal: false,
      maxScroll: 0,
      activeSeconds: 0,
      heartbeatSampled: false,
      source: pv.source_group?.trim() || "Direct",
      utm: [pv.utm_source, pv.utm_medium, pv.utm_campaign].some((v) => v?.trim())
        ? `${pv.utm_source?.trim() || "—"} / ${pv.utm_medium?.trim() || "—"} / ${pv.utm_campaign?.trim() || "—"}`
        : null,
      device: pv.device_type?.trim() || "unknown",
      location: [pv.city, pv.region, pv.country].map((v) => v?.trim()).filter(Boolean).join(", ") || "Location unknown",
      locationQuality: pv.geo_reliability?.trim() || pv.network_type?.trim() || "unrated",
      returning: Boolean(vid && (priorVisitors.has(vid) || list.some(isClientReturningEvidence))),
    };
    for (const r of list) {
      const m = meta(r);
      switch (r.event_name) {
        case "page_view":
          stat.pageviews += 1;
          break;
        case "human_signal":
          stat.humanSignal = true;
          break;
        case "scroll_depth": {
          const pct = Number(m.percent);
          if ((SCROLL_MILESTONES as readonly number[]).includes(pct)) stat.maxScroll = Math.max(stat.maxScroll, pct);
          break;
        }
        case "heartbeat": {
          const secs = Number(m.active_seconds);
          if (Number.isFinite(secs) && secs > 0) {
            stat.heartbeatSampled = true;
            stat.activeSeconds += Math.min(secs, MAX_ACTIVE_SECONDS_PER_HEARTBEAT);
          }
          break;
        }
        case "outbound_click": {
          const dest = matchDestination(m.target_host, m.target_path);
          if (dest) stat.clicks[dest] += 1;
          break;
        }
      }
    }
    stats.set(sid, stat);
  }

  const footerSessions = new Map<string, { visitorId: string | null; count: number; source: string }>();
  for (const row of footerRows) {
    const sid = row.session_id?.trim();
    if (!sid) continue;
    const existing = footerSessions.get(sid);
    footerSessions.set(sid, {
      visitorId: existing?.visitorId ?? row.visitor_id?.trim() ?? null,
      count: (existing?.count ?? 0) + 1,
      source: existing?.source ?? normalizePath(row.path) ?? "/",
    });
    const pageSession = stats.get(sid);
    if (pageSession) {
      pageSession.footerClicks += 1;
      bump(pageSession.footerSources, normalizePath(row.path) || "/");
    }
  }
  const qualifyingFooter = [...footerSessions.entries()].filter(([sid]) => isHeadlineConfidence(classified.confidence.get(sid) ?? "uncertain"));
  const footerSourceCounts = new Map<string, number>();
  for (const [, record] of qualifyingFooter) bump(footerSourceCounts, record.source);
  const footerSummary = {
    clicks: qualifyingFooter.reduce((total, [, record]) => total + record.count, 0),
    sessions: qualifyingFooter.length,
    visitors: new Set(qualifyingFooter.map(([, record]) => record.visitorId).filter(Boolean)).size,
    rawClicks: footerRows.length,
    sources: ranked(footerSourceCounts),
  };

  const all = [...stats.values()];
  const human = all.filter((s) => isHeadlineConfidence(s.confidence));
  const byConfidence = emptyByConfidence();
  for (const s of all) byConfidence[s.confidence] += 1;

  const clicked = (s: SessionStat, d?: NoahideDestination) => (d ? s.clicks[d] > 0 : s.clicks.ask_noah + s.clicks.chabad > 0);
  const visitors = new Set(human.map((s) => s.visitorId).filter(Boolean) as string[]);
  const returningVisitors = new Set(human.filter((s) => s.returning).map((s) => s.visitorId).filter(Boolean) as string[]);
  const visitorSessions = new Map<string, number>();
  for (const s of human) if (s.visitorId) bump(visitorSessions, s.visitorId);
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

  const destination = (d: NoahideDestination) => {
    const sessions = human.filter((s) => clicked(s, d));
    const qualifiedClicks = human.reduce((sum, s) => sum + s.clicks[d], 0);
    return {
      key: d,
      label: DESTINATIONS[d].label,
      url: `https://${DESTINATIONS[d].host}${DESTINATIONS[d].path}`,
      rawClicks: rawClicks[d],
      qualifiedClicks,
      clickedSessions: sessions.length,
      uniqueClickers: new Set(sessions.map((s) => s.visitorId).filter(Boolean)).size,
      repeatClicks: Math.max(0, qualifiedClicks - sessions.length),
      clickThroughRate: rate(sessions.length, human.length),
    };
  };

  const sampled = human.filter((s) => s.heartbeatSampled);
  const sources = new Map<string, number>();
  const devices = new Map<string, number>();
  const locations = new Map<string, number>();
  const campaigns = new Map<string, number>();
  for (const s of human) {
    bump(sources, s.source);
    bump(devices, s.device);
    bump(locations, s.location);
    if (s.utm) bump(campaigns, s.utm);
  }
  const scrollReached = SCROLL_MILESTONES.map((m) => ({ percent: m, sessions: human.filter((s) => s.maxScroll >= m).length }));
  const anyClickSessions = human.filter((s) => clicked(s)).length;

  return {
    path: NOAHIDE_PATH,
    footer: footerSummary,
    headline: {
      visitors: visitors.size,
      sessions: human.length,
      pageviews: human.reduce((sum, s) => sum + s.pageviews, 0),
      newVisitors: visitors.size - returningVisitors.size,
      returningVisitors: returningVisitors.size,
      repeatVisitors: [...visitorSessions.values()].filter((n) => n > 1).length,
      sessionsWithoutVisitorId: human.filter((s) => !s.visitorId).length,
      anyClickSessions,
      clickThroughRate: rate(anyClickSessions, human.length),
      engagedSessions: human.filter((s) => s.humanSignal || s.maxScroll > 0 || clicked(s)).length,
      humanSignalSessions: human.filter((s) => s.humanSignal).length,
      activeSecondsSampledSessions: sampled.length,
      activeSecondsTotal: sampled.reduce((sum, s) => sum + s.activeSeconds, 0),
      activeSecondsMedian: median(sampled.map((s) => s.activeSeconds)),
    },
    destinations: [destination("ask_noah"), destination("chabad")],
    scrollReached,
    sources: ranked(sources),
    devices: ranked(devices),
    locations: ranked(locations),
    campaigns: ranked(campaigns),
    diagnostics: {
      rawSessions: all.length,
      rawPageviews: all.reduce((sum, s) => sum + s.pageviews, 0),
      byConfidence,
      clickOnlySessionsWithoutPageView: clickOnlySessions.size,
      rejectedOutboundClicks: rejectedClicks,
    },
    journeys: [...all]
      .sort((a, b) => b.firstAt.localeCompare(a.firstAt))
      .slice(0, journeyLimit)
      .map((s) => ({
        at: s.firstAt,
        sessionId: s.id,
        visitorId: s.visitorId,
        confidence: s.confidence,
        counted: isHeadlineConfidence(s.confidence),
        source: s.source,
        utm: s.utm,
        device: s.device,
        location: s.location,
        locationQuality: s.locationQuality,
        returning: s.returning,
        pageviews: s.pageviews,
        askNoahClicks: s.clicks.ask_noah,
        chabadClicks: s.clicks.chabad,
        footerClicks: s.footerClicks,
        activeSeconds: s.heartbeatSampled ? s.activeSeconds : null,
        maxScroll: s.maxScroll,
      })),
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export type NoahideResourcesReport = ReturnType<typeof summarizeNoahideResources>;
