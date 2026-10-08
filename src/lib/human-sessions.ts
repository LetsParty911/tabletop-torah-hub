// Shared, reporting-only session classification used by every admin analytics
// report. Headline numbers count ONLY sessions whose confidence is
// high_confidence_human or likely_human. Everything else stays in the raw rows
// and is reported as a diagnostic exclusion — nothing is deleted.

import {
  classifySession,
  emptyConfidenceCounts,
  isInfrastructureOrganization,
  type ConfidenceCounts,
  type TrafficConfidence,
} from "./traffic-confidence";

export type SessionEventRow = {
  event_name: string | null;
  occurred_at: string;
  visitor_id: string | null;
  session_id: string | null;
  device_type?: string | null;
  source_group?: string | null;
  referrer_host?: string | null;
  user_agent?: string | null;
  is_internal?: boolean | null;
  as_organization?: string | null;
};

export type SessionAgg = {
  id: string;
  visitorId: string | null;
  source: string;
  device: string;
  pageviews: number;
  events: number;
  engaged: boolean;
  accessedPdf: boolean;
  downloaded: boolean;
  firstAt: number;
  lastAt: number;
  heartbeats: number;
  impressions: number;
  humanSignal: boolean;
  meaningfulIntent: boolean;
  internalTestTraffic: boolean;
  markedInternal: boolean;
  asOrganization: string | null;
};

// Events that only a person can realistically produce.
export const MEANINGFUL_INTENT = new Set([
  "download",
  "download_served",
  "pdf_open",
  "publication_click",
  "filter_change",
  "search",
  "share_click",
  "signup",
  "human_signal",
  // recommendation_view is intentionally absent: it is a render-time impression.
  "chooser_select",
  "recommendation_click",
  "my_table_add",
  "my_table_remove",
  "my_table_open",
]);

// One-time cleanup for a known automated traffic spike on 2026-09-18.
const KNOWN_INCIDENT_START = Date.parse("2026-09-18T00:30:00.000Z");
const KNOWN_INCIDENT_END = Date.parse("2026-09-18T01:15:00.000Z");

/** Builds per-session stats from raw canonical rows. No filtering happens here. */
export function buildSessions(rows: SessionEventRow[]): Map<string, SessionAgg> {
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
        events: 0,
        engaged: false,
        accessedPdf: false,
        downloaded: false,
        firstAt: time,
        lastAt: time,
        heartbeats: 0,
        impressions: 0,
        humanSignal: false,
        meaningfulIntent: false,
        internalTestTraffic: false,
        markedInternal: false,
        asOrganization: null,
      };
      sessions.set(sid, session);
    }

    session.events += 1;
    if (!session.visitorId && vid) session.visitorId = vid;
    if (session.source === "Direct" && row.source_group?.trim()) session.source = row.source_group.trim();
    if (session.device === "unknown" && row.device_type?.trim()) session.device = row.device_type.trim();
    if (!session.asOrganization && row.as_organization?.trim()) session.asOrganization = row.as_organization.trim();

    // Server-verified internal/test device marker (signed HttpOnly cookie).
    if (row.is_internal === true) {
      session.internalTestTraffic = true;
      session.markedInternal = true;
    }
    // Lovable editor/preview traffic is internal testing, not public readership.
    const referrerHost = row.referrer_host?.trim().toLowerCase() ?? "";
    const userAgent = row.user_agent?.toLowerCase() ?? "";
    if (
      referrerHost === "lovable.dev" ||
      referrerHost.endsWith(".lovable.dev") ||
      referrerHost === "lovable.app" ||
      referrerHost.endsWith(".lovable.app") ||
      userAgent.includes("lovableapp/")
    ) {
      session.internalTestTraffic = true;
    }

    if (time) {
      if (!session.firstAt || time < session.firstAt) session.firstAt = time;
      if (time > session.lastAt) session.lastAt = time;
    }

    const name = row.event_name ?? "";
    if (name === "page_view") session.pageviews += 1;
    if (name === "heartbeat") session.heartbeats += 1;
    if (name === "publication_impression") session.impressions += 1;
    if (name === "human_signal") session.humanSignal = true;
    if (MEANINGFUL_INTENT.has(name)) {
      session.meaningfulIntent = true;
      session.engaged = true;
    }
    if (name === "pdf_open" || name === "download" || name === "download_served") session.accessedPdf = true;
    if (name === "download" || name === "download_served") session.downloaded = true;
  }

  return sessions;
}

