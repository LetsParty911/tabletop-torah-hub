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
  const rows: SessionEventRow[] = [
    ...Array.from({ length: 42 }, (_, i) => ev(`amz-${i}`, "page_view", i * 60_000, { as_organization: "Amazon.com Inc." })),
    ...Array.from({ length: 15 }, (_, i) => ev(`cisco-${i}`, "page_view", i * 60_000, { as_organization: i % 2 ? "Cisco OpenDNS, LLC" : "Cisco OpenDNS LLC" })),
    ev("ms-human", "page_view", 0, { as_organization: "Microsoft Corporation" }),
    ev("ms-human", "human_signal", 2_000, { as_organization: "Microsoft Corporation" }),
    ev("reader", "page_view", 0),
    ev("reader", "download", 5_000),
    ev("served-only-reader", "download_served", 5_000),
    ev("uncertain", "page_view", 0),
    ev("internal", "page_view", 0, { is_internal: true }),
    ev("internal", "download", 1_000, { is_internal: true }),
  ];
  const result = classifySessions(rows);

  it("excludes Amazon/Cisco one-hit sessions as suspected automation", () => {
    expect(result.counts.suspected_automation).toBe(57);
  });

  it("keeps Microsoft with explicit human_signal and a downloading reader", () => {
    expect(result.humanIds.has("ms-human")).toBe(true);
    expect(result.humanIds.has("reader")).toBe(true);
    expect(result.humanIds.has("served-only-reader")).toBe(true);
  });

  it("excludes uncertain and internal sessions from the headline set", () => {
    expect(result.confidence.get("uncertain")).toBe("uncertain");
    expect(result.humanIds.has("uncertain")).toBe(false);
    expect(result.humanIds.has("internal")).toBe(false);
    expect(result.humanIds.size).toBe(3);
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
