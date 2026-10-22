import { describe, expect, it } from "vitest";
import { pickStarterSelections, type ChooserResource } from "./table-chooser";

const make = (id: string, audience: string, format_type: string, page_count: number): ChooserResource => ({
  id, title: id, audience, format_type, page_count, publisher: null, subtitle: null,
  summary_quick: null, content_type: null, primary_category: null, publication: null,
  tags: [], description: null, featured_slot: null,
});
describe("homepage starter selections", () => {
  it("selects distinct published candidates only from the supplied weekly collection", () => {
    const rows = [make("quick", "Adults", "Short Vorts", 2),
      make("kids", "Children", "Stories", 4), make("family", "Families", "Essays", 6)];
    const picks = pickStarterSelections(rows);
    expect(picks.map((p) => p.key)).toEqual(["quick", "kids", "family"]);
    expect(new Set(picks.map((p) => p.resource.id)).size).toBe(3);
  });
  it("does not invent unavailable categories or repeat one resource", () => {
    const picks = pickStarterSelections([make("only", "Children", "Short Vorts", 2)]);
    expect(new Set(picks.map((p) => p.resource.id)).size).toBe(picks.length);
    expect(picks.length).toBe(1);
  });
  it("prioritizes the three named series in exact order regardless of category score", () => {
    const rows = [
      make("other-quick", "Adults", "Short Vorts", 1),
      make("other-kids", "Children", "Stories", 2),
      make("In the Margins", "Adults", "Essays", 8),
      make("Stories for the Shabbos Table", "Families", "Stories", 4),
      make("Parsha Questions & Answers", "Children", "Short Vorts", 3),
    ];
    const picks = pickStarterSelections(rows);
    expect(picks.map((p) => p.resource.title)).toEqual([
      "Parsha Questions & Answers",
      "Stories for the Shabbos Table",
      "In the Margins",
    ]);
    expect(picks.map((p) => p.key)).toEqual(["kids", "story", "deeper"]);
  });
  it("fills an absent priority series from published candidates without duplicates", () => {
    const rows = [
      make("Parsha Questions & Answers", "Children", "Short Vorts", 3),
      make("another-story", "Families", "Stories", 2),
      make("other-quick", "Adults", "Short Vorts", 2),
    ];
    const picks = pickStarterSelections(rows);
    expect(picks[0].resource.title).toBe("Parsha Questions & Answers");
    expect(new Set(picks.map((p) => p.resource.id)).size).toBe(picks.length);
    expect(picks.length).toBe(3);
  });
  it("handles an unpublished weekly collection without showing fake choices", () => {
    expect(pickStarterSelections([])).toEqual([]);
  });
});
