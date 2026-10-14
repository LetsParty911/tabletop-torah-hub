import { describe, it, expect } from "vitest";
import { classifyReaderEvidence, type EvidenceEvent } from "./vpn-reader-evidence";

const UA = "Mozilla/5.0 Chrome/120";
const row = { created_at: "2026-10-14T12:00:00.000Z", ip_address: "1.2.3.4", user_agent: UA, is_automated: false };
const ev = (o: Partial<EvidenceEvent> = {}): EvidenceEvent => ({ event_name: "publication_click", occurred_at: "2026-10-14T12:10:00.000Z", ip_address: "1.2.3.4", user_agent: UA, ...o });

describe("classifyReaderEvidence", () => {
  it("human_signal → likely human", () => expect(classifyReaderEvidence(row, [ev({ event_name: "human_signal" })]).status).toBe("likely_human"));
  it("deliberate action → likely human with event", () => {
    const r = classifyReaderEvidence(row, [ev()]);
    expect(r.status).toBe("likely_human"); expect(r.event).toBe("publication_click"); expect(r.eventAt).toMatch(/ET$/);
  });
  it("passive-only stays unverified", () => {
    const passive = ["page_view", "session_start", "pdf_open", "download_served", "heartbeat", "scroll_depth", "publication_impression"].map((n) => ev({ event_name: n }));
    expect(classifyReaderEvidence(row, passive).status).toBe("unverified");
  });
  it("same IP different UA, or different IP, is unverified", () => {
    expect(classifyReaderEvidence(row, [ev({ user_agent: "Other" }), ev({ ip_address: "9.9.9.9" })]).status).toBe("unverified");
  });
  it(">30 minutes is unverified; exactly 30 matches", () => {
    expect(classifyReaderEvidence(row, [ev({ occurred_at: "2026-10-14T12:30:01.000Z" })]).status).toBe("unverified");
    expect(classifyReaderEvidence(row, [ev({ occurred_at: "2026-10-14T11:30:00.000Z" })]).status).toBe("likely_human");
  });
  it("missing UA is unverified", () => expect(classifyReaderEvidence({ ...row, user_agent: null }, [ev({ user_agent: null })]).status).toBe("unverified"));
  it("automated UA takes precedence", () => {
    const r = classifyReaderEvidence({ ...row, is_automated: true }, [ev()]);
    expect(r.status).toBe("suspected_automation"); expect(r.reason).toMatch(/Automated user agent/);
  });
  it("internal and Lovable-referrer evidence excluded", () => {
    const r = classifyReaderEvidence(row, [ev({ is_internal: true }), ev({ referrer_host: "id-preview--x.lovable.app" })]);
    expect(r.status).toBe("unverified"); expect(r.reason).toMatch(/internal/);
  });
  it("read error never elevates", () => {
    expect(classifyReaderEvidence(row, null, "timeout").status).toBe("unverified");
    expect(classifyReaderEvidence(row, [ev()], "partial").status).toBe("unverified");
  });
});
