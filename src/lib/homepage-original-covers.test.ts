import { describe, expect, it } from "vitest";
import { hasAllOriginalCovers } from "./homepage-original-covers";
import { ORIGINAL_PROMOTION_SERIES } from "./originals-promotion";

describe("redundant homepage originals artwork", () => {
  const allSeven = ORIGINAL_PROMOTION_SERIES.map((series) => ({ publication_id: series.publicationId }));
  it("hides repeated artwork when all seven canonical series are visible", () => {
    expect(allSeven).toHaveLength(7);
    expect(hasAllOriginalCovers(allSeven, ORIGINAL_PROMOTION_SERIES)).toBe(true);
  });
  it("retains discovery when filtering removes any one series", () => {
    for (let excluded = 0; excluded < 7; excluded += 1) {
      expect(hasAllOriginalCovers(allSeven.filter((_, index) => index !== excluded), ORIGINAL_PROMOTION_SERIES)).toBe(false);
    }
  });
  it("does not count unrelated or unregistered publications", () => {
    expect(hasAllOriginalCovers([{ publication_id: "unrelated" }], ORIGINAL_PROMOTION_SERIES)).toBe(false);
    expect(hasAllOriginalCovers([{ publication_id: null }], [{ publicationId: null }])).toBe(false);
    expect(hasAllOriginalCovers([], [])).toBe(false);
  });
});