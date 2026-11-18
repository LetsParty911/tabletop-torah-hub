import { describe, expect, it } from "vitest";
import { excludeShownOriginals } from "./homepage-dedupe";

describe("mobile quick list does not repeat the original-series cards", () => {
  const items = [{ id: "qa" }, { id: "stories" }, { id: "margins" }, { id: "pearls" }, { id: "outside-1" }];
  it("keeps only selections not already shown as originals", () => {
    expect(excludeShownOriginals(items, ["qa", "stories", "margins", "pearls"])).toEqual([{ id: "outside-1" }]);
  });
  it("is empty when the only selections are the four originals", () => {
    expect(excludeShownOriginals(items.slice(0, 4), ["qa", "stories", "margins", "pearls"])).toEqual([]);
  });
  it("keeps everything when no originals are shown (fallback week)", () => {
    expect(excludeShownOriginals(items, [])).toHaveLength(5);
  });
});
