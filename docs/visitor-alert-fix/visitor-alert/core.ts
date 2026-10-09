// STAGED — NOT DEPLOYED. Pure, dependency-free core for the replacement
// `visitor-alert` Edge Function. No Deno/global access here so it can be
// unit-tested with a mock fetch and never touches the network in tests.
//
// Keep ENGAGED_ALERT_EVENTS identical to src/lib/visitor-alert-classifier.ts
// and to the SQL allowlist in ../migration.sql (enforced by tests).

import { ENGAGED_ALERT_EVENTS, isDeliberateAlertAction, qualifiesForEngagedAlert, type AlertSessionRow } from "../../../src/lib/visitor-alert-classifier";
export { ENGAGED_ALERT_EVENTS };

export type SessionLoader = (sessionId: string) => Promise<AlertSessionRow[] | null>;

export const EXPECTED_TABLE = "engaged_visitor_alert_queue";

const REASON: Record<string, string> = {
  publication_click: "clicked Open PDF",
  filter_change: "changed a filter",
  download: "requested a download",
  share_click: "clicked share",
  signup: "signed up",
  chooser_select: "used the chooser",
  recommendation_click: "clicked a recommendation",
  my_table_add: "added to My Table",
  my_table_open: "opened My Table",
  my_table_remove: "removed from My Table",
};

export type AlertResultCode =
  | "sent"
  | "dry_run"
  | "not_configured"
  | "unauthorized"
  | "bad_payload"
  | "wrong_table"
  | "not_engaged"
  | "unverified"
  | "internal"
  | "push_failed";

export type AlertResult = { status: number; code: AlertResultCode; detail?: string; message?: string };

export type AlertEnv = {
  webhookSecret?: string;
  pushoverToken?: string;
  pushoverUser?: string;
  dryRun?: boolean;
};

type Rec = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function buildMessage(r: Rec): { title: string; message: string } {
  const ev = String(r.trigger_event_name);
  const parts = [`Visitor engaged: ${REASON[ev] ?? ev}`];
  const pub = s(r.publication_title);
  if (pub) parts.push(`“${pub}”`);
  const loc = [s(r.city), s(r.region), s(r.country)].filter(Boolean).join(", ");
  const meta = [
    r.is_new_visitor === true ? "first visit on this browser" : r.is_new_visitor === false ? "returning browser" : null,
    s(r.device_type),
    loc ? `approx. ${loc}` : null,
    s(r.path),
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join(" · "));
  parts.push("Evidence-based engagement, not proof of a human.");
  return { title: "Torah For The Table — Engaged visitor", message: parts.join("\n") };
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function handleAlert(
  headers: { get(name: string): string | null },
  body: unknown,
  env: AlertEnv,
  fetchImpl: typeof fetch,
  loadSession?: SessionLoader,
): Promise<AlertResult> {
  if (!env.webhookSecret) return { status: 503, code: "not_configured", detail: "webhook secret missing" };
  const got = headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(got, env.webhookSecret)) return { status: 401, code: "unauthorized" };

  const p = body as Rec | null;
  if (!p || typeof p !== "object" || p.type !== "INSERT" || !p.record || typeof p.record !== "object")
    return { status: 400, code: "bad_payload" };
  if (p.table !== EXPECTED_TABLE) return { status: 422, code: "wrong_table", detail: String(p.table) };

  const r = p.record as Rec;
  const ev = s(r.trigger_event_name);
  if (!ev || !(ENGAGED_ALERT_EVENTS as readonly string[]).includes(ev) || !s(r.session_id))
    return { status: 422, code: "not_engaged" };
  if (r.is_internal === true) return { status: 200, code: "internal" };

  const candidate = {
    event_name: ev!, session_id: s(r.session_id), event_id: s(r.trigger_event_id),
    metadata: r.trigger_metadata as Record<string, unknown> | null,
  };
  if (!isDeliberateAlertAction(candidate)) return { status: 422, code: "not_engaged" };
  // Fail closed on absent/incomplete evidence or lookup failure. Never trust a
  // confidence label or session snapshot supplied by the webhook caller.
  let rows: AlertSessionRow[] | null;
  try { rows = loadSession ? await loadSession(candidate.session_id!) : null; }
  catch { return { status: 503, code: "unverified" }; }
  if (!rows || !candidate.event_id || !rows.some((row) =>
    row.event_id === candidate.event_id && row.session_id?.trim() === candidate.session_id &&
    row.event_name === candidate.event_name && isDeliberateAlertAction(row)) ||
    !qualifiesForEngagedAlert(candidate, rows)) return { status: 200, code: "unverified" };

  const msg = buildMessage(r);
  const dry = env.dryRun || r.dry_run === true || headers.get("x-dry-run") === "1";
  if (dry) return { status: 200, code: "dry_run", message: msg.message };

  if (!env.pushoverToken || !env.pushoverUser) return { status: 503, code: "not_configured", detail: "pushover creds missing" };
  try {
    const res = await fetchImpl("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: env.pushoverToken, user: env.pushoverUser, title: msg.title, message: msg.message }),
    });
    if (!res.ok) return { status: 502, code: "push_failed", detail: `pushover ${res.status}` };
    return { status: 200, code: "sent" };
  } catch {
    return { status: 502, code: "push_failed", detail: "network error" };
  }
}
