import { describe, expect, it } from "vitest";
import { activeOriginalSeriesIds, groupOriginalEditions, originalsPageDescription, visibleOriginalSeries, type OriginalEditionRow } from "./original-editions";
import { PARSHA_DETECTIVE_PUBLICATION_ID, TFTT_ORIGINAL_EDITION_SERIES, TFTT_ORIGINAL_SERIES, tfttOriginalSeriesById } from "./tftt-originals";

const PC = "0fa3db5f-c153-4311-a007-415c3c022143";
const ST = "88719788-42fb-4e0b-a34b-3ea1868e750d";
const IM = "86d9b1b2-cebf-42e5-b623-dfc1b5c5b411";
const PP = "81b9fadd-3f96-43a2-b21d-6619567e8b1b";
const row = (id: string, publication_id: string, parsha_key = "Vayetzei"): OriginalEditionRow => ({
  id, publication_id, parsha_key, jewish_year: 5787, created_at: "2026-11-16T12:00:00Z",
});

describe("four active weekly originals", () => {
  it("uses the verified publication IDs and stable fixed order", () => {
    expect(TFTT_ORIGINAL_SERIES.map((s) => s.id)).toEqual([PC, ST, IM, PP]);
    expect(TFTT_ORIGINAL_EDITION_SERIES.map((s) => s.title)).toEqual([
      "Parsha Questions & Answers",
      "Stories for the Shabbos Table",
      "In the Margins",
      "Parsha Pearls",
    ]);
  });

  it("always shows four series descriptions, even with no current PDF", () => {
    expect(visibleOriginalSeries([]).map((s) => s.id)).toEqual([PC, ST, IM, PP]);
    expect(visibleOriginalSeries(undefined)).toHaveLength(4);
    expect(originalsPageDescription(visibleOriginalSeries([]))).toContain("Parsha Pearls");
    expect(originalsPageDescription(visibleOriginalSeries([]))).not.toContain("The Parsha Detective");
  });

  it("publishes only real editions and never borrows an old or third-party PDF", () => {
    const rows = [row("qa", PC), row("stories", ST), row("margins", IM), row("pearls", PP), row("old-detective", PARSHA_DETECTIVE_PUBLICATION_ID)];
    const [group] = groupOriginalEditions(rows, (id) => `thumb/${id}`);
    expect(group.editions.map((e) => e.id)).toEqual(["qa", "stories", "margins", "pearls"]);
    expect(activeOriginalSeriesIds(rows)).toEqual([PC, ST, IM, PP]);
  });

  it("does not promote discontinued Detective as a current original, but keeps its historical attribution", () => {
    expect(TFTT_ORIGINAL_EDITION_SERIES.some((s) => s.id === PARSHA_DETECTIVE_PUBLICATION_ID)).toBe(false);
    expect(tfttOriginalSeriesById(PARSHA_DETECTIVE_PUBLICATION_ID)?.title).toBe("The Parsha Detective");
  });

  it("does not invent a Parsha Pearls edition before one is published", () => {
    const rows = [row("qa", PC), row("stories", ST), row("margins", IM)];
    expect(groupOriginalEditions(rows, () => null)[0].editions.map((e) => e.seriesTitle)).toEqual([
      "Parsha Questions & Answers", "Stories for the Shabbos Table", "In the Margins"
    ]);
  });
});
