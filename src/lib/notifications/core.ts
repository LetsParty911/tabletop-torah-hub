// Generic owner-notification foundation — PURE logic (no I/O, no secrets).
// Separate from the VPN alert system (vpn_security_notifications) and from the
// existing first-load visitor alert (visitor_alert_queue + visitor-alert function),
// both of which this module never reads, writes or replaces.

export const CATEGORIES = [
  "engaged_reader",
  "campaign_engaged",
  "new_subscriber",
  "pdf_milestone",
  "whatsapp_share",
  "site_errors",
  "email_campaign",
  "thursday_publication",
  "daily_report",
  "downtime",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories implemented in this phase; the rest are documented placeholders. */
export const IMPLEMENTED: ReadonlySet<Category> = new Set(["engaged_reader", "campaign_engaged", "new_subscriber"]);

export const CATEGORY_LABEL: Record<Category, string> = {
  engaged_reader: "Engaged reader",
  campaign_engaged: "Shul Poster / OurKehilla engaged visit",
  new_subscriber: "New newsletter subscriber",
  pdf_milestone: "PDF milestone",
  whatsapp_share: "WhatsApp sharing",
  site_errors: "Website / PDF errors",
  email_campaign: "Email campaign trouble",
  thursday_publication: "Thursday publication",
  daily_report: "Daily ET report",
  downtime: "Downtime (independent monitor)",
};

export type Mode = "quiet" | "balanced" | "active";
export type Settings = {
  /** Master switch for generic sends. Default false. */
  enabled: boolean;
  /** When true, outbox rows are marked dry_run instead of calling Pushover. Default true. */
  dryRun: boolean;
  mode: Mode;
  /** Quiet hours in America/New_York, 0-23. null = none. */
  quietStart: number | null;
  quietEnd: number | null;
  categories: Record<Category, boolean>;
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  dryRun: true,
  mode: "balanced",
  quietStart: null,
  quietEnd: null,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c, false])) as Record<Category, boolean>,
};

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const hour = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : null);
  const cats = { ...DEFAULT_SETTINGS.categories };
  for (const c of CATEGORIES) if (r.categories && typeof r.categories[c] === "boolean") cats[c] = r.categories[c];
  return {
    enabled: r.enabled === true,
    dryRun: r.dryRun !== false,
    mode: r.mode === "quiet" || r.mode === "active" ? r.mode : "balanced",
    quietStart: hour(r.quietStart),
    quietEnd: hour(r.quietEnd),
    categories: cats,
  };
}

/** Quiet mode only lets the most important categories through. */
const QUIET_ALLOWED: ReadonlySet<Category> = new Set(["new_subscriber", "downtime", "site_errors", "email_campaign"]);

export function easternHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
}

export function inQuietHours(s: Settings, now: Date): boolean {
  if (s.quietStart === null || s.quietEnd === null || s.quietStart === s.quietEnd) return false;
  const h = easternHour(now);
  return s.quietStart < s.quietEnd ? h >= s.quietStart && h < s.quietEnd : h >= s.quietStart || h < s.quietEnd;
}

export type Gate = "send" | "dry_run" | "hold" | "skip";
/** Decide what to do with a claimed row. "hold" = keep pending (quiet hours); "skip" = category/master off. */
export function gate(s: Settings, category: Category, now: Date): Gate {
  if (!s.categories[category]) return "skip";
  if (s.mode === "quiet" && !QUIET_ALLOWED.has(category)) return "skip";
  if (inQuietHours(s, now)) return "hold";
  if (!s.enabled || s.dryRun) return "dry_run";
  return "send";
}

// ---------- Event keys (durable idempotency) ----------
export const engagedKey = (sessionId: string) => `engaged_reader:${sessionId}`;
export const campaignKey = (channel: Channel, sessionId: string) => `campaign_engaged:${channel}:${sessionId}`;
export const subscriberKey = (emailHash: string) => `new_subscriber:${emailHash}`;

