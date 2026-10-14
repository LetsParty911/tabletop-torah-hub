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
  it("handles an unpublished weekly collection without showing fake choices", () => {
    expect(pickStarterSelections([])).toEqual([]);
  });
});
