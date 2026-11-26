import { describe, expect, it } from "vitest";
import { currentOriginalBundles, originalBundleFilename, type OriginalBundleResource } from "@/lib/original-bundles";
import { ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";

const currentResources = ORIGINAL_PROMOTION_SERIES.map((series, index) => ({
  id: `current-${index}`,
  title: series.title,
  url: `https://example.test/current-${index}.pdf`,
  parsha_key: "vayetzei",
  publication_id: series.publicationId,
}));

function bundle(resources: readonly OriginalBundleResource[], key = "vayetzei", fallback = false) {
  return currentOriginalBundles(resources, key, fallback);
}

describe("currentOriginalBundles", () => {
  it("uses the approved three audiences and exact seven canonical series", () => {
    const result = bundle(currentResources);
    expect(result.map((item) => item.title)).toEqual(["Children's Bundle", "Family Bundle", "Deeper Learning Bundle"]);
    expect(result.map((item) => item.items.map(({ series }) => series.key))).toEqual([
      ["qa", "stories"],
      ["medrash", "questions"],
      ["margins", "ramban", "chizkuni"],
    ]);
    expect(result.every((item) => item.isComplete)).toBe(true);
    expect(result.map((item) => item.availableCount)).toEqual([2, 2, 3]);
  });

  it("marks partial availability without presenting the bundle as complete", () => {
    const result = bundle(currentResources.filter((resource) => resource.publication_id !== ORIGINAL_PROMOTION_SERIES[1]?.publicationId));
    expect(result[0]?.availableCount).toBe(1);
    expect(result[0]?.isComplete).toBe(false);
    expect(result[0]?.items[1]?.resource).toBeNull();
    expect(result[1]?.isComplete).toBe(true);
  });

  it("rejects historical or missing-week editions even when the series ID matches", () => {
    const historical = currentResources.map((resource) => ({ ...resource, parsha_key: "toldos" }));
    const result = bundle([...historical, { ...currentResources[0]!, parsha_key: null }]);
    expect(result.every((item) => item.availableCount === 0 && !item.isComplete)).toBe(true);
  });

  it("makes every bundle unavailable for a fallback collection", () => {
    const result = bundle(currentResources, "vayetzei", true);
    expect(result.every((item) => item.availableCount === 0 && !item.isComplete)).toBe(true);
  });

  it("matches reading keys consistently without matching by title", () => {
    const impostor = { ...currentResources[0]!, publication_id: null, title: ORIGINAL_PROMOTION_SERIES[0]!.title };
    const canonical = { ...currentResources[0]!, parsha_key: "Parshas Vayetzei" };
    const result = bundle([impostor, canonical], "Vayetzei");
    expect(result[0]?.items[0]?.resource?.id).toBe(canonical.id);
    expect(result[0]?.availableCount).toBe(1);
  });

  it("creates a clean descriptive PDF filename", () => {
    expect(originalBundleFilename(bundle(currentResources)[0]!, "Parshas Vayetzei 5787")).toBe("Childrens-Bundle-Parshas-Vayetzei-5787.pdf");
  });
});