// ---------- Campaign channels ----------
export type Channel = "shul_poster" | "ourkehilla";
/** /s → utm_source=shul&utm_medium=poster; /r → utm_source=ourkehilla. Never conflated. */
export function campaignChannel(r: { utm_source?: string | null; utm_medium?: string | null }): Channel | null {
  const src = (r.utm_source ?? "").trim().toLowerCase();
  const med = (r.utm_medium ?? "").trim().toLowerCase();
  if (src === "shul" && med === "poster") return "shul_poster";
  if (src === "ourkehilla") return "ourkehilla";
  return null;
}
export const CHANNEL_LABEL: Record<Channel, string> = { shul_poster: "Shul Poster", ourkehilla: "OurKehilla" };

// ---------- Engaged eligibility ----------
/** Mirrors MEANINGFUL_INTENT in src/lib/human-sessions.ts (parity enforced by tests). */
export const DELIBERATE_EVENTS: ReadonlySet<string> = new Set([
  "download", "publication_click", "filter_change", "search", "share_click", "signup", "print_click",
  "chooser_select", "recommendation_click", "my_table_add", "my_table_remove", "my_table_open",
]);

export type EngagedRow = {
  session_id: string | null;
  trigger_event_name: string | null;
  trigger_action?: string | null;
  is_internal?: boolean | null;
  publication_title?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  device_type?: string | null;
  occurred_at?: string | null;
};
export type Confidence = "high_confidence_human" | "likely_human" | "uncertain" | "suspected_automation" | "internal_test";

export function engagedEligible(row: EngagedRow, confidence: Confidence | null): { ok: boolean; reason: string } {
  if (!row.session_id) return { ok: false, reason: "no_session" };
  if (row.is_internal) return { ok: false, reason: "internal" };
  const ev = row.trigger_event_name ?? "";
  if (!DELIBERATE_EVENTS.has(ev)) return { ok: false, reason: "not_deliberate" };
  if (confidence === "suspected_automation" || confidence === "internal_test") return { ok: false, reason: confidence };
  return { ok: true, reason: "ok" };
}

const ACTION: Record<string, string> = {
  download: "Downloaded a PDF", publication_click: "Selected a publication", filter_change: "Changed a filter",
  search: "Searched", share_click: "Clicked share", signup: "Signed up", print_click: "Clicked print",
  chooser_select: "Used the chooser", recommendation_click: "Clicked a recommendation",
  my_table_add: "Added to My Table", my_table_remove: "Removed from My Table", my_table_open: "Opened My Table",
};
export function actionLabel(row: EngagedRow): string {
  if (row.trigger_event_name === "publication_click" && row.trigger_action === "open_pdf") return "Opened a PDF";
  return ACTION[row.trigger_event_name ?? ""] ?? String(row.trigger_event_name);
}
const loc = (r: EngagedRow) => [r.city, r.region, r.country].filter(Boolean).join(", ") || "Location unknown";
export const visitRef = (sid: string) => sid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);

export function engagedMessage(row: EngagedRow, channel: Channel | null): { title: string; message: string } {
  const pub = row.publication_title ? `: “${row.publication_title}”` : "";
  const lines = [
    `${actionLabel(row)}${pub}`,
    `${loc(row)}${row.device_type ? ` · ${row.device_type}` : ""}`,
    channel ? `Source: ${CHANNEL_LABEL[channel]}` : null,
    `Visit ref: ${visitRef(row.session_id ?? "")} (same visit as the earlier first-load alert)`,
  ].filter(Boolean);
  return {
    title: channel ? `${CHANNEL_LABEL[channel]} — Engaged Visit` : "Engaged Reader",
    message: lines.join("\n"),
  };
}

export function maskEmail(email: string): string {
  const [user = "", domain = "?"] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}
export function subscriberMessage(email: string, source: string | null): { title: string; message: string } {
  return {
    title: "New Newsletter Subscriber",
    message: [`${maskEmail(email)} joined the weekly email list.`, source ? `Signed up from: ${source}` : null]
      .filter(Boolean).join("\n"),
  };
}

