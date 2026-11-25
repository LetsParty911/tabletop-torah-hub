import { describe, expect, it } from "vitest";
import { ORIGINAL_PROMOTION_SERIES, NEW_ORIGINAL_SERIES, canShowOriginalsLaunch, promotionSeriesById, originalsPromotionDescription, latestPromotionEdition } from "./originals-promotion";
import { TFTT_ORIGINAL_SERIES, PARSHA_DETECTIVE_PUBLICATION_ID } from "./tftt-originals";

describe("Originals promotional catalog", () => {
  it("lists seven unique editorial titles in the approved order", () => {
    expect(ORIGINAL_PROMOTION_SERIES.map((s) => s.title)).toEqual([
      "Parsha Questions & Answers",
      "Stories for the Shabbos Table",
      "In the Margins",
      "Parsha Pearls from the Ramban",
      "Chizkuni Insights",
      "Treasures from the Medrash",
      "Questions Beneath the Surface",
    ]);
    expect(new Set(ORIGINAL_PROMOTION_SERIES.map((s) => s.key)).size).toBe(7);
  });
  it("uses only verified IDs and preserves archive searches", () => {
    expect(ORIGINAL_PROMOTION_SERIES.slice(0, 4).map((s) => s.publicationId)).toEqual(TFTT_ORIGINAL_SERIES.map((s) => s.id));
    expect(NEW_ORIGINAL_SERIES.every((s) => s.publicationId === null && s.archiveQuery === null)).toBe(true);
    expect(promotionSeriesById(TFTT_ORIGINAL_SERIES[3].id)?.title).toBe("Parsha Pearls from the Ramban");
    expect(promotionSeriesById(PARSHA_DETECTIVE_PUBLICATION_ID)).toBeUndefined();
    expect(promotionSeriesById(null)).toBeUndefined();
  });
  it("does not advertise an active launch before publication and owner activation", () => {
    expect(canShowOriginalsLaunch([])).toBe(false);
    expect(canShowOriginalsLaunch(TFTT_ORIGINAL_SERIES.map((s) => s.id))).toBe(false);
    expect(originalsPromotionDescription()).toContain("seven");
    expect(originalsPromotionDescription()).not.toContain("Detective");
  });
});

describe("latest published cover selection", () => {
  it("selects the newest matching edition without borrowing another publication", () => {
    const qa = ORIGINAL_PROMOTION_SERIES[0];
    const stories = ORIGINAL_PROMOTION_SERIES[1];
    const group = (label: string, editions: {id: string; seriesId: string; seriesTitle: string; thumbUrl: string | null}[]) => ({ key: label, parshaKey: label, jewishYear: 5787, label, editions });
    const newer = group("Vayishlach", [{ id: "new-story", seriesId: stories.publicationId!, seriesTitle: stories.title, thumbUrl: "/new-story.png" }]);
    const older = group("Vayetzei", [{ id: "older-qa", seriesId: qa.publicationId!, seriesTitle: qa.title, thumbUrl: "/older-qa.png" }]);
    expect(latestPromotionEdition(qa, [newer, older])?.edition.id).toBe("older-qa");
    expect(latestPromotionEdition(stories, [newer, older])?.edition.thumbUrl).toBe("/new-story.png");
    expect(latestPromotionEdition(ORIGINAL_PROMOTION_SERIES[4], [newer, older])).toBeUndefined();
    expect(latestPromotionEdition(qa, [])).toBeUndefined();
    const registered = { ...ORIGINAL_PROMOTION_SERIES[4], publicationId: "test-only-chizkuni" };
    const firstIssue = group("Vayishlach", [{ id: "first-issue", seriesId: registered.publicationId, seriesTitle: registered.title, thumbUrl: "/first-issue.png" }]);
    expect(latestPromotionEdition(registered, [firstIssue])?.edition.id).toBe("first-issue");
  });
});
