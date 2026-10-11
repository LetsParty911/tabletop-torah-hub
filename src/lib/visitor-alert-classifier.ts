import { classifySessions, type SessionEventRow } from "./human-sessions";
import { isOpenPdfClick } from "./open-pdf-clicks";

// Pure reference classifier for engagement-qualified visitor alerts.
// Mirrors the staged SQL trigger in docs/visitor-alert-fix/migration.sql.
// Not wired into the live app; used for deterministic tests and docs.

export const ENGAGED_ALERT_EVENTS = [
  "publication_click",
  "filter_change",
  "download",
  "share_click",
  "signup",
  "chooser_select",
  "recommendation_click",
  "my_table_add",
  "my_table_open",
  "my_table_remove",
] as const;

export type AlertEventRow = {
  metadata?: Record<string, unknown> | null;
  event_id?: string | null;
  event_name: string;
  session_id?: string | null;
  occurred_at?: string;
  is_internal?: boolean | null;
  referrer_host?: string | null;
  user_agent?: string | null;
  utm_source?: string | null;
};

const LOVABLE_HOST = /(^|\.)(lovable\.app|lovable\.dev|lovableproject\.com)$/i;

/** Independently detectable Lovable preview/editor/test provenance only. */
export function hasLovableProvenance(r: AlertEventRow): boolean {
  return (
    (!!r.referrer_host && LOVABLE_HOST.test(r.referrer_host.trim())) ||
    (!!r.user_agent && /lovable/i.test(r.user_agent)) ||
    (r.utm_source ?? "").toLowerCase() === "lovable"
  );
}

export type AlertSessionRow = AlertEventRow & SessionEventRow;

export function isDeliberateAlertAction(r: AlertEventRow): boolean {
  if (r.event_name === "publication_click") return isOpenPdfClick(r);
  return (ENGAGED_ALERT_EVENTS as readonly string[]).includes(r.event_name);
}

export function qualifiesForEngagedAlert(r: AlertEventRow, sessionRows: AlertSessionRow[] = []): boolean {
  if (!r.session_id) return false;
  if (r.is_internal === true) return false;
  if (hasLovableProvenance(r)) return false;
  if (!isDeliberateAlertAction(r)) return false;
  const sid = r.session_id.trim();
  const evidence = sessionRows.filter((row) => row.session_id?.trim() === sid);
  if (!evidence.length || evidence.some((row) => row.is_internal === true || hasLovableProvenance(row))) return false;
  return classifySessions(evidence).humanIds.has(sid);
}

/** Simulates `insert ... on conflict (session_id) do nothing`: at most one alert per session. */
export function engagedAlertsFor(rows: AlertSessionRow[]): AlertEventRow[] {
  const seen = new Set<string>();
  const out: AlertEventRow[] = [];
  for (const r of rows) {
    if (!qualifiesForEngagedAlert(r, rows) || seen.has(r.session_id!)) continue;
    seen.add(r.session_id!);
    out.push(r);
  }
  return out;
}
