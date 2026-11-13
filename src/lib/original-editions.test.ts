import { describe, expect, it } from "vitest";
import { groupOriginalEditions, type OriginalEditionRow } from "./original-editions";

const PC = "0fa3db5f-c153-4311-a007-415c3c022143";
const ST = "88719788-42fb-4e0b-a34b-3ea1868e750d";
const IM = "86d9b1b2-cebf-42e5-b623-dfc1b5c5b411";
const thumb = (id: string) => `https://x/storage/v1/object/public/pdf-thumbs/${id}.png`;
const row = (id: string, publication_id: string | null, parsha_key: string, created_at: string, jewish_year = 5787): OriginalEditionRow =>
  ({ id, publication_id, parsha_key, jewish_year, created_at });

const vayeira = [
  row("15ef7728-7a4e-4f40-94ce-ed9796eb4aff", ST, "Vayeira", "2026-10-29T12:00:00Z"),
  row("18229ea5-3f75-4160-aca6-801749532fb4", IM, "Vayeira", "2026-10-29T11:00:00Z"),
  row("8c7e8593-cebf-4bf4-b53c-ad41691cd3c9", PC, "Vayeira", "2026-10-29T10:00:00Z"),
];
const lech = [
  row("611de75b", PC, "Lech Lecha", "2026-10-22T10:00:00Z"),
  row("61eebe2f", ST, "Lech Lecha", "2026-10-22T11:00:00Z"),
  row("597628ed", IM, "Lech Lecha", "2026-10-22T12:00:00Z"),
];

describe("groupOriginalEditions", () => {
  it("shows the three Vayeira 5787 originals first, in series order, with thumbnails", () => {
    const [g] = groupOriginalEditions([...lech, ...vayeira], thumb);
    expect(g.label).toBe("Parshas Vayeira 5787");
    expect(g.editions.map((e) => e.id)).toEqual([
      "8c7e8593-cebf-4bf4-b53c-ad41691cd3c9",
      "15ef7728-7a4e-4f40-94ce-ed9796eb4aff",
      "18229ea5-3f75-4160-aca6-801749532fb4",
    ]);
    expect(g.editions.map((e) => e.seriesTitle)).toEqual(["Parsha Questions & Answers", "Stories for the Shabbos Table", "In the Margins"]);
    expect(g.editions[0].thumbUrl).toBe(thumb("8c7e8593-cebf-4bf4-b53c-ad41691cd3c9"));
  });

  it("picks up newly published Chayei Sarah rows automatically as the newest group", () => {
    const chayei = [row("cs-pc", PC, "Chayei Sara", "2026-11-05T10:00:00Z"), row("cs-im", IM, "Chayei Sara", "2026-11-05T11:00:00Z")];
    const groups = groupOriginalEditions([...vayeira, ...lech, ...chayei], thumb);
    expect(groups.map((g) => g.parshaKey)).toEqual(["Chayei Sara", "Vayeira", "Lech Lecha"]);
    // Only the real published ones; Vayeira's Stories is never borrowed.
    expect(groups[0].editions.map((e) => e.id)).toEqual(["cs-pc", "cs-im"]);
  });

  it("ignores non-canonical publications even with matching titles, and rows lacking parsha/year", () => {
    const groups = groupOriginalEditions([
      ...vayeira,
      row("third-party", "11111111-1111-1111-1111-111111111111", "Vayeira", "2026-10-30T00:00:00Z"),
      row("no-pub", null, "Vayeira", "2026-10-30T00:00:00Z"),
      { id: "no-year", publication_id: PC, parsha_key: "Vayeira", jewish_year: null, created_at: "2026-10-30T00:00:00Z" },
    ], thumb);
    expect(groups).toHaveLength(1);
    expect(groups[0].editions).toHaveLength(3);
  });

  it("orders by Jewish year then reading order, not upload time", () => {
    const lateUpload = row("late-noach", PC, "Noach", "2026-11-10T00:00:00Z");
    const groups = groupOriginalEditions([lateUpload, ...vayeira, row("old", PC, "Vayeira", "2025-11-01T00:00:00Z", 5786)], thumb);
    expect(groups.map((g) => g.label)).toEqual(["Parshas Vayeira 5787", "Parshas Noach 5787", "Parshas Vayeira 5786"]);
  });

  it("keeps one card per series per week (latest upload)", () => {
    const groups = groupOriginalEditions([...vayeira, row("pc-newer", PC, "Vayeira", "2026-10-30T00:00:00Z")], thumb);
    expect(groups[0].editions.map((e) => e.id)[0]).toBe("pc-newer");
    expect(groups[0].editions).toHaveLength(3);
  });
});
