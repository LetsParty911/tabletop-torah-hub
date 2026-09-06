import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireDashboardAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  const cloud = createClient(cloudUrl, cloudKey, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data: userData, error } = await cloud.auth.getUser(accessToken);
  if (error || !userData?.user) throw new Error("Not authenticated");
  const email = (userData.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
}

type SessionState = {
  visitorId: string | null;
  firstAt: number;
  lastAt: number;
  pageViews: number;
  sawPublication: boolean;
  clicked: boolean;
  accessed: boolean;
  downloaded: boolean;
  positiveAction: boolean;
  heartbeat: boolean;
};

export const adminPhase1SessionFunnel = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number }) => z.object({ accessToken: z.string().min(10), days: z.number().int().positive().max(365).optional() }).parse(input))
  .handler(async ({ data }) => {
    await requireDashboardAdmin(data.accessToken);
    const days = data.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const admin = getSupabaseAdmin();
    const sessionMap = new Map<string, SessionState>();
    const visitorSessions = new Map<string, Set<string>>();
    const pageSize = 1000;

    for (let offset = 0; offset < 60000; offset += pageSize) {
      const { data: page, error } = await admin.from("analytics_events")
        .select("event_name, session_id, visitor_id, occurred_at")
        .gte("occurred_at", since).order("occurred_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = (page ?? []) as Array<{ event_name: string | null; session_id: string | null; visitor_id: string | null; occurred_at: string | null }>;
      for (const row of rows) {
        const sid = row.session_id?.trim();
        if (!sid) continue;
        const vid = row.visitor_id?.trim() || null;
        const at = row.occurred_at ? new Date(row.occurred_at).getTime() : Date.now();
        const state = sessionMap.get(sid) ?? { visitorId: vid, firstAt: at, lastAt: at, pageViews: 0, sawPublication: false, clicked: false, accessed: false, downloaded: false, positiveAction: false, heartbeat: false };
        state.firstAt = Math.min(state.firstAt, at); state.lastAt = Math.max(state.lastAt, at); if (!state.visitorId) state.visitorId = vid;
        if (row.event_name === "page_view") state.pageViews += 1;
        if (row.event_name === "publication_impression") state.sawPublication = true;
        if (row.event_name === "publication_click") { state.clicked = true; state.positiveAction = true; }
        if (row.event_name === "pdf_open" || row.event_name === "download") { state.accessed = true; state.positiveAction = true; }
        if (row.event_name === "download") state.downloaded = true;
        if (["filter_change", "search", "share_click", "signup"].includes(row.event_name ?? "")) state.positiveAction = true;
        if (row.event_name === "heartbeat") state.heartbeat = true;
        sessionMap.set(sid, state);
        if (vid) { const set = visitorSessions.get(vid) ?? new Set<string>(); set.add(sid); visitorSessions.set(vid, set); }
      }
      if (rows.length < pageSize) break;
    }

    const states = [...sessionMap.values()];
    const engaged = states.filter((s) => s.positiveAction || s.heartbeat || s.pageViews >= 2 || s.lastAt - s.firstAt >= 10000);
    const lowConfidence = states.filter((s) => !s.positiveAction && !s.heartbeat && s.pageViews <= 1 && s.lastAt - s.firstAt < 10000);
    const engagedVisitors = new Set(engaged.map((s) => s.visitorId).filter((v): v is string => Boolean(v)));
    let returningVisitors = 0;
    for (const ids of visitorSessions.values()) if (ids.size >= 2) returningVisitors += 1;

    return { days, funnel: {
      sessions: states.length,
      returningVisitors,
      impressions: states.filter((s) => s.sawPublication).length,
      clicks: states.filter((s) => s.clicked).length,
      accesses: states.filter((s) => s.accessed).length,
      downloads: states.filter((s) => s.downloaded).length,
      engagedSessions: engaged.length,
      engagedVisitors: engagedVisitors.size,
      lowConfidenceSessions: lowConfidence.length,
    }};
  });
