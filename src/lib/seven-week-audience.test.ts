import { describe, expect, it } from "vitest";
import { sevenWeekAudience, sundayWeekKey, type AudienceEvent } from "./seven-week-audience";

function ev(vid: string, sid: string, date: string, event_name = "publication_click", extra: Partial<AudienceEvent> = {}): AudienceEvent {
  return {
    visitor_id: vid, session_id: sid, occurred_at: date,
    event_name, source_group: "WhatsApp", device_type: "mobile",
    metadata: { action: "open_pdf" }, ...extra,
  };
}

describe("Seven completed Sunday-Saturday weeks", () => {
  it("respects New York midnight, Saturday/Sunday transition, DST", () => {
    expect(sundayWeekKey("2026-10-25T03:59:59Z")).toBe("2026-10-18");
    expect(sundayWeekKey("2026-10-25T04:00:00Z")).toBe("2026-10-25");
    expect(sundayWeekKey("2026-11-01T03:59:59Z")).toBe("2026-10-25");
    expect(sundayWeekKey("2026-11-01T05:00:00Z")).toBe("2026-11-01");
  });

  it("deduplicates sessions within a week but counts cross-week returns", () => {
    const report = sevenWeekAudience([
      ev("reader1", "a", "2026-10-09T12:00:00Z", "publication_click", { publication_id: "pub1", publication_series: "Q&A" }),
      ev("reader1", "a", "2026-10-09T12:00:02Z", "publication_click", { publication_id: "pub1", publication_series: "Q&A" }),
      ev("reader1", "b", "2026-10-11T13:00:00Z", "publication_click", { publication_id: "pub2", publication_series: "Q&A" }),
      ev("reader2", "c", "2026-10-15T13:00:00Z", "publication_click", { publication_id: "pub2" }),
      ev("internal", "d", "2026-10-15T13:00:00Z", "publication_click", { is_internal: true }),
      ev("passive", "e", "2026-10-15T13:00:00Z", "page_view"),
    ], new Date("2026-10-25T16:00:00Z"));
    const week1 = report.weeks.find((w) => w.week === "2026-10-04")!;
    const week2 = report.weeks.find((w) => w.week === "2026-10-11")!;
    expect(week1.visitors).toBe(1);
    expect(week2.visitors).toBe(2);
    expect(week2.priorWeekRepeat).toBe(1);
    expect(report.inTwoPlusWeeks).toBe(1);
    expect(report.consecutiveWeekVisitors).toBe(1);
    expect(report.engagedInTwoPlusWeeks).toBe(1);
    expect(report.seriesLoyalty[0]?.multiWeekReaders).toBe(1);
  });

  it("does not treat automatic viewer loads as PDF clicks or deliberate engagement", () => {
    const report = sevenWeekAudience([
      ev("a", "s1", "2026-10-15T13:00:00Z", "pdf_open", { metadata: {} }),
      ev("a", "s1", "2026-10-15T13:00:01Z", "human_signal", { metadata: {} }),
    ], new Date("2026-10-25T16:00:00Z"));
    const week = report.weeks.find((w) => w.week === "2026-10-11")!;
    expect(week.pdfRequestedVisitors).toBe(0);
    expect(week.deliberateVisitors).toBe(0);
    expect(week.automaticPreviewVisitors).toBe(1);
  });
});
