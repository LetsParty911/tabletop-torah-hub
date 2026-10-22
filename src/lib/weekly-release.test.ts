import { describe, expect, it } from "vitest";
import { weeklyReleaseAt, weeklyReleaseState } from "./weekly-release";
import { currentYearRows, isProgressForReading, isCollectionComplete } from "./collection-status";
import { toParshaComparableKey } from "./parsha-normalize";

const readingDate = "2026-10-24";
describe("Lech Lecha 5787 weekly release truth", () => {
  it("targets Thursday Oct 22 at exactly 8pm Eastern", () => {
    expect(weeklyReleaseAt(readingDate)?.toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });
  for (const [moment, expected] of [
    ["2026-10-19T18:42:00-04:00", "pending"],
    ["2026-10-22T19:59:59-04:00", "pending"],
    ["2026-10-22T20:00:00-04:00", "delayed"],
    ["2026-10-22T22:00:00-04:00", "delayed"],
  ] as const) {
    it(`${moment} with zero current PDFs is ${expected}`, () => {
      expect(weeklyReleaseState(readingDate, 0, Date.parse(moment))).toBe(expected);
    });
  }
  it("becomes published only after the first real current PDF, even before deadline", () => {
    expect(weeklyReleaseState(readingDate, 1, Date.parse("2026-10-22T19:00:00-04:00"))).toBe("published");
    expect(weeklyReleaseState(readingDate, 1, Date.parse("2026-10-22T20:01:00-04:00"))).toBe("published");
  });
  it("next week has its own deadline and zero current items is pending again", () => {
    expect(weeklyReleaseAt("2026-10-31")?.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(weeklyReleaseState("2026-10-31", 0, Date.parse("2026-10-25T10:00:00-04:00"))).toBe("pending");
  });
  it("honors winter Eastern time", () => {
    expect(weeklyReleaseAt("2026-11-07")?.toISOString()).toBe("2026-11-06T01:00:00.000Z");
  });
  it("does not count old Lech Lecha or thirty fallback Noach items as current published items", () => {
    const old = [{ parsha_key: "Lech-Lecha", jewish_year: 5786 }, ...Array.from({length: 30}, () => ({ parsha_key: "Noach", jewish_year: 5787 }))];
    expect(currentYearRows(old, ["lechlecha"], 5787, toParshaComparableKey)).toHaveLength(0);
    expect(currentYearRows([...old, {parsha_key: "Lech-Lecha", jewish_year: 5787}], ["lechlecha"], 5787, toParshaComparableKey)).toHaveLength(1);
  });
  it("does not reuse Noach's 100% legacy progress for Lech Lecha, including its first PDF", () => {
    expect(isProgressForReading("2026-10-15T20:00:00-04:00", readingDate)).toBe(false);
    expect(isProgressForReading(null, readingDate)).toBe(false);
    expect(isCollectionComplete(isProgressForReading(null, readingDate) ? 100 : null, false, 1)).toBe(false);
    expect(isProgressForReading("2026-10-22T20:00:00-04:00", readingDate)).toBe(true);
    expect(isCollectionComplete(100, true, 30)).toBe(false);
  });
});
