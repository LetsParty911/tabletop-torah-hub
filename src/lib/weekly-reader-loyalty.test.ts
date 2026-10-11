import { describe, expect, it } from "vitest";
import { publicationWeekKey, weeklyReaderLoyalty, type LoyaltyEvent } from "./weekly-reader-loyalty";

function ev(sid: string, vid: string, at: string, name = "publication_click", extra: Partial<LoyaltyEvent> = {}): LoyaltyEvent {
  return { session_id: sid, visitor_id: vid, occurred_at: at, event_name: name,
    device_type: "mobile", source_group: "WhatsApp", metadata: { action: "open_pdf" }, ...extra };
}
describe("Thursday publication-week loyalty", () => {
  it("uses New York Thursday boundaries and DST", () => {
    expect(publicationWeekKey("2026-10-08T03:50:00Z")).toBe("2026-10-01");
    expect(publicationWeekKey("2026-10-08T04:05:00Z")).toBe("2026-10-08");
    expect(publicationWeekKey("2026-11-05T04:50:00Z")).toBe("2026-10-29");
    expect(publicationWeekKey("2026-11-05T05:05:00Z")).toBe("2026-11-05");
  });
  it("counts unique readers and PDF openers each week and excludes known QA and internal", () => {
    const report = weeklyReaderLoyalty([
      ev("first", "returning", "2026-10-01T15:00:00Z"),
      ev("first", "returning", "2026-10-01T15:00:01Z"),
      ev("second", "returning", "2026-10-08T15:00:00Z"),
      ev("new", "other", "2026-10-08T16:00:00Z", "page_view"),
      ev("other-click", "other", "2026-10-08T16:01:00Z"),
      ev("internal", "staff", "2026-10-08T16:03:00Z", "publication_click", { is_internal:true }),
      ev("497fe6bd-d9d4-495c-a9a9-a0da36c012f0", "qa", "2026-10-08T16:05:00Z"),
      ev("passive", "automated", "2026-10-08T16:07:00Z", "page_view"),
    ], new Date("2026-10-09T16:00:00Z"));
    expect(report.weeks[0]?.week).toBe("2026-10-08");
    expect(report.weeks[0]?.readers).toBe(2);
    expect(report.weeks[0]?.openers).toBe(2);
    expect(report.weeks[0]?.priorWeekRepeat).toBe(1);
    expect(report.twoPlusWeeks).toBe(1);
    expect(report.weeks[0]?.isPartial).toBe(true);
  });
  it("does not call automatic viewer loads deliberate Open PDF actions", () => {
    const report = weeklyReaderLoyalty([ev("x","v","2026-10-08T15:00:00Z","pdf_open"), ev("x","v","2026-10-08T15:01:00Z","human_signal")]);
    expect(report.weeks[0]?.openers).toBe(0);
  });
});
