// Run with: bunx bun test src/lib/hebcal.test.ts
import { describe, expect, it } from "bun:test";
import { resolveReadingFromHebcal, type HebcalShabbat } from "@/lib/hebcal";

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
});
