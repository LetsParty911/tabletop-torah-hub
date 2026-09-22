import { describe, expect, it } from "vitest";
import { classifySession, describePossibleRelationship } from "./traffic-confidence";

const base = {
  internal: false,
  flaggedAutomation: false,
  humanSignal: false,
  meaningfulIntent: false,
  pageviews: 1,
  impressions: 0,
  durationMs: 0,
};

describe("classifySession", () => {
  it("labels a marked device internal even when it looks automated", () => {
    expect(classifySession({ ...base, internal: true, flaggedAutomation: true })).toBe("internal_test");
  });

  it("treats a human signal plus a real action as high confidence", () => {
    expect(classifySession({ ...base, humanSignal: true, meaningfulIntent: true })).toBe(
      "high_confidence_human",
    );
  });

  it("protects a session with real intent from the automation rules", () => {
    expect(classifySession({ ...base, flaggedAutomation: true, meaningfulIntent: true })).toBe(
      "likely_human",
    );
  });

  it("protects a session with an explicit human signal from the automation rules", () => {
    expect(classifySession({ ...base, flaggedAutomation: true, humanSignal: true })).toBe("likely_human");
  });

  it("marks a flagged, action-free session as suspected automation", () => {
    expect(classifySession({ ...base, flaggedAutomation: true })).toBe("suspected_automation");
  });

  it("calls sustained multi-page reading likely human", () => {
    expect(classifySession({ ...base, pageviews: 3, durationMs: 60_000 })).toBe("likely_human");
  });

  it("falls back to uncertain rather than guessing", () => {
    expect(classifySession({ ...base, pageviews: 1, durationMs: 4_000 })).toBe("uncertain");
  });
});

describe("describePossibleRelationship", () => {
  it("never merges and downgrades weak evidence", () => {
    const weak = describePossibleRelationship(["a", "b"], "same network", 1);
    expect(weak.verdict).toBe("insufficient evidence");
    const stronger = describePossibleRelationship(["a", "b"], "same network and device", 2);
    expect(stronger.verdict).toBe("possible relationship");
    expect(stronger.note).toContain("never merged");
  });
});
