import { describe, expect, it } from "vitest";
import { summarizeCanonical, type EventRow } from "./admin-analytics-canonical";

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