import { describe, expect, it } from "vitest";
import { classifySessions, type SessionEventRow } from "./human-sessions";

const t0 = Date.parse("2026-09-24T22:00:00Z");
function ev(session: string, name: string, offsetMs: number, extra: Partial<SessionEventRow> = {}): SessionEventRow {
  return {
    event_name: name,
    occurred_at: new Date(t0 + offsetMs).toISOString(),
    visitor_id: `v-${session}`,
    session_id: session,
    device_type: "mobile",
    source_group: "WhatsApp",
    ...extra,
  };
}

describe("classifySessions (headline filter)", () => {
  it("excludes the owner-confirmed VPN QA session but keeps its raw event for auditing", () => {
    const testId = "497fe6bd-d9d4-495c-a9a9-a0da36c012f0";
    const rows = [
      { session_id: testId, visitor_id: "qa-browser", event_name: "page_view", occurred_at: "2026-10-11T08:22:12Z" },
      { session_id: testId, visitor_id: "qa-browser", event_name: "publication_click", occurred_at: "2026-10-11T08:22:19Z" },
      { session_id: "genuine-reader", visitor_id: "other-browser", event_name: "publication_click", occurred_at: "2026-10-11T08:25:19Z" },
    ];
    const result = classifySessions(rows);
    expect(result.sessions.get(testId)?.events).toBe(2);
    expect(result.confidence.get(testId)).toBe("internal_test");
    expect(result.humanIds.has(testId)).toBe(false);
    expect(result.humanIds.has("genuine-reader")).toBe(true);
  });

  const rows: SessionEventRow[] = [
    ...Array.from({ length: 42 }, (_, i) => ev(`amz-${i}`, "page_view", i * 60_000, { as_organization: "Amazon.com Inc." })),
    ...Array.from({ length: 15 }, (_, i) => ev(`cisco-${i}`, "page_view", i * 60_000, { as_organization: i % 2 ? "Cisco OpenDNS, LLC" : "Cisco OpenDNS LLC" })),
    ev("ms-human", "page_view", 0, { as_organization: "Microsoft Corporation" }),
    ev("ms-human", "human_signal", 2_000, { as_organization: "Microsoft Corporation" }),
    ev("reader", "page_view", 0),
    ev("reader", "download", 5_000),
    ev("served-only-reader", "download_served", 5_000),
    ev("auto-preview", "page_view", 0),
    ev("auto-preview", "pdf_open", 1_000),
    ev("deliberate-open", "page_view", 0),
    ev("deliberate-open", "publication_click", 1_000),
    ev("signal-only", "page_view", 0),
    ev("signal-only", "human_signal", 1_000),
    ev("uncertain", "page_view", 0),
    ev("internal", "page_view", 0, { is_internal: true }),
    ev("internal", "download", 1_000, { is_internal: true }),
  ];
  const result = classifySessions(rows);

  it("excludes Amazon/Cisco one-hit sessions as suspected automation", () => {
    expect(result.counts.suspected_automation).toBe(57);
  });

  it("keeps explicit interactions but not server redirects or automatic viewer loads", () => {
    expect(result.humanIds.has("ms-human")).toBe(true);
    expect(result.humanIds.has("reader")).toBe(true);
    expect(result.humanIds.has("deliberate-open")).toBe(true);
    expect(result.humanIds.has("served-only-reader")).toBe(false);
    expect(result.humanIds.has("auto-preview")).toBe(false);
    expect(result.confidence.get("signal-only")).toBe("likely_human");
    expect(result.sessions.get("signal-only")?.meaningfulIntent).toBe(false);
  });

  it("excludes uncertain and internal sessions from the headline set", () => {
    expect(result.confidence.get("uncertain")).toBe("uncertain");
    expect(result.humanIds.has("uncertain")).toBe(false);
    expect(result.humanIds.has("internal")).toBe(false);
    expect(result.humanIds.size).toBe(4); // Microsoft interaction, reader, deliberate open, and signal-only
  });
});

