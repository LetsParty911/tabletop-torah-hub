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
