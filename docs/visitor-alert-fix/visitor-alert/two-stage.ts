// STAGED — NOT DEPLOYED. Dependency-free core for the two-stage visitor alerts.
//   Stage "unconfirmed": one push per session at the first recorded page load
//     (source: existing visitor_alert_queue). Replaces the "New visitor" wording.
//   Stage "engaged": at most one follow-up push per session when it first takes a
//     deliberate action under the dashboard's MEANINGFUL_INTENT definition
//     (source: engaged_visitor_alert_queue).
// Idempotency is durable: every send first claims (session_id, stage) in the
// database ledger `visitor_notification_log` (see ../migration-two-stage.sql).
// No Deno/global access; tests inject fetch and the ledger, never the network.

/** Must equal MEANINGFUL_INTENT in src/lib/human-sessions.ts (enforced by tests). */
export const ENGAGED_EVENTS = [
  "download",
  "publication_click",
  "filter_change",
  "search",
  "share_click",
  "signup",
  "print_click",
  "chooser_select",
  "recommendation_click",
  "my_table_add",
  "my_table_remove",
  "my_table_open",
] as const;

export type Stage = "unconfirmed" | "engaged";
export const STAGE_TABLE: Record<Stage, string> = {
  unconfirmed: "visitor_alert_queue",
  engaged: "engaged_visitor_alert_queue",
};

type Rec = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Copy of src/lib/source-group.ts normalizeSourceGroup (parity enforced by tests). */
export function sourceGroup(r: Rec): string {
  const host = (s(r.referrer_host) ?? "").toLowerCase();
  const src = (s(r.utm_source) ?? "").toLowerCase();
  const med = (s(r.utm_medium) ?? "").toLowerCase();
  const hasCampaign = Boolean(s(r.utm_source) || s(r.utm_medium) || s(r.utm_campaign));
  const any = [host, src, med].join(" ");
  if (src === "shul" && med === "poster") return "Shul Poster";
  if (/whatsapp|wa\.me|chat\.whatsapp/.test(any)) return "WhatsApp";
  if (/(^|\W)(email|newsletter|mail)(\W|$)/.test(" " + med + " ") || /email|newsletter|sender|resend|mailchimp/.test(src))
    return "Email";
  if (/^mail\.|webmail|outlook|mail\.google/.test(host)) return "Email";
  if (/(^|\.)google\./.test(host) || src === "google") return "Google";
  if (!host && !hasCampaign) return "Direct";
  if (hasCampaign) return "Other Campaign";
  return "Other Referral";
}

/** A tagged Open PDF click or a user-initiated download is a PDF open; nothing passive is. */
export function isPdfOpenAction(r: Rec): boolean {
  const ev = s(r.trigger_event_name);
  return ev === "download" || (ev === "publication_click" && s(r.trigger_action) === "open_pdf");
}

const REASON: Record<string, string> = {
  download: "Downloaded a PDF",
  publication_click: "Selected a publication",
  filter_change: "Changed a filter",
  search: "Searched",
  share_click: "Clicked share",
  signup: "Signed up",
  print_click: "Clicked print",
  chooser_select: "Used the chooser",
  recommendation_click: "Clicked a recommendation",
  my_table_add: "Added to My Table",
  my_table_remove: "Removed from My Table",
  my_table_open: "Opened My Table",
};

/** Short non-sensitive reference shared by both alerts (prefix of the random session UUID). */
export const visitRef = (sessionId: string) => sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);

