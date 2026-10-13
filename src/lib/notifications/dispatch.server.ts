// Server-only generic notification store + dispatcher (external analytics DB).
// Independent of vpn-notify.server.ts and the first-load visitor-alert function.
// Pushover secrets are read at call time and never logged or returned.
import {
  CATEGORIES, DEFAULT_SETTINGS, LEASE_MS, campaignChannel, campaignKey, dispatchBatch, engagedEligible,
  engagedKey, engagedMessage, normalizeSettings, subscriberKey, subscriberMessage,
  type Category, type Confidence, type EngagedRow, type OutboxRow, type Settings, type Status,
} from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db(): Promise<any> {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
  return getSupabaseAdmin();
}

/** True when the Phase-A tables are missing (migration not yet applied). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotInstalled(error: any): boolean {
  const code = error?.code ?? "";
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || /does not exist|schema cache/i.test(error?.message ?? "");
}

export async function loadSettings(): Promise<{ settings: Settings; installed: boolean }> {
  const admin = await db();
  const [s, rules] = await Promise.all([
    admin.from("notification_settings").select("settings").eq("id", 1).maybeSingle(),
    admin.from("notification_rules").select("category,enabled"),
  ]);
  if (s.error || rules.error) {
    if (isNotInstalled(s.error) || isNotInstalled(rules.error)) return { settings: DEFAULT_SETTINGS, installed: false };
    throw new Error("settings_read_failed");
  }
  const raw = { ...(s.data?.settings ?? {}), categories: {} as Record<string, boolean> };
  for (const r of rules.data ?? []) raw.categories[r.category] = r.enabled === true;
  return { settings: normalizeSettings(raw), installed: true };
}

export async function saveSettings(next: Settings, by: string): Promise<void> {
  const admin = await db();
  const { categories, ...rest } = next;
  const a = await admin.from("notification_settings").upsert({ id: 1, settings: rest, updated_by: by, updated_at: new Date().toISOString() });
  if (a.error) throw new Error(isNotInstalled(a.error) ? "not_installed" : "settings_write_failed");
  const b = await admin.from("notification_rules").upsert(
    CATEGORIES.map((c) => ({ category: c, enabled: categories[c], updated_at: new Date().toISOString() })),
  );
  if (b.error) throw new Error("rules_write_failed");
}

/** Insert once per event_key. Returns false on duplicate. Throws only on real errors. */
export async function enqueue(key: string, category: Category, title: string, message: string): Promise<boolean> {
  const admin = await db();
  const { error } = await admin.from("notification_outbox").insert({ event_key: key, category, title, message });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(isNotInstalled(error) ? "not_installed" : "enqueue_failed:" + (error.code ?? "?"));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Called only after Sender.net confirmed a NEW subscriber. Never throws. */
export async function notifyNewSubscriber(email: string, source: string | null): Promise<void> {
  try {
    const hash = await sha256Hex("tftt-subscriber:" + email.trim().toLowerCase());
    const m = subscriberMessage(email, source);
    await enqueue(subscriberKey(hash), "new_subscriber", m.title, m.message);
  } catch (e) {
    console.warn("[notify] subscriber enqueue skipped", e instanceof Error ? e.message : "error");
  }
}

// ---------- Engaged ingestion from the EXISTING shadow queue ----------
const CURSOR_KEY = "engaged_ingest_cursor";

export async function ingestEngaged(limit = 100): Promise<{ scanned: number; queued: number; excluded: number }> {
  const admin = await db();
  const cur = await admin.from("notification_schedule_state").select("value").eq("key", CURSOR_KEY).maybeSingle();
  if (cur.error) throw new Error(isNotInstalled(cur.error) ? "not_installed" : "cursor_read_failed");
  // First run starts "now": never back-fill historic sessions into alerts.
  const since: string = cur.data?.value ?? new Date().toISOString();
  if (!cur.data) await admin.from("notification_schedule_state").upsert({ key: CURSOR_KEY, value: since });

  const q = await admin.from("engaged_visitor_alert_queue").select("*").gt("created_at", since)
    .order("created_at", { ascending: true }).limit(limit);
  if (q.error) throw new Error("engaged_queue_read_failed");
  const rows = (q.data ?? []) as (EngagedRow & { created_at: string; utm_source?: string | null; utm_medium?: string | null })[];
  if (!rows.length) return { scanned: 0, queued: 0, excluded: 0 };

  const sids = rows.map((r) => r.session_id).filter(Boolean) as string[];
  const ev = await admin.from("analytics_events")
    .select("event_name,occurred_at,visitor_id,session_id,device_type,source_group,referrer_host,user_agent,is_internal,as_organization,utm_source,utm_medium,metadata")
    .in("session_id", sids).order("occurred_at", { ascending: true }).limit(5000);
  if (ev.error) throw new Error("session_events_read_failed");
  const { classifySessions } = await import("@/lib/human-sessions");
  const cls = classifySessions(ev.data ?? []);
  const firstUtm = new Map<string, { utm_source: string | null; utm_medium: string | null }>();
  const openPdf = new Set<string>();
  for (const e of ev.data ?? []) {
    if (!e.session_id) continue;
    if (e.event_name === "page_view" && !firstUtm.has(e.session_id)) firstUtm.set(e.session_id, { utm_source: e.utm_source, utm_medium: e.utm_medium });
    if (e.event_name === "publication_click" && e.metadata?.action === "open_pdf") openPdf.add(e.session_id);
  }

  let queued = 0, excluded = 0;
  for (const r of rows) {
    const sid = r.session_id ?? "";
    const conf = (cls.confidence.get(sid) ?? null) as Confidence | null;
    const row: EngagedRow = { ...r, trigger_action: r.trigger_action ?? (r.trigger_event_name === "publication_click" && openPdf.has(sid) ? "open_pdf" : null) };
    if (!engagedEligible(row, conf).ok) { excluded++; continue; }
    const channel = campaignChannel(r.utm_source || r.utm_medium ? r : firstUtm.get(sid) ?? {});
    const m = engagedMessage(row, channel);
    // One alert per session: campaign sessions get the campaign variant INSTEAD of the generic one.
    const ok = channel
      ? await enqueue(campaignKey(channel, sid), "campaign_engaged", m.title, m.message)
      : await enqueue(engagedKey(sid), "engaged_reader", m.title, m.message);
    if (ok) queued++;
  }
  await admin.from("notification_schedule_state").upsert({ key: CURSOR_KEY, value: rows[rows.length - 1]!.created_at, updated_at: new Date().toISOString() });
  return { scanned: rows.length, queued, excluded };
}

// ---------- Delivery ----------
function secret(name: string): string | null {
  const v = typeof process === "undefined" ? undefined : process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function pushover(title: string, message: string): Promise<{ ok: boolean; error: string | null }> {
  const token = secret("PUSHOVER_APP_TOKEN"), user = secret("PUSHOVER_USER_KEY");
  if (!token || !user) return { ok: false, error: "not_configured" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, user, title: ("TFTT — " + title).slice(0, 250), message: message.slice(0, 1024) }),
    });
    return res.ok ? { ok: true, error: null } : { ok: false, error: "http_" + res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error" };
  } finally { clearTimeout(t); }
}

