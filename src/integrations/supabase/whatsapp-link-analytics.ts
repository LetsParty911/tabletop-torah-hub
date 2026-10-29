import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isOpenPdfClick } from "@/lib/open-pdf-clicks";

const TAG_TO_CODE = {
  passaic_clifton: "wap",
  our_side_of_main: "wam",
  czs: "waz",
  st: "st",
  last_minute: "l",
} as const;

const LINK_LABELS = [
  { code: "wap", label: "Passaic / Clifton", tag: "passaic_clifton" },
  { code: "wam", label: "Our Side of Main", tag: "our_side_of_main" },
  { code: "waz", label: "CZS", tag: "czs" },
  { code: "wa", label: "General WhatsApp", tag: "" },
  { code: "st", label: "WhatsApp Status", tag: "st" },
  { code: "l", label: "Last-minute WhatsApp", tag: "last_minute" },
] as const;

type LinkHit = {
  group_code: string;
  clicked_at: string;
  is_automated: boolean;
};
type TaggedEvent = {
  event_name: string | null;
  occurred_at: string;
  session_id: string | null;
  visitor_id: string | null;
  publication_id: string | null;
  utm_content: string | null;
  is_internal: boolean | null;
  metadata: Record<string, unknown> | null;
};

async function requireAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Analytics authorization is not configured");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");
  const email = (data.user.email ?? "").toLowerCase();
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw new Error("Forbidden");
}

async function paged<T>(build: (start: number, end: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let start = 0; ; start += pageSize) {
    if (start >= 50000) throw new Error("Link analytics exceeds the supported report size");
    const { data, error } = await build(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export const adminWhatsAppLinkAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; start: string; end: string }) =>
    z.object({
      accessToken: z.string().min(10),
      start: z.string().datetime(),
      end: z.string().datetime(),
    }).refine((value) => {
      const duration = Date.parse(value.end) - Date.parse(value.start);
      return duration > 0 && duration <= 92 * 86400000;
    }, "Choose a reporting range of no more than 92 days.").parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    const [hits, events] = await Promise.all([
      paged<LinkHit>(async (start, end) => await admin.from("whatsapp_group_link_hits")
        .select("group_code, clicked_at, is_automated")
        .gte("clicked_at", data.start).lt("clicked_at", data.end)
        .order("clicked_at", { ascending: true })
        .range(start, end)),
      paged<TaggedEvent>(async (start, end) => await admin.from("analytics_events")
        .select("event_name, occurred_at, session_id, visitor_id, publication_id, utm_content, is_internal, metadata")
        .eq("utm_source", "whatsapp")
        .in("utm_content", Object.keys(TAG_TO_CODE))
        .gte("occurred_at", data.start).lt("occurred_at", data.end)
        .order("occurred_at", { ascending: true })
        .range(start, end)),
    ]);

    // Only report real website sessions as people when the site's existing
    // classifier considers them qualified or likely human.
    const sessionIds = [...new Set(events.map((event) => event.session_id).filter((s): s is string => Boolean(s)))];
    const qualified = new Set<string>();
    for (let offset = 0; offset < sessionIds.length; offset += 200) {
      const batch = sessionIds.slice(offset, offset + 200);
      const { data: sessions, error } = await admin.from("analytics_sessions_classified")
        .select("session_id")
        .in("session_id", batch)
        .eq("counts_as_qualified_visitor", true);
      if (error) throw new Error(error.message);
      for (const row of sessions ?? []) {
        if (row.session_id) qualified.add(row.session_id as string);
      }
    }

    const grouped = LINK_LABELS.map(({ code, label, tag }) => {
      const linkHits = hits.filter((hit) => hit.group_code === code);
      const tagged = tag ? events.filter((event) =>
        event.utm_content === tag &&
        event.is_internal !== true &&
        Boolean(event.session_id && qualified.has(event.session_id)),
      ) : [];
      const visitEvents = tagged.filter((event) => event.event_name === "page_view" || event.event_name === "session_start");
      const sessionSet = new Set(visitEvents.map((event) => event.session_id).filter(Boolean));
      const visitors = new Set(visitEvents.map((event) => event.visitor_id).filter(Boolean));
      const last = (values: string[]) => values.length ? values.reduce((a, b) => a > b ? a : b) : null;
      return {
        code,
        label,
        tag,
        requestHits: linkHits.length,
        botOrPreviewHits: linkHits.filter((hit) => hit.is_automated).length,
        browserLikeHits: linkHits.filter((hit) => !hit.is_automated).length,
        websiteSessions: sessionSet.size,
        uniqueWebsiteVisitors: visitors.size,
        pdfOpenClicks: tagged.filter(isOpenPdfClick).length,
        pdfViewerLoads: tagged.filter((event) => event.event_name === "pdf_open").length,
        downloadActions: tagged.filter((event) => event.event_name === "download").length,
        lastRequestAt: last(linkHits.map((hit) => hit.clicked_at)),
        lastVisitAt: last(visitEvents.map((event) => event.occurred_at)),
      };
    });

    return {
      start: data.start,
      end: data.end,
      rows: grouped,
      note: "Requests are not proof of a human tap. Browser-like hits may include undetected link previews. Qualified website sessions are sourced from first-party events and existing human classification. General /wa sessions cannot be uniquely separated from other untagged WhatsApp links; /wa displays redirect requests only. Historical requests before click tracking was enabled cannot be reconstructed.",
    };
  });
