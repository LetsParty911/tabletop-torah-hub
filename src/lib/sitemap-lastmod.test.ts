import { describe, expect, it } from "vitest";
import { latestSitemapDate } from "./sitemap-lastmod";

describe("sitemap hub lastmod aggregation", () => {
  it("uses the newest real published edition modification date", () => {
    const dates = ["2026-10-29", "2026-11-05", "2026-10-31"];
    expect(dates.reduce<string | null>((last, date) => latestSitemapDate(last, date), null)).toBe("2026-11-05");
  });
  it("does not invent a date when none was recorded", () => {
    expect(latestSitemapDate(null, null)).toBeNull();
    expect(latestSitemapDate("2026-11-05", null)).toBe("2026-11-05");
    expect(latestSitemapDate(null, "2026-11-05")).toBe("2026-11-05");
  });
});


describe("sitemap reading identities", () => {
  it("reuses the public reading-library canonical identity for combined readings and aliases", async () => {
    const { canonicalLibraryReading } = await import("./reading-library");
    const { readingSlug, readingPagePath, isYomTovReading } = await import("./reading-page");
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/routes/sitemap[.]xml.ts", "utf8");
    expect(source).toContain("canonicalLibraryReading(row.parsha_key)");
    expect(source).toContain("canonical && !isYomTovReading(reading)");
    expect(source).toContain("readingPagePath(reading, row.jewish_year)");
    expect(readingSlug(canonicalLibraryReading("Acharei Mot-Kedoshim")!)).toBe("acharei-mos-kedoshim");
    expect(readingPagePath(canonicalLibraryReading("Vayeitzei")!, 5787)).toBe("/parsha/vayetzei/5787");
    expect(isYomTovReading(canonicalLibraryReading("Sukkot")!)).toBe(true);
  });
});
