import { describe, expect, it } from "vitest";
import { pickStarterSelections, type ChooserResource } from "./table-chooser";
import { TFTT_ORIGINAL_SERIES } from "./tftt-originals";

type Row = ChooserResource & { publication_id: string | null };
const [PARSHA, STORIES, MARGINS] = TFTT_ORIGINAL_SERIES.map((s) => s.id);

const make = (id: string, title: string, publication_id: string | null): Row => ({
  id, title, publication_id, audience: "Families", format_type: "Stories", page_count: 2,
  publisher: null, subtitle: null, summary_quick: null, content_type: null,
  primary_category: null, publication: null, tags: [], description: null, featured_slot: null,
});

const weeklyDvar = make("dvar", "The Weekly Dvar", "11111111-1111-1111-1111-111111111111");
const otherStories = make("other-stories", "Stories for the Shabbos Table", null);

describe("homepage starter selections (TFTT originals only)", () => {
  it("shows all three originals in fixed order regardless of collection order", () => {
    const rows = [weeklyDvar, make("m", "In the Margins", MARGINS), make("s", "Stories for the Shabbos Table", STORIES), make("p", "Parsha Challenge", PARSHA)];
    expect(pickStarterSelections(rows).map((p) => p.resource.id)).toEqual(["p", "s", "m"]);
  });

  it("omits a missing Stories issue without any substitute", () => {
    const rows = [make("p", "Parsha Questions & Answers", PARSHA), weeklyDvar, otherStories, make("m", "In the Margins", MARGINS)];
    const picks = pickStarterSelections(rows);
    expect(picks.map((p) => p.resource.id)).toEqual(["p", "m"]);
    expect(picks.some((p) => p.resource.id === "dvar" || p.resource.id === "other-stories")).toBe(false);
  });

  it("restores the Stories slot automatically once this week's issue is published", () => {
    const rows = [make("p", "Parsha Questions & Answers", PARSHA), make("m", "In the Margins", MARGINS), make("s2", "Stories — Vayeira", STORIES)];
    expect(pickStarterSelections(rows).map((p) => p.resource.id)).toEqual(["p", "s2", "m"]);
  });

  it("matches renamed originals by publication ID, not title", () => {
    const rows = [make("p", "Parsha Questions & Answers", PARSHA), make("s", "Shabbos Story: Vayeira", STORIES), make("m", "Margins Vayeira", MARGINS)];
    expect(pickStarterSelections(rows).map((p) => p.key)).toEqual(["kids", "story", "deeper"]);
  });

  it("never selects non-TFTT publications, even with original-looking titles", () => {
    const rows = [weeklyDvar, otherStories, make("x", "Parsha Challenge", "22222222-2222-2222-2222-222222222222"), make("y", "In the Margins", null)];
    expect(pickStarterSelections(rows)).toEqual([]);
  });

  it("returns nothing for an empty weekly collection", () => {
    expect(pickStarterSelections([])).toEqual([]);
  });
});
