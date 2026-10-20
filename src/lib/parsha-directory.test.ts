import { describe, expect, it } from "vitest";
import { PARSHIYOS, YOM_TOV_KEYS } from "./parshiyos";
import { readingSlug, readingPagePath } from "./reading-page";
import { DIRECTORY_PARSHIYOS, canonicalParshaForSlug, isDirectoryParshaSlug } from "./parsha-directory";

describe("permanent Parsha directory and sitemap", () => {
  it("includes all 54 single readings and combined readings without the Yom Tov routes", () => {
    expect(DIRECTORY_PARSHIYOS).toEqual(PARSHIYOS.filter((key) => !YOM_TOV_KEYS.includes(key)));
    expect(DIRECTORY_PARSHIYOS).toContain("Acharei Mos-Kedoshim");
    expect(DIRECTORY_PARSHIYOS).toContain("Matos-Masei");
    expect(DIRECTORY_PARSHIYOS).toContain("Nitzavim-Vayeilech");
    expect(DIRECTORY_PARSHIYOS).toContain("Vayakhel-Pekudei");
    expect(DIRECTORY_PARSHIYOS).not.toContain("Sukkos");
  });

  it("resolves every listed reading using the same canonical slug as the sitemap", () => {
    for (const reading of DIRECTORY_PARSHIYOS) {
      const slug = readingSlug(reading);
      expect(isDirectoryParshaSlug(slug)).toBe(true);
      expect(canonicalParshaForSlug(slug)).toBe(reading);
      expect(readingPagePath(reading, 5786)).toBe(`/parsha/${slug}/5786`);
    }
  });

  it("never incorrectly emits a permanent Parsha page for a Yom Tov", () => {
    for (const holiday of YOM_TOV_KEYS) {
      expect(isDirectoryParshaSlug(readingSlug(holiday))).toBe(false);
      expect(canonicalParshaForSlug(readingSlug(holiday))).toBeNull();
      expect(readingPagePath(holiday, 5787).startsWith("/yom-tov/")).toBe(true);
    }
    expect(canonicalParshaForSlug("nonexistent-reading")).toBeNull();
  });

  it("has no slug collisions (every permanent route resolves to one reading)", () => {
    const slugs = DIRECTORY_PARSHIYOS.map(readingSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
