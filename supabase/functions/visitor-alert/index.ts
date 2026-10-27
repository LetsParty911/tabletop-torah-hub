import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CLUSTER_KEY, isAutomationCluster, mayBeAutomationCluster } from "./cluster.ts";

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