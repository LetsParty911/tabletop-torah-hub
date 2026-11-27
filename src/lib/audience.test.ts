import { describe, expect, it } from "vitest";
import { audienceDisplay, normalizeAudiences } from "./audience";
import { FORTHCOMING_TFTT_ORIGINALS, TFTT_ORIGINAL_SERIES } from "./tftt-originals";

describe("effective audience memberships", () => {
  it("includes Stories and Questions & Answers in both Children and Families", () => {
    for (const series of TFTT_ORIGINAL_SERIES.slice(0, 2)) {
      expect(normalizeAudiences("Families", series.title, series.id)).toEqual(["Children", "Families"]);
      expect(audienceDisplay("Families", series.title, series.id)).toBe("Children and Families");
    }
  });
  it("includes Family bundle discussion material in Families and Deeper Learning", () => {
    for (const series of [FORTHCOMING_TFTT_ORIGINALS.medrash, FORTHCOMING_TFTT_ORIGINALS.questions]) {
      expect(normalizeAudiences("Adults", series.title, series.id)).toEqual(["Families", "Adults"]);
    }
  });
  it("preserves ordinary audiences and does not infer a canonical ID from a title", () => {
    expect(normalizeAudiences("Families", "Stories for the Shabbos Table", "other")).toEqual(["Families"]);
    expect(normalizeAudiences("Adults")).toEqual(["Adults"]);
    expect(normalizeAudiences(null, "Torah Wellsprings")).toEqual([]);
  });
  it("parses multiple audience labels and removes duplicates", () => {
    expect(normalizeAudiences("Children and Families · Children")).toEqual(["Children", "Families"]);
    expect(normalizeAudiences("Families · Deeper Learning")).toEqual(["Families", "Adults"]);
  });
});
