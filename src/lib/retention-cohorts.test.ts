import { describe, expect, it } from "vitest";
import { computeCohorts, computeWeeklyLoyalty, DAY_MS, weekKey, type VisitorTimeline } from "./retention-cohorts";

const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const OBSERVATION_START = NOW - 90 * DAY_MS;

function visitor(id: string, firstSeenDaysAgo: number, returnDaysAfter: number[] = []): VisitorTimeline {
  const firstSeen = NOW - firstSeenDaysAgo * DAY_MS;
  return {
    visitorId: id,
    firstSeen,
    activeAt: [firstSeen, ...returnDaysAfter.map((days) => firstSeen + days * DAY_MS)],
  };
}

describe("computeCohorts", () => {
  it("excludes visitors whose first session predates the observation window", () => {
    const old = { ...visitor("old", 10, [1]), firstSeen: OBSERVATION_START - DAY_MS };
    const result = computeCohorts([old], OBSERVATION_START, NOW);
    expect(result.every((cohort) => cohort.eligible === 0)).toBe(true);
  });

  it("counts a visitor as immature until the window has elapsed", () => {
    const d7 = computeCohorts([visitor("fresh", 2)], OBSERVATION_START, NOW).find((c) => c.window === "D7")!;
    expect(d7.eligible).toBe(0);
    expect(d7.immature).toBe(1);
  });

  it("counts a day-1 return", () => {
    const d1 = computeCohorts([visitor("a", 10, [1])], OBSERVATION_START, NOW).find((c) => c.window === "D1")!;
    expect(d1.eligible).toBe(1);
    expect(d1.returned).toBe(1);
  });

  it("does not count same-day activity as a return", () => {
    const sameDay: VisitorTimeline = {
      visitorId: "same",
      firstSeen: NOW - 10 * DAY_MS,
      activeAt: [NOW - 10 * DAY_MS, NOW - 10 * DAY_MS + 60_000],
    };
    const d1 = computeCohorts([sameDay], OBSERVATION_START, NOW).find((c) => c.window === "D1")!;
    expect(d1.returned).toBe(0);
  });

  it("suppresses the percentage under ten eligible visitors", () => {
    const few = [visitor("a", 10, [1]), visitor("b", 10, [1])];
    const d1 = computeCohorts(few, OBSERVATION_START, NOW).find((c) => c.window === "D1")!;
    expect(d1.rate).toBeNull();

    const many = Array.from({ length: 12 }, (_, index) => visitor(`v${index}`, 10, index < 6 ? [1] : []));
    const rated = computeCohorts(many, OBSERVATION_START, NOW).find((c) => c.window === "D1")!;
    expect(rated.eligible).toBe(12);
    expect(rated.rate).toBeCloseTo(0.5);
  });
});

describe("weekly loyalty", () => {
  it("counts distinct weeks of activity", () => {
    const spread: VisitorTimeline = {
      visitorId: "spread",
      firstSeen: NOW - 28 * DAY_MS,
      activeAt: [NOW - 28 * DAY_MS, NOW - 21 * DAY_MS, NOW - 14 * DAY_MS, NOW - 7 * DAY_MS],
    };
    const loyalty = computeWeeklyLoyalty([spread, visitor("once", 3)]);
    expect(loyalty.twoPlusWeeks).toBe(1);
    expect(loyalty.fourPlusWeeks).toBe(1);
    expect(loyalty.visitorsConsidered).toBe(2);
  });

  it("uses a stable Monday-based week key", () => {
    expect(weekKey(Date.parse("2026-03-01T12:00:00.000Z"))).toBe(
      weekKey(Date.parse("2026-02-23T00:00:00.000Z")),
    );
  });
});
