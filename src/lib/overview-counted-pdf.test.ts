import { describe, expect, it } from "vitest";
import { buildOverview, headlineOf, type OverviewRow, type OverviewSession } from "./overview-analytics";
import { summarizePdfAccess } from "./pdf-access";

let seq = 0;
const at = (second: number) => new Date(Date.UTC(2026, 9, 9, 14, 0, second)).toISOString();
const row = (event_name: string, second: number, overrides: Partial<OverviewRow> = {}): OverviewRow => ({
  event_name,
  occurred_at: at(second),
  visitor_id: "browser-1",
  session_id: "session-1",
  is_new_visitor: true,
  path: "/",
  publication_id: "pdf-1",
  publication_title: "Bereishis",
  source_group: "Direct",
  device_type: "mobile",
  metadata: event_name === "publication_click" ? { action: "open_pdf", count: seq++ } : {},
  ...overrides,
});
const session = (id: string, visitorId: string): OverviewSession => ({
  id,
  visitorId,
  pageviews: 1,
  meaningfulIntent: true,
  engaged: true,
  accessedPdf: true,
  downloaded: false,
  firstAt: Date.parse(at(0)),
  lastAt: Date.parse(at(20)),
});

describe("overview counted PDF-open integration", () => {
  it("uses one canonical five-per-browser calculation for the headline, period trend, journeys, and funnel", () => {
    const rows = [
      row("session_start", 0),
      row("page_view", 1),
      row("publication_click", 2),
      row("pdf_open", 3), // automatic iframe preview is not counted
      ...[4, 5, 6, 7, 8, 9, 10].map((s) => row("publication_click", s)),
    ];
    const normalized = rows.map((r, i) => ({ ...r, event_id: String(i) }));
    const qualified = summarizePdfAccess(normalized, new Set(["session-1"]));
    expect(qualified.counted).toBe(5);
    expect(qualified.overCap).toBe(3);
    const countedRows = qualified.countedActions.map((a) => a.row);
    const report = buildOverview({
      rows: normalized,
      sessions: [session("session-1", "browser-1")],
      returningVisitors: new Set(),
      windowStart: at(0),
      windowEnd: at(30),
      now: Date.parse(at(30)),
      countedPdfRows: countedRows,
    });
    expect(report.headline.countedPdfOpens).toBe(5);
    expect(report.headline.countedPdfSessions).toBe(1);
    expect(report.headline.countedPdfVisitors).toBe(1);
    expect(report.headline.countedUniquePdfs).toBe(1);
    expect(report.headline.pdfOpenRate).toBe(1);
    expect(report.trend.reduce((sum, t) => sum + t.pdfOpens, 0)).toBe(5);
    expect(report.journeys[0]?.countedPdfOpens).toBe(5);
    expect(report.funnels[0]?.stages.at(-1)?.sessions).toBe(1);
  });

  it("keeps auto-preview counts from inflating the headline and counts separate browsers", () => {
    const first = row("pdf_open", 2);
    const click1 = row("publication_click", 3);
    const click2 = row("publication_click", 4, {
      visitor_id: "browser-2", session_id: "session-2", publication_id: "pdf-2",
    });
    const pdf = summarizePdfAccess(
      [first, click1, click2].map((r, i) => ({ ...r, event_id: String(i) })),
      new Set(["session-1", "session-2"]),
    );
    const counts = headlineOf([first, click1, click2], [
      session("session-1", "browser-1"), session("session-2", "browser-2"),
    ], new Set(), pdf.countedActions.map((a) => a.row));
    expect(pdf.automaticPreviews).toBe(1);
    expect(counts.countedPdfOpens).toBe(2);
    expect(counts.countedPdfVisitors).toBe(2);
    expect(counts.countedUniquePdfs).toBe(2);
    expect(counts.pdfOpenRate).toBe(1);
  });
});
