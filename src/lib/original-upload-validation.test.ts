import { describe, expect, it } from "vitest";
import { TFTT_ORIGINAL_EDITION_SERIES, TFTT_ORIGINAL_SERIES } from "./tftt-originals";
import { originalPublicationError, originalPublicationEditError, requiredOriginalSeries } from "./original-upload-validation";

describe("original upload association", () => {
  it("requires the correct registered ID for each of the seven reserved titles", () => {
    expect(TFTT_ORIGINAL_EDITION_SERIES).toHaveLength(7);
    for (const series of TFTT_ORIGINAL_EDITION_SERIES) {
      expect(originalPublicationError(series.title, null)).toContain("registered series");
      expect(originalPublicationError(series.title, "")).toContain("registered series");
      expect(originalPublicationError(series.title, "unrelated")).toContain("registered series");
      expect(originalPublicationError(series.title, series.id)).toBeNull();
    }
  });
  it("recognizes the full Ramban title and its historical names, not just Parsha Pearls", () => {
    const id = TFTT_ORIGINAL_SERIES[3].id;
    for (const title of ["Parsha Pearls", "Parsha Pearls from the Ramban", "  PARSHA  PEARLS ON THE RAMBAN  "]) {
      expect(requiredOriginalSeries(title)?.id).toBe(id);
      expect(originalPublicationError(title, TFTT_ORIGINAL_SERIES[0].id)).toContain("Parsha Pearls from the Ramban");
      expect(originalPublicationError(title, id)).toBeNull();
    }
  });
  it("recognizes legacy Q&A and Medrash titles without guessing by partial matches", () => {
    expect(originalPublicationError("Parsha Challenge", null)).toContain("Parsha Questions & Answers");
    expect(originalPublicationError("Treasures of the Medrash", null)).toContain("Treasures from the Medrash");
    expect(originalPublicationError("A new perspective on Parsha Pearls", null)).toBeNull();
    expect(originalPublicationError("An outside publisher", null)).toBeNull();
    expect(originalPublicationError("An individual poetry article", "outside-series")).toBeNull();
  });
  it("allows linked historical Yom Tov editions but not removing their series association", () => {
    const current = { title: "Stories for the Sukkah", publication_id: TFTT_ORIGINAL_SERIES[1].id };
    expect(originalPublicationError(current.title, current.publication_id)).toBeNull();
    expect(originalPublicationEditError(current, current)).toBeNull();
    expect(originalPublicationEditError(current, { ...current, publication_id: null })).toContain("cannot be removed");
    expect(originalPublicationEditError(current, { title: "Stories for the Shabbos Table", publication_id: TFTT_ORIGINAL_SERIES[0].id })).toContain("registered series");
  });
  it("permits an explicit repair of an unlinked original", () => {
    const title = "Parsha Pearls from the Ramban";
    expect(originalPublicationEditError({ title, publication_id: null }, { title, publication_id: TFTT_ORIGINAL_SERIES[3].id })).toBeNull();
  });
});