/**
 * Regression modelled on the October 14 dashboard discrepancy:
 * a first-page alert, a separate scroll/heartbeat-heavy session with no
 * page_view, another first-page alert, and a brief heartbeat session.
 * The reporting classifier deliberately doesn't infer a human reader solely
 * from elapsed time, scrolling or render-time impressions.
 */
describe("recorded traffic versus reader-qualified sessions", () => {
  it("preserves four passive sessions without promoting them to qualified readers", () => {
    const rows: SessionEventRow[] = [
      ev("page-only-a", "session_start", 0),
      ev("page-only-a", "page_view", 1),
      ev("scroll-heavy-b", "session_start", 12_000),
      ev("scroll-heavy-b", "publication_impression", 15_000),
      ev("scroll-heavy-b", "scroll_depth", 33_000),
      ev("scroll-heavy-b", "heartbeat", 48_000),
      ev("scroll-heavy-b", "scroll_depth", 105_000),
      ev("scroll-heavy-b", "heartbeat", 150_000),
      ev("page-only-c", "session_start", 180_000),
      ev("page-only-c", "page_view", 180_001),
      ev("heartbeat-d", "session_start", 240_000),
      ev("heartbeat-d", "page_view", 240_001),
      ev("heartbeat-d", "heartbeat", 255_000),
      ev("heartbeat-d", "heartbeat", 271_000),
    ];
    const result = classifySessions(rows);
    expect(result.sessions.size).toBe(4);
    expect(result.counts.uncertain).toBe(4);
    expect(result.counts.suspected_automation).toBe(0);
    expect(result.humanIds.size).toBe(0);
    expect(result.sessions.get("scroll-heavy-b")?.pageviews).toBe(0);
    expect(result.sessions.get("scroll-heavy-b")?.impressions).toBe(1);
  });

  it("promotes a session to qualified readership when a deliberate action is recorded", () => {
    const result = classifySessions([
      ev("read-action", "session_start", 0),
      ev("read-action", "page_view", 1),
      ev("read-action", "publication_click", 10_000),
    ]);
    expect(result.humanIds.has("read-action")).toBe(true);
    expect(result.counts.likely_human).toBe(1);
  });
});


describe("infrastructure-origin session reporting", () => {
  it("sets aside card impressions on a Cisco one-page session without deleting rows", () => {
    const rows = [
      ev("cisco-render", "page_view", 0, { as_organization: "Cisco OpenDNS, LLC" }),
      ev("cisco-render", "publication_impression", 1_000, { as_organization: "Cisco OpenDNS, LLC" }),
      ev("cisco-render", "publication_impression", 1_100, { as_organization: "Cisco OpenDNS, LLC" }),
    ];
    const result = classifySessions(rows);
    expect(result.sessions.get("cisco-render")?.events).toBe(3);
    expect(result.confidence.get("cisco-render")).toBe("suspected_automation");
    expect(result.humanIds.has("cisco-render")).toBe(false);
  });

  it("marks OVH hosted-browser interaction unverified, keeping all raw PDF activity", () => {
    const rows = [
      ev("ovh-hosted", "page_view", 0, { as_organization: "OVH SAS" }),
      ev("ovh-hosted", "human_signal", 2_000, { as_organization: "OVH SAS" }),
      ev("ovh-hosted", "publication_click", 4_000, { as_organization: "OVH SAS" }),
      ev("ovh-hosted", "pdf_open", 5_000, { as_organization: "OVH SAS" }),
    ];
    const result = classifySessions(rows);
    expect(result.sessions.get("ovh-hosted")?.accessedPdf).toBe(true);
    expect(result.sessions.get("ovh-hosted")?.events).toBe(rows.length);
    expect(result.confidence.get("ovh-hosted")).toBe("uncertain");
    expect(result.humanIds.has("ovh-hosted")).toBe(false);
  });
});
