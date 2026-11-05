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
