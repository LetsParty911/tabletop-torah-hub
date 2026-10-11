// Run with: bunx bun test src/lib/hebcal.test.ts
import { describe, expect, it } from "bun:test";
import {
  resolveReadingFromHebcal,
  upcomingShabbosDate,
  hebcalShabbatUrlForDate,
  readingDateAfterHavdalah,
  type HebcalShabbat,
} from "@/lib/hebcal";

const NOW = new Date("2026-09-06T12:00:00Z"); // Sunday

describe("resolveReadingFromHebcal", () => {
  it("ordinary Shabbos returns the weekly parsha", () => {
    const data: HebcalShabbat = {
      range: { start: "2026-08-28", end: "2026-08-29" },
      items: [
        { title: "Parashat Ki Tavo", category: "parashat", date: "2026-08-29", hdate: "16 Elul 5786" },
      ],
    };
    const r = resolveReadingFromHebcal(data, new Date("2026-08-27T12:00:00Z"));
    expect(r.parshaKey).toBe("Ki Savo");
    expect(r.label).toBe("Parshas Ki Savo");
    expect(r.readingDate).toBe("2026-08-29");
  });

  it("Shabbos Rosh Hashanah with no parashat item returns Rosh Hashanah", () => {
    const data: HebcalShabbat = {
      range: { start: "2026-09-11", end: "2026-09-12" },
      items: [
        { title: "Erev Rosh Hashana", category: "holiday", subcat: "major", date: "2026-09-11" },
        { title: "Rosh Hashana 5787", category: "holiday", subcat: "major", date: "2026-09-12", hdate: "1 Tishrei 5787" },
      ],
    };
    const r = resolveReadingFromHebcal(data, NOW);
    expect(r.parshaKey).toBe("Rosh Hashanah");
    expect(r.label).toBe("Rosh Hashanah");
    expect(r.readingDate).toBe("2026-09-12");
    expect(r.isStaticFallback).toBe(false);
  });

  it("empty/failed payload stays neutral instead of guessing a parsha", () => {
    const r = resolveReadingFromHebcal({ items: [], range: null }, NOW);
    expect(r.parshaKey).toBeNull();
    expect(r.label).toBe("Parshas Hashavua");
    expect(r.isStaticFallback).toBe(true);
  });

  it("Bereishis after Simchas Torah: parashat wins over adjacent Yom Tov", () => {
    const data: HebcalShabbat = {
      range: { start: "2026-10-09", end: "2026-10-10" },
      items: [
        { title: "Simchat Torah", category: "holiday", subcat: "major", date: "2026-10-04", yomtov: true },
        { title: "Parashat Bereshit", category: "parashat", date: "2026-10-10" },
      ],
    };
    const r = resolveReadingFromHebcal(data, new Date("2026-10-04T16:00:00Z"));
    expect(r.parshaKey).toBe("Bereishis");
    expect(r.readingDate).toBe("2026-10-10");
  });
});

describe("rollover-safe target date", () => {
  it("Sunday Oct 4 2026 (Eastern) targets Shabbos Oct 10", () => {
    expect(upcomingShabbosDate(new Date("2026-10-04T16:00:00Z"))).toBe("2026-10-10");
    // Saturday night 11pm ET is still Shabbos Oct 3; just after midnight ET rolls over.
    expect(upcomingShabbosDate(new Date("2026-10-04T03:00:00Z"))).toBe("2026-10-03");
    expect(upcomingShabbosDate(new Date("2026-10-04T04:30:00Z"))).toBe("2026-10-10");
  });

  it("URL pins the explicit date and stays Diaspora", () => {
    const url = hebcalShabbatUrlForDate("2026-10-10");
    expect(url).toContain("gy=2026&gm=10&gd=10");
    expect(url).not.toContain("i=on");
  });
});

describe("automatic Motzei Shabbos rollover", () => {
  const havdalahWeek = (date: string, havdalahDate?: string): HebcalShabbat => ({
    range: { start: date, end: date },
    items: [
      { title: "This week's reading", category: "parashat", date },
      ...(havdalahDate
        ? [{ title: "Havdalah", category: "havdalah", date: havdalahDate }]
        : []),
    ],
  });

  it("keeps Bereishis until Havdalah, then selects the following Shabbos before midnight", () => {
    const week = havdalahWeek("2026-10-10", "2026-10-10T19:00:00-04:00");
    expect(readingDateAfterHavdalah(new Date("2026-10-10T22:59:00Z"), week)).toBe("2026-10-10");
    expect(readingDateAfterHavdalah(new Date("2026-10-10T23:00:00Z"), week)).toBe("2026-10-17");
    expect(readingDateAfterHavdalah(new Date("2026-10-11T00:30:00Z"), week)).toBe("2026-10-17");
  });

  it("uses the timezone-aware Havdalah event in both winter and summer", () => {
    const winter = havdalahWeek("2026-12-05", "2026-12-05T17:30:00-05:00");
    expect(readingDateAfterHavdalah(new Date("2026-12-05T22:29:00Z"), winter)).toBe("2026-12-05");
    expect(readingDateAfterHavdalah(new Date("2026-12-05T22:30:00Z"), winter)).toBe("2026-12-12");

    const summer = havdalahWeek("2026-06-20", "2026-06-20T21:30:00-04:00");
    expect(readingDateAfterHavdalah(new Date("2026-06-21T01:29:00Z"), summer)).toBe("2026-06-20");
    expect(readingDateAfterHavdalah(new Date("2026-06-21T01:30:00Z"), summer)).toBe("2026-06-27");
  });

  it("does not advance early when the precise Saturday Havdalah time is absent", () => {
    expect(
      readingDateAfterHavdalah(new Date("2026-10-10T23:30:00Z"), havdalahWeek("2026-10-10")),
    ).toBe("2026-10-10");
    // A Sunday Yom Tov ending does not count as a Saturday Havdalah event.
    expect(
      readingDateAfterHavdalah(
        new Date("2026-10-10T23:30:00Z"),
        havdalahWeek("2026-10-10", "2026-10-11T20:00:00-04:00"),
      ),
    ).toBe("2026-10-10");
    // Hebcal's event must carry a timezone offset, never the server's local timezone.
    expect(
      readingDateAfterHavdalah(
        new Date("2026-10-10T23:30:00Z"),
        havdalahWeek("2026-10-10", "2026-10-10T19:00:00"),
      ),
    ).toBe("2026-10-10");
    expect(
      readingDateAfterHavdalah(new Date("2026-10-11T04:01:00Z"), havdalahWeek("2026-10-10")),
    ).toBe("2026-10-17");
  });

  it("uses the latest Saturday Havdalah time if multiple are provided", () => {
    const week = havdalahWeek("2026-10-10", "2026-10-10T19:00:00-04:00");
    week.items.push({
      title: "Later Havdalah",
      date: "2026-10-10T20:00:00-04:00",
      category: "havdalah",
    });
    expect(readingDateAfterHavdalah(new Date("2026-10-10T23:30:00Z"), week)).toBe("2026-10-10");
    expect(readingDateAfterHavdalah(new Date("2026-10-11T00:00:00Z"), week)).toBe("2026-10-17");
  });
});