// ---------- Outbox state machine ----------
export type Status = "pending" | "sending" | "sent" | "failed" | "dry_run" | "skipped" | "dead";
export const MAX_ATTEMPTS = 5;
export const LEASE_MS = 2 * 60_000;
export function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export type OutboxRow = {
  id: string;
  event_key: string;
  category: Category;
  title: string;
  message: string;
  status: Status;
  attempts: number;
  lease_until: number | null;
  next_attempt_at: number;
  last_error: string | null;
};

/** Claimable = pending/failed due now, or sending with an expired lease (crashed dispatcher). */
export function claimable(r: OutboxRow, now: number): boolean {
  if (r.attempts >= MAX_ATTEMPTS && r.status !== "pending") return false;
  if (r.status === "pending" || r.status === "failed") return r.next_attempt_at <= now;
  if (r.status === "sending") return (r.lease_until ?? 0) < now;
  return false;
}

/** In-memory store with the same semantics as the SQL claim function. Used by tests. */
export class MemoryOutbox {
  rows = new Map<string, OutboxRow>();
  private seq = 0;
  enqueue(key: string, category: Category, title: string, message: string, now: number): boolean {
    for (const r of this.rows.values()) if (r.event_key === key) return false; // UNIQUE(event_key)
    const id = String(++this.seq);
    this.rows.set(id, { id, event_key: key, category, title, message, status: "pending", attempts: 0, lease_until: null, next_attempt_at: now, last_error: null });
    return true;
  }
  /** Synchronous = atomic, like FOR UPDATE SKIP LOCKED in one statement. */
  claim(limit: number, now: number): OutboxRow[] {
    const out: OutboxRow[] = [];
    for (const r of this.rows.values()) {
      if (out.length >= limit) break;
      if (!claimable(r, now)) continue;
      r.status = "sending";
      r.attempts += 1;
      r.lease_until = now + LEASE_MS;
      out.push({ ...r });
    }
    return out;
  }
  finish(id: string, status: Status, now: number, error: string | null = null) {
    const r = this.rows.get(id);
    if (!r || r.status !== "sending") return;
    r.lease_until = null;
    r.last_error = error;
    if (status === "failed") {
      r.status = r.attempts >= MAX_ATTEMPTS ? "dead" : "failed";
      r.next_attempt_at = now + backoffMs(r.attempts);
    } else if (status === "pending") {
      r.status = "pending";
      r.attempts = Math.max(0, r.attempts - 1);
      r.next_attempt_at = now + 15 * 60_000;
    } else r.status = status;
  }
  retryFailed(now: number): number {
    let n = 0;
    for (const r of this.rows.values()) if (r.status === "failed" || r.status === "dead") {
      r.status = "pending"; r.attempts = 0; r.next_attempt_at = now; n++;
    }
    return n;
  }
}

export type SendResult = { ok: boolean; error: string | null };
/** Dispatch loop shared by the server dispatcher and tests. */
export async function dispatchBatch(
  store: { claim(limit: number, now: number): Promise<OutboxRow[]> | OutboxRow[]; finish(id: string, status: Status, now: number, error?: string | null): Promise<void> | void },
  settings: Settings,
  send: (title: string, message: string) => Promise<SendResult>,
  now: () => number,
  limit = 20,
): Promise<Record<Status, number>> {
  const tally = { pending: 0, sending: 0, sent: 0, failed: 0, dry_run: 0, skipped: 0, dead: 0 } as Record<Status, number>;
  const rows = await store.claim(limit, now());
  for (const r of rows) {
    const g = gate(settings, r.category, new Date(now()));
    if (g === "skip") { await store.finish(r.id, "skipped", now()); tally.skipped++; continue; }
    if (g === "hold") { await store.finish(r.id, "pending", now()); tally.pending++; continue; }
    if (g === "dry_run") { await store.finish(r.id, "dry_run", now()); tally.dry_run++; continue; }
    const res = await send(r.title, r.message);
    if (res.ok) { await store.finish(r.id, "sent", now()); tally.sent++; }
    else { await store.finish(r.id, "failed", now(), res.error); tally.failed++; }
  }
  return tally;
}