export async function dispatchNow(): Promise<Record<Status, number>> {
  const admin = await db();
  const { settings } = await loadSettings();
  const toRow = (r: Record<string, unknown>): OutboxRow => ({
    ...(r as unknown as OutboxRow),
    lease_until: r.lease_until ? Date.parse(String(r.lease_until)) : null,
    next_attempt_at: Date.parse(String(r.next_attempt_at)),
  });
  return dispatchBatch({
    claim: async (limit) => {
      const { data, error } = await admin.rpc("claim_notifications", { p_limit: limit, p_lease_seconds: LEASE_MS / 1000 });
      if (error) throw new Error(isNotInstalled(error) ? "not_installed" : "claim_failed");
      return (data ?? []).map(toRow);
    },
    finish: async (id, status, _now, err) => {
      const { error } = await admin.rpc("finish_notification", { p_id: id, p_status: status, p_error: err ?? null });
      if (error) console.warn("[notify] finish failed", error.code ?? "");
    },
  }, settings, pushover, () => Date.now());
}

export async function retryFailed(): Promise<number> {
  const admin = await db();
  const { data, error } = await admin.rpc("retry_failed_notifications");
  if (error) throw new Error(isNotInstalled(error) ? "not_installed" : "retry_failed");
  return Number(data ?? 0);
}

export async function statusSummary() {
  const admin = await db();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [out, log] = await Promise.all([
    admin.from("notification_outbox").select("category,status").gte("created_at", since).limit(5000),
    admin.from("notification_delivery_log").select("created_at,category,outcome,detail").order("created_at", { ascending: false }).limit(25),
  ]);
  if (out.error) {
    if (isNotInstalled(out.error)) return { installed: false as const, counts: {}, recent: [] };
    throw new Error("status_read_failed");
  }
  const counts: Record<string, Record<string, number>> = {};
  for (const r of out.data ?? []) { const c = (counts[r.category] ??= {}); c[r.status] = (c[r.status] ?? 0) + 1; }
  return { installed: true as const, counts, recent: log.data ?? [] };
}
