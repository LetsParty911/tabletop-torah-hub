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

// The analytics database has an AFTER INSERT trigger on vpn_connection_checks
// that queues a 'vpn_blocked' row (deduped per hashed IP per 30-min bucket).
// This module delivers queued rows; it only inserts block rows itself when
// the audit write failed (so the trigger never fired).

async function insertQueued(row: Record<string, unknown>): Promise<void> {
  const admin = await db();
  const { error } = await admin.from("vpn_security_notifications").insert({ ...row, status: "queued", attempts: 0 });
  if (error && error.code !== "23505") throw new Error("queue_insert_failed:" + (error.code ?? "unknown"));
}

type QueueRow = { id: string; kind: string; provider: string; details: string; location: string; audit_id: string | null; attempts: number };

async function composeMessage(row: QueueRow): Promise<{ title: string; message: string }> {
  if (row.kind !== "vpn_blocked") {
    return { title: `TFTT — ${row.provider} problem`, message: row.details || `${row.provider} detection problem.` };
  }
  if (row.details.startsWith("IP: ")) return { title: "TFTT — VPN/proxy blocked", message: row.details };
  let ip = "unknown", path = "/";
  if (row.audit_id) {
    const admin = await db();
    const { data } = await admin.from("vpn_connection_checks").select("ip_address,request_path").eq("id", row.audit_id).maybeSingle();
    if (data) { ip = data.ip_address ?? "unknown"; path = data.request_path ?? "/"; }
  }
  return blockMessage({ ip, location: row.location || "Location unknown", detectedBy: row.provider ? row.provider.split(/\s*[+,]\s*/) : [], signals: row.details ? row.details.split(/\s*[+,]\s*/) : [], path });
}

/** Claim queued rows atomically (status=queued -> sending) and deliver them. */
export async function drainQueue(env: Env, limit = 5): Promise<{ sent: number; failed: number }> {
  const admin = await db();
  const { data } = await admin.from("vpn_security_notifications")
    .select("id,kind,provider,details,location,audit_id,attempts").eq("status", "queued")
    .gte("created_at", new Date(Date.now() - 86400000).toISOString()).order("created_at").limit(limit);
  let sent = 0, failed = 0;
  for (const row of (data ?? []) as QueueRow[]) {
    const { data: claimed } = await admin.from("vpn_security_notifications")
      .update({ status: "sending", attempts: (row.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue; // another isolate claimed it
    const msg = await composeMessage(row);
    const r = await deliver(row.id, env, msg.title, msg.message);
    r.ok ? sent++ : failed++;
  }
  return { sent, failed };
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
    if (!a.auditId) {
      // Audit write failed, so the database trigger never queued an alert.
      if (tracker.shouldAlertBlock(a.ip, now)) {
        const admin = await db();
        const { data: recent } = await admin.from("vpn_security_notifications").select("id")
          .eq("kind", "vpn_blocked").like("dedupe_key", `vpn_blocked:${a.ip}:%`)
          .gte("created_at", new Date(now - BLOCK_SUPPRESS_MS).toISOString()).limit(1);
        if (!recent?.length) await insertQueued({
          kind: "vpn_blocked", provider: a.detectedBy.join(" + ").slice(0, 200) || "unattributed",
          dedupe_key: blockDedupeKey(a.ip, now), bucket_start: bucketStart(now, BLOCK_SUPPRESS_MS),
          details: blockMessage(a).message, location: a.location,
        });
      }
    }
    await drainQueue(env);
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
    await insertQueued({
      kind: "provider_failure", provider, dedupe_key: failureDedupeKey(provider, alert, now),
      bucket_start: bucketStart(now, FAILURE_SUPPRESS_MS), details: msg.message, location: "",
    });
    await drainQueue(env);
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
    .select("id,kind,provider,details,location,audit_id,attempts,status,last_attempt_at")
    .gte("created_at", since).lt("attempts", 5)
    .or(`status.eq.failed,and(status.eq.sending,last_attempt_at.lt.${stuck}),status.eq.queued`).limit(20);
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0;
  for (const row of data ?? []) {
    await admin.from("vpn_security_notifications").update({ status: "sending", attempts: (row.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() }).eq("id", row.id);
    const msg = await composeMessage({ ...row, location: row.location ?? "", audit_id: row.audit_id ?? null } as QueueRow);
    const r = await deliver(row.id, env, msg.title + " (retry)", msg.message);
    r.ok ? sent++ : failed++;
  }
  return { attempted: (data ?? []).length, sent, failed };
}
