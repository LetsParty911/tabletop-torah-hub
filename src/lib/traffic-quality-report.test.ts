import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeTrafficQuality, type TrafficQualityInput } from "./traffic-quality-report";

const sample: TrafficQualityInput = {
  raw: { visitors: 1140, sessions: 1165 },
  metrics: { people: 41, sessions: 50 },
  confidence: {
    counts: {
      high_confidence_human: 17,
      likely_human: 33,
      uncertain: 96,
      suspected_automation: 1012,
      internal_test: 7,
    },
  },
  sessions: [
    { visitorId: "reader-1", events: [{ event: "page_view" }, { event: "publication_click" }, { event: "publication_click" }] },
    { visitorId: "reader-1", events: [{ event: "publication_click" }] },
    { visitorId: "reader-2", events: [{ event: "human_signal" }] },
    { visitorId: null, events: [{ event: "publication_click" }] },
  ],
};

describe("traffic quality dashboard", () => {
  it("is visible in both admin overview and owner summary even when qualified sessions are zero", () => {
    const owner = readFileSync("src/components/admin/OwnerSummary.tsx", "utf8");
    const overview = readFileSync("src/components/admin/AdminAnalyticsReport.tsx", "utf8");
    expect(owner).toContain("<TrafficQualityPanel report={report} />");
    expect(overview.match(/<TrafficQualityPanel report={report} \/>/g)?.length).toBe(2);
    expect(overview).toContain('m.sessions === 0');
  });

  it("does not mistake raw browser IDs or bot sessions for confirmed people", () => {
    const q = summarizeTrafficQuality(sample);
    expect(q.rawVisitorIds).toBe(1140);
    expect(q.qualifiedVisitorIds).toBe(41);
    expect(q.classifications.suspected_automation).toBe(1012);
    expect(q.classifiedSessions).toBe(q.rawSessions);
  });

  it("counts publication clickers by distinct qualified visitor ID, not click events", () => {
    const q = summarizeTrafficQuality(sample);
    expect(q.qualifiedPublicationClicks).toBe(4);
    expect(q.publicationClickerIds).toBe(1);
  });

  it("does not count passive or uncertain visits as publication readers", () => {
    const q = summarizeTrafficQuality({
      raw: { visitors: 3, sessions: 3 },
      metrics: { people: 0, sessions: 0 },
      confidence: {
        counts: { high_confidence_human: 0, likely_human: 0, uncertain: 1, suspected_automation: 2, internal_test: 0 },
      },
      sessions: [],
    });
    expect(q.publicationClickerIds).toBe(0);
    expect(q.qualifiedPublicationClicks).toBe(0);
    expect(q.rawVisitorIds).toBe(3);
  });
});
