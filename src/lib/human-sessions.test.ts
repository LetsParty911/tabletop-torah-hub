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
    expect(result.humanIds.has("ms-human")).toBe(false); // human_signal alone on Microsoft is not enough
    expect(result.confidence.get("ms-human")).toBe("uncertain");
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
    expect(result.confidence.get("internal")).toBe("internal_test");
    expect(result.humanIds.size).toBe(3); // reader, deliberate open, and non-infrastructure signal-only
  });
});

describe("2026-10-16 passive cloud-infrastructure sessions", () => {
  it("labels a passive Cloudflare privacy-page visit as suspected automation", () => {
    const org = { as_organization: "Cloudflare, Inc.", device_type: "desktop", source_group: "Direct", path: "/privacy" };
    const r = classifySessions([
      ev("cf-privacy", "session_start", 0, org),
      ev("cf-privacy", "page_view", 16, org),
    ]);
    expect(r.confidence.get("cf-privacy")).toBe("suspected_automation");
    expect(r.counts.suspected_automation).toBe(1);
    expect(r.humanIds.has("cf-privacy")).toBe(false);
  });

  it("does not qualify a passive Microsoft PDF-viewer load as deliberate readership", () => {
    const org = { as_organization: "Microsoft Corporation", device_type: "desktop", source_group: "Direct", path: "/view/pdf" };
    const r = classifySessions([
      ev("ms-auto-viewer", "session_start", 0, org),
      ev("ms-auto-viewer", "page_view", 16, org),
      ev("ms-auto-viewer", "pdf_open", 700, org),
      ev("ms-intent", "page_view", 1000, org),
      ev("ms-intent", "publication_click", 1500, org),
    ]);
    expect(r.humanIds.has("ms-auto-viewer")).toBe(false);
    expect(r.humanIds.has("ms-intent")).toBe(true);
  });

  function passive(session: string, org: string, extra: Partial<SessionEventRow> = {}): SessionEventRow[] {
    const base = { as_organization: org, source_group: "Direct", device_type: "desktop", ...extra };
    return [
      ev(session, "page_view", 0, base),
      ev(session, "publication_impression", 500, base),
      ev(session, "publication_impression", 600, base),
      ev(session, "page_view", 4_000, base),
      ...Array.from({ length: 12 }, (_, i) => ev(session, "heartbeat", 1_000 + i * 2_000, base)),
    ];
  }

  it("excludes Microsoft Corporation 2 pages + 2 impressions + 12 heartbeats in 23s", () => {
    const r = classifySessions(passive("ms-passive", "Microsoft Corporation"));
    expect(r.humanIds.has("ms-passive")).toBe(false);
    expect(r.confidence.get("ms-passive")).not.toBe("likely_human");
    expect(r.sessions.get("ms-passive")?.events).toBe(16); // raw rows retained
  });

  it("excludes the same pattern from Microsoft Azure Cloud westus2, even on mobile/referral", () => {
    const r = classifySessions(passive("azure-passive", "Microsoft Azure Cloud (westus2)", { device_type: "mobile", source_group: "WhatsApp" }));
    expect(r.humanIds.has("azure-passive")).toBe(false);
    expect(r.confidence.get("azure-passive")).toBe("uncertain");
  });

  it("excludes a short infrastructure session with only a generic human_signal", () => {
    const org = { as_organization: "Microsoft Azure Cloud (eastus)" };
    const r = classifySessions([ev("az-sig", "page_view", 0, org), ev("az-sig", "human_signal", 1_500, org)]);
    expect(r.humanIds.has("az-sig")).toBe(false);
  });

  it("still counts deliberate publication_click, download or search from infrastructure", () => {
    const org = { as_organization: "Microsoft Corporation" };
    for (const action of ["publication_click", "download", "search"]) {
      const sid = `infra-${action}`;
      const r = classifySessions([...passive(sid, "Microsoft Corporation"), ev(sid, action, 5_000, org)]);
      expect(r.humanIds.has(sid)).toBe(true);
    }
  });

  it("preserves non-infrastructure passive browsing across two distinct routes", () => {
    const rows = passive("isp-reader", "Verizon Business", { device_type: "mobile", source_group: "WhatsApp" })
      .map((row, index) => row.event_name === "page_view"
        ? { ...row, path: index === 0 ? "/" : "/parsha/noach" }
        : row);
    const r = classifySessions(rows);
    expect(r.confidence.get("isp-reader")).toBe("likely_human");
  });

  it("keeps owner/internal sessions internal and the canonical counts consistent", () => {
    const rows = [
      ...passive("ms-passive", "Microsoft Corporation"),
      ev("owner", "page_view", 0, { is_internal: true, as_organization: "Microsoft Corporation" }),
      ev("owner", "publication_click", 1_000, { is_internal: true }),
    ];
    const r = classifySessions(rows);
    expect(r.confidence.get("owner")).toBe("internal_test");
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.sessions.size);
    expect(r.humanIds.size).toBe(r.counts.high_confidence_human + r.counts.likely_human);
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

describe("France and Washington forensic patterns (reporting only)", () => {
  const paris = { source_group: "Direct", device_type: "desktop", as_organization: "Orange S.A", path: "/" };
  const amazon = { source_group: "Direct", device_type: "desktop", as_organization: "Amazon.com, Inc.", path: "/" };
  const google = { source_group: "Direct", device_type: "desktop", as_organization: "Google LLC", path: "/" };
  const rows: SessionEventRow[] = [
    ev("paris-passive", "session_start", 0, paris),
    ...Array.from({ length: 5 }, (_, i) => ev("paris-passive", "page_view", i * 30_000, paris)),
    ...Array.from({ length: 65 }, (_, i) => ev("paris-passive", "heartbeat", i * 15_000, paris)),
    ev("paris-interacted", "page_view", 1_000_000, paris),
    ev("paris-interacted", "human_signal", 1_002_000, paris),
    ev("paris-filtered", "page_view", 1_050_000, paris),
    ev("paris-filtered", "filter_change", 1_052_000, paris),
    ev("dc-hosted", "session_start", 2_000_000, amazon),
    ev("dc-hosted", "page_view", 2_000_001, amazon),
    ev("dc-google", "session_start", 3_000_000, google),
    ev("dc-google", "page_view", 3_000_001, google),
  ];

  it("excludes a Paris browser that keeps loading only the homepage despite dozens of heartbeats", () => {
    const r = classifySessions(rows);
    expect(r.confidence.get("paris-passive")).toBe("uncertain");
    expect(r.humanIds.has("paris-passive")).toBe(false);
    expect(r.sessions.get("paris-passive")?.pagePaths.size).toBe(1);
    expect(r.sessions.get("paris-passive")?.events).toBe(71);
  });

  it("retains actual human-like actions as likely visits, not proof of Torah use", () => {
    const r = classifySessions(rows);
    expect(r.confidence.get("paris-interacted")).toBe("likely_human");
    expect(r.confidence.get("paris-filtered")).toBe("likely_human");
    expect(r.sessions.get("paris-interacted")?.accessedPdf).toBe(false);
    expect(r.sessions.get("paris-filtered")?.accessedPdf).toBe(false);
  });

  it("excludes passive Amazon-hosted Washington traffic without assuming Google LLC is Googlebot", () => {
    const r = classifySessions(rows);
    expect(r.confidence.get("dc-hosted")).toBe("suspected_automation");
    expect(r.confidence.get("dc-google")).toBe("uncertain");
    expect(r.humanIds.has("dc-google")).toBe(false);
  });
});
