import { describe, expect, it } from "vitest";
import { buildAnalyticsReport, summarizeCanonical, type EventRow } from "./admin-analytics-canonical";

const event = (overrides: Partial<EventRow> = {}): EventRow => ({
  event_name: "publication_click",
  event_id: crypto.randomUUID(),
  occurred_at: "2026-10-08T18:00:00Z",
  visitor_id: "visitor-1",
  session_id: "session-1",
  is_new_visitor: true,
  path: "/",
  publication_id: "pdf-1",
  publication_title: "A PDF",
  device_type: "mobile",
  source_group: "Direct",
  metadata: { action: "open_pdf" },
  ...overrides,
});

describe("canonical since-last PDF activity summary", () => {
  it("partitions visitor headlines when a first and returning session occur in the same window", () => {
    const rows = [
      event({ event_id: "first", visitor_id: "mixed", session_id: "first-session", is_new_visitor: true }),
      event({ event_id: "return", visitor_id: "mixed", session_id: "return-session", is_new_visitor: false }),
      event({ event_id: "new", visitor_id: "new-only", session_id: "new-session" }),
      event({ event_id: "prior", visitor_id: "prior", session_id: "prior-session" }),
      event({ event_id: "unknown", visitor_id: "no-return-evidence", session_id: "unknown-session", is_new_visitor: null }),
      event({ event_id: "internal", visitor_id: "internal", session_id: "internal-session", is_internal: true }),
    ];
    const { metrics } = buildAnalyticsReport(rows, new Set(["prior"]));
    expect(metrics.people).toBe(4);
    expect(metrics.returningReaders).toBe(2);
    expect(metrics.newVisitors).toBe(2);
    expect(metrics.newVisitors + metrics.returningReaders).toBe(metrics.people);
    expect(metrics.sessions).toBe(5);
    expect(rows[0]?.is_new_visitor).toBe(true);
    expect(rows[1]?.is_new_visitor).toBe(false);
  });

  it("keeps first-time visitors new despite historical server PDF diagnostics", () => {
    const rows = [
      event({ event_id: "client-new", visitor_id: "new-one", session_id: "new-session", is_new_visitor: true }),
      event({ event_id: "server-redirect", event_name: "pdf_route_result", visitor_id: "new-one", session_id: "new-session", is_new_visitor: false, metadata: { outcome: "redirect_issued" } }),
      event({ event_id: "server-download", event_name: "download_served", visitor_id: "new-one", session_id: "new-session", is_new_visitor: false, metadata: { action_id: "d" } }),
    ];
    expect(summarizeCanonical(rows).returningVisitors).toBe(0);
    const report = buildAnalyticsReport(rows, new Set());
    expect(report.metrics.people).toBe(1);
    expect(report.metrics.returningReaders).toBe(0);
    expect(report.metrics.newVisitors).toBe(1);
  });

  it("counts click events separately while deduplicating PDF IDs and transport retries", () => {
    const first = event({ event_id: "click-1" });
    const summary = summarizeCanonical([
      first,
      { ...first },
      event({ event_id: "click-2" }),
      event({ event_id: "click-3", publication_id: "pdf-2", publication_title: "A PDF" }),
    ]);

    expect(summary.openPdfClicks).toBe(3);
    expect(summary.uniquePdfsOpened).toBe(2);
    expect(summary.uniquePdfClickVisitors).toBe(1);
    expect(summary.rawOpenPdfClicks).toBe(3);
    expect(summary.downloadActions).toBe(0);
  });

  it("keeps missing publication IDs out of the unique PDF count", () => {
    const summary = summarizeCanonical([
      event({ event_id: "known", publication_id: "pdf-1" }),
      event({ event_id: "missing", publication_id: null }),
    ]);

    expect(summary.openPdfClicks).toBe(2);
    expect(summary.uniquePdfsOpened).toBe(1);
  });

  it("excludes internal clicks from headline counts but keeps the raw audit count", () => {
    const summary = summarizeCanonical([
      event({ event_id: "human" }),
      event({ event_id: "internal", session_id: "internal-session", visitor_id: "internal-visitor", is_internal: true }),
    ]);

    expect(summary.openPdfClicks).toBe(1);
    expect(summary.uniquePdfsOpened).toBe(1);
    expect(summary.rawOpenPdfClicks).toBe(2);
  });

  it("does not treat automatic viewer previews as deliberate Open PDF clicks", () => {
    const summary = summarizeCanonical([event({ event_name: "pdf_open", metadata: null })]);
    expect(summary.openPdfClicks).toBe(0);
    expect(summary.uniquePdfsOpened).toBe(0);
  });

  it("reports legacy downloads when there are no Open PDF clicks", () => {
    const summary = summarizeCanonical([
      event({ event_name: "download", metadata: { action_id: "download-1" } }),
    ]);
    expect(summary.openPdfClicks).toBe(0);
    expect(summary.downloadActions).toBe(1);
  });
});