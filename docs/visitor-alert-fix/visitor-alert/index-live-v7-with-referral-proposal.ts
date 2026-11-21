import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CLUSTER_KEY, isAutomationCluster, mayBeAutomationCluster } from "./cluster.ts";
import { isAutomatedEmailScannerSession } from "./scanner.ts";
import { getEngagedReferralLines } from "./referral-attribution.ts";

/**
 * Suppress Pushover notifications only for the verified email-link scanner pattern.
 * Raw analytics and queued events stay untouched for auditing.
 * Fail open on lookup errors, so normal readers do not lose notifications.
 */
async function isAutomatedEngagedAlert(record: Record<string, unknown>): Promise<boolean> {
  if (typeof record.session_id !== "string" || !record.session_id.trim()) return false;
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return false;
  try {
    const params = new URLSearchParams({
      select: "referrer_host,asn,utm_source,utm_medium,utm_campaign",
      session_id: `eq.${record.session_id}`,
      event_name: "eq.session_start",
      limit: "1",
    });
    const response = await fetch(`${base}/rest/v1/analytics_events?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      console.warn("Email-scanner alert check unavailable, HTTP", response.status);
      return false;
    }
    const rows = await response.json();
    return Array.isArray(rows) && isAutomatedEmailScannerSession(rows[0] ?? null);
  } catch {
    console.warn("Email-scanner alert check failed");
    return false;
  }
}

/** Only first-load alerts from the proven cluster are daily-grouped. */
async function groupClusterAlert(record: Record<string, unknown>): Promise<"ordinary" | "first" | "repeat"> {
  if (!mayBeAutomationCluster(record)) return "ordinary";
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return "ordinary"; // Fail open: preserve alerts if environment is unavailable.
  try {
    const sid = String(record.session_id);
    const params = new URLSearchParams({ select: "ip_address,user_agent,accept_language,referrer_host,utm_source,utm_medium,utm_campaign,sec_ch_ua,sec_ch_platform,sec_ch_mobile", session_id: `eq.${sid}`, event_name: "eq.page_view", limit: "1" });
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${base}/rest/v1/analytics_events?${params}`, { headers });
    if (!response.ok) return "ordinary";
    const rows = await response.json();
    if (!Array.isArray(rows) || !isAutomationCluster(record, rows[0] ?? null)) return "ordinary";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const dayEt = `${part("year")}-${part("month")}-${part("day")}`;
    const claim = await fetch(`${base}/rest/v1/rpc/claim_visitor_alert_cluster_day`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_cluster_key: CLUSTER_KEY, p_day: dayEt, p_session_id: sid }),
    });
    if (!claim.ok) return "ordinary";
    return (await claim.json()) === true ? "first" : "repeat";
  } catch {
    return "ordinary";
  }
}


Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const pushoverUser = Deno.env.get("PUSHOVER_USER_KEY");
  const pushoverToken = Deno.env.get("PUSHOVER_APP_TOKEN");

  if (!pushoverUser || !pushoverToken) {
    return new Response("Pushover secrets missing", { status: 500 });
  }

  const body = await req.json();
  const event = body?.record ?? body;
  if (!event || typeof event !== "object") return new Response("Invalid event", { status: 400 });

  // First meaningful activity in each external session is already deduplicated
  // by engaged_visitor_alert_queue(session_id). Do not notify on page views.
  if (body?.table === "engaged_visitor_alert_queue") {
    if (event.is_internal === true) {
      return new Response(JSON.stringify({ status: "internal-suppressed" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (await isAutomatedEngagedAlert(event)) {
      console.log("Engaged alert suppressed: known automated email-scanner cluster");
      return new Response(JSON.stringify({ status: "email-scanner-suppressed", delivered: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const actions: Record<string, string> = {
      publication_click: "Publication opened",
      download: "Publication downloaded",
      share_click: "Publication shared",
      signup: "Signup event",
      chooser_select: "Publication selected",
      recommendation_click: "Recommendation opened",
      search: "Site search",
      filter_change: "Content filter used",
      my_table_add: "Reading item saved",
      my_table_open: "Reading list opened",
      my_table_remove: "Reading item removed",
      manual_test: "Delivery test",
    };
    const type = String(event.trigger_event_name ?? "");
    const action = actions[type];
    if (!action) {
      return new Response(JSON.stringify({ status: "unknown-event-suppressed" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const safe = (value: unknown) => String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 160);
    const isTest = type === "manual_test";
    const referralLines = isTest ? [] : await getEngagedReferralLines(
      event.session_id,
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const location = [event.city, event.region, event.country].filter(Boolean).map(safe).join(", ") || "Location unavailable";
    const lines = isTest ? [
      "Test successful if this message arrives.",
      "Meaningful reader alerts are connected.",
      "Ordinary page-load alerts remain disabled.",
    ] : [
      action + (event.publication_title ? ": " + safe(event.publication_title) : ""),
      location + " (approximate network location)",
      event.is_new_visitor === true ? "New browser ID (unverified)" : "Returning/unknown browser ID (unverified)",
      ...referralLines,
      event.path ? "Page: " + safe(event.path) : "",
      event.occurred_at ? safe(event.occurred_at) : "",
    ].filter(Boolean);
    const form = new URLSearchParams();
    form.set("token", pushoverToken);
    form.set("user", pushoverUser);
    form.set("title", isTest ? "Torah For The Table - Push Test" : "Torah For The Table - Reader Activity");
    form.set("message", lines.join("\n"));
    form.set("priority", "0");
    form.set("sound", "pushover");
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const result = await response.text();
    if (!response.ok) console.error("Engaged alert delivery failed with HTTP", response.status);
    else console.log("Engaged alert submitted to Pushover, HTTP", response.status);
    return new Response(result, { status: response.status, headers: { "Content-Type": "application/json" } });
  }

  const cluster = await groupClusterAlert(event);
  if (cluster === "repeat") return new Response(JSON.stringify({ status: "grouped", delivered: false }), { status: 200, headers: { "Content-Type": "application/json" } });

  const city = event.city || "Unknown city";
  const region = event.region ? `, ${event.region}` : "";
  const country = event.country || "Unknown country";
  const visitorType = event.is_new_visitor ? "New browser ID (unverified)" : "Returning browser ID (unverified)";
  const device = event.device_type || "Unknown device";
  const source = event.source_group || "Direct / Unknown";
  const page = event.path || "/";
  const time = event.occurred_at || new Date().toISOString();

  const message =
    (cluster === "first" ? "Possible automated Cloudflare/Chrome 119 traffic cluster. One alert per Eastern day; repeated visits remain in analytics.\n" : "") +
    `${visitorType}\n` +
    `${city}${region} · ${country} — approximate network location\n` +
    `${device} · Source: ${source}\n` +
    `Page: ${page}\n` +
    `Human readership not confirmed at first page load.\n` +
    `${time}`;

  const form = new URLSearchParams();
  form.set("token", pushoverToken);
  form.set("user", pushoverUser);
  form.set("title", cluster === "first" ? "Torah For The Table — Suspected Traffic Cluster" : "Torah For The Table — Unverified Visit");
  form.set("message", message);
  form.set("priority", "0");
  form.set("sound", "pushover");

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const result = await response.text();

  return new Response(result, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});