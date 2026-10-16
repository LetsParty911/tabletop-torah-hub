/**
 * PDF redirect diagnostics historically wrote is_new_visitor=false even for
 * first-time browser sessions. Server events must not determine return status.
 * Retain raw records and derive loyalty only from browser-tracked evidence.
 */
export type VisitorFlagRow = { event_name?: string | null; is_new_visitor?: boolean | null };
const SERVER_SIDE_EVENTS = new Set(["pdf_route_result", "download_served"]);

export function isClientReturningEvidence(row: VisitorFlagRow): boolean {
  return row.is_new_visitor === false && !SERVER_SIDE_EVENTS.has(row.event_name ?? "");
}

export function isClientNewVisitorEvidence(row: VisitorFlagRow): boolean {
  return row.is_new_visitor === true && !SERVER_SIDE_EVENTS.has(row.event_name ?? "");
}
