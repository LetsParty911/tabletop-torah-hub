// Server-only: queues VPN security alerts in the analytics database's private
// vpn_security_notifications table and delivers them via Pushover.
// Secrets are read from the Worker binding / process env only — never logged.
import {
  BLOCK_SUPPRESS_MS, FAILURE_SUPPRESS_MS, FailureTracker, blockDedupeKey, blockMessage,
  bucketStart, failureDedupeKey, failureMessage, type FailureCategory, type ProviderKey,
} from "./vpn-security";

export const tracker = new FailureTracker();

type Env = Record<string, unknown> | undefined;
function readSecret(env: Env, name: string): string | null {
  const v = env?.[name] ?? (typeof process === "undefined" ? undefined : process.env[name]);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
export function workerEnv(request: Request): Env {
  return (request as Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } }).runtime?.cloudflare?.env;
}

export async function sendPushover(env: Env, title: string, message: string, priority = 0): Promise<{ ok: boolean; category: string | null }> {
  const token = readSecret(env, "PUSHOVER_APP_TOKEN");
  const user = readSecret(env, "PUSHOVER_USER_KEY");
  if (!token || !user) return { ok: false, category: "not_configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, user, title: title.slice(0, 250), message: message.slice(0, 1024), priority: String(priority) }),
    });
    if (res.ok) return { ok: true, category: null };
    return { ok: false, category: res.status === 429 ? "rate_limited" : res.status >= 500 ? "upstream_error" : res.status === 400 ? "rejected_400" : "http_" + res.status };
  } catch (e) {
    return { ok: false, category: e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error" };
  } finally { clearTimeout(timer); }
}

async function db() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
  return getSupabaseAdmin();
}

/** Insert a row already claimed ('sending'); returns id or null when suppressed. */
async function claimRow(row: Record<string, unknown>): Promise<string | null> {
  const admin = await db();
  const { data, error } = await admin.from("vpn_security_notifications")
    .insert({ ...row, status: "sending", attempts: 1, last_attempt_at: new Date().toISOString() })
    .select("id").single();
  if (error) {
    if (error.code === "23505") return null; // duplicate dedupe_key: another isolate claimed it
    throw new Error("queue_insert_failed:" + (error.code ?? "unknown"));
  }
  return data.id as string;
}

async function deliver(id: string, env: Env, title: string, message: string, priority = 0) {
  const r = await sendPushover(env, title, message, priority);
  const admin = await db();
  await admin.from("vpn_security_notifications").update(r.ok
    ? { status: "sent", sent_at: new Date().toISOString(), last_error_category: null }
    : { status: "failed", last_error_category: r.category }).eq("id", id);
  return r;
}

export async function notifyBlocked(env: Env, a: {
  auditId: string | null; ip: string; location: string; detectedBy: string[]; signals: string[]; path: string;
}) {
  try {
    const now = Date.now();
    if (!tracker.shouldAlertBlock(a.ip, now)) return;
    const admin = await db();
    const since = new Date(now - BLOCK_SUPPRESS_MS).toISOString();
    const { data: recent } = await admin.from("vpn_security_notifications").select("id")
      .eq("kind", "vpn_blocked").like("dedupe_key", `vpn_blocked:${a.ip}:%`).gte("created_at", since).limit(1);
    if (recent?.length) return;
    const msg = blockMessage(a);
    const id = await claimRow({
      audit_id: a.auditId, kind: "vpn_blocked", provider: a.detectedBy.join(", ").slice(0, 200) || "unattributed",
      dedupe_key: blockDedupeKey(a.ip, now), bucket_start: bucketStart(now, BLOCK_SUPPRESS_MS),
      details: msg.message, location: a.location,
    });
    if (id) await deliver(id, env, msg.title, msg.message);
  } catch (e) {
    console.error("[vpn-notify] block alert failed", e instanceof Error ? e.message : "unknown");
  }
}

export async function recordProviderOutcome(env: Env, provider: ProviderKey, cat: FailureCategory | null, status: string) {
  const alert = tracker.record(provider, cat, Date.now());
  if (!alert) return;
  try {
    const now = Date.now();
    const admin = await db();
    const { data: recent } = await admin.from("vpn_security_notifications").select("id")
      .eq("kind", "provider_failure").like("dedupe_key", `provider_failure:${provider}:${alert}:%`)
      .gte("created_at", new Date(now - FAILURE_SUPPRESS_MS).toISOString()).limit(1);
    if (recent?.length) return;
    const msg = failureMessage(provider, alert, status);
    const id = await claimRow({
      kind: "provider_failure", provider, dedupe_key: failureDedupeKey(provider, alert, now),
      bucket_start: bucketStart(now, FAILURE_SUPPRESS_MS), details: msg.message, location: "",
    });
    if (id) await deliver(id, env, msg.title, msg.message);
  } catch (e) {
    console.error("[vpn-notify] failure alert failed", e instanceof Error ? e.message : "unknown");
  }
}

/** Admin-triggered retry of failed/stuck alerts from the last 24h (max 5 attempts). */
export async function retryFailedNotifications(env: Env) {
  const admin = await db();
  const since = new Date(Date.now() - 86400000).toISOString();
  const stuck = new Date(Date.now() - 120000).toISOString();
  const { data, error } = await admin.from("vpn_security_notifications")
    .select("id,kind,provider,details,attempts,status,last_attempt_at")
    .gte("created_at", since).lt("attempts", 5)
    .or(`status.eq.failed,and(status.eq.sending,last_attempt_at.lt.${stuck}),status.eq.queued`).limit(20);
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0;
  for (const row of data ?? []) {
    await admin.from("vpn_security_notifications").update({ status: "sending", attempts: (row.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() }).eq("id", row.id);
    const title = row.kind === "vpn_blocked" ? "TFTT — VPN/proxy blocked (retry)" : `TFTT — ${row.provider} problem (retry)`;
    const r = await deliver(row.id, env, title, row.details || "VPN security alert");
    r.ok ? sent++ : failed++;
  }
  return { attempted: (data ?? []).length, sent, failed };
}
