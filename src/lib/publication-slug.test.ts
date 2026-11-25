import { describe, expect, it } from "vitest";
import { canonicalPublicationName, canonicalPublicationSlug, findPublicationBySlug, publicationSlug } from "./publication-slug";
import { TFTT_ORIGINAL_SERIES, FORTHCOMING_TFTT_ORIGINALS } from "./tftt-originals";

describe("canonical publication URL identity", () => {
  const ramban = { id: TFTT_ORIGINAL_SERIES[3].id, name: "Parsha Pearls" };
  const renamed = { ...ramban, name: "Parsha Pearls from the Ramban" };
  it("uses the registered series title even when stored metadata is old", () => {
    expect(canonicalPublicationName(ramban)).toBe("Parsha Pearls from the Ramban");
    expect(canonicalPublicationSlug(ramban)).toBe("parsha-pearls-from-the-ramban");
    expect(canonicalPublicationSlug(renamed)).toBe(canonicalPublicationSlug(ramban));
  });
  it("resolves former routes after the database title has changed", () => {
    expect(findPublicationBySlug([renamed], "parsha-pearls")).toEqual(renamed);
    expect(findPublicationBySlug([renamed], "parsha-pearls-on-the-ramban")).toEqual(renamed);
    expect(findPublicationBySlug([renamed], "parsha-pearls-from-the-ramban")).toEqual(renamed);
    const qa = { id: TFTT_ORIGINAL_SERIES[0].id, name: "Parsha Questions & Answers" };
    expect(findPublicationBySlug([qa], "parsha-challenge")).toEqual(qa);
    const medrash = { id: FORTHCOMING_TFTT_ORIGINALS.medrash.id!, name: "Treasures from the Medrash" };
    expect(findPublicationBySlug([medrash], "treasures-of-the-medrash")).toEqual(medrash);
  });
  it("keeps unrelated publication identity and prefers real current names over aliases", () => {
    const other = { id: "other", name: "Parsha Pearls" };
    expect(canonicalPublicationName(other)).toBe("Parsha Pearls");
    expect(findPublicationBySlug([renamed, other], "parsha-pearls")).toEqual(other);
    expect(findPublicationBySlug([other], "unrelated")).toBeUndefined();
    expect(publicationSlug("R' Yehuda Zev Klein")).toBe("r-yehuda-zev-klein");
  });
});
