import { describe, expect, it } from "vitest";
import { summarizeVisitorInsights, type VisitorInsightEvent } from "./visitor-insights";

function ev(
  session_id: string, visitor_id: string, occurred_at: string,
  event_name: string, extra: Partial<VisitorInsightEvent> = {},
): VisitorInsightEvent {
  return {
    session_id, visitor_id, occurred_at, event_name,
    path: "/", source_group: "WhatsApp", device_type: "mobile",
    accept_language: "en-US,en;q=0.9",
    ...extra,
  };
}

describe("visitor insights from already-qualified canonical sessions", () => {
  it("counts sessions, not event volume, and treats passive PDF previews separately", () => {
    const start = ev("a", "reader", "2026-10-26T16:00:00Z", "page_view");
    const preview = ev("a", "reader", "2026-10-26T16:00:30Z", "pdf_open");
    const click = ev("a", "reader", "2026-10-26T16:01:00Z", "publication_click");
    const attempt = ev("a", "reader", "2026-10-26T16:01:30Z", "publication_click", { metadata: { action: "open_pdf" } });
    const duplicate = ev("a", "reader", "2026-10-26T16:02:00Z", "heartbeat");
    const result = summarizeVisitorInsights([start, preview, click, attempt, duplicate], new Set([attempt]), new Set(["reader"]));
    expect(result.sessions).toBe(1);
    expect(result.behavior.pdfAttemptSessions).toBe(1);
    expect(result.behavior.selectedWithoutPdf).toBe(0);
    expect(result.bySource[0]).toMatchObject({ source: "WhatsApp", sessions: 1, browserIds: 1, returningBrowserIds: 1, pdfAttemptSessions: 1 });
    expect(result.byEntryPage[0]).toMatchObject({ path: "/", sessions: 1, pdfSessions: 1 });
  });

  it("does not mistake embedded preview, page-only visit, or repeat events for deliberate PDF access", () => {
    const rows = [
      ev("passive", "one", "2026-10-26T16:00:00Z", "page_view"),
      ev("passive", "one", "2026-10-26T16:00:01Z", "pdf_open"),
      ev("passive", "one", "2026-10-26T16:00:02Z", "heartbeat"),
      ev("abandoned", "two", "2026-10-26T17:00:00Z", "page_view", { path: "/parsha/noach" }),
      ev("abandoned", "two", "2026-10-26T17:00:01Z", "publication_click"),
    ];
    const result = summarizeVisitorInsights(rows, new Set(), new Set());
    expect(result.behavior.pdfAttemptSessions).toBe(0);
    expect(result.behavior.singlePageNoSelection).toBe(1);
    expect(result.behavior.selectedWithoutPdf).toBe(1);
    expect(result.bySource[0]?.sessions).toBe(2);
  });

  it("keeps legitimate sessions on corporate networks and counts network organization as an estimate", () => {
    const rows = [
      ev("b", "staff-network-reader", "2026-10-26T16:00:00Z", "page_view", {
        source_group: "Google", as_organization: "B&H Photo Corporate Network", network_type: "hosting",
        accept_language: "he-IL,he;q=0.9", path: "/parsha/lech-lecha",
      }),
      ev("b", "staff-network-reader", "2026-10-26T16:00:03Z", "share_click"),
    ];
    const result = summarizeVisitorInsights(rows, new Set(), new Set());
    expect(result.sessions).toBe(1);
    expect(result.bySource[0]?.source).toBe("Google");
    expect(result.networkOrganizations[0]?.label).toBe("B&H Photo Corporate Network");
    expect(result.browserLanguages[0]?.label).toBe("he");
    expect(result.behavior.shareSessions).toBe(1);
  });

  it("uses New York local date/hour across DST and attributes a visit once", () => {
    const rows = [
      ev("late", "reader1", "2026-11-01T05:30:00Z", "page_view", { source_group: "Direct" }),
      ev("late", "reader1", "2026-11-01T05:32:00Z", "scroll_depth"),
      ev("morning", "reader2", "2026-11-01T13:30:00Z", "page_view"),
    ];
    const result = summarizeVisitorInsights(rows, new Set(), new Set());
    expect(result.hoursET[1]?.sessions).toBe(1); // after fallback
    expect(result.hoursET[8]?.sessions).toBe(1);
    expect(result.weekdaysET.find((day) => day.label === "Sun")?.sessions).toBe(2);
    expect(result.hoursET.reduce((sum, hour) => sum + hour.sessions, 0)).toBe(2);
  });

  it("aggregates signup failures and route errors only once per visit", () => {
    const rows = [
      ev("bad", "u", "2026-10-26T16:00:00Z", "page_view"),
      ev("bad", "u", "2026-10-26T16:00:01Z", "signup_failure"),
      ev("bad", "u", "2026-10-26T16:00:02Z", "signup_failure"),
      ev("bad", "u", "2026-10-26T16:00:03Z", "pdf_route_result", { metadata: { http_status: 404 } }),
      ev("bad", "u", "2026-10-26T16:00:04Z", "error"),
    ];
    const result = summarizeVisitorInsights(rows, new Set(), new Set());
    expect(result.behavior.signupFailures).toBe(1);
    expect(result.behavior.pdfRouteFailureSessions).toBe(1);
    expect(result.behavior.errorSessions).toBe(1);
  });
});
