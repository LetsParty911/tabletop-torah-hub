import { describe, it, expect } from "vitest";
import { buildReadingJourney, type ReadingJourneyEvent } from "./reading-journey";

const t0 = "2026-11-06T00:00:00Z";
const t1 = "2026-11-06T00:00:10Z";
const t2 = "2026-11-06T00:00:20Z";
function e(session_id: string, event_name: string, occurred_at = t1, metadata: Record<string, unknown> = {}, path = "/"): ReadingJourneyEvent {
  return { session_id, event_name, occurred_at, metadata, path, source_group: "Direct" };
}

describe("homepage reading journey", () => {
  it("counts only qualified, instrumented sessions and de-duplicates stages", () => {
    const rows: ReadingJourneyEvent[] = [
      { ...e("s1", "homepage_journey_start", t0, { has_originals: true }), utm_source: "ourkehilla" },
      e("s1", "section_impression", t1, { section_id: "originals" }),
      e("s1", "section_impression", t1, { section_id: "originals" }),
      e("s1", "section_impression", t2, { section_id: "weekly_collection" }),
      e("s1", "publication_impression", t2),
      e("s1", "publication_click", t2, {}, "/view/abc"),
      e("s2", "homepage_journey_start", t0, { has_originals: true }),
      e("s2", "section_impression", t1, { section_id: "originals" }),
      e("s3", "homepage_journey_start", t0),
      e("s3", "section_impression", t1, { section_id: "weekly_collection" }),
      e("s4", "homepage_journey_start", t0),
      e("s4", "publication_click", t2),
      e("historical", "publication_click", t2),
    ];
    const out = buildReadingJourney(rows, new Set(["s1", "s2", "s3"]));
    expect(out).toMatchObject({
      instrumentedSessions: 4, countedSessions: 3, excludedSessions: 1,
      originalsEligibleSessions: 2, originalsReached: 2, weeklyReached: 2,
      cardsSeen: 1, clickedPublications: 1, didNotClick: 2,
      weeklyWithoutClick: 1, originalsWithoutWeekly: 1, neitherSectionReached: 0,
    });
    expect(out.sources).toEqual([
      { label: "Direct", sessions: 2, clicked: 0 },
      { label: "ourkehilla", sessions: 1, clicked: 1 },
    ]);
  });
  it("does not count events before homepage arrival as its conversion", () => {
    const out = buildReadingJourney([
      e("s1", "publication_click", t0),
      e("s1", "homepage_journey_start", t1),
      e("s2", "page_view", t0),
    ], new Set(["s1", "s2"]));
    expect(out.countedSessions).toBe(1);
    expect(out.clickedPublications).toBe(0);
    expect(out.didNotClick).toBe(1);
  });
  it("does not reconstruct historic section impressions", () => {
    expect(buildReadingJourney([e("s1", "page_view", t0)], new Set(["s1"]))).toMatchObject({
      instrumentedSessions: 0, countedSessions: 0, excludedSessions: 0,
    });
  });
});