/**
 * Burst / impossible-cadence automation. Sessions with real intent or an
 * explicit human_signal are never classified as automated.
 */
export function classifyAutomation(sessions: SessionAgg[]): Set<string> {
  const automated = new Set<string>();
  const oneHitCandidates: SessionAgg[] = [];

  for (const session of sessions) {
    if (session.meaningfulIntent || session.humanSignal) continue;
    if (!(session.source === "Direct" && session.device === "desktop")) continue;
    const durationMs = Math.max(0, session.lastAt - session.firstAt);
    if (durationMs <= 60_000 && session.heartbeats >= 10) {
      automated.add(session.id);
      continue;
    }
    if (durationMs <= 2_000 && session.pageviews <= 1) oneHitCandidates.push(session);
  }

  const buckets = new Map<number, SessionAgg[]>();
  for (const session of oneHitCandidates) {
    const bucket = Math.floor(session.firstAt / 10_000);
    const list = buckets.get(bucket) ?? [];
    list.push(session);
    buckets.set(bucket, list);
  }
  for (const list of buckets.values()) {
    if (list.length < 8) continue;
    for (const session of list) automated.add(session.id);
  }
  return automated;
}

/** Narrow one-time cleanup for the 2026-09-18 incident window. */
export function classifyKnownIncident(sessions: SessionAgg[]): Set<string> {
  const automated = new Set<string>();
  for (const session of sessions) {
    if (session.firstAt < KNOWN_INCIDENT_START || session.firstAt >= KNOWN_INCIDENT_END) continue;
    if (session.source !== "Direct" || session.device !== "desktop") continue;
    if (session.meaningfulIntent || session.humanSignal) continue;
    if (session.pageviews > 1 || session.impressions !== 0 || session.heartbeats > 1) continue;
    automated.add(session.id);
  }
  return automated;
}

export const HEADLINE_CONFIDENCE: ReadonlySet<TrafficConfidence> = new Set([
  "high_confidence_human",
  "likely_human",
]);

export function isHeadlineConfidence(label: TrafficConfidence): boolean {
  return HEADLINE_CONFIDENCE.has(label);
}

export type SessionClassification = {
  sessions: Map<string, SessionAgg>;
  confidence: Map<string, TrafficConfidence>;
  counts: ConfidenceCounts;
  /** Sessions counted in headline metrics. */
  humanIds: Set<string>;
  /** Sessions matched by an explicit automation rule (burst/incident), before intent protection. */
  ruleFlagged: Set<string>;
};

/** Classifies every session with the shared traffic-confidence classifier. */
export function classifySessions(rows: SessionEventRow[]): SessionClassification {
  const sessions = buildSessions(rows);
  const list = [...sessions.values()];
  const ruleFlagged = new Set([...classifyAutomation(list), ...classifyKnownIncident(list)]);
  const confidence = new Map<string, TrafficConfidence>();
  const counts = emptyConfidenceCounts();
  const humanIds = new Set<string>();

  for (const session of list) {
    const label = classifySession({
      internal: session.internalTestTraffic,
      flaggedAutomation: ruleFlagged.has(session.id),
      infrastructureNetwork: isInfrastructureOrganization(session.asOrganization),
      humanSignal: session.humanSignal,
      meaningfulIntent: session.meaningfulIntent,
      pageviews: session.pageviews,
      impressions: session.impressions,
      durationMs: Math.max(0, session.lastAt - session.firstAt),
    });
    confidence.set(session.id, label);
    counts[label] += 1;
    if (isHeadlineConfidence(label)) humanIds.add(session.id);
  }

  return { sessions, confidence, counts, humanIds, ruleFlagged };
}
