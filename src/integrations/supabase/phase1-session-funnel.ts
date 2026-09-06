import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireDashboardAdmin(accessToken: string) {
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

/**
 * Session-based stage counts for the Phase 1 path-to-download funnel.
 * Every stage counts sessions, not publication events, so stage percentages
 * are directly comparable and cannot exceed 100% because one visitor saw
 * multiple publication cards in the same session.
 *
 * Returning visitors are also session-derived: a visitor is returning when
 * the same visitor_id has at least two distinct sessions in the selected
 * reporting window. This matches the Phase 2 returning-visitor definition.
 */
export const adminPhase1SessionFunnel = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number }) =>
    z
      .object({
        accessToken: z.string().min(10),
        days: z.number().int().positive().max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireDashboardAdmin(data.accessToken);

    const days = data.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const admin = getSupabaseAdmin();

    const sessions = new Set<string>();
    const impressions = new Set<string>();
    const clicks = new Set<string>();
    const accesses = new Set<string>();
    const downloads = new Set<string>();
    const visitorSessions = new Map<string, Set<string>>();

    const pageSize = 1000;
    for (let offset = 0; offset < 60000; offset += pageSize) {
      const { data: page, error } = await admin
        .from("analytics_events")
        .select("event_name, session_id, visitor_id")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw new Error(error.message);

      const rows = (page ?? []) as Array<{
        event_name: string | null;
        session_id: string | null;
        visitor_id: string | null;
      }>;

      for (const row of rows) {
        const sessionId = row.session_id?.trim();
        if (!sessionId) continue;
        sessions.add(sessionId);

        const visitorId = row.visitor_id?.trim();
        if (visitorId) {
          const set = visitorSessions.get(visitorId) ?? new Set<string>();
          set.add(sessionId);
          visitorSessions.set(visitorId, set);
        }

        if (row.event_name === "publication_impression") impressions.add(sessionId);
        if (row.event_name === "publication_click") clicks.add(sessionId);
        if (row.event_name === "pdf_open" || row.event_name === "download") {
          accesses.add(sessionId);
        }
        if (row.event_name === "download") downloads.add(sessionId);
      }

      if (rows.length < pageSize) break;
    }

    let returningVisitors = 0;
    for (const sessionIds of visitorSessions.values()) {
      if (sessionIds.size >= 2) returningVisitors += 1;
    }

    return {
      days,
      funnel: {
        sessions: sessions.size,
        returningVisitors,
        impressions: impressions.size,
        clicks: clicks.size,
        accesses: accesses.size,
        downloads: downloads.size,
      },
    };
  });
