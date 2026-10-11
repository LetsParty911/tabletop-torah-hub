import { describe, it, expect } from "vitest";
import { pickCoherentSessionGeo, summarizeGeoInsights } from "./geo-insights";

const row = (sid: string, at: string, city: string | null, more: Record<string, unknown> = {}) => ({
  session_id: sid, occurred_at: at, city, region: city ? "New Jersey" : null,
  country: "US", postal_code: city ? "07002" : null,
  geo_provider: "maxmind", geo_reliability: "medium", network_type: "unknown",
  event_name: "page_view", ...more,
});

describe("IP location quality and coherent session summaries", () => {
  it("does not combine a city with unrelated region and ZIP", () => {
    const result = summarizeGeoInsights([
      row("a","2026-10-11T10:00:00Z","Bayonne",{region:null,postal_code:null}),
      row("a","2026-10-11T10:00:01Z",null,{region:"New York",postal_code:"10001"}),
    ]);
    expect(result.topCities[0]?.name).toBe("Bayonne, US");
    expect(result.postalSessions).toBe(0);
  });
  it("deduplicates a session and preserves deliberate PDF use separately", () => {
    const result = summarizeGeoInsights([
      row("a","2026-10-11T10:00:00Z","Bayonne"),
      row("a","2026-10-11T10:00:01Z","Bayonne",{event_name:"publication_click",metadata:{action:"open_pdf"}}),
    ]);
    expect(result.sessions).toBe(1);
    expect(result.citySessions).toBe(1);
    expect(result.pdfOpenSessions).toBe(1);
    expect(result.topCities[0]?.pdfOpenSessions).toBe(1);
  });
  it("flags changing city estimates but never treats an IP city as exact GPS", () => {
    const result = summarizeGeoInsights([
      row("a","2026-10-11T10:00:00Z","Bayonne"),
      row("a","2026-10-11T10:00:03Z","Clifton",{network_type:"vpn",geo_reliability:"low"}),
    ]);
    expect(result.multiCityEstimateSessions).toBe(1);
    expect(result.topCities[0]?.name).toContain("Bayonne");
    expect(result.quality.medium).toBe(1);
  });
  it("marks unknown network evidence unknown rather than verified standard", () => {
    const result = summarizeGeoInsights([
      row("a","2026-10-11T10:00:00Z",null,{country:"US",region:null,postal_code:null,geo_reliability:"unknown"}),
    ]);
    expect(result.quality.unknown).toBe(1);
    expect(result.countryOnlySessions).toBe(1);
    expect(result.citySessions).toBe(0);
  });
  it("reviews all observed cities while keeping the top twenty overview", () => {
    const visits = Array.from({ length: 24 }, (_, i) =>
      row("session-" + i, "2026-10-11T10:00:00Z", "City " + i),
    );
    const report = summarizeGeoInsights(visits);
    expect(report.reviewCities).toHaveLength(24);
    expect(report.topCities).toHaveLength(20);
    expect(report.reviewCities.reduce((n, city) => n + city.sessions, 0)).toBe(24);
  });
  it("shows conflicting city estimates as diagnostics, not additional sessions", () => {
    const report = summarizeGeoInsights([
      row("same", "2026-10-11T10:00:00Z", "Clifton"),
      row("same", "2026-10-11T10:01:00Z", "Newark"),
    ]);
    expect(report.reviewCities).toHaveLength(1);
    expect(report.reviewCities[0]?.sessions).toBe(1);
    expect(report.reviewCities[0]?.conflictingEstimateSessions).toBe(1);
  });
  it("uses earliest for equal-quality city estimates", () => {
    const chosen = pickCoherentSessionGeo([
      row("a","2026-10-11T10:00:05Z","Newark"),
      row("a","2026-10-11T10:00:00Z","Clifton"),
    ]);
    expect(chosen?.city).toBe("Clifton");
  });
});
