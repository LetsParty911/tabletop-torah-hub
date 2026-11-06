/**
 * Referral attribution for the CURRENT external Supabase visitor-alert Edge Function.
 * STAGED ONLY: this file is not imported by the live Edge Function or website.
 *
 * The engaged_visitor_alert_queue stores the first meaningful action but not its
 * attribution fields. Resolve the originating session_start row; fall back to
 * page_view only when no session_start exists. Never infer "Direct" on a lookup
 * failure and never overwrite raw analytics.
 */
export type ReferralRow = {
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  referrer_host?: unknown;
  source_group?: unknown;
};

const clean = (v: unknown): string =>
  typeof v === "string" ? v.trim().replace(/[\r\n\t]+/g, " ").slice(0, 120) : "";

const humanize = (v: string) => v.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const linkLabels: Record<string, string> = {
  passaic_clifton: "Passaic / Clifton",
  our_side_of_main: "Our Side of Main",
  czs_announcements: "CZS Announcements",
  main_button: "Main button",
  graphic: "Graphic",
  announcement: "Announcement",
};

/** Pure function: safe to test without database credentials or Pushover calls. */
export function formatReferralLines(origin: ReferralRow | null): string[] {
  if (!origin) return ["Source: Direct / Unknown"];
  const source = clean(origin.utm_source);
  const key = source.toLowerCase();
  const hostname = clean(origin.referrer_host);
  const group = clean(origin.source_group);
  const known: Record<string, string> = {
    "sender.net": "Sender.net",
    sender: "Sender.net",
    ourkehilla: "OurKehilla",
    whatsapp: "WhatsApp",
    shul: "Shul Poster",
  };
  let label = source ? (known[key] ?? source) : "";
  if (!label && hostname) {
    if (/^(www\.)?google\.[a-z.]+$/i.test(hostname)) label = "Google";
    else if (/^(www\.)?bing\.com$/i.test(hostname)) label = "Bing";
    else if (hostname === "com.google.android.gm" || hostname === "mail.google.com") label = "Gmail";
    else label = hostname; // Exact observed host; do not invent a referring campaign.
  }
  if (!label && group && group.toLowerCase() !== "direct") label = group;
  if (!label) label = "Direct / Unknown";

  const lines = ["Source: " + label];
  const campaign = clean(origin.utm_campaign);
  if (campaign) lines.push("Campaign: " + humanize(campaign));
  const link = clean(origin.utm_content);
  if (link) {
    const prefix = key === "whatsapp" ? "Group: " : "Link: ";
    lines.push(prefix + (linkLabels[link.toLowerCase()] ?? humanize(link)));
  }
  return lines;
}

/** Use from the engaged (not test or suppressed) notification branch only. */
export async function getEngagedReferralLines(
  sessionId: unknown,
  baseUrl: string | undefined,
  serviceKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  if (typeof sessionId !== "string" || !sessionId.trim()) return ["Source: Unavailable"];
  if (!baseUrl || !serviceKey) return ["Source: Unavailable"];

  async function find(event: "session_start" | "page_view"): Promise<ReferralRow | null> {
    const params = new URLSearchParams({
      select: "utm_source,utm_medium,utm_campaign,utm_content,referrer_host,source_group",
      session_id: "eq." + sessionId,
      event_name: "eq." + event,
      order: "occurred_at.asc",
      limit: "1",
    });
    const response = await fetchImpl(baseUrl + "/rest/v1/analytics_events?" + params.toString(), {
      headers: { apikey: serviceKey!, Authorization: "Bearer " + serviceKey },
    });
    if (!response.ok) throw new Error("referral lookup failed with HTTP " + response.status);
    const data: unknown = await response.json();
    return Array.isArray(data) && data[0] && typeof data[0] === "object"
      ? data[0] as ReferralRow
      : null;
  }

  try {
    return formatReferralLines((await find("session_start")) ?? (await find("page_view")));
  } catch {
    // Fail open on attribution failures; never block a legitimate alert.
    return ["Source: Unavailable"];
  }
}
