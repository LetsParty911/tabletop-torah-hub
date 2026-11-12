import { describe, expect, it } from "vitest";
import {
  activeOriginalSeriesIds,
  groupOriginalEditions,
  originalsPageDescription,
  visibleOriginalSeries,
  type OriginalEditionRow,
} from "./original-editions";
import {
  PARSHA_DETECTIVE_PUBLICATION_ID,
  TFTT_ORIGINAL_EDITION_SERIES,
  TFTT_ORIGINAL_SERIES,
  buildOriginalEditionSeries,
  tfttOriginalSeriesById,
} from "./tftt-originals";

const PC = "0fa3db5f-c153-4311-a007-415c3c022143";
const ST = "88719788-42fb-4e0b-a34b-3ea1868e750d";
const IM = "86d9b1b2-cebf-42e5-b623-dfc1b5c5b411";
// Test-only id; production stays null until the real publications record exists.
const TEST_DETECTIVE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const thumb = (id: string) => `https://x/storage/v1/object/public/pdf-thumbs/${id}.png`;
const row = (id: string, publication_id: string | null, parsha_key: string | null, created_at: string, jewish_year: number | null = 5787): OriginalEditionRow =>
  ({ id, publication_id, parsha_key, jewish_year, created_at });

const toldos = [
  row("t-pc", PC, "Toldos", "2026-11-19T10:00:00Z"),
  row("t-st", ST, "Toldos", "2026-11-19T11:00:00Z"),
  row("t-im", IM, "Toldos", "2026-11-19T12:00:00Z"),
];
const detectiveRow = row("t-pd", TEST_DETECTIVE, "Toldos", "2026-11-19T09:00:00Z");

describe("The Parsha Detective — unconfigured (current shipped state)", () => {
  it("has no canonical id yet and adds nothing to any series list", () => {
    expect(PARSHA_DETECTIVE_PUBLICATION_ID).toBeNull();
    expect(TFTT_ORIGINAL_EDITION_SERIES.map((s) => s.id)).toEqual([PC, ST, IM]);
    expect(TFTT_ORIGINAL_SERIES).toHaveLength(3);
  });

  it("never lists a row titled or tagged like the Detective without the real id", () => {
    const stray = row("stray", "11111111-2222-4333-8444-555555555555", "Toldos", "2026-11-19T13:00:00Z");
    const [g] = groupOriginalEditions([...toldos, stray], thumb);
    expect(g.editions.map((e) => e.id)).toEqual(["t-pc", "t-st", "t-im"]);
    expect(activeOriginalSeriesIds([...toldos, stray])).toEqual([PC, ST, IM]);
  });

  it("keeps the three-series cards and exact existing meta description", () => {
    const visible = visibleOriginalSeries([PC, ST, IM]);
    expect(visible.map((s) => s.title)).toEqual(["Parsha Challenge", "Stories for the Shabbos Table", "In the Margins"]);
    expect(originalsPageDescription(visible)).toBe(
      "Three weekly Torah For The Table original series: Parsha Challenge, Stories for the Shabbos Table, and In the Margins — created for the Shabbos table.",
    );
  });

  it("still shows the three weekly series cards even when the loader returns nothing", () => {
    expect(visibleOriginalSeries(undefined)).toHaveLength(3);
  });
});

describe("buildOriginalEditionSeries", () => {
  it("rejects missing, malformed, nil or duplicate ids", () => {
    for (const bad of [null, undefined, "", "  ", "not-a-uuid", "00000000-0000-0000-0000-000000000000", PC]) {
      expect(buildOriginalEditionSeries(bad).map((s) => s.id)).toEqual([PC, ST, IM]);
    }
  });

  it("appends The Parsha Detective last when a real-shaped id is configured", () => {
    const series = buildOriginalEditionSeries(` ${TEST_DETECTIVE.toUpperCase()} `);
    expect(series.map((s) => s.title)).toEqual([
      "Parsha Challenge",
      "Stories for the Shabbos Table",
      "In the Margins",
      "The Parsha Detective",
    ]);
    expect(series[3].id).toBe(TEST_DETECTIVE);
  });

  it("does not change homepage/publication ownership lookups", () => {
    expect(tfttOriginalSeriesById(TEST_DETECTIVE)).toBeNull();
  });
});

describe("The Parsha Detective — configured", () => {
  const series = buildOriginalEditionSeries(TEST_DETECTIVE);

  it("groups one Detective card per week, last, with its real thumbnail", () => {
    const olderDuplicate = row("t-pd-old", TEST_DETECTIVE, "Toldos", "2026-11-18T09:00:00Z");
    const [g] = groupOriginalEditions([...toldos, detectiveRow, olderDuplicate], thumb, 12, series);
    expect(g.label).toBe("Parshas Toldos 5787");
    expect(g.editions.map((e) => e.id)).toEqual(["t-pc", "t-st", "t-im", "t-pd"]);
    expect(g.editions[3]).toEqual({ id: "t-pd", seriesId: TEST_DETECTIVE, seriesTitle: "The Parsha Detective", thumbUrl: thumb("t-pd") });
  });

  it("leaves earlier weeks with only their real three editions", () => {
    const chayei = [row("cs-pc", PC, "Chayei Sara", "2026-11-05T10:00:00Z", 5787)];
    const groups = groupOriginalEditions([...toldos, detectiveRow, ...chayei], thumb, 12, series);
    expect(groups.map((g) => g.parshaKey)).toEqual(["Toldos", "Chayei Sara"]);
    expect(groups[1].editions.map((e) => e.id)).toEqual(["cs-pc"]);
  });

  it("hides the Detective card until a listable published edition exists", () => {
    expect(visibleOriginalSeries(activeOriginalSeriesIds(toldos, series), series)).toHaveLength(3);
    const unlistable = row("t-pd-x", TEST_DETECTIVE, null, "2026-11-19T09:00:00Z");
    expect(activeOriginalSeriesIds([...toldos, unlistable], series)).toEqual([PC, ST, IM]);
    const active = activeOriginalSeriesIds([...toldos, detectiveRow], series);
    expect(active).toEqual([PC, ST, IM, TEST_DETECTIVE]);
    expect(visibleOriginalSeries(active, series).map((s) => s.title)).toContain("The Parsha Detective");
  });

  it("updates the meta description to name all four series once visible", () => {
    const visible = visibleOriginalSeries([PC, ST, IM, TEST_DETECTIVE], series);
    expect(originalsPageDescription(visible)).toBe(
      "Torah For The Table original series: Parsha Challenge, Stories for the Shabbos Table, In the Margins, and The Parsha Detective — created for the Shabbos table.",
    );
  });
});
