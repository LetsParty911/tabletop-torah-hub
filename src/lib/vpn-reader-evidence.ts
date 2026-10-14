// Read-only "Reader evidence" labels for the admin VPN tab. UI/reporting only:
// never written back, never used for blocking, never changes global metrics.
// is_automated=false on a VPN audit row is only "no bot UA", NOT human evidence.
import { MEANINGFUL_INTENT } from "./human-sessions";

export const EVIDENCE_WINDOW_MS = 30 * 60 * 1000;
export const POSITIVE_EVENTS: readonly string[] = [
  "human_signal",
  ...MEANINGFUL_INTENT,
  "outbound_click",
].filter((v, i, a) => a.indexOf(v) === i);

export type EvidenceStatus = "likely_human" | "suspected_automation" | "unverified";
export type ReaderEvidence = { status: EvidenceStatus; reason: string; event?: string; eventAt?: string };
export type AuditRow = { created_at: string; ip_address: string | null; user_agent: string | null; is_automated: boolean };
export type EvidenceEvent = {
  event_name: string; occurred_at: string; ip_address: string | null; user_agent: string | null;
  is_internal?: boolean | null; referrer_host?: string | null;
};

export function isExcludedEvent(e: EvidenceEvent): boolean {
  if (e.is_internal === true) return true;
  const h = e.referrer_host?.trim().toLowerCase() ?? "";
  const ua = e.user_agent?.toLowerCase() ?? "";
  return h === "lovable.dev" || h.endsWith(".lovable.dev") || h === "lovable.app" || h.endsWith(".lovable.app") || ua.includes("lovableapp/");
}

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

/** Pure classifier. `events` null means the evidence read failed. */
export function classifyReaderEvidence(row: AuditRow, events: EvidenceEvent[] | null, readError?: string | null): ReaderEvidence {
  if (row.is_automated === true) return { status: "suspected_automation", reason: "Automated user agent (not a confirmed bot)" };
  if (events === null || readError) return { status: "unverified", reason: "Evidence lookup failed" + (readError ? `: ${readError}` : "") };
  const ip = row.ip_address?.trim(), ua = row.user_agent?.trim();
  if (!ip) return { status: "unverified", reason: "No IP on audit row" };
  if (!ua) return { status: "unverified", reason: "No user agent on audit row; cannot correlate" };
  const t = Date.parse(row.created_at);
  if (!Number.isFinite(t)) return { status: "unverified", reason: "Invalid audit timestamp" };
  let sawExcluded = false, best: EvidenceEvent | null = null, bestGap = Infinity;
  for (const e of events) {
    if (!POSITIVE_EVENTS.includes(e.event_name)) continue;
    if (e.ip_address?.trim() !== ip || e.user_agent?.trim() !== ua) continue;
    const et = Date.parse(e.occurred_at);
    if (!Number.isFinite(et) || Math.abs(et - t) > EVIDENCE_WINDOW_MS) continue;
    if (isExcludedEvent(e)) { sawExcluded = true; continue; }
    const gap = Math.abs(et - t);
    if (gap < bestGap) { best = e; bestGap = gap; }
  }
  if (best) return { status: "likely_human", reason: `Matched ${best.event_name} (same IP + UA, ±30 min); user action may still be automated`, event: best.event_name, eventAt: fmtEt(best.occurred_at) };
  return { status: "unverified", reason: sawExcluded ? "Only internal/Lovable-preview activity matched" : "No deliberate action or human signal from same IP + UA within ±30 min" };
}

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  likely_human: "Likely Human", suspected_automation: "Suspected Automation", unverified: "Unverified",
};
