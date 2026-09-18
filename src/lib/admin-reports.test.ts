import { describe, expect, it } from "vitest";
import {
  addDaysToDayKey,
  buildChangeObservations,
  buildObservations,
  completedCollectionWindows,
  hasComparableBaseline,
  newYorkDayKey,
  newYorkDayWindow,
  previousCompletedDayKey,
  priorWeekDayKey,
  recentCompletedDayKeys,
  selectCollectionReportWindows,
  startOfNewYorkDay,
} from "./admin-reports";

describe("New York day boundaries", () => {
  it("uses the local calendar date, not UTC", () => {
    // 01:30 UTC on Sep 19 is still Sep 18 in New York.
    expect(newYorkDayKey(new Date("2026-09-19T01:30:00.000Z"))).toBe("2026-09-18");
  });

  it("is DST-correct for summer and winter days", () => {
    expect(startOfNewYorkDay("2026-07-04")).toBe("2026-07-04T04:00:00.000Z"); // EDT, UTC-4
    expect(startOfNewYorkDay("2026-01-15")).toBe("2026-01-15T05:00:00.000Z"); // EST, UTC-5
  });

  it("produces 23- and 25-hour windows on DST change days", () => {
    const springForward = newYorkDayWindow("2026-03-08");
    const fallBack = newYorkDayWindow("2026-11-01");
    const hours = (w: { start: string; end: string }) =>
      (Date.parse(w.end) - Date.parse(w.start)) / 3_600_000;
    expect(hours(springForward)).toBe(23);
    expect(hours(fallBack)).toBe(25);
  });

  it("selects the previous completed day and recent day options", () => {
    const now = new Date("2026-09-18T12:05:00.000Z");
    expect(previousCompletedDayKey(now)).toBe("2026-09-17");
    const recent = recentCompletedDayKeys(now, 14);
    expect(recent).toHaveLength(14);
    expect(recent[0]).toBe("2026-09-17");
    expect(recent[13]).toBe("2026-09-04");
    expect(recent).not.toContain(newYorkDayKey(now));
  });

  it("compares against the same weekday one week earlier", () => {
    expect(priorWeekDayKey("2026-09-17")).toBe("2026-09-10");
    expect(addDaysToDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("completed collection selection", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  const windows = [
    { parsha: "Haazinu", start: "2026-09-16T10:00:00.000Z", end: "2026-09-18T12:01:00.000Z" },
    { parsha: "Nitzavim", start: "2026-09-09T10:00:00.000Z", end: "2026-09-16T10:00:00.000Z" },
    { parsha: "Ki Savo", start: "2026-09-02T10:00:00.000Z", end: "2026-09-09T10:00:00.000Z" },
  ];

  it("excludes the still-open current collection", () => {
    expect(completedCollectionWindows(windows, now).map((w) => w.parsha)).toEqual([
      "Nitzavim",
      "Ki Savo",
    ]);
  });

  it("defaults to the most recently completed collection with its prior", () => {
    const selected = selectCollectionReportWindows(windows, { now });
    expect(selected.current?.parsha).toBe("Nitzavim");
    expect(selected.previous?.parsha).toBe("Ki Savo");
  });

  it("honors an explicit completed collection request", () => {
    const selected = selectCollectionReportWindows(windows, { now, parsha: "Ki Savo" });
    expect(selected.current?.parsha).toBe("Ki Savo");
    expect(selected.previous).toBeNull();
  });

  it("falls back to the newest completed window for an unknown or open request", () => {
    expect(selectCollectionReportWindows(windows, { now, parsha: "Haazinu" }).current?.parsha).toBe(
      "Nitzavim",
    );
    expect(selectCollectionReportWindows([], { now }).current).toBeNull();
  });
});

describe("deterministic observations", () => {
  const base = {
    people: 8,
    usedTorah: 5,
    pdfOpens: 9,
    downloads: 8,
    signups: 1,
    returningReaders: 2,
    searchesTotal: 3,
    searchesWithoutOutcome: 0,
    topSource: { label: "Email", sessions: 6 },
    topCampaign: null,
    topPublication: { title: "Artscroll by the Shabbos Table", pdfOpens: 6, downloadActions: 5 },
    topSourceDownloads: { label: "Email", downloads: 5 },
    filteredAutomationSessions: 2,
    rawSessions: 12,
  };

  it("states the channel share of downloads and search outcomes", () => {
    const notes = buildObservations(base);
    expect(notes[0]).toBe("Email produced 5 of 8 download actions.");
    expect(notes).toContain("No searches failed to lead to content.");
    expect(notes.length).toBeLessThanOrEqual(3);
  });

  it("reports failed searches by count", () => {
    const notes = buildObservations({ ...base, searchesWithoutOutcome: 2 });
    expect(notes).toContain(
      "2 of 3 searches led to no publication, PDF, or download action.",
    );
  });

  it("says nothing happened on a quiet day", () => {
    expect(
      buildObservations({
        ...base,
        people: 0,
        usedTorah: 0,
        pdfOpens: 0,
        downloads: 0,
        signups: 0,
        searchesTotal: 0,
        topPublication: null,
        topSourceDownloads: null,
      }),
    ).toEqual(["No canonical reader activity was recorded in this period."]);
  });

  it("suppresses percentages for small baselines in change lines", () => {
    const lines = buildChangeObservations([
      { label: "People", current: 8, previous: 5 },
      { label: "Download actions", current: 12, previous: 20 },
      { label: "Signups", current: 0, previous: 0 },
    ]);
    expect(lines[0]).toBe("People was up 3 (5 → 8).");
    expect(lines[1]).toBe("Download actions was down 8 (20 → 12), a 40% change.");
    expect(lines).toHaveLength(2);
  });

  it("only compares when a baseline exists", () => {
    expect(hasComparableBaseline({ people: 0, sessions: 0 })).toBe(false);
    expect(hasComparableBaseline({ people: 0, sessions: 3 })).toBe(true);
  });
});
