import { describe, expect, it } from "vitest";
import {
  BEREISHIS_ORIGINAL_PILOT,
  getBereishisPilotOriginal,
  isEligibleBereishisOriginal,
  preserveReviewedArticleText,
} from "./bereishis-original-html";

describe("Bereishis original HTML pilot access", () => {
  const item = BEREISHIS_ORIGINAL_PILOT[0];
  const row = {
    id: item.id,
    publication_id: item.publicationId,
    parsha_key: "Bereishis",
    jewish_year: 5787,
    published: true,
    file_path: "Bereishis/current-publication.pdf",
  };

  it("restricts the pilot to two known original publications", () => {
    expect(BEREISHIS_ORIGINAL_PILOT).toHaveLength(2);
    expect(getBereishisPilotOriginal(item.id)).toEqual(item);
    expect(getBereishisPilotOriginal("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("requires an exact publication, year, parsha, published status and source path", () => {
    expect(isEligibleBereishisOriginal(row)).toBe(true);
    expect(isEligibleBereishisOriginal({ ...row, published: false })).toBe(false);
    expect(isEligibleBereishisOriginal({ ...row, jewish_year: 5786 })).toBe(false);
    expect(isEligibleBereishisOriginal({ ...row, parsha_key: "Noach" })).toBe(false);
    expect(isEligibleBereishisOriginal({ ...row, publication_id: null })).toBe(false);
    expect(isEligibleBereishisOriginal({ ...row, file_path: "" })).toBe(false);
    expect(isEligibleBereishisOriginal({ ...row, id: "00000000-0000-0000-0000-000000000000" })).toBe(false);
  });

  it("does not rewrite authors' wording or transliteration", () => {
    expect(preserveReviewedArticleText("  R' Akiva\n\nHashem — ברוך הוא\r\n  ")).toBe("R' Akiva\n\nHashem — ברוך הוא");
  });
});