function easternTime(iso: unknown): string | null {
  const v = s(iso);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

function sourceLine(r: Rec): string {
  const group = sourceGroup(r);
  const camp = s(r.utm_campaign);
  return `Source: ${group}${camp ? ` (campaign: ${camp})` : ""}`;
}

const loc = (r: Rec) => [s(r.city), s(r.region), s(r.country)].filter(Boolean).join(", ") || "Location unknown";

export function buildMessage(stage: Stage, r: Rec): { title: string; message: string } {
  const sid = String(r.session_id);
  if (stage === "unconfirmed") {
    const kind = r.is_new_visitor === true ? "New" : r.is_new_visitor === false ? "Returning" : "New";
    const lines = [
      `${loc(r)}${s(r.device_type) ? ` · ${s(r.device_type)}` : ""}`,
      sourceLine(r),
      s(r.path) ? `Landing page: ${s(r.path)}` : null,
      easternTime(r.occurred_at),
      `Visit ref: ${visitRef(sid)}`,
      "Unconfirmed = page loaded, no interaction yet. Not automated, blocked or rejected.",
    ].filter(Boolean);
    return { title: `${kind} Unconfirmed Visit`, message: lines.join("\n") };
  }
  const pdf = isPdfOpenAction(r);
  const ev = String(r.trigger_event_name);
  const action = pdf && ev === "publication_click" ? "Opened a PDF" : REASON[ev] ?? ev;
  const pub = s(r.publication_title);
  const lines = [
    `${action}${pub ? `: “${pub}”` : ""}`,
    `${loc(r)}${s(r.device_type) ? ` · ${s(r.device_type)}` : ""}`,
    sourceLine(r),
    easternTime(r.occurred_at),
    `Visit ref: ${visitRef(sid)} (same visit as the earlier alert)`,
  ].filter(Boolean);
  return { title: pdf ? "Engaged Reader" : `Confirmed Engagement — ${action}`, message: lines.join("\n") };
}

/** Durable ledger. Production: SQL RPC claim/finish on visitor_notification_log. */
export interface NotificationLedger {
  /** Atomically claim (session, stage). True only for the single winner; failed claims are re-claimable. */
  claim(sessionId: string, stage: Stage): Promise<boolean>;
  finish(sessionId: string, stage: Stage, status: "sent" | "failed" | "dry_run", detail?: string): Promise<void>;
}

export type ResultCode =
  | "sent" | "dry_run" | "duplicate" | "not_configured" | "unauthorized"
  | "bad_payload" | "wrong_table" | "not_engaged" | "internal" | "push_failed";
export type Result = { status: number; code: ResultCode; stage?: Stage; detail?: string; title?: string; message?: string };

export type Env = { webhookSecret?: string; pushoverToken?: string; pushoverUser?: string; dryRun?: boolean };

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

const LOVABLE_HOST = /(^|\.)(lovable\.app|lovable\.dev|lovableproject\.com)$/i;

export async function handleTwoStage(
  headers: { get(name: string): string | null },
  body: unknown,
  env: Env,
  ledger: NotificationLedger,
  fetchImpl: typeof fetch,
): Promise<Result> {
  if (!env.webhookSecret) return { status: 503, code: "not_configured", detail: "webhook secret missing" };
  if (!safeEqual(headers.get("x-webhook-secret") ?? "", env.webhookSecret)) return { status: 401, code: "unauthorized" };

  const p = body as Rec | null;
  if (!p || typeof p !== "object" || p.type !== "INSERT" || !p.record || typeof p.record !== "object")
    return { status: 400, code: "bad_payload" };
  const stage = (Object.keys(STAGE_TABLE) as Stage[]).find((k) => STAGE_TABLE[k] === p.table);
  if (!stage) return { status: 422, code: "wrong_table", detail: String(p.table) };

  const r = p.record as Rec;
  const sid = s(r.session_id);
  if (!sid) return { status: 422, code: "bad_payload", stage, detail: "missing session" };
  if (stage === "engaged") {
    const ev = s(r.trigger_event_name);
    if (!ev || !(ENGAGED_EVENTS as readonly string[]).includes(ev)) return { status: 422, code: "not_engaged", stage };
  }
  if (r.is_internal === true || LOVABLE_HOST.test(s(r.referrer_host) ?? "") || /lovable/i.test(s(r.user_agent) ?? ""))
    return { status: 200, code: "internal", stage };

  const msg = buildMessage(stage, r);
  const dry = env.dryRun || headers.get("x-dry-run") === "1";
  if (!dry && (!env.pushoverToken || !env.pushoverUser))
    return { status: 503, code: "not_configured", stage, detail: "pushover creds missing" };

  // Durable idempotency: one winner per (session, stage) across retries, replays and concurrent calls.
  if (!(await ledger.claim(sid, stage))) return { status: 200, code: "duplicate", stage };

  if (dry) {
    await ledger.finish(sid, stage, "dry_run");
    return { status: 200, code: "dry_run", stage, ...msg };
  }
  try {
    const res = await fetchImpl("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: env.pushoverToken!, user: env.pushoverUser!, title: msg.title, message: msg.message }),
    });
    if (!res.ok) {
      await ledger.finish(sid, stage, "failed", `pushover ${res.status}`);
      return { status: 502, code: "push_failed", stage, detail: `pushover ${res.status}` };
    }
    await ledger.finish(sid, stage, "sent");
    return { status: 200, code: "sent", stage, title: msg.title };
  } catch {
    await ledger.finish(sid, stage, "failed", "network error");
    return { status: 502, code: "push_failed", stage, detail: "network error" };
  }
}
