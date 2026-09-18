import { describe, expect, it } from "vitest";
import {
  addDaysToDayKey,
  buildChangeObservations,
  buildObservations,
  completedCollectionWindows,
  formatRate,
  hasComparableBaseline,
  newYorkDayKey,
  newYorkDayWindow,
  previousCompletedDayKey,
  priorWeekDayKey,
  recentCompletedDayKeys,
  selectCollectionReportWindows,
  startOfNewYorkDay,
} from "./admin-reports";

const HOUR = 60 * 60 * 1000;

describe("day boundaries", () => {
  it("maps a late-UTC instant to the previous New York day", () => {
    expect(newYorkDayKey(new Date("2026-09-18T03:00:00Z"))).toBe("2026-09-17");
  });

  it("uses EDT offset in summer and EST in winter", () => {
    expect(startOfNewYorkDay("2026-07-01")).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfNewYorkDay("2026-01-15")).toBe("2026-01-15T05:00:00.000Z");
  });

  it("produces a 23-hour spring-forward day and 25-hour fall-back day", () => {
    const spring = newYorkDayWindow("2026-03-08");
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * HOUR);
    const fall = newYorkDayWindow("2026-11-01");
    expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * HOUR);
  });

  it("returns the previous completed day and recent day list", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(previousCompletedDayKey(now)).toBe("2026-09-17");
    const recent = recentCompletedDayKeys(14, now);
    expect(recent).toHaveLength(14);
    expect(recent[0]).toBe("2026-09-17");
    expect(recent[13]).toBe("2026-09-04");
  });

  it("finds the same weekday one week earlier", () => {
    expect(priorWeekDayKey("2026-09-17")).toBe("2026-09-10");
    expect(addDaysToDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("collection window selection", () => {
  const windows = [
    { parsha: "haazinu", start: "2026-09-16T00:00:00Z", end: "2026-09-25T00:00:00Z" },
    { parsha: "nitzavim", start: "2026-09-09T00:00:00Z", end: "2026-09-16T00:00:00Z" },
    { parsha: "ki-savo", start: "2026-09-02T00:00:00Z", end: "2026-09-09T00:00:00Z" },
  ];
  const now = new Date("2026-09-18T12:00:00Z");

  it("excludes the still-open current window", () => {
    expect(completedCollectionWindows(windows, now).map((w) => w.parsha)).toEqual(["nitzavim", "ki-savo"]);
  });

  it("defaults to the newest completed collection and its predecessor", () => {
    const result = selectCollectionReportWindows(windows, null, now);
    expect(result.current?.parsha).toBe("nitzavim");
    expect(result.previous?.parsha).toBe("ki-savo");
    expect(result.available).toEqual(["nitzavim", "ki-savo"]);
  });

  it("honors an explicit completed collection and falls back for unknown ones", () => {
    expect(selectCollectionReportWindows(windows, "ki-savo", now).current?.parsha).toBe("ki-savo");
    expect(selectCollectionReportWindows(windows, "haazinu", now).current?.parsha).toBe("nitzavim");
  });
});

describe("small-N rules", () => {
  it("shows counts under 10 and percentages at or above 10", () => {
    expect(formatRate(3, 8)).toBe("3 of 8");
    expect(formatRate(5, 10)).toBe("50% (5 of 10)");
  });

  it("suppresses percentage change on a small baseline", () => {
    expect(buildChangeObservations([{ label: "Downloads", current: 9, previous: 4 }])[0]).toBe(
      "Downloads up 5, 4 → 9.",
    );
    expect(buildChangeObservations([{ label: "Downloads", current: 30, previous: 20 }])[0]).toBe(
      "Downloads up 10 (50%), 20 → 30.",
    );
    expect(buildChangeObservations([{ label: "People", current: 5, previous: 5 }])[0]).toBe(
      "People unchanged at 5.",
    );
  });

  it("detects a comparable baseline", () => {
    expect(hasComparableBaseline(null)).toBe(false);
    expect(hasComparableBaseline({ people: 0, sessions: 0 })).toBe(false);
    expect(hasComparableBaseline({ people: 0, sessions: 3 })).toBe(true);
  });
});

describe("deterministic observations", () => {
  const base = {
    people: 0,
    usedTorah: 0,
    pdfOpens: 0,
    downloads: 0,
    signups: 0,
    returningReaders: 0,
    topPublication: null,
    topSourceDownloads: null,
    searchesWithoutContent: 0,
    searchesTotal: 0,
    suspectedSessions: 0,
  };

  it("states quiet periods plainly", () => {
    expect(buildObservations(base)).toEqual(["No recorded visitor activity in this period."]);
  });

  it("reports source, publication and search facts", () => {
    const notes = buildObservations({
      ...base,
      people: 20,
      downloads: 8,
      pdfOpens: 12,
      searchesTotal: 4,
      searchesWithoutContent: 0,
      topPublication: { title: "Artscroll by the Shabbos Table", downloadActions: 5, pdfOpens: 7 },
      topSourceDownloads: { label: "Email", downloads: 5 },
    });
    expect(notes).toHaveLength(3);
    expect(notes[0]).toBe("Email produced 5 of 8 download actions.");
    expect(notes[2]).toBe("No searches failed to lead to content.");
  });
});
