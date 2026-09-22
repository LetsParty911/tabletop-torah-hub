import { describe, expect, it } from "vitest";
import {
  computeCohorts,
  computeWeeklyLoyalty,
  DAY_MS,
  weekKey,
  type VisitorTimeline,
} from "./retention-cohorts";

const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const OBSERVATION_START = NOW - 90 * DAY_MS;

function visitor(
  id: string,
  firstSessionDaysAgo: number,
  returnDaysAfter: number[] = [],
  hasPriorHistory = false,
): VisitorTimeline {
  const firstSession = NOW - firstSessionDaysAgo * DAY_MS;
  return {
    visitorId: id,
    firstSession,
    sessionStarts: [firstSession, ...returnDaysAfter.map((days) => firstSession + days * DAY_MS)],
    hasPriorHistory,
  };
}

const at = (window: "D1" | "D7" | "D30", timelines: VisitorTimeline[]) =>
  computeCohorts(timelines, OBSERVATION_START, NOW).find((c) => c.window === window)!;

describe("computeCohorts", () => {
  it("does not count extra events inside the same session as a return", () => {
    // Only one distinct session start, despite a heartbeat minutes later.
    const sameSession: VisitorTimeline = {
      visitorId: "same",
      firstSession: NOW - 40 * DAY_MS,
      sessionStarts: [NOW - 40 * DAY_MS],
    };
    expect(at("D1", [sameSession]).returned).toBe(0);
    expect(at("D7", [sameSession]).returned).toBe(0);
    expect(at("D30", [sameSession]).returned).toBe(0);
  });

  it("counts a day-2 return inside the cumulative 7-day window", () => {
    const d7 = at("D7", [visitor("a", 40, [2])]);
    expect(d7.eligible).toBe(1);
    expect(d7.returned).toBe(1);
  });

  it("does not count a day-8 return in the 7-day window", () => {
    const d7 = at("D7", [visitor("b", 40, [8])]);
    expect(d7.eligible).toBe(1);
    expect(d7.returned).toBe(0);
  });

  it("counts a day-10 return in the cumulative 30-day window", () => {
    const d30 = at("D30", [visitor("c", 40, [10])]);
    expect(d30.eligible).toBe(1);
    expect(d30.returned).toBe(1);
  });

  it("excludes immature visitors from the denominator", () => {
    const d7 = at("D7", [visitor("fresh", 2)]);
    expect(d7.eligible).toBe(0);
    expect(d7.immature).toBe(1);
  });

  it("excludes left-censored visitors with history before the observation period", () => {
    const flagged = visitor("flagged", 40, [2], true);
    const beforeWindow = { ...visitor("old", 40, [2]), firstSession: OBSERVATION_START - DAY_MS };
    const result = at("D7", [flagged, beforeWindow]);
    expect(result.eligible).toBe(0);
    expect(result.returned).toBe(0);
    expect(result.leftCensored).toBe(2);
  });

  it("suppresses the percentage under ten eligible visitors", () => {
    expect(at("D1", [visitor("a", 40, [1]), visitor("b", 40, [1])]).rate).toBeNull();

    const many = Array.from({ length: 12 }, (_, i) => visitor(`v${i}`, 40, i < 6 ? [1] : []));
    const rated = at("D1", many);
    expect(rated.eligible).toBe(12);
    expect(rated.rate).toBeCloseTo(0.5);
  });
});

describe("weekly loyalty", () => {
  it("counts distinct weeks of session activity", () => {
    const spread: VisitorTimeline = {
      visitorId: "spread",
      firstSession: NOW - 28 * DAY_MS,
      sessionStarts: [NOW - 28 * DAY_MS, NOW - 21 * DAY_MS, NOW - 14 * DAY_MS, NOW - 7 * DAY_MS],
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
